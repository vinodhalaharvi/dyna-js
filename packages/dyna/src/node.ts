/**
 * One step of a polynomial functor F X = Σ_label X^arity(label): a label and
 * its children. A collage split is `{ label: "split H", kids: [left, right] }`;
 * a leaf has no kids.
 */
export interface Node<L, X> {
  readonly label: L;
  readonly kids: readonly X[];
}

/** The functor's action on arrows: map every child, keep the label. */
export function fmap<L, X, Y>(f: (x: X) => Y, n: Node<L, X>): Node<L, Y> {
  if (n.kids.length === 0) return { label: n.label, kids: [] };
  return { label: n.label, kids: n.kids.map(f) };
}
