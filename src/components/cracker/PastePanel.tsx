import { useState } from "react";
import { type Entry, parseBulk } from "@/lib/input";
import type { StructureConfig } from "@/lib/minecraft";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Paste many structures at once, one per line. Closes itself when everything parsed. */
export function PastePanel({
  structures,
  advanced,
  onAdd,
  onClose,
}: {
  structures: StructureConfig[];
  advanced: boolean;
  onAdd: (entries: Entry[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const apply = () => {
    const parsed = parseBulk(text, structures);
    setErrors(parsed.errors);
    if (parsed.entries.length) {
      onAdd(parsed.entries);
      if (!parsed.errors.length) {
        setText("");
        onClose();
      }
    }
  };

  return (
    <div className="space-y-2">
      {advanced && (
        <p className="text-xs text-muted-foreground">
          One per line, like <code className="font-mono text-foreground">village 312 -1048</code>. Y values are ignored.
        </p>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        placeholder={"village 312 -1048\ndesert pyramid -560 72"}
        aria-label="Paste structures, one per line"
        className="font-mono"
      />
      {errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button size="sm" onClick={apply}>
        Add
      </Button>
    </div>
  );
}
