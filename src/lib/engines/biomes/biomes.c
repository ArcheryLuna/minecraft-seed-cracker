// Biome checks for Seed Cracker, built on cubiomes (./cubiomes, MIT licence).
//
// Exposes to JavaScript:
//   - single lookups: biome at a position, a structure's attempt position,
//     whether a structure really generates there (biome, optionally terrain);
//   - bm_narrow: which of the 65,536 world seeds sharing a structure seed fit a
//     list of structures and biome conditions (used by the cracker);
//   - bm_find: random search for world seeds that meet a list of conditions
//     (used by the seed finder).
//
// Structure and version numbers are indices into the tables below, shared with
// src/lib/engines/biomes/ids.ts, so the TypeScript side never depends on the
// order of cubiomes' enums.
//
// Build: scripts/build-wasm.sh (clang, wasm32-wasip1, wasi-libc).

#include <stdint.h>
#include <string.h>
#include "cubiomes/finders.h"
#include "cubiomes/generator.h"

#define EXPORT(name) __attribute__((export_name(#name)))
#define LOW48 0xFFFFFFFFFFFFULL

// ---------------------------------------------------------------- id tables

// Same order as VERSIONS in ids.ts.
static const int VERSION_IDS[] = {
  MC_1_16_5, MC_1_17_1, MC_1_18_2, MC_1_19_4, MC_1_20_6, MC_1_21_3, MC_1_21_WD,
};
#define N_VERSIONS (int)(sizeof VERSION_IDS / sizeof VERSION_IDS[0])

// Same order as STRUCTURES in ids.ts.
static const int STRUCT_IDS[] = {
  Village, Desert_Pyramid, Jungle_Temple, Swamp_Hut, Igloo, Outpost, Shipwreck,
  Ocean_Ruin, Ruined_Portal, Monument, Mansion, Ancient_City, Trail_Ruins,
  Trial_Chambers, Fortress, Bastion, End_City, Ruined_Portal_N,
};
#define N_STRUCTS (int)(sizeof STRUCT_IDS / sizeof STRUCT_IDS[0])

EXPORT(bm_version_count) int bm_version_count(void) { return N_VERSIONS; }
EXPORT(bm_struct_count) int bm_struct_count(void) { return N_STRUCTS; }

static int dimension_of(int stype) {
  switch (stype) {
    case Fortress: case Bastion: case Ruined_Portal_N: return DIM_NETHER;
    case End_City: return DIM_END;
    default: return DIM_OVERWORLD;
  }
}

// ---------------------------------------------------------------- generator

static Generator gen;
static int genMc = -1;
static int genDim = 999;
static uint64_t genSeed;

// Choose the game version. Must be called before anything else.
EXPORT(bm_setup)
int bm_setup(int version) {
  if (version < 0 || version >= N_VERSIONS) return 0;
  genMc = VERSION_IDS[version];
  setupGenerator(&gen, genMc, 0);
  genDim = 999;
  return 1;
}

static void use_seed(uint64_t seed, int dim) {
  if (dim != genDim || seed != genSeed) {
    applySeed(&gen, dim, seed);
    genDim = dim;
    genSeed = seed;
  }
}

// ---------------------------------------------------------------- single lookups

// Biome id at a block position (y matters from 1.18).
EXPORT(bm_biome_at)
int bm_biome_at(uint64_t seed, int dim, int x, int y, int z) {
  use_seed(seed, dim);
  return getBiomeAt(&gen, 1, x, y, z);
}

// Attempt position of a structure in a region, from the structure seed. Writes
// block coordinates to out[0..1]. Returns 0 if this region has no attempt.
EXPORT(bm_structure_pos)
int bm_structure_pos(int s, uint64_t seed, int regionX, int regionZ, int *out) {
  Pos p;
  if (!getStructurePos(STRUCT_IDS[s], genMc, seed & LOW48, regionX, regionZ, &p)) return 0;
  out[0] = p.x;
  out[1] = p.z;
  return 1;
}

// Region size of a structure type, in chunks.
EXPORT(bm_region_size)
int bm_region_size(int s) {
  StructureConfig sc;
  return getStructureConfig(STRUCT_IDS[s], genMc, &sc) ? sc.regionSize : 0;
}

