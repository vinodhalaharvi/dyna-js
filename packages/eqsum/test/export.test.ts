import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keepText } from "../src/export.js";

const text = (b: Uint8Array) => String.fromCharCode(...b);
// keep text starting above y = 500 (in PDF space, y up)
const above = (_x: number, y: number) => y > 500;

describe("keepText", () => {
  it("drops text outside and keeps everything else byte for byte", () => {
    const src = "q 1 0 0 1 0 0 cm BT /F1 10 Tf 72 700 Td (top) Tj 0 -300 Td (bottom) Tj ET 0 0 m 100 100 l S Q";
    const out = text(keepText(src, above));
    expect(out).toContain("(top) Tj");
    expect(out).not.toContain("bottom");
    expect(out).toContain("0 -300 Td");
    expect(out).toContain("0 0 m 100 100 l S Q");
  });
  it("follows the transformation, the text matrix and the leading", () => {
    const src = "q 1 0 0 1 0 400 cm BT /F1 10 Tf 12 TL 1 0 0 1 72 200 Tm (a) Tj T* (b) Tj ET Q BT /F1 10 Tf 72 300 Td (c) Tj ET";
    const out = text(keepText(src, above));
    // a at 600 and b at 588 (400 + 200, then down a line): kept; c at 300: dropped
    expect(out).toContain("(a) Tj");
    expect(out).toContain("(b) Tj");
    expect(out).not.toContain("(c)");
  });
  it("reads TJ arrays and strings holding brackets, escapes and operator names", () => {
    const src = String.raw`BT /F1 10 Tf 72 700 Td [(a\) Tj [)-250(b)] TJ 0 -400 Td [(c\(d)10(e)] TJ ET`;
    const out = text(keepText(src, above));
    expect(out).toContain(String.raw`[(a\) Tj [)-250(b)] TJ`);
    expect(out).not.toContain("(e)");
  });
  it("keeps the line move a dropped ' or \" makes", () => {
    const src = `BT /F1 10 Tf 14 TL 72 700 Td (one) Tj 0 -300 Td (two) ' 1 2 (three) " (four) Tj ET`;
    const out = text(keepText(src, (_x, y) => y > 600 || y < 360));
    expect(out).toContain("(one) Tj");
    expect(out).not.toContain("(two)");
    expect(out).toContain("T*");
    expect(out).toContain("1 Tw 2 Tc T*");
  });
  it("passes an inline image through unread", () => {
    const src = "q BI /W 2 /H 1 /BPC 8 /CS /G ID \x00(\xff) Tj EI Q BT /F1 10 Tf 72 100 Td (low) Tj ET";
    const out = text(keepText(src, above));
    expect(out).toContain("BI /W 2 /H 1 /BPC 8 /CS /G ID \x00(\xff) Tj EI");
    expect(out).not.toContain("(low)");
  });
});

const BOOK = process.env.EQSUM_BOOK;
describe.skipIf(!BOOK || !existsSync(BOOK))("a summary as a PDF", () => {
  it("holds the passages' text, and none of the text around them", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { readBook } = await import("../src/index.js");
    const { summaryPdf } = await import("../src/export.js");
    const data = new Uint8Array(readFileSync(BOOK!));
    const book = await readBook((await pdfjs.getDocument({ data: data.slice(), verbosity: 0, fontExtraProperties: true }).promise) as never, pdfjs.OPS, { maxPages: 12 });
    const s = book.summary(12);
    const pdf = await summaryPdf(data, s.pages, { width: book.width, height: book.height });
    const out = await pdfjs.getDocument({ data: pdf.slice(), verbosity: 0 }).promise;
    expect(out.numPages).toBe(s.pages.length);
    let all = "";
    for (let k = 0; k < out.numPages; k++) {
      const page = await out.getPage(k + 1);
      const vp = page.getViewport({ scale: 1 });
      const items = (await page.getTextContent()).items.filter((it: any) => it.str?.trim()) as any[];
      all += items.map((it) => it.str).join(" ") + "\n";
      // every piece of text sits in a passage as placed
      for (const it of items) {
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const mid = y - 0.3 * Math.hypot(it.transform[2], it.transform[3]);
        expect(s.pages[k]!.some((p) => mid >= p.at.y0 - 1 && mid <= p.at.y1 + 1 && x >= p.at.x0 - 6 && x <= p.at.x1 + 1)).toBe(true);
      }
    }
    const flat = all.replace(/\s+/g, "");
    // the summary's own words are in the file; words from passages it left out of the same pages are not
    const chosen = new Set(s.pages.flat().map((p) => p.unit));
    const pagesUsed = new Set(s.pages.flat().map((p) => p.page));
    const words = (i: number) => (book.units[i]!.text.match(/[A-Za-z]{9,}/g) ?? []);
    const shownWords = new Set([...chosen].flatMap(words));
    let checked = 0;
    for (const i of chosen) for (const w of words(i).slice(0, 2)) (expect(flat).toContain(w), checked++);
    let absent = 0;
    book.units.forEach((u, i) => {
      if (chosen.has(i) || !pagesUsed.has(u.page) || u.kind !== "prose") return;
      // as a whole word (a left-out "efficient" may well be part of a shown "coefficients")
      for (const w of words(i)) if (!shownWords.has(w) && ![...shownWords].some((v) => v.includes(w))) (expect(all).not.toMatch(new RegExp(`(?<![A-Za-z])${w}(?![A-Za-z])`)), absent++);
    });
    expect(checked).toBeGreaterThan(50);
    expect(absent).toBeGreaterThan(50);
  }, 600_000);
});
