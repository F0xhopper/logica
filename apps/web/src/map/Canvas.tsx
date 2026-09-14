import type { ArgEdge, ArgNode } from "@logica/schema";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArgEdgePath, EdgeMarkers, type ArgFlowEdge, type Emphasis } from "./ArgEdgePath.tsx";
import { ArgNodeCard, type ArgFlowNode } from "./ArgNodeCard.tsx";
import { emptyLayout, layoutKey, layoutMap, type Layout, type Size } from "./layout.ts";
import { visibleEdges } from "./streamReducer.ts";

const nodeTypes: NodeTypes = { arg: ArgNodeCard };
const edgeTypes: EdgeTypes = { arg: ArgEdgePath };

const FIT_DEBOUNCE_MS = 200;

interface CanvasProps {
  nodes: readonly ArgNode[];
  edges: readonly ArgEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ nodes, edges, selectedId, onSelect }: CanvasProps) {
  const { fitView } = useReactFlow();
  const [layout, setLayout] = useState<Layout>(emptyLayout);
  const positions = layout.nodes;
  const [measured, setMeasured] = useState<ReadonlyMap<string, Size>>(() => new Map());
  const nodeCache = useRef(new Map<string, ArgFlowNode>());
  const userMoved = useRef(false);

  const shown = useMemo(() => visibleEdges(nodes, edges), [nodes, edges]);

  // Re-layout only when the structure, a kind or a node's size changes, not on every replayed event.
  const key = useMemo(() => layoutKey(nodes, shown, measured), [nodes, shown, measured]);

  const latest = useRef({ nodes, shown, measured });
  latest.current = { nodes, shown, measured };

  useEffect(() => {
    let stale = false;
    const { nodes, shown, measured } = latest.current;
    layoutMap(nodes, shown, measured)
      .then((next) => {
        if (!stale) setLayout(next);
      });
    return () => {
      stale = true;
    };
  }, [key]);

  // Follow the growing map until the user takes over the viewport.
  useEffect(() => {
    if (positions.size === 0 || userMoved.current) return;
    const t = setTimeout(() => {
      if (!userMoved.current) void fitView({ padding: 0.15, maxZoom: 1 });
    }, FIT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [positions, fitView]);

  // xyflow treats a new node object without `measured` as unmeasured: it hides the node and drops its
  // handle bounds until the ResizeObserver runs again (adoptUserNodes/parseHandles in @xyflow/system).
  // So pass our last measurement back, and reuse unchanged objects so memoised cards don't re-render.
  const rfNodes = useMemo<ArgFlowNode[]>(() => {
    const prev = nodeCache.current;
    const next = new Map<string, ArgFlowNode>();
    const out: ArgFlowNode[] = [];
    for (const node of nodes) {
      const box = positions.get(node.id);
      if (!box) continue;
      const selected = node.id === selectedId;
      const size = measured.get(node.id);
      const old = prev.get(node.id);
      const reusable =
        old &&
        old.data.node === node &&
        old.data.selected === selected &&
        old.position.x === box.x &&
        old.position.y === box.y &&
        old.measured === size;
      const rfNode: ArgFlowNode = reusable
        ? old
        : {
            id: node.id,
            type: "arg",
            position: { x: box.x, y: box.y },
            data: { node, selected },
            draggable: false,
            connectable: false,
            selectable: false,
            ariaLabel: node.text,
            ...(size ? { measured: size } : {}),
          };
      next.set(node.id, rfNode);
      out.push(rfNode);
    }
    nodeCache.current = next;
    return out;
  }, [nodes, positions, selectedId, measured]);

  const rfEdges = useMemo<ArgFlowEdge[]>(
    () =>
      shown
        .filter((e) => positions.has(e.from) && positions.has(e.to))
        .map((e) => {
          const connected = selectedId !== null && (e.from === selectedId || e.to === selectedId);
          const emphasis: Emphasis = selectedId === null ? "normal" : connected ? "strong" : "muted";
          return {
            id: e.id,
            type: "arg",
            source: e.from,
            target: e.to,
            data: { kind: e.kind, explicit: e.explicit, emphasis, route: layout.edges.get(e.id) },
            selectable: false,
            focusable: false,
            zIndex: connected ? 1 : 0,
          };
        }),
    [shown, positions, layout.edges, selectedId],
  );

  const onNodesChange = useCallback((changes: NodeChange<ArgFlowNode>[]) => {
    setMeasured((prev) => {
      let next: Map<string, Size> | null = null;
      for (const change of changes) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const { width, height } = change.dimensions;
        const old = prev.get(change.id);
        if (old && Math.abs(old.width - width) <= 1 && Math.abs(old.height - height) <= 1) continue;
        next ??= new Map(prev);
        next.set(change.id, { width, height });
      }
      return next ?? prev;
    });
  }, []);

  return (
    <div className="absolute inset-0">
      <EdgeMarkers />
      <ReactFlow<ArgFlowNode, ArgFlowEdge>
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        onMove={(event) => {
          if (event) userMoved.current = true;
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--grey-2)" />
      </ReactFlow>
    </div>
  );
}
