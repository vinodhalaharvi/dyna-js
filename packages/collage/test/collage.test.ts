import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUCKETS, Grades, MAX_ASPECT, allLaws, solve, verifyDyna, type Bar, type Layout, type LayoutNode } from "../src/index.js";

interface Fixture {
  aspects: number[];
  states: number;
  alternatives: number;
  bars: Bar[];
  total: number;
  canvases: { canvas: number; layouts: Layout[] }[];
}

// Reference answers from the Go engine (fixtures/gen).
const ref: { centers: number[]; cases: Fixture[] } = JSON.parse(readFileSync(new URL("../../../fixtures/collage.json", import.meta.url), "utf8"));
const fixtures = ref.cases;
// Go's bucket centres: exp() differs in the last bit between Go and JavaScript
// for some inputs, and a last-bit difference can reorder exact ties.
const goGrades = new Grades(BUCKETS, MAX_ASPECT, ref.centers);

const close = (a: number, b: number, what: string) => expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThan(1e-12);

function sameTree(a: LayoutNode, b: LayoutNode, at: string): void {
  expect(a.p, at).toBe(b.p);
  expect(a.c ?? "", at).toBe(b.c ?? "");
  close(a.a, b.a, at + " aspect");
  if (a.p < 0) {
    sameTree(a.l as LayoutNode, b.l as LayoutNode, at + ".l");
    sameTree(a.r as LayoutNode, b.r as LayoutNode, at + ".r");
  }
}

describe("collage matches the Go engine", () => {
  it.each(fixtures.map((f, i) => [i, f.aspects.length, f] as const))("case %i (%i photos)", (_i, _n, f) => {
    const s = solve(f.aspects, goGrades);
    expect(s.stats.states).toBe(f.states);
    expect(s.stats.alternatives).toBe(f.alternatives);
    const [bars, total] = s.histogram();
    expect(total).toBe(f.total);
    expect(bars.length).toBe(f.bars.length);
    bars.forEach((b, j) => {
      const g = f.bars[j] as Bar;
      close(b.aspect, g.aspect, "bar aspect");
      expect(b.count).toBe(g.count);
    });
    for (const cv of f.canvases) {
      const got = s.layouts(cv.canvas, 5);
      expect(got.length).toBe(cv.layouts.length);
      got.forEach((l, j) => {
        const g = cv.layouts[j] as Layout;
        const at = `canvas ${cv.canvas} layout ${j}`;
        sameTree(l.tree, g.tree, at);
        close(l.aspect, g.aspect, at + " aspect");
        close(l.minShare, g.minShare, at + " minShare");
        close(l.crop, g.crop, at + " crop");
        close(l.rank, g.rank, at + " rank");
      });
    }
  }, 60_000);
});

describe("collage with its own bucket centres", () => {
  it("counts the same layouts and finds the same best one as Go", () => {
    let maxCentre = 0;
    const own = new Grades(BUCKETS, MAX_ASPECT);
    ref.centers.forEach((c, b) => (maxCentre = Math.max(maxCentre, Math.abs(c - own.centerOf(b)) / c)));
    expect(maxCentre).toBeLessThan(1e-15);
    for (const f of fixtures.filter((f) => f.aspects.length <= 8)) {
      const s = solve(f.aspects);
      expect(s.histogram()[1]).toBe(f.total);
      for (const cv of f.canvases) close(s.layouts(cv.canvas, 1)[0]?.rank ?? -1, cv.layouts[0]?.rank ?? -2, "best rank");
    }
  });
});

describe("collage laws", () => {
  it("count, topK and their product obey the semiring laws", () => {
    const res = allLaws(3000, 11);
    expect(res).toHaveLength(15);
    for (const l of res) expect(l.ok, `${l.algebra}: ${l.law}`).toBe(true);
  });

  it.each([1, 2, 3, 4, 5])("dyna equals brute force with %i photos", (n) => {
    const c = verifyDyna(n, 100 + n);
    expect(c.ok).toBe(true);
    expect(c.states).toBe(2 ** n - 1);
  });
});

describe("solve", () => {
  it("rejects what the table cannot hold", () => {
    expect(() => solve([])).toThrow(RangeError);
    expect(() => solve(new Array(10).fill(1))).toThrow(RangeError);
    expect(() => solve(new Array(9).fill(1))).not.toThrow();
    expect(() => solve([1, 0])).toThrow(RangeError);
    expect(() => solve([1, Number.NaN])).toThrow(RangeError);
  });

  it("solves eight photos in well under a second or two", () => {
    const t = performance.now();
    const s = solve([1.5, 0.67, 1, 1.78, 0.75, 1.33, 2, 0.5]);
    const ms = performance.now() - t;
    expect(s.layouts(16 / 9, 1)).toHaveLength(1);
    expect(s.stats).toEqual({ states: 255, alternatives: 6058 });
    expect(ms).toBeLessThan(3000);
  });
});
