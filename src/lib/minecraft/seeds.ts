// From a 48-bit structure seed to 64-bit world seeds.

import { ADDEND, MASK48, MULT } from "./random";

const MULT_INV = (() => {
  // Newton iteration for the inverse of an odd number mod 2^48
  let x = MULT;
  for (let i = 0; i < 6; i++) x = (x * (2n - MULT * x)) & MASK48;
  return x;
})();

/**
 * World seeds whose lower 48 bits equal `structureSeed` and that could have
 * been produced by `new Random().nextLong()`, i.e. a seed left blank in the
 * "Create World" screen. Usually 0 or 1 result.
 */
export function nextLongSeeds(structureSeed: bigint): bigint[] {
  const s = structureSeed & MASK48;
  const bU = s & 0xffffffffn;
  const b = BigInt.asIntN(32, bU);
  const aLow16 = ((s - b) >> 32n) & 0xffffn;
  const out: bigint[] = [];
  for (let low = 0n; low < 65536n; low++) {
    const state2 = (bU << 16n) | low;
    const state1 = ((state2 - ADDEND) * MULT_INV) & MASK48;
    if (((state1 >> 16n) & 0xffffn) !== aLow16) continue;
    const a = BigInt.asIntN(32, state1 >> 16n);
    const seed = BigInt.asIntN(64, (a << 32n) + b);
    if ((seed & MASK48) === s) out.push(seed);
  }
  return out;
}

/** If the seed fits in a 32-bit int it may have come from a text seed (String.hashCode). */
export function textSeedCandidate(structureSeed: bigint): bigint | null {
  const v = BigInt.asIntN(32, structureSeed);
  return BigInt.asUintN(48, v) === (structureSeed & MASK48) ? v : null;
}

export function worldSeedFor(structureSeed: bigint, upper16: number): bigint {
  return BigInt.asIntN(64, (BigInt(upper16) << 48n) | (structureSeed & MASK48));
}

/**
 * World seeds most likely to have this structure seed: ones a blank seed box
 * (Random.nextLong) could produce, then a typed text seed if it fits in 32 bits.
 */
export function likelyWorldSeeds(structureSeed: bigint) {
  const random = nextLongSeeds(structureSeed);
  const text = textSeedCandidate(structureSeed);
  return { random, likely: [...random, ...(text !== null && !random.includes(text) ? [text] : [])] };
}

/** What the game does with the text in the "Seed for the World Generator" box. */
export function textToSeed(text: string): { seed: bigint; kind: "number" | "text" } | null {
  const t = text.trim();
  if (t === "") return null; // the game picks a random seed
  if (/^[+-]?\d+$/.test(t)) {
    // Long.parseLong: accepted only if it fits a signed 64-bit number.
    const n = BigInt(t);
    if (n >= -(1n << 63n) && n < 1n << 63n) return { seed: n, kind: "number" };
  }
  // Otherwise String.hashCode over UTF-16 code units, as a signed 32-bit int.
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0;
  return { seed: BigInt(h), kind: "text" };
}
