// Excel download in the site's colours. Seeds are stored as text (Excel numbers
// only keep 15 digits). exceljs loads only when used.

import { save } from "./save";
import { type SeedList, seedList } from "./seedList";

export async function buildXlsx(list: SeedList): Promise<ArrayBuffer> {
  const ExcelJS = ((await import("exceljs")) as unknown as { default: typeof import("exceljs") }).default;
  const argb = (h: string) => `FF${h.slice(1).toUpperCase()}`;
  const fill = (h: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: argb(h) } });
  const edge = { style: "thin" as const, color: { argb: argb("#0e0d0b") } };
  const box = { top: edge, left: edge, bottom: edge, right: edge };
  // Workbooks can't carry fonts. "Minecraft" shows if it's installed; otherwise Excel uses its default.
  const headingFont = { name: "Minecraft", color: { argb: argb("#f2efe9") } };
  const monoFont = { name: "Consolas", size: 11, color: { argb: argb("#f2efe9") } };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Seed Cracker";
  const ws = wb.addWorksheet("World seeds", {
    properties: { tabColor: { argb: argb("#5d9e35") } },
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
  });
  ws.columns = [{ width: 10 }, { width: 28 }, { width: 18 }];

  const dark = (row: import("exceljs").Row, color = "#1c1915") => {
    for (let c = 1; c <= 3; c++) row.getCell(c).fill = fill(color);
  };

  const title = ws.addRow(["Seed Cracker"]);
  ws.mergeCells("A1:C1");
  title.height = 30;
  title.getCell(1).font = { ...headingFont, size: 18, bold: true };
  title.getCell(1).alignment = { vertical: "middle" };
  dark(title, "#5d9e35");

  const info = ws.addRow(["Structure seed", String(list.structureSeed)]);
  info.getCell(1).font = { ...headingFont, color: { argb: argb("#b4ada3") } };
  info.getCell(2).font = monoFont;
  dark(info);

  const likely = [...list.likely.entries()];
  const likelyRow = ws.addRow(["Most likely", likely.length ? likely.map(([s]) => String(s)).join(", ") : "None. Probably a typed seed."]);
  likelyRow.getCell(1).font = { ...headingFont, color: { argb: argb("#b4ada3") } };
  likelyRow.getCell(2).font = { ...monoFont, color: { argb: argb("#7fd63a") }, bold: true };
  dark(likelyRow);

  const note = ws.addRow(["65,536 seeds share these structures. Compare biomes on a map to be sure."]);
  ws.mergeCells(`A${note.number}:C${note.number}`);
  note.getCell(1).font = { ...headingFont, size: 9, color: { argb: argb("#b4ada3") } };
  dark(note);
  dark(ws.addRow([]));

  const header = ws.addRow(["#", "World seed", "Likely"]);
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { ...headingFont, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill("#5d9e35");
    cell.border = box;
    cell.alignment = { vertical: "middle" };
  });

  // Seeds as text: Excel numbers only keep 15 digits.
  list.seeds.forEach((s, i) => {
    const kind = list.likely.get(s);
    const row = ws.addRow([i + 1, String(s), kind ?? ""]);
    const bg = kind ? "#5d9e35" : i % 2 ? "#34312d" : "#2e2b28";
    for (let c = 1; c <= 3; c++) {
      const cell = row.getCell(c);
      cell.fill = fill(bg);
      cell.font = kind ? { ...monoFont, bold: true, color: { argb: "FFFFFFFF" } } : c === 2 ? monoFont : { ...monoFont, color: { argb: argb("#b4ada3") } };
    }
  });
  ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: 3 } };

  // In browsers exceljs returns a Uint8Array-like buffer, not an ArrayBuffer; copy it into one.
  const out = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  if (out instanceof ArrayBuffer) return out;
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice().buffer;
}

export async function downloadXlsx(structureSeed: bigint) {
  const buf = await buildXlsx(seedList(structureSeed));
  save(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `world-seeds-${structureSeed}.xlsx`);
}
