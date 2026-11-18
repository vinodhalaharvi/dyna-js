# dyna-js

Dynamic programming as recursion schemes over semirings, and a photo collage
built on it, in TypeScript.

| Package | What it is |
| --- | --- |
| [`@vhalaharvi/dyna`](packages/dyna) | The core: describe a problem as a coalgebra (how a state splits) and an algebra over a semiring (how answers combine); `dyna` memoises and folds it. |
| [`@vhalaharvi/collage`](packages/collage) | Photo collage layouts as one such problem: every guillotine layout of up to 9 photos, solved once and indexed by aspect ratio. |
| [`@vhalaharvi/react-collage`](packages/react-collage) | `<CollageAlbum>`: the collage as a React component, in a grid or scrapbook style, resizing instantly. |

Each package builds only on the one above it.

![Seven cats in the grid style](https://raw.githubusercontent.com/vinodhalaharvi/dyna-js/main/docs/grid.jpg)

![The same cats in the scrapbook style, two of them round](https://raw.githubusercontent.com/vinodhalaharvi/dyna-js/main/docs/scrapbook.jpg)

Resizing is a lookup, not a new solve:

![Dragging the album from wide to tall re-lays the photos at every step](https://raw.githubusercontent.com/vinodhalaharvi/dyna-js/main/docs/resize.webp)

Photos: [max-mapper/cats](https://github.com/max-mapper/cats), BSD licensed ([credits](docs/CATS.md)).

```sh
npm install @vhalaharvi/react-collage
```

```tsx
import { CollageAlbum } from "@vhalaharvi/react-collage";

<CollageAlbum
  aspect={16 / 9}
  photos={[
    { src: "/a.jpg", width: 1200, height: 800 },
    { src: "/b.jpg", width: 800, height: 1200, shape: "round" },
    { src: "/c.jpg", width: 1000, height: 1000 },
  ]}
/>;
```

## How it is checked

- `collage` is compared with the Go engine at
  [github.com/vinodhalaharvi/collage](https://github.com/vinodhalaharvi/collage):
  `fixtures/gen` writes the Go answers for 34 photo sets of 1 to 9 photos at six
  canvas shapes, and the tests require the same counts, the same top five
  layouts and the same scores to 1e-12.
- Every algebra is property-tested against the semiring laws `dyna` relies on,
  and `dyna` is compared with brute force (fold every solution separately).
- The component is tested on the server and in a DOM: every photo appears
  once, cells tile the canvas without overlap, and placements stay put across
  sizes.

## Develop

```sh
npm install
npm test           # vitest
npm run typecheck  # tsc -b
```

To refresh the Go reference answers (needs Go):
`cd fixtures/gen && go run . > ../collage.json`.

## License

MIT
