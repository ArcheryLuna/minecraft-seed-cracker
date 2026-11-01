"use client";

// React hook that runs a crack: the exact search, then the close-match search,
// each on the GPU when one is available and turned on, otherwise on the CPU
// workers. If the GPU fails, the stage is redone on the CPU.

import { useCallback, useEffect, useRef, useState } from "react";
import { type CrackPlan, type Observation, plan, planNear, type PreparedObs } from "../cracker";
import { CpuPool } from "../engines/cpuPool";
import { gpuLayout, type GpuInfo } from "../engines/gpu";
import { GpuClient } from "../engines/gpuClient";
import { createResults } from "./results";
import { exactSeconds, nearFits } from "./speed";
import type { CrackStatus, Device, NearSkip, Stage } from "./types";

export function useCracker() {
  const [status, setStatus] = useState<CrackStatus>({ phase: "idle" });
  const cpu = useRef<CpuPool | null>(null);
  const gpuClient = useRef<GpuClient | null>(null);
  const cancelled = useRef(false);
  // Each start() gets a new id; work from older runs checks it and stops.
  const runId = useRef(0);

  // GPU: found once on mount; the user can turn it off in advanced mode.
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [useGpu, setUseGpuState] = useState(true);
  const useGpuRef = useRef(true);
  const setUseGpu = useCallback((on: boolean) => {
    useGpuRef.current = on;
    setUseGpuState(on);
  }, []);

  useEffect(() => {
    cpu.current = new CpuPool();
    gpuClient.current = new GpuClient(setGpu);
    return () => {
      cpu.current?.stop();
      gpuClient.current?.terminate();
    };
  }, []);

  /** Whether the GPU is present, working and turned on. */
  const gpuOn = useCallback(() => !!gpuClient.current?.available && useGpuRef.current, []);

  const stop = useCallback(() => {
    cpu.current?.stop();
    gpuClient.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    runId.current++;
    stop();
    setStatus((s) =>
      s.phase === "running"
        ? { phase: "cancelled", stage: s.stage, observations: s.observations, found: s.found, near: s.near, nearDone: false, nearSkip: s.nearSkip }
        : s,
    );
  }, [stop]);

  /** Estimated seconds for the exact search, on the GPU if it will be used. */
  const etaSeconds = useCallback((prepared: PreparedObs[]) => exactSeconds(prepared, !!gpu && useGpu), [gpu, useGpu]);

  const start = useCallback(
    (prepared: PreparedObs[], obs: Observation[]) => {
      stop();
      cancelled.current = false;
      const run = ++runId.current;
      const live = () => !cancelled.current && runId.current === run;
      const startedAt = performance.now();
      const results = createResults(obs);
      let nearSkip: NearSkip = null;
      const snapshot = (nearDone: boolean) => ({ observations: obs, found: [...results.found], near: [...results.near], nearDone, nearSkip });

      const finish = (nearDone: boolean) => {
        stop();
        setStatus({ phase: "finished", seconds: (performance.now() - startedAt) / 1000, ...snapshot(nearDone) });
      };

      // Progress for one stage: accepts hits and updates the status, throttled
      // (immediately when a hit is new).
      const progress = (stage: Stage, device: Device, total: number) => {
        const stageStart = performance.now();
        let lastUi = 0;
        const push = (done: number, force: boolean) => {
          const now = performance.now();
          if (!force && now - lastUi < 150) return;
          lastUi = now;
          const secs = (now - stageStart) / 1000;
          setStatus({ phase: "running", stage, device, done, total, rate: secs > 0 ? done / secs : 0, ...snapshot(false) });
        };
        push(0, true);
        return (done: number, hits: number[]) => {
          if (!live()) return;
          let fresh = false;
          for (const s of hits) fresh = results.accept(s, stage === "near") || fresh;
          push(done, fresh);
        };
      };

      const runOnCpu = (stage: Stage, p: CrackPlan, onDone: () => void) => {
        cpu.current!.run(p, { onProgress: progress(stage, "cpu", p.totalWork), onDone: () => live() && onDone() });
      };

      // If the GPU fails, turn it off for this session and redo the stage on
      // the CPU (hits already found are kept; duplicates are skipped).
      const runOnGpu = (stage: Stage, p: CrackPlan, onDone: () => void) => {
        gpuClient.current!.run(p, {
          onProgress: progress(stage, "gpu", p.totalWork),
          onDone: () => live() && onDone(),
          onError: (message) => {
            if (!live()) return;
            console.warn("GPU search failed, using the CPU:", message);
            gpuClient.current!.disable();
            setGpu(null);
            runOnCpu(stage, p, onDone);
          },
        });
      };

      const runStage = (stage: Stage, p: CrackPlan, onDone: () => void) => {
        if (gpuOn() && gpuLayout(p.prepared, p.lowBits, p.maxMisses)) runOnGpu(stage, p, onDone);
        else runOnCpu(stage, p, onDone);
      };

      runStage("exact", plan(prepared), () => {
        // Close-match budget: by time on whichever device will run it.
        const np = planNear(prepared, nearFits(gpuOn()));
        if (!np) {
          nearSkip = "unavailable";
          return finish(false);
        }
        results.allowMisses(np);
        runStage("near", np, () => finish(true));
      });
    },
    [stop, gpuOn],
  );

  const reset = useCallback(() => {
    cancel();
    setStatus({ phase: "idle" });
  }, [cancel]);

  return { status, start, cancel, reset, gpu, useGpu, setUseGpu, etaSeconds };
}
