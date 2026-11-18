import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CollageAlbum, photoAspect, useCollage, type Layout, type Photo } from "@vinodhalaharvi/react-collage";

const CATS: Photo[] = [
  ["amber", 612, 612], ["calico", 500, 667], ["collar", 500, 282], ["curious", 423, 750], ["floof", 612, 612],
  ["garden", 500, 282], ["lawn", 423, 750], ["nap", 500, 375], ["rug", 500, 375], ["tiles", 500, 667],
].map(([n, w, h]) => ({ src: `cats/${n}.jpg`, width: w as number, height: h as number, alt: `${n} cat` }));

function App() {
  const [count, setCount] = useState(6);
  const [gap, setGap] = useState(6);
  const [pick, setPick] = useState(0);
  const [layouts, setLayouts] = useState<readonly Layout[]>([]);
  const photos = useMemo(() => CATS.slice(0, count), [count]);
  const aspects = useMemo(() => photos.map(photoAspect), [photos]);
  const collage = useCollage(aspects);
  const cur = layouts[Math.min(pick, layouts.length - 1)];
  return (
    <main>
      <header>
        <h1>react-collage</h1>
        <p>Drag the corner of the frame. Every shape was solved up front, so the layout changes instantly.</p>
      </header>
      <div className="controls">
        <label>Photos <input type="range" min={1} max={10} value={count} onChange={(e) => { setCount(+e.target.value); setPick(0); }} /> <b>{count}</b></label>
        <label>Gap <input type="range" min={0} max={20} value={gap} onChange={(e) => setGap(+e.target.value)} /> <b>{gap}px</b></label>
        <span className="picks">
          {layouts.map((_, i) => (
            <button key={i} className={i === pick ? "on" : ""} onClick={() => setPick(i)}>{i === 0 ? "Best" : `Option ${i + 1}`}</button>
          ))}
        </span>
      </div>
      <div className="frame">
        <CollageAlbum photos={photos} gap={gap} suggestion={pick} onLayouts={setLayouts} style={{ height: "100%" }} />
      </div>
      <p className="facts">
        {collage
          ? `${collage.histogram()[1].toLocaleString()} layouts of ${count} photo${count > 1 ? "s" : ""} considered`
          : count > 8 ? "Solving… nine or ten photos take a few seconds" : "Solving…"}
        {collage && cur ? ` · smallest photo gets ${(cur.minShare * 100).toFixed(1)}% of the area · ${(cur.crop * 100).toFixed(1)}% cropped` : ""}
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
