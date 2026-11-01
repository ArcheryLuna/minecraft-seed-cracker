// Loads biomes.wasm (cubiomes + biomes.c) and wraps its exports.

import type { BiomeVersion } from "./ids";

interface Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  bm_version_count(): number;
  bm_struct_count(): number;
  bm_setup(version: number): number;
  bm_biome_at(seed: bigint, dim: number, x: number, y: number, z: number): number;
  bm_structure_pos(s: number, seed: bigint, regionX: number, regionZ: number, out: number): number;
  bm_region_size(s: number): number;
  bm_viable(s: number, seed: bigint, x: number, z: number, terrain: number): number;
  bm_narrow(structureSeed: bigint, nObs: number, obs: number, nBiomes: number, biomes: number, from: number, to: number, out: number): number;
  bm_find(nConds: number, conds: number, natural: number, tries: number, uppers: number, rngSeed: bigint, found: number, maxFound: number): number;
  bm_scratch(): number;
  bm_scratch_size(): number;
}

// cubiomes only calls the C library's I/O for error messages and exit().
// These stand-ins drop output and turn exit() into an exception.
const wasi = new Proxy(
  {},
  {
    get: (_, name) =>
      name === "proc_exit"
        ? (code: number) => {
            throw new Error(`biome engine exited (${code})`);
          }
        : () => 0,
  },
);

/** One structure the cracker found: its type and region (see ids.ts crackerStructure). */
export interface NarrowStructure {
  index: number;
  either: boolean;
  regionX: number;
  regionZ: number;
}

/** "The biome at this position is ..." */
export interface BiomeCondition {
  dim: 0 | -1 | 1;
  x: number;
  y: number;
  z: number;
  biome: number;
}

/** A finder condition (see bm_find in biomes.c). */
export interface FindCondition {
  kind: "near" | "group" | "chunk";
  structure: number;
  x: number;
  z: number;
  radius: number;
  count: number;
  area: number;
  /** also apply cubiomes' terrain heuristic (fewer false finds, may skip real ones) */
  terrain: boolean;
}

const KINDS = { near: 0, group: 1, chunk: 2 } as const;

export class BiomeEngine {
  private version = -1;

  private constructor(private x: Exports) {}

  static async fromBytes(bytes: BufferSource): Promise<BiomeEngine> {
    const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi });
    const x = instance.exports as unknown as Exports;
    x._initialize();
    return new BiomeEngine(x);
  }

  /** Choose the game version (biome versions in ids.ts). */
  setVersion(v: BiomeVersion) {
    if (v === this.version) return;
    if (!this.x.bm_setup(v)) throw new Error(`unknown biome version ${v}`);
    this.version = v;
  }

  biomeAt(seed: bigint, dim: number, x: number, y: number, z: number) {
    return this.x.bm_biome_at(BigInt.asUintN(64, seed), dim, x, y, z);
  }

  /** Block position of a structure's attempt in a region, or null if the region has none. */
  structurePos(structure: number, seed: bigint, regionX: number, regionZ: number): { x: number; z: number } | null {
    const ptr = this.x.bm_scratch();
    if (!this.x.bm_structure_pos(structure, BigInt.asUintN(64, seed), regionX, regionZ, ptr)) return null;
    const out = new Int32Array(this.x.memory.buffer, ptr, 2);
    return { x: out[0], z: out[1] };
  }

  regionSize(structure: number) {
    return this.x.bm_region_size(structure);
  }

  /** Does the structure generate at this attempt position (exact biome check, optional terrain heuristic)? */
  viable(structure: number, seed: bigint, x: number, z: number, terrain = false) {
    return !!this.x.bm_viable(structure, BigInt.asUintN(64, seed), x, z, terrain ? 1 : 0);
  }

  /**
   * Which upper 16 bits in [from, to) give a world seed (with this structure
   * seed) where every structure generates and every biome condition holds.
   */
  narrow(structureSeed: bigint, structures: NarrowStructure[], biomes: BiomeCondition[], from = 0, to = 65536): number[] {
    const x = this.x;
    const ints = 4 * structures.length + 5 * biomes.length;
    const base = x.bm_scratch();
    if (ints * 4 + (to - from) > x.bm_scratch_size()) throw new Error("too many conditions");
    const args = new Int32Array(x.memory.buffer, base, ints);
    structures.forEach((s, i) => args.set([s.index, s.regionX, s.regionZ, s.either ? 1 : 0], 4 * i));
    biomes.forEach((b, i) => args.set([b.dim, b.x, b.y, b.z, b.biome], 4 * structures.length + 5 * i));
    const outPtr = base + ints * 4;
    x.bm_narrow(BigInt.asUintN(48, structureSeed), structures.length, base, biomes.length, base + 16 * structures.length, from, to, outPtr);
    const out = new Uint8Array(x.memory.buffer, outPtr, to - from);
    const uppers: number[] = [];
    out.forEach((ok, i) => ok && uppers.push(from + i));
    return uppers;
  }

  /** Try `tries` random seeds; returns the world seeds that meet every condition. */
  find(conds: FindCondition[], opts: { natural: boolean; tries: number; uppers: number; rngSeed: bigint; maxFound: number }): bigint[] {
    const x = this.x;
    const base = x.bm_scratch();
    const args = new Int32Array(x.memory.buffer, base, 8 * conds.length);
    conds.forEach((c, i) => args.set([KINDS[c.kind], c.structure, c.x, c.z, c.radius, c.count, c.area, c.terrain ? 1 : 0], 8 * i));
    const foundPtr = base + 8 * 4 * 8; // after up to 8 conditions
    const n = x.bm_find(conds.length, base, opts.natural ? 1 : 0, opts.tries, opts.uppers, BigInt.asUintN(64, opts.rngSeed), foundPtr, opts.maxFound);
    return Array.from(new BigInt64Array(x.memory.buffer, foundPtr, n));
  }
}
