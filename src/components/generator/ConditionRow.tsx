"use client";

import { XIcon } from "lucide-react";
import { BIOME_STRUCTURES } from "@/lib/engines/biomes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StructureIcon } from "@/components/cracker/StructureIcon";
import { type CondRow, KIND_LABELS, type Kind } from "./conditions";

/** Icon ids from structureIcons.ts; fortresses and bastions share one. */
export const iconFor = (key: string) => (key === "fortress" || key === "bastion" ? "nether_complex" : key);

function Field({ label, value, onChange, width = "w-24" }: { label: string; value: string; onChange: (v: string) => void; width?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} className={`${width} font-mono`} />
    </label>
  );
}

export function ConditionRow({
  row,
  structures,
  error,
  onChange,
  onRemove,
}: {
  row: CondRow;
  /** [index, structure] pairs available in the chosen version */
  structures: readonly (readonly [number, (typeof BIOME_STRUCTURES)[number]])[];
  error: string | null;
  onChange: (patch: Partial<CondRow>) => void;
  onRemove: (() => void) | null;
}) {
  const structureItems = Object.fromEntries(structures.map(([i, s]) => [String(i), s.name]));
  const set = (k: keyof CondRow) => (v: string) => onChange({ [k]: v });
  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select items={structureItems} value={String(row.structure)} onValueChange={(v) => v && onChange({ structure: Number(v) })}>
          <SelectTrigger className="min-w-48 flex-1" aria-label="Structure">
            <StructureIcon id={iconFor(BIOME_STRUCTURES[row.structure].key)} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {structures.map(([i, s]) => (
              <SelectItem key={i} value={String(i)}>
                <StructureIcon id={iconFor(s.key)} />
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={KIND_LABELS} value={row.kind} onValueChange={(v) => v && onChange({ kind: v as Kind })}>
          <SelectTrigger aria-label="Condition">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onRemove && (
          <Button variant="ghost" size="icon" aria-label="Remove condition" onClick={onRemove}>
            <XIcon />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {row.kind === "chunk" ? (
          <>
            <Field label="Chunk X" value={row.x} onChange={set("x")} />
            <Field label="Chunk Z" value={row.z} onChange={set("z")} />
          </>
        ) : row.kind === "near" ? (
          <>
            <Field label="At least" value={row.count} onChange={set("count")} width="w-16" />
            <Field label="Within blocks" value={row.radius} onChange={set("radius")} />
            <Field label="Of X" value={row.x} onChange={set("x")} />
            <Field label="Z" value={row.z} onChange={set("z")} />
          </>
        ) : (
          <>
            <Field label="At least" value={row.count} onChange={set("count")} width="w-16" />
            <Field label="Within blocks of each other" value={row.radius} onChange={set("radius")} width="w-32" />
            <Field label="Up to blocks from" value={row.area} onChange={set("area")} />
            <Field label="X" value={row.x} onChange={set("x")} />
            <Field label="Z" value={row.z} onChange={set("z")} />
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
