import { describe, expect, it, vi } from "vitest";
import { edge, node, phonesEdges, phonesNodes } from "../test/fixtures.ts";
import { estimateNodeHeight, gridLayout, layoutKey, layoutMap, NODE_WIDTH } from "./layout.ts";

describe("layoutMap", () => {
  it("positions every node", async () => {
    const { nodes: positions } = await layoutMap(phonesNodes, phonesEdges);
    expect([...positions.keys()].sort()).toEqual(phonesNodes.map((n) => n.id).sort());
    for (const box of positions.values()) {
      expect(Number.isFinite(box.x)).toBe(true);
      expect(Number.isFinite(box.y)).toBe(true);
      expect(box.width).toBe(NODE_WIDTH);
    }
  });

  it("puts the main conclusion at the top, supporters above their attackers", async () => {
    const { nodes: positions } = await layoutMap(phonesNodes, phonesEdges);
    const y = (id: string) => positions.get(id)!.y;
    for (const n of phonesNodes) {
      if (n.id !== "c") expect(y("c")).toBeLessThan(y(n.id));
    }
    expect(y("o1")).toBeLessThan(y("r1"));
  });

  it("routes edges from the source's top to the target's bottom", async () => {
    const layout = await layoutMap(phonesNodes, phonesEdges);
    for (const e of phonesEdges) {
      const route = layout.edges.get(e.id)!;
      const from = layout.nodes.get(e.from)!;
      const to = layout.nodes.get(e.to)!;
      expect(route.length).toBeGreaterThanOrEqual(2);
      expect(route[0]!.y).toBeCloseTo(from.y);
      expect(route.at(-1)!.y).toBeCloseTo(to.y + to.height);
    }
  });

  it("keeps the conclusion on top even when nodes arrive in an awkward order", async () => {
    const nodes = [node("p", "premise"), node("i", "intermediate_conclusion"), node("c", "main_conclusion"), node("b", "background")];
    const { nodes: positions } = await layoutMap(nodes, [edge("p", "i"), edge("i", "c")]);
    const y = (id: string) => positions.get(id)!.y;
    expect(y("c")).toBeLessThan(y("i"));
    expect(y("i")).toBeLessThan(y("p"));
    expect(y("c")).toBeLessThan(y("b"));
  });

  it("ignores edges to missing nodes and handles an empty map", async () => {
    const { nodes: positions } = await layoutMap([node("c", "main_conclusion")], [edge("ghost", "c")]);
    expect(positions.size).toBe(1);
    expect((await layoutMap([], [])).nodes.size).toBe(0);
  });

  it("uses measured heights when given", async () => {
    const { nodes: positions } = await layoutMap([node("c", "main_conclusion")], [], new Map([["c", { width: NODE_WIDTH, height: 123 }]]));
    expect(positions.get("c")!.height).toBe(123);
    expect(estimateNodeHeight("x".repeat(1000))).toBe(estimateNodeHeight("x".repeat(200)));
  });

  it("lays out a main conclusion that attacks another main conclusion", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const nodes = [
      node("thesis", "main_conclusion"),
      node("rival", "main_conclusion"),
      node("p", "premise"),
      node("q", "premise"),
    ];
    const layout = await layoutMap(nodes, [edge("thesis", "rival", "attacks"), edge("p", "thesis"), edge("q", "rival")]);
    expect(layout.nodes.size).toBe(4);
    expect(layout.edges.size).toBe(3);
    const y = (id: string) => layout.nodes.get(id)!.y;
    expect(y("thesis")).toBeLessThan(y("p"));
    expect(y("rival")).toBeLessThan(y("q"));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("gridLayout", () => {
  it("places every node without overlap, main conclusions first", () => {
    const layout = gridLayout([node("p", "premise"), node("q", "premise"), node("c", "main_conclusion"), node("r", "rebuttal")]);
    const boxes = [...layout.nodes.values()];
    expect(boxes).toHaveLength(4);
    expect(layout.nodes.get("c")).toMatchObject({ x: 0, y: 0 });
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe("layoutKey", () => {
  it("changes when a node's kind changes, not when identical data is replayed", () => {
    const nodes = [node("a", "premise"), node("b", "intermediate_conclusion")];
    const edges = [edge("a", "b")];
    const key = layoutKey(nodes, edges);
    expect(layoutKey(nodes.map((n) => ({ ...n })), edges.map((e) => ({ ...e })))).toBe(key);
    expect(layoutKey([nodes[0]!, { ...nodes[1]!, kind: "main_conclusion" }], edges)).not.toBe(key);
    expect(layoutKey(nodes, edges, new Map([["a", { width: NODE_WIDTH, height: 500 }]]))).not.toBe(key);
  });
});
