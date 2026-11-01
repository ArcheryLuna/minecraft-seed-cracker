/// <reference lib="webworker" />
import { searchRange, type PreparedObs } from "@/lib/cracker";
import { WasmSearcher, wasmUrl } from "@/lib/engines/wasm";

export type WorkerIn =
  | { type: "init"; prepared: PreparedObs[]; lowBits: number; lows: number[]; maxMisses: number }
  | { type: "chunk"; id: number; start: number; end: number };

export type WorkerOut = { type: "done"; id: number; found: number[] };

let prepared: PreparedObs[] = [];
let lowBits = 0;
let lows: number[] = [];
let maxMisses = 0;

// The WebAssembly search is 2-6x faster; the JS search is the fallback if it
// can't load or the plan doesn't fit. Messages wait until loading settles.
let wasm: WasmSearcher | null = null;
let wasmReady = false;
const ready = fetch(wasmUrl())
  .then((r) => r.arrayBuffer())
  .then((bytes) => WasmSearcher.fromBytes(bytes))
  .then((w) => {
    wasm = w;
  })
  .catch((err) => console.warn("WebAssembly search unavailable, using JS", err));

const queue: WorkerIn[] = [];
let busy = false;

function handle(msg: WorkerIn) {
  if (msg.type === "init") {
    ({ prepared, lowBits, lows, maxMisses } = msg);
    wasmReady = !!wasm && wasm.configure(prepared, lowBits, lows, maxMisses);
    return;
  }
  const found = (wasmReady && wasm!.search(msg.start, msg.end)) || searchRange(prepared, lowBits, lows, msg.start, msg.end, maxMisses);
  (self as unknown as Worker).postMessage({ type: "done", id: msg.id, found } satisfies WorkerOut);
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  queue.push(e.data);
  if (busy) return;
  busy = true;
  await ready;
  while (queue.length) handle(queue.shift()!);
  busy = false;
};
