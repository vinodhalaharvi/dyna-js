import { clampAspect, fracL, type Layout, type LayoutNode } from "@vhalaharvi/collage";

/** One photo's place on the canvas, in pixels. */
export interface Cell {
  /** index into the photos array */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Places a layout tree on a width × height canvas. The tree is stretched to
 * the canvas and each photo then covers its cell, so the crop the ranking
 * already paid for is spread across the photos. `gap` pixels separate photos.
 */
export function cells(tree: LayoutNode, width: number, height: number, gap = 0): Cell[] {
  const out: Cell[] = [];
  const g = Math.max(0, gap) / 2;
  const walk = (n: LayoutNode, x: number, y: number, w: number, h: number): void => {
    if (n.p >= 0) {
      out.push({ index: n.p, x: x + g, y: y + g, width: Math.max(0, w - 2 * g), height: Math.max(0, h - 2 * g) });
      return;
    }
    const l = n.l as LayoutNode, r = n.r as LayoutNode;
    const f = fracL(n.c ?? "H", l.a, r.a);
    if (n.c === "H") {
      walk(l, x, y, w * f, h);
      walk(r, x + w * f, y, w * (1 - f), h);
    } else {
      walk(l, x, y, w, h * f);
      walk(r, x, y + h * f, w, h * (1 - f));
    }
  };
  walk(tree, -g, -g, width + 2 * g, height + 2 * g);
  return out;
}

/** A photo's aspect ratio as the solver sees it. */
export function photoAspect(p: { width: number; height: number }): number {
  return clampAspect(p.width / p.height);
}

export type { Layout };
