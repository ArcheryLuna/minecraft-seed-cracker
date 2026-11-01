// Talks to the GPU worker (workers/gpu.worker.ts), which owns the WebGPU device,
// so long GPU runs never block the page.

import type { CrackPlan } from "../cracker";
import type { GpuInfo } from "./gpu";
import type { GpuWorkerIn, GpuWorkerOut } from "@/workers/gpu.worker";

export interface GpuRunHandlers {
  /** candidates searched so far, and the hits from the latest batch */
  onProgress: (done: number, hits: number[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export class GpuClient {
  private worker: Worker | null = null;
  private handlers = new Map<number, (msg: GpuWorkerOut) => void>();
  private nextId = 0;
  private active: number | null = null;
  private ok = false;

  /** Starts the worker and asks it for a GPU; onInfo gets the result (null = no GPU). */
  constructor(onInfo: (info: GpuInfo | null) => void) {
    if (typeof Worker === "undefined") return;
    const w = new Worker(new URL("../../workers/gpu.worker.ts", import.meta.url), { type: "module" });
    this.worker = w;
    w.onmessage = (e: MessageEvent<GpuWorkerOut>) => {
      const msg = e.data;
      if (msg.type === "probe") {
        this.ok = !!msg.info;
        onInfo(msg.info);
      } else this.handlers.get(msg.id)?.(msg);
    };
    w.onerror = () => {
      this.ok = false;
      onInfo(null);
    };
    w.postMessage({ type: "probe" } satisfies GpuWorkerIn);
  }

  /** A working GPU was found and hasn't failed since. */
  get available() {
    return this.ok && !!this.worker;
  }

  /** Stop using the GPU for this session (after it failed). */
  disable() {
    this.ok = false;
  }

  /** Search all of `p` on the GPU. Stop any previous run first. */
  run(p: CrackPlan, { onProgress, onDone, onError }: GpuRunHandlers) {
    const id = ++this.nextId;
    this.active = id;
    this.handlers.set(id, (msg) => {
      if (msg.type === "progress") return onProgress(msg.done, msg.hits);
      this.handlers.delete(id);
      if (this.active === id) this.active = null;
      if (msg.type === "done") onDone();
      else if (msg.type === "error") onError(msg.message);
    });
    this.worker!.postMessage({
      type: "search",
      id,
      prepared: p.prepared,
      lowBits: p.lowBits,
      lows: p.lows,
      start: 0,
      end: p.totalWork,
      maxMisses: p.maxMisses,
    } satisfies GpuWorkerIn);
  }

  /** Stop the current run, if any. Its remaining messages are ignored. */
  stop() {
    const id = this.active;
    if (id === null) return;
    this.worker?.postMessage({ type: "stop", id } satisfies GpuWorkerIn);
    this.handlers.delete(id);
    this.active = null;
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ok = false;
  }
}
