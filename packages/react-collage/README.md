# @vinodhalaharvi/react-collage

A React photo collage for 1 to 9 photos. Every photo keeps its shape, there
are no gaps, and very little is cropped. Every canvas shape is solved up
front, so resizing is instant.

```sh
npm install @vinodhalaharvi/react-collage
```

```tsx
import { CollageAlbum } from "@vinodhalaharvi/react-collage";

const photos = [
  { src: "/beach.jpg", width: 1600, height: 900, alt: "Beach" },
  { src: "/cat.jpg", width: 900, height: 1200, alt: "Cat", shape: "round" },
  { src: "/city.jpg", width: 1200, height: 1200, alt: "City" },
];

export function Gallery() {
  return <CollageAlbum photos={photos} aspect={16 / 9} variant="scrapbook" />;
}
```

## Props

| Prop | Default | |
| --- | --- | --- |
| `photos` | | `{ src, width, height, alt?, key?, shape? }`; only `width / height` matters |
| `aspect` | | width / height of the album; leave it out to fill the container's height |
| `variant` | `"grid"` | `"grid"` fills the frame edge to edge; `"scrapbook"` adds white borders, shadows, a slight tilt and overlap |
| `gap` | 4 (grid), 14 (scrapbook) | pixels between photos |
| `suggestion` | 0 | which suggested layout to show; 0 is the best |
| `suggestions` | 5 | how many distinct layouts to offer |
| `onLayouts` | | called with the layouts on offer, to build a picker |
| `onPhotoClick` | | `(photo, index) => void` |
| `renderPhoto` | | draw a photo yourself, e.g. with `next/image` |
| `scrapbook` | | `{ tilt, overlap, shift }` limits for the scrapbook style |

- `shape: "round"` draws a photo as an oval: a circle when the photo is
  square, an ellipse when it is wide or tall.
- In the scrapbook style each photo's tilt comes from its `key` (or `src`), so
  photos keep their tilt as the album resizes.
- Solving waits for the first paint, and the same set of shapes is never
  solved twice. Nine photos take a second or two, during which the page is busy.
- Renders on the server: the album is empty until it mounts.

`useCollage(aspects)` gives the solved table directly, and `cells(tree, w, h, gap)`
turns a layout into pixel rectangles, for drawing a collage some other way.

## License

MIT
