// Choosing a summary: a knapsack over page height, solved with dyna at two levels. Within each
// section, the best value at every height it could fill; across the book, chapters and sections,
// a heading's height counted only when something under it is chosen. The book level is lifted
// over heights, so one run answers every page count up to its budget: the slider reads it.
import { dyna, lift, type Coalgebra, type GradedAlgebra, type Node, type Stats, type Vec } from "@vhalaharvi/dyna";
import type { Unit } from "./units.js";

/** How much each kind of unit is worth, and the rules that keep a summary readable. */
export interface Weights {
  /** a display equation */
  eq: number;
  /** a paragraph next to an equation (counted only with it) */
  near: number;
  /** a paragraph two away from an equation (counted only with it) */
  next: number;
  prose: number;
  /** prose with inline math */
  mathProse: number;
  code: number;
  figure: number;
  /** share of an equation's worth when shown with none of its surrounding text */
  alone: number;
  /** each further equation in a section is worth this much of the one before */
  decay: number;
  /** share for a worked example in numbers only (3 + 7 + 11 + 15 = 36) */
  example: number;
}

export const defaultWeights: Weights = { eq: 10, near: 4, next: 2.5, prose: 1, mathProse: 1.5, code: 1, figure: 1, alone: 0.6, decay: 0.85, example: 0.5 };

/** Points between pasted regions, and the height unit (half a line). */
export const GAP = 6;
export const QUANTUM = 6.8;
export const cost = (h: number) => Math.ceil((h + GAP) / QUANTUM);

// ---- the best solution, with its witness ------------------------------------------------------

/** (max, +) with the tree that earned it. Each combination is its own object, so discarded ones are freed. */
export interface Best<L> {
  score: number;
  label: L;
  kids: Best<L>[] | null;
}

export function bestOf<L>(value: (l: L) => number): GradedAlgebra<L, Best<L> | null> {
  return {
    zero: null,
    isZero: (b) => b === null,
    plus: (a, b) => (a === null || (b !== null && b.score > a.score) ? b : a),
    alg: (n) => {
      let s = value(n.label);
      for (const k of n.kids) {
        if (k === null) return null;
        s += k.score;
      }
      return { score: s, label: n.label, kids: n.kids.length ? (n.kids.slice() as Best<L>[]) : null };
    },
  };
}

// ---- the book as chapters, sections and items ------------------------------------------------

export interface Option {
  units: number[];
  cost: number;
  /** the surrounding text's worth, or a single unit's */
  value: number;
  /** the equation's own worth (shrinks with the equations already taken in its section) */
  eq: number;
}

export interface Item {
  options: Option[];
  /** the subsection heading over it, or -1 */
  sub: number;
}

export interface Section {
  heading: number;
  items: Item[];
}

export interface Chapter {
  heading: number;
  sections: Section[];
}

const lengthFactor = (u: Unit, per: number) => 1 + per * (Math.min(u.rows, 10) - 1);

/** Whether an equation states something general (a letter for a quantity) rather than a worked example in numbers. */
export function hasVariable(text: string): boolean {
  return /(^|[^A-Za-z])[A-Za-z]{1,2}(?![A-Za-z])/.test(text);
}

/** An equation with the paragraphs nearer to it than to another (up to two each side), the rest one by one. */
function itemsOf(units: Unit[], run: number[], w: Weights): Item[] {
  const isEq = (k: number) => units[run[k]!]!.kind === "display";
  const isFig = (k: number) => units[run[k]!]!.kind === "figure";
  const anchor = run.map(() => -1);
  const dist = run.map(() => 0);
  for (let k = 0; k < run.length; k++) {
    if (isEq(k) || isFig(k)) continue;
    let before = -1;
    let after = -1;
    for (let j = k - 1; j >= 0 && k - j <= 2; j--) {
      if (isEq(j)) {
        before = j;
        break;
      }
      if (isFig(j)) break;
    }
    for (let j = k + 1; j < run.length && j - k <= 2; j++) {
      if (isEq(j)) {
        after = j;
        break;
      }
      if (isFig(j)) break;
    }
    if (after >= 0 && (before < 0 || after - k <= k - before)) [anchor[k], dist[k]] = [after, after - k];
    else if (before >= 0) [anchor[k], dist[k]] = [before, k - before];
  }
  const single = (k: number) => {
    const u = units[run[k]!]!;
    if (u.kind === "code") return w.code * lengthFactor(u, 0.05);
    if (u.kind === "figure") return w.figure;
    return (u.math > 0 ? w.mathProse : w.prose) * lengthFactor(u, 0.1);
  };
  const ctx = (k: number) => (dist[k] === 2 ? w.next : w.near) * lengthFactor(units[run[k]!]!, 0.1);
  const out: Item[] = [];
  for (let k = 0; k < run.length; k++) {
    if (anchor[k]! >= 0 && !isEq(k)) continue;
    if (!isEq(k)) {
      const u = units[run[k]!]!;
      out.push({ options: [{ units: [run[k]!], cost: cost(u.h), value: single(k), eq: 0 }], sub: -1 });
      continue;
    }
    const bef: number[] = [];
    const aft: number[] = [];
    for (let j = k - 1; j >= 0 && anchor[j] === k; j--) bef.push(j);
    for (let j = k + 1; j < run.length && anchor[j] === k; j++) aft.push(j);
    const eqU = units[run[k]!]!;
    let eqv = w.eq * (1 + 0.25 * (Math.min(eqU.rows, 5) - 1));
    if (!hasVariable(eqU.text)) eqv *= w.example;
    const options: Option[] = [];
    for (let b = 0; b <= bef.length; b++)
      for (let a = 0; a <= aft.length; a++) {
        const o: Option = { units: [], cost: cost(eqU.h), value: 0, eq: a + b === 0 ? eqv * w.alone : eqv };
        for (let i = b - 1; i >= 0; i--) {
          o.units.push(run[bef[i]!]!);
          o.cost += cost(units[run[bef[i]!]!]!.h);
          o.value += ctx(bef[i]!);
        }
        o.units.push(run[k]!);
        for (let i = 0; i < a; i++) {
          o.units.push(run[aft[i]!]!);
          o.cost += cost(units[run[aft[i]!]!]!.h);
          o.value += ctx(aft[i]!);
        }
        options.push(o);
      }
    out.push({ options, sub: -1 });
    if (aft.length) k = aft[aft.length - 1]!;
  }
  return out;
}

