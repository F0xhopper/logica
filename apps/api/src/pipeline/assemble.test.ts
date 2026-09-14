import type { ArgEdge, ArgNode } from "@logica/schema";
import { describe, expect, it } from "vitest";
import {
  assembleEdges,
  assembleExplicitNodes,
  assembleImplicitNodes,
  ensureMainConclusion,
  findSupportCycles,
  inheritImplicitAttribution,
} from "./assemble.ts";
import type { ModelImplicitNode, ModelProposition, ModelRelation } from "./types.ts";

const SOURCE = "Cats are mammals. All mammals breathe air. So cats breathe air.";

const prop = (id: string, quote: string, over: Partial<ModelProposition> = {}): ModelProposition => ({
  id,
  quote,
  text: quote,
  kind: "premise",
  assertedBy: "author",
  qualifier: "unqualified",
  scope: null,
  confidence: 0.8,
  ...over,
});

const implicit = (id: string, text: string): ModelImplicitNode => ({
  id,
  kind: "assumption",
  text,
  qualifier: "unqualified",
  scope: null,
  authorWouldAccept: "yes",
  confidence: 0.7,
});

const rel = (from: string, to: string, over: Partial<ModelRelation> = {}): ModelRelation => ({
  from,
  to,
  kind: "supports",
  structure: "linked",
  attackType: null,
  explicit: true,
  ...over,
});

describe("assembleExplicitNodes", () => {
  it("assigns stable ids in order and maps model ids to them", () => {
    const { nodes, ids } = assembleExplicitNodes(SOURCE, [
      prop("P1", "Cats are mammals"),
      prop("P2", "All mammals breathe air", { scope: "all" }),
      prop("P3", "cats breathe air", { kind: "main_conclusion" }),
    ]);
    expect(nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect([...ids.entries()]).toEqual([
      ["P1", "n1"],
      ["P2", "n2"],
      ["P3", "n3"],
    ]);
    expect(nodes[1]!.scope).toBe("all");
    expect(nodes[0]!.scope).toBeUndefined();
  });

  it("verifies quotes and keeps unverified nodes flagged", () => {
    const { nodes } = assembleExplicitNodes(SOURCE, [
      prop("P1", "All mammals breathe air"),
      prop("P2", "Dogs are reptiles"),
    ]);
    expect(nodes[0]!.quoteVerified).toBe(true);
    expect(SOURCE.slice(...nodes[0]!.anchor!.char)).toBe("All mammals breathe air");
    expect(nodes[1]!.quoteVerified).toBe(false);
    expect(nodes[1]!.anchor).toBeUndefined();
    expect(nodes[1]!.quote).toBe("Dogs are reptiles");
  });

  it("drops duplicate ids and empty text, and clamps confidence", () => {
    const { nodes, kept } = assembleExplicitNodes(SOURCE, [
      prop("P1", "Cats are mammals", { confidence: 7 }),
      prop("P1", "All mammals breathe air"),
      prop("P2", "cats breathe air", { text: "  " }),
    ]);
    expect(nodes).toHaveLength(1);
    expect(kept.map((p) => p.id)).toEqual(["P1"]);
    expect(nodes[0]!.confidence).toBe(1);
  });
});

describe("assembleImplicitNodes + assembleEdges", () => {
  const setup = () => {
    const explicit = assembleExplicitNodes(SOURCE, [
      prop("P1", "Cats are mammals"),
      prop("P2", "cats breathe air", { kind: "main_conclusion" }),
    ]);
    const extra = assembleImplicitNodes(
      [implicit("I1", "Being a mammal suffices for breathing air."), implicit("P1", "collides")],
      explicit.ids,
      explicit.nodes.length,
    );
    return { ids: explicit.ids, nodes: [...explicit.nodes, ...extra], extra };
  };

  it("numbers implicit nodes after explicit ones and drops id collisions", () => {
    const { extra, ids } = setup();
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ id: "n3", explicit: false, assertedBy: "author" });
    expect(extra[0]!.quote).toBeUndefined();
    expect(ids.get("P1")).toBe("n1");
  });

  it("drops dangling, self-loop and duplicate edges", () => {
    const { ids, nodes } = setup();
    const edges = assembleEdges(
      [
        rel("P1", "P2"),
        rel("P1", "P2"),
        rel("P1", "P1"),
        rel("X9", "P2"),
        rel("I1", "P2"),
        rel("P1", "P2", { kind: "attacks", attackType: null }),
      ],
      ids,
      nodes,
    );
    expect(edges.map((e) => [e.id, e.from, e.to, e.kind])).toEqual([
      ["e1", "n1", "n2", "supports"],
      ["e2", "n3", "n2", "supports"],
      ["e3", "n1", "n2", "attacks"],
    ]);
    expect(edges[0]!.attackType).toBeUndefined();
    expect(edges[2]!.attackType).toBe("rebut");
  });

  it("marks edges touching implicit nodes as not explicit", () => {
    const { ids, nodes } = setup();
    const [edge] = assembleEdges([rel("I1", "P2", { explicit: true })], ids, nodes);
    expect(edge!.explicit).toBe(false);
  });
});

