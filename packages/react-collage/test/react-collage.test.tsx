// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { solve } from "@vinodhalaharvi/collage";
import { CollageAlbum, cells, type Photo } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const photos: Photo[] = [
  { src: "a.jpg", width: 612, height: 612, alt: "a" },
  { src: "b.jpg", width: 500, height: 667, alt: "b" },
  { src: "c.jpg", width: 500, height: 282, alt: "c" },
  { src: "d.jpg", width: 423, height: 750, alt: "d" },
  { src: "e.jpg", width: 500, height: 375, alt: "e" },
];

describe("cells", () => {
  it("tile the canvas exactly, once per photo, with no overlap", () => {
    const s = solve(photos.map((p) => p.width / p.height));
    for (const canvas of [0.6, 1, 16 / 9, 3]) {
      const W = 900, H = W / canvas;
      for (const l of s.layouts(canvas, 5)) {
        const cs = cells(l.tree, W, H);
        expect(cs.map((c) => c.index).sort()).toEqual([0, 1, 2, 3, 4]);
        const area = cs.reduce((a, c) => a + c.width * c.height, 0);
        expect(Math.abs(area - W * H) / (W * H)).toBeLessThan(1e-9);
        for (const c of cs) {
          expect(c.x).toBeGreaterThanOrEqual(-1e-9);
          expect(c.y).toBeGreaterThanOrEqual(-1e-9);
          expect(c.x + c.width).toBeLessThanOrEqual(W + 1e-9);
          expect(c.y + c.height).toBeLessThanOrEqual(H + 1e-9);
        }
        for (const a of cs)
          for (const b of cs)
            if (a !== b) {
              const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
              const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
              expect(ox <= 1e-9 || oy <= 1e-9).toBe(true);
            }
      }
    }
  });

  it("leave the gap between photos and none at the edges", () => {
    const s = solve([1, 1]);
    const [l] = s.layouts(2, 1);
    const cs = cells(l!.tree, 200, 100, 10);
    const xs = cs.map((c) => [c.x, c.x + c.width]).sort((p, q) => p[0]! - q[0]!);
    expect(xs).toEqual([[0, 95], [105, 200]]);
    expect(cs.every((c) => c.y === 0 && c.height === 100)).toBe(true);
  });
});

describe("CollageAlbum", () => {
  let el: HTMLDivElement;
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 450; } });
  });
  afterEach(() => el?.remove());

  it("renders on the server without photos placed yet", () => {
    const html = renderToString(<CollageAlbum photos={photos} aspect={16 / 9} />);
    expect(html).toContain('data-collage-state="solving"');
    expect(html).not.toContain("<img");
  });

  it("places every photo once solved, and reports the layouts", async () => {
    el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    let offered = 0;
    await act(async () => {
      root.render(<CollageAlbum photos={photos} aspect={16 / 9} gap={6} onLayouts={(ls) => (offered = ls.length)} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(el.querySelector("[data-collage-state]")?.getAttribute("data-collage-state")).toBe("ready");
    const imgs = [...el.querySelectorAll("img")].map((i) => i.getAttribute("alt")).sort();
    expect(imgs).toEqual(["a", "b", "c", "d", "e"]);
    expect(offered).toBe(5);
    await act(async () => root.render(<CollageAlbum photos={photos} aspect={16 / 9} suggestion={2} />));
    expect(el.querySelectorAll("img")).toHaveLength(5);
    act(() => root.unmount());
  });
});
