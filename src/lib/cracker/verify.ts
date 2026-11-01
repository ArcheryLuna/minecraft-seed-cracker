// Checking structure seeds against observations with the reference implementation.

import { floorDiv, structureChunk } from "../minecraft/placement";
import { type Observation } from "./observations";

function fits(c: { chunkX: number; chunkZ: number }, o: Observation) {
  return c.chunkX >= o.chunkX && c.chunkX <= o.chunkX + (o.spanX ?? 0) && c.chunkZ >= o.chunkZ && c.chunkZ <= o.chunkZ + (o.spanZ ?? 0);
}

/** Verify a structure seed against observations with the BigInt reference implementation. */
export function verify(structureSeed: bigint, obs: Observation[]): boolean {
  return obs.every((o) => {
    const s = o.structure;
    const rx = floorDiv(o.chunkX, s.spacing);
    const rz = floorDiv(o.chunkZ, s.spacing);
    return fits(structureChunk(structureSeed, s, rx, rz), o);
  });
}

/** Indices of the observations that a structure seed does not reproduce. */
export function misses(structureSeed: bigint, obs: Observation[]): number[] {
  const out: number[] = [];
  obs.forEach((o, i) => {
    const s = o.structure;
    const rx = floorDiv(o.chunkX, s.spacing);
    const rz = floorDiv(o.chunkZ, s.spacing);
    if (!fits(structureChunk(structureSeed, s, rx, rz), o)) out.push(i);
  });
  return out;
}
