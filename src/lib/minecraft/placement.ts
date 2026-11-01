// Where a structure set places its attempt inside a region, from the world seed.

import { JavaRandom } from "./random";
import { bound, type StructureConfig } from "./structures";

export const REGION_X = 341873128712n;
export const REGION_Z = 132897987541n;

export function floorDiv(a: number, b: number) {
  return Math.floor(a / b);
}

export function regionSeed(worldSeed: bigint, s: StructureConfig, rx: number, rz: number): bigint {
  return BigInt(rx) * REGION_X + BigInt(rz) * REGION_Z + worldSeed + BigInt(s.salt);
}

export function offsetsFor(worldSeed: bigint, s: StructureConfig, rx: number, rz: number) {
  const r = new JavaRandom(regionSeed(worldSeed, s, rx, rz));
  const n = bound(s);
  if (s.spread === "linear") {
    const x = r.nextInt(n);
    const z = r.nextInt(n);
    return { x, z };
  }
  const x = Math.floor((r.nextInt(n) + r.nextInt(n)) / 2);
  const z = Math.floor((r.nextInt(n) + r.nextInt(n)) / 2);
  return { x, z };
}

/** Chunk coordinates of the structure attempt in a region. */
export function structureChunk(worldSeed: bigint, s: StructureConfig, rx: number, rz: number) {
  const o = offsetsFor(worldSeed, s, rx, rz);
  return { chunkX: rx * s.spacing + o.x, chunkZ: rz * s.spacing + o.z };
}
