// The viewer: a slider for the summary's length, a switch for the whole book, and the pages.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Region } from "./Region.js";
import { useEquationSummary, type Options, type PdfJs } from "./useEquationSummary.js";

export interface EquationSummaryProps extends Options {
  /** pdf.js: `import * as pdfjs from "pdfjs-dist"` (with its worker set up) */
  pdfjs: PdfJs;
  /** the book: a URL, a File or Blob, or its bytes */
  source: string | URL | ArrayBuffer | Uint8Array | Blob | null;
  /** the length to start at */
  defaultPages?: number;
  /** start showing the whole book */
  defaultAllPages?: boolean;
  /** widest a page is drawn, in CSS pixels */
  maxWidth?: number;
  className?: string;
  style?: CSSProperties;
}

const CSS = `
.eqs{--eqs-ink:#1f2328;--eqs-muted:#6b7280;--eqs-line:#e5e7eb;--eqs-accent:#2563eb;font:14px/1.4 system-ui,sans-serif;color:var(--eqs-ink)}
.eqs-bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:10px 12px;background:rgba(255,255,255,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--eqs-line)}
.eqs-bar label{display:flex;align-items:center;gap:8px}
.eqs-bar input[type=range]{width:min(320px,48vw);accent-color:var(--eqs-accent)}
.eqs-n{font-variant-numeric:tabular-nums;font-weight:600;min-width:5.5em}
.eqs-stats{color:var(--eqs-muted);font-variant-numeric:tabular-nums}
.eqs-pages{display:flex;flex-direction:column;align-items:center;gap:18px;padding:18px 0 40px}
.eqs-sheet{position:relative;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12),0 6px 24px rgba(0,0,0,.06)}
.eqs-ref{position:absolute;font:11px system-ui,sans-serif;color:var(--eqs-muted);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px}
.eqs-ref:hover{color:var(--eqs-accent)}
.eqs-foot{position:absolute;left:0;right:0;text-align:center;font:11px system-ui,sans-serif;color:var(--eqs-muted)}
.eqs-status{padding:40px 16px;text-align:center;color:var(--eqs-muted)}
.eqs-progress{width:min(360px,80%);height:4px;margin:12px auto 0;background:var(--eqs-line);border-radius:2px;overflow:hidden}
.eqs-progress>div{height:100%;background:var(--eqs-accent);transition:width .2s}
.eqs-focus{outline:2px solid var(--eqs-accent);outline-offset:4px}
.eqs .textLayer{position:absolute;left:0;top:0;--scale-round-x:1px;--scale-round-y:1px;overflow:clip;opacity:1;line-height:1;text-align:initial;transform-origin:0 0;z-index:1;--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1/var(--min-font-size))}
.eqs .textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0}
.eqs .textLayer>:not(.markedContent),.eqs .textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor)*var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.eqs .textLayer .markedContent{display:contents}
.eqs .textLayer ::selection{background:rgba(37,99,235,.25)}
`;

function useStyles() {
  useLayoutEffect(() => {
    if (typeof document === "undefined" || document.getElementById("eqs-styles")) return;
    const s = document.createElement("style");
    s.id = "eqs-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/** The width available, measured. */
function useWidth(ref: React.RefObject<HTMLElement | null>, max: number) {
  const [w, setW] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.min(max, el.clientWidth - 24));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, max]);
  return Math.max(200, w);
}

export function EquationSummary({ pdfjs, source, defaultPages = 20, defaultAllPages = false, maxWidth = 820, className, style, ...opts }: EquationSummaryProps) {
  useStyles();
  const root = useRef<HTMLDivElement>(null);
  const width = useWidth(root, maxWidth);
  const [n, setN] = useState(defaultPages);
  const [all, setAll] = useState(defaultAllPages);
  const [focus, setFocus] = useState<number | null>(null);
  const { progress, solved, summary } = useEquationSummary(pdfjs, source, n, opts);
  const textLayer = (pdfjs.TextLayer ?? null) as never;

  useEffect(() => {
    if (solved && n > solved.maxPages) setN(solved.maxPages);
  }, [solved, n]);

  // the whole book, opened at a page
  useEffect(() => {
    if (!all || focus === null) return;
    const t = setTimeout(() => document.getElementById(`eqs-page-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [all, focus]);

  if (!solved) {
    const pct = progress.total ? Math.round((100 * progress.done) / progress.total) : 0;
    const what = progress.stage === "reading" ? `Reading page ${progress.done} of ${progress.total}` : progress.stage === "choosing" ? "Choosing what matters most" : progress.stage === "error" ? `Could not read this PDF: ${progress.message}` : "Opening";
    return (
      <div ref={root} className={["eqs", className].filter(Boolean).join(" ")} style={style}>
        <div className="eqs-status">
          {what}
          {progress.stage !== "error" ? (
            <div className="eqs-progress">
              <div style={{ width: `${progress.stage === "choosing" ? 100 : pct}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const scale = width / solved.width;
  const sheet = { width: solved.width * scale, height: solved.height * scale };
  const eqs = solved.units.filter((u) => u.kind === "display").length;
  const right = 2 * solved.margins.center - solved.margins.left;

  return (
    <div ref={root} className={["eqs", className].filter(Boolean).join(" ")} style={style}>
      <div className="eqs-bar">
        <label>
          Summary
          <input type="range" min={1} max={solved.maxPages} value={Math.min(n, solved.maxPages)} disabled={all} onChange={(e) => setN(+e.target.value)} aria-label="Summary length in pages" />
          <span className="eqs-n">{all ? `${solved.numPages} pages` : `${Math.min(n, solved.maxPages)} page${n === 1 ? "" : "s"}`}</span>
        </label>
        <label>
          <input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); setFocus(null); }} /> All pages
        </label>
        <span className="eqs-stats">
          {all ? `the whole book: ${eqs} equations` : summary ? `${summary.equations} of ${eqs} equations, ${summary.regions} passages from ${solved.numPages} pages` : ""}
        </span>
      </div>
      <div className="eqs-pages">
        {all
          ? Array.from({ length: solved.numPages }, (_, i) => (
              <div key={i} id={`eqs-page-${i}`} className={"eqs-sheet" + (focus === i ? " eqs-focus" : "")} style={sheet}>
                <Region doc={solved.doc} page={i} clip={{ x0: 0, y0: 0, x1: solved.width, y1: solved.height }} scale={scale} pageHeight={solved.height} textLayer={textLayer} style={{ left: 0, top: 0 }} />
                <div className="eqs-foot" style={{ bottom: 10 * scale }}>{i + 1}</div>
              </div>
            ))
          : (summary?.pages ?? []).map((pg, k) => (
              <div key={`${n}-${k}`} className="eqs-sheet" style={sheet}>
                {pg.map((p) => (
                  <div key={p.unit}>
                    <Region doc={solved.doc} page={p.page} clip={p.clip} scale={scale * ((p.at.y1 - p.at.y0) / (p.clip.y1 - p.clip.y0))} pageHeight={solved.height} textLayer={textLayer} style={{ left: p.at.x0 * scale, top: p.at.y0 * scale }} />
                    <button type="button" className="eqs-ref" style={{ left: (right + 18) * scale, top: p.at.y0 * scale + 2 }} title={`Open page ${p.page + 1} of the book`} onClick={() => { setAll(true); setFocus(p.page); }}>
                      p. {p.page + 1}
                    </button>
                  </div>
                ))}
                <div className="eqs-foot" style={{ bottom: 18 * scale }}>
                  Summary, page {k + 1} of {summary!.pages.length}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
