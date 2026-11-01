import { structureChunk } from "./placement";
import { JavaRandom } from "./random";
import { getStructure, type VersionId } from "./structures";

export interface ExampleEntry {
  structureId: string;
  x: number;
  z: number;
}

/** A seed as Minecraft makes one when the seed box is left blank: new Random().nextLong(). */
export function randomSeed(): bigint {
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return new JavaRandom(a[0]).nextLong();
}

/**
 * Build a set of block coordinates for structures in a (synthetic) world.
 * Positions are what the placement grid produces; real worlds can skip some
 * attempts because of biomes, but the ones that do generate are at these spots.
 */
export function makeExample(version: VersionId, seed: bigint): ExampleEntry[] {
  const picks: [string, number, number][] = [
    ["village", 0, 0],
    ["village", -1, 1],
    ["desert_pyramid", 1, -1],
    ["swamp_hut", 0, 1],
    ["shipwreck", 2, 0],
    ["ocean_ruin", -2, -1],
    ["ocean_monument", -1, -1],
  ];
  return picks.map(([id, rx, rz]) => {
    const s = getStructure(version, id)!;
    const c = structureChunk(seed, s, rx, rz);
    // Where a player would stand: a few blocks from the corner for structures
    // centred on it (see StructureConfig.anchor), otherwise inside the chunk.
    const inset = s.anchor === "corner" ? 3 : 6;
    return { structureId: id, x: c.chunkX * 16 + inset, z: c.chunkZ * 16 + inset };
  });
}
