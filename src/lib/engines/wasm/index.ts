// The WebAssembly search engine for the CPU workers (workers/crack.worker.ts).
export { WasmSearcher } from "./searcher";

/** URL of the compiled module, for fetch() in workers and pages. */
export const wasmUrl = () => new URL("./search.wasm", import.meta.url);
