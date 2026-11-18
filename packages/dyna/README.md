# @vinodhalaharvi/dyna

Dynamic programming as recursion schemes over semirings. No dependencies.

A problem is three things:

- a **functor**: `Node<L, X>`, one step with a label and its children;
- a **coalgebra**: `(s: S) => Node<L, S>[]`, every way a state can split into
  smaller states;
- an **algebra**: how the children's answers combine at a node, over a
  commutative monoid ⊕ that merges alternatives.

`dyna` unfolds the coalgebra, folds it with the algebra, merges alternatives
with ⊕ and memoises each state, so every subproblem is solved once. It is
correct exactly when the algebra distributes over ⊕, which `checkLaws` tests
and `bruteForce` confirms.

```ts
import { bruteForce, count, dyna, ungraded, type Coalgebra } from "@vinodhalaharvi/dyna";

// How many ordered ways to make an amount from coins 1, 2 and 5?
const coins: Coalgebra<number, number> = (a) =>
  a === 0 ? [{ label: 0, kids: [] }] : [1, 2, 5].filter((c) => c <= a).map((c) => ({ label: c, kids: [a - c] }));

const [ways, stats] = dyna(ungraded(count<number>()), coins, 11); // 218, 12 states
const [same] = bruteForce(ungraded(count<number>()), coins, 11); // 218, the slow way
```

## Pieces

| | |
| --- | --- |
| `dyna(alg, coalg, goal, key?)` | the memoised fold; `key` turns non-primitive states into memo keys |
| `count()` | (+, ×): how many solutions |
| `topK(k, score)` | the k best solutions with the trees that earned them; `score` must be monotone in each child |
| `product(x, y)` | two algebras in one pass |
| `lift(alg, grading)` | indexes answers by a grade (a size, a duration, an aspect ratio), like the coefficients of a generating function |
| `ungraded(alg)` | a graded algebra where no grading is needed |
| `checkLaws(alg, spec, trials, rand)` | property tests: ⊕ associative, commutative, with identity; every node distributes over ⊕ and is annihilated by zero |
| `bruteForce`, `unfold`, `cata` | the specification: every solution, folded one by one |

Nodes may have at most four children.

## License

MIT
