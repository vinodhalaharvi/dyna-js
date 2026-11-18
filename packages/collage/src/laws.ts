import {
  bruteForce, checkLaws, count, dyna, genRanked, product, rankedScoresEqual, seeded, topK, vecGet,
  type LawResult, type Rand,
} from "@vinodhalaharvi/dyna";
import { BUCKETS, Grades, K, MAX_ASPECT, newAlgebra, shareScore, splits, type Cell, type Step } from "./collage.js";

const SPLITS: Step[] = [{ leaf: false, cut: "H" }, { leaf: false, cut: "V" }];
const LEAF: Step = { leaf: true, photo: 0 };

/** Checks count, topK and their product on collage's split nodes. */
export function allLaws(trials: number, seed: number): LawResult[] {
  const r = seeded(seed);
  const two = () => 2;
  const genCount = (r: Rand) => Math.floor(r() * 6);
  const eqCount = (a: number, b: number) => a === b;
  const genTop = genRanked(K, LEAF);
  return [
    ...checkLaws(count<Step>(), { name: "Count (+,×)", labels: SPLITS, arity: two, gen: genCount, eq: eqCount }, trials, r),
    ...checkLaws(topK(K, shareScore), { name: "TopK₃ (max,min)", labels: SPLITS, arity: two, gen: genTop, eq: rankedScoresEqual }, trials, r),
    ...checkLaws(product(count<Step>(), topK(K, shareScore)), {
      name: "Count × TopK₃", labels: SPLITS, arity: two,
      gen: (r): Cell => ({ a: genCount(r), b: genTop(r) }),
      eq: (x, y) => eqCount(x.a, y.a) && rankedScoresEqual(x.b, y.b),
    }, trials, r),
  ];
}

export interface DynaCheck {
  photos: number;
  trees: number;
  states: number;
  alternatives: number;
  ok: boolean;
}

/** Compares the memoised dynamorphism with brute force (fold every tree, ⊕ the results) on random photos. */
export function verifyDyna(n: number, seed: number): DynaCheck {
  const r = seeded(seed);
  const aspects = Array.from({ length: n }, () => Math.exp((r() * 2 - 1) * Math.log(2.5)));
  const gr = new Grades(BUCKETS, MAX_ASPECT);
  const alg = newAlgebra(aspects, gr);
  const full = 2 ** n - 1;
  const [dp, st] = dyna(alg, splits(), full);
  const [bf, trees] = bruteForce(alg, splits(), full);
  const zero: Cell = { a: 0, b: [] };
  let ok = dp.nz.length === bf.nz.length;
  for (let b = 0; ok && b < gr.b; b++) {
    const x = vecGet(dp, b, zero), y = vecGet(bf, b, zero);
    ok = Math.abs(x.a - y.a) < 1e-6 && rankedScoresEqual(x.b, y.b);
  }
  return { photos: n, trees, states: st.states, alternatives: st.alternatives, ok };
}
