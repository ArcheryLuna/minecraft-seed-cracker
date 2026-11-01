import { useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** An online seed map for checking biomes. */
export function seedMapUrl(seed: bigint) {
  return `https://www.chunkbase.com/apps/seed-map#seed=${seed.toString()}`;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** Copy and Map buttons for a world seed. */
export function SeedActions({ seed }: { seed: bigint }) {
  return (
    <span className="ml-auto flex items-center gap-1">
      <CopyButton text={seed.toString()} />
      <a href={seedMapUrl(seed)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ExternalLinkIcon data-icon="inline-start" />
        Map
      </a>
    </span>
  );
}
