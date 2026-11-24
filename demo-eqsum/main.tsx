import { useState } from "react";
import { createRoot } from "react-dom/client";
import * as pdfjs from "pdfjs-dist";
import { EquationSummary } from "@vhalaharvi/react-eqsum";

pdfjs.GlobalWorkerOptions.workerSrc = "pdf.worker.min.mjs";

function App() {
  const [source, setSource] = useState<string | File>("book.pdf");
  const name = typeof source === "string" ? "Competitive Programmer’s Handbook" : source.name;
  return (
    <main>
      <header>
        <h1>react-eqsum</h1>
        <p>
          A {""}
          <b>{name}</b> summary that keeps the equations. Equations count most, the text around them next, other prose least; the
          pages are chosen with dynamic programming and drawn straight from the book, so nothing is re-typed. Drag for a longer or
          shorter summary, up to the whole book or 100 pages, or click a <i>p. N</i> to open its source page.
        </p>
        <label className="open">
          Open your own typeset PDF <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && setSource(e.target.files[0])} />
        </label>
      </header>
      <EquationSummary pdfjs={pdfjs as never} source={source} defaultPages={12} worker={() => new Worker("eqsum-worker.js", { type: "module" })} />
      <footer>
        Book: <a href="https://github.com/pllk/cphb">Competitive Programmer’s Handbook</a> by Antti Laaksonen, CC BY-NC-SA 4.0. Viewer:{" "}
        <a href="https://github.com/vinodhalaharvi/dyna-js">@vhalaharvi/react-eqsum</a>, on <a href="https://github.com/vinodhalaharvi/dyna-js">@vhalaharvi/dyna</a>.
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