// Does the structure generate at this attempt position? The biome check is
// exact. terrain = 1 adds cubiomes' 1.18+ terrain heuristic, which can rule
// out real positions, so the cracker leaves it off.
static int viable(int stype, uint64_t seed, int x, int z, int terrain) {
  int dim = dimension_of(stype);
  use_seed(seed, dim);
  if (!isViableStructurePos(stype, &gen, x, z, 0)) return 0;
  if (terrain && dim == DIM_OVERWORLD && genMc >= MC_1_18) return isViableStructureTerrain(stype, &gen, x, z);
  return 1;
}

EXPORT(bm_viable)
int bm_viable(int s, uint64_t seed, int x, int z, int terrain) {
  return viable(STRUCT_IDS[s], seed, x, z, terrain);
}

// ---------------------------------------------------------------- narrowing (cracker)

// Observations: 4 ints each {structure index, regionX, regionZ, either} where
// either = 1 means "fortress or bastion" (the nether complex grid).
// Biome conditions: 5 ints each {dim, x, y, z, biome id}.
// For upper in [from, to), tests world seed (upper << 48) | structureSeed and
// sets out[upper - from] to 1 if every observation generates and every biome
// matches. Returns the number of matches.
static int observation_fits(const int *o, uint64_t seed) {
  int types[2] = { STRUCT_IDS[o[0]], o[3] ? Bastion : -1 };
  if (o[3]) types[0] = Fortress;
  for (int t = 0; t < 2; t++) {
    if (types[t] < 0) continue;
    Pos p;
    if (!getStructurePos(types[t], genMc, seed & LOW48, o[1], o[2], &p)) continue;
    if (viable(types[t], seed, p.x, p.z, 0)) return 1;
  }
  return 0;
}

EXPORT(bm_narrow)
int bm_narrow(uint64_t structureSeed, int nObs, const int *obs, int nBiomes, const int *biomes, int from, int to, uint8_t *out) {
  int matches = 0;
  for (int upper = from; upper < to; upper++) {
    uint64_t seed = ((uint64_t)upper << 48) | (structureSeed & LOW48);
    int ok = 1;
    for (int i = 0; ok && i < nBiomes; i++) {
      const int *b = biomes + 5 * i;
      ok = bm_biome_at(seed, b[0], b[1], b[2], b[3]) == b[4];
    }
    for (int i = 0; ok && i < nObs; i++) ok = observation_fits(obs + 4 * i, seed);
    out[upper - from] = (uint8_t)ok;
    matches += ok;
  }
  return matches;
}

// ---------------------------------------------------------------- finder

// Conditions: 8 ints each {kind, structure index, x, z, radius, count, area, terrain}
//   kind 0, near:  at least `count` structures within `radius` blocks of (x, z)
//   kind 1, group: at least `count` structures within `radius` blocks of one of
//                  them, all within `area` blocks of (x, z)
//   kind 2, chunk: a structure whose attempt is in chunk (x, z)
#define COND_INTS 8
#define MAX_CANDIDATES 256

static uint64_t rngState;

// splitmix64: fast, good-quality sampling of seeds (not Minecraft's RNG).
static uint64_t sample64(void) {
  uint64_t z = (rngState += 0x9E3779B97F4A7C15ULL);
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
  return z ^ (z >> 31);
}

// A world seed an empty seed box could produce: new Random().nextLong().
static uint64_t natural_seed(void) {
  uint64_t q = sample64() & LOW48;
  q = (q * 0x5DEECE66DULL + 0xB) & LOW48;
  int32_t a = (int32_t)(q >> 16);
  q = (q * 0x5DEECE66DULL + 0xB) & LOW48;
  int32_t b = (int32_t)(q >> 16);
  return (uint64_t)((int64_t)a * 4294967296LL + (int64_t)b);
}

static int64_t floor_div(int64_t a, int64_t b) {
  int64_t q = a / b;
  return (a % b != 0 && ((a < 0) != (b < 0))) ? q - 1 : q;
}

static int64_t dist2(int x1, int z1, int x2, int z2) {
  int64_t dx = (int64_t)x1 - x2, dz = (int64_t)z1 - z2;
  return dx * dx + dz * dz;
}

typedef struct {
  int n;
  Pos pos[MAX_CANDIDATES];
} Candidates;

