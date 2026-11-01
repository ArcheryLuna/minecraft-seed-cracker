import { useState } from "react";
import { ClipboardPasteIcon, PlusIcon } from "lucide-react";
import type { Analysis, CoordMode, Entry } from "@/lib/input";
import { type StructureConfig, VERSIONS, type VersionId } from "@/lib/minecraft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PastePanel } from "./PastePanel";
import { StructureRow } from "./StructureRow";

const VERSION_ITEMS = Object.fromEntries(VERSIONS.map((v) => [v.id, v.label]));

interface Props {
  advanced: boolean;
  version: VersionId;
  onVersionChange: (v: VersionId) => void;
  mode: CoordMode;
  onModeChange: (m: CoordMode) => void;
  structures: StructureConfig[];
  entries: Entry[];
  analysis: Analysis;
  onUpdate: (key: string, patch: Partial<Entry>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
  onPaste: (entries: Entry[]) => void;
  onClear: () => void;
}

/** The structure list: game version, coordinate type, paste box, rows. */
export function StructuresCard(props: Props) {
  const { advanced, version, mode, structures, entries, analysis } = props;
  const [pasteOpen, setPasteOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Structures
          {advanced && <Badge variant="secondary" className="font-mono">{analysis.prepared.length} usable</Badge>}
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => setPasteOpen((o) => !o)}>
            <ClipboardPasteIcon data-icon="inline-start" />
            Paste list
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select items={VERSION_ITEMS} value={version} onValueChange={(v) => v && props.onVersionChange(v as VersionId)}>
            <SelectTrigger aria-label="Game version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VERSIONS.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[mode]}
            onValueChange={(v) => v[0] && props.onModeChange(v[0] as CoordMode)}
            aria-label="Coordinate type"
          >
            <ToggleGroupItem value="block">Block coords</ToggleGroupItem>
            <ToggleGroupItem value="chunk">Chunk coords</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {pasteOpen && <PastePanel structures={structures} advanced={advanced} onAdd={props.onPaste} onClose={() => setPasteOpen(false)} />}

        <Separator />

        <ul className="space-y-3">
          {entries.map((e, i) => (
            <StructureRow
              key={e.key}
              entry={e}
              info={analysis.rowInfo[i]}
              bits={analysis.bitsByEntry.get(i)}
              structures={structures}
              advanced={advanced}
              onChange={(patch) => props.onUpdate(e.key, patch)}
              onRemove={() => props.onRemove(e.key)}
            />
          ))}
        </ul>
      </CardContent>

      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={props.onAdd}>
          <PlusIcon data-icon="inline-start" />
          Add structure
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:text-destructive" onClick={props.onClear}>
          Clear
        </Button>
      </CardFooter>
    </Card>
  );
}