describe("ensureMainConclusion", () => {
  const node = (id: string, kind: ArgNode["kind"], explicit = true): ArgNode => ({
    id,
    kind,
    text: id,
    explicit,
    assertedBy: "author",
    qualifier: "unqualified",
    confidence: 0.5,
  });
  const edge = (id: string, from: string, to: string, kind: ArgEdge["kind"] = "supports"): ArgEdge => ({
    id,
    from,
    to,
    kind,
    explicit: true,
  });

  it("leaves maps that already have a main conclusion alone", () => {
    const nodes = [node("n1", "main_conclusion"), node("n2", "premise")];
    expect(ensureMainConclusion(nodes, [])).toBeNull();
  });

  it("promotes the node with the most incoming support", () => {
    const nodes = [node("n1", "premise"), node("n2", "intermediate_conclusion"), node("n3", "premise"), node("n4", "objection")];
    const edges = [edge("e1", "n1", "n3"), edge("e2", "n2", "n3"), edge("e3", "n1", "n2"), edge("e4", "n4", "n1", "attacks")];
    expect(ensureMainConclusion(nodes, edges)).toBe("n3");
    expect(nodes[2]!.kind).toBe("main_conclusion");
  });

  it("never promotes an objection when another candidate exists", () => {
    const nodes = [node("n1", "objection"), node("n2", "premise")];
    const edges = [edge("e1", "n2", "n1")];
    expect(ensureMainConclusion(nodes, edges)).toBe("n2");
  });
});

describe("ensureMainConclusion preferences", () => {
  const node = (id: string, over: Partial<ArgNode> = {}): ArgNode => ({
    id,
    kind: "premise",
    text: id,
    explicit: true,
    assertedBy: "author",
    qualifier: "unqualified",
    confidence: 0.5,
    ...over,
  });
  const supports = (id: string, from: string, to: string): ArgEdge => ({ id, from, to, kind: "supports", explicit: true });

  it("prefers a node that supports nothing over a better-supported reason", () => {
    // n2 has more incoming support but is itself a reason for n3, so n3 is the standpoint.
    const nodes = [node("n1"), node("n2"), node("n3"), node("n4")];
    const edges = [supports("e1", "n1", "n2"), supports("e2", "n4", "n2"), supports("e3", "n2", "n3")];
    expect(ensureMainConclusion(nodes, edges)).toBe("n3");
  });

  it("never promotes a reported node while an author node exists", () => {
    const nodes = [node("n1", { assertedBy: "reported", kind: "intermediate_conclusion" }), node("n2", { kind: "objection" })];
    const edges = [supports("e1", "n2", "n1")];
    expect(ensureMainConclusion(nodes, edges)).toBe("n2");
    expect(nodes[0]!.kind).toBe("intermediate_conclusion");
  });
});

describe("inheritImplicitAttribution", () => {
  const node = (id: string, explicit: boolean, assertedBy: string): ArgNode => ({
    id,
    kind: explicit ? "objection" : "assumption",
    text: id,
    explicit,
    assertedBy,
    qualifier: "unqualified",
    confidence: 0.5,
  });
  const edge = (id: string, from: string, to: string, kind: ArgEdge["kind"] = "supports"): ArgEdge => ({
    id,
    from,
    to,
    kind,
    explicit: false,
  });

  it("marks implicit nodes that support reported views as reported, including chains, but not across attacks", () => {
    const nodes = [
      node("obj", true, "reported"),
      node("claim", true, "author"),
      node("w1", false, "author"), // supports the reported objection
      node("w2", false, "author"), // supports w1
      node("w3", false, "author"), // supports the author's claim
      node("w5", false, "author"), // attacks the reported objection: the author's reply
      node("w4", false, "author"), // attacked by the reported objection: still the author's
    ];
    const edges = [
      edge("e1", "w1", "obj"),
      edge("e2", "w2", "w1"),
      edge("e3", "w3", "claim"),
      edge("e4", "obj", "w4", "attacks"),
      edge("e5", "w5", "obj", "attacks"),
    ];
    inheritImplicitAttribution(nodes, edges);
    expect(Object.fromEntries(nodes.map((n) => [n.id, n.assertedBy]))).toEqual({
      obj: "reported",
      claim: "author",
      w1: "reported",
      w2: "reported",
      w3: "author",
      w4: "author",
      w5: "author",
    });
  });
});

describe("findSupportCycles", () => {
  it("finds a support cycle and ignores attacks", () => {
    const n = (id: string): ArgNode => ({ id, kind: "premise", text: id, explicit: true, assertedBy: "author", qualifier: "unqualified", confidence: 1 });
    const e = (id: string, from: string, to: string, kind: ArgEdge["kind"]): ArgEdge => ({ id, from, to, kind, explicit: true });
    const nodes = [n("a"), n("b"), n("c")];
    expect(findSupportCycles(nodes, [e("1", "a", "b", "supports"), e("2", "b", "a", "supports")])).toEqual([["a", "b", "a"]]);
    expect(findSupportCycles(nodes, [e("1", "a", "b", "supports"), e("2", "b", "a", "attacks")])).toEqual([]);
  });
});
