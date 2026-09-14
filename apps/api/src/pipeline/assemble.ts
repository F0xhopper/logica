import { type ArgEdge, type ArgNode, locateQuote } from "@logica/schema";
import type { ModelImplicitNode, ModelProposition, ModelRelation } from "./types.ts";

/**
 * Pure assembly and structural checks (PIPELINE.md S4 checks, S9 lite). No model calls:
 * the model judges, code enforces ids, anchors and graph hygiene (principle 4).
 */

/** Model-local id ("P1", "I2") → stable map id ("n1"). */
export type IdMap = Map<string, string>;

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5;
}

/**
 * S2 output → explicit nodes with verified anchors. Nodes whose quote isn't found are kept
 * with `quoteVerified: false` so the UI can flag them; dropping them would hide the problem.
 * Returns the propositions that survived so later stages only see ids that resolve.
 */
export function assembleExplicitNodes(
  source: string,
  propositions: ModelProposition[],
  warn: (msg: string) => void = () => {},
): { nodes: ArgNode[]; ids: IdMap; kept: ModelProposition[] } {
  const ids: IdMap = new Map();
  const nodes: ArgNode[] = [];
  const kept: ModelProposition[] = [];
  for (const p of propositions) {
    const text = p.text.trim();
    if (!text) {
      warn(`dropping proposition ${p.id}: empty text`);
      continue;
    }
    if (ids.has(p.id)) {
      warn(`dropping proposition ${p.id}: duplicate id`);
      continue;
    }
    const id = `n${nodes.length + 1}`;
    ids.set(p.id, id);
    const quote = p.quote.trim();
    const anchor = quote ? locateQuote(source, quote) : null;
    if (!anchor) warn(`quote for ${p.id} not found in source: ${JSON.stringify(quote.slice(0, 80))}`);
    nodes.push({
      id,
      kind: p.kind,
      text,
      ...(quote ? { quote } : {}),
      ...(anchor ? { anchor } : {}),
      quoteVerified: anchor !== null,
      explicit: true,
      assertedBy: p.assertedBy,
      qualifier: p.qualifier,
      ...(p.scope ? { scope: p.scope } : {}),
      confidence: clamp01(p.confidence),
    });
    kept.push(p);
  }
  return { nodes, ids, kept };
}

/** S6 output → implicit nodes, numbered after the explicit ones. Mutates `ids` to add the new mappings. */
export function assembleImplicitNodes(
  implicit: ModelImplicitNode[],
  ids: IdMap,
  startIndex: number,
  warn: (msg: string) => void = () => {},
): ArgNode[] {
  const nodes: ArgNode[] = [];
  for (const n of implicit) {
    const text = n.text.trim();
    if (!text) {
      warn(`dropping implicit node ${n.id}: empty text`);
      continue;
    }
    if (ids.has(n.id)) {
      // Edges naming this id would be ambiguous, so the earlier (explicit) node keeps it.
      warn(`dropping implicit node ${n.id}: id collides with an existing node`);
      continue;
    }
    const id = `n${startIndex + nodes.length + 1}`;
    ids.set(n.id, id);
    nodes.push({
      id,
      kind: n.kind,
      text,
      explicit: false,
      // Refined by inheritImplicitAttribution once edges exist.
      assertedBy: "author",
      qualifier: n.qualifier,
      ...(n.scope ? { scope: n.scope } : {}),
      confidence: clamp01(n.confidence),
    });
  }
  return nodes;
}

/**
 * Relations → edges with stable ids. Drops dangling references, self-loops and duplicates.
 * An edge touching a reconstructed node is itself reconstructed, whatever the model said.
 */
