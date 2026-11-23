// One region of a source page, drawn by pdf.js at screen resolution when it scrolls into view:
// vectors, not a picture, so it is as sharp as the book at any size. Its text layer holds only
// the text inside the region, so selecting and searching see exactly what is shown.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Box } from "@vhalaharvi/eqsum";

interface PdfPageLike {
  getViewport(o: { scale: number; offsetX?: number; offsetY?: number }): unknown;
  render(o: { canvas: HTMLCanvasElement; viewport: unknown }): { promise: Promise<void>; cancel(): void };
  getTextContent(): Promise<{ items: { str?: string; transform?: number[] }[]; styles: unknown; lang?: string | null }>;
}
interface DocLike {
  getPage(n: number): Promise<PdfPageLike>;
}
type TextLayerCtor = new (o: { textContentSource: unknown; container: HTMLElement; viewport: unknown }) => { render(): Promise<unknown>; cancel(): void };

// pages and their text, fetched once per document
const pageCache = new WeakMap<object, Map<number, Promise<PdfPageLike>>>();
const textCache = new WeakMap<object, Map<number, ReturnType<PdfPageLike["getTextContent"]>>>();
function pageOf(doc: DocLike, i: number) {
  let m = pageCache.get(doc);
  if (!m) pageCache.set(doc, (m = new Map()));
  let p = m.get(i);
  if (!p) m.set(i, (p = doc.getPage(i + 1)));
  return p;
}
function textOf(doc: DocLike, i: number, page: PdfPageLike) {
  let m = textCache.get(doc);
  if (!m) textCache.set(doc, (m = new Map()));
  let t = m.get(i);
  if (!t) m.set(i, (t = page.getTextContent()));
  return t;
}

export interface RegionProps {
  doc: unknown;
  /** source page, 0-based */
  page: number;
  /** the part of the page shown, in points */
  clip: Box;
  /** CSS pixels per point */
  scale: number;
  /** pdf.js's height of the page, for placing text */
  pageHeight: number;
  textLayer?: TextLayerCtor | null;
  style?: CSSProperties;
  className?: string;
}

export function Region({ doc, page, clip, scale, pageHeight, textLayer, style, className }: RegionProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const w = (clip.x1 - clip.x0) * scale;
  const h = (clip.y1 - clip.y0) * scale;

  // draw only once it is near the screen
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen || !canvas.current) return;
    let task: { cancel(): void } | null = null;
    let tl: { cancel(): void } | null = null;
    let dead = false;
    (async () => {
      const p = await pageOf(doc as DocLike, page);
      if (dead || !canvas.current) return;
      const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
      const c = canvas.current;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      const vp = p.getViewport({ scale: scale * dpr, offsetX: -clip.x0 * scale * dpr, offsetY: -clip.y0 * scale * dpr });
      const r = p.render({ canvas: c, viewport: vp });
      task = r;
      await r.promise.catch(() => undefined);
      if (dead || !textLayer || !text.current) return;
      // the text inside the region, and nothing else
      const tc = await textOf(doc as DocLike, page, p);
      if (dead || !text.current) return;
      const inside = tc.items.filter((it) => {
        if (!it.transform || !it.str) return false;
        const x = it.transform[4]!;
        const y = pageHeight - it.transform[5]!;
        return x >= clip.x0 - 1 && x <= clip.x1 + 1 && y >= clip.y0 && y <= clip.y1 + 1;
      });
      text.current.replaceChildren();
      text.current.style.setProperty("--total-scale-factor", String(scale));
      text.current.style.setProperty("--scale-factor", String(scale));
      // pdf.js places text in percentages of the whole page, so the layer is the whole page,
      // shifted so that the region's corner sits at the box's corner (the box clips the rest)
      const layer = new textLayer({ textContentSource: { ...tc, items: inside }, container: text.current, viewport: p.getViewport({ scale }) });
      tl = layer;
      await layer.render().catch(() => undefined);
    })();
    return () => {
      dead = true;
      task?.cancel();
      tl?.cancel();
    };
  }, [seen, doc, page, clip.x0, clip.y0, clip.x1, clip.y1, scale, w, h, pageHeight, textLayer]);

  return (
    <div ref={box} className={className} style={{ position: "absolute", width: w, height: h, overflow: "hidden", ...style }}>
      <canvas ref={canvas} style={{ width: w, height: h, display: "block" }} />
      {textLayer ? <div ref={text} className="textLayer" style={{ left: -clip.x0 * scale, top: -clip.y0 * scale }} /> : null}
    </div>
  );
}
