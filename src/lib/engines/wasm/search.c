// WebAssembly version of searchRange (src/lib/cracker/search.ts), for the CPU
// workers. It visits the same candidates and returns the same seeds as the JS
// search; the difference is that the LCG uses native 64-bit integers instead
// of 24-bit halves in doubles, which makes it 2 to 6 times faster.
//
// The JS side plans the search (lifting, strategy) and passes the plan in with
// configure(); search() then walks a range of candidates.
//
// Candidates. A plan has a list of lifted low-bit patterns ("lows"). For each
// pattern there are 2^(48 - lowBits) candidates, numbered with a flat index:
//
//   index = patternIndex * 2^(48 - lowBits) + hLo * 2^24 + hHi
//   seed  = hHi << 24 | (hLo << lowBits | lows[patternIndex])
//
// So every run of 2^24 indices is one "block": the seed's low 24 bits are fixed
// and only its high 24 bits (hHi) change. The reference mode numbers them
// differently (see search_reference).
//
// Build: scripts/build-wasm.sh (clang --target=wasm32, no libc).

typedef unsigned int u32;
typedef int i32;
typedef unsigned long long u64;

#define EXPORT(name) __attribute__((export_name(#name)))

// ---------------------------------------------------------------- constants

#define MULT 0x5DEECE66DULL    // java.util.Random multiplier
#define MASK48 0xFFFFFFFFFFFFULL
#define TWO24 16777216u
#define MASK24 0xFFFFFFu
#define MULT_LO 0xECE66Du      // low 24 bits of MULT
#define MULT_HI 0x5DEu         // high 24 bits of MULT
#define TWO31 2147483648u
#define NONE 0xFFFFFFFFu

#define MAX_OBS 64
#define MAX_LOWS (1u << 20)
#define MAX_HITS (1u << 16)
#define MAX_FILTERS 4

// How a block's candidates are found (strategyCode in src/lib/cracker/strategy.ts).
typedef enum {
  MODE_REFERENCE = 0, // test every candidate, in the reference order
  MODE_SOLVE_ALL = 1, // solve for candidates that pass filter 0 (and check filter 1)
  MODE_SOLVE_ANY = 2, // close matches: solve for each filter, skip duplicates
  MODE_SCAN_ALL = 3,  // test every hHi against all filters
  MODE_SCAN_ANY = 4,  // close matches: test every hHi against any filter
} Mode;

// ---------------------------------------------------------------- the plan

// One structure the player found, prepared for the search (PreparedObs in
// observations.ts). The layout must match OBS_U32 in searcher.ts.
typedef struct {
  u32 n;             // nextInt bound: spacing - separation
  u32 shift;         // 31 - log2(n) if n is a power of two, otherwise NONE
  u32 triangular;    // 1 if each offset is the average of two draws
  u32 offX, offZ;    // observed offset inside the region
  u32 spanX, spanZ;  // accepted offsets are off..off+span
  u32 droppable;     // close matches may miss this observation
  u32 cLo, cHi;      // (regionX * A + regionZ * B + salt) mod 2^48, in 24-bit halves
  u32 pad0, pad1;
} Obs;

static Obs obs[MAX_OBS];
static u32 lows[MAX_LOWS];

static struct {
  u32 count;       // observations in use
  u32 lowBits;     // bits fixed by each lifted pattern
  u32 maxMisses;   // droppable observations that may miss (0 = exact search)
  Mode mode;
  u32 nFilters;
  u32 filters[MAX_FILTERS]; // indices into obs
  u32 multLoInv;   // inverse of MULT_LO mod 2^24
} plan;

// Results of the last search().
static u64 hits[MAX_HITS];
static u32 hitCount;

EXPORT(obs_buffer) Obs *obs_buffer(void) { return obs; }
EXPORT(lows_buffer) u32 *lows_buffer(void) { return lows; }
EXPORT(hits_buffer) u64 *hits_buffer(void) { return hits; }
EXPORT(max_lows) u32 max_lows(void) { return MAX_LOWS; }
EXPORT(max_hits) u32 max_hits(void) { return MAX_HITS; }

