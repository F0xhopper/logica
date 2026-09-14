import type { ArgEdge, ArgNode } from "@logica/schema";
import type { ELK as ElkApi, ElkNode } from "elkjs/lib/elk-api";

export const NODE_WIDTH = 260;

// Card geometry from DESIGN §5: 12px padding, 11px label row, 13px/1.4 text clamped to 4 lines.
const PADDING_Y = 12 * 2;
const BORDER_Y = 2 * 2;
const LABEL_ROW = 16 + 4;
const LINE_HEIGHT = 13 * 1.4;
// Conservative (narrow) estimate for 13px system sans in a 236px content box; over-estimating only adds space.
const CHARS_PER_LINE = 34;

export function estimateNodeHeight(text: string): number {
  const lines = Math.min(4, Math.max(1, Math.ceil(text.length / CHARS_PER_LINE)));
  return Math.ceil(PADDING_Y + BORDER_Y + LABEL_ROW + lines * LINE_HEIGHT);
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Positions = Map<string, Box>;

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  nodes: Positions;
  /** Orthogonal route per edge id, from the source's top border to the target's bottom border. */
  edges: Map<string, Point[]>;
}

export const emptyLayout: Layout = { nodes: new Map(), edges: new Map() };

// ELK ids share one namespace; keep edge ids from colliding with node ids.
const EDGE_PREFIX = "edge:";

let elk: Promise<ElkApi> | null = null;

// elkjs is ~1.5 MB; load it on first layout so the paste screen stays light.
function getElk(): Promise<ElkApi> {
  elk ??= import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK());
  return elk;
}

export interface Size {
  width: number;
  height: number;
}

const GRID_GAP = 32;

/** Changes only when something ELK cares about changes: ids, kinds, sizes, edge endpoints. */
export function layoutKey(
  nodes: readonly ArgNode[],
  edges: readonly ArgEdge[],
  measured?: ReadonlyMap<string, Size>,
): string {
  return JSON.stringify([
    nodes.map((n) => [n.id, n.kind, measured?.get(n.id)?.height ?? estimateNodeHeight(n.text)]),
    edges.map((e) => [e.id, e.from, e.to]),
  ]);
}

function buildGraph(
  nodes: readonly ArgNode[],
  edges: readonly ArgEdge[],
  measured: ReadonlyMap<string, Size> | undefined,
  withConstraints: boolean,
): ElkNode {
  const ids = new Set(nodes.map((n) => n.id));
  const layoutEdges = edges.filter((e) => e.from !== e.to && ids.has(e.from) && ids.has(e.to));
  // ELK rejects a LAST constraint on a node with outgoing edges (e.g. one thesis attacking another).
  const hasOutgoing = new Set(layoutEdges.map((e) => e.from));

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "UP",
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      // One layered pass over everything: isolated nodes (background, or nodes whose edges haven't streamed yet)
      // share a row instead of being stacked as separate components above the conclusion.
      "elk.separateConnectedComponents": "false",
      // Keep arrival order stable so streaming nodes don't reshuffle siblings.
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      // Routed edges get distinct attachment points, so terminators don't pile up on one spot.
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: measured?.get(n.id)?.height ?? estimateNodeHeight(n.text),
      ...(withConstraints && n.kind === "main_conclusion" && !hasOutgoing.has(n.id)
        ? { layoutOptions: { "elk.layered.layering.layerConstraint": "LAST" } }
        : {}),
    })),
    edges: layoutEdges.map((e) => ({ id: EDGE_PREFIX + e.id, sources: [e.from], targets: [e.to] })),
  };
}

function fromElk(result: ElkNode): Layout {
  const positions: Positions = new Map();
  for (const child of result.children ?? []) {
    positions.set(child.id, {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? NODE_WIDTH,
      height: child.height ?? 0,
    });
  }
  const routes = new Map<string, Point[]>();
  for (const edge of result.edges ?? []) {
    const section = edge.sections?.[0];
    if (!section || edge.sections!.length > 1) continue;
    routes.set(edge.id.slice(EDGE_PREFIX.length), [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]);
  }
  return { nodes: positions, edges: routes };
}

/** Last resort so the map is never blank: main conclusions first, rows of equal-height cells, no routes. */
export function gridLayout(nodes: readonly ArgNode[], measured?: ReadonlyMap<string, Size>): Layout {
  const ordered = [...nodes].sort((a, b) => Number(b.kind === "main_conclusion") - Number(a.kind === "main_conclusion"));
  const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const heightOf = (n: ArgNode) => measured?.get(n.id)?.height ?? estimateNodeHeight(n.text);
  const positions: Positions = new Map();
  let y = 0;
  for (let row = 0; row * columns < ordered.length; row++) {
    const cells = ordered.slice(row * columns, (row + 1) * columns);
    const rowHeight = Math.max(...cells.map(heightOf));
    cells.forEach((n, col) => {
      positions.set(n.id, { x: col * (NODE_WIDTH + GRID_GAP), y, width: NODE_WIDTH, height: heightOf(n) });
    });
    y += rowHeight + GRID_GAP;
  }
  return { nodes: positions, edges: new Map() };
}

/**
 * Layered layout with the main conclusion at the top.
 *
 * Edges point from the supporting/attacking node to its target, so the conclusion is the sink of
 * the graph. ELK layered puts sources in the first layer and sinks in the last; direction UP
 * orients layers bottom-to-top, which lands sinks (conclusions) at the top without reversing edges.
 *
 * Never rejects: retries without layer constraints, then falls back to a grid.
 */
export async function layoutMap(
  nodes: readonly ArgNode[],
  edges: readonly ArgEdge[],
  measured?: ReadonlyMap<string, Size>,
): Promise<Layout> {
  if (nodes.length === 0) return emptyLayout;
  for (const withConstraints of [true, false]) {
    try {
      const elk = await getElk();
      return fromElk(await elk.layout(buildGraph(nodes, edges, measured, withConstraints)));
    } catch (err) {
      console.warn(`ELK layout failed${withConstraints ? "; retrying without layer constraints" : "; using a grid"}`, err);
    }
  }
  return gridLayout(nodes, measured);
}
