// A book as units: display equations, paragraphs, code listings, figures and headings, each with
// its page and band. Found from fonts and layout alone, so it works on typeset (LaTeX) PDFs.
import type { Box, PageContent, Run, TocEntry } from "./read.js";

export type Kind = "display" | "prose" | "code" | "figure" | "heading";

export interface Unit {
  id: number;
  kind: Kind;
  page: number;
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  /** height in points */
  h: number;
  rows: number;
  /** inline math in a paragraph (math-font characters, italic rows) */
  math: number;
  /** heading level: 2 chapter, 3 section, 4 subsection */
  level?: number;
  /** room around it before its neighbours on the page (a region is padded by no more than this) */
  padTop: number;
  padBottom: number;
  text: string;
}

const MATH_FONTS = /^(Fourier-Math|MSAM|MSBM|CMMI|CMSY|CMEX|CMBSY|LMMathItalic|LMMathSymbols|LMMathExtension|STIXMath|LatinModernMath|TeXGyre\w*Math|MathJax)/;
const CODE_FONTS = /^(Inconsolata|CMTT|LMMono|SFTT|DejaVuSansMono|Courier|NimbusMono|FiraMono|SourceCodePro)/;
const SANS_HEAD = /^(SFSX|SFBX|LMSans\d*-Bold|CMSSBX)/;
type FontKind = "math" | "code" | "ital" | "bold" | "roman";

function fontKind(f: string): FontKind {
  if (MATH_FONTS.test(f)) return "math";
  if (CODE_FONTS.test(f)) return "code";
  if (/Ital|-Italic|Oblique|^CMTI|^CMSL/.test(f)) return "ital";
  if (/Bold|^CMBX|^CMB\d/.test(f) || SANS_HEAD.test(f)) return "bold";
  return "roman";
}

interface Row {
  box: Box;
  runs: Run[];
  text: string;
  kinds: Partial<Record<FontKind, number>>;
  size: number;
  fonts: string[];
  cls?: Kind | "skip";
}

const hgt = (b: Box) => b.y1 - b.y0;
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const meets = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
const grow = (a: Box, g: number): Box => ({ x0: a.x0 - g, y0: a.y0 - g, x1: a.x1 + g, y1: a.y1 + g });
const total = (k: Row["kinds"]) => Object.values(k).reduce((a, b) => a + (b ?? 0), 0) || 1;

/** A page's runs as rows: pieces on one line (an equation's parts, "7.1" and its title) merged. */
export function rowsOf(runs: Run[]): Row[] {
  const sorted = [...runs].sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
  const rows: Row[] = [];
  for (const r of sorted) {
    let into: Row | undefined;
    // a lone math symbol set above or below the line (an inline radical, a big operator's limits)
    // belongs to the line it touches, however little
    const lone = r.str.trim().length <= 2 && fontKind(r.font) === "math";
    for (let i = rows.length - 1; i >= Math.max(0, rows.length - 6); i--) {
      const o = rows[i]!;
      const ov = Math.min(r.box.y1, o.box.y1) - Math.max(r.box.y0, o.box.y0);
      if (ov > (lone ? 0.2 * hgt(r.box) : 0.5 * Math.min(hgt(r.box), hgt(o.box)))) {
        into = o;
        break;
      }
    }
    if (into) {
      into.box = union(into.box, r.box);
      into.runs.push(r);
    } else rows.push({ box: { ...r.box }, runs: [r], text: "", kinds: {}, size: 0, fonts: [] });
  }
  for (const row of rows) {
    row.runs.sort((a, b) => a.box.x0 - b.box.x0);
    let text = "";
    let lastX = -Infinity;
    for (const r of row.runs) {
      text += (text && r.box.x0 - lastX > 0.15 * r.size ? " " : "") + r.str.trim();
      lastX = r.box.x1;
    }
    row.text = text.trim();
    for (const r of row.runs) {
      const k = fontKind(r.font);
      row.kinds[k] = (row.kinds[k] ?? 0) + r.str.trim().length;
    }
    row.size = Math.max(...row.runs.map((r) => r.size));
    row.fonts = [...new Set(row.runs.map((r) => r.font))].sort();
  }
  return rows.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
}

