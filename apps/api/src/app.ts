import { randomUUID } from "node:crypto";
import {
  type ApiError,
  type ArgMap,
  CreateMapRequest,
  type CreateMapResponse,
  type MapEvent,
  titleFrom,
} from "@logica/schema";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { HubRegistry } from "./events.ts";
import { type PipelineDeps, runPipeline } from "./pipeline/index.ts";
import { type MapStore, isSafeId } from "./store.ts";

export interface AppDeps {
  store: MapStore;
  pipeline: Omit<PipelineDeps, "store">;
  mock: boolean;
  /** SSE comment interval; keeps proxies from dropping the stream during long model calls. */
  heartbeatMs?: number;
  /** Pipelines allowed to run at once in this process; more gets 429. Each run holds model calls open for minutes. */
  maxConcurrent?: number;
}

const INTERRUPTED = "This map was interrupted before it finished. Please try again.";

/**
 * Routes per packages/schema/src/api.ts. Built from injected deps so tests can run the
 * whole HTTP + SSE flow against an in-memory store and a zero-delay mock pipeline.
 */
export function createApp(deps: AppDeps): Hono {
  const { store, mock } = deps;
  const log = deps.pipeline.log;
  const hubs = new HubRegistry();
  const heartbeatMs = deps.heartbeatMs ?? 15_000;
  const maxConcurrent = deps.maxConcurrent ?? 3;
  let running = 0;
  const app = new Hono();

  const fail = (status: 400 | 404 | 413 | 429 | 500, error: string) =>
    new Response(JSON.stringify({ error } satisfies ApiError), {
      status,
      headers: { "content-type": "application/json" },
    });

  app.onError((err) => {
    log.error("[api] unhandled error", err);
    return fail(500, "Something went wrong on the server.");
  });
  app.notFound(() => fail(404, "Not found."));

  app.get("/api/health", (c) => c.json({ ok: true, mock }));

  app.post(
    "/api/maps",
    bodyLimit({ maxSize: 1024 * 1024, onError: () => fail(413, "That text is too long for the MVP.") }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return fail(400, "Send JSON with a text field.");
      }
      const parsed = CreateMapRequest.safeParse(body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return fail(400, issue?.code === "invalid_type" ? "Send JSON with a text field." : (issue?.message ?? "Invalid request."));
      }

      if (running >= maxConcurrent) return fail(429, "Logica is busy — try again in a minute.");

      const { text } = parsed.data;
      const map: ArgMap = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        version: 1,
        status: "pending",
        source: { kind: "text", title: titleFrom(text), text, provenance: "extracted" },
        nodes: [],
        edges: [],
      };
      // Claim the slot before the first await so concurrent POSTs can't both slip under the cap.
      running++;
      try {
        await store.put(map);
      } catch (err) {
        running--;
        throw err;
      }

      const hub = hubs.open(map.id);
      void runPipeline(map, (event) => hub.emit(event), { ...deps.pipeline, store }).finally(() => running--);

      return c.json({ id: map.id } satisfies CreateMapResponse, 201);
    },
  );

  app.get("/api/maps/:id", async (c) => {
    const id = c.req.param("id");
    const map = isSafeId(id) ? await store.get(id) : null;
    return map ? c.json(map) : fail(404, "Map not found.");
  });

  app.get("/api/maps/:id/events", async (c) => {
    const id = c.req.param("id");
    const hub = hubs.get(id);
    const stored = hub ? null : isSafeId(id) ? await store.get(id) : null;
    if (!hub && !stored) return fail(404, "Map not found.");

    return streamSSE(c, async (stream) => {
      const aborted = new AbortController();
      stream.onAbort(() => aborted.abort());
      const write = (event: MapEvent) => stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      const heartbeat = setInterval(() => {
        if (!stream.aborted && !stream.closed) void stream.write(": keep-alive\n\n").catch(() => aborted.abort());
      }, heartbeatMs);

      try {
        if (hub) {
          for await (const event of hub.events(aborted.signal)) await write(event);
          return;
        }
        // No live run in this process: replay from the store (api.ts: nodes, edges, then done).
        const map = stored!;
        if (map.status === "done") {
          for (const node of map.nodes) await write({ type: "node", node });
          for (const edge of map.edges) await write({ type: "edge", edge });
          await write({ type: "done", map });
        } else if (map.status === "error") {
          await write({ type: "error", message: map.error ?? INTERRUPTED });
        } else {
          // pending/running with no hub means the process that owned the run is gone (restart).
          await store.put({ ...map, status: "error", error: INTERRUPTED });
          await write({ type: "error", message: INTERRUPTED });
        }
      } finally {
        clearInterval(heartbeat);
      }
    });
  });

  return app;
}
