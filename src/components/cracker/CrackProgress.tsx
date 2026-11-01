import type { CrackStatus } from "@/lib/crack";
import { formatCount, formatDuration } from "@/lib/input";
import { Progress } from "@/components/ui/progress";

/** Progress bar and line while cracking; a short summary afterwards. */
export function CrackProgress({ status, advanced }: { status: CrackStatus; advanced: boolean }) {
  if (status.phase === "idle") return null;
  if (status.phase !== "running") {
    return (
      <p className="mt-4 text-xs text-muted-foreground tabular-nums">
        {status.phase === "finished" ? `Done in ${formatDuration(status.seconds)}` : "Stopped"}
        {advanced && status.phase === "finished" && status.nearSkip && ". Skipped close matches. Add more structures for them."}
      </p>
    );
  }
  const pct = status.total ? (status.done / status.total) * 100 : 100;
  const eta = status.rate > 0 ? (status.total - status.done) / status.rate : 0;
  const label = (status.stage === "exact" ? "Searching" : "Looking for close matches") + (advanced && status.device === "gpu" ? " on your GPU" : "");
  return (
    <div className="mt-4 space-y-1.5">
      <Progress value={pct} className="progress-stripes" />
      <p className="text-xs text-muted-foreground tabular-nums">
        {label},{" "}
        {advanced ? `${pct.toFixed(1)}%, ${formatCount(status.rate)}/s, ${formatDuration(eta)} left` : `${pct.toFixed(0)}%, ${formatDuration(eta)} left`}
      </p>
    </div>
  );
}
