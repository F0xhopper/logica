import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { selectStages } from "./pipeline/index.ts";
import { FileMapStore } from "./store.ts";

const log = console;
const port = Number(process.env.PORT ?? 8787);
// Relative LOGICA_DATA_DIR resolves against the cwd (apps/api under pnpm --filter); the default sits next to src/.
const dataDir = process.env.LOGICA_DATA_DIR
  ? resolve(process.env.LOGICA_DATA_DIR)
  : fileURLToPath(new URL("../.data", import.meta.url));

const { stages, mock, paceMs } = selectStages(process.env, log);
const maxConcurrent = Number(process.env.LOGICA_MAX_CONCURRENT) || 3;
const app = createApp({ store: new FileMapStore(dataDir), mock, maxConcurrent, pipeline: { stages, paceMs, log } });

const server = serve({ fetch: app.fetch, port }, (info) => {
  log.info(`[api] listening on http://localhost:${info.port}`);
  log.info(
    mock
      ? `[api] pipeline: MOCK (${process.env.LOGICA_MOCK === "1" ? "LOGICA_MOCK=1" : "no ANTHROPIC_API_KEY"})`
      : "[api] pipeline: Claude (claude-opus-5)",
  );
  log.info(`[api] data dir: ${dataDir}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  // SSE streams keep connections open; don't wait on them forever.
  setTimeout(() => process.exit(0), 2_000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