/** The book as chapters of sections of items. */
export function structure(units: Unit[], w: Weights): Chapter[] {
  const chapters: Chapter[] = [];
  const chap = () => (chapters.length ? chapters[chapters.length - 1]! : (chapters.push({ heading: -1, sections: [] }), chapters[0]!));
  const sec = () => {
    const c = chap();
    if (!c.sections.length) c.sections.push({ heading: -1, items: [] });
    return c.sections[c.sections.length - 1]!;
  };
  let run: number[] = [];
  let sub = -1;
  const flush = () => {
    if (run.length) for (const it of itemsOf(units, run, w)) sec().items.push({ ...it, sub });
    run = [];
  };
  units.forEach((u, i) => {
    if (u.kind !== "heading") {
      run.push(i);
      return;
    }
    flush();
    if ((u.level ?? 3) <= 2) {
      chapters.push({ heading: i, sections: [] });
      sub = -1;
    } else if (u.level === 3) {
      chap().sections.push({ heading: i, items: [] });
      sub = -1;
    } else sub = i;
  });
  flush();
  return chapters;
}

// ---- level 1: a section's best value at every height ------------------------------------------

interface SecState {
  i: number;
  any: boolean;
  subPaid: boolean;
  eqs: number;
}
interface SecLabel {
  i: number;
  o: number;
  sub: number;
  eqs: number;
}
const MAX_EQS = 8;

export function sectionProblem(s: Section, units: Unit[], w: Weights) {
  let totalCost = 0;
  for (const it of s.items) {
    totalCost += Math.max(...it.options.map((o) => o.cost));
    if (it.sub >= 0) totalCost += cost(units[it.sub]!.h);
  }
  const n = totalCost + 1;
  const costOf = (l: SecLabel) => (l.i < 0 || l.o < 0 ? 0 : s.items[l.i]!.options[l.o]!.cost + (l.sub >= 0 ? cost(units[l.sub]!.h) : 0));
  const valueOf = (l: SecLabel) => {
    if (l.i < 0 || l.o < 0) return 0;
    const o = s.items[l.i]!.options[l.o]!;
    return o.value + o.eq * Math.pow(w.decay, l.eqs);
  };
  const coalg: Coalgebra<SecState, SecLabel> = (st) => {
    if (st.i === s.items.length) return st.any ? [{ label: { i: -1, o: -1, sub: -1, eqs: 0 }, kids: [] }] : [];
    const it = s.items[st.i]!;
    const next = (paid: boolean): SecState => {
      if (st.i + 1 < s.items.length && s.items[st.i + 1]!.sub !== it.sub) paid = false;
      return { i: st.i + 1, any: st.any, subPaid: paid, eqs: st.eqs };
    };
    const out: Node<SecLabel, SecState>[] = [{ label: { i: st.i, o: -1, sub: -1, eqs: st.eqs }, kids: [next(st.subPaid)] }];
    it.options.forEach((opt, o) => {
      const nx = next(true);
      nx.any = true;
      if (opt.eq > 0) nx.eqs = Math.min(st.eqs + 1, MAX_EQS);
      out.push({ label: { i: st.i, o, sub: it.sub >= 0 && !st.subPaid ? it.sub : -1, eqs: st.eqs }, kids: [nx] });
    });
    return out;
  };
  const alg = lift(bestOf(valueOf), {
    n,
    value: (g) => g,
    of: (l, kids) => {
      let g = costOf(l);
      for (const k of kids) g += k;
      return g >= n ? -1 : g;
    },
  });
  const start: SecState = { i: 0, any: false, subPaid: s.items.length > 0 && s.items[0]!.sub < 0, eqs: 0 };
  const key = (st: SecState) => `${st.i},${+st.any},${+st.subPaid},${st.eqs}`;
  return { alg, coalg, start, key, n };
}

