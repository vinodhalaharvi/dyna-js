import type { Cell } from "./geometry.js";

/** How a photo sits on the page in the scrapbook style. */
export interface Placement {
  /** shift from the cell's centre, in pixels */
  readonly dx: number;
  readonly dy: number;
  /** degrees */
  readonly rotate: number;
  /** 1 fills the cell; more spills over the neighbours */
  readonly scale: number;
  readonly z: number;
}

export interface ScrapbookOptions {
  /** largest tilt in degrees (default 3) */
  tilt?: number;
  /** largest growth past the cell, as a fraction (default 0.08); round photos get half again */
  overlap?: number;
  /** largest shift, as a fraction of the cell's shorter side (default 0.04) */
  shift?: number;
}

/** FNV-1a: a stable number from a string, so each photo keeps its own tilt across renders. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Four numbers in [-1, 1) from one seed (mulberry32). */
function draws(seed: number): [number, number, number, number] {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
  return [next(), next(), next(), next()];
}

/**
 * A photo's tilt, shift and growth, drawn from its key: the same photo gets
 * the same placement at every size, so nothing jumps while resizing.
 */
export function placement(key: string, cell: Cell, round: boolean, o: ScrapbookOptions = {}): Placement {
  const tilt = o.tilt ?? 3, overlap = o.overlap ?? 0.08, shift = o.shift ?? 0.04;
  const [r1, r2, r3, r4] = draws(hash(key));
  const side = Math.min(cell.width, cell.height);
  const grow = overlap * (round ? 1.5 : 1) * (0.5 + 0.5 * Math.abs(r3));
  return {
    dx: r1 * shift * side,
    dy: r2 * shift * side,
    rotate: round ? 0 : r4 * tilt,
    scale: 1 + grow,
    // round photos sit on top, so their spill covers corners, not the other way round
    z: (round ? 1000 : 0) + Math.floor((r3 + 1) * 100),
  };
}
