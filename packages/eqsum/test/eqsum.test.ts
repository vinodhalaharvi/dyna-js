import { existsSync, readFileSync } from "node:fs";
import { bruteForce, dyna } from "@vhalaharvi/dyna";
import { beforeAll, describe, expect, it } from "vitest";
import {
  bookFrom,
  defaultWeights,
  hasVariable,
  measure,
  place,
  readPage,
  readToc,
  regionOf,
  rowsOf,
  sectionProblem,
  structure,
  type Book,
  type PageContent,
  type Run,
  type TocEntry,
  type Unit,
} from "../src/index.js";

const run = (str: string, x0: number, y0: number, font = "CenturySchL-Roma", size = 11): Run => ({
  str,
  box: { x0, y0, x1: x0 + str.length * size * 0.5, y1: y0 + size },
  size,
  font,
});

describe("rows", () => {
  it("joins the pieces of one line, and keeps lines apart", () => {
    const rows = rowsOf([run("solve(x) =", 200, 100), run("min(", 260, 100.5), run("next line", 94, 114)]);
    expect(rows.map((r) => r.text)).toEqual(["solve(x) = min(", "next line"]);
  });
  it("attaches a lone math symbol set above its line (an inline radical)", () => {
    const rows = rowsOf([run("If a number n is not prime", 94, 100), run("p", 300, 96.5, "Fourier-Math-Symbols", 11)]);
    expect(rows).toHaveLength(1);
  });
});

describe("equations that state something general", () => {
  it.each([
    ["a + ak + ak2 + ··· + b", true],
    ["kS − S = bk − a", true],
    ["3 + 7 + 11 + 15 = 36", false],
    ["solve(10) = solve(7) + 1 = 3", false],
  ])("%s → %s", (t, want) => expect(hasVariable(t)).toBe(want));
});

describe("margins", () => {
  it("are measured from the pages: left edge, indent, bullet text, centre", () => {
    const page: PageContent = { width: 595, height: 842, drawings: [], runs: [] };
    for (let i = 0; i < 30; i++) page.runs.push(run("x".repeat(80), 93.5, 100 + i * 14.4));
    for (let i = 0; i < 6; i++) page.runs.push(run("y".repeat(72), 111, 600 + i * 30));
    page.runs.push(run("• a bullet that goes on and on and on and on and on", 110, 560), run("its second line", 123, 574.4));
    const m = measure([page]);
    expect(m.left).toBe(93.5);
    expect(m.indent).toBe(111);
    expect(m.bulletCont).toBe(123);
    expect(m.center).toBeCloseTo((93.5 + 93.5 + 80 * 5.5) / 2, 0);
  });
});

describe("layout", () => {
  const W = { left: 93.5, indent: 111, bulletCont: 123, center: 298, foot: 780 };
  const unit = (id: number, kind: Unit["kind"], h: number): Unit => ({ id, kind, page: 0, y0: 100, y1: 100 + h, x0: 94, x1: 500, h, rows: 1, math: 0, text: "", padTop: 2, padBottom: 2 });
  it("keeps a heading with what follows it", () => {
    const units = [unit(0, "prose", 600), unit(1, "heading", 20), unit(2, "heading", 15), unit(3, "prose", 40)];
    const pages = place([0, 1, 2, 3], units, W, { width: 595, height: 842, top: 72, bottom: 770 });
    expect(pages.map((p) => p.map((x) => x.unit))).toEqual([[0], [1, 2, 3]]);
  });
  it("copies the text block's full width, so equations stay centred", () => {
    const r = regionOf(unit(0, "display", 20), W);
    expect(r.x0).toBeLessThan(W.left);
    expect(r.x1).toBeGreaterThan(2 * W.center - W.left);
  });
});

