// A pool of biome workers (workers/biome.worker.ts). Narrowing splits the
// 65,536 world seeds across workers; finding keeps every worker searching
// until enough seeds are found or the search is stopped.

import type { BiomeCondition, FindCondition, NarrowStructure } from "./biomes";
import { workerCount } from "./cpuPool";
import type { BiomeWorkerIn, BiomeWorkerOut, FoundSeed } from "@/workers/biome.worker";

export type { FoundSeed };

// Omit applied to each member of a union, keeping their own fields.
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

const NARROW_CHUNK = 1024;
const FIND_TRIES = 20_000;

function randomSeed64() {
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

export class BiomePool {
  private workers: Worker[] = [];
  private handlers = new Map<number, (msg: BiomeWorkerOut) => void>();
  private nextId = 0;
  private stopped = false;

  private ensure(n: number) {
    while (this.workers.length < n) {
      const w = new Worker(new URL("../../workers/biome.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<BiomeWorkerOut>) => {
        this.handlers.get(e.data.id)?.(e.data);
        this.handlers.delete(e.data.id);
      };
      this.workers.push(w);
    }
    return this.workers.slice(0, n);
  }

  private call(w: Worker, msg: WithoutId<BiomeWorkerIn>): Promise<BiomeWorkerOut> {
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.handlers.set(id, resolve);
      w.postMessage({ ...msg, id } as BiomeWorkerIn);
    });
  }

  /** Upper 16 bits (0..65535) of world seeds with this structure seed that fit the structures and biomes. */
  async narrow(version: number, structureSeed: bigint, structures: NarrowStructure[], biomes: BiomeCondition[], onProgress?: (done: number) => void) {
    this.stopped = false;
    const pool = this.ensure(Math.min(workerCount(), 65536 / NARROW_CHUNK));
    const uppers: number[] = [];
    let next = 0;
    let done = 0;
    await Promise.all(
      pool.map(async (w) => {
        while (next < 65536 && !this.stopped) {
          const from = next;
          next += NARROW_CHUNK;
          const res = await this.call(w, { type: "narrow", version, structureSeed, structures, biomes, from, to: from + NARROW_CHUNK });
          if (res.type === "error") throw new Error(res.message);
          if (res.type === "narrowed") uppers.push(...res.uppers);
          done += NARROW_CHUNK;
          onProgress?.(done);
        }
      }),
    );
    return uppers.sort((a, b) => a - b);
  }

  /**
   * Search for world seeds meeting every condition. Calls onProgress with the
   * number of seeds tried so far and any new finds. Resolves when maxFound
   * seeds are found or stop() is called.
   */
  async find(
    version: number,
    conds: FindCondition[],
    opts: { natural: boolean; maxFound: number },
    onProgress: (tried: number, found: FoundSeed[]) => void,
  ) {
    this.stopped = false;
    const pool = this.ensure(workerCount());
    let tried = 0;
    let found = 0;
    await Promise.all(
      pool.map(async (w) => {
        while (!this.stopped && found < opts.maxFound) {
          const res = await this.call(w, {
            type: "find",
            version,
            conds,
            natural: opts.natural,
            tries: FIND_TRIES,
            uppers: 64,
            rngSeed: randomSeed64(),
            maxFound: opts.maxFound,
          });
          if (res.type === "error") throw new Error(res.message);
          if (res.type !== "found" || this.stopped) continue;
          tried += res.tries;
          const fresh = res.seeds.slice(0, Math.max(0, opts.maxFound - found));
          found += fresh.length;
          onProgress(tried, fresh);
        }
      }),
    );
  }

  /** Stop after the current batches. */
  stop() {
    this.stopped = true;
  }

  terminate() {
    this.stopped = true;
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.handlers.clear();
  }
}

let shared: BiomePool | null = null;

/** One pool for the whole page, created on first use. */
export function biomePool() {
  shared ??= new BiomePool();
  return shared;
}
