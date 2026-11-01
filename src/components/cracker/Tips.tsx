import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Where to stand for each structure type, and what makes cracking faster. */
export function Tips({ advanced }: { advanced: boolean }) {
  return (
    <Collapsible className="mt-10">
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground" />}>
        Tips
        <ChevronDownIcon data-icon="inline-end" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {advanced ? (
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Stand where this list says, then copy your F3 position.</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <span className="text-foreground">Temples, huts, igloos, ocean ruins</span>: the north-west corner (smallest X and Z).
              </li>
              <li>
                <span className="text-foreground">Ocean monuments</span>: top of the middle tower. We round to the nearest chunk.
              </li>
              <li>
                <span className="text-foreground">Villages, outposts, ancient cities, trail ruins, trial chambers</span>: the bell or centre piece.
              </li>
              <li>
                <span className="text-foreground">Ruined portals</span>: the portal frame. We also try the next chunk over.
              </li>
              <li>
                <span className="text-foreground">Woodland mansions</span>: the middle of the building.
              </li>
            </ul>
            <p>No exact match? Close matches show which entries don&apos;t fit.</p>
            <p>Temples, huts, igloos, outposts, shipwrecks, ocean ruins and villages make it much faster.</p>
          </div>
        ) : (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>For villages, use the bell. For monuments, use the top of the middle tower.</li>
            <li>For temples, huts, igloos and ocean ruins, use the north-west corner.</li>
            <li>For mansions, use the middle of the building.</li>
            <li>For ruined portals, use the portal frame.</li>
            <li>Temples, huts, igloos, shipwrecks, ocean ruins and villages make it much faster.</li>
            <li>No exact match? Close matches show which entries don&apos;t fit.</li>
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
