# Logica — Evaluation & Recommended Stack

## 1. The idea in one line

Paste an argument, or drop in a URL, a YouTube video, a PDF, or just name a famous argument ("Searle's Chinese Room") → get an interactive, editable map of claims, premises, assumptions, evidence, objections and conclusions, with an AI layer that checks whether the reasoning holds and lets you probe it Socratically.

## 2. Evaluation

**What's strong**

- **Real gap.** Argument mapping tools exist (Kialo, Argdown, Rationale, OVA, MindMup) but they are all *manual*: you draw the map yourself. Nobody has a good "paste text → map" product because argument mining was a hard NLP research problem until LLMs. It's now tractable.
- **The map is the product, not the chat.** Most "AI for essays" tools return prose. A structured, clickable graph is a genuinely different UX and hard to replicate with a ChatGPT prompt.
- **Clear, teachable vocabulary.** Toulmin (claim / grounds / warrant / backing / qualifier / rebuttal) and support/attack graphs (AIF, Argdown) give you a proven schema to build on rather than inventing one.
- **Natural expansion path.** Single essay → dialogue/debate transcript → multi-document → collaborative map.

**Honest risks**

- **Extraction consistency.** The same essay should produce roughly the same map every time. LLM output varies. Needs a strict schema, verbatim source quotes on every node, and an eval set from day one.
- **Over-claiming validity.** "This conclusion doesn't follow" is a strong statement. If the model is wrong 10% of the time, users stop trusting the whole map. Present analysis as flagged questions with confidence, always tied to quoted text.
- **Big inputs blow up the graph.** A 40-page legal brief yields hundreds of nodes. You'll need hierarchy (collapsible sub-arguments) early, not just a flat graph.
- **Who pays?** Pick one wedge first: critical-thinking / philosophy courses, debate coaching, or legal/policy analysis. Education is the easiest to reach; legal pays the most.
- **Name.** "Logica" is already used by a large IT services firm (now CGI) and a Google logic-programming language. Worth a trademark search before you commit.

**Verdict:** worth building. The technical core (LLM extraction into a fixed schema + graph UI) is a few weeks of focused work for an MVP. The hard part is trust and consistency, which is an eval and prompt-design problem, not an infrastructure problem.

## 3. Language choice: Go vs Python vs Node vs C#

The backend is thin. It orchestrates Claude calls, validates a JSON graph, stores it, and streams updates to a browser. The frontend (graph rendering, interaction) is where most of the code and most of the product lives. That shapes the decision.

| | TypeScript / Node | Python | Go | C# |
|---|---|---|---|---|
| Anthropic SDK | Excellent (Zod structured outputs, streaming helpers, tool runner) | Excellent (Pydantic `messages.parse`) | Good, official, verbose | Good, official, newer |
| Fit for LLM-orchestration app | Best | Best | OK, more boilerplate | OK |
| Share graph schema with frontend | **Yes** (one Zod schema: Claude output → API → React) | No, duplicated types | No | No |
| NLP / research libs (if you go custom) | Thin | Best (spaCy, HF, eval tooling) | Thin | Thin |
| Streaming / real-time to browser | Very natural | Fine (FastAPI, async) | Very good | Very good (SignalR) |
| Perf / concurrency | Fine (workload is I/O-bound) | Fine | Best, but irrelevant here | Very good |
| Community examples for AI apps | Large | Largest | Small | Small |
| **Verdict** | **Recommended** | Second; add for evals/research later | Not for this product | Only if you're already a .NET shop |

**Recommendation: TypeScript end-to-end.** The single biggest win is one schema definition for the argument graph, used to constrain Claude's output, validate at the API, and type the React components. Python is the only real alternative and only wins if you plan to train or fine-tune your own argument-mining models. You can add a Python eval harness later without changing the product stack.

## 4. Recommended stack

**Frontend**
- React + TypeScript (Vite, or Next.js if you want SSR and API routes in one repo)
- **React Flow (xyflow)** for the interactive graph: custom node types per claim kind, edge types for support/attack
- **elkjs** (layered layout) for auto-layout; dagre is simpler if ELK feels heavy
- Zustand or plain React state for the map; TanStack Query for server state
- Tailwind for styling

**Backend**
- Node + TypeScript. Hono or Fastify (or Next.js route handlers)
- `@anthropic-ai/sdk` with **structured outputs** (`output_config.format` via Zod) so every extraction returns a valid graph
- **Streaming** for the initial analysis so the map builds live instead of after a 30 s wait
- **Prompt caching**: the source text + current graph JSON is the stable prefix; every interactive op (inspect, challenge, counter, Socratic probe) is a small cached call on top
- **pg-boss** (job queue on Postgres, no Redis) for slow ingestion jobs like video transcription; progress streamed to the browser over SSE

**LLM**
- **Claude Opus 5** (`claude-opus-5`) as the default for extraction and analysis. Adaptive thinking is on by default; use `effort: "high"` for the initial map, and measure whether `medium` / `low` holds quality for quick interactive ops before considering a cheaper model.
- Cost sanity check: a 3,000-word essay is ~4k input tokens + a few k output → roughly $0.05–0.15 per full analysis on Opus 5, and cents per interactive op with caching.

**Data**
- **Postgres** (Supabase or Neon): users, maps, versions. Store each map as a JSONB document. Argument graphs are small (tens to low hundreds of nodes), so a graph database is unnecessary.
- Version history as immutable snapshots per edit, so "challenge this premise" is reversible and diff-able.

**Auth / hosting**
- Clerk or Auth.js; Vercel or Fly.io; nothing exotic.

