// eqsum: an N-page summary of a typeset book in which equations count most, the text around them
// next, and other prose least. Chosen with dyna; shown by drawing the chosen regions of the
// source pages, so nothing is re-typed.
import { QUANTUM, defaultWeights, solve, structure, type Weights } from "./choose.js";
import { place, type Geometry, type Placement } from "./place.js";
import { bodyPages, measure, unitsOf, type Margins, type Unit } from "./units.js";
import { readPage, readToc, type Ops, type PageContent, type PdfDoc, type TocEntry } from "./read.js";

export { defaultWeights, solve, structure, sectionProblem, hasVariable, bestOf, cost, GAP, QUANTUM, type Weights, type Summary, type Chapter, type Section, type Item, type Option, type Best } from "./choose.js";
export { place, regionOf, HEAD_GAP, type Placement, type Geometry } from "./place.js";
export { measure, unitsOf, rowsOf, clusters, bodyPages, type Unit, type Kind, type Margins } from "./units.js";
export { readPage, readToc, type Box, type Run, type PageContent, type TocEntry, type PdfDoc, type Ops } from "./read.js";

/** A read and solved book: summaries of any length up to `maxPages`, at once. */
export interface Book {
  numPages: number;
  width: number;
  height: number;
  units: Unit[];
  margins: Margins;
  toc: TocEntry[];
  maxPages: number;
  /** the summary in `pages` pages (or fewer): its pages of placements, and what it holds */
  summary(pages: number): { pages: Placement[][]; equations: number; units: number[] };
}

export interface ReadOptions {
  weights?: Partial<Weights>;
  /** the longest summary to prepare (the slider's end); longer takes longer to solve */
  maxPages?: number;
  onProgress?: (done: number, total: number, stage: "reading" | "choosing") => void;
}

/** Reads a book and solves it for every summary length up to maxPages. */
export async function readBook(doc: PdfDoc, ops: Ops, opts: ReadOptions = {}): Promise<Book> {
  const toc = await readToc(doc);
  const [start, end] = bodyPages(doc.numPages, toc);
  const pages = new Map<number, PageContent>();
  for (let i = start; i < end; i++) {
    pages.set(i, await readPage(doc, i, ops));
    opts.onProgress?.(i - start + 1, end - start, "reading");
  }
  return bookFrom(pages, toc, doc.numPages, opts);
}

/** The same from pages already read (tests, workers). */
export function bookFrom(pages: Map<number, PageContent>, toc: TocEntry[], numPages: number, opts: ReadOptions = {}): Book {
  const w: Weights = { ...defaultWeights, ...opts.weights };
  const first = pages.values().next().value as PageContent;
  const margins = measure([...pages.values()]);
  const units = unitsOf(pages, toc, margins);
  const geo: Geometry = { width: first.width, height: first.height, top: 72, bottom: first.height - 72 };
  const usable = geo.bottom - geo.top;
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 40, numPages));
  opts.onProgress?.(0, 1, "choosing");
  const solved = solve(units, structure(units, w), Math.floor((maxPages * usable * 0.95) / QUANTUM), w);
  opts.onProgress?.(1, 1, "choosing");
  const cache = new Map<number, ReturnType<Book["summary"]>>();
  return {
    numPages,
    width: geo.width,
    height: geo.height,
    units,
    margins,
    toc,
    maxPages,
    summary(n: number) {
      n = Math.max(1, Math.min(Math.round(n), maxPages));
      const hit = cache.get(n);
      if (hit) return hit;
      // plan for a share of each page, and shrink the plan until the layout fits n pages (page
      // breaks waste some space): every plan is a lookup in the solved book
      let fill = 0.95;
      let out: ReturnType<Book["summary"]> = { pages: [], equations: 0, units: [] };
      for (let attempt = 0; attempt < 12; attempt++) {
        const s = solved.best((n * usable * fill) / QUANTUM);
        const laid = s ? place(s.units, units, margins, geo) : [];
        out = { pages: laid, units: s?.units ?? [], equations: (s?.units ?? []).filter((i) => units[i]!.kind === "display").length };
        if (laid.length <= n) break;
        fill *= (n / laid.length) * 0.99;
      }
      cache.set(n, out);
      return out;
    },
  };
}
