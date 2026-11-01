// Phase 2: search the high bits for every lifted low-bit pattern.

import * as lcg from "./lcg";
import { type PreparedObs } from "./observations";
import * as strategies from "./strategy";

// Hot loops below: take local copies of imported bindings once. Bundlers can
// compile imports to getter calls, which made this search about 10x slower.
const { fullCheck, TWO24 } = lcg;
const { filterPass, filterStep, forEachSolution, strategy } = strategies;

/**
 * Reference search: simulates every observation for every candidate.
 * Index = candidateIndex * 2^(48-lowBits) + h, seed = h * 2^lowBits + low.
 * Kept for tests and as a fallback; searchRange is the fast path.
 */
export function searchRangeReference(prepared: PreparedObs[], lowBits: number, lows: number[], start: number, end: number, maxMisses = 1): number[] {
  const highCount = 2 ** (48 - lowBits);
  const lowMod = 2 ** lowBits;
  const found: number[] = [];
  let i = start;
  while (i < end) {
    const ci = Math.floor(i / highCount);
    const L = lows[ci];
    const hEnd = Math.min(end - ci * highCount, highCount);
    for (let h = i - ci * highCount; h < hEnd; h++) {
      const seed = h * lowMod + L;
      const seedHi = Math.floor(seed / TWO24);
      const seedLo = seed - seedHi * TWO24;
      if (fullCheck(seedLo, seedHi, prepared, maxMisses)) found.push(seed);
    }
    i = ci * highCount + hEnd;
  }
  return found;
}

export function searchRange(prepared: PreparedObs[], lowBits: number, lows: number[], start: number, end: number, maxMisses = 1): number[] {
  const st = strategy(prepared, lowBits, maxMisses);
  if (!st) return searchRangeReference(prepared, lowBits, lows, start, end, maxMisses);
  const { filter, solvable } = st;

  const highCount = 2 ** (48 - lowBits);
  const found: number[] = [];
  let i = start;
  while (i < end) {
    const ci = Math.floor(i / highCount);
    const L = lows[ci];
    const local = i - ci * highCount;
    const hLo = Math.floor(local / TWO24);
    const hHiStart = local - hLo * TWO24;
    const hHiEnd = Math.min(TWO24, end - ci * highCount - hLo * TWO24);
    const seedLo = hLo * 2 ** lowBits + L;
    const steps = filter.obs.map((p) => filterStep(p, seedLo));
    const check = (hHi: number) => {
      if (hHi >= hHiStart && hHi < hHiEnd && fullCheck(seedLo, hHi, prepared, maxMisses)) found.push(hHi * TWO24 + seedLo);
    };

    if (solvable && filter.mode === "all") {
      const [a, b] = steps;
      forEachSolution(a, (hHi) => {
        if (!b || filterPass(b, hHi)) check(hHi);
      });
    } else if (solvable) {
      // "any": each candidate is visited once, by the first filter observation it passes.
      steps.forEach((f, idx) =>
        forEachSolution(f, (hHi) => {
          for (let e = 0; e < idx; e++) if (filterPass(steps[e], hHi)) return;
          check(hHi);
        }),
      );
    } else if (filter.mode === "all") {
      const [a, b] = steps;
      for (let hHi = hHiStart; hHi < hHiEnd; hHi++) {
        if (!filterPass(a, hHi)) continue;
        if (b && !filterPass(b, hHi)) continue;
        check(hHi);
      }
    } else {
      for (let hHi = hHiStart; hHi < hHiEnd; hHi++) {
        for (let f = 0; f < steps.length; f++) {
          if (filterPass(steps[f], hHi)) {
            check(hHi);
            break;
          }
        }
      }
    }
    i = ci * highCount + hLo * TWO24 + hHiEnd;
  }
  return found;
}
