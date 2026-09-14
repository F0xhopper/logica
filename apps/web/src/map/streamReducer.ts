import type { ArgEdge, ArgMap, ArgNode, MapEvent, Stage } from "@logica/schema";

export type StreamStatus = "loading" | "streaming" | "done" | "error" | "not_found";

export interface StreamState {
  status: StreamStatus;
  stage: Stage | null;
  /** Source title etc. From GET /api/maps/:id, later replaced by the `done` map. */
  map: ArgMap | null;
  nodes: ArgNode[];
  /** May reference nodes that haven't arrived yet; render through `visibleEdges`. */
  edges: ArgEdge[];
  error: string | null;
}

export type StreamAction =
  | { type: "loaded"; map: ArgMap }
  | { type: "not_found" }
  | { type: "event"; event: MapEvent }
  | { type: "failed"; message: string }
  /** Clear a finished map back to an empty canvas so replayed events can rebuild it. */
  | { type: "replay" };

export const initialStreamState: StreamState = {
  status: "loading",
  stage: null,
  map: null,
  nodes: [],
  edges: [],
  error: null,
};

/** Insert or replace by id, keeping first-seen order so replays don't reshuffle the layout. */
function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const i = items.findIndex((x) => x.id === item.id);
  if (i === -1) return [...items, item];
  const next = items.slice();
  next[i] = item;
  return next;
}

function finished(state: StreamState): boolean {
  return state.status === "done" || state.status === "error" || state.status === "not_found";
}

function fromFinalMap(state: StreamState, map: ArgMap): StreamState {
  return { ...state, status: "done", stage: null, map, nodes: map.nodes, edges: map.edges, error: null };
}

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "loaded": {
      const { map } = action;
      if (finished(state)) return { ...state, map: state.map ?? map };
      if (map.status === "done") return fromFinalMap(state, map);
      if (map.status === "error") {
        return { ...state, status: "error", stage: null, map, error: map.error ?? "Couldn't map this." };
      }
      return { ...state, status: "streaming", map };
    }
    case "not_found":
      return { ...initialStreamState, status: "not_found" };
    case "failed":
      if (finished(state)) return state;
      return { ...state, status: "error", stage: null, error: action.message };
    case "replay":
      if (state.map?.status !== "done") return state;
      return { ...state, status: "streaming", stage: null, nodes: [], edges: [], error: null };
    case "event": {
      if (finished(state)) return state;
      const { event } = action;
      switch (event.type) {
        case "stage":
          return { ...state, status: "streaming", stage: event.stage };
        case "node":
          return { ...state, status: "streaming", nodes: upsert(state.nodes, event.node) };
        case "edge":
          return { ...state, status: "streaming", edges: upsert(state.edges, event.edge) };
        case "done":
          return fromFinalMap(state, event.map);
        case "error":
          return { ...state, status: "error", stage: null, error: event.message };
      }
    }
  }
}

/** Edges whose endpoints both exist (DESIGN §4: edges draw after both ends exist). */
export function visibleEdges(nodes: readonly ArgNode[], edges: readonly ArgEdge[]): ArgEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}
