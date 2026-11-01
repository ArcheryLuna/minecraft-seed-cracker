"use client";

import { useState } from "react";
import { plan, planNear, prepare, searchRange, type CrackPlan, type Observation } from "@/lib/cracker";
import { rerollEdgeHits } from "@/lib/cracker/testing";
import { workerCount } from "@/lib/engines/cpuPool";
import { GpuSearcher } from "@/lib/engines/gpu";
import { WasmSearcher, wasmUrl } from "@/lib/engines/wasm";
import { blockToStart, getStructure, JavaRandom, makeExample } from "@/lib/minecraft";
import { Button } from "@/components/ui/button";

const BLOCK = 2 ** 24;

const USER: [string, number, number][] = [
  ["ocean_monument", -1329, 255], ["ocean_monument", -1024, 638], ["ocean_monument", -784, 174],
  ["ocean_monument", -417, 256], ["ocean_monument", -379, 847], ["ocean_monument", 145, 831],
  ["village", -2476, 380], ["village", -213, -411], ["village", 235, -851], ["village", -2459, 2725],
  ["ruined_portal", -2309, 2868], ["ruined_portal", -1090, 2276], ["ruined_portal", -2266, 1594], ["ruined_portal", -2364, 780],
  ["jungle_temple", -2985, -731],
];

function obsFrom(list: { structureId: string; x: number; z: number }[]): Observation[] {
  return list.map((e) => {
    const s = getStructure("1.18+", e.structureId)!;
    return { structure: s, ...blockToStart(s, e.x, e.z) };
  });
}

interface Case {
  name: string;
  plan: CrackPlan;
  target: bigint;
  /** blocks to compare GPU and CPU on (from the target's slice) */
  compareBlocks: number;
  /** blocks to time the GPU on; Infinity = whole plan */
  gpuBlocks: number;
}

function cases(): Case[] {
  const user = prepare(obsFrom(USER.map(([structureId, x, z]) => ({ structureId, x, z })))).prepared;
  const seed = new JavaRandom(99n).nextLong();
  const example = obsFrom(makeExample("1.18+", seed));
  const shifted = example.map((o, i) => (i === 2 ? { ...o, chunkX: o.chunkX + 1 } : o));
  const hard = prepare(
    obsFrom(USER.filter(([id]) => id === "ocean_monument" || id === "ruined_portal").map(([structureId, x, z]) => ({ structureId, x, z }))),
  ).prepared;
  return [
    { name: "your world, exact", plan: plan(user), target: 243589975250422n, compareBlocks: Infinity, gpuBlocks: Infinity },
    { name: "your world, close matches", plan: planNear(user)!, target: 243589975250422n, compareBlocks: 64, gpuBlocks: Infinity },
    { name: "example, exact", plan: plan(prepare(example).prepared), target: BigInt.asUintN(48, seed), compareBlocks: Infinity, gpuBlocks: Infinity },
    { name: "example shifted, close matches", plan: planNear(prepare(shifted).prepared)!, target: BigInt.asUintN(48, seed), compareBlocks: 16, gpuBlocks: Infinity },
    { name: "monuments + portals only (no lifting)", plan: plan(hard), target: 243589975250422n, compareBlocks: 32, gpuBlocks: 131072 },
  ];
}

const fmt = (s: number) => (s < 1 ? `${(s * 1000).toFixed(0)} ms` : s < 120 ? `${s.toFixed(1)} s` : s < 7200 ? `${(s / 60).toFixed(1)} min` : `${(s / 3600).toFixed(1)} h`);

