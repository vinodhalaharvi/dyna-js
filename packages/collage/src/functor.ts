/** Labels a binary split: H puts children side by side, V stacks them. */
export type Cut = "H" | "V";

/**
 * The aspect monoid on layouts: side by side at equal height the widths add;
 * stacked at equal width the heights (reciprocals) add.
 */
export function aspect(c: Cut, aL: number, aR: number): number {
  return c === "H" ? aL + aR : 1 / (1 / aL + 1 / aR);
}

/** The share of the parent's area that the left (or top) child receives. */
export function fracL(c: Cut, aL: number, aR: number): number {
  if (c === "H") return aL / (aL + aR);
  const hL = 1 / aL, hR = 1 / aR;
  return hL / (hL + hR);
}