export function assembleEdges(
  relations: ModelRelation[],
  ids: IdMap,
  nodes: ArgNode[],
  warn: (msg: string) => void = () => {},
): ArgEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const edges: ArgEdge[] = [];
  for (const r of relations) {
    const from = ids.get(r.from);
    const to = ids.get(r.to);
    const fromNode = from ? byId.get(from) : undefined;
    const toNode = to ? byId.get(to) : undefined;
    if (!from || !to || !fromNode || !toNode) {
      warn(`dropping relation ${r.from}→${r.to}: unknown endpoint`);
      continue;
    }
    if (from === to) {
      warn(`dropping relation ${r.from}→${r.to}: self-loop`);
      continue;
    }
    const key = `${from}|${to}|${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const edge: ArgEdge = {
      id: `e${edges.length + 1}`,
      from,
      to,
      kind: r.kind,
      explicit: r.explicit && fromNode.explicit && toNode.explicit,
    };
    // Rebut is the safe default: it claims least about where the objection bites.
    if (r.kind === "attacks") edge.attackType = r.attackType ?? "rebut";
    edges.push(edge);
  }
  return edges;
}

const NOT_A_STANDPOINT = new Set<ArgNode["kind"]>(["objection", "rebuttal", "concession", "background"]);

/**
 * Guarantees at least one main conclusion. With none, promotes from the author's own nodes
 * (a reported view is never the author's standpoint while an author node exists), preferring,
 * in order: no outgoing support (a sink, so it isn't a reason for something else), most incoming
 * support, explicit over reconstructed, intermediate conclusions, then source order.
 * Returns the promoted node id, if any. Mutates `nodes`; callers must not have shared these objects.
 */
export function ensureMainConclusion(nodes: ArgNode[], edges: ArgEdge[]): string | null {
  if (nodes.length === 0 || nodes.some((n) => n.kind === "main_conclusion")) return null;
  const incoming = new Map<string, number>();
  const supportsSomething = new Set<string>();
  for (const e of edges) {
    if (e.kind !== "supports") continue;
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    supportsSomething.add(e.from);
  }
  const authored = nodes.filter((n) => n.assertedBy === "author");
  const base = authored.length > 0 ? authored : nodes;
  const standpointLike = base.filter((n) => !NOT_A_STANDPOINT.has(n.kind));
  const pool = standpointLike.length > 0 ? standpointLike : base;
  const rank = (n: ArgNode) => [
    supportsSomething.has(n.id) ? 0 : 1,
    incoming.get(n.id) ?? 0,
    n.explicit ? 1 : 0,
    n.kind === "intermediate_conclusion" ? 1 : 0,
  ];
  const better = (a: ArgNode, b: ArgNode) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! > rb[i]!;
    return false; // ties keep the earlier node
  };
  let best = pool[0]!;
  for (const n of pool) if (better(n, best)) best = n;
  best.kind = "main_conclusion";
  return best.id;
}

/**
 * A reconstructed premise inherits "reported" when it supports a reported view: the warrant
 * behind "some argue X" belongs to whoever argues X, not to the author. Attacks don't transfer
 * attribution in either direction: an implicit premise attacking an objection is the author's
 * reply, and an author warrant attacked by an objection is still the author's. Repeats until
 * stable so chains of implicit support inherit too. Mutates `nodes`.
 */
export function inheritImplicitAttribution(nodes: ArgNode[], edges: ArgEdge[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      if (e.kind === "supports" && from && to && !from.explicit && from.assertedBy === "author" && to.assertedBy === "reported") {
        from.assertedBy = "reported";
        changed = true;
      }
    }
  }
}

/** Cycles in the support graph. Either circular reasoning or a structure error; logged, not fixed, in Phase 1. */
export function findSupportCycles(nodes: ArgNode[], edges: ArgEdge[]): string[][] {
  const out = new Map<string, string[]>();
  for (const e of edges) if (e.kind === "supports") out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (id: string) => {
    state.set(id, "visiting");
    stack.push(id);
    for (const next of out.get(id) ?? []) {
      const s = state.get(next);
      if (s === "visiting") cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (!s) visit(next);
    }
    stack.pop();
    state.set(id, "done");
  };
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);
  return cycles;
}

/** Nodes with no edges at all. Logged so prompt regressions show up; kept on the map. */
export function findOrphans(nodes: ArgNode[], edges: ArgEdge[]): string[] {
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  return nodes.filter((n) => !linked.has(n.id)).map((n) => n.id);
}
