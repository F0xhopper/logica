import { ArgMap, EXAMPLE_ESSAY, MapEvent } from "@logica/schema";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { MockStages } from "./pipeline/mock.ts";
import type { Logger, Stages } from "./pipeline/types.ts";
import { MemoryMapStore } from "./store.ts";

const quiet: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function setup(stages: Stages = new MockStages(0)) {
  const store = new MemoryMapStore();
  const app = createApp({ store, mock: true, pipeline: { stages, paceMs: 0, log: quiet } });
  return { app, store };
}

async function post(app: ReturnType<typeof setup>["app"], body: unknown) {
  return app.request("/api/maps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Reads an SSE response to the end and returns the parsed events, checking `event:` matches the payload type. */
async function readEvents(res: Response): Promise<MapEvent[]> {
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const raw = await res.text();
  const events: MapEvent[] = [];
  for (const frame of raw.split("\n\n")) {
    const lines = frame.split("\n").filter((l) => l && !l.startsWith(":"));
    if (lines.length === 0) continue;
    const name = lines.find((l) => l.startsWith("event: "))?.slice(7);
    const data = lines.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
    const event = MapEvent.parse(JSON.parse(data));
    expect(name).toBe(event.type);
    events.push(event);
  }
  return events;
}

function expectValidOrder(events: MapEvent[]) {
  const seen = new Set<string>();
  for (const e of events) {
    if (e.type === "node") seen.add(e.node.id);
    if (e.type === "edge") {
      expect(seen.has(e.edge.from), `edge ${e.edge.id} before node ${e.edge.from}`).toBe(true);
      expect(seen.has(e.edge.to), `edge ${e.edge.id} before node ${e.edge.to}`).toBe(true);
    }
  }
  const last = events.at(-1);
  expect(last && (last.type === "done" || last.type === "error")).toBe(true);
}

describe("routes", () => {
  it("reports health and mock mode", async () => {
    const { app } = setup();
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true, mock: true });
  });

  it("rejects empty, missing and malformed bodies with ApiError", async () => {
    const { app } = setup();
    for (const body of [{ text: "   " }, {}, "not json"]) {
      const res = await post(app, body);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(typeof json.error).toBe("string");
    }
    expect(((await (await post(app, { text: "" })).json()) as { error: string }).error).toBe("Paste some text first.");
  });

  it("404s unknown maps as JSON", async () => {
    const { app } = setup();
    for (const path of ["/api/maps/nope", "/api/maps/nope/events", "/api/maps/..%2Fetc/events"]) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toHaveProperty("error");
    }
  });

  it("POST → SSE streams stages, nodes and edges in a valid order, then GET returns the done map", async () => {
    const { app } = setup();
    const created = await post(app, { text: EXAMPLE_ESSAY });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const events = await readEvents(await app.request(`/api/maps/${id}/events`));
    expect(events.filter((e) => e.type === "stage").map((e) => e.type === "stage" && e.stage)).toEqual([
      "reading",
      "segmenting",
      "structuring",
    ]);
    expectValidOrder(events);
    const done = events.at(-1);
    expect(done?.type).toBe("done");

    const res = await app.request(`/api/maps/${id}`);
    expect(res.status).toBe(200);
    const map = ArgMap.parse(await res.json());
    expect(map.status).toBe("done");
    expect(map.source.title.startsWith("We should ban phones in schools")).toBe(true);
    expect(done?.type === "done" && done.map).toEqual(map);

    // PIPELINE.md §11: C, P1, P2, O1, R1 explicit and verified; W1a, W1b, W2 implicit.
    expect(map.nodes).toHaveLength(8);
    expect(map.nodes.filter((n) => n.explicit).every((n) => n.quoteVerified)).toBe(true);
    expect(map.nodes.filter((n) => !n.explicit)).toHaveLength(3);
    expect(map.nodes.filter((n) => n.kind === "main_conclusion")).toHaveLength(1);
    expect(map.nodes.find((n) => n.kind === "objection")?.assertedBy).toBe("reported");
    expect(map.edges).toHaveLength(7);
    expect(map.edges.filter((e) => e.kind === "attacks").map((e) => e.attackType).sort()).toEqual(["rebut", "undermine"]);
    expect(map.edges.filter((e) => !e.explicit)).toHaveLength(3);
    // Every final node was streamed exactly once.
    const nodeEvents = events.flatMap((e) => (e.type === "node" ? [e.node.id] : []));
    expect(nodeEvents.sort()).toEqual(map.nodes.map((n) => n.id).sort());
  });

  it("replays a finished map stage-less from the store when no live run exists", async () => {
    const { app, store } = setup();
    const { id } = (await (await post(app, { text: "Tax sugar. It harms health. However, it hurts the poor." })).json()) as {
      id: string;
    };
    await readEvents(await app.request(`/api/maps/${id}/events`)); // wait for the run to finish

    const replay = await readEvents(await app.request(`/api/maps/${id}/events`));
    const stored = (await store.get(id))!;
    expect(replay.map((e) => e.type)).toEqual([
      ...stored.nodes.map(() => "node"),
      ...stored.edges.map(() => "edge"),
      "done",
    ]);
    expect(stored.nodes.map((n) => n.kind)).toEqual(["main_conclusion", "premise", "objection"]);
    expect(stored.edges.find((e) => e.kind === "attacks")?.attackType).toBe("rebut");
  });

  it("turns a stage failure into an error event and persisted error status", async () => {
    const failing: Stages = {
      read: async () => {
        throw new Error("secret internal detail");
      },
      segment: async () => [],
      structure: async () => ({ implicit: [], relations: [] }),
    };
    const { app, store } = setup(failing);
    const { id } = (await (await post(app, { text: "Anything." })).json()) as { id: string };
    const events = await readEvents(await app.request(`/api/maps/${id}/events`));
    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect(last?.type === "error" && last.message).not.toContain("secret");
    const stored = (await store.get(id))!;
    expect(stored.status).toBe("error");
    expect(ArgMap.safeParse(stored).success).toBe(true);
  });

  it("sends keep-alive comments while a stage is slow", async () => {
    const store = new MemoryMapStore();
    const app = createApp({
      store,
      mock: true,
      heartbeatMs: 10,
      pipeline: { stages: new MockStages(60), paceMs: 0, log: quiet },
    });
    const { id } = (await (await post(app, { text: EXAMPLE_ESSAY })).json()) as { id: string };
    const res = await app.request(`/api/maps/${id}/events`);
    expect(await res.clone().text()).toContain(": keep-alive");
    expectValidOrder(await readEvents(res));
  });

  it("returns 429 when too many pipelines are running, and frees the slot when one finishes", async () => {
    const app = createApp({
      store: new MemoryMapStore(),
      mock: true,
      maxConcurrent: 1,
      pipeline: { stages: new MockStages(20), paceMs: 0, log: quiet },
    });
    const first = await post(app, { text: EXAMPLE_ESSAY });
    expect(first.status).toBe(201);
    const busy = await post(app, { text: EXAMPLE_ESSAY });
    expect(busy.status).toBe(429);
    expect(await busy.json()).toEqual({ error: "Logica is busy — try again in a minute." });

    const { id } = (await first.json()) as { id: string };
    await readEvents(await app.request(`/api/maps/${id}/events`));
    await new Promise((r) => setTimeout(r, 0)); // let the run's finally release the slot
    expect((await post(app, { text: EXAMPLE_ESSAY })).status).toBe(201);
  });

  it("marks a map left running by a previous process as interrupted", async () => {
    const { app, store } = setup();
    await store.put({
      id: "orphan",
      createdAt: new Date().toISOString(),
      version: 1,
      status: "running",
      source: { kind: "text", title: "x", text: "x", provenance: "extracted" },
      nodes: [],
      edges: [],
    });
    const events = await readEvents(await app.request("/api/maps/orphan/events"));
    expect(events.map((e) => e.type)).toEqual(["error"]);
    expect((await store.get("orphan"))!.status).toBe("error");
  });
});
