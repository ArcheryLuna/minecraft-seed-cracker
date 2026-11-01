import type { GpuInfo } from "@/lib/engines/gpu";
import { type Analysis, formatCount, formatDuration, type Verdict } from "@/lib/input";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface Props {
  analysis: Analysis;
  verdict: Verdict;
  etaSeconds: number;
  /** CPU workers, for the time label */
  workers: number;
  gpu: GpuInfo | null;
  useGpu: boolean;
  onUseGpuChange: (on: boolean) => void;
  running: boolean;
}

/** Advanced mode: information gathered, seeds to test, time, and the GPU switch. */
export function InfoCard({ analysis, verdict, etaSeconds, workers, gpu, useGpu, onUseGpuChange, running }: Props) {
  const infoPct = Math.min(100, (analysis.est.infoBits / 48) * 100);
  const onGpu = !!gpu && useGpu;
  return (
    <Card size="sm" className="mt-4">
      <CardHeader>
        <CardTitle>Information</CardTitle>
        <CardAction className="font-mono text-xs tabular-nums">
          {analysis.est.infoBits.toFixed(1)} <span className="text-muted-foreground">/ 48 bits</span>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={infoPct} />
        <p className={cn("text-sm", verdict.tone === "ok" ? "text-success" : verdict.tone === "warn" ? "text-warning" : "text-muted-foreground")}>
          {verdict.detail}
        </p>
        <Separator />
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Seeds to test</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{analysis.prepared.length ? formatCount(analysis.est.totalWork) : "-"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Est. time ({onGpu ? "GPU" : `${workers} threads`})</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{analysis.prepared.length ? formatDuration(etaSeconds) : "-"}</dd>
          </div>
        </dl>
        {gpu && (
          <>
            <Separator />
            <div className="flex items-center gap-2 text-xs">
              <Switch id="use-gpu" size="sm" checked={useGpu} onCheckedChange={onUseGpuChange} disabled={running} />
              <Label htmlFor="use-gpu" className="text-muted-foreground">
                Use your GPU ({gpu.vendor || "WebGPU"})
              </Label>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
