import {
  dyna, lift, product, count, topK,
  type Algebra, type Coalgebra, type Entry, type Grading, type Node as DNode, type Pair, type Ranked, type Stats, type Vec,
} from "@vhalaharvi/dyna";
import { aspect, fracL, type Cut } from "./functor.js";

// ---------- The functor's labels and the coalgebra ----------

/** One layout step: a leaf holding a photo, or a cut with two children. */
export type Step = { readonly leaf: true; readonly photo: number } | { readonly leaf: false; readonly cut: Cut };

const CUTS: { readonly [c in Cut]: Step } = { H: { leaf: false, cut: "H" }, V: { leaf: false, cut: "V" } };
const LEAVES: Step[] = [];
const leafStep = (p: number): Step => (LEAVES[p] ??= { leaf: true, photo: p });

/**
 * The collage coalgebra on bitmask states. A single photo is a leaf; otherwise
 * every split into A ∪ B (A holding the lowest photo, so mirror images are not
 * counted twice) can be cut side by side or stacked.
 */
export function splits(): Coalgebra<number, Step> {
  return (m) => {
    if ((m & (m - 1)) === 0) return [{ label: leafStep(31 - Math.clz32(m)), kids: [] }];
    const low = (m & -m) >>> 0;
    const rest = (m ^ low) >>> 0;
    const out: DNode<Step, number>[] = [];
    for (let sub = rest; ; sub = ((sub - 1) & rest) >>> 0) {
      const a = (low | sub) >>> 0;
      if (a !== m) {
        const b = (m ^ a) >>> 0;
        out.push({ label: CUTS.H, kids: [a, b] }, { label: CUTS.V, kids: [a, b] });
      }
      if (sub === 0) break;
    }
    return out;
  };
}

// ---------- Grades: aspect-ratio buckets ----------

/** Rounds half away from zero, as Go's math.Round does. */
const round = (x: number): number => Math.sign(x) * Math.round(Math.abs(x));

/** Buckets log-aspect uniformly over [1/maxAspect, maxAspect]; a cut combines buckets through the aspect monoid. */
export class Grades {
  readonly b: number;
  private readonly lo: number;
  private readonly step: number;
  private readonly center: Float64Array;
  private readonly comb: [Int32Array, Int32Array];

  /**
   * `centers` replaces the computed bucket centres. Platforms differ in the
   * last bit of exp(), so tests pass another engine's centres to compare
   * answers exactly; nothing else needs it.
   */
  constructor(b: number, maxAspect: number, centers?: ArrayLike<number>) {
    const lo = -Math.log(maxAspect), hi = Math.log(maxAspect);
    this.b = b;
    this.lo = lo;
    this.step = (hi - lo) / (b - 1);
    this.center = new Float64Array(b);
    for (let i = 0; i < b; i++) this.center[i] = centers ? (centers[i] as number) : Math.exp(lo + i * this.step);
    this.comb = [new Int32Array(b * b), new Int32Array(b * b)];
    for (const [c, t] of [["H", this.comb[0]], ["V", this.comb[1]]] as const)
      for (let i = 0; i < b; i++)
        for (let j = 0; j < b; j++) t[i * b + j] = this.of(aspect(c, this.center[i] as number, this.center[j] as number));
  }

  /** The bucket of an aspect, or -1 when it falls outside the range. */
  of(a: number): number {
    const x = round((Math.log(a) - this.lo) / this.step);
    return x < 0 || x >= this.b ? -1 : x;
  }

  centerOf(b: number): number {
    return this.center[b] as number;
  }

  /** dyna's grading for these photos. */
  grading(aspects: readonly number[]): Grading<Step> {
    return {
      n: this.b,
      value: (g) => this.center[g] as number,
      of: (l, kids) => {
        if (l.leaf) return this.of(aspects[l.photo] as number);
        return this.comb[l.cut === "H" ? 0 : 1][(kids[0] as number) * this.b + (kids[1] as number)] as number;
      },
    };
  }
}

// ---------- The algebra: Count × TopK, lifted by aspect ----------

/** How many layouts are kept per subproblem and aspect. */
export const K = 3;
export const BUCKETS = 64;
export const MAX_ASPECT = 12;
/** Trades crop against balance when ranking: rank = minShare · fit^FIT_WEIGHT. */
export const FIT_WEIGHT = 8;
/** The most photos one collage takes: the work grows about threefold with each photo, and nine take a second or two. */
export const MAX_PHOTOS = 9;

/**
 * The area share of the smallest photo. Maximising the minimum is the
 * (max, min) "widest path" semiring; each side is scaled by its share of the
 * area, which is monotone, so topK distributes over ⊕.
 */
export function shareScore(l: Step, kids: readonly number[], _self: number, grades: readonly number[]): number {
  if (l.leaf) return 1;
  const f = fracL(l.cut, grades[0] as number, grades[1] as number);
  return Math.min((kids[0] as number) * f, (kids[1] as number) * (1 - f));
}

export type Cell = Pair<number, Ranked<Step>>;

export function newAlgebra(aspects: readonly number[], gr: Grades): Algebra<Step, Vec<Cell>> {
  return lift(product(count<Step>(), topK(K, shareScore)), gr.grading(aspects));
}

// ---------- Reading answers out ----------

/** A layout tree evaluated with the photos' exact aspect ratios. */
export interface LayoutNode {
  /** photo index, -1 for a split */
  readonly p: number;
  readonly c?: Cut;
  /** natural aspect (width / height) of this sub-collage */
  readonly a: number;
  readonly l?: LayoutNode;
  readonly r?: LayoutNode;
}

