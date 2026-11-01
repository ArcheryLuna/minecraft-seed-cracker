// Run with: npx tsx scripts/test-cracker.ts [trials]
// Picks random world seeds, generates structure positions with the BigInt
// reference implementation, then cracks them with the fast path. Also checks
// close matches and a real world reported by a user.
import {
  misses,
  plan,
  planNear,
  prepare,
  searchRange,
  searchRangeReference,
  strategyCode,
  verify,
  type Observation,
  type CrackPlan,
} from "../src/lib/cracker";
import { rerollEdgeHits } from "../src/lib/cracker/testing";
import { BiomeEngine, crackerStructure, type FindCondition, structureIndex } from "../src/lib/engines/biomes";
import { WasmSearcher } from "../src/lib/engines/wasm/searcher";
import { blockToStart, getStructure, JavaRandom, makeExample, nextLongSeeds, structureChunk, structuresFor, textToSeed, type VersionId } from "../src/lib/minecraft";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function fromBlocks(version: VersionId, entries: { structureId: string; x: number; z: number }[]): Observation[] {
  return entries.map((e) => {
    const s = getStructure(version, e.structureId)!;
    return { structure: s, ...blockToStart(s, e.x, e.z) };
  });
}

/**
 * Full searches take minutes on one thread, so only search the slice that holds
 * `target`. The target's low bits must survive lifting for this to be valid.
 */
function searchSliceFor(p: CrackPlan, target: bigint) {
  const highCount = 2 ** (48 - p.lowBits);
  const ci = p.lows.indexOf(Number(target % BigInt(2 ** p.lowBits)));
  assert(ci >= 0, `low bits of ${target} were removed by lifting`);
  const t0 = performance.now();
  const found = searchRange(p.prepared, p.lowBits, p.lows, ci * highCount, (ci + 1) * highCount, p.maxMisses).map(BigInt);
  return { found, secs: (performance.now() - t0) / 1000 };
}

// Known java.util.Random outputs (new Random(12345))
{
  const r = new JavaRandom(12345n);
  const got = [r.nextInt(100), r.nextInt(100), r.nextInt(100)];
  assert(JSON.stringify(got) === "[51,80,41]", `JavaRandom nextInt mismatch: ${got}`);
  const r2 = new JavaRandom(0n);
  assert(r2.nextLong() === -4962768465676381896n, "JavaRandom nextLong mismatch");
}

// nextLong reversal
for (let i = 0; i < 20; i++) {
  const seed = new JavaRandom(BigInt(i * 7919 + 1)).nextLong();
  const cands = nextLongSeeds(BigInt.asUintN(48, seed));
  assert(cands.includes(seed), `nextLong reversal missed ${seed}`);
}
console.log("JavaRandom + nextLong reversal OK");

