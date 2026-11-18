import type { Algebra, GradedAlgebra } from "./algebra.js";
import type { Node } from "./node.js";

export const MAX_ARITY = 4;

/**
 * Indexes answers by a grade: an aspect-ratio bucket, a number of seconds.
 * Grades are 0..n-1 and combine through `of`, the action of a monoid on grades.
 */
export interface Grading<L> {
  /** number of grades */
  readonly n: number;
  /** what the algebra sees for a grade */
  value(grade: number): number;
  /** a node's grade from its children's; -1 drops it */
  of(label: L, kids: readonly number[]): number;
}

/**
 * An element of the monoid semiring T[G]: a finitely supported map from grades
 * to T, like a polynomial whose exponents are grades.
 */
export interface Vec<T> {
  /** dense coefficients; null is the zero vector */
  readonly at: T[] | null;
  /** support, in insertion order */
  readonly nz: number[];
}

/** The coefficient at grade g, or `zero` if absent. */
export function vecGet<T>(v: Vec<T>, g: number, zero: T): T {
  if (v.at === null || g < 0 || g >= v.at.length) return zero;
  return v.at[g] as T;
}

/**
 * Turns a graded algebra into an algebra over grade-indexed vectors. A node's
 * vector is the convolution of its children's: every combination of child
 * grades lands at the grade `of` computes, and coefficients there are ⊕-ed.
 * If g distributes over ⊕, so does the lifted algebra.
 */
export function lift<L, T>(g: GradedAlgebra<L, T>, gr: Grading<L>): Algebra<L, Vec<T>> {
  type MVec = { at: T[] | null; nz: number[] };
  const add = (v: MVec, b: number, x: T): void => {
    if (g.isZero(x)) return;
    if (v.at === null) v.at = new Array<T>(gr.n).fill(g.zero);
    const cur = v.at[b] as T;
    if (g.isZero(cur)) {
      v.nz.push(b);
      v.at[b] = x;
      return;
    }
    v.at[b] = g.plus(cur, x);
  };
  const plus = (a: Vec<T>, b: Vec<T>): Vec<T> => {
    if (a.at === null) return b;
    if (b.at === null) return a;
    const out: MVec = { at: a.at.slice(), nz: a.nz.slice() };
    for (const i of b.nz) add(out, i, b.at[i] as T);
    return out;
  };
  const grades: number[] = [];
  const values: number[] = [];
  const coeffs: T[] = [];
  const pos = new Array<number>(MAX_ARITY).fill(0);
  // one node object, relabelled for every combination: g.alg must not keep it
  const scratch: { label: L; kids: readonly T[] } = { label: undefined as L, kids: coeffs };
  const alg = (n: Node<L, Vec<T>>): Vec<T> => {
    const out: MVec = { at: null, nz: [] };
    const k = n.kids.length;
    if (k === 0) {
      const b = gr.of(n.label, []);
      if (b >= 0) add(out, b, g.alg({ label: n.label, kids: [] }, gr.value(b), []));
      return out;
    }
    for (const kid of n.kids) if (kid.nz.length === 0) return out;
    if (k > MAX_ARITY) throw new Error("dyna.lift: nodes may have at most 4 children");
    grades.length = k;
    values.length = k;
    coeffs.length = k;
    pos.fill(0);
    for (;;) {
      for (let p = 0; p < k; p++) {
        const kid = n.kids[p] as Vec<T>;
        const b = kid.nz[pos[p] as number] as number;
        grades[p] = b;
        values[p] = gr.value(b);
        coeffs[p] = (kid.at as T[])[b] as T;
      }
      const b = gr.of(n.label, grades);
      if (b >= 0) {
        scratch.label = n.label;
        add(out, b, g.alg(scratch, gr.value(b), values));
      }
      let p = k - 1;
      while (p >= 0) {
        pos[p] = (pos[p] as number) + 1;
        if ((pos[p] as number) < (n.kids[p] as Vec<T>).nz.length) break;
        pos[p] = 0;
        p--;
      }
      if (p < 0) return out;
    }
  };
  return { zero: { at: null, nz: [] }, plus, isZero: (v) => v.nz.length === 0, alg };
}
