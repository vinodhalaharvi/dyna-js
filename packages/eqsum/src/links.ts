// How much each equation matters to the rest of the book: what refers to it, read like links
// between web pages. Three kinds of link:
//   - a reference to a numbered equation: "(3.2)", "equation 3.2", "eq. (3.2)"
//   - a reference to a numbered result: "by Theorem 4.1" (to the equations stated in it)
//   - a use of a symbol an earlier equation defines: f(n) = …, A := …, ρ : G → V
// Importance then flows along them as in PageRank, restarting in proportion to what each unit is
// worth on its own, so an equation nothing refers to keeps its worth and one much relied on gains.
import type { Unit } from "./units.js";

export type LinkKind = "ref" | "result" | "symbol";

/** `from` refers to `to`, with a strength. */
export interface Link {
  from: number;
  to: number;
  w: number;
  kind: LinkKind;
}

// an author's own reference says more than a shared symbol (whose links weigh log(1 + equations / users))
const REF_W = 3;
const RESULT_W = 3;

const RESULT = "Theorem|Lemma|Proposition|Corollary|Definition|Claim|Remark|Example";
// "(2.19b)" anywhere in an equation; "(4)" only at its end (else it may be an argument, f(4))
const TAG_DOTTED = /\((\d{1,3}\.\d{1,3}[a-z]?)\)/g;
const TAG_END = /\((\d{1,3}[a-z]?)\)[\s.,;]*$/;
const REF_NAMED = /(?:\b[Ee]quations?|\b[Ee]qs?\.|式)\s*\(?(\d{1,3}(?:\.\d{1,3})?[a-z]?)\)?/g;
// after a space or punctuation, or straight after Chinese or Japanese text (由(3.2)式)
const REF_BARE = /(^|[\s,;(\[]|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，、。：；（])[(（](\d{1,3}(?:\.\d{1,3})?[a-z]?)[)）]/gu;
const DECL = new RegExp(`^\\s*(${RESULT})\\s+(\\d{1,3}(?:\\.\\d{1,3}){0,2})\\b`);
const REF_RESULT = new RegExp(`\\b(${RESULT})\\s+(\\d{1,3}(?:\\.\\d{1,3}){0,2})\\b`, "g");
// what an equation defines when it begins with it: f(n) = …, A := …, ρ : G → GL(V)
const DEFINES = /^\s*([\p{L}][\p{L}\p{N}]{0,5})((?:\s*\([^()=:]{0,30}\))*)\s*(?::=|≡|≜|=|:(?!=))\s*(.?)/u;
// names of standard functions, not things a book defines
const STANDARD = /^(min|max|log\w?|ln|lg|sin|cos|tan|exp|det|lim|sup|inf|gcd|lcm|mod|Pr|tr|rank|dim|deg|arg)$/;

/** Every link in the book, from what refers to what it refers to. */
export function links(units: Unit[]): Link[] {
  const out: Link[] = [];
  const chapterOf = chapters(units);

  // numbered equations: "(3.2)" → its equation (when a number is used twice, the nearest one before)
  const tagged = new Map<string, number[]>();
  units.forEach((u, i) => {
    if (u.kind !== "display") return;
    const tags = new Set<string>();
    for (const m of u.text.matchAll(TAG_DOTTED)) tags.add(m[1]!);
    const end = u.text.match(TAG_END);
    if (end) tags.add(end[1]!);
    for (const t of tags) tagged.set(t, [...(tagged.get(t) ?? []), i]);
  });
  const nearest = (at: number[], i: number) => {
    let best = -1;
    for (const j of at) if (j < i) best = j;
    return best >= 0 ? best : at[0]!;
  };
  units.forEach((u, i) => {
    const seen = new Set<number>();
    const add = (tag: string) => {
      const at = tagged.get(tag);
      if (!at) return;
      const j = nearest(at, i);
      if (j === i || seen.has(j)) return;
      seen.add(j);
      out.push({ from: i, to: j, w: REF_W, kind: "ref" });
    };
    for (const m of u.text.matchAll(REF_NAMED)) add(m[1]!);
    // a bare "(3.2)" counts outside equations only (inside one it is the equation's own number, or an argument)
    if (u.kind !== "display") for (const m of u.text.matchAll(REF_BARE)) add(m[2]!);
  });

  // numbered results: what is stated from "Theorem 4.1" to the next result or heading
  const results = new Map<string, { at: number; eqs: number[] }>();
  for (let i = 0; i < units.length; i++) {
    const m = units[i]!.text.match(DECL);
    if (!m || units[i]!.kind === "display") continue;
    const eqs: number[] = [];
    for (let j = i + 1; j < units.length && j <= i + 15; j++) {
      const v = units[j]!;
      if (v.kind === "heading" || DECL.test(v.text)) break;
      if (v.kind === "display") eqs.push(j);
    }
    const key = `${m[1]} ${m[2]}`;
    if (!results.has(key)) results.set(key, { at: i, eqs });
  }
  units.forEach((u, i) => {
    const seen = new Set<string>();
    for (const m of u.text.matchAll(REF_RESULT)) {
      const key = `${m[1]} ${m[2]}`;
      const r = results.get(key);
      if (!r || r.at === i || seen.has(key) || (i > r.at && r.eqs.length && i <= r.eqs[r.eqs.length - 1]!)) continue;
      seen.add(key);
      const to = r.eqs.length ? r.eqs : [r.at];
      for (const j of to) out.push({ from: i, to: j, w: RESULT_W / to.length, kind: "result" });
    }
  });

  // symbols: a later equation that uses what an earlier one defines; the rarer the symbol around
  // it, the stronger the link. A function (f(n) = …) or a longer name (φ, Hom, total) holds for its
  // chapter; a single Latin letter (x = …, A = …) only for its section, and a letter set to a
  // number (x = 29) is an example, not a definition.
  const sectionOf = sections(units);
  const scoped = (scope: number[]) => {
    const m = new Map<number, number[]>();
    units.forEach((u, i) => {
      if (u.kind === "display") m.set(scope[i]!, [...(m.get(scope[i]!) ?? []), i]);
    });
    return [...m.values()];
  };
  const letter = (sym: string, args: string) => /^[A-Za-z]$/.test(sym) && !args.trim();
  for (const [wide, groups] of [[true, scoped(chapterOf)], [false, scoped(sectionOf)]] as const)
  for (const eqs of groups) {
    const defs = new Map<string, number[]>();
    for (const i of eqs) {
      const m = units[i]!.text.match(DEFINES);
      if (!m || STANDARD.test(m[1]!) || letter(m[1]!, m[2]!) === wide || (letter(m[1]!, m[2]!) && /\d/.test(m[3]!))) continue;
      // f(10) = 55 after f is defined works an example out; before it, f(0) = 0 starts the definition
      if (/^(\s*\([\d\s,.−-]*\))+$/.test(m[2]!) && defs.has(m[1]!)) continue;
      defs.set(m[1]!, [...(defs.get(m[1]!) ?? []), i]);
    }
    for (const [sym, at] of defs) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u");
      const users = eqs.filter((i) => i > at[0]! && re.test(units[i]!.text));
      // a symbol in most of the chapter's equations is the chapter's alphabet, not a link
      if (!users.length || users.length > eqs.length / 2) continue;
      const w = Math.log(1 + eqs.length / users.length);
      for (const i of users) {
        let j = -1;
        for (const d of at) if (d < i) j = d;
        if (j >= 0 && j !== i) out.push({ from: i, to: j, w, kind: "symbol" });
      }
    }
  }
  return out;
}

