import type { GradedAlgebra } from "./algebra.js";
import { MAX_ARITY } from "./lift.js";

/** One solution kept by `topK`: its score and the tree that earned it (a witness). */
export interface Entry<L> {
  readonly score: number;
  readonly label: L;
  readonly kids: readonly Entry<L>[];
}

/** A topK value: at most k entries, best first. */
export type Ranked<L> = readonly Entry<L>[];

/**
 * Combines a node's label, its children's scores and grades into the node's
 * score. It must be monotone (non-decreasing) in every child score: that is
 * what makes topK distribute over ⊕.
 */
export type Score<L> = (label: L, kids: readonly number[], self: number, grades: readonly number[]) => number;

/**
 * Keeps the k best solutions by score: the (max, ⊗) semiring lifted to k-best
 * lists, with witnesses. ⊕ merges two lists; a node scores every combination
 * of its children's entries and keeps the k best. Ties keep the first found.
 */
export function topK<L>(k: number, score: Score<L>): GradedAlgebra<L, Ranked<L>> {
  const plus = (a: Ranked<L>, b: Ranked<L>): Ranked<L> => {
    if (b.length === 0) return a;
    if (a.length === 0) return b;
    if (a.length === k && (b[0] as Entry<L>).score <= (a[k - 1] as Entry<L>).score) return a;
    const out: Entry<L>[] = [];
    let i = 0;
    let j = 0;
    while (out.length < k && (i < a.length || j < b.length)) {
      if (j >= b.length || (i < a.length && (a[i] as Entry<L>).score >= (b[j] as Entry<L>).score)) out.push(a[i++] as Entry<L>);
      else out.push(b[j++] as Entry<L>);
    }
    return out;
  };
  const scores: number[] = [];
  // candidates: score and the index into each child's list, in flat buffers
  let cs = new Float64Array(64);
  let ci = new Int32Array(64 * MAX_ARITY);
  const idx = new Array<number>(MAX_ARITY).fill(0);
  return {
    zero: [],
    plus,
    isZero: (r) => r.length === 0,
    alg(n, self, grades) {
      const nk = n.kids.length;
      if (nk === 0) return [{ score: score(n.label, [], self, []), label: n.label, kids: [] }];
      for (const kid of n.kids) if (kid.length === 0) return [];
      if (nk > MAX_ARITY) throw new Error("dyna.topK: nodes may have at most 4 children");
      let nc = 0;
      idx.fill(0);
      for (;;) {
        scores.length = 0;
        for (let p = 0; p < nk; p++) scores.push(((n.kids[p] as Ranked<L>)[idx[p] as number] as Entry<L>).score);
        if (nc === cs.length) {
          const cs2 = new Float64Array(nc * 2);
          cs2.set(cs);
          cs = cs2;
          const ci2 = new Int32Array(nc * 2 * MAX_ARITY);
          ci2.set(ci);
          ci = ci2;
        }
        cs[nc] = score(n.label, scores, self, grades);
        for (let p = 0; p < nk; p++) ci[nc * MAX_ARITY + p] = idx[p] as number;
        nc++;
        let p = nk - 1;
        while (p >= 0) {
          idx[p] = (idx[p] as number) + 1;
          if ((idx[p] as number) < (n.kids[p] as Ranked<L>).length) break;
          idx[p] = 0;
          p--;
        }
        if (p < 0) break;
      }
      // stable selection of the k best (ties keep enumeration order)
      const m = Math.min(k, nc);
      for (let i = 0; i < m; i++) {
        let best = i;
        for (let j = i + 1; j < nc; j++) if ((cs[j] as number) > (cs[best] as number)) best = j;
        if (best !== i) {
          const s = cs[best] as number;
          const x = ci.slice(best * MAX_ARITY, best * MAX_ARITY + MAX_ARITY);
          cs.copyWithin(i + 1, i, best);
          ci.copyWithin((i + 1) * MAX_ARITY, i * MAX_ARITY, best * MAX_ARITY);
          cs[i] = s;
          ci.set(x, i * MAX_ARITY);
        }
      }
      const out: Entry<L>[] = new Array(m);
      for (let c = 0; c < m; c++) {
        const kids: Entry<L>[] = new Array(nk);
        for (let p = 0; p < nk; p++) kids[p] = (n.kids[p] as Ranked<L>)[ci[c * MAX_ARITY + p] as number] as Entry<L>;
        out[c] = { score: cs[c] as number, label: n.label, kids };
      }
      return out;
    },
  };
}
