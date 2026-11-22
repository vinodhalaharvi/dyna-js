// The solver as a Web Worker, so solving a book never freezes the page:
//   new Worker(new URL("@vhalaharvi/react-eqsum/worker", import.meta.url), { type: "module" })
import { solver, type ToSolver } from "./protocol.js";

const handle = solver();
const scope = self as unknown as { onmessage: ((e: MessageEvent<ToSolver>) => void) | null; postMessage(m: unknown): void };
scope.onmessage = (e) => {
  for (const reply of handle(e.data)) scope.postMessage(reply);
};
