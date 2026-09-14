import { describe, expect, it } from "vitest";
import { mapWith, phonesEdges, phonesNodes } from "../test/fixtures.ts";
import { replayEvents } from "./replay.ts";
import { initialStreamState, streamReducer, type StreamState } from "./streamReducer.ts";

const map = mapWith(phonesNodes, phonesEdges);

describe("replayEvents", () => {
  it("follows the pipeline order and ends with the final map", () => {
    const events = replayEvents(map).map((t) => t.event);
    const kinds = events.map((e) => (e.type === "stage" ? e.stage : e.type === "node" ? (e.node.explicit ? "quoted" : "implied") : e.type));

    expect(kinds.slice(0, 2)).toEqual(["reading", "segmenting"]);
    const structuring = kinds.indexOf("structuring");
    expect(kinds.slice(2, structuring).every((k) => k === "quoted")).toBe(true);
    expect(kinds.lastIndexOf("quoted")).toBeLessThan(structuring);
    expect(kinds.indexOf("implied")).toBeGreaterThan(structuring);
    expect(kinds.indexOf("edge")).toBeGreaterThan(kinds.lastIndexOf("implied"));
    expect(events.at(-1)).toEqual({ type: "done", map });
  });

  it("schedules events in increasing time", () => {
    const times = replayEvents(map).map((t) => t.at);
    expect(times[0]).toBe(0);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
  });
});

describe("streamReducer replay", () => {
  const done: StreamState = streamReducer(initialStreamState, { type: "loaded", map });

  it("clears a finished map, then rebuilds it from the replayed events", () => {
    const cleared = streamReducer(done, { type: "replay" });
    expect(cleared).toMatchObject({ status: "streaming", nodes: [], edges: [], map });

    const midway = replayEvents(map)
      .slice(0, 3)
      .reduce((s, { event }) => streamReducer(s, { type: "event", event }), cleared);
    expect(midway.stage).toBe("segmenting");
    expect(midway.nodes).toHaveLength(1);

    const rebuilt = replayEvents(map).reduce((s, { event }) => streamReducer(s, { type: "event", event }), cleared);
    expect(rebuilt).toEqual(done);
  });

  it("ignores replay unless the map is done", () => {
    const running = streamReducer(initialStreamState, { type: "loaded", map: mapWith([], [], "running") });
    expect(streamReducer(running, { type: "replay" })).toBe(running);
    expect(streamReducer(initialStreamState, { type: "replay" })).toBe(initialStreamState);
  });
});
