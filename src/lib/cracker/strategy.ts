// Search strategy: which observations filter candidates, and whether the
// candidates that pass can be solved for directly instead of tested one by one.

import * as lcg from "./lcg";
import { type PreparedObs } from "./observations";

// Hot loops below: take local copies of imported bindings once. Bundlers can
// compile imports to getter calls, which made this search about 10x slower.
const { MASK24, MH, ML, ML_INV, TWO24, TWO31 } = lcg;

/**
 * Chance that a wrong candidate still gets this observation's X offset right,
 * given that lifting already fixed the offset's low k bits.
 */
export function passChance(p: PreparedObs) {
  return ((p.spanX + 1) * 2 ** p.k) / p.n;
}

/**
 * Observations used as a quick filter before the full check. Only linear
 * spreads qualify, since their X offset is a single nextInt.
 * "all": up to two observations that must match; a candidate must pass both.
 * "any": in close-match mode with no required linear observation, maxMisses + 1
 *   droppable ones. At most maxMisses can miss, so a match passes at least one.
 */
function pickFilter(prepared: PreparedObs[], maxMisses: number): { mode: "all" | "any"; obs: PreparedObs[] } | null {
  const linear = prepared.filter((p) => !p.triangular).sort((a, b) => passChance(a) - passChance(b));
  const required = linear.filter((p) => !p.droppable);
  if (required.length) return { mode: "all", obs: required.slice(0, 2) };
  const need = maxMisses + 1;
  return linear.length >= need ? { mode: "any", obs: linear.slice(0, need) } : null;
}

/** First-step constants of one filter observation for fixed low 24 seed bits. */
interface FilterStep {
  /** added to hHi before masking: cHi + carry from the low half */
  base: number;
  /** Math.imul(lo0, MH) + carry from the low product */
  kk: number;
  /** top 7 bits of the new low half */
  lo7: number;
  /** >= 0: shift for a power-of-two bound; -1: use modulo */
  shift: number;
  n: number;
  /** nextInt(n) rerolls when u >= limit; such rare candidates skip the filter */
  limit: number;
  lo: number;
  hi: number;
}

export function filterStep(p: PreparedObs, seedLo: number): FilterStep {
  let lo = seedLo + p.cLo;
  let carry0 = 0;
  if (lo >= TWO24) {
    lo -= TWO24;
    carry0 = 1;
  }
  const lo0 = lo ^ ML;
  const x = lo0 * ML + 11;
  const carry1 = (x / TWO24) | 0;
  return {
    base: p.cHi + carry0,
    kk: Math.imul(lo0, MH) + carry1,
    lo7: (x - carry1 * TWO24) >>> 17,
    shift: p.pow2 ? 31 - Math.log2(p.n) : -1,
    n: p.n,
    limit: p.pow2 ? TWO31 : TWO31 - (TWO31 % p.n),
    lo: p.offX,
    hi: p.offX + p.spanX,
  };
}

/** Does this candidate's first nextInt for the observation land in its X range (or reroll)? */
export function filterPass(f: FilterStep, hHi: number): boolean {
  const hiS = ((hHi + f.base) & MASK24) ^ MH;
  const u = (((Math.imul(hiS, ML) + f.kk) & MASK24) << 7) | f.lo7;
  const r = f.shift >= 0 ? u >>> f.shift : u % f.n;
  return (r >= f.lo && r <= f.hi) || u >= f.limit;
}

/**
 * Instead of testing every hHi against an observation, solve for the ones
 * whose first nextInt(n) lands in [lo, hi]. With u = newHi * 128 + lo7 and
 * newHi = hiS * ML + kk (mod 2^24), the condition u mod n = r is linear in
 * newHi: newHi = t (mod n / gcd(n, 128)). So only every (n / gcd)-th newHi can
 * match, and each maps back to exactly one hHi.
 * Only for linear spreads with a bound that isn't a power of two.
 */
export function solveStep(p: PreparedObs) {
  if (p.triangular || p.pow2) return 0;
  const g = Math.min(128, p.n & -p.n);
  return p.n / g;
}

