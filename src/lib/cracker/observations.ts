// Observations (structures the player found) and their prepared form for the search.

import { floorDiv, REGION_X, REGION_Z } from "../minecraft/placement";
import { axisDistribution, bound, infoBits, type StructureConfig } from "../minecraft/structures";

export interface Observation {
  structure: StructureConfig;
  chunkX: number;
  chunkZ: number;
  /** The start chunk may also be up to this many chunks further east / south (0 or 1). */
  spanX?: number;
  spanZ?: number;
  /** position in the user's list, for messages */
  row?: number;
}

export interface PreparedObs {
  /** index of the observation passed to prepare() */
  index: number;
  n: number;
  pow2: boolean;
  triangular: boolean;
  offX: number;
  offZ: number;
  /** accept offsets offX..offX+spanX and offZ..offZ+spanZ */
  spanX: number;
  spanZ: number;
  /** (regionX * A + regionZ * B + salt) mod 2^48, split in 24-bit halves */
  cLo: number;
  cHi: number;
  /** same constant as BigInt, for the lifting phase */
  c: bigint;
  /** number of low bits of nextInt(n) that depend only on low seed bits */
  k: number;
  bits: number;
  /** Close-match search: this observation is allowed to be the one that doesn't fit. */
  droppable?: boolean;
}

export interface ObsIssue {
  index: number;
  message: string;
}

export function prepare(obs: Observation[]): { prepared: PreparedObs[]; issues: ObsIssue[] } {
  const issues: ObsIssue[] = [];
  const prepared: PreparedObs[] = [];
  const seenRegions = new Map<string, number>();
  obs.forEach((o, index) => {
    const s = o.structure;
    const n = bound(s);
    const rx = floorDiv(o.chunkX, s.spacing);
    const rz = floorDiv(o.chunkZ, s.spacing);
    const offX = o.chunkX - rx * s.spacing;
    const offZ = o.chunkZ - rz * s.spacing;
    // A span never crosses into the next region; clip it to valid offsets.
    const spanX = Math.max(0, Math.min(o.spanX ?? 0, n - 1 - offX));
    const spanZ = Math.max(0, Math.min(o.spanZ ?? 0, n - 1 - offZ));
    if (offX >= n || offZ >= n) {
      issues.push({
        index,
        message: `A ${s.name} can't be here. Check the coordinates.`,
      });
      return;
    }
    const key = `${s.salt}:${s.spacing}:${rx}:${rz}`;
    if (seenRegions.has(key)) {
      issues.push({
        index,
        message: `Too close to entry ${seenRegions.get(key)! + 1}. Only one ${s.name} fits here.`,
      });
      return;
    }
    seenRegions.set(key, index);
    const c = BigInt.asUintN(48, BigInt(rx) * REGION_X + BigInt(rz) * REGION_Z + BigInt(s.salt));
    const pow2 = (n & -n) === n;
    let k = 0;
    if (!pow2 && s.spread === "linear") while (((n >> k) & 1) === 0) k++;
    prepared.push({
      index,
      n,
      pow2,
      triangular: s.spread === "triangular",
      offX,
      offZ,
      spanX,
      spanZ,
      c,
      cLo: Number(c & 0xffffffn),
      cHi: Number(c >> 24n),
      k,
      bits: infoBits(s, offX, offZ, spanX, spanZ),
    });
  });
  // Order for the full check: a wrong candidate is rejected sooner when the
  // observations most likely to rule it out per unit of work come first. The
  // X offset is checked first (one nextInt, two for triangular spreads); a
  // candidate that passed lifting already has its low k bits right.
  const xChance = (p: PreparedObs, s: StructureConfig) => {
    const dist = axisDistribution(s);
    let px = 0;
    for (let o = p.offX; o <= p.offX + p.spanX; o++) px += dist[o] ?? 0;
    return Math.min(1, px * 2 ** p.k);
  };
  const score = new Map(prepared.map((p) => [p, (1 - xChance(p, obs[p.index].structure)) / (p.triangular ? 2 : 1)]));
  prepared.sort((a, b) => score.get(b)! - score.get(a)!);
  return { prepared, issues };
}
