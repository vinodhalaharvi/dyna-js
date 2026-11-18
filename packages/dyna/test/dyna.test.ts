import { describe, expect, it } from "vitest";
import {
  bruteForce, checkLaws, count, dyna, genRanked, lift, product, rankedScoresEqual, seeded, topK, ungraded, vecGet,
  type Coalgebra, type Grading, type LawResult, type Node, type Pair, type Ranked,
} from "../src/index.js";

type Coin = { done: boolean; coin: number };
const coins = (cs: number[]): Coalgebra<number, Coin> => (a) => {
  if (a === 0) return [{ label: { done: true, coin: 0 }, kids: [] }];
  const out: Node<Coin, number>[] = [];
  for (const c of cs) if (a - c >= 0) out.push({ label: { done: false, coin: c }, kids: [a - c] });
  return out;
};

describe("dyna", () => {
  it("counts the 218 ordered ways to make 11 from 1, 2 and 5", () => {
    const alg = ungraded(count<Coin>());
    const [got, st] = dyna(alg, coins([1, 2, 5]), 11);
    const [want, trees] = bruteForce(alg, coins([1, 2, 5]), 11);
    expect(got).toBe(218);
    expect(want).toBe(218);
    expect(trees).toBe(218);
    expect(st.states).toBe(12);
  });

  it("matches brute force on a knapsack graded by weight", () => {
    type Pick = { end: boolean; item: number; keep: boolean };
    const r = seeded(1);
    for (let trial = 0; trial < 30; trial++) {
      const n = 1 + Math.floor(r() * 10);
      const w = Array.from({ length: n }, () => 1 + Math.floor(r() * 6));
      const v = Array.from({ length: n }, () => r());
      const coalg: Coalgebra<number, Pick> = (i) =>
        i === n
          ? [{ label: { end: true, item: 0, keep: false }, kids: [] }]
          : [
              { label: { end: false, item: i, keep: true }, kids: [i + 1] },
              { label: { end: false, item: i, keep: false }, kids: [i + 1] },
            ];
      const grading: Grading<Pick> = {
        n: 16,
        value: (g) => g,
        of: (l, kids) => {
          if (l.end) return 0;
          let g = kids[0] as number;
          if (l.keep) g += w[l.item] as number;
          return g >= 16 ? -1 : g;
        },
      };
      const score = (l: Pick, kids: readonly number[]) => (l.end ? 0 : (kids[0] as number) + (l.keep ? (v[l.item] as number) : 0));
      const alg = lift(product(count<Pick>(), topK(3, score)), grading);
      const [dp] = dyna(alg, coalg, 0);
      const [bf] = bruteForce(alg, coalg, 0);
      const zero: Pair<number, Ranked<Pick>> = { a: 0, b: [] };
      for (let g = 0; g < 16; g++) {
        const a = vecGet(dp, g, zero), b = vecGet(bf, g, zero);
        expect(a.a).toBe(b.a);
        expect(rankedScoresEqual(a.b, b.b)).toBe(true);
      }
    }
  });
});

describe("laws", () => {
  type Pick = { item: number; keep: boolean };
  it("hold for count, topK and a bottleneck score", () => {
    const r = seeded(2);
    const labels: Pick[] = [{ item: 0, keep: true }, { item: 1, keep: false }];
    const res: LawResult[] = [
      ...checkLaws(count<Pick>(), { name: "count", labels, arity: () => 1, gen: (r) => Math.floor(r() * 6), eq: (a, b) => a === b }, 5000, r),
      ...checkLaws(topK<Pick>(3, (_l, kids) => (kids[0] as number) + 0.5), { name: "topK", labels, arity: () => 1, gen: genRanked(3, labels[0] as Pick), eq: rankedScoresEqual }, 5000, r),
      ...checkLaws(
        topK<string>(3, (_l, kids, _s, g) => {
          const f = (g[0] as number) / ((g[0] as number) + (g[1] as number));
          return Math.min((kids[0] as number) * f, (kids[1] as number) * (1 - f));
        }),
        { name: "topK bottleneck", labels: ["cut"], arity: () => 2, gen: genRanked(3, "leaf"), eq: rankedScoresEqual },
        5000,
        r,
      ),
    ];
    for (const l of res) expect(l.ok, `${l.algebra}: ${l.law}`).toBe(true);
    expect(res).toHaveLength(15);
  });

  it("catch a score that reverses order", () => {
    const res = checkLaws(topK<Pick>(2, (_l, kids) => -(kids[0] as number)), {
      name: "bad", labels: [{ item: 0, keep: false }], arity: () => 1, gen: genRanked(3, { item: 0, keep: false }), eq: rankedScoresEqual,
    }, 5000, seeded(3));
    expect(res.find((l) => l.law === "distributes over ⊕")?.ok).toBe(false);
  });
});