// Load the plan. obs_buffer() and lows_buffer() must already be filled.
EXPORT(configure)
void configure(u32 count, u32 lowBits, u32 maxMisses, u32 mode, u32 nFilters, u32 f0, u32 f1, u32 f2, u32 f3) {
  plan.count = count;
  plan.lowBits = lowBits;
  plan.maxMisses = maxMisses;
  plan.mode = (Mode)mode;
  plan.nFilters = nFilters;
  plan.filters[0] = f0;
  plan.filters[1] = f1;
  plan.filters[2] = f2;
  plan.filters[3] = f3;
  // Newton iteration: each step doubles the number of correct low bits.
  u32 x = MULT_LO;
  for (int i = 0; i < 5; i++) x = (x * (2u - MULT_LO * x)) & MASK24;
  plan.multLoInv = x;
}

static void record_hit(u64 seed) {
  if (hitCount < MAX_HITS) hits[hitCount] = seed;
  hitCount++;
}

// ---------------------------------------------------------------- full check

// java.util.Random state while checking one observation.
static u64 rng;

static inline u32 next31(void) {
  rng = (rng * MULT + 11) & MASK48;
  return (u32)(rng >> 17);
}

// java.util.Random.nextInt(n), including its reroll near 2^31.
static inline u32 next_int(const Obs *o) {
  if (o->shift != NONE) return next31() >> o->shift;
  for (;;) {
    u32 u = next31();
    u32 r = u % o->n;
    if (u - r + (o->n - 1) <= 0x7FFFFFFFu) return r;
  }
}

static inline u32 next_offset(const Obs *o) {
  return o->triangular ? (next_int(o) + next_int(o)) / 2 : next_int(o);
}

// Does this structure seed put the structure where it was observed?
static inline int matches(u64 seed, const Obs *o) {
  u64 regionConstant = ((u64)o->cHi << 24) | o->cLo;
  rng = ((seed + regionConstant) & MASK48) ^ MULT; // new Random(regionSeed)
  u32 x = next_offset(o);
  if (x < o->offX || x > o->offX + o->spanX) return 0;
  u32 z = next_offset(o);
  return z >= o->offZ && z <= o->offZ + o->spanZ;
}

// Every observation must match, except up to maxMisses droppable ones (fullCheck in lcg.ts).
static inline int full_check(u64 seed) {
  u32 missed = 0;
  for (u32 j = 0; j < plan.count; j++) {
    if (matches(seed, &obs[j])) continue;
    if (!obs[j].droppable || ++missed > plan.maxMisses) return 0;
  }
  return 1;
}

// ---------------------------------------------------------------- filters
//
// With a block's low 24 bits fixed, an observation's first draw only depends on
// the high 24 bits through one multiply-add mod 2^24:
//
//   newHi = (hiScrambled * MULT_LO + offset) mod 2^24
//   u     = newHi << 7 | low7          (the 31-bit value nextInt uses)
//
// where hiScrambled = ((hHi + carry) mod 2^24) ^ MULT_HI. That makes it cheap to
// test a candidate (passes_filter), and possible to solve for the ones that
// pass (solve).

// First-draw constants of one filter observation for one block (FilterStep in strategy.ts).
typedef struct {
  u32 carry;  // added to hHi before scrambling: cHi + carry from the low half
  u32 offset; // added after multiplying by MULT_LO: low-half cross terms and carry
  u32 low7;   // top 7 bits of the new low half: the bottom of u
  u32 shift, n;
  u32 limit;  // nextInt(n) rerolls when u >= limit
  u32 lo, hi; // accepted X offsets
} FirstDraw;

