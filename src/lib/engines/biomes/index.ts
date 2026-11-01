// Biome generation and structure checks (cubiomes compiled to WebAssembly).
export * from "./biomeNames";
export * from "./engine";
export * from "./ids";

/** URL of the compiled module, for fetch() in workers and pages. */
export const biomesWasmUrl = () => new URL("./biomes.wasm", import.meta.url);
