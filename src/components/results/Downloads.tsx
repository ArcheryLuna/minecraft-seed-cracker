import { useState } from "react";
import { FileSpreadsheetIcon, FileTextIcon, FileTypeIcon, LoaderIcon } from "lucide-react";
import { downloadPdf, downloadTxt, downloadXlsx } from "@/lib/exports";
import { Button } from "@/components/ui/button";

const FORMATS = [
  { id: "txt", label: "TXT", icon: FileTextIcon, run: async (s: bigint) => downloadTxt(s) },
  { id: "pdf", label: "PDF", icon: FileTypeIcon, run: downloadPdf },
  { id: "xlsx", label: "Excel", icon: FileSpreadsheetIcon, run: downloadXlsx },
] as const;

/** Buttons to download every world seed for a structure seed. */
export function Downloads({ seed }: { seed: bigint }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      <span>All 65,536 seeds:</span>
      {FORMATS.map((f) => (
        <Button
          key={f.id}
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(f.id);
            setFailed(false);
            try {
              await f.run(seed);
            } catch (err) {
              console.error(err);
              setFailed(true);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === f.id ? <LoaderIcon data-icon="inline-start" className="animate-spin" /> : <f.icon data-icon="inline-start" />}
          {f.label}
        </Button>
      ))}
      {failed && <span className="text-destructive">Download failed. Please try again.</span>}
    </div>
  );
}
