import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  READING_INSTRUCTION,
  RECONSTRUCTION_SYSTEM,
  SEGMENTING_INSTRUCTION,
  STRUCTURING_INSTRUCTION,
  briefBlock,
  propositionsBlock,
  sourceBlock,
} from "./prompts.ts";
import {
  type Logger,
  ModelBrief,
  type ModelProposition,
  ModelSegmentation,
  ModelStructure,
  PipelineError,
  type Stages,
} from "./types.ts";

const MODEL = "claude-opus-5";
/** Server-side refusal fallbacks, scalar "default" form. This header only pairs with `fallbacks: "default"`. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/**
 * Output budgets cover adaptive thinking plus the JSON. Streaming allows large values without
 * HTTP timeouts; segmenting and structuring emit per-proposition JSON, so they get the most room.
 */
const MAX_TOKENS = { reading: 16_000, deep: 64_000 } as const;

type Effort = "medium" | "high";
type ContentBlock = Anthropic.Beta.BetaTextBlockParam;

const EPHEMERAL = { type: "ephemeral" } as const;

/**
 * JSON Schema for structured outputs, straight from Zod. We don't use the SDK's zod helper
 * here for two reasons: its schema transform moves `enum` into descriptions (so node kinds
 * would not be constrained), and its auto-parse throws on truncated JSON before we can read
 * `stop_reason`. We validate with Zod ourselves after checking the stop reason.
 */
function outputFormat(schema: z.ZodType): Anthropic.Beta.BetaJSONOutputFormat {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { reused: "inline", unrepresentable: "throw" });
  return { type: "json_schema", schema: json };
}

interface CallOptions<T> {
  stage: string;
  effort: Effort;
  /** User content blocks in cache order: source → brief → graph → instruction. */
  content: ContentBlock[];
  schema: z.ZodType<T>;
  maxTokens: number;
}

export class ClaudeStages implements Stages {
  constructor(
    private readonly log: Logger,
    private readonly client: Anthropic = new Anthropic(),
  ) {}

  async read(source: string): Promise<ModelBrief> {
    return this.call({
      stage: "S1 reading",
      effort: "medium",
      maxTokens: MAX_TOKENS.reading,
      schema: ModelBrief,
      content: [this.source(source), { type: "text", text: READING_INSTRUCTION }],
    });
  }

  async segment(source: string, brief: ModelBrief): Promise<ModelProposition[]> {
    const out = await this.call({
      stage: "S2+S3 segmenting",
      effort: "high",
      maxTokens: MAX_TOKENS.deep,
      schema: ModelSegmentation,
      content: [this.source(source), this.brief(brief), { type: "text", text: SEGMENTING_INSTRUCTION }],
    });
    return out.propositions;
  }

  async structure(source: string, brief: ModelBrief, propositions: ModelProposition[]): Promise<ModelStructure> {
    const listed = propositions.map(({ id, kind, text, quote, assertedBy, qualifier, scope }) => ({
      id,
      kind,
      text,
      quote,
      assertedBy,
      qualifier,
      scope,
    }));
    return this.call({
      stage: "S4+S6 structuring",
      effort: "high",
      maxTokens: MAX_TOKENS.deep,
      schema: ModelStructure,
      content: [
        this.source(source),
        this.brief(brief),
        { type: "text", text: propositionsBlock(JSON.stringify(listed, null, 2)) },
        { type: "text", text: STRUCTURING_INSTRUCTION },
      ],
    });
  }

  /**
 * Cache breakpoint 2 (after the frozen system prompt): the source. Segmenting and structuring
 * share this source+brief prefix; reading runs at a different effort, which invalidates the
 * messages cache, so its entry is not reused by the later stages.
 */
  private source(text: string): ContentBlock {
    return { type: "text", text: sourceBlock(text), cache_control: EPHEMERAL };
  }

  /** Cache breakpoint 3: the brief, read back by structuring after segmenting writes it (both effort high). */
  private brief(brief: ModelBrief): ContentBlock {
    return { type: "text", text: briefBlock(JSON.stringify(brief, null, 2)), cache_control: EPHEMERAL };
  }

  private async call<T>({ stage, effort, content, schema, maxTokens }: CallOptions<T>): Promise<T> {
    const started = Date.now();
    // Streaming so long essays don't hit HTTP timeouts on a single large response.
    const stream = this.client.beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: RECONSTRUCTION_SYSTEM, cache_control: EPHEMERAL }],
      messages: [{ role: "user", content }],
      output_config: { effort, format: outputFormat(schema) },
    });
    const message = await stream.finalMessage();

    const { usage } = message;
    const fellBack = (usage.iterations ?? []).some((entry) => entry.type === "fallback_message");
    this.log.info(
      `[claude] ${stage}: ${message.stop_reason} in ${Date.now() - started}ms` +
        ` model=${message.model}${fellBack ? " (fallback)" : ""}` +
        ` input=${usage.input_tokens} output=${usage.output_tokens}` +
        ` cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0}`,
    );

    if (message.stop_reason === "refusal") {
      this.log.warn(`[claude] ${stage} refused`, message.stop_details);
      throw new PipelineError("Logica couldn't analyse this text. The model declined to process it.");
    }
    if (message.stop_reason === "model_context_window_exceeded") {
      throw new PipelineError("This text is too long for Logica to read in one go. Try a shorter passage.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new PipelineError("This text is too long or complex to map in one go. Try a shorter passage.");
    }

    // A mid-stream fallback continues the partial text in a new block, so the JSON is the concatenation.
    const text = message.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      this.log.error(`[claude] ${stage}: output was not JSON`, err, text.slice(0, 500));
      throw new PipelineError("The model returned an unreadable result. Please try again.");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      this.log.error(`[claude] ${stage}: output failed validation`, z.prettifyError(parsed.error));
      throw new PipelineError("The model returned an unreadable result. Please try again.");
    }
    return parsed.data;
  }
}

/**
 * Maps any pipeline failure to a message that is safe to show the user. The real error (status,
 * request id, API message) is logged by the caller, so nothing here guesses at a cause.
 */
export function userMessage(err: unknown): string {
  if (err instanceof PipelineError) return err.message;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "The server's Claude API credentials were rejected.";
  }
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate-limiting requests right now. Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the connection and try again.";
  if (err instanceof Anthropic.BadRequestError) return "Logica couldn't process this request.";
  if (err instanceof Anthropic.InternalServerError) return "Claude is temporarily unavailable. Try again shortly.";
  if (err instanceof Anthropic.APIError) return "Claude returned an error. Try again shortly.";
  return "Something went wrong while mapping this text.";
}
