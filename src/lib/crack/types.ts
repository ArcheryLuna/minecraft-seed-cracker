// Status and results of a crack, as the UI sees them.

import type { Observation } from "../cracker";

/** A structure that a close match doesn't reproduce. */
export interface Miss {
  /** index into the observations passed to start() */
  obsIndex: number;
  /** position in the user's list (Observation.row), if given */
  row?: number;
  name: string;
  /** the start chunk entered (with any span) */
  enteredChunkX: number;
  enteredChunkZ: number;
  /** where that structure would be in this seed (same region) */
  chunkX: number;
  chunkZ: number;
}

/** A seed that fits every structure except a few. */
export interface NearMatch {
  seed: bigint;
  misses: Miss[];
}

/**
 * "exact": looking for seeds that fit every structure.
 * "near": then looking for close matches that fit all structures but a few.
 */
export type Stage = "exact" | "near";

/** What a stage runs on. */
export type Device = "gpu" | "cpu";

/** Why the close-match search didn't run: not enough information to spare, or too slow. */
export type NearSkip = "unavailable" | null;

export interface Found {
  /** the structures this crack used (a snapshot, since the form can change) */
  observations: Observation[];
  found: bigint[];
  near: NearMatch[];
  /** close-match search finished */
  nearDone: boolean;
  nearSkip: NearSkip;
}

export type CrackStatus =
  | { phase: "idle" }
  | ({ phase: "running"; stage: Stage; device: Device; done: number; total: number; rate: number } & Found)
  | ({ phase: "finished"; seconds: number } & Found)
  | ({ phase: "cancelled"; stage: Stage } & Found);
