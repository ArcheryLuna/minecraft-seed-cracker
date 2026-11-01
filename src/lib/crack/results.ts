// Collects the seeds a crack finds. Every hit from a worker or the GPU is
// re-checked with the reference implementation, then sorted into exact matches
// and close matches (seeds that miss a few allowed observations).

import { type CrackPlan, misses, type Observation } from "../cracker";
import { floorDiv, structureChunk } from "../minecraft";
import type { NearMatch } from "./types";

export function createResults(obs: Observation[]) {
  const found: bigint[] = [];
  const near: NearMatch[] = [];
  const seen = new Set<bigint>();
  // For the close-match stage: which observations may miss (by index into `obs`) and how many.
  const droppable = obs.map(() => false);
  let maxMisses = 0;

  return {
    found,
    near,

    /** Allow the misses a close-match plan was made for. */
    allowMisses(plan: CrackPlan) {
      maxMisses = plan.maxMisses;
      for (const q of plan.prepared) droppable[q.index] = !!q.droppable;
    },

    /** Check a 48-bit structure seed and record it if it's a new match. Returns true if it was recorded. */
    accept(s: number, allowNear: boolean): boolean {
      const b = BigInt(s);
      if (seen.has(b)) return false;
      const m = misses(b, obs);
      if (m.length === 0) {
        seen.add(b);
        found.push(b);
        return true;
      }
      if (!allowNear || m.length > maxMisses || !m.every((i) => droppable[i])) return false;
      seen.add(b);
      near.push({
        seed: b,
        misses: m.map((i) => {
          const o = obs[i];
          const st = o.structure;
          const c = structureChunk(b, st, floorDiv(o.chunkX, st.spacing), floorDiv(o.chunkZ, st.spacing));
          return { obsIndex: i, row: o.row, name: st.name, enteredChunkX: o.chunkX, enteredChunkZ: o.chunkZ, chunkX: c.chunkX, chunkZ: c.chunkZ };
        }),
      });
      return true;
    },
  };
}

export type Results = ReturnType<typeof createResults>;