// Block position to start chunk
{
  const monument = getStructure("1.18+", "ocean_monument")!;
  const village = getStructure("1.18+", "village")!;
  const portal = getStructure("1.18+", "ruined_portal")!;
  const temple = getStructure("1.18+", "jungle_temple")!;
  const eq = (a: object, b: object, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)}`);
  eq(blockToStart(monument, -1329, 255), { chunkX: -83, chunkZ: 16, spanX: 0, spanZ: 0 }, "monument rounds to nearest border");
  eq(blockToStart(village, 235, -851), { chunkX: 15, chunkZ: -53, spanX: 0, spanZ: 0 }, "village rounds to nearest border");
  eq(blockToStart(portal, -1090, 2276), { chunkX: -69, chunkZ: 142, spanX: 1, spanZ: 0 }, "portal in east half also tries next chunk");
  eq(blockToStart(temple, -2985, -731), { chunkX: -187, chunkZ: -46, spanX: 0, spanZ: 0 }, "temple uses its own chunk");
}
console.log("blockToStart OK");

// The fast search (solving for candidates) must return exactly what the
// reference loop returns, in exact and close-match mode. One slice each.
{
  const seed = new JavaRandom(BigInt(Date.now() + 7)).nextLong();
  const target = BigInt.asUintN(48, seed);
  const entries = makeExample("1.18+", seed);
  const shifted = fromBlocks("1.18+", entries).map((o, i) => (i === 3 ? { ...o, chunkX: o.chunkX + 1 } : o));
  for (const [name, obs] of [["exact", fromBlocks("1.18+", entries)], ["close-match", shifted]] as const) {
    const { prepared } = prepare(obs);
    const p = name === "exact" ? plan(prepared) : planNear(prepared)!;
    const highCount = 2 ** (48 - p.lowBits);
    const ci = Math.max(0, p.lows.indexOf(Number(target % BigInt(2 ** p.lowBits))));
    const t0 = performance.now();
    const fast = searchRange(p.prepared, p.lowBits, p.lows, ci * highCount, (ci + 1) * highCount, p.maxMisses).sort((a, b) => a - b);
    const t1 = performance.now();
    const ref = searchRangeReference(p.prepared, p.lowBits, p.lows, ci * highCount, (ci + 1) * highCount, p.maxMisses).sort((a, b) => a - b);
    const t2 = performance.now();
    assert(JSON.stringify(fast) === JSON.stringify(ref), `${name}: fast search differs from reference: ${fast} vs ${ref}`);
    assert(fast.includes(Number(target)), `${name}: target not found`);
    console.log(`fast search = reference (${name}, ${fast.length} hits): ${((t1 - t0) / 1000).toFixed(2)}s vs ${((t2 - t1) / 1000).toFixed(2)}s ✔`);
  }
}

const trials = Number(process.argv[2] ?? 2);
for (let t = 0; t < trials; t++) {
  const seed = new JavaRandom(BigInt(Date.now() + t)).nextLong();
  const obs = fromBlocks("1.18+", makeExample("1.18+", seed));
  const { prepared, issues } = prepare(obs);
  assert(issues.length === 0, `issues: ${JSON.stringify(issues)}`);
  const t0 = performance.now();
  const p = plan(prepared);
  const t1 = performance.now();
  console.log(
    `seed ${seed}: lowBits=${p.lowBits} survivors=${p.lows.length} work=${p.totalWork.toExponential(2)} info=${p.infoBits.toFixed(1)} bits (lift ${(t1 - t0).toFixed(0)}ms)`,
  );
  const found = searchRange(p.prepared, p.lowBits, p.lows, 0, p.totalWork).map(BigInt);
  const t2 = performance.now();
  console.log(`  found ${found.length} in ${((t2 - t1) / 1000).toFixed(1)}s (${(p.totalWork / ((t2 - t1) / 1000) / 1e6).toFixed(1)}M/s)`);
  const target = BigInt.asUintN(48, seed);
  assert(found.includes(target), `did not find structure seed ${target}`);
  assert(found.every((f) => verify(f, obs)), "false positive slipped through");
  assert(found.flatMap(nextLongSeeds).includes(seed), "nextLong recovery failed");
  console.log(`  recovered world seed ${seed} ✔`);
}

// Close matches: move one structure by a chunk. The close-match search must
// find the real seed and blame that structure.
for (let t = 0; t < trials; t++) {
  const seed = new JavaRandom(BigInt(Date.now() + 1000 + t)).nextLong();
  const target = BigInt.asUintN(48, seed);
  const entries = makeExample("1.18+", seed);
  const bad = 1 + (t % (entries.length - 1));
  const obs = fromBlocks("1.18+", entries).map((o, i) => (i === bad ? { ...o, chunkX: o.chunkX + 1, spanX: 0 } : o));
  const { prepared, issues } = prepare(obs);
  if (issues.length) {
    console.log(`  (skipped close-match trial: shifted entry left its region)`);
    continue;
  }
  const p = planNear(prepared);
  assert(p, "no close-match plan");
  const { found, secs } = searchSliceFor(p!, target);
  console.log(`close-match seed ${seed}: maxMisses=${p!.maxMisses} survivors=${p!.lows.length}, slice ${found.length} hits in ${secs.toFixed(1)}s`);
  assert(found.includes(target), `close-match search missed ${target}`);
  const m = misses(target, obs);
  assert(m.length === 1 && m[0] === bad, `expected entry ${bad} to be blamed, got ${m}`);
  console.log(`  found real seed as a close match, blaming entry ${bad} ✔`);
}

// A real world (reported by a user): monuments and villages measured at their
// centres, ruined portals sticking out of their chunks. Must match exactly.
{
  const list: [string, number, number][] = [
    ["ocean_monument", -1329, 255], ["ocean_monument", -1024, 638], ["ocean_monument", -784, 174],
    ["ocean_monument", -417, 256], ["ocean_monument", -379, 847], ["ocean_monument", 145, 831],
    ["village", -2476, 380], ["village", -213, -411], ["village", 235, -851], ["village", -2459, 2725],
    ["ruined_portal", -2309, 2868], ["ruined_portal", -1090, 2276], ["ruined_portal", -2266, 1594], ["ruined_portal", -2364, 780],
    ["jungle_temple", -2985, -731],
  ];
  const obs = fromBlocks("1.18+", list.map(([structureId, x, z]) => ({ structureId, x, z })));
  const target = 243589975250422n;
  assert(misses(target, obs).length === 0, `real world: seed doesn't fit every entry: ${misses(target, obs)}`);
  const { prepared, issues } = prepare(obs);
  assert(issues.length === 0, `real world issues: ${JSON.stringify(issues)}`);
  const p: CrackPlan = plan(prepared);
  const { found, secs } = searchSliceFor(p, target);
  assert(found.includes(target), "real world: exact search missed the seed");
  assert(nextLongSeeds(target).includes(2722106614767293942n), "real world: world seed not recovered");
  console.log(`real world: found 2722106614767293942 exactly (slice ${secs.toFixed(1)}s, ${p.lows.length} survivors) ✔`);
}

