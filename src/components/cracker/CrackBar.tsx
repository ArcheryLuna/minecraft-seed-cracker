import type { CrackStatus } from "@/lib/crack";
import { formatDuration, type Verdict } from "@/lib/input";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  status: CrackStatus;
  verdict: Verdict;
  etaSeconds: number;
  advanced: boolean;
  onStart: () => void;
  onCancel: () => void;
}

/** Crack / Stop button, with the short verdict next to it in simple mode. */
export function CrackBar({ status, verdict, etaSeconds, advanced, onStart, onCancel }: Props) {
  const running = status.phase === "running";
  const canRun = verdict.tone !== "bad" && !running;
  return (
    <div className="mt-4 flex items-center gap-4">
      {status.phase === "running" ? (
        <Button variant={status.stage === "near" ? "outline" : "destructive"} size="lg" onClick={onCancel}>
          {status.stage === "near" ? "Stop looking" : "Stop"}
        </Button>
      ) : (
        <Button size="lg" disabled={!canRun} onClick={onStart}>
          Crack seed
        </Button>
      )}
      {!advanced && (
        <p className={cn("text-sm", verdict.tone === "bad" ? "text-muted-foreground" : "text-foreground")}>
          {verdict.simple}
          {verdict.tone !== "bad" && !running && <span className="text-muted-foreground"> About {formatDuration(etaSeconds)}.</span>}
        </p>
      )}
    </div>
  );
}
