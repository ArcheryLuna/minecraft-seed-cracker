import { XIcon } from "lucide-react";
import type { Entry, RowInfo } from "@/lib/input";
import { bound, type StructureConfig } from "@/lib/minecraft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoordInput } from "./CoordInput";
import { StructurePicker } from "./StructurePicker";

interface Props {
  entry: Entry;
  info: RowInfo;
  /** information this entry adds, in bits (advanced mode) */
  bits: number | undefined;
  structures: StructureConfig[];
  advanced: boolean;
  onChange: (patch: Partial<Entry>) => void;
  onRemove: () => void;
}

/** One structure: type, X, Z, remove, and an error or details line below. */
export function StructureRow({ entry, info, bits, structures, advanced, onChange, onRemove }: Props) {
  const s = structures.find((st) => st.id === entry.structureId);
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2">
        <StructurePicker structures={structures} value={entry.structureId} onChange={(structureId) => onChange({ structureId })} />
        <CoordInput label="X" value={entry.x} onChange={(x) => onChange({ x })} invalid={!!info.error} />
        <CoordInput label="Z" value={entry.z} onChange={(z) => onChange({ z })} invalid={!!info.error} />
        <Button variant="ghost" size="icon" aria-label="Remove" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <XIcon />
        </Button>
      </div>
      {info.error ? <p className="mt-1.5 text-xs text-destructive">{info.error}</p> : advanced && <RowDetails info={info} bits={bits} structure={s} />}
    </li>
  );
}

/** Advanced mode: the chunk and region an entry maps to, or the structure's grid. */
function RowDetails({ info, bits, structure: s }: { info: RowInfo; bits: number | undefined; structure: StructureConfig | undefined }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
      {info.chunk ? (
        <>
          <span>
            chunk {info.chunk[0]}
            {info.span![0] ? ` or ${info.chunk[0] + 1}` : ""}, {info.chunk[1]}
            {info.span![1] ? ` or ${info.chunk[1] + 1}` : ""}
          </span>
          <span>
            region {info.region![0]}, {info.region![1]}
          </span>
          {bits !== undefined && (
            <Badge variant="outline" className="border-success/40 font-mono text-success">
              +{bits.toFixed(1)} bits
            </Badge>
          )}
        </>
      ) : (
        s && (
          <span className="font-sans">
            {s.spacing}-chunk grid, {s.spread === "triangular" ? "triangular" : "uniform"} spread, {bound(s)} offsets per axis
          </span>
        )
      )}
    </div>
  );
}
