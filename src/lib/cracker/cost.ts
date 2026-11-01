// Relative cost of a search, for time estimates and budgets.

import { type PreparedObs } from "./observations";
import { passChance, solveStep, strategy } from "./strategy";

// Relative cost of one candidate tested every way (reference loop), tested
// with the integer filter, or reached by solving and fully checked. Measured
// in Node: about 30M, 180M and 60M per second per thread.
const COST_REFERENCE = 2;
const COST_SCAN = 1 / 3;
const COST_VISIT = 1;

/** Full checks in close-match mode can't stop at the first miss. */
const VISIT_NEAR_FACTOR = 1.5;

/**
 * Cost of searching `candidates` candidates, in units of one solved-and-checked
 * candidate. Used for time estimates and the close-match budget.
 */
export function searchCost(prepared: PreparedObs[], lowBits: number, maxMisses: number, candidates: number): number {
  const st = strategy(prepared, lowBits, maxMisses);
  const near = maxMisses > 0 ? 1 + VISIT_NEAR_FACTOR * maxMisses : 1;
  if (!st) return candidates * COST_REFERENCE * near;
  const { filter, solvable } = st;
  if (!solvable) return candidates * (COST_SCAN + passChance(filter.obs[0]) * COST_VISIT * near);
  const visits =
    filter.mode === "all"
      ? (filter.obs[0].spanX + 1) / solveStep(filter.obs[0])
      : filter.obs.reduce((a, p) => a + (p.spanX + 1) / solveStep(p), 0);
  return candidates * visits * COST_VISIT * near;
}
