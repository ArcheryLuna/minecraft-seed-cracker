"use client";

import { useState } from "react";
import { DicesIcon } from "lucide-react";
import { randomSeed } from "@/lib/minecraft";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SeedActions } from "@/components/results/SeedActions";

/** A seed like the game makes when the seed box is left empty. */
export function RandomSeedCard() {
  const [seed, setSeed] = useState<bigint | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Random seed</CardTitle>
        <CardDescription>Made the same way the game does when the seed box is empty.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setSeed(randomSeed())}>
            <DicesIcon data-icon="inline-start" />
            {seed === null ? "Make one" : "Another"}
          </Button>
        </CardAction>
      </CardHeader>
      {seed !== null && (
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="break-all font-mono text-base">{seed.toString()}</code>
          <SeedActions seed={seed} />
        </CardContent>
      )}
    </Card>
  );
}
