// Plain text download: one world seed per line.

import { save } from "./save";
import { type SeedList, seedList } from "./seedList";

export function buildTxt(list: SeedList) {
  return list.seeds.map(String).join("\n") + "\n";
}

export function downloadTxt(structureSeed: bigint) {
  save(buildTxt(seedList(structureSeed)), "text/plain", `world-seeds-${structureSeed}.txt`);
}
