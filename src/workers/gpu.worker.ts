/// <reference lib="webworker" />
// Runs the WebGPU search off the main thread, so long GPU runs never block the
// page. One search at a time; "stop" ends it after the current batches.
import type { PreparedObs } from "@/lib/cracker";
import { GpuSearcher, type GpuInfo } from "@/lib/engines/gpu";

export type GpuWorkerIn =
  | { type: "probe" }
  | { type: "search"; id: number; prepared: PreparedObs[]; lowBits: number; lows: number[]; start: number; end: number; maxMisses: number }
  | { type: "stop"; id: number };

export type GpuWorkerOut =
  | { type: "probe"; info: GpuInfo | null }
  | { type: "progress"; id: number; done: number; hits: number[] }
  | { type: "done"; id: number }
  | { type: "error"; id: number; message: string };

const post = (msg: GpuWorkerOut) => (self as unknown as Worker).postMessage(msg);

let searcher: Promise<GpuSearcher | null> | null = null;
let stopped = new Set<number>();

self.onmessage = async (e: MessageEvent<GpuWorkerIn>) => {
  const msg = e.data;
  if (msg.type === "probe") {
    searcher ??= GpuSearcher.create().catch(() => null);
    const g = await searcher;
    post({ type: "probe", info: g ? g.info : null });
    return;
  }
  if (msg.type === "stop") {
    stopped.add(msg.id);
    return;
  }
  const g = await searcher;
  if (!g || !g.alive) {
    post({ type: "error", id: msg.id, message: "No GPU" });
    return;
  }
  try {
    await g.search(msg.prepared, msg.lowBits, msg.lows, msg.start, msg.end, msg.maxMisses, {
      shouldStop: () => stopped.has(msg.id),
      onProgress: (done, hits) => post({ type: "progress", id: msg.id, done, hits }),
    });
    post({ type: "done", id: msg.id });
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  } finally {
    stopped = new Set([...stopped].filter((id) => id > msg.id));
  }
};
