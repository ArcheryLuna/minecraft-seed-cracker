// Renders a structure's pixel-art icon (see structureIcons.ts) as an SVG.
import { type Icon, ICONS } from "./structureIcons";

/** Merge runs of same-coloured pixels on each row into single rects. */
function rects(icon: Icon) {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  icon.rows.forEach((row, y) => {
    let x = 0;
    while (x < 12) {
      const ch = row[x] ?? ".";
      let end = x + 1;
      while (end < 12 && (row[end] ?? ".") === ch) end++;
      const fill = icon.palette[ch];
      if (ch !== "." && fill) out.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  return out;
}

const RECTS: Record<string, ReturnType<typeof rects>> = Object.fromEntries(Object.entries(ICONS).map(([id, icon]) => [id, rects(icon)]));

export function StructureIcon({ id, size = 18 }: { id: string; size?: number }) {
  const r = RECTS[id];
  if (!r) return <span aria-hidden style={{ width: size, height: size }} className="inline-block shrink-0" />;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {r.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.fill} />
      ))}
    </svg>
  );
}