// Attempt positions of a condition's structure inside its search area
// (grid only, no biomes).
static void collect(const int *c, uint64_t seed, Candidates *out) {
  int kind = c[0], stype = STRUCT_IDS[c[1]];
  out->n = 0;
  StructureConfig sc;
  if (!getStructureConfig(stype, genMc, &sc)) return;
  int64_t regionBlocks = (int64_t)sc.regionSize * 16;
  int64_t reach = kind == 2 ? 0 : (kind == 0 ? c[4] : c[6]);
  int64_t cx = kind == 2 ? (int64_t)c[2] * 16 : c[2], cz = kind == 2 ? (int64_t)c[3] * 16 : c[3];
  int64_t rx0 = floor_div(cx - reach, regionBlocks), rx1 = floor_div(cx + reach, regionBlocks);
  int64_t rz0 = floor_div(cz - reach, regionBlocks), rz1 = floor_div(cz + reach, regionBlocks);
  for (int64_t rz = rz0; rz <= rz1; rz++) {
    for (int64_t rx = rx0; rx <= rx1; rx++) {
      Pos p;
      if (!getStructurePos(stype, genMc, seed & LOW48, (int)rx, (int)rz, &p)) continue;
      int inside = kind == 2 ? (p.x >> 4) == c[2] && (p.z >> 4) == c[3] : dist2(p.x, p.z, (int)cx, (int)cz) <= reach * reach;
      if (inside && out->n < MAX_CANDIDATES) out->pos[out->n++] = p;
    }
  }
}

// Does a set of positions meet the condition's count (and grouping)?
static int enough(const int *c, const Candidates *k) {
  int count = c[0] == 2 ? 1 : (c[5] < 1 ? 1 : c[5]);
  if (k->n < count) return 0;
  if (c[0] != 1) return 1;
  int64_t r2 = (int64_t)c[4] * c[4];
  for (int i = 0; i < k->n; i++) {
    int near = 0;
    for (int j = 0; j < k->n; j++) near += dist2(k->pos[i].x, k->pos[i].z, k->pos[j].x, k->pos[j].z) <= r2;
    if (near >= count) return 1;
  }
  return 0;
}

static int keep_viable(const int *c, uint64_t seed, const Candidates *in, Candidates *out) {
  out->n = 0;
  for (int i = 0; i < in->n; i++)
    if (viable(STRUCT_IDS[c[1]], seed, in->pos[i].x, in->pos[i].z, c[7])) out->pos[out->n++] = in->pos[i];
  return enough(c, out);
}

#define MAX_CONDS 8
static Candidates gridCands[MAX_CONDS];
static Candidates biomeCands;

// Try `tries` random world seeds. natural = 1 samples only seeds an empty seed
// box could produce; natural = 0 samples any 64-bit seed and, when a structure
// seed passes the grid checks, tries `uppers` world seeds that share it.
// Matching world seeds go to found[0..maxFound). Returns the number found.
EXPORT(bm_find)
int bm_find(int nConds, const int *conds, int natural, int tries, int uppers, uint64_t rngSeed, uint64_t *found, int maxFound) {
  if (nConds > MAX_CONDS) nConds = MAX_CONDS;
  rngState = rngSeed;
  int nFound = 0;
  for (int t = 0; t < tries && nFound < maxFound; t++) {
    uint64_t seed = natural ? natural_seed() : sample64();
    int gridOk = 1;
    for (int i = 0; gridOk && i < nConds; i++) {
      collect(conds + COND_INTS * i, seed, &gridCands[i]);
      gridOk = enough(conds + COND_INTS * i, &gridCands[i]);
    }
    if (!gridOk) continue;
    int attempts = natural ? 1 : (uppers < 1 ? 1 : uppers);
    for (int u = 0; u < attempts && nFound < maxFound; u++) {
      uint64_t world = u == 0 ? seed : (sample64() & ~LOW48) | (seed & LOW48);
      int ok = 1;
      for (int i = 0; ok && i < nConds; i++) ok = keep_viable(conds + COND_INTS * i, world, &gridCands[i], &biomeCands);
      if (ok) found[nFound++] = world;
    }
  }
  return nFound;
}

// ---------------------------------------------------------------- memory for JS

// Scratch space JavaScript writes arguments into and reads results from.
static uint8_t scratch[1 << 17];
EXPORT(bm_scratch) uint8_t *bm_scratch(void) { return scratch; }
EXPORT(bm_scratch_size) int bm_scratch_size(void) { return (int)sizeof scratch; }
