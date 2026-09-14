import { MapEvent } from "@logica/schema";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { getMap } from "../api.ts";
import { replayEvents } from "./replay.ts";
import { initialStreamState, streamReducer, type StreamAction, type StreamState } from "./streamReducer.ts";

const EVENT_TYPES = ["stage", "node", "edge", "done", "error"] as const;

/**
 * Turn one SSE message into a reducer action and whether to close the stream.
 * A terminal event we can't read must still close the stream, or the browser reconnects and replays forever.
 */
export function interpretMessage(eventType: string, data: string): { action: StreamAction | null; close: boolean } {
  const terminal = eventType === "done" || eventType === "error";
  let parsed: ReturnType<typeof MapEvent.safeParse> | null = null;
  try {
    parsed = MapEvent.safeParse(JSON.parse(data));
  } catch {
    // Malformed JSON; handled below like a schema failure.
  }
  if (parsed?.success) {
    const close = parsed.data.type === "done" || parsed.data.type === "error";
    return { action: { type: "event", event: parsed.data }, close };
  }
  console.warn(`Ignoring unreadable "${eventType}" event`, parsed?.error ?? data);
  if (!terminal) return { action: null, close: false };
  return { action: { type: "failed", message: "The server sent a result this page can't read." }, close: true };
}

/**
 * Loads a map and, if it's still being built, follows its SSE stream.
 * `replay` re-animates a finished map locally, with no API calls.
 * Mount with `key={id}` so a new id starts from a fresh state.
 */
export function useMapStream(id: string): { state: StreamState; replay: () => void } {
  const [state, dispatch] = useReducer(streamReducer, initialStreamState);
  const replayTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopReplay = useCallback(() => {
    for (const t of replayTimers.current) clearTimeout(t);
    replayTimers.current = [];
  }, []);

  const replay = useCallback(() => {
    if (state.map?.status !== "done") return;
    stopReplay();
    dispatch({ type: "replay" });
    replayTimers.current = replayEvents(state.map).map(({ at, event }) =>
      setTimeout(() => dispatch({ type: "event", event }), at),
    );
  }, [state.map, stopReplay]);

  useEffect(() => stopReplay, [stopReplay]);

  useEffect(() => {
    const abort = new AbortController();
    let source: EventSource | null = null;

    const onMessage = (type: string, ev: MessageEvent) => {
      const { action, close } = interpretMessage(type, String(ev.data));
      if (action) dispatch(action);
      if (close) source?.close();
    };

    const open = () => {
      source = new EventSource(`/api/maps/${encodeURIComponent(id)}/events`);
      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (ev) => {
          // The server's named `error` event and EventSource's own connection error share a name;
          // only the former carries data.
          if (ev instanceof MessageEvent && typeof ev.data === "string") {
            onMessage(type, ev);
          } else if (source?.readyState === EventSource.CLOSED) {
            dispatch({ type: "failed", message: "Lost the connection to the server." });
          }
          // readyState CONNECTING: the browser is retrying; the server replays and the reducer dedupes.
        });
      }
    };

    getMap(id, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        if (result.kind === "not_found") return dispatch({ type: "not_found" });
        dispatch({ type: "loaded", map: result.map });
        if (result.map.status !== "done" && result.map.status !== "error") open();
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        dispatch({ type: "failed", message: err instanceof Error ? err.message : "Couldn't load this map." });
      });

    return () => {
      abort.abort();
      source?.close();
    };
  }, [id]);

  return { state, replay };
}
