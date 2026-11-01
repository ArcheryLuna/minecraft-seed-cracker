// Seed list downloads for the UI: PDF and Excel files are built in a worker
// (workers/export.worker.ts) so the page doesn't freeze; if the worker can't
// run, they are built on the main thread instead.
import { downloadPdf as pdfOnMain } from "./pdf";
import { save } from "./save";
import { downloadTxt } from "./txt";
import { downloadXlsx as xlsxOnMain } from "./xlsx";
import type { ExportIn, ExportOut } from "@/workers/export.worker";

export { downloadTxt };

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (msg: ExportOut) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../../workers/export.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<ExportOut>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  return worker;
}

function inWorker(format: "pdf" | "xlsx", seed: bigint): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    waiting.set(id, (msg) => ("bytes" in msg ? resolve(msg.bytes) : reject(new Error(msg.error))));
    getWorker().postMessage({ id, format, seed: seed.toString() } satisfies ExportIn);
  });
}

export async function downloadPdf(seed: bigint) {
  try {
    save(await inWorker("pdf", seed), "application/pdf", `world-seeds-${seed}.pdf`);
  } catch (err) {
    console.warn("Building the PDF in a worker failed, building it here", err);
    await pdfOnMain(seed);
  }
}

export async function downloadXlsx(seed: bigint) {
  try {
    save(await inWorker("xlsx", seed), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `world-seeds-${seed}.xlsx`);
  } catch (err) {
    console.warn("Building the workbook in a worker failed, building it here", err);
    await xlsxOnMain(seed);
  }
}
