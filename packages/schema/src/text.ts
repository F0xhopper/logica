import type { Anchor } from "./map.ts";

/** Paragraphs are separated by one or more blank lines. Returns [start, end) offsets. */
export function paragraphRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /\n\s*\n/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (text.slice(start, m.index).trim()) ranges.push([start, m.index]);
    start = m.index + m[0].length;
  }
  if (text.slice(start).trim()) ranges.push([start, text.length]);
  return ranges;
}

/** 1-based paragraph containing `offset`. Offsets in inter-paragraph whitespace belong to the next paragraph. */
export function paragraphAt(text: string, offset: number): number {
  const ranges = paragraphRanges(text);
  for (let i = 0; i < ranges.length; i++) {
    if (offset < ranges[i]![1]) return i + 1;
  }
  return Math.max(ranges.length, 1);
}

/** Normalise for tolerant matching: unify quotes/dashes/ellipses and collapse whitespace. Keeps a map back to raw offsets. */
function normalise(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i]!;
    if (/\s/.test(ch)) {
      if (lastSpace || norm.length === 0) continue;
      ch = " ";
      lastSpace = true;
    } else {
      lastSpace = false;
      if ("‘’‛′".includes(ch)) ch = "'";
      else if ("“”‟″".includes(ch)) ch = '"';
      else if ("–—−".includes(ch)) ch = "-";
      else if (ch === "…") ch = ".";
      ch = ch.toLowerCase();
    }
    norm += ch;
    map.push(i);
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

/**
 * Locate a verbatim quote in the source. Exact match first, then a normalised match
 * (whitespace, curly quotes, dashes, case). Returns null when the quote is not in the source,
 * which is the main hallucination guard (PLAN.md §5).
 */
export function locateQuote(source: string, quote: string): Anchor | null {
  const q = quote.trim();
  if (!q) return null;

  const exact = source.indexOf(q);
  if (exact !== -1) {
    return { char: [exact, exact + q.length], paragraph: paragraphAt(source, exact) };
  }

  const s = normalise(source);
  const n = normalise(q);
  if (!n.norm) return null;
  const at = s.norm.indexOf(n.norm);
  if (at === -1) return null;
  const start = s.map[at]!;
  const end = s.map[at + n.norm.length - 1]! + 1;
  return { char: [start, end], paragraph: paragraphAt(source, start) };
}

/** First ~60 characters of the source, cut at a word boundary. Used as the map title. */
export function titleFrom(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
