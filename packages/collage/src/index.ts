/**
 * Photo collage layouts as a dynamic program over guillotine cuts, written
 * with @vinodhalaharvi/dyna:
 *
 *   F X       = Leaf photo | Split cut X X        one layout step
 *   coalgebra   {photos} → every way to split them in two
 *   algebra     lift(count × topK) graded by aspect ratio
 *
 * `solve` builds the whole table once; `layouts` reads it for any canvas
 * shape, so resizing never re-solves.
 */
export { aspect, fracL, type Cut } from "./functor.js";
export {
  BUCKETS, Collage, FIT_WEIGHT, Grades, K, MAX_ASPECT, MAX_PHOTOS, clampAspect, newAlgebra, shareScore, solve, splits,
  type Bar, type Cell, type Layout, type LayoutNode, type Step,
} from "./collage.js";
export { allLaws, verifyDyna, type DynaCheck } from "./laws.js";
