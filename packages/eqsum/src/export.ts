// A summary as a PDF of its own: each passage is its source page, clipped to the passage and
// drawn where the summary puts it. Nothing is redrawn as a picture, so the mathematics stays as
// sharp as the book and the text stays text. A clip only hides what is outside it, so the text
// outside each passage is taken out of its copy of the page: what can be selected or searched in
// the file is what is shown.
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, popGraphicsState, pushGraphicsState, concatTransformationMatrix, drawObject } from "pdf-lib";
import type { Placement } from "./place.js";

export interface ExportOptions {
  /** the summary's page size, in points (the book's own, as the summary was laid out for) */
  width: number;
  height: number;
  /** a title for the file's properties */
  title?: string;
}

/** The summary's pages as a PDF file. `source` is the book's PDF, as read. */
export async function summaryPdf(source: Uint8Array | ArrayBuffer, pages: Placement[][], opts: ExportOptions): Promise<Uint8Array> {
  const src = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  if (opts.title) out.setTitle(opts.title);
  out.setProducer("@vhalaharvi/eqsum");
  out.setCreator("@vhalaharvi/eqsum");

  // each source page once: its resources (fonts, images) copied once and shared by its passages
  const used = [...new Set(pages.flat().map((p) => p.page))].sort((a, b) => a - b);
  const copied = await out.copyPages(src, used);
  const sources = new Map<number, { resources: PDFDict | PDFRef | undefined; content: string; view: [number, number, number, number] }>();
  used.forEach((pi, k) => {
    const page = src.getPage(pi);
    const box = page.getCropBox();
    sources.set(pi, {
      resources: copied[k]!.node.get(PDFName.of("Resources")) as PDFDict | PDFRef | undefined,
      content: contentOf(src, page.node.get(PDFName.of("Contents"))),
      view: [box.x, box.y, box.x + box.width, box.y + box.height],
    });
  });

  let n = 0;
  for (const pg of pages) {
    const page = out.addPage([opts.width, opts.height]);
    for (const p of pg) {
      const s = sources.get(p.page)!;
      const [vx0, , , vy1] = s.view;
      // the passage in the source page's own coordinates (PDF space: y up)
      const bx0 = p.clip.x0 + vx0;
      const bx1 = p.clip.x1 + vx0;
      const by0 = vy1 - p.clip.y1;
      const by1 = vy1 - p.clip.y0;
      const content = keepText(s.content, (x, y, size) => {
        // a piece of text belongs to the passage when it starts in it: its baseline (or, for a tall
        // glyph such as a piece of a large bracket, its middle) inside the passage
        const base = vy1 - y;
        const mid = base - 0.3 * size;
        const inside = (base >= p.clip.y0 && base <= p.clip.y1 + 0.2 * size) || (mid >= p.clip.y0 && mid <= p.clip.y1);
        return inside && x >= p.clip.x0 + vx0 - 4 && x < p.clip.x1 + vx0;
      });
      const dict: Record<string, unknown> = {
        Type: "XObject",
        Subtype: "Form",
        BBox: [bx0, by0, bx1, by1],
      };
      const form = out.context.flateStream(content, dict as never);
      if (s.resources) form.dict.set(PDFName.of("Resources"), s.resources);
      const ref = out.context.register(form);
      const name = page.node.newXObject(`P${n++}`, ref);
      // source point (sx, sy) → summary point: scaled about the passage's corner, placed at `at`
      const k = (p.at.y1 - p.at.y0) / (p.clip.y1 - p.clip.y0);
      const e = p.at.x0 - k * bx0;
      const f = opts.height - p.at.y1 - k * by0;
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(k, 0, 0, k, e, f), drawObject(name), popGraphicsState());
    }
  }
  return out.save({ useObjectStreams: true });
}

/** A page's content stream(s), decoded, as one string of bytes. */
function contentOf(doc: PDFDocument, contents: unknown): string {
  const one = (o: unknown): string => {
    const obj = o instanceof PDFRef ? doc.context.lookup(o) : o;
    if (obj instanceof PDFRawStream) return latin1(decodePDFRawStream(obj).decode());
    if (obj instanceof PDFStream) return latin1(obj.getContents());
    if (obj instanceof PDFArray) return obj.asArray().map(one).join("\n");
    return "";
  };
  return one(contents);
}

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};
const bytes = (s: string) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
};

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const ID: M = [1, 0, 0, 1, 0, 0];
const SHOW = new Set(["Tj", "TJ", "'", '"']);

/**
 * The content with only the text shown where `keep(x, y, size)` says (x, y: where a piece of text
 * starts, in the page's space; size: its height there). Everything else (drawing, images, and
 * the moves between pieces of text) stays as it was, byte for byte.
 */
