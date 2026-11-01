/// <reference lib="webworker" />
// Runs the biome engine (cubiomes in WebAssembly) off the main thread.
import { BiomeEngine, biomesWasmUrl, type BiomeCondition, type FindCondition, type NarrowStructure } from "@/lib/engines/biomes";

export type BiomeWorkerIn =
  | { type: "narrow"; id: number; version: number; structureSeed: bigint; structures: NarrowStructure[]; biomes: BiomeCondition[]; from: number; to: number }
  | {
      type: "find";
      id: number;
      version: number;
      conds: FindCondition[];
      natural: boolean;
      tries: number;
      uppers: number;
      rngSeed: bigint;
      maxFound: number;
    };

/** Where a found seed's matching structures are, per condition. */
export interface FoundSeed {
  seed: bigint;
  positions: { x: number; z: number }[][];
}

export type BiomeWorkerOut =
  | { type: "narrowed"; id: number; uppers: number[] }
  | { type: "found"; id: number; seeds: FoundSeed[]; tries: number }
  | { type: "error"; id: number; message: string };

const post = (msg: BiomeWorkerOut) => (self as unknown as Worker).postMessage(msg);

const engine: Promise<BiomeEngine> = fetch(biomesWasmUrl())
  .then((r) => r.arrayBuffer())
  .then((bytes) => BiomeEngine.fromBytes(bytes));

/** Matching structures of one condition in one seed, for showing with the result. */
function positionsFor(e: BiomeEngine, c: FindCondition, seed: bigint) {
  const size = e.regionSize(c.structure) * 16;
  const isChunk = c.kind === "chunk";
  const reach = isChunk ? 0 : c.kind === "near" ? c.radius : c.area;
  const cx = isChunk ? c.x * 16 : c.x;
  const cz = isChunk ? c.z * 16 : c.z;
  const out: { x: number; z: number }[] = [];
  for (let rz = Math.floor((cz - reach) / size); rz <= Math.floor((cz + reach) / size); rz++) {
    for (let rx = Math.floor((cx - reach) / size); rx <= Math.floor((cx + reach) / size); rx++) {
      const p = e.structurePos(c.structure, seed, rx, rz);
      if (!p) continue;
      const inside = isChunk ? p.x >> 4 === c.x && p.z >> 4 === c.z : (p.x - cx) ** 2 + (p.z - cz) ** 2 <= reach * reach;
      if (inside && e.viable(c.structure, seed, p.x, p.z, c.terrain)) out.push(p);
    }
  }
  return out;
}

self.onmessage = async (ev: MessageEvent<BiomeWorkerIn>) => {
  const msg = ev.data;
  try {
    const e = await engine;
    e.setVersion(msg.version);
    if (msg.type === "narrow") {
      post({ type: "narrowed", id: msg.id, uppers: e.narrow(msg.structureSeed, msg.structures, msg.biomes, msg.from, msg.to) });
    } else {
      const seeds = e.find(msg.conds, msg);
      post({ type: "found", id: msg.id, tries: msg.tries, seeds: seeds.map((seed) => ({ seed, positions: msg.conds.map((c) => positionsFor(e, c, seed)) })) });
    }
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