static FirstDraw first_draw(const Obs *o, u32 seedLo) {
  u32 lo = seedLo + o->cLo;
  u32 carry = 0;
  if (lo >= TWO24) {
    lo -= TWO24;
    carry = 1;
  }
  u32 loScrambled = lo ^ MULT_LO;
  u64 product = (u64)loScrambled * MULT_LO + 11;
  FirstDraw f;
  f.low7 = ((u32)product & MASK24) >> 17;
  f.offset = (loScrambled * MULT_HI + (u32)(product >> 24)) & MASK24;
  f.carry = o->cHi + carry;
  f.shift = o->shift;
  f.n = o->n;
  f.limit = o->shift != NONE ? TWO31 : TWO31 - (TWO31 % o->n);
  f.lo = o->offX;
  f.hi = o->offX + o->spanX;
  return f;
}

// Does the candidate's first draw land in the filter's X range, or reroll? (filterPass)
static inline int passes_filter(const FirstDraw *f, u32 hHi) {
  u32 hiScrambled = ((hHi + f->carry) & MASK24) ^ MULT_HI;
  u32 u = (((hiScrambled * MULT_LO + f->offset) & MASK24) << 7) | f->low7;
  u32 r = f->shift != NONE ? u >> f->shift : u % f->n;
  return (r >= f->lo && r <= f->hi) || u >= f->limit;
}

// Undo the multiply-add: the hHi that gives this newHi.
static inline u32 hhi_from_new_hi(const FirstDraw *f, u32 newHi) {
  u32 hiScrambled = (((newHi - f->offset) & MASK24) * plan.multLoInv) & MASK24;
  return ((hiScrambled ^ MULT_HI) - f->carry) & MASK24;
}

// x with a * x = 1 (mod m). m is small (< 128), so a linear scan is fine.
static u32 mod_inverse(u32 a, u32 m) {
  for (u32 x = 1; x < m; x++)
    if ((a * x) % m == 1) return x;
  return m == 1 ? 0 : NONE;
}

// ---------------------------------------------------------------- blocks

// The block being searched: its low 24 seed bits, the part of it inside the
// requested range, and the filters' first-draw constants.
typedef struct {
  u32 seedLo;
  u32 hHiStart, hHiEnd;
  FirstDraw filters[MAX_FILTERS];
} Block;

static inline void check_candidate(const Block *b, u32 hHi) {
  if (hHi < b->hHiStart || hHi >= b->hHiEnd) return;
  u64 seed = ((u64)hHi << 24) | b->seedLo;
  if (full_check(seed)) record_hit(seed);
}

// A candidate found by solving for filter s. In close-match mode, skip it if an
// earlier filter also passes (that filter's solve already visited it). In
// all-match mode, it must also pass filter 1 if there is one.
static void visit_solution(const Block *b, u32 s, u32 hHi) {
  if (plan.mode == MODE_SOLVE_ANY) {
    for (u32 e = 0; e < s; e++)
      if (passes_filter(&b->filters[e], hHi)) return;
  } else if (plan.nFilters > 1 && !passes_filter(&b->filters[1], hHi)) {
    return;
  }
  check_candidate(b, hHi);
}

// Visit every hHi whose first draw for filter s lands in its X range (or
// rerolls), without testing the others (solutions + forEachSolution in strategy.ts).
//
// u mod n = r means newHi * 128 = r - low7 (mod n). With g = gcd(n, 128) and
// m = n / g, that has solutions only if g divides r - low7, and then they are
// one residue t mod m: newHi = t, t + m, t + 2m, ...
static void solve(const Block *b, u32 s) {
  const FirstDraw *f = &b->filters[s];
  u32 g = f->n & (0u - f->n); // largest power of two dividing n
  if (g > 128) g = 128;
  u32 m = f->n / g;
  u32 inv = mod_inverse((128 / g) % m, m);
  // The smallest newHi whose u reaches the reroll zone (u >= limit); from here up,
  // values are visited one by one. Rounded up so no newHi falls between the loops.
  u32 firstReroll = f->limit >= f->low7 ? (f->limit - f->low7 + 127) / 128 : 0;

  for (u32 r = f->lo; r <= f->hi; r++) {
    i32 d = (i32)r - (i32)f->low7;
    if (((d % (i32)g) + (i32)g) % (i32)g != 0) continue;
    i32 q = (d / (i32)g) % (i32)m;
    if (q < 0) q += m;
    u32 t = ((u32)q * inv) % m;
    for (u32 newHi = t; newHi < firstReroll; newHi += m) visit_solution(b, s, hhi_from_new_hi(f, newHi));
  }
  for (u32 newHi = firstReroll; newHi < TWO24; newHi++)
    if ((u64)newHi * 128 + f->low7 >= f->limit) visit_solution(b, s, hhi_from_new_hi(f, newHi));
}

