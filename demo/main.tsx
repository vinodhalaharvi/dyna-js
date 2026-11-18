import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CollageAlbum, photoAspect, useCollage, type Layout, type Photo } from "@vhalaharvi/react-collage";

const CATS: Photo[] = [
  ["amber", 612, 612], ["calico", 500, 667], ["collar", 500, 282], ["curious", 423, 750], ["floof", 612, 612],
  ["garden", 500, 282], ["lawn", 423, 750], ["nap", 500, 375], ["rug", 500, 375], ["tiles", 500, 667],
].map(([n, w, h]) => ({ src: `cats/${n}.jpg`, width: w as number, height: h as number, alt: `${n} cat` }));

function App() {
  const [count, setCount] = useState(6);
  const [gap, setGap] = useState(14);
  const [pick, setPick] = useState(0);
  const [layouts, setLayouts] = useState<readonly Layout[]>([]);
  const [scrap, setScrap] = useState(true);
  const [round, setRound] = useState<ReadonlySet<string>>(() => new Set(["cats/amber.jpg", "cats/collar.jpg"]));
  const photos = useMemo(() => CATS.slice(0, count).map((p) => ({ ...p, shape: round.has(p.src) ? ("round" as const) : ("rect" as const) })), [count, round]);
  const toggle = (p: Photo) => setRound((r) => { const n = new Set(r); if (n.has(p.src)) n.delete(p.src); else n.add(p.src); return n; });
  const aspects = useMemo(() => photos.map(photoAspect), [photos]);
  const collage = useCollage(aspects);
  const cur = layouts[Math.min(pick, layouts.length - 1)];
  return (
    <main>
      <header>
        <h1>react-collage</h1>
        <p>Drag the corner of the frame: every shape was solved up front, so the layout changes instantly. Click a photo to make it round.</p>
      </header>
      <div className="controls">
        <label>Photos <input type="range" min={1} max={9} value={count} onChange={(e) => { setCount(+e.target.value); setPick(0); }} /> <b>{count}</b></label>
        <span className="picks">
          <button className={!scrap ? "on" : ""} onClick={() => { setScrap(false); setGap(6); }}>Grid</button>
          <button className={scrap ? "on" : ""} onClick={() => { setScrap(true); setGap(14); }}>Scrapbook</button>
        </span>
        <label>Gap <input type="range" min={0} max={30} value={gap} onChange={(e) => setGap(+e.target.value)} /> <b>{gap}px</b></label>
        <span className="picks">
          {layouts.map((_, i) => (
            <button key={i} className={i === pick ? "on" : ""} onClick={() => setPick(i)}>{i === 0 ? "Best" : `Option ${i + 1}`}</button>
          ))}
        </span>
      </div>
      <div className="frame">
        <CollageAlbum photos={photos} gap={gap} suggestion={pick} onLayouts={setLayouts} variant={scrap ? "scrapbook" : "grid"} onPhotoClick={toggle} style={{ height: "100%" }} />
      </div>
      <p className="facts">
        {collage
          ? `${collage.histogram()[1].toLocaleString()} layouts of ${count} photo${count > 1 ? "s" : ""} considered`
          : count > 8 ? "Solving… nine photos take a second or two" : "Solving…"}
        {collage && cur ? ` · smallest photo gets ${(cur.minShare * 100).toFixed(1)}% of the area · ${(cur.crop * 100).toFixed(1)}% cropped` : ""}
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