// The WebAssembly search must return exactly what the JS search returns, in
// every strategy mode, on the block that holds the real seed.
void (async () => {
  const w = await WasmSearcher.fromBytes(readFileSync(join(__dirname, "../src/lib/engines/wasm/search.wasm")));
  const seed = new JavaRandom(BigInt(Date.now() + 99)).nextLong();
  const target = BigInt.asUintN(48, seed);
  const ex = fromBlocks("1.18+", makeExample("1.18+", seed));
  const shifted = ex.map((o, i) => (i === 2 ? { ...o, chunkX: o.chunkX + 1, spanX: 0 } : o));
  const at = (ids: [string, number, number][]) =>
    ids.map(([id, rx, rz]) => {
      const s = getStructure("1.18+", id)!;
      return { structure: s, ...structureChunk(seed, s, rx, rz) };
    });
  const scan = at([["ancient_city", 0, 0], ["ancient_city", 1, 0], ["ancient_city", -1, 2], ["ocean_monument", 0, 0], ["ocean_monument", 1, 1], ["village", 0, 0], ["village", 1, -1]]);
  const tri = at([["ocean_monument", 0, 0], ["ocean_monument", 1, 1], ["ocean_monument", -1, 0], ["woodland_mansion", 0, 0], ["ocean_monument", 2, -1], ["ocean_monument", 0, 3]]);
  const plans: [string, CrackPlan | null][] = [
    ["solve", plan(prepare(ex).prepared)],
    ["solve, close matches", planNear(prepare(shifted).prepared)],
    ["scan", plan(prepare(scan).prepared)],
    ["scan, close matches", planNear(prepare(scan).prepared, () => true)],
    ["reference loop", plan(prepare(tri).prepared)],
  ];
  for (const [name, p] of plans) {
    if (!p) continue;
    const { mode } = strategyCode(p.prepared, p.lowBits, p.maxMisses);
    const ci = p.lows.indexOf(Number(target % BigInt(2 ** p.lowBits)));
    if (ci < 0) continue; // close-match plans may drop the shifted entry's lifting
    const hLo = Math.floor(Number(target & 0xffffffn) / 2 ** p.lowBits);
    const start = mode === 0 ? ci * 2 ** (48 - p.lowBits) + Number(target >> BigInt(p.lowBits)) - 2 ** 15 : ci * 2 ** (48 - p.lowBits) + hLo * 2 ** 24;
    const end = start + (mode === 0 ? 2 ** 16 : 2 ** 24);
    assert(w.configure(p.prepared, p.lowBits, p.lows, p.maxMisses), `${name}: wasm configure failed`);
    const t0 = performance.now();
    const wa = w.search(start, end)!.sort((a, b) => a - b);
    const t1 = performance.now();
    const js = searchRange(p.prepared, p.lowBits, p.lows, start, end, p.maxMisses).sort((a, b) => a - b);
    const t2 = performance.now();
    assert(JSON.stringify(wa) === JSON.stringify(js), `${name}: wasm differs from JS: ${wa} vs ${js}`);
    assert(wa.includes(Number(target)), `${name}: wasm missed the real seed`);
    console.log(`wasm = JS (${name}, mode ${mode}): ${(t1 - t0).toFixed(0)} ms vs ${(t2 - t1).toFixed(0)} ms ✔`);
  }

  // Regression: the solver once skipped the last newHi below the reroll zone.
  // Find blocks where that candidate is a real hit and check JS and WebAssembly
  // both report it. (One village; with Z accepting everything, about 7% of
  // blocks have such a hit, so these are found quickly.)
  {
    const village = getStructure("1.18+", "village")!;
    const p = plan(prepare([{ structure: village, chunkX: 5, chunkZ: 0, spanX: 0, spanZ: 999 }]).prepared);
    const edges = rerollEdgeHits(p, 4);
    assert(edges.length === 4, "couldn't find reroll-edge blocks");
    assert(w.configure(p.prepared, p.lowBits, p.lows, p.maxMisses), "wasm configure failed");
    for (const { block, seed } of edges) {
      const start = block * 2 ** 24;
      assert(searchRange(p.prepared, p.lowBits, p.lows, start, start + 2 ** 24, 0).includes(seed), `JS missed reroll-edge seed ${seed}`);
      // ~1.3M hits per block: search it in parts that fit the WebAssembly hit buffer.
      let found = false;
      for (let q = 0; q < 64 && !found; q++) found = (w.search(start + q * 2 ** 18, start + (q + 1) * 2 ** 18) ?? []).includes(seed);
      assert(found, `wasm missed reroll-edge seed ${seed}`);
    }
    console.log("reroll-edge seeds found by JS and wasm ✔");
  }

  // Biome engine (cubiomes): structure attempts must match the cracker's grid,
  // narrowing must keep the real world seed, and every find must really fit.
  {
    const e = await BiomeEngine.fromBytes(readFileSync(join(__dirname, "../src/lib/engines/biomes/biomes.wasm")));
    for (const [grid, bv] of [["1.18+", 6], ["1.16-1.17", 0]] as const) {
      e.setVersion(bv);
      let compared = 0;
      for (const s of structuresFor(grid)) {
        const cs = crackerStructure(s.id);
        assert(cs, `biomes: no engine structure for ${s.id}`);
        for (let t = 0; t < 40; t++) {
          const seed = new JavaRandom(BigInt(t * 7919 + s.salt)).nextLong();
          const rx = (t % 7) - 3;
          const rz = ((t * 3) % 5) - 2;
          const ours = structureChunk(BigInt.asUintN(48, seed), s, rx, rz);
          const idxs = cs!.either ? [cs!.index, cs!.index + 1] : [cs!.index];
          const pos = idxs.map((i) => e.structurePos(i, seed, rx, rz)).find((q) => q);
          if (!pos) continue;
          compared++;
          assert(pos.x >> 4 === ours.chunkX && pos.z >> 4 === ours.chunkZ, `biomes: ${grid} ${s.id} region ${rx},${rz} differs from the cracker`);
        }
      }
      console.log(`biome engine grid = cracker grid (${grid}, ${compared} positions) ✔`);
    }

    const list: [string, number, number][] = [
      ["ocean_monument", -1329, 255], ["ocean_monument", -1024, 638], ["ocean_monument", -784, 174],
      ["ocean_monument", -417, 256], ["ocean_monument", -379, 847], ["ocean_monument", 145, 831],
      ["village", -2476, 380], ["village", -213, -411], ["village", 235, -851], ["village", -2459, 2725],
      ["ruined_portal", -2309, 2868], ["ruined_portal", -1090, 2276], ["ruined_portal", -2266, 1594], ["ruined_portal", -2364, 780],
      ["jungle_temple", -2985, -731],
    ];
    const structures = fromBlocks("1.18+", list.map(([structureId, x, z]) => ({ structureId, x, z }))).map((o) => ({
      ...crackerStructure(o.structure.id)!,
      regionX: Math.floor(o.chunkX / o.structure.spacing),
      regionZ: Math.floor(o.chunkZ / o.structure.spacing),
    }));
    const world = 2722106614767293942n;
    const upper = Number(BigInt.asUintN(64, world) >> 48n);
    const from = Math.max(0, upper - 1024);
    e.setVersion(6);
    const kept = e.narrow(BigInt.asUintN(48, world), structures, [], from, from + 2048);
    assert(kept.includes(upper), "biomes: narrowing dropped the real world seed");
    // A biome at a spot in the real world must also keep it, and the wrong biome must drop it.
    const here = { dim: 0 as const, x: -213, y: 64, z: -411, biome: e.biomeAt(world, 0, -213, 64, -411) };
    assert(e.narrow(BigInt.asUintN(48, world), structures, [here], upper, upper + 1).length === 1, "biomes: true biome dropped the seed");
    assert(e.narrow(BigInt.asUintN(48, world), structures, [{ ...here, biome: here.biome === 1 ? 2 : 1 }], upper, upper + 1).length === 0, "biomes: wrong biome kept the seed");
    console.log(`biome narrowing keeps the real world seed (${kept.length} of 2048 nearby kept) ✔`);

    const village = structureIndex("village");
    const hut = structureIndex("swamp_hut");
    const cases: [string, FindCondition[], boolean][] = [
      ["village near 0,0, random seeds", [{ kind: "near", structure: village, x: 0, z: 0, radius: 300, count: 1, area: 0, terrain: false }], true],
      ["2 swamp huts together", [{ kind: "group", structure: hut, x: 0, z: 0, radius: 200, count: 2, area: 3000, terrain: false }], false],
      ["village in chunk 3,5", [{ kind: "chunk", structure: village, x: 3, z: 5, radius: 0, count: 1, area: 0, terrain: false }], false],
    ];
    for (const [name, conds, natural] of cases) {
      const found = e.find(conds, { natural, tries: 50000, uppers: 64, rngSeed: 12345n, maxFound: 3 });
      assert(found.length > 0, `finder: nothing found for ${name}`);
      for (const seed of found) {
        for (const c of conds) {
          const size = e.regionSize(c.structure) * 16;
          const chunk = c.kind === "chunk";
          const reach = chunk ? 0 : c.kind === "near" ? c.radius : c.area;
          const [cx, cz] = chunk ? [c.x * 16, c.z * 16] : [c.x, c.z];
          const ok: { x: number; z: number }[] = [];
          for (let rz = Math.floor((cz - reach) / size); rz <= Math.floor((cz + reach) / size); rz++)
            for (let rx = Math.floor((cx - reach) / size); rx <= Math.floor((cx + reach) / size); rx++) {
              const p = e.structurePos(c.structure, seed, rx, rz);
              const inside = p && (chunk ? p.x >> 4 === c.x && p.z >> 4 === c.z : (p.x - cx) ** 2 + (p.z - cz) ** 2 <= reach * reach);
              if (p && inside && e.viable(c.structure, seed, p.x, p.z, c.terrain)) ok.push(p);
            }
          const pass =
            c.kind === "group" ? ok.some((a) => ok.filter((b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= c.radius ** 2).length >= c.count) : ok.length >= c.count;
          assert(pass, `finder: ${seed} doesn't meet "${name}"`);
        }
        if (natural) assert(nextLongSeeds(BigInt.asUintN(48, seed)).includes(seed), `finder: ${seed} isn't a random seed`);
      }
      console.log(`finder: ${name}: ${found.length} seeds, all checked ✔`);
    }
  }

  // Text in the seed box: numbers that fit a long are used as typed, anything
  // else goes through String.hashCode. Known Java values: "Hello" is 69609650,
  // "polygenelubricants" is Integer.MIN_VALUE.
  {
    const cases: [string, bigint | null][] = [
      ["", null], ["  ", null], ["123", 123n], [" -42 ", -42n], ["+7", 7n],
      ["9223372036854775807", 9223372036854775807n], ["-9223372036854775808", -9223372036854775808n],
      ["Hello", 69609650n], ["  Hello ", 69609650n], ["a", 97n], ["polygenelubricants", -2147483648n],
    ];
    for (const [text, want] of cases) assert((textToSeed(text)?.seed ?? null) === want, `textToSeed(${JSON.stringify(text)})`);
    assert(textToSeed("9223372036854775808")?.kind === "text", "a number too big for a long is hashed as text");
    console.log("text seeds match the game ✔");
  }

  console.log("ALL OK");
})().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
