// Phase 1: lifting. For a bound n = 2^k * m (m odd, n not a power of two),
// nextInt(n) mod 2^k only depends on the lowest 17+k seed bits, so those can be
// brute-forced on their own and almost all of them discarded.

import { MULT } from "../minecraft/random";
import { type PreparedObs } from "./observations";

export interface LiftPlan {
  lowBits: number;
  liftBits: number;
}

export function planLift(prepared: PreparedObs[]): LiftPlan {
  const kMax = Math.max(0, ...prepared.map((p) => p.k));
  if (kMax === 0) return { lowBits: 0, liftBits: 0 };
  // An axis with a span allows two consecutive values, i.e. one bit less.
  const axis = (k: number, span: number) => (k === 0 ? 0 : span ? k - 1 : k);
  return { lowBits: 17 + kMax, liftBits: prepared.reduce((a, p) => a + axis(p.k, p.spanX) + axis(p.k, p.spanZ), 0) };
}

export function liftLowBits(prepared: PreparedObs[], lowBits: number, maxMisses = 1): number[] {
  if (lowBits === 0) return [0];
  const mod = 2 ** lowBits;
  const mask = mod - 1;
  const mLow = Number(MULT & BigInt(mask));
  const xorLow = Number(MULT & BigInt(mask));
  const users = prepared
    .filter((p) => p.k > 0)
    .map((p) => ({
      c: Number(p.c & BigInt(mask)),
      km: (1 << p.k) - 1,
      ox: p.offX & ((1 << p.k) - 1),
      oz: p.offZ & ((1 << p.k) - 1),
      // second allowed value when the observation has a span
      ox2: (p.offX + p.spanX) & ((1 << p.k) - 1),
      oz2: (p.offZ + p.spanZ) & ((1 << p.k) - 1),
      droppable: !!p.droppable,
    }));
  const out: number[] = [];
  outer: for (let L = 0; L < mod; L++) {
    let missed = 0;
    for (const u of users) {
      let x = ((L + u.c) & mask) ^ xorLow;
      x = (x * mLow + 11) % mod;
      let v = (x >>> 17) & u.km;
      let ok = v === u.ox || v === u.ox2;
      if (ok) {
        x = (x * mLow + 11) % mod;
        v = (x >>> 17) & u.km;
        ok = v === u.oz || v === u.oz2;
      }
      if (!ok) {
        // In close-match mode up to maxMisses droppable observations may fail.
        if (!u.droppable || ++missed > maxMisses) continue outer;
      }
    }
    out.push(L);
  }
  return out;
}
