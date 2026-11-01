// The WGSL compute shader. WGSL has no 64-bit integers, so the 48-bit LCG uses
// two 24-bit halves: the low half's product is split into 12-bit pieces to get
// its carry; the high half only needs its low 24 bits, which u32 wrap-around
// gives for free. Every workgroup works on one 2^24-candidate block.

import { GPU_ML_INV } from "../../cracker";
import { MAX_SOLVERS, WORKGROUP } from "./layout";

export const SHADER = /* wgsl */ `
struct Obs {
  n: u32, shift: u32, tri: u32, offX: u32,
  offZ: u32, spanX: u32, spanZ: u32, cLo: u32,
  cHi: u32, drop: u32, limit: u32, pad1: u32,
};
struct Solver {
  obs: u32, m: u32, g: u32, inv: u32,
  residues: u32, perResidue: u32, rerolls: u32, offset: u32,
};
struct Params {
  count: u32, maxMisses: u32, mode: u32, lowBits: u32,
  b0: u32, nBlocks: u32, perBlock: u32, xGroups: u32,
  capacity: u32, nSolvers: u32, pad0: u32, pad1: u32,
  pad2: u32, pad3: u32, pad4: u32, pad5: u32,
};
struct Step { lo7: u32, kk: u32, base: u32, };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> obs: array<Obs>;
@group(0) @binding(2) var<storage, read> solvers: array<Solver>;
@group(0) @binding(3) var<storage, read> lows: array<u32>;
@group(0) @binding(4) var<storage, read_write> counter: atomic<u32>;
@group(0) @binding(5) var<storage, read_write> hits: array<u32>;

const ML: u32 = 0xECE66Du;
const MH: u32 = 0x5DEu;
const M24: u32 = 0xFFFFFFu;
const ML_INV: u32 = ${GPU_ML_INV}u;
const NONE: u32 = 0xFFFFFFFFu;

var<private> sLo: u32;
var<private> sHi: u32;

// Full 48-bit product lo * ML + 11 for a 24-bit lo: returns (low 24 bits, high part).
fn mulLo(lo: u32) -> vec2<u32> {
  let l0 = lo & 0xFFFu;
  let l1 = lo >> 12u;
  let mid = l0 * 0xECEu + l1 * 0x66Du;
  let t0 = l0 * 0x66Du + 11u + ((mid & 0xFFFu) << 12u);
  return vec2<u32>(t0 & M24, (t0 >> 24u) + (mid >> 12u) + l1 * 0xECEu);
}

// Advance the 48-bit LCG held in (sLo, sHi) and return next(31).
fn step31() -> u32 {
  let p = mulLo(sLo);
  sHi = (sHi * ML + sLo * MH + p.y) & M24;
  sLo = p.x;
  return (sHi << 7u) | (sLo >> 17u);
}

fn nextInt(n: u32, shift: u32) -> u32 {
  if (shift != NONE) {
    return step31() >> shift;
  }
  loop {
    let u = step31();
    let r = u % n;
    if (u - r + (n - 1u) <= 0x7FFFFFFFu) {
      return r;
    }
  }
}

fn matches(seedLo: u32, seedHi: u32, o: Obs) -> bool {
  var lo = seedLo + o.cLo;
  var hi = seedHi + o.cHi;
  if (lo >= 0x1000000u) {
    lo -= 0x1000000u;
    hi += 1u;
  }
  sLo = lo ^ ML;
  sHi = (hi & M24) ^ MH;
  var x: u32;
  var z: u32;
  if (o.tri != 0u) {
    x = (nextInt(o.n, o.shift) + nextInt(o.n, o.shift)) / 2u;
    if (x < o.offX || x > o.offX + o.spanX) { return false; }
    z = (nextInt(o.n, o.shift) + nextInt(o.n, o.shift)) / 2u;
  } else {
    x = nextInt(o.n, o.shift);
    if (x < o.offX || x > o.offX + o.spanX) { return false; }
    z = nextInt(o.n, o.shift);
  }
  return z >= o.offZ && z <= o.offZ + o.spanZ;
}

// First-step constants of an observation for fixed low seed bits (filterStep in lib/cracker/strategy.ts).
fn stepFor(o: Obs, seedLo: u32) -> Step {
  var lo = seedLo + o.cLo;
  var carry0 = 0u;
  if (lo >= 0x1000000u) {
    lo -= 0x1000000u;
    carry0 = 1u;
  }
  let lo0 = lo ^ ML;
  let p = mulLo(lo0);
  return Step(p.x >> 17u, (lo0 * MH + p.y) & M24, o.cHi + carry0);
}

// Does the candidate's first nextInt for o land in its X range, or reroll? (filterPass)
fn filterPass(o: Obs, st: Step, hHi: u32) -> bool {
  let hiS = ((hHi + st.base) & M24) ^ MH;
  let u = (((hiS * ML + st.kk) & M24) << 7u) | st.lo7;
  var r: u32;
  if (o.shift != NONE) { r = u >> o.shift; } else { r = u % o.n; }
  return (r >= o.offX && r <= o.offX + o.spanX) || u >= o.limit;
}

// First newHi of residue r's solution sequence (step m), or NONE if it has none.
fn firstSolution(sv: Solver, o: Obs, st: Step, r: u32) -> u32 {
  let d = i32(o.offX + r) - i32(st.lo7);
  let gi = i32(sv.g);
  if (((d % gi) + gi) % gi != 0) { return NONE; }
  var q = (d / gi) % i32(sv.m);
  if (q < 0) { q += i32(sv.m); }
  return (u32(q) * sv.inv) % sv.m;
}

// Per-block constants, computed once per workgroup (every workgroup works on one block).
var<workgroup> wSeedLo: u32;
var<workgroup> wStep: array<Step, ${MAX_SOLVERS}>;
var<workgroup> wFirstReroll: array<u32, ${MAX_SOLVERS}>;
var<workgroup> wStart: array<vec2<u32>, ${MAX_SOLVERS}>;

// Dispatch: y = block within the batch, x (and z for very wide blocks) = thread within the block.
@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) lid: u32) {
  // Low 24 seed bits of this block: (hLo << lowBits) | lifted pattern.
  let block = P.b0 + wid.y;
  let lowShift = 24u - P.lowBits;
  let seedLo = ((block & ((1u << lowShift) - 1u)) << P.lowBits) + lows[block >> lowShift];

  if (P.mode != 0u && lid < P.nSolvers) {
    // Solver lid: first-step constants and the first newHi of each residue's sequence.
    let sv = solvers[lid];
    let o = obs[sv.obs];
    let st = stepFor(o, seedLo);
    wStep[lid] = st;
    wFirstReroll[lid] = (o.limit - st.lo7 + 127u) / 128u; // smallest newHi with u >= limit
    wStart[lid] = vec2<u32>(firstSolution(sv, o, st, 0u), select(NONE, firstSolution(sv, o, st, 1u), sv.residues > 1u));
  }
  workgroupBarrier();

  let k = (wid.z * P.xGroups + wid.x) * ${WORKGROUP}u + lid;
  if (k >= P.perBlock) { return; }

  var hHi: u32;
  if (P.mode == 0u) {
    // scan: every high half
    hHi = k;
  } else {
    // solve: find this thread's solver, then its candidate
    var s = 0u;
    if (P.nSolvers > 1u) {
      loop {
        let sv = solvers[s];
        if (k < sv.offset + sv.residues * sv.perResidue + sv.rerolls || s + 1u >= P.nSolvers) { break; }
        s += 1u;
      }
    }
    let sv = solvers[s];
    let st = wStep[s];
    let firstReroll = wFirstReroll[s];
    let local = k - sv.offset;
    var newHi: u32;
    if (local < sv.residues * sv.perResidue) {
      // residues is 1 or 2 (an X span of at most one chunk)
      var r = 0u;
      var j = local;
      if (local >= sv.perResidue) { r = 1u; j = local - sv.perResidue; }
      let w = wStart[s];
      let t = select(w.x, w.y, r == 1u);
      if (t == NONE) { return; }
      newHi = t + j * sv.m;
      if (newHi >= firstReroll) { return; }
    } else {
      // values where nextInt rerolls can't be ruled out
      newHi = firstReroll + (local - sv.residues * sv.perResidue);
      if (newHi >= 0x1000000u || newHi * 128u + st.lo7 < obs[sv.obs].limit) { return; }
    }
    let hiS = (((newHi - st.kk) & M24) * ML_INV) & M24;
    hHi = ((hiS ^ MH) - st.base) & M24;
    // Close matches with several solvers: a candidate belongs to the first solver it passes.
    for (var e = 0u; e < s; e++) {
      if (filterPass(obs[solvers[e].obs], wStep[e], hHi)) { return; }
    }
  }

  var missed = 0u;
  for (var i = 0u; i < P.count; i++) {
    if (!matches(seedLo, hHi, obs[i])) {
      if (obs[i].drop == 0u) { return; }
      missed += 1u;
      if (missed > P.maxMisses) { return; }
    }
  }
  let slot = atomicAdd(&counter, 1u);
  if (slot < P.capacity) {
    hits[slot * 2u] = seedLo;
    hits[slot * 2u + 1u] = hHi;
  }
}
`;
