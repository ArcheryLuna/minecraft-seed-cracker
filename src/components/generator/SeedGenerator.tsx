"use client";

// The generator page: a random seed, a seed from text, and a finder for seeds
// with structures where the player wants them.

import { FinderCard } from "./FinderCard";
import { RandomSeedCard } from "./RandomSeedCard";
import { TextSeedCard } from "./TextSeedCard";

export default function SeedGenerator() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-24 pt-8">
      <header className="mb-8">
        <div>
          <h1 className="pixel-shadow font-heading text-3xl font-bold leading-none">Seed Generator</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Make a Minecraft Java seed, or find one with the structures you want.</p>
        </div>
      </header>
      <FinderCard />
      <RandomSeedCard />
      <TextSeedCard />
    </div>
  );
}
