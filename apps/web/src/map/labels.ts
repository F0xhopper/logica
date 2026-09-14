import type { ArgNode, NodeKind } from "@logica/schema";

const KIND_LABEL: Record<NodeKind, string> = {
  main_conclusion: "Conclusion",
  intermediate_conclusion: "Sub-conclusion",
  premise: "Premise",
  evidence: "Evidence",
  definition: "Definition",
  assumption: "Assumption",
  objection: "Objection",
  rebuttal: "Rebuttal",
  concession: "Concession",
  background: "Background",
};

/** Rendered uppercase by the caller, e.g. "IMPLIED PREMISE". */
export function kindLabel(node: Pick<ArgNode, "kind" | "explicit">): string {
  return node.explicit ? KIND_LABEL[node.kind] : `Implied ${KIND_LABEL[node.kind]}`;
}

export function anchorLabel(node: Pick<ArgNode, "anchor">): string | null {
  return node.anchor ? `¶ ${node.anchor.paragraph}` : null;
}

/** "probably · most"; null when the proposition is unqualified and unscoped. */
export function modalityLabel(node: Pick<ArgNode, "qualifier" | "scope">): string | null {
  const parts = [node.qualifier !== "unqualified" ? node.qualifier : null, node.scope ?? null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The words to show as the author's. A verified anchor may have matched only after normalisation
 * (curly quotes, case, whitespace), so prefer the exact source span over the model's transcription.
 */
export function displayQuote(node: Pick<ArgNode, "quote" | "anchor" | "quoteVerified">, sourceText?: string): string | null {
  if (node.anchor && node.quoteVerified !== false && sourceText) {
    const span = sourceText.slice(node.anchor.char[0], node.anchor.char[1]);
    if (span.trim()) return span;
  }
  return node.quote ?? null;
}
