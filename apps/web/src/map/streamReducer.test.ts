import type { MapEvent } from "@logica/schema";
import { describe, expect, it } from "vitest";
import { edge, mapWith, node, phonesEdges, phonesNodes } from "../test/fixtures.ts";
import { initialStreamState, streamReducer, visibleEdges, type StreamAction, type StreamState } from "./streamReducer.ts";

const run = (events: MapEvent[], from: StreamState = initialStreamState): StreamState =>
  events.map((event): StreamAction => ({ type: "event", event })).reduce(streamReducer, from);

describe("streamReducer", () => {
  it("tracks stages and accumulates nodes and edges", () => {
    const s = run([
      { type: "stage", stage: "reading" },
      { type: "stage", stage: "structuring" },
      { type: "node", node: phonesNodes[0]! },
      { type: "node", node: phonesNodes[1]! },
      { type: "edge", edge: phonesEdges[0]! },
    ]);
    expect(s.status).toBe("streaming");
    expect(s.stage).toBe("structuring");
    expect(s.nodes.map((n) => n.id)).toEqual(["c", "p1"]);
    expect(s.edges.map((e) => e.id)).toEqual(["p1->c"]);
  });

  it("dedupes replayed nodes and edges by id, keeping first-seen order and the latest value", () => {
    const s = run([
      { type: "node", node: node("a", "premise", "old") },
      { type: "node", node: node("b", "main_conclusion") },
      { type: "edge", edge: edge("a", "b") },
      { type: "node", node: node("a", "premise", "new") },
      { type: "edge", edge: edge("a", "b") },
    ]);
    expect(s.nodes.map((n) => [n.id, n.text])).toEqual([
      ["a", "new"],
      ["b", "Node b"],
    ]);
    expect(s.edges).toHaveLength(1);
  });

  it("keeps an edge that arrives before its endpoints but only shows it once both exist", () => {
    let s = run([{ type: "edge", edge: edge("p", "c") }, { type: "node", node: node("c", "main_conclusion") }]);
    expect(s.edges).toHaveLength(1);
    expect(visibleEdges(s.nodes, s.edges)).toHaveLength(0);
    s = run([{ type: "node", node: node("p", "premise") }], s);
    expect(visibleEdges(s.nodes, s.edges)).toHaveLength(1);
  });

  it("replaces local state with the final map on done and ignores later events", () => {
    const final = mapWith(phonesNodes, phonesEdges);
    const s = run([
      { type: "stage", stage: "segmenting" },
      { type: "node", node: node("draft", "premise") },
      { type: "done", map: final },
      { type: "node", node: node("late", "premise") },
      { type: "error", message: "too late" },
    ]);
    expect(s.status).toBe("done");
    expect(s.stage).toBeNull();
    expect(s.map).toBe(final);
    expect(s.nodes).toBe(final.nodes);
    expect(s.edges).toBe(final.edges);
    expect(s.error).toBeNull();
  });

  it("records an error, keeps the partial map, and stops accepting events", () => {
    const s = run([
      { type: "stage", stage: "reading" },
      { type: "node", node: node("c", "main_conclusion") },
      { type: "error", message: "The model gave up." },
      { type: "node", node: node("p", "premise") },
    ]);
    expect(s.status).toBe("error");
    expect(s.stage).toBeNull();
    expect(s.error).toBe("The model gave up.");
    expect(s.nodes.map((n) => n.id)).toEqual(["c"]);
  });

  it("handles the initial GET: running, already done, failed, or missing", () => {
    expect(streamReducer(initialStreamState, { type: "loaded", map: mapWith([], [], "running") }).status).toBe("streaming");

    const done = streamReducer(initialStreamState, { type: "loaded", map: mapWith(phonesNodes, phonesEdges) });
    expect(done.status).toBe("done");
    expect(done.nodes).toHaveLength(phonesNodes.length);

    const failed = streamReducer(initialStreamState, { type: "loaded", map: { ...mapWith([], [], "error"), error: "Boom" } });
    expect(failed).toMatchObject({ status: "error", error: "Boom" });

    expect(streamReducer(initialStreamState, { type: "not_found" }).status).toBe("not_found");
  });

  it("does not let a late GET or connection failure overwrite a finished stream", () => {
    const done = run([{ type: "done", map: mapWith(phonesNodes, phonesEdges) }]);
    expect(streamReducer(done, { type: "failed", message: "Lost" })).toBe(done);
    expect(streamReducer(done, { type: "loaded", map: mapWith([], [], "running") }).status).toBe("done");
  });
});
