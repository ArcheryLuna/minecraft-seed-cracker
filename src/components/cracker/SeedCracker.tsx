"use client";

// The page: the structure form, the crack controls and the results. Holds the
// state and hands plain props to the pieces.

import { useMemo, useState } from "react";
import { useCracker, workerCount } from "@/lib/crack";
import { analyze, blankEntry, type Entry, entryFrom, useSavedForm, verdictFor } from "@/lib/input";
import { makeExample, randomSeed, structuresFor, type VersionId } from "@/lib/minecraft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Results } from "@/components/results/Results";
import { CrackBar } from "./CrackBar";
import { CrackProgress } from "./CrackProgress";
import { Header } from "./Header";
import { InfoCard } from "./InfoCard";
import { StructuresCard } from "./StructuresCard";
import { Tips } from "./Tips";

export default function SeedCracker() {
  const { version, setVersion, mode, setMode, advanced, setAdvanced, entries, setEntries, hydrated } = useSavedForm();
  const [exampleSeed, setExampleSeed] = useState<bigint | null>(null);
  const { status, start, cancel, reset, gpu, useGpu, setUseGpu, etaSeconds: estimateSeconds } = useCracker();

  const structures = useMemo(() => structuresFor(version), [version]);
  const byId = useMemo(() => new Map(structures.map((s) => [s.id, s])), [structures]);
  const analysis = useMemo(() => analyze(entries, byId, mode), [entries, byId, mode]);
  const etaSeconds = useMemo(() => estimateSeconds(analysis.prepared), [estimateSeconds, analysis.prepared]);
  const verdict = verdictFor(analysis, etaSeconds);
  const running = status.phase === "running";

  const update = (key: string, patch: Partial<Entry>) => setEntries((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  const remove = (key: string) => setEntries((es) => (es.length > 1 ? es.filter((e) => e.key !== key) : [blankEntry()]));

  const loadExample = () => {
    const seed = randomSeed();
    setMode("block");
    setEntries(makeExample(version, seed).map(entryFrom));
    setExampleSeed(seed);
    reset();
  };

  const showResults =
    status.phase === "finished" || status.phase === "cancelled" || (status.phase === "running" && (status.stage === "near" || status.found.length > 0));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8">
      <Header advanced={advanced} onAdvancedChange={setAdvanced} onExample={loadExample} />

      {exampleSeed !== null && (
        <Alert className="mb-4">
          <AlertDescription>
            Example loaded. The answer should be <code className="font-mono text-foreground">{exampleSeed.toString()}</code>.
          </AlertDescription>
        </Alert>
      )}

      <StructuresCard
        advanced={advanced}
        version={version}
        onVersionChange={(v: VersionId) => {
          setVersion(v);
          reset();
        }}
        mode={mode}
        onModeChange={setMode}
        structures={structures}
        entries={entries}
        analysis={analysis}
        onUpdate={update}
        onRemove={remove}
        onAdd={() => setEntries((es) => [...es, blankEntry(es[es.length - 1]?.structureId ?? "village")])}
        onPaste={(parsed) => setEntries((es) => [...es.filter((e) => e.x.trim() || e.z.trim()), ...parsed])}
        onClear={() => {
          setEntries([blankEntry()]);
          setExampleSeed(null);
          reset();
        }}
      />

      {advanced && (
        <InfoCard
          analysis={analysis}
          verdict={verdict}
          etaSeconds={etaSeconds}
          workers={hydrated ? workerCount() : 4}
          gpu={gpu}
          useGpu={useGpu}
          onUseGpuChange={setUseGpu}
          running={running}
        />
      )}

      <CrackBar
        status={status}
        verdict={verdict}
        etaSeconds={etaSeconds}
        advanced={advanced}
        onStart={() => start(analysis.prepared, analysis.obs)}
        onCancel={cancel}
      />

      {status.phase !== "idle" && <CrackProgress status={status} advanced={advanced} />}

      {showResults && <Results status={status} exampleSeed={exampleSeed} advanced={advanced} mode={mode} version={version} />}

      <Tips advanced={advanced} />

      {advanced && <p className="mt-10 text-xs text-muted-foreground">Java Edition only. Not made by Mojang or Microsoft.</p>}
    </div>
  );
}
