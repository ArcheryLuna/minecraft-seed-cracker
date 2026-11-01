/// <reference lib="webworker" />
// Builds seed list downloads (PDF, Excel) off the main thread.
// Import the builders directly, not lib/exports: its client module starts this worker.
import { buildPdf } from "@/lib/exports/pdf";
import { fetchBytes } from "@/lib/exports/save";
import { seedList } from "@/lib/exports/seedList";
import { buildXlsx } from "@/lib/exports/xlsx";

export type ExportIn = { id: number; format: "pdf" | "xlsx"; seed: string };
export type ExportOut = { id: number; bytes: ArrayBuffer } | { id: number; error: string };

self.onmessage = async (e: MessageEvent<ExportIn>) => {
  const { id, format, seed } = e.data;
  try {
    const list = seedList(BigInt(seed));
    let bytes: ArrayBuffer;
    if (format === "pdf") {
      const [heading, mono, grass] = await Promise.all([
        fetchBytes(new URL("../lib/exports/pdf-fonts/minecraft-regular.ttf", import.meta.url)),
        fetchBytes(new URL("../lib/exports/pdf-fonts/jetbrains-mono-regular.ttf", import.meta.url)),
        fetchBytes(new URL("/textures/grass-edge.png", self.location.origin)),
      ]);
      const out = await buildPdf(list, { heading, mono, grass });
      bytes = out.slice().buffer;
    } else {
      bytes = await buildXlsx(list);
    }
    (self as unknown as Worker).postMessage({ id, bytes } satisfies ExportOut, [bytes]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies ExportOut);
  }
};
