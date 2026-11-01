// Loads search.wasm (built from search.c): the same search as searchRange with
// native 64-bit integers, for the CPU workers. Callers fall back to the JS
// search when configure() or search() return false / null.

import { strategyCode, type PreparedObs } from "../../cracker";

const OBS_U32 = 12;
const NONE = 0xffffffff;

interface Exports {
  memory: WebAssembly.Memory;
  obs_buffer(): number;
  lows_buffer(): number;
  hits_buffer(): number;
  max_lows(): number;
  max_hits(): number;
  configure(count: number, lowBits: number, maxMisses: number, mode: number, nFilter: number, f0: number, f1: number, f2: number, f3: number): void;
  search(start: number, end: number): number;
}

export class WasmSearcher {
  private constructor(private x: Exports) {}

  static async fromBytes(bytes: BufferSource): Promise<WasmSearcher> {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new WasmSearcher(instance.exports as unknown as Exports);
  }

  /** Load the plan into WebAssembly memory. False if it doesn't fit (use the JS search). */
  configure(prepared: PreparedObs[], lowBits: number, lows: number[], maxMisses: number): boolean {
    const x = this.x;
    if (prepared.length > 64 || lows.length > x.max_lows()) return false;
    const { mode, filter } = strategyCode(prepared, lowBits, maxMisses);
    if (filter.length > 4) return false;
    const obs = new Uint32Array(x.memory.buffer, x.obs_buffer(), prepared.length * OBS_U32);
    prepared.forEach((p, i) =>
      obs.set(
        [p.n, p.pow2 ? 31 - Math.log2(p.n) : NONE, p.triangular ? 1 : 0, p.offX, p.offZ, p.spanX, p.spanZ, p.droppable ? 1 : 0, p.cLo, p.cHi, 0, 0],
        i * OBS_U32,
      ),
    );
    new Uint32Array(x.memory.buffer, x.lows_buffer(), lows.length).set(lows);
    const f = [...filter, 0, 0, 0, 0];
    x.configure(prepared.length, lowBits, maxMisses, mode, filter.length, f[0], f[1], f[2], f[3]);
    return true;
  }

  /** Seeds in [start, end), like searchRange; null if there were too many hits to hold. */
  search(start: number, end: number): number[] | null {
    const x = this.x;
    const count = x.search(start, end);
    if (count > x.max_hits()) return null;
    return Array.from(new BigUint64Array(x.memory.buffer, x.hits_buffer(), count), Number);
  }
}
