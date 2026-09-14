# Logica

Paste an argument, link an article or video, or name a famous argument, and Logica turns it into an interactive map of claims, premises, assumptions, evidence and objections, then lets you probe it.

## Documents

- [EXECUTIVE_PLAN.md](EXECUTIVE_PLAN.md): product vision, users, business model, go-to-market, roadmap.
- [PLAN.md](PLAN.md): technical evaluation, stack choice, data model, ingestion, build phases.
- [PIPELINE.md](PIPELINE.md): the reasoning pipeline from raw input to map, grounded in logic and argumentation theory.
- [DESIGN.md](DESIGN.md): the monochrome MVP design.

## Status

Phase 1 MVP: paste text, get a streaming, source-anchored argument map. Click a node to see its verbatim quote.

## Layout

```
packages/schema   Zod schema for the argument graph + HTTP/SSE contract + quote location. Shared by both apps.
apps/api          Hono on Node. Runs the pipeline (Reading → Segmenting → Structuring) with Claude, verifies quotes, streams events over SSE, stores maps as JSON files.
apps/web          Vite + React + React Flow + elkjs + Tailwind v4. Paste screen and map screen.
```

## Running locally

Requires Node 22+ and pnpm 10.

```sh
pnpm install
cp .env.example .env        # add ANTHROPIC_API_KEY, or leave it empty for the mock pipeline
pnpm dev                    # api on :8787, web on :5173
```

Open http://localhost:5173. Without an API key (or with `LOGICA_MOCK=1`) the API runs a deterministic mock pipeline; pasting the sample in `packages/schema/src/examples.ts` renders the worked example from PIPELINE.md §11.

```sh
pnpm typecheck
pnpm test
pnpm build
```
