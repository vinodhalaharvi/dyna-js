// Laying a summary out on pages: chosen regions in reading order, a heading kept with what follows
// it, a region taller than a page scaled down to fit.
import type { Box } from "./read.js";
import type { Margins, Unit } from "./units.js";
import { GAP } from "./choose.js";

/** One region on a summary page: which unit, the part of its source page shown, and where. */
export interface Placement {
  unit: number;
  /** the source page (0-based) */
  page: number;
  /** the region of the source page shown */
  clip: Box;
  /** where it goes on the summary page */
  at: Box;
}

export interface Geometry {
  width: number;
  height: number;
  top: number;
  bottom: number;
}

export const HEAD_GAP = 12;

/** The part of a unit's page that shows it: the text block's full width, so equations stay centred. */
export function regionOf(u: Unit, W: Margins): Box {
  const right = 2 * W.center - W.left;
  return { x0: Math.min(W.left - 13, u.x0 - 2), y0: u.y0 - (u.padTop ?? 2), x1: Math.max(right + 12, u.x1 + 2), y1: u.y1 + (u.padBottom ?? 2) };
}

export function place(sel: number[], units: Unit[], W: Margins, g: Geometry): Placement[][] {
  const pages: Placement[][] = [];
  let y = Infinity;
  const h = (i: number) => regionOf(units[sel[i]!]!, W).y1 - regionOf(units[sel[i]!]!, W).y0;
  for (let k = 0; k < sel.length; k++) {
    const u = units[sel[k]!]!;
    const clip = regionOf(u, W);
    const height = clip.y1 - clip.y0;
    let before = u.kind === "heading" && pages.length && y > g.top ? HEAD_GAP : 0;
    let need = before + height;
    // a heading stays with the headings under it and the first thing they head
    for (let j = k + 1; u.kind === "heading" && j < sel.length; j++) {
      const next = units[sel[j]!]!;
      need += GAP + h(j) + (next.kind === "heading" ? HEAD_GAP : 0);
      if (next.kind !== "heading") break;
    }
    if (!pages.length || y + need > g.bottom) {
      pages.push([]);
      y = g.top;
      before = 0;
    }
    y += before;
    const scale = Math.min(1, (g.bottom - g.top) / height);
    pages[pages.length - 1]!.push({ unit: u.id, page: u.page, clip, at: { x0: clip.x0, y0: y, x1: clip.x0 + (clip.x1 - clip.x0) * scale, y1: y + height * scale } });
    y += height * scale + GAP;
  }
  return pages;
}
