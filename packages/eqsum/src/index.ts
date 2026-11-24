// eqsum: an N-page summary of a typeset book in which equations count most, the text around them
// next, and other prose least. Chosen with dyna; shown by drawing the chosen regions of the
// source pages, so nothing is re-typed.
import { QUANTUM, defaultWeights, solve, structure, type Weights } from "./choose.js";
import { place, type Geometry, type Placement } from "./place.js";
import { importance, links, type Link } from "./links.js";
import { bodyPages, measure, unitsOf, type Margins, type Unit } from "./units.js";
import { readPage, readToc, type Ops, type PageContent, type PdfDoc, type TocEntry } from "./read.js";

export { defaultWeights, solve, structure, sectionProblem, hasVariable, bestOf, cost, GAP, QUANTUM, type Weights, type Summary, type Chapter, type Section, type Item, type Option, type Best } from "./choose.js";
export { place, regionOf, HEAD_GAP, type Placement, type Geometry } from "./place.js";
export { links, importance, type Link, type LinkKind } from "./links.js";
export { measure, unitsOf, rowsOf, clusters, bodyPages, type Unit, type Kind, type Margins } from "./units.js";
export { readPage, readToc, type Box, type Run, type PageContent, type TocEntry, type PdfDoc, type Ops } from "./read.js";

/**
 * The longest summary prepared unless asked for more: solving every length takes time and memory
 * that grow with it (a dense 417-page book: about 37 s and 0.9 GB to 100 pages, 135 s and 1.8 GB
 * to the whole book), so a long book's slider stops here.
 */
export const MAX_PAGES = 100;

/** A read and solved book: summaries of any length up to `maxPages`, at once. */
export interface Book {
  numPages: number;
  width: number;
  height: number;
  units: Unit[];
  margins: Margins;
  /** what refers to what (equation numbers, numbered results, symbols), and each unit's worth for it (1: nothing refers to it) */
  links: Link[];
  importance: Float64Array;
  toc: TocEntry[];
  maxPages: number;
  /** the summary in `pages` pages (or fewer): its pages of placements, and what it holds */
  summary(pages: number): SummaryPages;
}

/** Pages of placements, with the equations and the units they hold. */
export interface SummaryPages {
  pages: Placement[][];
  equations: number;
  units: number[];
}

export interface ReadOptions {
  weights?: Partial<Weights>;
  /** the longest summary to prepare (the slider's end): the whole book, or MAX_PAGES (100) for a longer one; more takes longer and needs more memory */
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
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? MAX_PAGES, numPages));
  opts.onProgress?.(0, 1, "choosing");
  // what the book refers to, and how much each equation matters for it
  const ls = links(units);
  const imp = importance(units.length, (i) => (units[i]!.kind === "display" ? w.eq : units[i]!.kind === "heading" ? 0 : 1), ls);
  const chapters = structure(units, w, imp);
  const solved = solve(units, chapters, Math.floor((maxPages * usable * 0.95) / QUANTUM), w);
  opts.onProgress?.(1, 1, "choosing");
  const cache = new Map<number, SummaryPages>();
  return {
    numPages,
    width: geo.width,
    height: geo.height,
    units,
    links: ls,
    importance: imp,
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
      let out: SummaryPages = { pages: [], equations: 0, units: [] };
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
