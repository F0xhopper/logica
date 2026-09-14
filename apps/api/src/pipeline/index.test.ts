import { ArgMap, type MapEvent } from "@logica/schema";
import { describe, expect, it } from "vitest";
import { MemoryMapStore } from "../store.ts";
import { runPipeline } from "./index.ts";
import { RECONSTRUCTION_SYSTEM } from "./prompts.ts";
import type { ModelBrief, ModelProposition, Stages } from "./types.ts";

const quiet = { info: () => {}, warn: () => {}, error: () => {} };
const SOURCE = "Cities should add bike lanes. Bike lanes cut traffic deaths.";

const BRIEF: ModelBrief = {
  genre: "op-ed",
  argumentative: true,
  standpoints: [],
  nonArgumentativeSpans: [],
  keyTerms: [],
  audience: "",
};

const prop = (id: string, quote: string, kind: ModelProposition["kind"]): ModelProposition => ({
  id,
  quote,
  text: quote,
  kind,
  assertedBy: "author",
  qualifier: "unqualified",
  scope: null,
  confidence: 0.8,
});

const initial = (): ArgMap => ({
  id: "m1",
  createdAt: "2026-01-01T00:00:00.000Z",
  version: 1,
  status: "pending",
  source: { kind: "text", title: "t", text: SOURCE, provenance: "extracted" },
  nodes: [],
  edges: [],
});

async function run(stages: Stages) {
  const events: MapEvent[] = [];
  const store = new MemoryMapStore();
  await runPipeline(initial(), (e) => events.push(e), { store, stages, paceMs: 0, log: quiet });
  return { events, stored: (await store.get("m1"))! };
}

describe("runPipeline", () => {
  it("emits node snapshots; later corrections only appear in the done map", async () => {
    // No main_conclusion from the model, so assembly promotes n1 after it was already emitted.
    const { events } = await run({
      read: async () => BRIEF,
      segment: async () => [prop("P1", "Cities should add bike lanes", "premise"), prop("P2", "Bike lanes cut traffic deaths", "premise")],
      structure: async () => ({
        implicit: [],
        relations: [{ from: "P2", to: "P1", kind: "supports", structure: "convergent", attackType: null, explicit: true }],
      }),
    });
    const streamed = events.find((e) => e.type === "node" && e.node.id === "n1");
    const done = events.at(-1);
    expect(streamed?.type === "node" && streamed.node.kind).toBe("premise");
    expect(done?.type === "done" && done.map.nodes.find((n) => n.id === "n1")?.kind).toBe("main_conclusion");
  });

  it("skips structuring when segmentation keeps nothing and finishes with an empty map", async () => {
    let structured = false;
    const { events, stored } = await run({
      read: async () => BRIEF,
      segment: async () => [prop("P1", "   ", "premise")].map((p) => ({ ...p, text: " " })),
      structure: async () => {
        structured = true;
        return { implicit: [], relations: [] };
      },
    });
    expect(structured).toBe(false);
    expect(events.map((e) => (e.type === "stage" ? e.stage : e.type))).toEqual(["reading", "segmenting", "done"]);
    expect(stored).toMatchObject({ status: "done", nodes: [], edges: [] });
  });
});

describe("reconstruction prompt examples", () => {
  it("keep modality and quantity words in the canonical text (PIPELINE principle 6)", () => {
    expect(RECONSTRUCTION_SYSTEM).toContain('main_conclusion "Remote work probably boosts productivity."');
    const markers = /\b(probably|likely|most|may|might|must|all|every|some|many|usually)\b/gi;
    const examples = [...RECONSTRUCTION_SYSTEM.matchAll(/^- P\d+ \w+ "([^"]+)" quote "([^"]+)"/gm)];
    expect(examples.length).toBeGreaterThan(4);
    for (const [, text, quote] of examples) {
      for (const word of quote!.match(markers) ?? []) {
        expect(text!.toLowerCase(), `"${text}" drops "${word}" from its quote`).toContain(word.toLowerCase());
      }
    }
  });
});
