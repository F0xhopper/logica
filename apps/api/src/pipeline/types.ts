import { z } from "zod";

/**
 * Model-facing output schemas, separate from the domain schema in @logica/schema.
 * They stay flat and constraint-free (no min/max, tuples or optionals) because structured
 * outputs compile them to a grammar; ranges and ids are enforced in assemble.ts instead.
 * Ids here are model-local ("P1", "I1") and are replaced with stable ids during assembly.
 */

const Qualifier = z.enum(["necessarily", "certainly", "probably", "typically", "possibly", "unqualified"]);
const Scope = z.enum(["all", "most", "some", "one"]);

/** S1. A superset of the domain ReadingBrief; the extra fields only steer later stages. */
export const ModelBrief = z.object({
  genre: z.string().describe("essay, op-ed, paper, brief, lecture, debate, interview, …"),
  argumentative: z.boolean().describe("Whether the text argues for anything at all."),
  standpoints: z.array(z.string()).describe("Main theses, each as a standalone sentence, with whose they are."),
  nonArgumentativeSpans: z
    .array(z.string())
    .describe("Short descriptions of passages that narrate, explain, describe or entertain rather than argue."),
  keyTerms: z.array(z.object({ term: z.string(), definedInText: z.boolean(), note: z.string() })),
  audience: z.string().describe("Intended audience and what the author treats as common ground."),
});
export type ModelBrief = z.infer<typeof ModelBrief>;

/** S2+S3. Explicit propositions with verbatim quotes. */
export const ModelProposition = z.object({
  id: z.string().describe('Local id: "P1", "P2", …'),
  quote: z.string().describe("Exact contiguous span copied character-for-character from the source."),
  text: z.string().describe("Canonical standalone declarative proposition: pronouns resolved, ellipsis restored."),
  kind: z.enum([
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
  ]),
  assertedBy: z.enum(["author", "reported"]),
  qualifier: Qualifier,
  scope: Scope.nullable(),
  confidence: z.number().describe("0 to 1: how sure you are about this segmentation and classification."),
});
export type ModelProposition = z.infer<typeof ModelProposition>;

export const ModelSegmentation = z.object({ propositions: z.array(ModelProposition) });
export type ModelSegmentation = z.infer<typeof ModelSegmentation>;

/** S6. Reconstructed (unstated) premises and warrants. */
export const ModelImplicitNode = z.object({
  id: z.string().describe('Local id: "I1", "I2", …'),
  kind: z.enum(["assumption", "premise"]),
  text: z.string(),
  qualifier: Qualifier,
  scope: Scope.nullable(),
  authorWouldAccept: z.enum(["yes", "probably", "unclear"]),
  confidence: z.number(),
});
export type ModelImplicitNode = z.infer<typeof ModelImplicitNode>;

/** S4. Support and attack relations between propositions (explicit or implicit). */
export const ModelRelation = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(["supports", "attacks"]),
  /** Asked for so the model applies the linked/convergent test; Phase 1 does not store it. */
  structure: z.enum(["linked", "convergent", "serial", "none"]),
  attackType: z.enum(["rebut", "undercut", "undermine"]).nullable(),
  explicit: z.boolean().describe("true if the text itself signals this relation; false if you reconstructed it."),
});
export type ModelRelation = z.infer<typeof ModelRelation>;

export const ModelStructure = z.object({
  implicit: z.array(ModelImplicitNode),
  relations: z.array(ModelRelation),
});
export type ModelStructure = z.infer<typeof ModelStructure>;

/** The three model-backed stages. Implemented by Claude (claude.ts) and a deterministic mock (mock.ts). */
export interface Stages {
  read(source: string): Promise<ModelBrief>;
  segment(source: string, brief: ModelBrief): Promise<ModelProposition[]>;
  structure(source: string, brief: ModelBrief, propositions: ModelProposition[]): Promise<ModelStructure>;
}

/** Thrown for failures whose message is safe to show the user as-is. */
export class PipelineError extends Error {
  override name = "PipelineError";
}

export type Logger = Pick<Console, "info" | "warn" | "error">;