// Test every hHi in the block against the filters, then fully check those that pass.
static void scan(const Block *b) {
  for (u32 hHi = b->hHiStart; hHi < b->hHiEnd; hHi++) {
    int pass;
    if (plan.mode == MODE_SCAN_ALL) {
      pass = passes_filter(&b->filters[0], hHi) && (plan.nFilters < 2 || passes_filter(&b->filters[1], hHi));
    } else {
      pass = 0;
      for (u32 s = 0; s < plan.nFilters && !pass; s++) pass = passes_filter(&b->filters[s], hHi);
    }
    if (pass) check_candidate(b, hHi);
  }
}

static void search_block(const Block *b) {
  switch (plan.mode) {
    case MODE_SOLVE_ALL:
      solve(b, 0);
      break;
    case MODE_SOLVE_ANY:
      for (u32 s = 0; s < plan.nFilters; s++) solve(b, s);
      break;
    default:
      scan(b);
      break;
  }
}

// Fast search: [start, end) in block order (searchRange in search.ts).
static void search_blocks(u64 start, u64 end) {
  u64 perPattern = 1ULL << (48 - plan.lowBits);
  u64 i = start;
  while (i < end) {
    u64 pattern = i / perPattern;
    u64 local = i - pattern * perPattern;
    u64 hLo = local >> 24;
    u64 blockStart = pattern * perPattern + (hLo << 24);
    u64 left = end - blockStart;

    Block b;
    b.seedLo = (u32)((hLo << plan.lowBits) + lows[pattern]);
    b.hHiStart = (u32)(local - (hLo << 24));
    b.hHiEnd = left > TWO24 ? TWO24 : (u32)left;
    for (u32 s = 0; s < plan.nFilters; s++) b.filters[s] = first_draw(&obs[plan.filters[s]], b.seedLo);

    search_block(&b);
    i = blockStart + b.hHiEnd;
  }
}

// Reference search: test every candidate in [start, end), numbered
// index = patternIndex * 2^(48 - lowBits) + h with seed = h << lowBits | pattern
// (searchRangeReference in search.ts).
static void search_reference(u64 start, u64 end) {
  u64 perPattern = 1ULL << (48 - plan.lowBits);
  u64 i = start;
  while (i < end) {
    u64 pattern = i / perPattern;
    u64 low = lows[pattern];
    u64 hEnd = end - pattern * perPattern;
    if (hEnd > perPattern) hEnd = perPattern;
    for (u64 h = i - pattern * perPattern; h < hEnd; h++) {
      u64 seed = (h << plan.lowBits) + low;
      if (full_check(seed)) record_hit(seed);
    }
    i = pattern * perPattern + hEnd;
  }
}

// Search candidate indices [start, end) (doubles, since indices go up to 2^48).
// Returns the hit count; if it's more than max_hits(), hits_buffer() holds only
// the first max_hits() seeds and the caller should fall back to the JS search.
EXPORT(search)
u32 search(double start, double end) {
  hitCount = 0;
  if (plan.mode == MODE_REFERENCE) search_reference((u64)start, (u64)end);
  else search_blocks((u64)start, (u64)end);
  return hitCount;
}
