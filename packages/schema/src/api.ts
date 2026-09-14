import { z } from "zod";
import { ArgEdge, ArgMap, ArgNode } from "./map.ts";

/**
 * HTTP + SSE contract between apps/web and apps/api.
 *
 *   POST /api/maps               body CreateMapRequest  → 201 CreateMapResponse (pipeline starts in the background)
 *   GET  /api/maps/:id           → 200 ArgMap | 404 ApiError
 *   GET  /api/maps/:id/events    → text/event-stream of MapEvent
 *   GET  /api/health             → 200 { ok: true, mock: boolean }
 *
 * SSE framing: every message uses `event: <MapEvent.type>` and `data: <JSON MapEvent>`.
 * A subscriber that connects late receives every event emitted so far, in order, then live ones.
 * A subscriber to a finished map receives stage-less replay: all node events, all edge events, then `done`.
 * The stream closes after `done` or `error`.
 */

export const MAX_SOURCE_CHARS = 60_000;

export const CreateMapRequest = z.object({
  text: z.string().trim().min(1, "Paste some text first.").max(MAX_SOURCE_CHARS, "That text is too long for the MVP."),
});
export type CreateMapRequest = z.infer<typeof CreateMapRequest>;

export const CreateMapResponse = z.object({ id: z.string() });
export type CreateMapResponse = z.infer<typeof CreateMapResponse>;

export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/** Shown in the map top bar while streaming (DESIGN.md §4). */
export const Stage = z.enum(["reading", "segmenting", "structuring"]);
export type Stage = z.infer<typeof Stage>;

export const STAGE_LABEL: Record<Stage, string> = {
  reading: "Reading",
  segmenting: "Segmenting",
  structuring: "Structuring",
};

export const MapEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage"), stage: Stage }),
  z.object({ type: z.literal("node"), node: ArgNode }),
  /** Only emitted once both endpoints have been emitted as nodes. */
  z.object({ type: z.literal("edge"), edge: ArgEdge }),
  /** Final, verified map. Clients should replace their local state with it. */
  z.object({ type: z.literal("done"), map: ArgMap }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type MapEvent = z.infer<typeof MapEvent>;
