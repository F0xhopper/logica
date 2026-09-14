import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeStages } from "./claude.ts";
import { PipelineError, type ModelBrief } from "./types.ts";

/**
 * No network: a fake fetch captures the request and answers with a canned Messages SSE stream.
 * This checks the request we build (headers, cache layout, schema) and our stop_reason handling,
 * not the live API's behaviour.
 */

const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const BRIEF: ModelBrief = {
  genre: "op-ed",
  argumentative: true,
  standpoints: ["Schools should ban phones."],
  nonArgumentativeSpans: [],
  keyTerms: [],
  audience: "parents",
};

function sse(text: string, stopReason: string): string {
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } },
    { type: "message_stop" },
  ];
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

function fakeClient(text: string, stopReason = "end_turn") {
  const requests: { headers: Headers; body: Record<string, any> }[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url, init) => {
      requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return new Response(sse(text, stopReason), { headers: { "content-type": "text/event-stream" } });
    },
  });
  return { stages: new ClaudeStages(quiet, client), requests };
}

describe("ClaudeStages", () => {
  it("builds a cached, streamed, structured request with refusal fallbacks", async () => {
    const { stages, requests } = fakeClient(JSON.stringify({ propositions: [] }));
    await stages.segment("Ban phones.", BRIEF);

    const [{ headers, body }] = requests as [(typeof requests)[number]];
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body).toMatchObject({
      model: "claude-opus-5",
      stream: true,
      fallbacks: "default",
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
    });
    expect(body.betas).toBeUndefined();
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });

    const content = body.messages[0].content;
    expect(content.map((b: { text: string }) => b.text.split("\n")[0])).toEqual([
      "<source>",
      "<reading_brief>",
      expect.stringContaining("Stage S2+S3"),
    ]);
    expect(content.map((b: { cache_control?: unknown }) => Boolean(b.cache_control))).toEqual([true, true, false]);

    const kind = body.output_config.format.schema.properties.propositions.items.properties.kind;
    expect(kind.enum).toContain("main_conclusion");
    expect(body.output_config.format.schema.$schema).toBeUndefined();
  });

  it("uses medium effort for the reading brief and returns the parsed output", async () => {
    const { stages, requests } = fakeClient(JSON.stringify(BRIEF));
    expect(await stages.read("Ban phones.")).toEqual(BRIEF);
    expect(requests[0]!.body.output_config.effort).toBe("medium");
    expect(requests[0]!.body.max_tokens).toBe(16000);
  });

  it("turns refusals, truncation and invalid output into user-safe PipelineErrors", async () => {
    for (const [text, stop] of [
      ["", "refusal"],
      ["", "model_context_window_exceeded"],
      ['{"propositions": [', "max_tokens"],
      ['{"propositions": [{"id": 1}]}', "end_turn"],
    ] as const) {
      const { stages } = fakeClient(text, stop);
      await expect(stages.segment("Ban phones.", BRIEF)).rejects.toBeInstanceOf(PipelineError);
    }
  });
});
