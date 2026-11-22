# @vhalaharvi/react-eqsum

A React viewer that summarises a typeset PDF to N pages and keeps the equations. A slider sets the
length (instantly: the book is solved once), **All pages** shows the whole book, and each region's
*p. N* opens its source page.

```tsx
import * as pdfjs from "pdfjs-dist";
import { EquationSummary } from "@vhalaharvi/react-eqsum";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

<EquationSummary
  pdfjs={pdfjs}
  source={fileOrUrl}
  defaultPages={20}
  maxPages={40}
  worker={() => new Worker(new URL("@vhalaharvi/react-eqsum/worker", import.meta.url), { type: "module" })}
/>
```

- **Drawn by pdf.js from the source pages**, at screen resolution and only when scrolled into view.
  Equations stay as sharp as the book at any size.
- **Each region's text layer holds only its own text**, so selecting and searching see exactly what
  is shown.
- **Solving runs in the worker** if you pass one (recommended), otherwise on the page's thread.
- `useEquationSummary` and `Region` are exported for your own layout.
