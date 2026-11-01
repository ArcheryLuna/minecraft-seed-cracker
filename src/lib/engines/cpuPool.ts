// Runs a search plan on a pool of CPU workers (workers/crack.worker.ts), one
// 2^24-candidate block at a time. Workers are reused between runs, so the
// close-match stage starts without loading new ones.

import type { CrackPlan } from "../cracker";
import type { WorkerIn, WorkerOut } from "@/workers/crack.worker";

// One block of 2^24 candidates: searchRange solves a whole block at a time, and
// plans always cover whole blocks.
const CHUNK = 2 ** 24;

/** Workers to use: one per core, leaving one for the page. */
export function workerCount() {
  if (typeof navigator === "undefined") return 4;
  return Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
}

export interface RunHandlers {
  /** candidates searched so far, and the hits from the latest block */
  onProgress: (done: number, hits: number[]) => void;
  onDone: () => void;
}

export class CpuPool {
  private workers: Worker[] = [];
  // Bumped by stop() and each run(); messages for older runs are ignored.
  private token = 0;

  /** Search all of `p`. Starts after any previous run is stopped. */
  run(p: CrackPlan, { onProgress, onDone }: RunHandlers) {
    const token = ++this.token;
    const live = () => token === this.token;
    const total = p.totalWork;
    let next = 0;
    let done = 0;
    let active = 0;
    let finished = false;

    const dispatch = (w: Worker) => {
      if (!live()) return;
      if (next >= total) {
        if (active === 0 && !finished) {
          finished = true;
          onDone();
        }
        return;
      }
      const id = next;
      const end = Math.min(total, next + CHUNK);
      next = end;
      active++;
      w.postMessage({ type: "chunk", id, start: id, end } satisfies WorkerIn);
    };

    const n = Math.min(workerCount(), Math.max(1, Math.ceil(total / CHUNK)));
    while (this.workers.length < n) {
      this.workers.push(new Worker(new URL("../../workers/crack.worker.ts", import.meta.url), { type: "module" }));
    }
    const pool = this.workers.slice(0, n);
    for (const w of pool) {
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        if (!live()) return;
        const { id, found } = e.data;
        active--;
        done += Math.min(total, id + CHUNK) - id;
        onProgress(done, found);
        dispatch(w);
      };
      // Workers stopped on purpose (Stop, or a new crack) can error while loading; ignore those.
      w.onerror = (err) => {
        if (live()) console.error(err);
      };
      // Workers handle messages in order, so a reused worker gets the new plan before its first chunk.
      w.postMessage({ type: "init", prepared: p.prepared, lowBits: p.lowBits, lows: p.lows, maxMisses: p.maxMisses } satisfies WorkerIn);
    }
    pool.forEach(dispatch);
  }

  /** Stop the current run and shut the workers down. */
  stop() {
    this.token++;
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
  }
}
