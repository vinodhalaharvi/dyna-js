import type { Algebra } from "./algebra.js";
import { fmap, type Node } from "./node.js";

/**
 * A nondeterministic F-coalgebra S → List(F S): every way a state can shrink
 * into smaller states. A state with no way to shrink has no solutions (its
 * value is zero); a base case is a node without children.
 */
export type Coalgebra<S, L> = (s: S) => readonly Node<L, S>[];

/** How much work `dyna` did. */
export interface Stats {
  /** distinct subproblems solved */
  states: number;
  /** nodes folded: the edges of the subproblem DAG */
  alternatives: number;
}

/**
 * The dynamorphism: the hylomorphism rec = ⊕ ∘ map(alg ∘ F rec) ∘ coalg,
 * memoised on the state, so each subproblem is solved exactly once.
 * The coalgebra must be well-founded (no state may reach itself).
 *
 * States are memoised by `key`. Numbers and strings work as they are; other
 * states need a key function that is equal exactly when the states are.
 */
export function dyna<S, L, T>(
  a: Algebra<L, T>,
  coalg: Coalgebra<S, L>,
  goal: S,
  key: (s: S) => unknown = (s) => s,
): [T, Stats] {
  const memo = new Map<unknown, T>();
  const st: Stats = { states: 0, alternatives: 0 };
  const rec = (s: S): T => {
    const k = key(s);
    const hit = memo.get(k);
    if (hit !== undefined || memo.has(k)) return hit as T;
    let acc = a.zero;
    for (const node of coalg(s)) {
      st.alternatives++;
      acc = a.plus(acc, a.alg(fmap(rec, node)));
    }
    memo.set(k, acc);
    st.states++;
    return acc;
  };
  return [rec(goal), st];
}

/** The initial algebra μF: one concrete solution. */
export interface Tree<L> {
  readonly node: Node<L, Tree<L>>;
}

/** Folds one tree with an algebra (the catamorphism). */
export function cata<L, T>(alg: (n: Node<L, T>) => T, t: Tree<L>): T {
  return alg(fmap((c: Tree<L>) => cata(alg, c), t.node));
}

/** Grows every tree the coalgebra allows from `s`, without sharing. Exponential: use it to test, not to solve. */
export function unfold<S, L>(coalg: Coalgebra<S, L>, s: S): Tree<L>[] {
  const out: Tree<L>[] = [];
  for (const n of coalg(s)) {
    if (n.kids.length === 0) {
      out.push({ node: { label: n.label, kids: [] } });
      continue;
    }
    let combos: Tree<L>[][] = [[]];
    for (const kid of n.kids) {
      const sub = unfold(coalg, kid);
      const next: Tree<L>[][] = [];
      for (const c of combos) for (const t of sub) next.push([...c, t]);
      combos = next;
    }
    for (const c of combos) out.push({ node: { label: n.label, kids: c } });
  }
  return out;
}

/**
 * The specification `dyna` must meet: fold every tree on its own, then ⊕ the
 * results ("the sum over all paths of the product along each").
 */
export function bruteForce<S, L, T>(a: Algebra<L, T>, coalg: Coalgebra<S, L>, s: S): [T, number] {
  const trees = unfold(coalg, s);
  let acc = a.zero;
  for (const t of trees) acc = a.plus(acc, cata((n: Node<L, T>) => a.alg(n), t));
  return [acc, trees.length];
}
