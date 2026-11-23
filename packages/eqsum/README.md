# @vhalaharvi/eqsum

Summaries of typeset (LaTeX) books that keep the equations. Give it a PDF and a length; it picks
what goes in, with equations counting most, the text around them next and other prose least, and
lays it out on pages. Nothing is re-typed: the summary is made of regions of the source pages.

```ts
import * as pdfjs from "pdfjs-dist";
import { readBook } from "@vhalaharvi/eqsum";

const doc = await pdfjs.getDocument({ url: "book.pdf", fontExtraProperties: true }).promise;
const book = await readBook(doc, pdfjs.OPS, { maxPages: 40 });
const s = book.summary(20); // pages of { page, clip, at }: draw each clip of its source page at `at`
const all = book.extract(); // every equation with its text and headings, however many pages
```

**How it chooses.** The book is read into units (display equations, paragraphs, code, figures and
headings) from its fonts and layout. Then a knapsack over page height is solved with
[@vhalaharvi/dyna](../dyna) at two levels: each section's best value at every height, then the
book's chapters and sections over those. Because the book level is graded by height, **one solve
answers every length** up to `maxPages`, so `summary(n)` is a lookup. Rules that keep it readable:
- Text near an equation counts only with its equation.
- An equation shown with none of its text is worth less.
- Each further equation in a section is worth a little less, which spreads the summary across the book.
- Worked examples in numbers count for half a general formula.
- A heading's height counts only when something under it is chosen.

All of these are `weights`.

Tested against dyna's `bruteForce` on every section small enough to enumerate. Typeset PDFs only:
a scanned book has no fonts to read.
