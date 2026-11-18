/**
 * Dynamic programming as recursion schemes over semirings.
 *
 * A problem is three things: a functor `Node<L, X>` (one step: a label and
 * its children), a coalgebra `S → Node<L, S>[]` (every way a state shrinks),
 * and an algebra `Node<L, T> → T` over a commutative monoid (how answers
 * combine). `dyna` folds the coalgebra's unfolding with the algebra,
 * collapsing alternatives with ⊕ and memoising on the state. It is correct
 * exactly when the algebra distributes over ⊕, which `checkLaws` tests and
 * `bruteForce` confirms.
 */
export { fmap, type Node } from "./node.js";
export { count, product, ungraded, type Algebra, type GradedAlgebra, type Monoid, type Pair } from "./algebra.js";
export { bruteForce, cata, dyna, unfold, type Coalgebra, type Stats, type Tree } from "./dyna.js";
export { lift, vecGet, MAX_ARITY, type Grading, type Vec } from "./lift.js";
export { topK, type Entry, type Ranked, type Score } from "./topk.js";
export { checkLaws, genRanked, rankedScoresEqual, seeded, type LawResult, type LawSpec, type Rand } from "./laws.js";
