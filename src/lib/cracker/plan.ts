// Planning searches: exact, close matches (fit all but a few observations), and estimates.

import { searchCost } from "./cost";
import { liftLowBits, planLift } from "./lift";
import { type PreparedObs } from "./observations";
import { strategy } from "./strategy";

// Close matches: seeds that fit every observation except one to three. They
// catch entries in the wrong chunk or with the wrong type. The observations
// that still have to match must carry at least this many bits, which keeps
// chance matches rare (2^(48-50) = 1/4 per way of choosing the misses).
export const NEAR_MIN_REMAINING_BITS = 50;
export const NEAR_MAX_MISSES = 3;

// Skip the close-match search when it would cost more than this (see searchCost):
// about 10 minutes on one thread, a minute or less on most machines.
export const NEAR_MAX_COST = 2 ** 35;

export interface CrackPlan {
  lowBits: number;
  lows: number[];
  totalWork: number;
  infoBits: number;
  expectedMatches: number;
  /** close-match search: how many droppable observations may miss (0 = exact search) */
  maxMisses: number;
  /** see searchCost */
  cost: number;
  /** prepared observations with `droppable` set, for the workers */
  prepared: PreparedObs[];
}

function makePlan(prepared: PreparedObs[], droppable: boolean[], maxMisses: number): CrackPlan {
  let withFlags = prepared.map((p, i) => ({ ...p, droppable: maxMisses > 0 && droppable[i] }));
  const { lowBits } = planLift(withFlags);
  // When the search solves for candidates, they already get the filter
  // observations' X offsets right, so checking those first wastes a nextInt.
  // Move them to the end of the full check (the result doesn't depend on order).
  const st = strategy(withFlags, lowBits, maxMisses);
  if (st?.solvable) {
    const filters = new Set(st.filter.obs);
    withFlags = [...withFlags.filter((p) => !filters.has(p)), ...withFlags.filter((p) => filters.has(p))];
  }
  const lows = liftLowBits(withFlags, lowBits, maxMisses);
  const info = prepared.reduce((a, p) => a + p.bits, 0);
  const totalWork = lows.length * 2 ** (48 - lowBits);
  return {
    lowBits,
    lows,
    totalWork,
    infoBits: info,
    expectedMatches: Math.max(1, 2 ** (48 - info)),
    maxMisses,
    cost: searchCost(withFlags, lowBits, maxMisses, totalWork),
    prepared: withFlags,
  };
}

/** Plan an exact search. */
export function plan(prepared: PreparedObs[]): CrackPlan {
  return makePlan(prepared, [], 0);
}

/**
 * Plan a close-match search, or return null if none fits the budget. The
 * default budget is for the CPU workers; a GPU passes its own `fits`.
 * First tries letting any observation miss. If that is too slow, only lets
 * observations miss that don't take part in lifting (odd or triangular
 * spreads), which costs almost nothing extra.
 */
export function planNear(prepared: PreparedObs[], fits: (p: CrackPlan) => boolean = (p) => p.cost <= NEAR_MAX_COST): CrackPlan | null {
  const total = prepared.reduce((a, p) => a + p.bits, 0);
  const attempt = (candidate: (p: PreparedObs) => boolean) => {
    const flags = prepared.map(candidate);
    // Most misses allowed such that losing the most informative candidates still leaves enough bits.
    const dropBits = prepared.filter((_, i) => flags[i]).map((p) => p.bits).sort((a, b) => b - a);
    let m = 0;
    let lost = 0;
    while (m < NEAR_MAX_MISSES && m < dropBits.length && total - (lost + dropBits[m]) >= NEAR_MIN_REMAINING_BITS) lost += dropBits[m++];
    if (m === 0) return null;
    // Only observations whose own loss still leaves enough bits may miss.
    const allowed = flags.map((f, i) => f && total - prepared[i].bits >= NEAR_MIN_REMAINING_BITS);
    const p = makePlan(prepared, allowed, m);
    return fits(p) ? p : null;
  };
  return attempt(() => true) ?? attempt((p) => p.k === 0);
}

/**
 * Work and cost of an exact search, for live UI hints. Runs the real lifting
 * step (tens of milliseconds) so the number of surviving low-bit patterns is
 * exact, not a guess.
 */
export function estimate(prepared: PreparedObs[]) {
  const { lowBits } = planLift(prepared);
  const totalWork = liftLowBits(prepared, lowBits, 0).length * 2 ** (48 - lowBits);
  return {
    lowBits,
    totalWork,
    /** see searchCost */
    cost: searchCost(prepared, lowBits, 0, totalWork),
    infoBits: prepared.reduce((a, p) => a + p.bits, 0),
  };
}
