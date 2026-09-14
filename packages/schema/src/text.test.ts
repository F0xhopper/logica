import { describe, expect, it } from "vitest";
import { EXAMPLE_ESSAY } from "./examples.ts";
import { locateQuote, paragraphAt, paragraphRanges, titleFrom } from "./text.ts";

describe("paragraphRanges", () => {
  it("splits on blank lines and skips empty paragraphs", () => {
    const text = "One.\n\n\nTwo.\n  \nThree.";
    expect(paragraphRanges(text).map(([s, e]) => text.slice(s, e))).toEqual(["One.", "Two.", "Three."]);
  });
});

describe("locateQuote", () => {
  it("finds an exact quote with its paragraph", () => {
    const a = locateQuote(EXAMPLE_ESSAY, "schools have landlines");
    expect(a).not.toBeNull();
    expect(EXAMPLE_ESSAY.slice(...a!.char)).toBe("schools have landlines");
    expect(a!.paragraph).toBe(2);
  });

  it("tolerates curly quotes, case and whitespace differences", () => {
    const a = locateQuote(EXAMPLE_ESSAY, "Every teacher I’ve  spoken to\nwants them gone");
    expect(a).not.toBeNull();
    expect(EXAMPLE_ESSAY.slice(...a!.char)).toBe("every teacher I've spoken to wants them gone");
    expect(a!.paragraph).toBe(1);
  });

  it("rejects text that is not in the source", () => {
    expect(locateQuote(EXAMPLE_ESSAY, "phones cause lower grades")).toBeNull();
    expect(locateQuote(EXAMPLE_ESSAY, "   ")).toBeNull();
  });
});

describe("paragraphAt", () => {
  it("maps offsets to 1-based paragraphs", () => {
    expect(paragraphAt("a\n\nb", 0)).toBe(1);
    expect(paragraphAt("a\n\nb", 3)).toBe(2);
  });
});

describe("titleFrom", () => {
  it("cuts at a word boundary with an ellipsis", () => {
    const t = titleFrom(EXAMPLE_ESSAY);
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith("…")).toBe(true);
    expect(t.startsWith("We should ban phones in schools")).toBe(true);
  });
});
