// Fast 48-bit LCG for the JS search: two 24-bit halves in doubles, so every
// product is exact. Also the full check of one candidate against all observations.

import { type PreparedObs } from "./observations";

export const TWO24 = 16777216;
export const TWO31 = 2147483648;
export const ML = 0xece66d; // low 24 bits of the multiplier
export const MH = 0x5de; // high 24 bits of the multiplier
export const MASK24 = 0xffffff;

// Inverse of ML mod 2^24 (Newton iteration; ML is odd).
export const ML_INV = (() => {
  let x = ML;
  for (let i = 0; i < 5; i++) x = Math.imul(x, 2 - Math.imul(ML, x)) & MASK24;
  return x;
})();

let sLo = 0;
let sHi = 0;

/** Advance the 48-bit LCG held in (sLo, sHi) and return next(31). */
function step31(): number {
  // Low half: 24x24-bit product is exact in a double. High half: only its low
  // 24 bits matter, which Math.imul gives without going through a double.
  const lo = sLo * ML + 11;
  const carry = (lo / TWO24) | 0;
  const newLo = lo - carry * TWO24;
  sHi = (Math.imul(sHi, ML) + Math.imul(sLo, MH) + carry) & MASK24;
  sLo = newLo;
  return (sHi << 7) | (newLo >>> 17);
}

function nextIntFast(n: number, pow2: boolean): number {
  if (pow2) return Math.floor((n * step31()) / TWO31);
  for (;;) {
    const u = step31();
    const r = u % n;
    if (u - r + (n - 1) <= 2147483647) return r;
  }
}

function matches(seedLo: number, seedHi: number, p: PreparedObs): boolean {
  let lo = seedLo + p.cLo;
  let hi = seedHi + p.cHi;
  if (lo >= TWO24) {
    lo -= TWO24;
    hi += 1;
  }
  if (hi >= TWO24) hi -= TWO24;
  sLo = lo ^ ML;
  sHi = hi ^ MH;
  let x: number, z: number;
  if (p.triangular) {
    x = Math.floor((nextIntFast(p.n, p.pow2) + nextIntFast(p.n, p.pow2)) / 2);
    if (x < p.offX || x > p.offX + p.spanX) return false;
    z = Math.floor((nextIntFast(p.n, p.pow2) + nextIntFast(p.n, p.pow2)) / 2);
  } else {
    x = nextIntFast(p.n, p.pow2);
    if (x < p.offX || x > p.offX + p.spanX) return false;
    z = nextIntFast(p.n, p.pow2);
  }
  return z >= p.offZ && z <= p.offZ + p.spanZ;
}

/** Full check of one candidate: every observation, with up to maxMisses droppable misses. */
export function fullCheck(seedLo: number, seedHi: number, prepared: PreparedObs[], maxMisses: number): boolean {
  let missed = 0;
  for (let j = 0; j < prepared.length; j++) {
    if (!matches(seedLo, seedHi, prepared[j])) {
      // In close-match mode up to maxMisses droppable observations may fail.
      if (!prepared[j].droppable || ++missed > maxMisses) return false;
    }
  }
  return true;
}

export const GPU_ML_INV = ML_INV;
