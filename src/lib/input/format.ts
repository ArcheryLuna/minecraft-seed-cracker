// Short human-readable numbers for the UI.

export function formatDuration(s: number) {
  if (!Number.isFinite(s)) return "∞";
  if (s < 1) return "< 1 s";
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  if (s < 3.15e7 * 2) return `${Math.round(s / 86400)} days`;
  return `${(s / 3.15e7).toExponential(1)} years`;
}

export function formatCount(n: number) {
  if (n < 1e3) return n.toFixed(0);
  if (n < 1e6) return `${(n / 1e3).toFixed(1)}K`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)}M`;
  if (n < 1e12) return `${(n / 1e9).toFixed(1)}B`;
  return n.toExponential(1);
}

/** A position for messages: block coordinates (middle of the chunk) or chunk coordinates. */
export function formatPos(chunkX: number, chunkZ: number, mode: "block" | "chunk") {
  return mode === "chunk" ? `chunk ${chunkX}, ${chunkZ}` : `X ${chunkX * 16 + 8}, Z ${chunkZ * 16 + 8}`;
}
