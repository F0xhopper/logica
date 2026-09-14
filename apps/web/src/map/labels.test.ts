import { EXAMPLE_ESSAY, locateQuote } from "@logica/schema";
import { describe, expect, it } from "vitest";
import { node } from "../test/fixtures.ts";
import { displayQuote, modalityLabel } from "./labels.ts";

describe("modalityLabel", () => {
  it("shows qualifier and scope only when present", () => {
    expect(modalityLabel({ qualifier: "unqualified" })).toBeNull();
    expect(modalityLabel({ qualifier: "probably", scope: "most" })).toBe("probably · most");
    expect(modalityLabel({ qualifier: "unqualified", scope: "some" })).toBe("some");
    expect(modalityLabel({ qualifier: "possibly" })).toBe("possibly");
  });
});

describe("displayQuote", () => {
  it("shows the exact source span when the quote only matched after normalisation", () => {
    const quote = "Every teacher I’ve  spoken to\nwants them gone";
    const anchor = locateQuote(EXAMPLE_ESSAY, quote)!;
    const n = node("p", "premise", "Teachers want phones gone.", { quote, anchor, quoteVerified: true });
    expect(displayQuote(n, EXAMPLE_ESSAY)).toBe("every teacher I've spoken to wants them gone");
  });

  it("falls back to the model's quote without an anchor, source or verification", () => {
    const n = node("p", "premise", "t", { quote: "made up" });
    expect(displayQuote(n, EXAMPLE_ESSAY)).toBe("made up");
    expect(displayQuote({ ...n, anchor: { char: [0, 5], paragraph: 1 } })).toBe("made up");
    expect(displayQuote({ ...n, anchor: { char: [0, 5], paragraph: 1 }, quoteVerified: false }, EXAMPLE_ESSAY)).toBe("made up");
    expect(displayQuote({ ...n, quote: undefined })).toBeNull();
  });
});
