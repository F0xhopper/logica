import { EXAMPLE_ESSAY, type ArgEdge, type ArgMap, type ArgNode } from "@logica/schema";

export function node(id: string, kind: ArgNode["kind"], text = `Node ${id}`, extra: Partial<ArgNode> = {}): ArgNode {
  return { id, kind, text, explicit: true, assertedBy: "author", qualifier: "unqualified", confidence: 0.9, ...extra };
}

export function edge(from: string, to: string, kind: ArgEdge["kind"] = "supports", extra: Partial<ArgEdge> = {}): ArgEdge {
  return { id: `${from}->${to}`, from, to, kind, explicit: true, ...extra };
}

/** Roughly PIPELINE.md §11: conclusion, two premises, an implied premise, an objection and its rebuttal. */
export const phonesNodes: ArgNode[] = [
  node("c", "main_conclusion", "Schools should ban phones."),
  node("p1", "premise", "Students who use phones in class get lower grades."),
  node("p2", "evidence", "Every teacher the author has spoken to wants phones gone."),
  node("a1", "assumption", "Policies that raise grades should be adopted.", { explicit: false }),
  node("o1", "objection", "Phones are needed for emergencies.", { assertedBy: "reported" }),
  node("r1", "rebuttal", "Schools have landlines for emergencies."),
];

export const phonesEdges: ArgEdge[] = [
  edge("p1", "c"),
  edge("p2", "c"),
  edge("a1", "c", "supports", { explicit: false }),
  edge("o1", "c", "attacks"),
  edge("r1", "o1", "attacks"),
];

export function mapWith(nodes: ArgNode[], edges: ArgEdge[], status: ArgMap["status"] = "done"): ArgMap {
  return {
    id: "m1",
    createdAt: "2026-09-14T00:00:00.000Z",
    version: 1,
    status,
    source: { kind: "text", title: "We should ban phones in schools…", text: EXAMPLE_ESSAY, provenance: "extracted" },
    nodes,
    edges,
  };
}