// ---- level 2: across the book ------------------------------------------------------------------

interface BookState {
  c: number;
  j: number;
  any: boolean;
}
interface BookLabel {
  kind: 0 | 1 | 2 | 3 | 4; // end, skip chapter, take chapter, skip section, take section at a height
  c: number;
  j: number;
  grade: number;
  value: number;
  cost: number;
}

export interface Summary {
  /** chosen units, headings included, in reading order */
  units: number[];
  value: number;
  /** height used, in quanta */
  cost: number;
}

/**
 * Solves a book once for every height up to `budget` (in quanta). `best(h)` then gives the best
 * summary within height h, for any h up to the budget, without solving again.
 */
export function solve(units: Unit[], chapters: Chapter[], budget: number, w: Weights): { best(h: number): Summary | null; stats: Stats } {
  const secVecs = chapters.map((ch) =>
    ch.sections.map((s) => {
      const p = sectionProblem(s, units, w);
      return dyna(p.alg, p.coalg, p.start, p.key)[0];
    }),
  );
  const hcost = (i: number) => (i < 0 ? 0 : cost(units[i]!.h));
  const coalg: Coalgebra<BookState, BookLabel> = (st) => {
    const L = (kind: BookLabel["kind"], extra: Partial<BookLabel> = {}): BookLabel => ({ kind, c: st.c, j: st.j, grade: 0, value: 0, cost: 0, ...extra });
    if (st.j < 0) {
      if (st.c === chapters.length) return [{ label: L(0), kids: [] }];
      return [
        { label: L(1), kids: [{ c: st.c + 1, j: -1, any: false }] },
        { label: L(2, { cost: hcost(chapters[st.c]!.heading) }), kids: [{ c: st.c, j: 0, any: false }, { c: st.c + 1, j: -1, any: false }] },
      ];
    }
    const ch = chapters[st.c]!;
    if (st.j === ch.sections.length) return st.any ? [{ label: L(0), kids: [] }] : [];
    const out: Node<BookLabel, BookState>[] = [{ label: L(3), kids: [{ c: st.c, j: st.j + 1, any: st.any }] }];
    const v = secVecs[st.c]![st.j]!;
    const h = hcost(ch.sections[st.j]!.heading);
    // only the heights where taking more pays: a height worth no more than a smaller one is never best
    let bestSoFar = -Infinity;
    for (const g of [...v.nz].sort((a, b) => a - b)) {
      const e = v.at![g]!;
      if (!e || g + h > budget || e.score <= bestSoFar) continue;
      bestSoFar = e.score;
      out.push({ label: L(4, { grade: g, value: e.score, cost: g + h }), kids: [{ c: st.c, j: st.j + 1, any: true }] });
    }
    return out;
  };
  const n = budget + 1;
  const alg = lift(bestOf((l: BookLabel) => l.value), {
    n,
    value: (g) => g,
    of: (l, kids) => {
      let g = l.cost;
      for (const k of kids) g += k;
      return g >= n ? -1 : g;
    },
  });
  const [root, stats] = dyna(alg, coalg, { c: 0, j: -1, any: false }, (s) => `${s.c},${s.j},${+s.any}`);
  // the best at or under each height, so best(h) is a lookup
  const upTo: (Best<BookLabel> | null)[] = new Array(n).fill(null);
  const gradeOf: number[] = new Array(n).fill(-1);
  let run: Best<BookLabel> | null = null;
  let runG = -1;
  for (let g = 0; g < n; g++) {
    const e = root.at?.[g] ?? null;
    if (e && (!run || e.score > run.score)) [run, runG] = [e, g];
    upTo[g] = run;
    gradeOf[g] = runG;
  }
  const read = (e: Best<BookLabel>): number[] => {
    const out: number[] = [];
    const walk = (b: Best<BookLabel>) => {
      const l = b.label;
      if (l.kind === 2 && chapters[l.c]!.heading >= 0) out.push(chapters[l.c]!.heading);
      if (l.kind === 4) {
        const s = chapters[l.c]!.sections[l.j]!;
        if (s.heading >= 0) out.push(s.heading);
        for (let se: Best<SecLabel> | null = secVecs[l.c]![l.j]!.at![l.grade]!; se; se = se.kids?.[0] ?? null) {
          const sl = se.label;
          if (sl.i >= 0 && sl.o >= 0) {
            if (sl.sub >= 0) out.push(sl.sub);
            out.push(...s.items[sl.i]!.options[sl.o]!.units);
          }
        }
      }
      for (const k of b.kids ?? []) walk(k);
    };
    walk(e);
    return out;
  };
  return {
    stats,
    best(h: number) {
      const g = Math.min(Math.max(0, Math.floor(h)), n - 1);
      const e = upTo[g];
      return e ? { units: read(e), value: e.score, cost: gradeOf[g]! } : null;
    },
  };
}

export type { Vec };
