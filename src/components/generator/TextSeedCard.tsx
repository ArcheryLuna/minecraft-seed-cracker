"use client";

import { useState } from "react";
import { textToSeed } from "@/lib/minecraft";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SeedActions } from "@/components/results/SeedActions";

/** The number the game turns typed text into. */
export function TextSeedCard() {
  const [text, setText] = useState("");
  const result = textToSeed(text);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Text to seed</CardTitle>
        <CardDescription>See the number the game makes from words you type in the seed box.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a word or a number" aria-label="Seed text" />
        {result && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all font-mono text-base">{result.seed.toString()}</code>
            <span className="text-xs text-muted-foreground">{result.kind === "number" ? "Used as typed" : "From the text"}</span>
            <SeedActions seed={result.seed} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
