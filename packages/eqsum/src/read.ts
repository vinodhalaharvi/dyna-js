// Reading a PDF with pdf.js: each page's text runs (with their real font names and boxes), the
// boxes of its drawings and images, and the outline. Everything after this works on these plain
// values, so it is testable without pdf.js.

/** A box on a page, top-left origin, in PDF points. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A run of text in one font: what pdf.js calls a text item. */
export interface Run {
  str: string;
  box: Box;
  size: number;
  /** the font's name without its subset prefix: "CenturySchL-Roma", "Fourier-Math-Symbols" */
  font: string;
}

export interface PageContent {
  width: number;
  height: number;
  runs: Run[];
  /** drawn paths and images */
  drawings: Box[];
}

/** An outline entry: its level (1 = top), title, and 0-based page. */
export interface TocEntry {
  level: number;
  title: string;
  page: number;
}

// the parts of pdf.js this needs (structural, so any pdf.js build fits)
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[]; styles: Record<string, { ascent: number; descent: number }> }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  commonObjs: { get(name: string): unknown };
}
interface PdfOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: PdfOutlineItem[];
}
export interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  getOutline(): Promise<PdfOutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

/** pdf.js operator codes this reads (from pdfjs-dist's OPS). */
export interface Ops {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

/** A box in user space, through a transform, as a top-left box on a page of height h. */
function boxThrough(m: M, x0: number, y0: number, x1: number, y1: number, h: number): Box {
  const pts = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x, y]) => [m[0] * x! + m[2] * y! + m[4], m[1] * x! + m[3] * y! + m[5]] as const);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => h - p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** One page's text runs and drawings. */
export async function readPage(doc: PdfDoc, index: number, ops: Ops): Promise<PageContent> {
  const page = await doc.getPage(index + 1);
  const { width, height } = page.getViewport({ scale: 1 });
  // the operator list first: it loads the fonts, whose real names the text then reads
  const list = await page.getOperatorList();
  const tc = await page.getTextContent();
  const names = new Map<string, string>();
  const fontName = (id: string): string => {
    let n = names.get(id);
    if (n === undefined) {
      let o: unknown;
      try {
        o = page.commonObjs.get(id);
      } catch {
        o = undefined;
      }
      n = String((o as { name?: string } | undefined)?.name ?? id).replace(/^[A-Z]{6}\+/, "");
      names.set(id, n);
    }
    return n;
  };
  const runs: Run[] = [];
  for (const raw of tc.items) {
    const it = raw as PdfTextItem;
    if (!it.str || !it.str.trim() || !it.transform) continue;
    const t = it.transform;
    const size = Math.hypot(t[2]!, t[3]!) || it.height;
    const st = tc.styles[it.fontName] ?? { ascent: 0.75, descent: -0.25 };
    // math fonts report the ascent and descent of their tallest glyphs (big operators, delimiters):
    // a box that tall would reach into the lines around an inline symbol, so text boxes are kept to
    // the usual range of a line of type
    const ascent = Math.min(Math.max(st.ascent, 0.6), 0.85);
    const descent = Math.max(Math.min(st.descent, -0.1), -0.25);
    const base = t[5]!;
    runs.push({
      str: it.str,
      box: { x0: t[4]!, y0: height - (base + ascent * size), x1: t[4]! + it.width, y1: height - (base + descent * size) },
      size,
      font: fontName(it.fontName),
    });
  }
  // drawings: path and image boxes through the current transform
  const drawings: Box[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
    else if (fn === ops.transform) ctm = mul(args as unknown as M, ctm);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args[0] as number[] | null;
      if (m && m.length === 6) ctm = mul(m as unknown as M, ctm);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === ops.constructPath) {
      const mm = args[2] as ArrayLike<number> | null;
      if (mm && mm.length >= 4 && Number.isFinite(mm[0]!)) drawings.push(boxThrough(ctm, mm[0]!, mm[1]!, mm[2]!, mm[3]!, height));
    } else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) drawings.push(boxThrough(ctm, 0, 0, 1, 1, height));
  }
  return { width, height, runs, drawings };
}

/** The outline, flattened, with each entry's page. */
export async function readToc(doc: PdfDoc): Promise<TocEntry[]> {
  const out: TocEntry[] = [];
  const walk = async (items: PdfOutlineItem[] | null, level: number): Promise<void> => {
    for (const it of items ?? []) {
      let page = -1;
      try {
        const dest = typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest;
        if (dest && dest[0] != null) page = typeof dest[0] === "number" ? dest[0] : await doc.getPageIndex(dest[0]);
      } catch {
        page = -1;
      }
      if (page >= 0) out.push({ level, title: it.title, page });
      await walk(it.items, level + 1);
    }
  };
  await walk(await doc.getOutline(), 1);
  return out;
}
