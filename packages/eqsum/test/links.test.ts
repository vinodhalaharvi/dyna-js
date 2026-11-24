import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importance, links, type Link, type Unit } from "../src/index.js";

const u = (kind: Unit["kind"], text: string, level?: number): Unit => ({ id: 0, kind, page: 0, y0: 0, y1: 10, x0: 0, x1: 100, h: 10, rows: 1, math: 0, text, padTop: 2, padBottom: 2, ...(level ? { level } : {}) });
const pairs = (ls: Link[], kind: Link["kind"]) => ls.filter((l) => l.kind === kind).map((l) => [l.from, l.to]);

describe("links", () => {
  it("joins a reference to the numbered equation it names", () => {
    const us = [u("display", "E = mc2 (1.1)"), u("prose", "From (1.1) and equation 1.2 we get"), u("display", "a = b (1.2)"), u("display", "f(4) = 2"), u("prose", "Eq. (1.2) again.")];
    expect(pairs(links(us), "ref").sort()).toEqual([[1, 0], [1, 2], [4, 2]]);
  });
  it("reads references in Chinese text", () => {
    const us = [u("display", "F = ma (3.2)"), u("prose", "由(3.2)式可得，"), u("prose", "将式（3.2）代入")];
    expect(pairs(links(us), "ref").sort()).toEqual([[1, 0], [2, 0]]);
  });
  it("takes an equation's own number for its number, not a reference", () => {
    const us = [u("display", "x = y (2)"), u("display", "z = f(2)")];
    expect(pairs(links(us), "ref")).toEqual([]);
  });
  it("joins a cited result to the equations stated in it", () => {
    const us = [u("prose", "Theorem 2.1 For all n,"), u("display", "a = b"), u("display", "c = d"), u("heading", "Next", 3), u("prose", "By Theorem 2.1 we have")];
    const r = links(us).filter((l) => l.kind === "result");
    expect(r.map((l) => [l.from, l.to])).toEqual([[4, 1], [4, 2]]);
    // shared between them
    expect(r[0]!.w).toBeCloseTo(r[1]!.w);
    expect(r[0]!.w * 2).toBeCloseTo(links([u("display", "x = 1 (1)"), u("prose", "by (1)")])[0]!.w);
  });
  it("joins a use of a symbol to the latest equation before it that defines it", () => {
    const us = [u("display", "f(n) = f(n−1) + f(n−2)"), u("display", "f(10) = 55"), u("display", "g(n) = 2n"), u("display", "φ := g ∘ f"), u("display", "y = φ(3) + 1"), u("display", "w = 0")];
    const s = pairs(links(us), "symbol");
    expect(s).toContainEqual([1, 0]);
    // f(10) = 55 works an example out: f is still the recurrence
    expect(s).toContainEqual([3, 0]);
    expect(s).not.toContainEqual([3, 1]);
    expect(s).toContainEqual([3, 2]);
    expect(s).toContainEqual([4, 3]);
  });
  it("keeps a single letter to its section, and takes x = 29 for an example", () => {
    const us = [u("display", "A = {1, 2}"), u("display", "x = 29"), u("display", "B = A ∪ x"), u("heading", "Later", 3), u("display", "C = A + 1"), u("display", "D = 2")];
    const s = pairs(links(us), "symbol");
    expect(s).toContainEqual([2, 0]);
    expect(s).not.toContainEqual([2, 1]);
    expect(s).not.toContainEqual([4, 0]);
  });
  it("leaves standard functions and a chapter's everyday letters alone", () => {
    const us = [u("display", "min(a, b) = a"), u("display", "z = min(3, 4)"), u("display", "n = 1"), u("display", "n + n = 2"), u("display", "n · 2 = 2"), u("display", "3n = n")];
    expect(pairs(links(us), "symbol")).toEqual([]);
  });
});

describe("importance", () => {
  it("is 1 for what nothing refers to, more for what is relied on, and more again the more it is", () => {
    const ls: Link[] = [{ from: 1, to: 0, w: 1, kind: "ref" }, { from: 2, to: 0, w: 1, kind: "ref" }, { from: 3, to: 0, w: 1, kind: "ref" }, { from: 3, to: 2, w: 1, kind: "ref" }];
    const imp = importance(5, () => 1, ls);
    expect(imp[1]).toBeCloseTo(1);
    expect(imp[3]).toBeCloseTo(1);
    expect(imp[4]).toBeCloseTo(1);
    expect(imp[2]!).toBeGreaterThan(1);
    expect(imp[0]!).toBeGreaterThan(imp[2]!);
    expect(Math.max(...imp)).toBeLessThanOrEqual(4);
  });
  it("is 1 everywhere when nothing refers to anything", () => {
    expect([...importance(3, () => 1, [])]).toEqual([1, 1, 1]);
  });
});

const BOOK = process.env.EQSUM_BOOK;
describe.skipIf(!BOOK || !existsSync(BOOK))("links in a real book", async () => {
  it("leave fewer symbols in a summary without the equation that defines them", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { readBook } = await import("../src/index.js");
    const open = async () => pdfjs.getDocument({ data: new Uint8Array(readFileSync(BOOK!)), verbosity: 0, fontExtraProperties: true }).promise;
    const off = await readBook((await open()) as never, pdfjs.OPS, { maxPages: 20, weights: { links: 0 } });
    const on = await readBook((await open()) as never, pdfjs.OPS, { maxPages: 20 });
    const dangling = (b: typeof on, n: number) => {
      const chosen = new Set(b.summary(n).units);
      const ls = on.links.filter((l) => l.kind === "symbol" && chosen.has(l.from));
      return ls.filter((l) => !chosen.has(l.to)).length / Math.max(1, ls.length);
    };
    for (const n of [5, 12, 20]) expect(dangling(on, n)).toBeLessThan(dangling(off, n));
    expect(dangling(on, 12)).toBeLessThan(0.2);
  }, 600_000);
});
