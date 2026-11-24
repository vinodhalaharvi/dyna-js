// Messages between the component and the solver (a Web Worker, or the same thread).
import { bookFrom, type Book, type Margins, type PageContent, type Placement, type TocEntry, type Unit } from "@vhalaharvi/eqsum";

export type ToSolver =
  | { type: "solve"; pages: [number, PageContent][]; toc: TocEntry[]; numPages: number; maxPages: number }
  /** a length in pages, or "all": every equation with its text, however long */
  | { type: "summary"; id: number; pages: number | "all" };

export type FromSolver =
  | { type: "solved"; units: Unit[]; margins: Margins; maxPages: number; ms: number }
  | { type: "summary"; id: number; pages: Placement[][]; equations: number; regions: number }
  | { type: "error"; message: string };

/** Handles one message; returns the replies. The worker and the same-thread fallback both use it. */
export function solver(): (m: ToSolver) => FromSolver[] {
  let book: Book | null = null;
  return (m) => {
    try {
      if (m.type === "solve") {
        const t = Date.now();
        book = bookFrom(new Map(m.pages), m.toc, m.numPages, { maxPages: m.maxPages });
        return [{ type: "solved", units: book.units, margins: book.margins, maxPages: book.maxPages, ms: Date.now() - t }];
      }
      if (!book) return [{ type: "error", message: "not solved yet" }];
      const s = m.pages === "all" ? book.extract() : book.summary(m.pages);
      return [{ type: "summary", id: m.id, pages: s.pages, equations: s.equations, regions: s.units.length }];
    } catch (e) {
      return [{ type: "error", message: e instanceof Error ? e.message : String(e) }];
    }
  };
}
