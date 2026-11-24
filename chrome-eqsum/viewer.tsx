// The extension's page: the PDF from the address it was opened with (asking for access to that
// site when it needs it), or one you drop or pick, summarised with react-eqsum.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as pdfjs from "pdfjs-dist";
import { EquationSummary } from "@vhalaharvi/react-eqsum";

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.mjs");

type State =
  | { kind: "none" }
  | { kind: "loading"; url: string }
  | { kind: "needs-access"; url: string; origin: string }
  | { kind: "needs-files"; url: string }
  | { kind: "not-pdf"; url: string }
  | { kind: "failed"; url: string; message: string }
  | { kind: "ready"; data: Uint8Array; name: string };

const nameOf = (url: string) => decodeURIComponent(url.split(/[?#]/)[0]!.split("/").pop() || "book").replace(/\.pdf$/i, "") || "book";
const isPdf = (b: Uint8Array) => b.length > 5 && String.fromCharCode(...b.subarray(0, 1024)).includes("%PDF-");

async function load(url: string, set: (s: State) => void) {
  set({ kind: "loading", url });
  const u = new URL(url);
  if (u.protocol === "http:" || u.protocol === "https:") {
    const origin = `${u.protocol}//${u.host}/*`;
    if (!(await chrome.permissions.contains({ origins: [origin] }))) return set({ kind: "needs-access", url, origin });
  }
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return set({ kind: "failed", url, message: `the site answered ${r.status} ${r.statusText}` });
    const data = new Uint8Array(await r.arrayBuffer());
    if (!isPdf(data)) return set({ kind: "not-pdf", url });
    set({ kind: "ready", data, name: nameOf(url) });
  } catch (e) {
    if (u.protocol === "file:") return set({ kind: "needs-files", url });
    set({ kind: "failed", url, message: e instanceof Error ? e.message : String(e) });
  }
}

function App() {
  const [state, setState] = useState<State>({ kind: "none" });
  const [over, setOver] = useState(false);
  useEffect(() => {
    const src = new URLSearchParams(location.search).get("src");
    if (src) void load(src, setState);
  }, []);
  const take = async (f: File) => {
    const data = new Uint8Array(await f.arrayBuffer());
    setState(isPdf(data) ? { kind: "ready", data, name: f.name.replace(/\.pdf$/i, "") } : { kind: "not-pdf", url: f.name });
  };
  if (state.kind === "ready") document.title = `${state.name} · Equation Summary`;

  return (
    <main
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void take(f);
      }}
    >
      <h1>Equation Summary</h1>
      <div className="muted">A typeset math PDF, summarised to any number of pages, keeping its equations and the text around them.</div>
      {state.kind === "ready" ? (
        <EquationSummary pdfjs={pdfjs as never} source={state.data} fileName={state.name} defaultPages={12} worker={() => new Worker(chrome.runtime.getURL("eqsum-worker.js"), { type: "module" })} />
      ) : (
        <div className="card">
          {state.kind === "loading" ? <p>Opening {state.url}…</p> : null}
          {state.kind === "needs-access" ? (
            <p>
              To read this PDF, the extension needs access to <b>{new URL(state.url).host}</b>. It reads only the PDF; nothing is sent anywhere.{" "}
              <button
                onClick={async () => {
                  if (await chrome.permissions.request({ origins: [state.origin] })) void load(state.url, setState);
                }}
              >
                Allow {new URL(state.url).host}
              </button>
            </p>
          ) : null}
          {state.kind === "needs-files" ? (
            <p>
              To read files on your computer, turn on <b>Allow access to file URLs</b> for this extension in <code>chrome://extensions</code>, then reload this page. Or drop the file here.
            </p>
          ) : null}
          {state.kind === "not-pdf" ? <p>That isn't a PDF: {state.url}. This works on typeset PDFs, such as books and papers made with LaTeX.</p> : null}
          {state.kind === "failed" ? (
            <p>
              Couldn't open {state.url}: {state.message}. If the PDF needs you to sign in, download it and drop it here.
            </p>
          ) : null}
          <div className={"drop" + (over ? " over" : "")}>
            Drop a PDF here, or{" "}
            <label className="pick">
              choose one <input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && void take(e.target.files[0])} />
            </label>
            <div className="muted" style={{ marginTop: 8 }}>
              Or open a PDF in Chrome and click the extension's button, or right-click a link to a PDF.
            </div>
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        Everything happens in your browser. Typeset PDFs only: a scanned book has no text to read.
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
