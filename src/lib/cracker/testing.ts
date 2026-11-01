// Test helpers (used by scripts/test-cracker.ts and /gpu-bench, not by the app).

import { MASK24, MH, ML_INV } from "./lcg";
import type { CrackPlan } from "./plan";
import { filterStep } from "./strategy";
import { fullCheck } from "./lcg";

/**
 * Seeds on the edge of the reroll zone. When solving, newHi values up to just
 * below the reroll zone come from the solution sequence and the rest are
 * checked one by one. A bug once skipped the last newHi below the zone
 * (floor instead of ceil). This finds blocks of `plan` where that newHi is a
 * real hit for the plan's first observation, so tests can check every engine
 * reports it. Returns up to `count` { block, seed } pairs, sampled at random.
 */
export function rerollEdgeHits(plan: CrackPlan, count: number, maxTries = 1_000_000) {
  const p = plan.prepared[0];
  const out: { block: number; seed: number }[] = [];
  const blocks = plan.totalWork / 2 ** 24;
  const perLow = 2 ** (24 - plan.lowBits);
  for (let t = 0; t < maxTries && out.length < count; t++) {
    const block = Math.floor(Math.random() * blocks);
    const ci = Math.floor(block / perLow);
    const seedLo = (block - ci * perLow) * 2 ** plan.lowBits + plan.lows[ci];
    const f = filterStep(p, seedLo);
    const newHi = Math.floor((f.limit - f.lo7) / 128);
    const u = newHi * 128 + f.lo7;
    if (newHi >= 2 ** 24 || u >= f.limit) continue; // not below the zone
    const r = u % f.n;
    if (r < f.lo || r > f.hi) continue; // not a solution for X
    const hiS = Math.imul((newHi - f.kk) & MASK24, ML_INV) & MASK24;
    const hHi = ((hiS ^ MH) - f.base) & MASK24;
    if (!fullCheck(seedLo, hHi, plan.prepared, plan.maxMisses)) continue;
    out.push({ block, seed: hHi * 2 ** 24 + seedLo });
  }
  return out;
}
