import { useMemo } from "react";
import type { StructureConfig } from "@/lib/minecraft";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StructureIcon } from "./StructureIcon";

const DIM_LABEL: Record<StructureConfig["dimension"], string> = {
  overworld: "Overworld",
  nether: "Nether",
  end: "The End",
};

export function StructureLabel({ id, name }: { id: string; name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <StructureIcon id={id} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Structure dropdown, grouped by dimension, with icons. */
export function StructurePicker({ structures, value, onChange }: { structures: StructureConfig[]; value: string; onChange: (id: string) => void }) {
  // Labels shown in the closed picker: icon and name.
  const items = useMemo(() => Object.fromEntries(structures.map((s) => [s.id, <StructureLabel key={s.id} id={s.id} name={s.name} />])), [structures]);
  const grouped = useMemo(
    () =>
      (["overworld", "nether", "end"] as const)
        .map((d) => ({ dim: d, items: structures.filter((s) => s.dimension === d) }))
        .filter((g) => g.items.length > 0),
    [structures],
  );
  const known = structures.some((s) => s.id === value);
  return (
    <Select items={known ? items : { ...items, [value]: "Not in this version" }} value={value} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger aria-label="Structure" className="min-w-0 flex-1 basis-full sm:basis-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {grouped.map((g) => (
          <SelectGroup key={g.dim}>
            <SelectLabel>{DIM_LABEL[g.dim]}</SelectLabel>
            {g.items.map((st) => (
              <SelectItem key={st.id} value={st.id}>
                <StructureLabel id={st.id} name={st.name} />
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