/** Each unit's section: the number of chapter and section headings before it. */
function sections(units: Unit[]): number[] {
  let c = 0;
  return units.map((u) => (u.kind === "heading" && (u.level ?? 3) <= 3 ? ++c : c));
}

/** Each unit's chapter: the number of chapter headings before it. */
function chapters(units: Unit[]): number[] {
  let c = 0;
  return units.map((u) => (u.kind === "heading" && (u.level ?? 3) <= 2 ? ++c : c));
}

/**
 * How much more each unit is worth for what refers to it: PageRank over the links, restarting in
 * proportion to `base` (each unit's own worth), as a factor that is 1 for a unit nothing refers to
 * and grows with the log of how much relies on it, up to `cap`.
 */
export function importance(n: number, base: (i: number) => number, ls: Link[], { damping = 0.85, rounds = 60, cap = 4 } = {}): Float64Array {
  const out = new Float64Array(n).fill(1);
  if (!ls.length || n === 0) return out;
  const t = new Float64Array(n);
  let tsum = 0;
  for (let i = 0; i < n; i++) tsum += t[i] = Math.max(0, base(i));
  if (tsum <= 0) return out;
  for (let i = 0; i < n; i++) t[i]! /= tsum;
  const outW = new Float64Array(n);
  for (const l of ls) outW[l.from]! += l.w;
  let r = Float64Array.from(t);
  for (let k = 0; k < rounds; k++) {
    const next = new Float64Array(n);
    // what has nowhere to go starts again, like a reader leaving a page with no links
    let stuck = 0;
    for (let i = 0; i < n; i++) if (!outW[i]) stuck += r[i]!;
    for (const l of ls) next[l.to]! += (damping * r[l.from]! * l.w) / outW[l.from]!;
    for (let i = 0; i < n; i++) next[i]! += t[i]! * (1 - damping + damping * stuck);
    r = next;
  }
  // a unit nothing refers to gets only the restart: that ratio is the baseline, 1
  const into = new Uint8Array(n);
  for (const l of ls) into[l.to] = 1;
  let baseline = 0;
  for (let i = 0; i < n; i++)
    if (!into[i] && t[i]! > 0) {
      baseline = r[i]! / t[i]!;
      break;
    }
  if (baseline <= 0) return out;
  // on a log scale: relied on twice as much is worth more, not twice as much
  for (let i = 0; i < n; i++) if (t[i]! > 0) out[i] = Math.min(cap, 1 + Math.log(Math.max(1, r[i]! / t[i]! / baseline)));
  return out;
}
