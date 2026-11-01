import { useMemo } from "react";
import type { NearMatch } from "@/lib/crack";
import { type CoordMode, formatPos } from "@/lib/input";
import { likelyWorldSeeds } from "@/lib/minecraft";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton, SeedActions } from "./SeedActions";

/** A close match: the seed, and which structures don't fit and where they'd be. */
export function NearCard({ match, exampleSeed, advanced, mode }: { match: NearMatch; exampleSeed: bigint | null; advanced: boolean; mode: CoordMode }) {
  const { likely } = useMemo(() => likelyWorldSeeds(match.seed), [match.seed]);

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        {likely.length > 0 ? (
          likely.map((w) => (
            <div key={w.toString()} className="flex flex-wrap items-center gap-2">
              <code className="break-all font-mono text-base">{w.toString()}</code>
              <Badge variant="outline" className="border-warning/40 text-warning">
                Close match
              </Badge>
              {exampleSeed === w && (
                <Badge variant="outline" className="border-success/40 text-success">
                  Matches example
                </Badge>
              )}
              <SeedActions seed={w} />
            </div>
          ))
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Typed seed, structure seed</span>
            <code className="font-mono text-sm">{match.seed.toString()}</code>
            <Badge variant="outline" className="border-warning/40 text-warning">
              Close match
            </Badge>
            <span className="ml-auto">
              <CopyButton text={match.seed.toString()} />
            </span>
          </div>
        )}
        <ul className="space-y-1 text-sm text-muted-foreground">
          {match.misses.map((m) => (
            <li key={m.obsIndex}>
              <span className="text-foreground">{m.name}</span>
              {m.row !== undefined && ` (entry ${m.row + 1})`} doesn&apos;t fit. Here it would be at{" "}
              <span className="font-mono text-foreground">{formatPos(m.chunkX, m.chunkZ, mode)}</span>
              {advanced && (
                <>
                  {" "}
                  instead of <span className="font-mono">{formatPos(m.enteredChunkX, m.enteredChunkZ, mode)}</span>
                </>
              )}
              .
            </li>
          ))}
        </ul>
        {advanced && likely.length > 0 && <p className="font-mono text-xs text-muted-foreground">structure seed {match.seed.toString()}</p>}
      </CardContent>
    </Card>
  );
}
