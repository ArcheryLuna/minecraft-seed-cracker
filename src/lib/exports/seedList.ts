// Every world seed for a structure seed, and which ones are most likely.

import { likelyWorldSeeds, worldSeedFor } from "../minecraft";

const COUNT = 65536;

export interface SeedList {
  structureSeed: bigint;
  /** all world seeds, in order of their upper 16 bits */
  seeds: bigint[];
  /** seeds a blank seed box (Random.nextLong) or a typed text seed could give */
  likely: Map<bigint, "random seed" | "typed seed">;
}

export function seedList(structureSeed: bigint): SeedList {
  const seeds: bigint[] = [];
  for (let u = 0; u < COUNT; u++) seeds.push(worldSeedFor(structureSeed, u));
  const { random, likely: order } = likelyWorldSeeds(structureSeed);
  const likely = new Map(order.map((s) => [s, random.includes(s) ? ("random seed" as const) : ("typed seed" as const)]));
  return { structureSeed, seeds, likely };
}