export function keepText(content: string, keep: (x: number, y: number, size: number) => boolean): Uint8Array {
  const kept: string[] = [];
  let from = 0;
  let ctm: M = ID;
  const stack: M[] = [];
  let tm: M = ID;
  let tlm: M = ID;
  let leading = 0;
  let fontSize = 0;
  let rise = 0;
  let operands: string[] = [];
  let opStart = -1;
  const num = (k: number) => Number(operands[operands.length - k]);
  const nextLine = () => {
    tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
    tm = tlm;
  };
  for (const t of tokens(content)) {
    if (t.kind !== "op") {
      if (opStart < 0) opStart = t.start;
      operands.push(t.text);
      continue;
    }
    const start = opStart < 0 ? t.start : opStart;
    switch (t.text) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? ID;
        break;
      case "cm":
        ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm);
        break;
      case "BT":
        tm = tlm = ID;
        break;
      case "Tm":
        tm = tlm = [num(6), num(5), num(4), num(3), num(2), num(1)];
        break;
      case "Td":
        tlm = mul([1, 0, 0, 1, num(2), num(1)], tlm);
        tm = tlm;
        break;
      case "TD":
        leading = -num(1);
        tlm = mul([1, 0, 0, 1, num(2), num(1)], tlm);
        tm = tlm;
        break;
      case "TL":
        leading = num(1);
        break;
      case "Tf":
        fontSize = num(1);
        break;
      case "Ts":
        rise = num(1);
        break;
      case "T*":
        nextLine();
        break;
    }
    if (SHOW.has(t.text)) {
      if (t.text === "'" || t.text === '"') nextLine();
      const m = mul([fontSize, 0, 0, fontSize, 0, rise], mul(tm, ctm));
      const size = Math.hypot(m[2], m[3]);
      if (!keep(m[4], m[5], size || 1)) {
        // drop the text, keep the line move a ' or " makes
        kept.push(content.slice(from, start));
        // a ' moves to the next line, and a " also sets word and character spacing: those stay
        if (t.text === "'") kept.push(" T* ");
        if (t.text === '"') kept.push(` ${operands[0]} Tw ${operands[1]} Tc T* `);
        from = t.end;
      }
      // (the text's own advance only matters to more text on the same line, which shares its fate)
    }
    operands = [];
    opStart = -1;
  }
  kept.push(content.slice(from));
  return bytes(kept.join(""));
}

interface Tok {
  kind: "op" | "operand";
  text: string;
  start: number;
  end: number;
}

const WS = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
const DELIM = (c: string) => "()<>[]{}/%".includes(c);

/** The tokens of a content stream: operands (numbers, names, strings, arrays, dictionaries) and operators. */
function* tokens(s: string): Generator<Tok> {
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i]!;
    if (WS(c)) {
      i++;
      continue;
    }
    if (c === "%") {
      while (i < n && s[i] !== "\n" && s[i] !== "\r") i++;
      continue;
    }
    const start = i;
    if (c === "(") {
      i = endOfString(s, i);
      yield { kind: "operand", text: s.slice(start, i), start, end: i };
    } else if (c === "<" && s[i + 1] === "<") {
      i = endOfDict(s, i);
      yield { kind: "operand", text: s.slice(start, i), start, end: i };
    } else if (c === "<") {
      i = s.indexOf(">", i) + 1 || n;
      yield { kind: "operand", text: s.slice(start, i), start, end: i };
    } else if (c === "[") {
      i = endOfArray(s, i);
      yield { kind: "operand", text: s.slice(start, i), start, end: i };
    } else if (c === "/") {
      i++;
      while (i < n && !WS(s[i]!) && !DELIM(s[i]!)) i++;
      yield { kind: "operand", text: s.slice(start, i), start, end: i };
    } else {
      while (i < n && !WS(s[i]!) && !DELIM(s[i]!)) i++;
      if (i === start) i++; // a stray delimiter
      const text = s.slice(start, i);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text) || text === "true" || text === "false" || text === "null") yield { kind: "operand", text, start, end: i };
      else if (text === "BI") {
        // an inline image: its data runs, unread, to EI
        const ei = s.slice(i).search(/\sEI(?=[\s]|$)/);
        i = ei < 0 ? n : i + ei + 3;
        yield { kind: "op", text: "BI", start, end: i };
      } else yield { kind: "op", text, start, end: i };
    }
  }
}

function endOfString(s: string, i: number): number {
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") i++;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return s.length;
}

function endOfArray(s: string, i: number): number {
  i++;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "]") return i + 1;
    if (c === "(") i = endOfString(s, i);
    else if (c === "<" && s[i + 1] === "<") i = endOfDict(s, i);
    else if (c === "[") i = endOfArray(s, i);
    else i++;
  }
  return s.length;
}

function endOfDict(s: string, i: number): number {
  let depth = 0;
  while (i < s.length) {
    if (s[i] === "<" && s[i + 1] === "<") (depth++, (i += 2));
    else if (s[i] === ">" && s[i + 1] === ">") {
      i += 2;
      if (--depth === 0) return i;
    } else if (s[i] === "(") i = endOfString(s, i);
    else i++;
  }
  return s.length;
}
