import { useMemo } from "react";
import type { Observation } from "@/lib/cracker";
import { likelyWorldSeeds, type VersionId } from "@/lib/minecraft";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BiomeCheck } from "./BiomeCheck";
import { Downloads } from "./Downloads";
import { CopyButton, SeedActions } from "./SeedActions";

/** An exact match: the most likely world seed(s), and downloads for all of them. */
export function SeedCard({
  seed,
  exampleSeed,
  advanced,
  observations,
  version,
  autoBiomes,
}: {
  seed: bigint;
  exampleSeed: bigint | null;
  advanced: boolean;
  observations: Observation[];
  version: VersionId;
  autoBiomes: boolean;
}) {
  const { random, likely } = useMemo(() => likelyWorldSeeds(seed), [seed]);

  return (
    <Card>
      {advanced && (
        <CardHeader className="border-b">
          <CardDescription>Structure seed (lower 48 bits)</CardDescription>
          <CardTitle className="break-all font-mono">{seed.toString()}</CardTitle>
          <CardAction>
            <CopyButton text={seed.toString()} />
          </CardAction>
        </CardHeader>
      )}
      <CardContent className="space-y-2">
        {advanced && <p className="text-sm font-medium">Most likely world seed</p>}
        {likely.length > 0 ? (
          <ul className="space-y-2">
            {likely.map((w) => (
              <li key={w.toString()} className="flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-base">{w.toString()}</code>
                {advanced && <Badge variant="secondary">{random.includes(w) ? "random seed" : "typed seed"}</Badge>}
                {exampleSeed === w && (
                  <Badge variant="outline" className="border-success/40 text-success">
                    Matches example
                  </Badge>
                )}
                <SeedActions seed={w} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {advanced ? "No random seed fits, so the world probably used a typed seed." : "Probably a typed seed. The biome check below can find it."}
          </p>
        )}
        {advanced && <p className="pt-1 text-xs leading-relaxed text-muted-foreground">65,536 seeds share these structures. The biome check below narrows them down.</p>}
        <BiomeCheck structureSeed={seed} observations={observations} version={version} exampleSeed={exampleSeed} advanced={advanced} auto={autoBiomes} likely={likely} />
      </CardContent>
      <CardFooter className="flex-wrap gap-2 text-xs text-muted-foreground">
        {!advanced && (
          <span>
            Structure seed <code className="font-mono">{seed.toString()}</code>
          </span>
        )}
        <Downloads seed={seed} />
      </CardFooter>
    </Card>
  );
}