export interface Layout {
  readonly tree: LayoutNode;
  readonly aspect: number;
  /** area share of the smallest photo, before cropping to the canvas */
  readonly minShare: number;
  /** fraction of the layout cropped away to fit the canvas */
  readonly crop: number;
  readonly rank: number;
}

/** How many layouts exist at one aspect ratio. */
export interface Bar {
  readonly aspect: number;
  readonly count: number;
}

/** A solved collage: every layout of these photos, indexed by aspect ratio. */
export class Collage {
  constructor(
    readonly aspects: readonly number[],
    readonly grades: Grades,
    readonly root: Vec<Cell>,
    readonly stats: Stats,
  ) {}

  /** Re-folds a witness tree with the real aspects (not bucket centres). */
  private exact(e: Entry<Step>): [LayoutNode, number] {
    if (e.label.leaf) return [{ p: e.label.photo, a: this.aspects[e.label.photo] as number }, 1];
    const cut = e.label.cut;
    const [l, sL] = this.exact(e.kids[0] as Entry<Step>);
    const [r, sR] = this.exact(e.kids[1] as Entry<Step>);
    const f = fracL(cut, l.a, r.a);
    return [{ p: -1, c: cut, a: aspect(cut, l.a, r.a), l, r }, Math.min(sL * f, sR * (1 - f))];
  }

  /**
   * Ranks every stored layout for a canvas of the given aspect (width/height)
   * and returns up to k that differ at a glance. No re-solve: the table is
   * indexed by aspect, so resizing is a lookup.
   */
  layouts(canvas: number, k: number): Layout[] {
    const all: Layout[] = [];
    if (this.root.at === null) return [];
    for (const b of this.root.nz) {
      for (const e of (this.root.at[b] as Cell).b) {
        const [n, share] = this.exact(e);
        const fit = Math.min(n.a / canvas, canvas / n.a);
        all.push({ tree: n, aspect: n.a, minShare: share, crop: 1 - fit, rank: share * powInt(fit, FIT_WEIGHT) });
      }
    }
    all.sort((x, y) => y.rank - x.rank);
    // Suggestions should differ at a glance, not by a swap deep in one column:
    // keep the best layout for each (hero photo, first cut, photos left of it).
    const out: Layout[] = [];
    const seen = new Set<string>();
    for (const l of all) {
      const s = gist(l.tree);
      if (!seen.has(s)) {
        seen.add(s);
        out.push(l);
        if (out.length === k) break;
      }
    }
    return out;
  }

  /** The Count component of the graded root: how many layouts exist at each aspect ratio. */
  histogram(): [Bar[], number] {
    const bars: Bar[] = [];
    let total = 0;
    if (this.root.at !== null)
      for (const b of this.root.nz) {
        const n = (this.root.at[b] as Cell).a;
        bars.push({ aspect: this.grades.centerOf(b), count: n });
        total += n;
      }
    bars.sort((x, y) => x.aspect - y.aspect);
    return [bars, total];
  }
}

/**
 * Solves every layout of photos with these aspect ratios (width / height),
 * each clamped to what the table can hold. Takes 1 to MAX_PHOTOS photos.
 */
export function solve(aspects: readonly number[], grades: Grades = new Grades(BUCKETS, MAX_ASPECT)): Collage {
  if (aspects.length < 1 || aspects.length > MAX_PHOTOS) throw new RangeError(`collage takes 1 to ${MAX_PHOTOS} photos, got ${aspects.length}`);
  for (const a of aspects) if (!(a > 0) || !Number.isFinite(a)) throw new RangeError(`aspect ratios must be positive numbers, got ${a}`);
  const full = (2 ** aspects.length - 1) >>> 0;
  const [root, st] = dyna(newAlgebra(aspects, grades), splits(), full);
  return new Collage(aspects, grades, root, st);
}

/** Keeps a photo's aspect inside what one cell of the table can hold. */
export function clampAspect(a: number): number {
  return Math.min(MAX_ASPECT / 2, Math.max(2 / MAX_ASPECT, a));
}

/**
 * x^n for a whole n ≥ 0 by repeated squaring. Unlike Math.pow, every engine
 * rounds this the same way, so exact ties in rank stay ties everywhere.
 */
function powInt(x: number, n: number): number {
  let r = 1;
  for (let b = x, i = n; i > 0; i >>= 1, b *= b) if (i & 1) r *= b;
  return r;
}

/**
 * Names what a viewer notices first: the largest photo, the direction of the
 * first cut, and how many photos sit on its left (or top) side.
 */
function gist(n: LayoutNode): string {
  let hero = -1, best = -1;
  const walk = (m: LayoutNode, share: number): void => {
    if (m.p >= 0) {
      if (share > best) {
        hero = m.p;
        best = share;
      }
      return;
    }
    const l = m.l as LayoutNode, r = m.r as LayoutNode;
    const f = fracL(m.c as Cut, l.a, r.a);
    walk(l, share * f);
    walk(r, share * (1 - f));
  };
  walk(n, 1);
  return `${hero}/${n.c ?? ""}/${leaves(n.l)}`;
}

function leaves(n: LayoutNode | undefined): number {
  if (n === undefined) return 0;
  if (n.p >= 0) return 1;
  return leaves(n.l) + leaves(n.r);
}
