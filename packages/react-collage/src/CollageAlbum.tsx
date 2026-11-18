import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MAX_PHOTOS, solve, type Collage, type Layout } from "@vinodhalaharvi/collage";
import { cells, photoAspect, type Cell } from "./geometry.js";
import { placement, type ScrapbookOptions } from "./scrapbook.js";

export interface Photo {
  src: string;
  /** natural width; only the ratio to height matters */
  width: number;
  height: number;
  alt?: string;
  key?: string;
  /** "round" draws the photo as an oval: a circle when it is square, an ellipse otherwise */
  shape?: "rect" | "round";
}

export interface CollageAlbumProps<P extends Photo = Photo> {
  /** 1 to 10 photos; more are ignored */
  photos: readonly P[];
  /**
   * Width / height of the collage. Leave it out to fill the height the
   * container gives the album (the container then needs a height).
   */
  aspect?: number;
  /** pixels between photos (default 4) */
  gap?: number;
  /** which of the suggested layouts to show: 0 is the best (default 0) */
  suggestion?: number;
  /** how many distinct layouts to offer through onLayouts (default 5) */
  suggestions?: number;
  /** called with the layouts on offer whenever they change */
  onLayouts?: (layouts: readonly Layout[]) => void;
  /**
   * "grid" (default) fills the frame edge to edge. "scrapbook" keeps the
   * layout's own shape, frames each photo in white, and tilts and overlaps
   * them a little.
   */
  variant?: "grid" | "scrapbook";
  /** fine-tunes the scrapbook look */
  scrapbook?: ScrapbookOptions;
  /** draws one photo; the default is an <img> that covers its cell */
  renderPhoto?: (photo: P, cell: Cell) => ReactNode;
  onPhotoClick?: (photo: P, index: number) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The solved table for these photos, or null while solving. Solving waits for
 * the browser to paint first; the same photos (by shape) are never solved twice.
 */
export function useCollage(aspects: readonly number[]): Collage | null {
  const sig = aspects.join(",");
  const [state, setState] = useState<{ sig: string; c: Collage } | null>(null);
  useEffect(() => {
    if (aspects.length === 0) return;
    const hit = cache.get(sig);
    if (hit) {
      setState({ sig, c: hit });
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      const c = solve(aspects);
      remember(sig, c);
      if (live) setState({ sig, c });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // sig carries the aspects' value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return state?.sig === sig ? state.c : (cache.get(sig) ?? null);
}

const cache = new Map<string, Collage>();
function remember(sig: string, c: Collage): void {
  cache.set(sig, c);
  if (cache.size > 16) cache.delete(cache.keys().next().value as string);
}

/** Tracks an element's content size. */
function useSize(): [(el: HTMLDivElement | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = (el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const read = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    read();
    if (typeof ResizeObserver !== "undefined") {
      ro.current = new ResizeObserver(read);
      ro.current.observe(el);
    }
  };
  return [ref, size];
}

/**
 * A photo collage that lays out any 1 to 10 photos with no gaps and little
 * cropping. Every canvas shape is solved up front, so resizing the album is a
 * table lookup.
 */
export function CollageAlbum<P extends Photo = Photo>(props: CollageAlbumProps<P>) {
  const { aspect, suggestion = 0, suggestions = 5, onLayouts, renderPhoto, onPhotoClick, className, style } = props;
  const scrap = props.variant === "scrapbook";
  const gap = props.gap ?? (scrap ? 14 : 4);
  const photos = useMemo(() => props.photos.slice(0, MAX_PHOTOS), [props.photos]);
  const aspects = useMemo(() => photos.map(photoAspect), [photos]);
  const collage = useCollage(aspects);
  const [ref, size] = useSize();

  const width = size.width;
  const height = aspect ? width / aspect : size.height;
  const canvas = width > 0 && height > 0 ? width / height : (aspect ?? 0);

  const layouts = useMemo(
    () => (collage && canvas > 0 ? collage.layouts(canvas, Math.max(1, suggestions)) : []),
    [collage, canvas, suggestions],
  );
  const cb = useRef(onLayouts);
  cb.current = onLayouts;
  useEffect(() => {
    if (layouts.length) cb.current?.(layouts);
  }, [layouts]);

  const layout = layouts[Math.min(Math.max(0, suggestion), layouts.length - 1)];
  let placed: Cell[] = [];
  if (layout && width > 0 && height > 0) {
    if (!scrap) placed = cells(layout.tree, width, height, gap);
    else {
      // keep the layout's own shape, centred, with room for tilt and spill
      const pad = Math.min(width, height) * 0.06;
      const w = width - 2 * pad, h = height - 2 * pad;
      const s = Math.min(w / layout.aspect, h);
      const lw = s * layout.aspect, lh = s;
      placed = cells(layout.tree, lw, lh, gap).map((c) => ({ ...c, x: c.x + pad + (w - lw) / 2, y: c.y + pad + (h - lh) / 2 }));
    }
  }

  const box: CSSProperties = { position: "relative", width: "100%", overflow: "hidden", ...(aspect ? { aspectRatio: String(aspect) } : {}), ...style };
  return (
    <div ref={ref} className={className} style={box} data-collage-state={layout ? "ready" : "solving"}>
      {placed.map((c) => {
        const p = photos[c.index] as P;
        const key = p.key ?? p.src + "#" + c.index;
        const round = p.shape === "round";
        const click = onPhotoClick ? () => onPhotoClick(p, c.index) : undefined;
        const img = renderPhoto ? renderPhoto(p, c) : (
          <img src={p.src} alt={p.alt ?? ""} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: round ? "50%" : undefined }} />
        );
        if (!scrap)
          return (
            <div key={key} onClick={click} style={{ position: "absolute", left: c.x, top: c.y, width: c.width, height: c.height, overflow: "hidden", borderRadius: round ? "50%" : undefined, cursor: click ? "pointer" : undefined }}>
              {img}
            </div>
          );
        const pl0 = placement(key, c, round, props.scrapbook);
        // never spill past the margin, or the frame's edge would cut the photo
        const spill = Math.min(width, height) * 0.06 * 0.8;
        const pl = { ...pl0, scale: Math.min(pl0.scale, 1 + (2 * spill) / Math.max(c.width, c.height)) };
        const border = Math.max(2, Math.min(8, Math.min(c.width, c.height) * 0.035));
        return (
          <div
            key={key}
            onClick={click}
            data-shape={round ? "round" : "rect"}
            style={{
              position: "absolute", left: c.x, top: c.y, width: c.width, height: c.height, boxSizing: "border-box",
              padding: border, background: "#fff", borderRadius: round ? "50%" : 2,
              boxShadow: "0 1px 2px rgba(0,0,0,.18), 0 6px 16px rgba(0,0,0,.14)",
              transform: `translate(${pl.dx.toFixed(2)}px, ${pl.dy.toFixed(2)}px) rotate(${pl.rotate.toFixed(2)}deg) scale(${pl.scale.toFixed(3)})`,
              zIndex: pl.z, cursor: click ? "pointer" : undefined,
            }}
          >
            <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: round ? "50%" : 1 }}>{img}</div>
          </div>
        );
      })}
    </div>
  );
}