export default function Bench() {
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<string>("");
  const [running, setRunning] = useState(false);
  const say = (line: string) => setLog((l) => [...l, line]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    console.info("gpu-bench run started");
    setLog([]);
    const gpu = await GpuSearcher.create();
    if (!gpu) {
      say("No hardware WebGPU adapter. Nothing to compare.");
      setResult(JSON.stringify({ error: "no-gpu" }));
      setRunning(false);
      return;
    }
    say(`GPU: ${gpu.info.vendor} ${gpu.info.architecture}. CPU workers: ${workerCount()}.`);
    const wasm = await WasmSearcher.fromBytes(await (await fetch(wasmUrl())).arrayBuffer());
    const rows: Record<string, unknown>[] = [];
    // Warm up: compile and first dispatch.
    const warm = cases()[2].plan;
    await gpu.search(warm.prepared, warm.lowBits, warm.lows, 0, BLOCK, warm.maxMisses);

    // ?case=<text> runs only the cases whose name contains it
    const only = new URLSearchParams(location.search).get("case");
    for (const c of cases().filter((x) => !only || x.name.includes(only))) {
      const p = c.plan;
      const totalBlocks = p.totalWork / BLOCK;
      const highCount = 2 ** (48 - p.lowBits);
      // Compare on the slice holding the target (it survives lifting), or the first blocks.
      const ci = Math.max(0, p.lows.indexOf(Number(c.target % BigInt(2 ** p.lowBits))));
      const cmpStart = c.compareBlocks === Infinity ? 0 : ci * highCount;
      const cmpBlocks = Math.min(c.compareBlocks, totalBlocks - cmpStart / BLOCK);
      const cmpEnd = cmpStart + cmpBlocks * BLOCK;

      // Correctness: GPU vs the JS search. Speed baseline: the WebAssembly search the CPU workers use.
      const cpu = searchRange(p.prepared, p.lowBits, p.lows, cmpStart, cmpEnd, p.maxMisses).sort((a, b) => a - b);
      wasm.configure(p.prepared, p.lowBits, p.lows, p.maxMisses);
      let t = performance.now();
      const wasmHits = (wasm.search(cmpStart, cmpEnd) ?? []).sort((a, b) => a - b);
      const cpuSecs = (performance.now() - t) / 1000;
      t = performance.now();
      const gpuHits = (await gpu.search(p.prepared, p.lowBits, p.lows, cmpStart, cmpEnd, p.maxMisses)).sort((a, b) => a - b);
      const gpuCmpSecs = (performance.now() - t) / 1000;
      const same = JSON.stringify(cpu) === JSON.stringify(gpuHits) && JSON.stringify(cpu) === JSON.stringify(wasmHits);

      // Time the GPU on a larger part (or all) of the plan.
      const gBlocks = Math.min(c.gpuBlocks, totalBlocks);
      t = performance.now();
      const big = await gpu.search(p.prepared, p.lowBits, p.lows, 0, gBlocks * BLOCK, p.maxMisses);
      const gpuSecs = (performance.now() - t) / 1000;

      const cpuPerBlock = cpuSecs / cmpBlocks;
      const gpuPerBlock = gpuSecs / gBlocks;
      const cpuPool = (cpuPerBlock * totalBlocks) / workerCount();
      const gpuFull = gpuPerBlock * totalBlocks;
      const row = {
        case: c.name,
        maxMisses: p.maxMisses,
        blocks: totalBlocks,
        same,
        hitsCompared: cpu.length,
        targetFound: cpu.includes(Number(c.target)) || big.includes(Number(c.target)),
        cpuOneThreadPerBlockMs: +(cpuPerBlock * 1000).toFixed(3),
        gpuPerBlockMs: +(gpuPerBlock * 1000).toFixed(3),
        cpuPoolEstimateS: +cpuPool.toFixed(3),
        gpuFullEstimateS: +gpuFull.toFixed(3),
        speedupVsPool: +(cpuPool / gpuFull).toFixed(1),
        gpuCompareRunS: +gpuCmpSecs.toFixed(3),
      };
      rows.push(row);
      say(
        `${c.name}: ${same ? "same hits" : "DIFFERENT HITS"} (${cpu.length}). Full search: CPU pool ~${fmt(cpuPool)}, GPU ~${fmt(gpuFull)} (${row.speedupVsPool}x).`,
      );
    }
    // Regression: the solver once skipped the last newHi below the reroll zone.
    // Blocks where that candidate is a real hit; the GPU must report each one.
    if (!only || "reroll edge".includes(only)) {
      const village = getStructure("1.18+", "village")!;
      const p = plan(prepare([{ structure: village, chunkX: 5, chunkZ: 9 }]).prepared);
      const edges = rerollEdgeHits(p, 5);
      let missed = 0;
      for (const { block, seed } of edges) {
        const hits = await gpu.search(p.prepared, p.lowBits, p.lows, block * BLOCK, (block + 1) * BLOCK, 0);
        if (!hits.includes(seed)) missed++;
      }
      rows.push({ case: "reroll edge", blocks: edges.length, same: missed === 0 && edges.length === 5 });
      say(`reroll edge: GPU found ${edges.length - missed} of ${edges.length} seeds on the edge of the reroll zone.`);
    }

    gpu.destroy();
    setResult(JSON.stringify(rows));
    setRunning(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="font-heading text-2xl">GPU benchmark</h1>
      <Button onClick={run} disabled={running}>
        Run benchmark
      </Button>
      <ul className="space-y-1 font-mono text-sm">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <pre id="result" className="hidden">
        {result}
      </pre>
    </div>
  );
}
