// How a plan maps onto GPU threads, shared by the shader and the host code,
// plus the GPU speed model used for estimates and budgets.

import { type PreparedObs, strategyCode } from "../../cracker";

export const BLOCK = 2 ** 24;

export const WORKGROUP = 256;

export const MAX_SOLVERS = 4;

export const OBS_U32 = 12;

export const SOLVER_U32 = 8;

export const PARAM_U32 = 16;

export const NONE = 0xffffffff;

const TWO31 = 2 ** 31;

function modInverse(a: number, m: number) {
  for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
  return 0;
}

export const limitOf = (p: PreparedObs) => (p.pow2 ? TWO31 : TWO31 - (TWO31 % p.n));

/**
 * How the GPU searches a plan: solve with the same filter observations the CPU
 * search uses (modes 1 and 2 of strategyCode), otherwise scan every candidate.
 * Null if the plan's low bits don't fit in 24 (never happens in practice).
 */
export function gpuLayout(prepared: PreparedObs[], lowBits: number, maxMisses: number) {
  if (lowBits > 24) return null;
  const { mode, filter } = strategyCode(prepared, lowBits, maxMisses);
  const solve = mode === 1 || mode === 2;
  const solverObs = solve ? (mode === 1 ? filter.slice(0, 1) : filter).slice(0, MAX_SOLVERS) : [];
  let offset = 0;
  const solvers = solverObs.map((idx) => {
    const p = prepared[idx];
    const g = Math.min(128, p.n & -p.n);
    const m = p.n / g;
    const perResidue = Math.ceil(BLOCK / m);
    // newHi values from floor((limit - lo7) / 128) up can reroll; at most this many.
    const rerolls = BLOCK - Math.floor((limitOf(p) - 127) / 128) + 1;
    const s = { obs: idx, m, g, inv: modInverse((128 / g) % m, m), residues: p.spanX + 1, perResidue, rerolls, offset };
    offset += s.residues * perResidue + rerolls;
    return s;
  });
  return { solve, solvers, perBlock: solve ? offset : BLOCK };
}

// Rough GPU speed for time estimates and limits, measured on an RTX 4070 in
// Chrome: about 47G simple threads per second once clocked up, ~0.1 s for the
// GPU to wake up. Slower GPUs take longer; estimates only decide what's worth
// trying and what to tell the user.
const GPU_THREADS_PER_SECOND = 4.7e10;

const GPU_STARTUP_SECONDS = 0.1;

/** Estimated GPU time for searching `candidates` candidates, or Infinity if the GPU can't run this plan. */
export function gpuSeconds(prepared: PreparedObs[], lowBits: number, maxMisses: number, candidates: number) {
  const layout = gpuLayout(prepared, lowBits, maxMisses);
  if (!layout) return Infinity;
  // Close-match checks keep going after a miss, so threads run longer.
  return GPU_STARTUP_SECONDS + ((candidates / BLOCK) * layout.perBlock * (1 + 0.5 * maxMisses)) / GPU_THREADS_PER_SECOND;
}