**Skip for the MVP:** graph DB, vector DB, Redis, microservices, custom NLP models. Add the job queue only when transcription lands.

## 5. Core data model (sketch)

```ts
type NodeKind = "claim" | "premise" | "assumption" | "evidence" | "objection" | "conclusion";
type EdgeKind = "supports" | "attacks" | "assumes" | "qualifies";

type SourceKind = "text" | "url" | "pdf" | "youtube" | "audio" | "reference";
type Anchor = { char: [number, number] } | { page: number } | { time: number; speaker?: string };

interface Source   { kind: SourceKind; title: string; url?: string; text: string; provenance: "extracted" | "reconstructed"; }
interface ArgNode  { id: string; kind: NodeKind; text: string; quote?: string; anchor?: Anchor; confidence: number; }
interface ArgEdge  { id: string; from: string; to: string; kind: EdgeKind; strength: number; }
interface Analysis { gaps: Finding[]; contradictions: Finding[]; fallacies: Finding[]; }
interface ArgMap   { id: string; source: Source; nodes: ArgNode[]; edges: ArgEdge[]; analysis: Analysis; version: number; }
```

- `quote` is a verbatim span from the source. Verify it server-side with a string match. A node whose quote can't be found gets flagged; this is your main hallucination guard.
- `anchor` is what the quote points back to: character offsets for text, a page for PDFs, a timestamp (and speaker) for video. The map UI uses it to jump to the source.
- Borrow vocabulary from Toulmin for the UI and support **Argdown export** so power users and academics can take maps elsewhere.

## 6. How the AI layer works

```
source (pasted text / URL / PDF / transcript)  ← see §7
  └─> Claude call #1 (structured output): segment → nodes + edges + quotes
        └─> validate schema + quotes → store v1 → render
              └─> Claude call #2 (cached prefix): analysis pass → gaps, missing premises, contradictions, fallacies
                    └─> user clicks a node
                          └─> op: inspect | challenge | strengthen | counter | socratic
                                └─> Claude call (cached prefix + op) → returns a graph *delta* → new version
```

Every interactive action is the same shape: current map + one instruction → structured delta. That keeps the backend to essentially one endpoint.

## 7. Ingestion: URLs, videos, PDFs, references

Every input funnels into one normalized `Source` before extraction, so the map pipeline never cares where the text came from. The only thing that differs per source type is the **anchor**: what a node's quote points back to.

| Input | How to get the text | Anchor | Effort |
|---|---|---|---|
| Pasted text | As-is | Char offsets | Done |
| Web page / article | Claude's `web_fetch` server tool (pass the URL, Claude fetches it), or fetch + Mozilla Readability yourself. Playwright headless as a fallback for JS-heavy pages. | Char offsets + URL | Small |
| PDF (paper, brief, book chapter) | Send the PDF straight to Claude as a document block (up to 600 pages). No parsing library needed. | Page number | Small |
| YouTube / podcast / lecture | 1) Pull existing captions (fast, free). 2) Fall back to downloading audio and transcribing with a speech-to-text API that does speaker diarization (AssemblyAI, Deepgram) so you know who said what. | Timestamp + speaker → click a claim, jump to that moment in the video | Medium |
| Named argument ("Rawls on the difference principle") | Claude's `web_search` tool to find a canonical source and fetch it. If nothing good is found, reconstruct from Claude's own knowledge. | URL if found, otherwise labelled **reconstructed** | Small |

Design points:

- **Provenance is a first-class label.** A map built from a fetched source is *extracted*; one built from Claude's memory is *reconstructed*. Show the difference prominently. They deserve different levels of trust.
- **Video is the standout feature.** Debates and lectures are where argument structure is hardest to follow in real time. Timestamped nodes with speaker tags, and attack edges drawn *between* speakers, is something no existing tool does.
- **Transcription takes minutes, so it needs a background job.** That's the pg-boss + SSE bullet in §4. Pages and PDFs are fast enough to stay synchronous.
- **YouTube's terms of service** prohibit downloading video or audio, and the official Data API only returns captions for videos you own. Caption scrapers and yt-dlp work today but can break or get rate-limited without notice. Mitigations: try captions first, offer "upload your own audio or transcript", or pay a third-party transcript API to carry that risk.
- **Context size is not the problem.** A two-hour transcript is roughly 35k tokens, well within one Opus 5 call. The problem is the *map* size, which is why collapsible sub-arguments matter more once video lands.

## 8. Phases

1. **Static map (2–3 weeks).** Paste → extract → render. No editing. Get 20 real essays through it and look at the maps. This tells you whether the idea works.
2. **Interactivity + easy sources.** Click to inspect, challenge / strengthen a premise, request a counter-argument, Socratic probing. Versioning. Add URL and PDF input here since Claude handles both natively and it's a day of work.
3. **Analysis layer.** Missing premises (enthymemes), contradictions, fallacy flags, "does the conclusion follow" with confidence. Build an eval set of 30–50 annotated texts and score against it before shipping this.
4. **Scale & share.** Hierarchical / collapsible maps for long documents, sharing links, Argdown / PNG export.
5. **Video & references.** YouTube / audio via transcription with timestamp and speaker anchors, debate mode with cross-speaker attack edges, and "name an argument" lookup via web search.

## 9. Decisions to make early

- **Wedge user:** students & educators, debaters, or legal/policy analysts. Everything downstream (tone, depth, pricing) follows from this.
- **How opinionated the analysis is:** "here's a question to consider" vs "this argument is invalid." Start soft, tighten as evals improve.
- **Repo layout:** single monorepo (`apps/web`, `apps/api`, `packages/schema`) so the Zod schema is shared from day one.
