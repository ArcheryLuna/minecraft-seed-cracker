// Tables shared with biomes.c. The order of each list must match the C tables
// (VERSION_IDS and STRUCT_IDS), which map them to cubiomes' enums.

import type { VersionId } from "../../minecraft";

/** Versions with distinct biomes. index = position in this list = C version index. */
export const BIOME_VERSIONS = [
  { label: "1.16", grid: "1.16-1.17" },
  { label: "1.17", grid: "1.16-1.17" },
  { label: "1.18", grid: "1.18+" },
  { label: "1.19", grid: "1.18+" },
  { label: "1.20", grid: "1.18+" },
  { label: "1.21 to 1.21.3", grid: "1.18+" },
  { label: "1.21.4 and later", grid: "1.18+" },
] as const satisfies readonly { label: string; grid: VersionId }[];

export type BiomeVersion = number;

/** Biome versions that share a structure grid, newest first. */
export function biomeVersionsFor(grid: VersionId): BiomeVersion[] {
  return BIOME_VERSIONS.map((v, i) => ({ v, i }))
    .filter(({ v }) => v.grid === grid)
    .map(({ i }) => i)
    .reverse();
}

/**
 * Structures the biome engine knows. index = position in this list = C structure
 * index. `since` is the first biome version (index into BIOME_VERSIONS) with it.
 */
export const BIOME_STRUCTURES = [
  { key: "village", name: "Village" },
  { key: "desert_pyramid", name: "Desert Pyramid" },
  { key: "jungle_temple", name: "Jungle Temple" },
  { key: "swamp_hut", name: "Swamp Hut" },
  { key: "igloo", name: "Igloo" },
  { key: "pillager_outpost", name: "Pillager Outpost" },
  { key: "shipwreck", name: "Shipwreck" },
  { key: "ocean_ruin", name: "Ocean Ruin" },
  { key: "ruined_portal", name: "Ruined Portal (Overworld)" },
  { key: "ocean_monument", name: "Ocean Monument" },
  { key: "woodland_mansion", name: "Woodland Mansion" },
  { key: "ancient_city", name: "Ancient City", since: 3 },
  { key: "trail_ruins", name: "Trail Ruins", since: 4 },
  { key: "trial_chambers", name: "Trial Chambers", since: 5 },
  { key: "fortress", name: "Nether Fortress" },
  { key: "bastion", name: "Bastion Remnant" },
  { key: "end_city", name: "End City" },
  { key: "ruined_portal_nether", name: "Ruined Portal (Nether)" },
] as const;

export type BiomeStructureKey = (typeof BIOME_STRUCTURES)[number]["key"];

/** Structures that generate in a biome version, as [index, structure] pairs. */
export function biomeStructuresIn(version: BiomeVersion) {
  return BIOME_STRUCTURES.map((s, i) => [i, s] as const).filter(([, s]) => !("since" in s) || version >= s.since);
}

export function structureIndex(key: string): number {
  return BIOME_STRUCTURES.findIndex((s) => s.key === key);
}

/**
 * The cracker's structure ids map to these, except "nether_complex" (fortresses
 * and bastions share one grid), which the engine checks as "fortress or bastion".
 */
export function crackerStructure(id: string): { index: number; either: boolean } | null {
  if (id === "nether_complex") return { index: structureIndex("fortress"), either: true };
  const index = structureIndex(id);
  return index < 0 ? null : { index, either: false };
}
