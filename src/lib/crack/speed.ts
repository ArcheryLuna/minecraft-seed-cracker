// Speed models: how long a search should take on the CPU workers or the GPU,
// and the time budget for the close-match search.

import { type CrackPlan, estimate, type PreparedObs } from "../cracker";
import { workerCount } from "../engines/cpuPool";
import { gpuSeconds } from "../engines/gpu";

// searchCost units per second per CPU worker with the WebAssembly search
// (measured ~3e8 for exact searches, ~1.6e8 for close matches in Chrome; the JS
// fallback is about 3.5x slower).
const CPU_COST_PER_WORKER = 2.5e8;
// Run the close-match search if it should take at most this long.
const NEAR_GPU_MAX_SECONDS = 90;
const NEAR_CPU_MAX_SECONDS = 45;

/** Estimated CPU seconds for a search of the given cost (see searchCost). */
export function cpuSeconds(cost: number) {
  return cost / (CPU_COST_PER_WORKER * workerCount());
}

/** Estimated seconds for the exact search of `prepared`, on the GPU if one will be used. */
export function exactSeconds(prepared: PreparedObs[], onGpu: boolean) {
  const est = estimate(prepared);
  const gpu = onGpu ? gpuSeconds(prepared, est.lowBits, 0, est.totalWork) : Infinity;
  return Math.min(gpu, cpuSeconds(est.cost));
}

/** Whether a close-match plan fits the time budget of the device that will run it. */
export function nearFits(onGpu: boolean) {
  return onGpu
    ? (q: CrackPlan) => gpuSeconds(q.prepared, q.lowBits, q.maxMisses, q.totalWork) <= NEAR_GPU_MAX_SECONDS
    : (q: CrackPlan) => cpuSeconds(q.cost) <= NEAR_CPU_MAX_SECONDS;
}
