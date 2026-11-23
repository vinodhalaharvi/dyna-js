// Reads a PDF with pdf.js, solves it once (in a worker if given one), then answers any length.
import { useEffect, useRef, useState } from "react";
import { bodyPages, readPage, readToc, type Margins, type Ops, type PageContent, type PdfDoc, type Placement, type Unit, type Weights } from "@vhalaharvi/eqsum";
import { solver, type FromSolver, type ToSolver } from "./protocol.js";

/** The pdf.js the component draws with: `import * as pdfjs from "pdfjs-dist"`. */
export interface PdfJs {
  getDocument(src: unknown): { promise: Promise<unknown> };
  OPS: Ops;
  TextLayer: unknown;
}

export interface Progress {
  stage: "loading" | "reading" | "choosing" | "ready" | "error";
  done: number;
  total: number;
  message?: string;
}

export interface Solved {
  doc: unknown;
  numPages: number;
  width: number;
  height: number;
  units: Unit[];
  margins: Margins;
  maxPages: number;
  solveMs: number;
}

export interface SummaryPages {
  pages: Placement[][];
  equations: number;
  regions: number;
}

export interface Options {
  /** the longest summary to prepare: the slider's end */
  maxPages?: number;
  weights?: Partial<Weights>;
  /** makes the solver's worker; without one, solving runs on the page's thread */
  worker?: () => Worker;
}

type Source = string | URL | ArrayBuffer | Uint8Array | Blob;

/** Reads and solves a book; then answers each length (the slider) at once, or "all": every equation with its text. */
export function useEquationSummary(pdfjs: PdfJs, source: Source | null, pages: number | "all", opts: Options = {}) {
  const [progress, setProgress] = useState<Progress>({ stage: "loading", done: 0, total: 1 });
  const [solved, setSolved] = useState<Solved | null>(null);
  const [summary, setSummary] = useState<SummaryPages | null>(null);
  const send = useRef<((m: ToSolver) => void) | null>(null);
  const pending = useRef(0);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let worker: Worker | null = null;
    const onReply = (m: FromSolver, doc: unknown, numPages: number, size: [number, number]) => {
      if (cancelled) return;
      if (m.type === "error") setProgress({ stage: "error", done: 0, total: 1, message: m.message });
      if (m.type === "solved") {
        setSolved({ doc, numPages, width: size[0], height: size[1], units: m.units, margins: m.margins, maxPages: m.maxPages, solveMs: m.ms });
        setProgress({ stage: "ready", done: 1, total: 1 });
      }
      if (m.type === "summary" && m.id === pending.current) setSummary({ pages: m.pages, equations: m.equations, regions: m.regions });
    };
    (async () => {
      try {
        setProgress({ stage: "loading", done: 0, total: 1 });
        setSolved(null);
        setSummary(null);
        const data = source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source instanceof ArrayBuffer ? new Uint8Array(source) : source;
        const params = typeof data === "string" || data instanceof URL ? { url: String(data) } : { data };
        const doc = (await pdfjs.getDocument({ ...params, fontExtraProperties: true, verbosity: 0 }).promise) as PdfDoc;
        const toc = await readToc(doc);
        const [start, end] = bodyPages(doc.numPages, toc);
        const read: [number, PageContent][] = [];
        for (let i = start; i < end && !cancelled; i++) {
          read.push([i, await readPage(doc, i, pdfjs.OPS)]);
          if ((i - start) % 4 === 0) setProgress({ stage: "reading", done: i - start + 1, total: end - start });
        }
        if (cancelled || !read.length) return;
        setProgress({ stage: "choosing", done: 0, total: 1 });
        const size: [number, number] = [read[0]![1].width, read[0]![1].height];
        const msg: ToSolver = { type: "solve", pages: read, toc, numPages: doc.numPages, maxPages: Math.min(opts.maxPages ?? 40, doc.numPages), weights: opts.weights ?? {} };
        if (opts.worker) {
          worker = opts.worker();
          worker.onmessage = (e: MessageEvent<FromSolver>) => onReply(e.data, doc, doc.numPages, size);
          send.current = (m) => worker!.postMessage(m);
        } else {
          const handle = solver();
          // let the "choosing" message paint before the thread is busy
          send.current = (m) => setTimeout(() => handle(m).forEach((r) => onReply(r, doc, doc.numPages, size)), 30);
        }
        send.current(msg);
      } catch (e) {
        if (!cancelled) setProgress({ stage: "error", done: 0, total: 1, message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
      worker?.terminate();
      send.current = null;
    };
    // a new book when the source, weights or longest length change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, opts.maxPages, JSON.stringify(opts.weights ?? {})]);

  useEffect(() => {
    if (!solved || !send.current) return;
    pending.current++;
    send.current({ type: "summary", id: pending.current, pages });
  }, [solved, pages]);

  return { progress, solved, summary };
}
