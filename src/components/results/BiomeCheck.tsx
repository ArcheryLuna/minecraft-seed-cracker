"use client";

// Narrows the 65,536 world seeds that share a structure seed, using biomes:
// every structure the player found must really generate there, plus any
// "the biome at X, Y, Z is ..." conditions they add.

import { useEffect, useMemo, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import type { Observation } from "@/lib/cracker";
import { biomePool } from "@/lib/engines/biomePool";
import { BIOME_VERSIONS, BIOMES, biomeVersionsFor, crackerStructure, type BiomeCondition, type NarrowStructure } from "@/lib/engines/biomes";
import { nextLongSeeds, type VersionId, worldSeedFor } from "@/lib/minecraft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeedActions } from "./SeedActions";

const MAX_SHOWN = 10;

interface Row {
  key: number;
  x: string;
  y: string;
  z: string;
  biome: number | null;
}

let rowKey = 0;

export function BiomeCheck({
  structureSeed,
  observations,
  version,
  exampleSeed,
  advanced,
  auto,
  likely,
}: {
  structureSeed: bigint;
  observations: Observation[];
  version: VersionId;
  exampleSeed: bigint | null;
  advanced: boolean;
  /** start checking right away (otherwise wait for a click) */
  auto: boolean;
  /** seeds the card already shows */
  likely: bigint[];
}) {
  const versions = biomeVersionsFor(version);
  const [biomeVersion, setBiomeVersion] = useState(versions[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [applied, setApplied] = useState<BiomeCondition[]>([]);
  const [result, setResult] = useState<{ key: string; uppers: number[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(auto);

  const structures = useMemo<NarrowStructure[]>(
    () =>
      observations.flatMap((o) => {
        const m = crackerStructure(o.structure.id);
        return m ? [{ ...m, regionX: Math.floor(o.chunkX / o.structure.spacing), regionZ: Math.floor(o.chunkZ / o.structure.spacing) }] : [];
      }),
    [observations],
  );

  const runKey = `${structureSeed}|${biomeVersion}|${JSON.stringify(applied)}`;
  useEffect(() => {
    if (!started) return;
    let current = true;
    biomePool()
      .narrow(biomeVersion, structureSeed, structures, applied)
      .then((uppers) => current && setResult({ key: runKey, uppers }))
      .catch((err) => {
        console.error(err);
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [started, runKey, biomeVersion, structureSeed, structures, applied]);

  const done = result?.key === runKey ? result.uppers : null;
  const random = useMemo(() => new Set(nextLongSeeds(structureSeed)), [structureSeed]);
  const seeds = (done ?? []).map((u) => worldSeedFor(structureSeed, u));
  // Seeds an empty seed box could make are the most likely; list them first.
  seeds.sort((a, b) => Number(random.has(b)) - Number(random.has(a)));

  const biomeItems = useMemo(
    () => Object.fromEntries(BIOMES.filter((b) => b.versions & (1 << biomeVersion)).map((b) => [String(b.id), b.name])),
    [biomeVersion],
  );
  const apply = () =>
    setApplied(
      rows.flatMap((r) => {
        const b = BIOMES.find((x) => x.id === r.biome);
        const [x, y, z] = [r.x, r.y, r.z].map((v) => Number.parseInt(v, 10));
        return b && [x, y, z].every(Number.isFinite) ? [{ dim: b.dim, x, y, z, biome: b.id }] : [];
      }),
    );

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Biome check</p>
        <Select
          items={Object.fromEntries(versions.map((v) => [String(v), `World made in ${BIOME_VERSIONS[v].label}`]))}
          value={String(biomeVersion)}
          onValueChange={(v) => v && setBiomeVersion(Number(v))}
        >
          <SelectTrigger size="sm" aria-label="Version the world was made in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v} value={String(v)}>
                World made in {BIOME_VERSIONS[v].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!started ? (
        <Button variant="outline" size="sm" onClick={() => setStarted(true)}>
          Check biomes to find the world seed
        </Button>
      ) : failed ? (
        <p className="text-sm text-destructive">The biome check couldn&apos;t run in this browser.</p>
      ) : done === null ? (
        <p className="text-sm text-muted-foreground">Checking biomes for all 65,536 world seeds…</p>
      ) : seeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No world seed fits these biomes. Check the version and biome entries.</p>
      ) : seeds.length === 1 && likely.includes(seeds[0]) ? (
        <p className="text-sm text-success">Biomes match the seed above. It is almost certainly yours.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {seeds.length === 1 ? "Biomes point to one world seed:" : `Biomes leave ${seeds.length.toLocaleString("en")} world seeds. Add a biome to narrow it down.`}
          </p>
          <ul className="space-y-1.5">
            {seeds.slice(0, MAX_SHOWN).map((w) => (
              <li key={w.toString()} className="flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-base">{w.toString()}</code>
                {random.has(w) && <Badge variant="secondary">random seed</Badge>}
                {exampleSeed === w && (
                  <Badge variant="outline" className="border-success/40 text-success">
                    Matches example
                  </Badge>
                )}
                <SeedActions seed={w} />
              </li>
            ))}
          </ul>
          {seeds.length > MAX_SHOWN && <p className="text-xs text-muted-foreground">{seeds.length - MAX_SHOWN} more not shown.</p>}
        </>
      )}

      {started && (advanced || rows.length > 0 || (done !== null && seeds.length > 1)) && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-2">
              <Select
                items={biomeItems}
                value={r.biome === null ? null : String(r.biome)}
                onValueChange={(v) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, biome: v ? Number(v) : null } : x)))}
              >
                <SelectTrigger className="min-w-40 flex-1" aria-label="Biome">
                  <SelectValue placeholder="Biome" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(biomeItems).map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(["x", "y", "z"] as const).map((axis) => (
                <Input
                  key={axis}
                  inputMode="numeric"
                  aria-label={axis.toUpperCase()}
                  placeholder={axis.toUpperCase()}
                  value={r[axis]}
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, [axis]: e.target.value } : x)))}
                  className="w-24 font-mono"
                />
              ))}
              <Button variant="ghost" size="icon" aria-label="Remove biome" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                <XIcon />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { key: ++rowKey, x: "", y: "64", z: "", biome: null }])}>
              <PlusIcon data-icon="inline-start" />
              Add biome at a position
            </Button>
            {rows.length > 0 && (
              <Button size="sm" onClick={apply}>
                Check biomes
              </Button>
            )}
          </div>
          {advanced && <p className="text-xs text-muted-foreground">Copy X, Y and Z from F3 where you stand. F3 also shows the biome.</p>}
        </div>
      )}
    </div>
  );
}