// The real thing: a typeset book (the Competitive Programmer's Handbook, CC BY-NC-SA) read with pdf.js.
const BOOK = process.env.EQSUM_BOOK ?? "";
describe.skipIf(!existsSync(BOOK))("a typeset book", () => {
  let book: Book;
  let pages: Map<number, PageContent>;
  let toc: TocEntry[];
  let numPages = 0;
  beforeAll(async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(BOOK)), verbosity: 0, fontExtraProperties: true }).promise;
    toc = await readToc(doc as never);
    pages = new Map();
    for (let i = 0; i < doc.numPages; i++) pages.set(i, await readPage(doc as never, i, pdfjs.OPS as never));
    const start = toc[0]?.page ?? 0;
    for (const k of [...pages.keys()]) if (k < start) pages.delete(k);
    numPages = doc.numPages;
    book = bookFrom(pages, toc, doc.numPages, { maxPages: 40 });
  }, 120_000);

  it("finds its equations, prose, code, figures and headings", () => {
    const kinds: Record<string, number> = {};
    for (const u of book.units) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
    expect(kinds.display).toBeGreaterThan(250);
    expect(kinds.heading).toBeGreaterThan(300);
    expect(book.margins.left).toBeCloseTo(93.5, 0);
    const coin = book.units.find((u) => u.kind === "display" && u.text.replace(/\s+/g, "").includes("solve(x)=min(solve(x−1)+1"));
    expect(coin?.page).toBe(75);
  });

  it("chooses as brute force does, section by section", () => {
    const chapters = structure(book.units, defaultWeights);
    let checked = 0;
    for (const ch of chapters)
      for (const s of ch.sections) {
        const ways = s.items.reduce((a, it) => a * (it.options.length + 1), 1);
        if (!s.items.length || ways > 20000) continue;
        const p = sectionProblem(s, book.units, defaultWeights);
        const [got] = dyna(p.alg, p.coalg, p.start, p.key);
        const [want] = bruteForce(p.alg, p.coalg, p.start);
        expect(got.nz.slice().sort((a, b) => a - b)).toEqual(want.nz.slice().sort((a, b) => a - b));
        for (const g of want.nz) expect(got.at![g]!.score).toBeCloseTo(want.at![g]!.score, 9);
        checked++;
      }
    expect(checked).toBeGreaterThan(50);
  });

  it("fits every length from 1 to 40 pages, and more pages never make it worse", () => {
    let last = -1;
    for (let n = 1; n <= 40; n++) {
      const s = book.summary(n);
      expect(s.pages.length).toBeLessThanOrEqual(n);
      expect(s.units).toEqual([...s.units].sort((a, b) => a - b));
      const value = s.units.length;
      expect(value).toBeGreaterThanOrEqual(last * 0.9);
      last = value;
      for (const pg of s.pages)
        for (let i = 1; i < pg.length; i++) expect(pg[i]!.at.y0).toBeGreaterThanOrEqual(pg[i - 1]!.at.y1);
    }
  });

  it("never shows part of a neighbour: regions on a page do not overlap", () => {
    const s = book.summary(40);
    const byPage = new Map<number, { y0: number; y1: number }[]>();
    for (const pg of s.pages) for (const p of pg) (byPage.get(p.page) ?? byPage.set(p.page, []).get(p.page)!).push(p.clip);
    for (const clips of byPage.values()) {
      clips.sort((a, b) => a.y0 - b.y0);
      for (let i = 1; i < clips.length; i++) expect(clips[i]!.y0).toBeGreaterThanOrEqual(clips[i - 1]!.y1 - 1e-9);
    }
  });

  it("runs to the whole book: at its full length, every equation is in", () => {
    const whole = bookFrom(pages, toc, numPages, {});
    expect(whole.maxPages).toBe(numPages);
    const s = whole.summary(numPages);
    expect(s.equations).toBe(whole.units.filter((u) => u.kind === "display").length);
    expect(s.pages.length).toBeLessThanOrEqual(numPages);
    for (const pg of s.pages) for (let i = 1; i < pg.length; i++) expect(pg[i]!.at.y0).toBeGreaterThanOrEqual(pg[i - 1]!.at.y1);
  }, 600_000);

  it("keeps an equation's surrounding text only with the equation", () => {
    const s = book.summary(20);
    const chosen = new Set(s.units);
    for (const ch of structure(book.units, defaultWeights))
      for (const sec of ch.sections)
        for (const it of sec.items) {
          const eq = it.options[0]!.units.find((u) => book.units[u]!.kind === "display");
          if (eq === undefined) continue;
          const others = new Set(it.options.flatMap((o) => o.units).filter((u) => u !== eq));
          for (const u of others) if (chosen.has(u)) expect(chosen.has(eq)).toBe(true);
        }
  });
});