/** Rectangles that touch (after growing), clustered as their bounding boxes. */
export function clusters(rects: Box[], g: number): Box[] {
  const out: Box[] = [];
  for (const r0 of rects) {
    let r = { ...r0 };
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < out.length; i++) {
        if (meets(out[i]!, grow(r, g))) {
          r = union(r, out[i]!);
          out.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
    out.push(r);
  }
  return out;
}

/** The text block's geometry, measured from the book: left edge, paragraph indent, where bullet text continues, centre. */
export interface Margins {
  left: number;
  indent: number;
  bulletCont: number;
  center: number;
  foot: number;
}

const mode = (xs: number[], fallback: number): number => {
  const c = new Map<number, number>();
  for (const x of xs) c.set(Math.round(x * 2) / 2, (c.get(Math.round(x * 2) / 2) ?? 0) + 1);
  let best = fallback;
  let n = 0;
  for (const [x, k] of c) if (k > n) [best, n] = [x, k];
  return best;
};

export function measure(pages: PageContent[]): Margins {
  const full: Row[] = [];
  const after: number[] = [];
  const rights: number[] = [];
  for (const p of pages)
    rowsOf(p.runs).forEach((r, i, rows) => {
      const roman = (r.kinds.roman ?? 0) / total(r.kinds);
      if (roman > 0.7 && r.box.x1 - r.box.x0 > p.width * 0.55) {
        full.push(r);
        rights.push(r.box.x1);
      }
      // where a bullet's text continues: the line after a bullet that is not itself a bullet
      const nx = rows[i + 1];
      if (r.text.startsWith("•") && nx && !nx.text.startsWith("•") && nx.box.y0 - r.box.y1 < 6) after.push(nx.box.x0);
    });
  const left = mode(full.map((r) => r.box.x0), 72);
  const right = mode(rights, 523);
  const indents = full.map((r) => r.box.x0).filter((x) => x > left + 6 && x < left + 30);
  const conts = after.filter((x) => x > left + 6 && x < left + 45);
  const h = pages[0]?.height ?? 842;
  return { left, indent: mode(indents, left + 15), bulletCont: mode(conts, left + 30), center: (left + right) / 2, foot: h - 60 };
}

function figureRegions(p: PageContent, codeBoxes: Box[]): Box[] {
  const rects = p.drawings.filter((r) => {
    if (codeBoxes.some((c) => meets(c, r))) return false;
    // thin straight rules (fraction bars, radicals' bars, table rules) belong to the text
    if (hgt(r) < 1.5 || (r.x1 - r.x0 < 1.5 && hgt(r) < 20)) return false;
    return r.x1 - r.x0 < p.width * 0.95 || hgt(r) < p.height * 0.9; // not a page frame
  });
  const figs = clusters(rects, 12).filter((b) => b.x1 - b.x0 > 30 && hgt(b) > 25);
  // a figure is one vertical band
  figs.sort((a, b) => a.y0 - b.y0);
  const out: Box[] = [];
  for (const f of figs) {
    const last = out[out.length - 1];
    if (last && f.y0 < last.y1 + 14) out[out.length - 1] = union(last, f);
    else out.push({ ...f });
  }
  return out;
}

function classify(r: Row, prev: Row | null, figs: Box[], W: Margins): Kind | "skip" {
  const { x0, y0, x1 } = r.box;
  const n = total(r.kinds);
  if (y0 > W.foot && /^[0-9ivxlc]+$/.test(r.text.trim())) return "skip";
  if (figs.some((f) => (f.x0 <= x0 && f.x1 >= x1 && f.y0 <= y0 && f.y1 >= r.box.y1) || (meets(f, r.box) && x1 - x0 < f.x1 - f.x0))) return "figure";
  if (((r.kinds.bold ?? 0) / n > 0.8 && r.size > 11.5) || r.fonts.some((f) => SANS_HEAD.test(f))) return "heading";
  if ((r.kinds.code ?? 0) / n > 0.9 && x0 >= W.left + 18) return "code";
  const bulletCont = prev?.cls === "prose" && Math.abs(x0 - W.bulletCont) < 2;
  if (x0 > W.left + 25 && Math.abs((x0 + x1) / 2 - W.center) < 60 && !bulletCont) return "display";
  if (x0 > W.left + 25 && !bulletCont && x1 - x0 < 300) return "display";
  return "prose";
}

const norm = (s: string) => s.toLowerCase().replace(/\W+/g, " ").trim();

/** Where a book's body runs: from its outline's first entry to its back matter (bibliography, index). */
export function bodyPages(numPages: number, toc: TocEntry[]): [number, number] {
  let end = numPages;
  for (const t of toc) if (/^\s*(bibliography|references|index|notation index|subject index)\s*$/i.test(t.title) && t.page > numPages / 2) end = Math.min(end, t.page);
  return [toc[0]?.page ?? 0, end];
}

/** The units of the pages given (page numbers are their indices in the book). */
export function unitsOf(pages: Map<number, PageContent>, toc: TocEntry[], W: Margins): Unit[] {
  type U = Omit<Unit, "id" | "h" | "padTop" | "padBottom"> & { size?: number };
  let units: U[] = [];
  for (const [pno, p] of [...pages].sort((a, b) => a[0] - b[0])) {
    const rows = rowsOf(p.runs);
    const isCode = (r: Row) => (r.kinds.code ?? 0) / total(r.kinds) > 0.9 && r.box.x0 >= W.left + 18;
    const codeBoxes = clusters(rows.filter(isCode).map((r) => r.box), 6).map((b) => ({ x0: W.left + 10, y0: b.y0 - 8, x1: p.width - W.left + 10, y1: b.y1 + 8 }));
    const figs = figureRegions(p, codeBoxes);
    let prev: Row | null = null;
    for (const r of rows) {
      r.cls = classify(r, prev, figs, W);
      if (r.cls !== "skip") prev = r;
    }
    const pageFigs: U[] = [];
    for (const f of figs) {
      const members = rows.filter((r) => r.cls === "figure" && meets(f, r.box));
      const box = members.reduce((b, m) => union(b, m.box), f);
      pageFigs.push({ kind: "figure", page: pno, ...box, rows: Math.max(1, members.length), math: 0, text: members.map((m) => m.text).join(" ").slice(0, 200) });
    }
    // labels just outside a figure's drawings join it: regions are copied full width
    for (let changed = true; changed; ) {
      changed = false;
      for (const f of pageFigs)
        for (const r of rows) {
          if (r.cls === "skip" || r.cls === "figure" || r.cls === "heading") continue;
          if (Math.min(f.y1, r.box.y1) - Math.max(f.y0, r.box.y0) > 2) {
            r.cls = "figure";
            Object.assign(f, union(f, r.box));
            f.rows++;
            f.text = (f.text + " " + r.text).slice(0, 200);
            changed = true;
          }
        }
    }
    units.push(...pageFigs);
    let cur: U | null = null;
    const flush = () => {
      if (cur) units.push(cur);
      cur = null;
    };
    for (const r of rows) {
      const c = r.cls!;
      if (c === "skip" || c === "figure") continue;
      const { x0, y0, x1, y1 } = r.box;
      if (c === "heading") {
        flush();
        const last = units[units.length - 1];
        // "Chapter 7" and its title are one heading
        if (last && last.kind === "heading" && last.page === pno && y0 - last.y1 < 40 && /^(Chapter|Part|Appendix)\s+\w+$/.test(last.text.trim())) {
          last.y1 = y1;
          last.text += " " + r.text;
          last.rows++;
          continue;
        }
        units.push({ kind: "heading", page: pno, x0, y0, x1, y1, rows: 1, math: 0, text: r.text, size: r.size });
        continue;
      }
      const startsPara = c === "prose" && (Math.abs(x0 - W.indent) < 2.5 || r.text.startsWith("•"));
      const gap: number = cur ? y0 - (cur as U).y1 : 99;
      let same: boolean = !!cur && (cur as U).kind === c && (cur as U).page === pno && !startsPara && gap < (c !== "prose" ? 8 : 6);
      if (c === "display" && cur && (cur as U).kind === "display" && (cur as U).page === pno && gap < 8) same = true;
      if (!same) {
        flush();
        cur = { kind: c, page: pno, x0, y0, x1, y1, rows: 0, math: 0, text: "" };
      }
      const u = cur!;
      Object.assign(u, union(u, r.box));
      u.rows++;
      u.text = (u.text + " " + r.text).trim();
      u.math += (r.kinds.math ?? 0) + (r.kinds.ital ? 1 : 0);
    }
    flush();
  }
  // reading order; units whose bands overlap are one region (a figure if either is one)
  units.sort((a, b) => a.page - b.page || a.y0 - b.y0);
  const rank: Record<Kind, number> = { figure: 3, display: 2, code: 1, prose: 0, heading: -1 };
  const merged: U[] = [];
  for (const u of units) {
    const m = merged[merged.length - 1];
    if (m && m.page === u.page && u.y0 < m.y1 - 1 && m.kind !== "heading" && u.kind !== "heading") {
      if (rank[u.kind] > rank[m.kind]) m.kind = u.kind;
      Object.assign(m, union(m, u));
      m.rows += u.rows;
      m.text = (m.text + " " + u.text).slice(0, 400);
      m.math += u.math;
      continue;
    }
    merged.push(u);
  }
  units = merged;
  // a "display" with no mathematical operator is a diagram's labels, not an equation
  const OPS = /[=≠<>≤≥≈≡+−\-·×÷∑∏∫√∈∉⊂⊆⊃∪∩→←↔⇒⇔∧∨¬|/^!∞]|\b(mod|min|max|log|gcd|lcm)\b/;
  for (const u of units) if (u.kind === "display" && !OPS.test(u.text)) u.kind = "figure";
  // heading levels: the outline's, from an entry on the same page; else by size (largest a chapter)
  const levels = new Map(toc.map((t) => [`${norm(t.title)}@${t.page}`, t.level]));
  const sizes = [...new Set(units.filter((u) => u.kind === "heading").map((u) => Math.round(u.size!)))].sort((a, b) => b - a);
  for (const u of units)
    if (u.kind === "heading") {
      const t = norm(u.text.replace(/^(Chapter \d+|Part \w+|\d+(\.\d+)*)\s*/, ""));
      const bySize = 2 + Math.min(sizes.indexOf(Math.round(u.size!)), 2);
      u.level = Math.max(2, levels.get(`${t}@${u.page}`) ?? bySize);
    }
  return units.map((u, id) => {
    const { size: _size, ...rest } = u;
    // half the gap to the units above and below, at most 2pt: a region shows none of its neighbours.
    // Where two touch or overlap a little, the line between them is halfway (the pad is negative)
    const prev = units[id - 1]?.page === u.page ? units[id - 1] : undefined;
    const next = units[id + 1]?.page === u.page ? units[id + 1] : undefined;
    const padTop = prev ? Math.min(2, (u.y0 - prev.y1) / 2) : 2;
    const padBottom = next ? Math.min(2, (next.y0 - u.y1) / 2) : 2;
    return { ...rest, id, h: Math.round((u.y1 - u.y0) * 10) / 10, padTop, padBottom };
  });
}
