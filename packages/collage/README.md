# @vhalaharvi/collage

Photo collage layouts, solved exactly with
[`@vhalaharvi/dyna`](../dyna). Framework-free; for React, see
[`@vhalaharvi/react-collage`](../react-collage).

A layout is a guillotine tree: each cut puts two groups side by side or one on
top of the other, and every photo keeps its own aspect ratio, so there are no
gaps. `solve` considers every such layout of 1 to 9 photos and keeps the best
three for each overall aspect ratio, so any canvas shape is a lookup.

```ts
import { solve } from "@vhalaharvi/collage";

const collage = solve([1.5, 0.75, 1, 16 / 9]); // width / height of each photo
const [best, ...others] = collage.layouts(16 / 9, 5); // best first, each different at a glance
best.tree; // { p: -1, c: "H", a: 1.79, l: {...}, r: {...} }; leaves carry a photo index in p
best.minShare; // area share of the smallest photo
best.crop; // how much is cropped to fit the canvas
```

- **What counts as best**: the smallest photo should be as large as possible,
  and the layout should need little cropping. `rank = minShare · fit⁸`.
- **Speed**: the work grows about threefold with each photo. Eight photos take
  under half a second; nine take a second or two.
- **Aspect ratios** from 1:6 to 6:1 are held; `clampAspect` keeps photos in range.

## License

MIT
