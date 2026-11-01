// Structure placement data for Minecraft: Java Edition.
// Each "random spread" structure set places at most one attempt per region of
// `spacing` x `spacing` chunks. Within a region the start chunk offset is drawn
// from a java.util.Random seeded with:
//   regionX * 341873128712 + regionZ * 132897987541 + worldSeed + salt
// "linear" spreads use nextInt(spacing - separation) for x then z;
// "triangular" spreads average two draws per axis.

export type Spread = "linear" | "triangular";

export interface StructureConfig {
  id: string;
  name: string;
  spacing: number;
  separation: number;
  salt: number;
  spread: Spread;
  dimension: "overworld" | "nether" | "end";
  note?: string;
  /**
   * Where a player's measurement sits relative to the start chunk.
   * "corner": the structure is centred on (ocean monuments) or rotated around
   *   (villages and other jigsaw structures) the start chunk's north-west corner,
   *   so the middle of it is a few blocks from that corner: round to the nearest
   *   chunk border.
   * "spill": the structure is built from the start chunk's corner but can stick
   *   out a few blocks west or north (ruined portals). A point in the east or
   *   south half of a chunk may belong to the next chunk over.
   * Unset: the structure is built inside its start chunk.
   */
  anchor?: "corner" | "spill";
}

export type VersionId = "1.18+" | "1.16-1.17";

export const VERSIONS: { id: VersionId; label: string }[] = [
  { id: "1.18+", label: "Java 1.18 – 1.21+" },
  { id: "1.16-1.17", label: "Java 1.16 – 1.17" },
];

const common: StructureConfig[] = [
  { id: "desert_pyramid", name: "Desert Pyramid", spacing: 32, separation: 8, salt: 14357617, spread: "linear", dimension: "overworld" },
  { id: "igloo", name: "Igloo", spacing: 32, separation: 8, salt: 14357618, spread: "linear", dimension: "overworld" },
  { id: "jungle_temple", name: "Jungle Temple", spacing: 32, separation: 8, salt: 14357619, spread: "linear", dimension: "overworld" },
  { id: "swamp_hut", name: "Swamp Hut", spacing: 32, separation: 8, salt: 14357620, spread: "linear", dimension: "overworld" },
  { id: "pillager_outpost", name: "Pillager Outpost", spacing: 32, separation: 8, salt: 165745296, spread: "linear", dimension: "overworld", anchor: "corner" },
  { id: "shipwreck", name: "Shipwreck", spacing: 24, separation: 4, salt: 165745295, spread: "linear", dimension: "overworld" },
  { id: "ocean_ruin", name: "Ocean Ruin", spacing: 20, separation: 8, salt: 14357621, spread: "linear", dimension: "overworld" },
  { id: "ruined_portal", name: "Ruined Portal (Overworld)", spacing: 40, separation: 15, salt: 34222645, spread: "linear", dimension: "overworld", anchor: "spill" },
  { id: "ocean_monument", name: "Ocean Monument", spacing: 32, separation: 5, salt: 10387313, spread: "triangular", dimension: "overworld", anchor: "corner" },
  { id: "woodland_mansion", name: "Woodland Mansion", spacing: 80, separation: 20, salt: 10387319, spread: "triangular", dimension: "overworld" },
  { id: "nether_complex", name: "Nether Fortress / Bastion", spacing: 27, separation: 4, salt: 30084232, spread: "linear", dimension: "nether", note: "Fortresses and bastions share one placement grid." },
  { id: "end_city", name: "End City", spacing: 20, separation: 11, salt: 10387313, spread: "triangular", dimension: "end" },
];

const modern: StructureConfig[] = [
  { id: "village", name: "Village", spacing: 34, separation: 8, salt: 10387312, spread: "linear", dimension: "overworld", anchor: "corner" },
  { id: "ancient_city", name: "Ancient City (1.19+)", spacing: 24, separation: 8, salt: 20083232, spread: "linear", dimension: "overworld", anchor: "corner" },
  { id: "trail_ruins", name: "Trail Ruins (1.20+)", spacing: 34, separation: 8, salt: 83469867, spread: "linear", dimension: "overworld", anchor: "corner" },
  { id: "trial_chambers", name: "Trial Chambers (1.21+)", spacing: 34, separation: 12, salt: 94251327, spread: "linear", dimension: "overworld", anchor: "corner" },
];

const legacy: StructureConfig[] = [
  { id: "village", name: "Village", spacing: 32, separation: 8, salt: 10387312, spread: "linear", dimension: "overworld", anchor: "corner" },
  { id: "ruined_portal_nether", name: "Ruined Portal (Nether)", note: "In 1.18+ nether ruined portals use the overworld grid.", spacing: 25, separation: 10, salt: 34222645, spread: "linear", dimension: "nether", anchor: "spill" },
];

export function structuresFor(version: VersionId): StructureConfig[] {
  const extra = version === "1.18+" ? modern : legacy;
  return [...extra, ...common];
}

export function getStructure(version: VersionId, id: string): StructureConfig | undefined {
  return structuresFor(version).find((s) => s.id === id);
}

/** Number of distinct offsets on one axis. */
export function bound(s: StructureConfig) {
  return s.spacing - s.separation;
}

/** Probability distribution of the offset on a single axis. */
export function axisDistribution(s: StructureConfig): number[] {
  const n = bound(s);
  if (s.spread === "linear") return Array(n).fill(1 / n);
  const p = Array(n).fill(0);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) p[Math.floor((a + b) / 2)] += 1 / (n * n);
  return p;
}

/**
 * Bits of information an observed structure of this kind gives about the seed.
 * With a span the offset is only known to lie in [off, off + span].
 */
export function infoBits(s: StructureConfig, offX: number, offZ: number, spanX = 0, spanZ = 0): number {
  const p = axisDistribution(s);
  const sum = (o: number, span: number) => p.slice(o, o + span + 1).reduce((a, b) => a + b, 0);
  const px = sum(offX, spanX);
  const pz = sum(offZ, spanZ);
  if (px === 0 || pz === 0) return 0;
  return -Math.log2(px) - Math.log2(pz);
}

/**
 * Turn a measured block position into the structure's start chunk plus how many
 * chunks further east/south (0 or 1) the start could also be.
 */
export function blockToStart(s: StructureConfig, x: number, z: number) {
  if (s.anchor === "corner") return { chunkX: Math.floor((x + 8) / 16), chunkZ: Math.floor((z + 8) / 16), spanX: 0, spanZ: 0 };
  const chunkX = Math.floor(x / 16);
  const chunkZ = Math.floor(z / 16);
  if (s.anchor === "spill") {
    const mod = (v: number) => ((v % 16) + 16) % 16;
    return { chunkX, chunkZ, spanX: mod(x) >= 8 ? 1 : 0, spanZ: mod(z) >= 8 ? 1 : 0 };
  }
  return { chunkX, chunkZ, spanX: 0, spanZ: 0 };
}
