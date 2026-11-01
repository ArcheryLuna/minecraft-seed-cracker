// The structure list the user edits, and the paste-list parser.

import type { ExampleEntry, StructureConfig } from "../minecraft";

/** How the user's coordinates are given. */
export type CoordMode = "block" | "chunk";

/** One row of the form: values are kept as typed. */
export interface Entry {
  key: string;
  structureId: string;
  x: string;
  z: string;
}

let keyCounter = 0;
export const newKey = () => `e${(keyCounter++).toString(36)}`;
export const blankEntry = (structureId = "village"): Entry => ({ key: newKey(), structureId, x: "", z: "" });
export const entryFrom = (e: ExampleEntry): Entry => ({ key: newKey(), structureId: e.structureId, x: String(e.x), z: String(e.z) });

/** A whole-number coordinate inside the world border, or null. */
export function parseIntStrict(v: string): number | null {
  if (!/^\s*-?\d+\s*$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && Math.abs(n) <= 30_000_000 ? n : null;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parse a pasted list, one structure per line: "name x z" or "name x y z".
 * Names match ids or display names, also by prefix ("desert" finds the pyramid).
 */
export function parseBulk(text: string, structures: StructureConfig[]) {
  const entries: Entry[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^(.*?)[\s,;:]+(-?\d+)[\s,;]+(?:-?\d+[\s,;]+)?(-?\d+)\s*$/);
    if (!m) {
      errors.push(`Line ${i + 1}: write it like "village 312 -1048".`);
      return;
    }
    const name = normalize(m[1]);
    const s =
      structures.find((st) => normalize(st.id) === name || normalize(st.name) === name) ??
      structures.find((st) => normalize(st.name).startsWith(name) || normalize(st.id).startsWith(name)) ??
      structures.find((st) => name.length >= 4 && normalize(st.name).includes(name));
    if (!s) {
      errors.push(`Line ${i + 1}: "${m[1]}" isn't a structure we know.`);
      return;
    }
    entries.push({ key: newKey(), structureId: s.id, x: m[2], z: m[3] });
  });
  return { entries, errors };
}
