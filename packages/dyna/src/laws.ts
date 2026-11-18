import type { GradedAlgebra } from "./algebra.js";
import type { Entry, Ranked } from "./topk.js";

/** A small seeded random source, so law checks can be repeated. */
export type Rand = () => number;

/** mulberry32: a fast seeded generator of numbers in [0, 1). */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const intn = (r: Rand, n: number): number => Math.floor(r() * n);

/** The outcome of one law on one algebra. */
export interface LawResult {
  algebra: string;
  law: string;
  ok: boolean;
  trials: number;
}

/** How to test a graded algebra: labels with children, random elements, equality. */
export interface LawSpec<L, T> {
  name: string;
  /** labels of nodes with children */
  labels: readonly L[];
  arity(l: L): number;
  gen(r: Rand): T;
  eq(a: T, b: T): boolean;
  /** random grade values; default (0.2, 5.2) */
  grade?(r: Rand): number;
}

/**
 * Property-tests the laws `dyna` relies on: ⊕ is a commutative monoid, and
 * every node is multilinear in its children (distributes over ⊕ in each
 * position) and annihilated by zero.
 */
export function checkLaws<L, T>(g: GradedAlgebra<L, T>, spec: LawSpec<L, T>, trials: number, r: Rand): LawResult[] {
  const grade = spec.grade ?? ((r: Rand) => 0.2 + 5 * r());
  const step = (l: L, kids: T[], p: number, x: T, self: number, gs: number[]): T => {
    const ks = kids.slice();
    ks[p] = x;
    return g.alg({ label: l, kids: ks }, self, gs);
  };
  const pick = (): [L, T[], number, number, number[]] => {
    const l = spec.labels[intn(r, spec.labels.length)] as L;
    const n = spec.arity(l);
    const kids: T[] = [];
    const gs: number[] = [];
    for (let i = 0; i < n; i++) {
      kids.push(spec.gen(r));
      gs.push(grade(r));
    }
    return [l, kids, intn(r, n), grade(r), gs];
  };
  const laws: [string, () => boolean][] = [
    ["⊕ associative", () => {
      const x = spec.gen(r), y = spec.gen(r), z = spec.gen(r);
      return spec.eq(g.plus(g.plus(x, y), z), g.plus(x, g.plus(y, z)));
    }],
    ["⊕ commutative", () => {
      const x = spec.gen(r), y = spec.gen(r);
      return spec.eq(g.plus(x, y), g.plus(y, x));
    }],
    ["0 is ⊕-identity", () => {
      const x = spec.gen(r);
      return spec.eq(g.plus(x, g.zero), x);
    }],
    ["distributes over ⊕", () => {
      const [l, kids, p, self, gs] = pick();
      const x = spec.gen(r), y = spec.gen(r);
      return spec.eq(step(l, kids, p, g.plus(x, y), self, gs), g.plus(step(l, kids, p, x, self, gs), step(l, kids, p, y, self, gs)));
    }],
    ["0 annihilates", () => {
      const [l, kids, p, self, gs] = pick();
      return g.isZero(step(l, kids, p, g.zero, self, gs));
    }],
  ];
  return laws.map(([law, ok]) => {
    let good = true;
    for (let i = 0; i < trials && good; i++) good = ok();
    return { algebra: spec.name, law, ok: good, trials };
  });
}

/** Compares two topK values by their scores (ties may pick different witnesses). */
export function rankedScoresEqual<L>(a: Ranked<L>, b: Ranked<L>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs((a[i] as Entry<L>).score - (b[i] as Entry<L>).score) > 1e-9) return false;
  return true;
}

/** Makes random topK values of up to k leaf entries, with ties. */
export function genRanked<L>(k: number, label: L): (r: Rand) => Ranked<L> {
  return (r) => {
    const n = intn(r, k + 1);
    const out: Entry<L>[] = [];
    let s = 1;
    for (let i = 0; i < n; i++) {
      s *= 0.3 + 0.7 * r();
      if (i > 0 && intn(r, 4) === 0) s = (out[i - 1] as Entry<L>).score;
      out.push({ score: s, label, kids: [] });
    }
    return out;
  };
}
