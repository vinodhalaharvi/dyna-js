import type { Node } from "./node.js";

/**
 * The "choose" half of a semiring: ⊕ with identity `zero`.
 * Laws: associative, commutative, `zero` is the identity.
 */
export interface Monoid<T> {
  readonly zero: T;
  plus(a: T, b: T): T;
  isZero(x: T): boolean;
}

/**
 * An F-algebra Node<L, T> → T over a commutative monoid (T, ⊕). Its law is
 * distributivity, which for a functor means multilinearity: in every child
 * position, alg(… x⊕y …) = alg(… x …) ⊕ alg(… y …) and alg(… 0 …) = 0.
 */
export interface Algebra<L, T> extends Monoid<T> {
  alg(n: Node<L, T>): T;
}

/**
 * An algebra whose step may read each child's grade value (an aspect ratio, a
 * duration). `lift` turns it into an ordinary Algebra over grade-indexed
 * vectors. For a node without children, `grades` is empty and the node's own
 * grade value is passed in `self`.
 *
 * `alg` must not keep `n`, `n.kids` or `grades`: `lift` and `product` reuse them.
 */
export interface GradedAlgebra<L, T> extends Monoid<T> {
  alg(n: Node<L, T>, self: number, grades: readonly number[]): T;
}

/** The carrier of a product algebra. */
export interface Pair<A, B> {
  readonly a: A;
  readonly b: B;
}

/** Runs two graded algebras in one pass, componentwise. Lawful whenever both factors are. */
export function product<L, A, B>(x: GradedAlgebra<L, A>, y: GradedAlgebra<L, B>): GradedAlgebra<L, Pair<A, B>> {
  const ka: A[] = [];
  const kb: B[] = [];
  const na: { label: L; kids: readonly A[] } = { label: undefined as L, kids: ka };
  const nb: { label: L; kids: readonly B[] } = { label: undefined as L, kids: kb };
  return {
    zero: { a: x.zero, b: y.zero },
    plus: (p, q) => ({ a: x.plus(p.a, q.a), b: y.plus(p.b, q.b) }),
    isZero: (p) => x.isZero(p.a) && y.isZero(p.b),
    alg(n, self, grades) {
      ka.length = 0;
      kb.length = 0;
      for (const k of n.kids) {
        ka.push(k.a);
        kb.push(k.b);
      }
      na.label = n.label;
      nb.label = n.label;
      return { a: x.alg(na, self, grades), b: y.alg(nb, self, grades) };
    },
  };
}

/** (+, ×): the number of solutions. A node counts the product of its children's counts. */
export function count<L>(): GradedAlgebra<L, number> {
  return {
    zero: 0,
    plus: (a, b) => a + b,
    isZero: (x) => x === 0,
    alg(n) {
      let p = 1;
      for (const k of n.kids) p *= k;
      return p;
    },
  };
}

/** Uses a graded algebra where no grading is needed: every grade value it sees is 0. */
export function ungraded<L, T>(g: GradedAlgebra<L, T>): Algebra<L, T> {
  const zeros: number[] = [];
  return {
    zero: g.zero,
    plus: g.plus,
    isZero: g.isZero,
    alg(n) {
      while (zeros.length < n.kids.length) zeros.push(0);
      return g.alg(n, 0, zeros.slice(0, n.kids.length));
    },
  };
}
