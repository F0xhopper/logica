import type { EdgeKind } from "@logica/schema";
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import type { Point } from "./layout.ts";

export type Emphasis = "normal" | "strong" | "muted";

export type ArgFlowEdge = Edge<{ kind: EdgeKind; explicit: boolean; emphasis: Emphasis; route?: Point[] }, "arg">;

/** Orthogonal polyline with sharp right-angle bends. */
export function routePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

function markerId(kind: EdgeKind, muted: boolean): string {
  return `logica-${kind === "supports" ? "arrow" : "bar"}-${muted ? "muted" : "fg"}`;
}

function ArgEdgePathImpl(props: EdgeProps<ArgFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  // Prefer ELK's route; fall back to a square step between handles while a fresh layout is pending.
  const path = data?.route
    ? routePath(data.route)
    : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 0 })[0];
  const kind = data?.kind ?? "supports";
  const emphasis = data?.emphasis ?? "normal";
  const muted = emphasis === "muted";

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={`url(#${markerId(kind, muted)})`}
      interactionWidth={0}
      style={{
        stroke: muted ? "var(--grey-3)" : "var(--fg)",
        strokeWidth: emphasis === "strong" ? 2 : 1,
        strokeDasharray: data?.explicit === false ? "5 4" : undefined,
      }}
    />
  );
}

export const ArgEdgePath = memo(ArgEdgePathImpl);

/**
 * The two terminators from DESIGN §6, in black and in grey-3 for de-emphasised edges.
 * userSpaceOnUse keeps them the same size when the connected edge thickens to 2px.
 */
export function EdgeMarkers() {
  const variants = [
    { muted: false, colour: "var(--fg)" },
    { muted: true, colour: "var(--grey-3)" },
  ];
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        {variants.map(({ muted, colour }) => (
          <g key={String(muted)}>
            {/* ▲ filled triangle whose tip sits on the node border. */}
            <marker
              id={markerId("supports", muted)}
              viewBox="-10 -5 10 10"
              refX="0"
              refY="0"
              markerWidth="10"
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M-10,-4.5 L0,0 L-10,4.5 Z" style={{ fill: colour }} />
            </marker>
            {/* ⊣ flat bar across the line, just short of the node border. */}
            <marker
              id={markerId("attacks", muted)}
              viewBox="-3 -7 3 14"
              refX="0"
              refY="0"
              markerWidth="3"
              markerHeight="14"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <rect x="-3" y="-7" width="2" height="14" style={{ fill: colour }} />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  );
}
