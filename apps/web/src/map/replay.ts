import type { ArgMap, MapEvent } from "@logica/schema";

export interface TimedEvent {
  /** Milliseconds after the replay starts. */
  at: number;
  event: MapEvent;
}

/** Pause after each kind of event: stages linger so the label is readable, edges are quick. */
const PAUSE: Record<MapEvent["type"], number> = {
  stage: 700,
  node: 380,
  edge: 220,
  done: 0,
  error: 0,
};

/**
 * Rebuild the event sequence a finished map was streamed with, in the pipeline's order
 * (reading → segmenting: quoted nodes → structuring: implied nodes, then edges → done),
 * so a replay looks like the original build without calling the API again.
 */
export function replayEvents(map: ArgMap): TimedEvent[] {
  const events: MapEvent[] = [
    { type: "stage", stage: "reading" },
    { type: "stage", stage: "segmenting" },
    ...map.nodes.filter((n) => n.explicit).map((node): MapEvent => ({ type: "node", node })),
    { type: "stage", stage: "structuring" },
    ...map.nodes.filter((n) => !n.explicit).map((node): MapEvent => ({ type: "node", node })),
    ...map.edges.map((edge): MapEvent => ({ type: "edge", edge })),
    { type: "done", map },
  ];

  let at = 0;
  return events.map((event) => {
    const timed = { at, event };
    at += PAUSE[event.type];
    return timed;
  });
}
