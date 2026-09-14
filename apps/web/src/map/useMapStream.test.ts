import { afterEach, describe, expect, it, vi } from "vitest";
import { mapWith, node } from "../test/fixtures.ts";
import { interpretMessage } from "./useMapStream.ts";

describe("interpretMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes valid events through and closes on done/error", () => {
    const n = node("a", "premise");
    expect(interpretMessage("node", JSON.stringify({ type: "node", node: n }))).toEqual({
      action: { type: "event", event: { type: "node", node: n } },
      close: false,
    });
    const done = interpretMessage("done", JSON.stringify({ type: "done", map: mapWith([], []) }));
    expect(done.close).toBe(true);
    expect(done.action?.type).toBe("event");
    expect(interpretMessage("error", JSON.stringify({ type: "error", message: "x" })).close).toBe(true);
  });

  it("ignores an unreadable non-terminal event without closing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(interpretMessage("node", JSON.stringify({ type: "node", node: { id: "" } }))).toEqual({ action: null, close: false });
    expect(interpretMessage("stage", "{not json")).toEqual({ action: null, close: false });
  });

  it("closes and fails when a done or error event can't be read", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [type, data] of [
      ["done", JSON.stringify({ type: "done", map: { id: "m1" } })],
      ["error", "{not json"],
    ] as const) {
      const result = interpretMessage(type, data);
      expect(result.close).toBe(true);
      expect(result.action).toMatchObject({ type: "failed" });
    }
  });
});
