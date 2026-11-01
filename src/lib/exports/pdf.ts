// PDF download in the site's look: dark background, grass strip, stone panels,
// the Minecraft font for headings and JetBrains Mono for numbers. buildPdf is
// pure (it takes font and image bytes), so tests can run it in Node. pdf-lib
// loads only when used.

import { fetchBytes, save } from "./save";
import { type SeedList, seedList } from "./seedList";

export interface PdfAssets {
  /** Minecraft font as TrueType, for headings (see scripts/make-pdf-fonts.py) */
  heading: Uint8Array;
  /** JetBrains Mono as TrueType, for numbers */
  mono: Uint8Array;
  /** grass edge texture (PNG) */
  grass: Uint8Array;
}

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

export async function buildPdf(list: SeedList, assets: PdfAssets): Promise<Uint8Array> {
  const [{ PDFDocument, PDFHexString, rgb }, fontkitModule] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit")]);
  const fontkit = (fontkitModule as { default?: unknown }).default ?? fontkitModule;
  const color = (h: string) => rgb(...hex(h));
  const C = {
    page: color("#1c1915"),
    panel: color("#34312d"),
    edgeLight: color("#57534e"),
    edgeDark: color("#1a1815"),
    border: color("#0e0d0b"),
    text: color("#f2efe9"),
    muted: color("#b4ada3"),
    green: color("#7fd63a"),
    shadow: color("#000000"),
  };

  const doc = await PDFDocument.create();
  doc.setTitle(`World seeds for structure seed ${list.structureSeed}`);
  doc.setCreator("Seed Cracker");
  doc.registerFontkit(fontkit as Parameters<typeof doc.registerFontkit>[0]);
  const heading = await doc.embedFont(assets.heading, { subset: true });
  const mono = await doc.embedFont(assets.mono, { subset: true });
  // pdf-lib shapes every string with fontkit, which takes ~40 s for 65,536
  // seeds. Seeds are digits and "-" in a monospaced font, so shaping can't
  // change anything: encode each character once and join the glyph codes.
  // The first call per character still registers its glyph for subsetting.
  const encodeOne = mono.encodeText.bind(mono);
  const glyphHex = new Map<string, string>();
  mono.encodeText = (text: string) => {
    let out = "";
    for (const ch of text) {
      let h = glyphHex.get(ch);
      if (h === undefined) {
        h = encodeOne(ch).toString().slice(1, -1);
        glyphHex.set(ch, h);
      }
      out += h;
    }
    return PDFHexString.of(out);
  };
  const grass = await doc.embedPng(assets.grass);

  const W = 595.28;
  const H = 841.89;
  const M = 40; // side margin
  const GRASS = 24;
  const COLS = 4;
  const SIZE = 7.6;
  const LINE = 10.5;
  const PAD = 12;

  const drawPage = () => {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.page });
    for (let x = 0; x < W; x += GRASS) page.drawImage(grass, { x, y: H - GRASS, width: GRASS, height: GRASS });
    return page;
  };
  type Page = ReturnType<typeof drawPage>;

  // Stone panel with a bevel: light top-left edge, dark bottom-right edge.
  const panel = (page: Page, x: number, y: number, w: number, h: number) => {
    page.drawRectangle({ x: x - 2, y: y - 2, width: w + 4, height: h + 4, color: C.border });
    page.drawRectangle({ x, y, width: w, height: h, color: C.panel });
    page.drawRectangle({ x, y: y + h - 2, width: w, height: 2, color: C.edgeLight });
    page.drawRectangle({ x, y, width: 2, height: h, color: C.edgeLight });
    page.drawRectangle({ x, y, width: w, height: 2, color: C.edgeDark });
    page.drawRectangle({ x: x + w - 2, y, width: 2, height: h, color: C.edgeDark });
  };
  // Heading text with a hard drop shadow, like the site's titles.
  const shadowed = (page: Page, text: string, x: number, y: number, size: number, col = C.text) => {
    page.drawText(text, { x: x + size / 10, y: y - size / 10, size, font: heading, color: C.shadow, opacity: 0.6 });
    page.drawText(text, { x, y, size, font: heading, color: col });
  };

  // ---- first page header
  const first = drawPage();
  let y = H - GRASS - 52;
  shadowed(first, "Seed Cracker", M, y, 26);
  y -= 24;
  first.drawText("All world seeds for structure seed", { x: M, y, size: 11, font: heading, color: C.muted });
  first.drawText(String(list.structureSeed), {
    x: M + heading.widthOfTextAtSize("All world seeds for structure seed ", 11),
    y,
    size: 11,
    font: mono,
    color: C.text,
  });

  // likely seeds panel
  const likelyLines = [...list.likely.entries()];
  const likelyH = PAD * 2 + 16 + Math.max(1, likelyLines.length) * 15;
  y -= 18 + likelyH;
  panel(first, M, y, W - 2 * M, likelyH);
  let ly = y + likelyH - PAD - 11;
  shadowed(first, "Most likely world seed", M + PAD, ly, 11);
  ly -= 18;
  if (likelyLines.length === 0) {
    first.drawText("No random seed fits, so the world probably used a typed seed.", { x: M + PAD, y: ly, size: 9, font: heading, color: C.muted });
  }
  for (const [seed, kind] of likelyLines) {
    first.drawText(String(seed), { x: M + PAD, y: ly, size: 11, font: mono, color: C.green });
    first.drawText(kind, { x: M + PAD + mono.widthOfTextAtSize(String(seed), 11) + 10, y: ly + 1, size: 8, font: heading, color: C.muted });
    ly -= 15;
  }
  y -= 26;
  first.drawText("65,536 seeds share these structures. Compare biomes on a map to be sure.", {
    x: M,
    y: y + 8,
    size: 8.5,
    font: heading,
    color: C.muted,
  });

  // ---- seed columns, page after page
  const pages: Page[] = [first];
  let index = 0;
  let top = y - 10; // top of the seed panel on the current page
  let page = first;
  const bottom = 46;
  while (index < list.seeds.length) {
    const maxRows = Math.floor((top - bottom - PAD * 2) / LINE);
    // On the last page, spread what's left evenly over the columns and shrink the panel to fit.
    const left = list.seeds.length - index;
    const rows = left < maxRows * COLS ? Math.ceil(left / COLS) : maxRows;
    const panelH = left < maxRows * COLS ? rows * LINE + PAD * 2 : top - bottom;
    panel(page, M, top - panelH, W - 2 * M, panelH);
    const colW = (W - 2 * M - PAD * 2) / COLS;
    for (let c = 0; c < COLS && index < list.seeds.length; c++) {
      const chunk = list.seeds.slice(index, index + rows);
      // One text block per column; likely seeds are left blank and drawn in green on top.
      const lines = chunk.map((s) => (list.likely.has(s) ? "" : String(s)));
      const x = M + PAD + c * colW;
      const textTop = top - PAD - SIZE;
      page.drawText(lines.join("\n"), { x, y: textTop, size: SIZE, font: mono, color: C.text, lineHeight: LINE });
      chunk.forEach((s, r) => {
        if (list.likely.has(s)) page.drawText(String(s), { x, y: textTop - r * LINE, size: SIZE, font: mono, color: C.green });
      });
      index += chunk.length;
    }
    if (index < list.seeds.length) {
      page = drawPage();
      pages.push(page);
      const hy = H - GRASS - 30;
      shadowed(page, "Seed Cracker", M, hy, 13);
      const label = String(list.structureSeed);
      page.drawText(label, { x: W - M - mono.widthOfTextAtSize(label, 9), y: hy + 1, size: 9, font: mono, color: C.muted });
      top = hy - 16;
    }
  }

  // page numbers
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${pages.length}`;
    p.drawText(label, { x: W / 2 - mono.widthOfTextAtSize(label, 8) / 2, y: 24, size: 8, font: mono, color: C.muted });
  });

  return doc.save();
}

export async function downloadPdf(structureSeed: bigint) {
  const [heading, mono, grass] = await Promise.all([
    // TrueType copies: pdf-lib can't embed WOFF2 and mishandles CFF fonts.
    fetchBytes(new URL("./pdf-fonts/minecraft-regular.ttf", import.meta.url)),
    fetchBytes(new URL("./pdf-fonts/jetbrains-mono-regular.ttf", import.meta.url)),
    fetchBytes("/textures/grass-edge.png"),
  ]);
  const bytes = await buildPdf(seedList(structureSeed), { heading, mono, grass });
  save(bytes as BlobPart, "application/pdf", `world-seeds-${structureSeed}.pdf`);
}
