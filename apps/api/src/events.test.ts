import type { MapEvent } from "@logica/schema";
import { describe, expect, it } from "vitest";
import { HubRegistry, MapEventHub } from "./events.ts";

const stage = (s: "reading" | "segmenting" | "structuring"): MapEvent => ({ type: "stage", stage: s });

describe("MapEventHub", () => {
  it("replays history to late subscribers, then forwards live events", () => {
    const hub = new MapEventHub();
    hub.emit(stage("reading"));
    hub.emit(stage("segmenting"));

    const seen: MapEvent[] = [];
    hub.subscribe((e) => seen.push(e));
    expect(seen).toEqual([stage("reading"), stage("segmenting")]);

    hub.emit(stage("structuring"));
    expect(seen).toHaveLength(3);
  });

  it("closes after a terminal event and ignores later emits", () => {
    const hub = new MapEventHub();
    const seen: MapEvent[] = [];
    hub.subscribe((e) => seen.push(e));
    hub.emit({ type: "error", message: "nope" });
    hub.emit(stage("reading"));
    expect(hub.closed).toBe(true);
    expect(seen).toEqual([{ type: "error", message: "nope" }]);
  });

  it("async iteration replays, streams live events and ends after done", async () => {
    const hub = new MapEventHub();
    hub.emit(stage("reading"));
    const collected = (async () => {
      const out: string[] = [];
      for await (const e of hub.events()) out.push(e.type);
      return out;
    })();
    await Promise.resolve();
    hub.emit(stage("segmenting"));
    hub.emit({ type: "error", message: "x" });
    expect(await collected).toEqual(["stage", "stage", "error"]);
  });

  it("async iteration stops when the signal aborts", async () => {
    const hub = new MapEventHub();
    const controller = new AbortController();
    const collected = (async () => {
      const out: MapEvent[] = [];
      for await (const e of hub.events(controller.signal)) out.push(e);
      return out;
    })();
    hub.emit(stage("reading"));
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    expect(await collected).toEqual([stage("reading")]);
  });
});

describe("HubRegistry", () => {
  it("drops a hub once it closes", () => {
    const hubs = new HubRegistry();
    const hub = hubs.open("m1");
    expect(hubs.get("m1")).toBe(hub);
    hub.emit({ type: "error", message: "x" });
    expect(hubs.get("m1")).toBeUndefined();
  });
});