function modInverse(a: number, m: number) {
  // m is small (< 128), so a linear scan is fine.
  for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
  return m === 1 ? 0 : -1;
}

/**
 * Solutions of one filter observation for fixed low seed bits: for each allowed
 * residue, the first newHi of the sequence (step m), or -1 if none; newHi values
 * from firstReroll up can reroll and are listed separately.
 */
function solutions(f: FilterStep) {
  const n = f.n;
  const g = Math.min(128, n & -n);
  const m = n / g;
  const inv = modInverse((128 / g) % m, m);
  const toHHi = (newHi: number) => {
    const hiS = Math.imul((newHi - f.kk) & MASK24, ML_INV) & MASK24;
    return ((hiS ^ MH) - f.base) & MASK24;
  };
  // newHi values with u >= limit reroll, so they can't be ruled out. The first
  // is the smallest newHi with newHi * 128 + lo7 >= limit, hence the ceil:
  // with floor, that one value fell between the two loops and was never visited.
  const firstReroll = Math.max(0, Math.ceil((f.limit - f.lo7) / 128));
  const starts: number[] = [];
  for (let r = f.lo; r <= f.hi; r++) {
    const d = r - f.lo7;
    starts.push(((d % g) + g) % g !== 0 ? -1 : (((((d / g) % m) + m) % m) * inv) % m);
  }
  const rerolls: number[] = [];
  for (let newHi = firstReroll; newHi < TWO24; newHi++) if (newHi * 128 + f.lo7 >= f.limit) rerolls.push(toHHi(newHi));
  return { m, starts, firstReroll, rerolls, toHHi };
}

/** Call visit(hHi) for every hHi whose first nextInt(n) for f lands in [f.lo, f.hi], or rerolls. */
export function forEachSolution(f: FilterStep, visit: (hHi: number) => void) {
  const { m, starts, firstReroll, rerolls, toHHi } = solutions(f);
  for (const t of starts) {
    if (t < 0) continue;
    for (let newHi = t; newHi < firstReroll; newHi += m) visit(toHHi(newHi));
  }
  rerolls.forEach(visit);
}

/**
 * Fast search over the same candidates as searchRangeReference, in a different
 * order. Index = candidateIndex * 2^(48-lowBits) + hLo * 2^24 + hHi, where the
 * seed's low 24 bits are (hLo << lowBits) | low and its high 24 bits are hHi.
 *
 * With the low 24 bits fixed, an observation's first LCG step only depends on
 * hHi through one Math.imul. When a filter observation allows it, the hHi
 * values that get its X offset right are solved for directly (forEachSolution);
 * otherwise every hHi is tested with a few integer operations. Candidates that
 * get through go to the full check. Ranges that cover whole 2^24 blocks are
 * the most efficient.
 */
export function strategy(prepared: PreparedObs[], lowBits: number, maxMisses: number) {
  const filter = lowBits <= 24 ? pickFilter(prepared, maxMisses) : null;
  if (!filter) return null;
  // Solving needs a suitable observation: in "all" mode one of the required
  // ones, in "any" mode every one of them.
  const solvable =
    filter.mode === "all" ? filter.obs.some((p) => solveStep(p) > 1) : filter.obs.every((p) => solveStep(p) > 1);
  if (solvable && filter.mode === "all") {
    // Solve with the observation that rules out the most; filter with the other.
    filter.obs.sort((a, b) => solveStep(b) / (b.spanX + 1) - solveStep(a) / (a.spanX + 1));
  }
  return { filter, solvable };
}

/**
 * The strategy searchRange uses, as plain numbers for the WebAssembly search:
 * mode 0 = reference loop, 1 = solve (all), 2 = solve (any), 3 = scan (all),
 * 4 = scan (any); filter = indices into `prepared`.
 */
export function strategyCode(prepared: PreparedObs[], lowBits: number, maxMisses: number) {
  const st = strategy(prepared, lowBits, maxMisses);
  if (!st) return { mode: 0, filter: [] as number[] };
  const all = st.filter.mode === "all";
  return {
    mode: st.solvable ? (all ? 1 : 2) : all ? 3 : 4,
    filter: st.filter.obs.map((p) => prepared.indexOf(p)),
  };
}
