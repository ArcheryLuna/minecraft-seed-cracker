// Finder conditions as the form holds them (text fields), and their conversion
// to the biome engine's FindCondition.

import { BIOME_STRUCTURES, BIOME_VERSIONS, type FindCondition } from "@/lib/engines/biomes";
import { getStructure } from "@/lib/minecraft";

export type Kind = FindCondition["kind"];

export interface CondRow {
  key: number;
  kind: Kind;
  structure: number;
  x: string;
  z: string;
  /** near: blocks from the point. group: blocks between the structures. */
  radius: string;
  count: string;
  /** group: blocks from the point the group can be in */
  area: string;
}

/** Bigger areas check more structures per seed and slow the search down. */
export const MAX_REACH = 4000;

export const KIND_LABELS: Record<Kind, string> = {
  near: "Near a point",
  group: "Close together",
  chunk: "In an exact chunk",
};

let nextKey = 0;

export function newRow(structure = 0): CondRow {
  return { key: ++nextKey, kind: "near", structure, x: "0", z: "0", radius: "500", count: "1", area: "1000" };
}

const int = (s: string) => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

/** Whether a structure can start in this chunk at all (grid gaps can't). */
function chunkPossible(version: number, structure: number, cx: number, cz: number) {
  const key = BIOME_STRUCTURES[structure].key;
  const s = getStructure(BIOME_VERSIONS[version].grid, key === "fortress" || key === "bastion" ? "nether_complex" : key);
  if (!s) return true;
  const fits = (c: number) => ((c % s.spacing) + s.spacing) % s.spacing < s.spacing - s.separation;
  return fits(cx) && fits(cz);
}

/** The engine condition, or a short reason the row can't be used. */
export function toCondition(r: CondRow, terrain: boolean, version: number): FindCondition | string {
  const x = int(r.x);
  const z = int(r.z);
  if (x === null || z === null) return "Enter whole numbers for X and Z.";
  if (Math.abs(x) > 30_000_000 || Math.abs(z) > 30_000_000) return "X and Z must be inside the world border.";
  const base = { structure: r.structure, x, z, terrain, radius: 0, count: 1, area: 0 };
  if (r.kind === "chunk") return chunkPossible(version, r.structure, x, z) ? { ...base, kind: "chunk" } : "This structure can never start in that chunk. Try a nearby one.";
  const radius = int(r.radius);
  const count = int(r.count) ?? 1;
  if (radius === null || radius < 16 || radius > MAX_REACH) return `Distance must be between 16 and ${MAX_REACH} blocks.`;
  if (count < 1 || count > 8) return "Count must be between 1 and 8.";
  if (r.kind === "near") return { ...base, kind: "near", radius, count };
  const area = int(r.area);
  if (area === null || area < 0 || area > MAX_REACH) return `Search area must be between 0 and ${MAX_REACH} blocks.`;
  if (count < 2) return "A group needs at least 2 structures.";
  return { ...base, kind: "group", radius, count, area };
}
