import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function Header({ advanced, onAdvancedChange, onExample }: { advanced: boolean; onAdvancedChange: (on: boolean) => void; onExample: () => void }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3.5">
        <div>
          <h1 className="pixel-shadow whitespace-nowrap font-heading text-3xl font-bold leading-none">Seed Cracker</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Find your Minecraft Java seed from structures you found.
            {advanced && " Runs in your browser."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
        <div className="flex items-center gap-2">
          <Switch id="advanced" checked={advanced} onCheckedChange={onAdvancedChange} />
          <Label htmlFor="advanced" className="text-muted-foreground">
            Advanced mode
          </Label>
        </div>
        <Button variant="outline" size="sm" onClick={onExample}>
          Try example
        </Button>
      </div>
    </header>
  );
}
