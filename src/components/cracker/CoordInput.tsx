import { Input } from "@/components/ui/input";

/** A coordinate field with its axis letter inside. */
export function CoordInput({ label, value, onChange, invalid }: { label: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  return (
    <div className="relative min-w-0 flex-1 sm:w-28 sm:flex-none">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center font-mono text-xs text-muted-foreground">{label}</span>
      <Input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-7 font-mono"
      />
    </div>
  );
}
