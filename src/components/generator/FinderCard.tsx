"use client";

// Finds world seeds with structures where the player wants them. Seeds are
// tried at random in the biome workers; each structure must also pass the
// biome check (and, if on, the rough terrain check).

import { useEffect, useMemo, useState } from "react";
import { PlusIcon, SearchIcon, SquareIcon } from "lucide-react";
import { biomePool, type FoundSeed } from "@/lib/engines/biomePool";
import { BIOME_STRUCTURES, BIOME_VERSIONS, biomeStructuresIn, type FindCondition } from "@/lib/engines/biomes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SeedActions } from "@/components/results/SeedActions";
import { StructureIcon } from "@/components/cracker/StructureIcon";
import { ConditionRow, iconFor } from "./ConditionRow";
import { type CondRow, newRow, toCondition } from "./conditions";

const MAX_FOUND = 10;
const MAX_CONDITIONS = 6;
const NEWEST = BIOME_VERSIONS.length - 1;
const VERSION_ITEMS = Object.fromEntries(BIOME_VERSIONS.map((v, i) => [String(i), `Java ${v.label}`]));

type Run = { phase: "idle" } | { phase: "running" | "done"; tried: number; startedAt: number; seconds: number; conds: FindCondition[] };

export function FinderCard() {
  const [version, setVersion] = useState(NEWEST);
  const [natural, setNatural] = useState(true);
  const [terrain, setTerrain] = useState(true);
  const [rows, setRows] = useState<CondRow[]>(() => [newRow()]);
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const [found, setFound] = useState<FoundSeed[]>([]);
  const [failed, setFailed] = useState(false);

  const structures = useMemo(() => biomeStructuresIn(version), [version]);
  const checked = rows.map((r) => toCondition(r, terrain, version));
  const errors = checked.map((c) => (typeof c === "string" ? c : null));
  const ready = errors.every((e) => e === null);
  const running = run.phase === "running";

  useEffect(() => () => biomePool().stop(), []);

  const changeVersion = (v: number) => {
    setVersion(v);
    // Drop structures the older version doesn't have.
    const ok = new Set(biomeStructuresIn(v).map(([i]) => i));
    setRows((rs) => rs.map((r) => (ok.has(r.structure) ? r : { ...r, structure: 0 })));
  };

  const start = async () => {
    const conds = checked as FindCondition[];
    const startedAt = performance.now();
    setFound([]);
    setFailed(false);
    setRun({ phase: "running", tried: 0, startedAt, seconds: 0, conds });
    try {
      await biomePool().find(version, conds, { natural, maxFound: MAX_FOUND }, (tried, fresh) => {
        const seconds = (performance.now() - startedAt) / 1000;
        setRun({ phase: "running", tried, startedAt, seconds, conds });
        if (fresh.length) setFound((f) => [...f, ...fresh].slice(0, MAX_FOUND));
      });
    } catch (err) {
      console.error(err);
      setFailed(true);
    }
    setRun((r) => (r.phase === "idle" ? r : { ...r, phase: "done", seconds: (performance.now() - startedAt) / 1000 }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find a seed</CardTitle>
        <CardDescription>Pick structures and where you want them. Every condition must be met.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select items={VERSION_ITEMS} value={String(version)} onValueChange={(v) => v && changeVersion(Number(v))}>
            <SelectTrigger aria-label="Game version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BIOME_VERSIONS.map((v, i) => (
                <SelectItem key={i} value={String(i)}>
                  Java {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup variant="outline" spacing={0} value={[natural ? "natural" : "any"]} onValueChange={(v) => v[0] && setNatural(v[0] === "natural")} aria-label="Seed type">
            <ToggleGroupItem value="natural">Random seeds</ToggleGroupItem>
            <ToggleGroupItem value="any">Any seed</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <Switch id="terrain" checked={terrain} onCheckedChange={setTerrain} />
            <Label htmlFor="terrain" className="text-muted-foreground">
              Check terrain
            </Label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {natural ? "Random seeds look like ones the game makes itself." : "Any seed searches all 64-bit numbers, so it finds seeds faster."}{" "}
          {terrain ? "The terrain check is rough but skips most structures that fail." : "Without the terrain check some structures may not generate."}
        </p>

        <ul className="space-y-3">
          {rows.map((r, i) => (
            <ConditionRow
              key={r.key}
              row={r}
              structures={structures}
              error={errors[i]}
              onChange={(patch) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, ...patch } : x)))}
              onRemove={rows.length > 1 ? () => setRows((rs) => rs.filter((x) => x.key !== r.key)) : null}
            />
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={rows.length >= MAX_CONDITIONS || running} onClick={() => setRows((rs) => [...rs, newRow()])}>
          <PlusIcon data-icon="inline-start" />
          Add condition
        </Button>
        {running ? (
          <Button size="sm" variant="secondary" onClick={() => biomePool().stop()}>
            <SquareIcon data-icon="inline-start" />
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={!ready} onClick={start}>
            <SearchIcon data-icon="inline-start" />
            Find seeds
          </Button>
        )}
        {run.phase !== "idle" && (
          <span className="ml-auto text-xs text-muted-foreground">
            {run.tried.toLocaleString("en")} seeds tried
            {run.seconds > 1 && `, ${Math.round(run.tried / run.seconds).toLocaleString("en")} a second`}
          </span>
        )}
      </CardFooter>

      {(run.phase !== "idle" || failed) && (
        <CardContent className="space-y-3 border-t pt-4">
          {failed ? (
            <p className="text-sm text-destructive">The search couldn&apos;t run in this browser. Try a different one.</p>
          ) : found.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {running ? "Searching. Tight conditions can take a few minutes." : "No seeds found. Try a bigger distance or fewer conditions."}
            </p>
          ) : (
            <ul className="space-y-3">
              {found.map((f) => (
                <FoundRow key={f.seed.toString()} found={f} conds={run.phase === "idle" ? [] : run.conds} />
              ))}
            </ul>
          )}
          {found.length >= MAX_FOUND && <p className="text-xs text-muted-foreground">Showing the first {MAX_FOUND}. Search again for more.</p>}
        </CardContent>
      )}
    </Card>
  );
}

function FoundRow({ found, conds }: { found: FoundSeed; conds: FindCondition[] }) {
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all font-mono text-base">{found.seed.toString()}</code>
        <SeedActions seed={found.seed} />
      </div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {conds.map((c, i) => {
          const s = BIOME_STRUCTURES[c.structure];
          const at = found.positions[i] ?? [];
          return (
            <li key={i} className="flex flex-wrap items-center gap-1.5">
              <StructureIcon id={iconFor(s.key)} size={14} />
              {s.name} at{" "}
              <span className="font-mono">
                {at
                  .slice(0, 4)
                  .map((p) => `${p.x}, ${p.z}`)
                  .join("; ")}
              </span>
              {at.length > 4 && <span>and {at.length - 4} more</span>}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
