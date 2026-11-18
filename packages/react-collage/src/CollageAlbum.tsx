import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MAX_PHOTOS, solve, type Collage, type Layout } from "@vinodhalaharvi/collage";
import { cells, photoAspect, type Cell } from "./geometry.js";

export interface Photo {
  src: string;
  /** natural width; only the ratio to height matters */
  width: number;
  height: number;
  alt?: string;
  key?: string;
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
  /** draws one photo; the default is an <img> that covers its cell */
  renderPhoto?: (photo: P, cell: Cell) => ReactNode;
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
  const { aspect, gap = 4, suggestion = 0, suggestions = 5, onLayouts, renderPhoto, className, style } = props;
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
  const placed = layout && width > 0 && height > 0 ? cells(layout.tree, width, height, gap) : [];

  const box: CSSProperties = { position: "relative", width: "100%", overflow: "hidden", ...(aspect ? { aspectRatio: String(aspect) } : {}), ...style };
  return (
    <div ref={ref} className={className} style={box} data-collage-state={layout ? "ready" : "solving"}>
      {placed.map((c) => {
        const p = photos[c.index] as P;
        return (
          <div key={p.key ?? p.src + "#" + c.index} style={{ position: "absolute", left: c.x, top: c.y, width: c.width, height: c.height, overflow: "hidden" }}>
            {renderPhoto ? renderPhoto(p, c) : (
              <img src={p.src} alt={p.alt ?? ""} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
