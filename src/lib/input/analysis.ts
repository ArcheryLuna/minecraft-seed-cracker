// Turns the form into observations for the cracker, with per-row feedback, and
// decides what to tell the user before they crack.

import { estimate, type Observation, prepare } from "../cracker";
import { blockToStart, type StructureConfig } from "../minecraft";
import { type CoordMode, type Entry, parseIntStrict } from "./entries";
import { formatCount } from "./format";

/** Don't start if more seeds than this would still fit. */
const MAX_EXPECTED_MATCHES = 4096;
/** Don't start if the search should take longer than this. */
const MAX_SECONDS = 6 * 3600;

export interface RowInfo {
  chunk?: [number, number];
  /** 1 on an axis where the start chunk may also be the next one over */
  span?: [number, number];
  region?: [number, number];
  error?: string;
}

export function analyze(entries: Entry[], byId: Map<string, StructureConfig>, mode: CoordMode) {
  const obs: Observation[] = [];
  const obsEntry: number[] = [];
  const rowInfo: RowInfo[] = entries.map(() => ({}));
  entries.forEach((e, i) => {
    const s = byId.get(e.structureId);
    if (!s) {
      rowInfo[i].error = "Not in this version.";
      return;
    }
    const x = parseIntStrict(e.x);
    const z = parseIntStrict(e.z);
    if (e.x.trim() === "" && e.z.trim() === "") return;
    if (x === null || z === null) {
      rowInfo[i].error = "Enter whole numbers for X and Z.";
      return;
    }
    // Block coordinates go through the structure's anchor rule (see blockToStart);
    // chunk coordinates are taken as the start chunk.
    const start = mode === "block" ? blockToStart(s, x, z) : { chunkX: x, chunkZ: z, spanX: 0, spanZ: 0 };
    const { chunkX, chunkZ, spanX, spanZ } = start;
    rowInfo[i].chunk = [chunkX, chunkZ];
    rowInfo[i].span = [spanX, spanZ];
    rowInfo[i].region = [Math.floor(chunkX / s.spacing), Math.floor(chunkZ / s.spacing)];
    obs.push({ structure: s, chunkX, chunkZ, spanX, spanZ, row: i });
    obsEntry.push(i);
  });
  const { prepared, issues } = prepare(obs);
  const bad = new Set<number>();
  for (const iss of issues) {
    rowInfo[obsEntry[iss.index]].error = iss.message;
    bad.add(iss.index);
  }
  const goodObs = obs.filter((_, i) => !bad.has(i));
  const bitsByEntry = new Map<number, number>();
  goodObs.forEach((o) => {
    const idx = obsEntry[obs.indexOf(o)];
    const single = prepare([o]).prepared[0];
    if (single) bitsByEntry.set(idx, single.bits);
  });
  const est = estimate(prepared);
  return { obs: goodObs, prepared, rowInfo, bitsByEntry, est, hasErrors: issues.length > 0 || rowInfo.some((r) => r.error) };
}

export type Analysis = ReturnType<typeof analyze>;

export interface Verdict {
  tone: "ok" | "warn" | "bad";
  /** short line for simple mode */
  simple: string;
  /** line for advanced mode */
  detail: string;
}

/** Whether the list is ready to crack, and what to say about it. */
export function verdictFor(analysis: Analysis, etaSeconds: number): Verdict {
  const expectedMatches = 2 ** Math.max(0, 48 - analysis.est.infoBits);
  if (analysis.prepared.length === 0) return { tone: "bad", simple: "Add a few structures to start.", detail: "Add a few structures to start." };
  if (analysis.hasErrors) return { tone: "bad", simple: "Fix the entries marked in red.", detail: "Fix the entries marked in red." };
  if (expectedMatches > MAX_EXPECTED_MATCHES)
    return { tone: "bad", simple: "Not enough yet. Add more structures.", detail: `About ${formatCount(expectedMatches)} seeds still fit. Add more structures.` };
  if (etaSeconds > MAX_SECONDS) {
    const text = "Too slow. Add temples, huts, igloos, shipwrecks, ocean ruins or villages.";
    return { tone: "bad", simple: text, detail: text };
  }
  if (expectedMatches > 1.5)
    return {
      tone: "warn",
      simple: "Ready. One more structure would give a single answer.",
      detail: `Ready, but about ${Math.round(expectedMatches)} seeds may fit. Add one or two structures.`,
    };
  return { tone: "ok", simple: "Ready.", detail: "Ready. This is enough to find one seed." };
}
