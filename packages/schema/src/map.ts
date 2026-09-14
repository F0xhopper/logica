import { z } from "zod";

/**
 * The argument graph. One definition, used to validate pipeline output in the API,
 * type the HTTP/SSE contract, and type the React components. See PIPELINE.md §3.
 * Phase 1 carries the reconstruction fields only; evaluation fields (schemes,
 * acceptability, Dung status) arrive with the analysis layer.
 */

export const NodeKind = z.enum([
  "main_conclusion",
  "intermediate_conclusion",
  "premise",
  "evidence",
  "definition",
  "assumption",
  "objection",
  "rebuttal",
  "concession",
  "background",
]);
export type NodeKind = z.infer<typeof NodeKind>;

export const Qualifier = z.enum(["necessarily", "certainly", "probably", "typically", "possibly", "unqualified"]);
export type Qualifier = z.infer<typeof Qualifier>;

export const Scope = z.enum(["all", "most", "some", "one"]);
export type Scope = z.infer<typeof Scope>;

/** Where a node's quote lives in the source. Phase 1 only has pasted text. */
export const Anchor = z.object({
  /** Half-open character range [start, end) into `Source.text`. */
  char: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  /** 1-based paragraph number (paragraphs are split on blank lines). Rendered as "¶ n". */
  paragraph: z.number().int().positive(),
});
export type Anchor = z.infer<typeof Anchor>;

export const ArgNode = z.object({
  id: z.string().min(1),
  kind: NodeKind,
  /** Canonical standalone proposition, in Logica's words. */
  text: z.string().min(1),
  /** Verbatim span from the source. Present on explicit nodes. */
  quote: z.string().optional(),
  /** Set by server-side verification when the quote is found in the source. */
  anchor: Anchor.optional(),
  /** false = the quote could not be found in the source; the UI flags the node. */
  quoteVerified: z.boolean().optional(),
  /** false = reconstructed by Logica (enthymeme / warrant); rendered dashed. */
  explicit: z.boolean(),
  /** "author", "reported" ("some say…", rendered italic), or a speaker id in dialogues. */
  assertedBy: z.string().min(1),
  qualifier: Qualifier,
  scope: Scope.optional(),
  confidence: z.number().min(0).max(1),
});
export type ArgNode = z.infer<typeof ArgNode>;

export const EdgeKind = z.enum(["supports", "attacks"]);
export type EdgeKind = z.infer<typeof EdgeKind>;

/** Pollock: rebut the claim, undercut the inference, undermine a premise. */
export const AttackType = z.enum(["rebut", "undercut", "undermine"]);
export type AttackType = z.infer<typeof AttackType>;

export const ArgEdge = z.object({
  id: z.string().min(1),
  /** The supporting / attacking node. */
  from: z.string().min(1),
  /** The node being supported / attacked. */
  to: z.string().min(1),
  kind: EdgeKind,
  attackType: AttackType.optional(),
  /** false = the relation is reconstructed, not stated; rendered dashed. */
  explicit: z.boolean(),
});
export type ArgEdge = z.infer<typeof ArgEdge>;

export const SourceKind = z.enum(["text", "url", "pdf", "youtube", "audio", "reference"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const Source = z.object({
  kind: SourceKind,
  title: z.string(),
  url: z.string().optional(),
  text: z.string(),
  provenance: z.enum(["extracted", "reconstructed"]),
});
export type Source = z.infer<typeof Source>;

/** S1 reading brief. Context for every later stage; not rendered in Phase 1. */
export const ReadingBrief = z.object({
  genre: z.string(),
  argumentative: z.boolean(),
  standpoints: z.array(z.string()),
  keyTerms: z.array(z.object({ term: z.string(), definedInText: z.boolean(), note: z.string() })),
  audience: z.string(),
});
export type ReadingBrief = z.infer<typeof ReadingBrief>;

export const MapStatus = z.enum(["pending", "running", "done", "error"]);
export type MapStatus = z.infer<typeof MapStatus>;

export const ArgMap = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  version: z.number().int().positive(),
  status: MapStatus,
  error: z.string().optional(),
  source: Source,
  brief: ReadingBrief.optional(),
  nodes: z.array(ArgNode),
  edges: z.array(ArgEdge),
});
export type ArgMap = z.infer<typeof ArgMap>;
