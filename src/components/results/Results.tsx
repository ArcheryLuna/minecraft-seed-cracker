"use client";

import type { CrackStatus } from "@/lib/crack";
import type { CoordMode } from "@/lib/input";
import type { VersionId } from "@/lib/minecraft";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NearCard } from "./NearCard";
import { SeedCard } from "./SeedCard";

const MAX_SHOWN = 50;
const MAX_NEAR_SHOWN = 20;

/** Exact matches, then close matches, with a message when there's no exact match. */
export function Results({
  status,
  exampleSeed,
  advanced,
  mode,
  version,
}: {
  status: CrackStatus;
  exampleSeed: bigint | null;
  advanced: boolean;
  mode: CoordMode;
  version: VersionId;
}) {
  if (status.phase === "idle") return null;
  const found = status.found;
  const shown = found.slice(0, MAX_SHOWN);
  const near = status.near;
  const searching = status.phase === "running";
  const stillLookingForNear = searching && status.stage === "near";

  return (
    <section className="mt-8 space-y-6">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-heading text-base font-semibold">Results</h2>
          {advanced && (
            <span className="text-xs text-muted-foreground">
              {found.length} exact, {near.length} close
            </span>
          )}
        </div>

        {found.length === 0 && !(searching && status.stage === "exact") && (
          <Alert variant={near.length || stillLookingForNear ? "default" : "destructive"}>
            <AlertTitle>{status.phase === "cancelled" && status.stage === "exact" ? "Stopped before finding a match." : "No exact match found."}</AlertTitle>
            <AlertDescription>
              {near.length > 0
                ? "One of the close matches below could be your seed."
                : stillLookingForNear
                  ? "Now looking for close matches, in case an entry is a little off."
                  : advanced
                    ? "Check each entry's coordinates, structure type and game version, then try again."
                    : "Check your coordinates and try again."}
            </AlertDescription>
          </Alert>
        )}

        {shown.map((s) => (
          <SeedCard
            key={s.toString()}
            seed={s}
            exampleSeed={exampleSeed}
            advanced={advanced}
            observations={status.observations}
            version={version}
            autoBiomes={found.length <= 3}
          />
        ))}
        {found.length > MAX_SHOWN && <p className="text-sm text-muted-foreground">{found.length - MAX_SHOWN} more. Add structures to narrow it down.</p>}
      </div>

      {near.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="font-heading text-base font-semibold">Close matches</h2>
            <p className="mt-1 text-sm text-muted-foreground">These fit all but the structures listed. One could still be your seed.</p>
          </div>
          {near.slice(0, MAX_NEAR_SHOWN).map((m) => (
            <NearCard key={m.seed.toString()} match={m} exampleSeed={exampleSeed} advanced={advanced} mode={mode} />
          ))}
          {near.length > MAX_NEAR_SHOWN && <p className="text-sm text-muted-foreground">{near.length - MAX_NEAR_SHOWN} more close matches not shown.</p>}
        </div>
      )}
    </section>
  );
}
