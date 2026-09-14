import { type ArgEdge, ArgMap, type ArgNode, type MapEvent, type ReadingBrief } from "@logica/schema";
import type { MapStore } from "../store.ts";
import {
  assembleEdges,
  assembleExplicitNodes,
  assembleImplicitNodes,
  ensureMainConclusion,
  findOrphans,
  findSupportCycles,
  inheritImplicitAttribution,
} from "./assemble.ts";
import { ClaudeStages, userMessage } from "./claude.ts";
import { MockStages } from "./mock.ts";
import type { Logger, ModelBrief, Stages } from "./types.ts";

export type { Logger, Stages } from "./types.ts";

export interface PipelineDeps {
  store: MapStore;
  stages: Stages;
  /** Pause between node/edge events so the map visibly builds. 0 in tests. */
  paceMs: number;
  log: Logger;
}

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** Mock when forced or when there is no key to call Claude with. */
export function selectStages(env: NodeJS.ProcessEnv, log: Logger): { stages: Stages; mock: boolean; paceMs: number } {
  const mock = env.LOGICA_MOCK === "1" || !env.ANTHROPIC_API_KEY;
  return mock
    ? { stages: new MockStages(), mock, paceMs: 350 }
    : { stages: new ClaudeStages(log), mock, paceMs: 60 };
}

/** The stored brief is the domain shape; the model's extra steering fields stay out of the contract. */
function toReadingBrief(brief: ModelBrief): ReadingBrief {
  const { genre, argumentative, standpoints, keyTerms, audience } = brief;
  return { genre, argumentative, standpoints, keyTerms, audience };
}

/**
 * Runs S1 → S2+S3 → S4+S6 → assembly for one map, emitting events as it goes and persisting
 * status transitions (pending → running → done | error). Never throws: failures become an
 * `error` event with a user-safe message, and the real error is logged.
 */
export async function runPipeline(initial: ArgMap, emit: (event: MapEvent) => void, deps: PipelineDeps): Promise<void> {
  const { store, stages, paceMs } = deps;
  const tag = `[map ${initial.id}]`;
  const warn = (msg: string) => deps.log.warn(`${tag} ${msg}`);
  const map: ArgMap = { ...initial, status: "running" };
  const source = map.source.text;

  // Events are snapshots: the hub keeps history for late subscribers, and assembly may still
  // adjust these nodes (promotion, attribution) before `done` carries the corrected versions.
  const emitNode = (node: ArgNode) => emit({ type: "node", node: structuredClone(node) });
  const emitEdge = (edge: ArgEdge) => emit({ type: "edge", edge: structuredClone(edge) });

  const finish = async (nodes: ArgNode[], edges: ArgEdge[], implicitCount: number) => {
    // Final contract check: anything that slipped past assembly fails here, not in the browser.
    const done = ArgMap.parse({ ...map, status: "done", nodes, edges });
    await store.put(done);
    const unverified = nodes.filter((n) => n.quoteVerified === false).length;
    deps.log.info(`${tag} done: ${nodes.length} nodes (${implicitCount} implicit, ${unverified} unverified), ${edges.length} edges`);
    emit({ type: "done", map: done });
  };

  try {
    await store.put(map);

    emit({ type: "stage", stage: "reading" });
    const brief = await stages.read(source);
    map.brief = toReadingBrief(brief);
    if (!brief.argumentative && brief.standpoints.length === 0) {
      deps.log.info(`${tag} reading brief says the text is not argumentative; expect few nodes`);
    }
    await store.put(map);

    emit({ type: "stage", stage: "segmenting" });
    const propositions = await stages.segment(source, brief);
    const explicit = assembleExplicitNodes(source, propositions, warn);
    for (const node of explicit.nodes) {
      emitNode(node);
      await sleep(paceMs);
    }
    if (explicit.kept.length === 0) {
      // Nothing to structure; a model call here could only invent propositions.
      deps.log.info(`${tag} no propositions extracted; skipping structuring`);
      await finish([], [], 0);
      return;
    }

    emit({ type: "stage", stage: "structuring" });
    const structure = await stages.structure(source, brief, explicit.kept);
    const implicit = assembleImplicitNodes(structure.implicit, explicit.ids, explicit.nodes.length, warn);
    const nodes = [...explicit.nodes, ...implicit];
    const edges = assembleEdges(structure.relations, explicit.ids, nodes, warn);

    inheritImplicitAttribution(nodes, edges);
    const promoted = ensureMainConclusion(nodes, edges);
    if (promoted) warn(`no main conclusion extracted; promoted ${promoted}`);
    for (const cycle of findSupportCycles(nodes, edges)) warn(`support cycle: ${cycle.join(" → ")}`);
    const orphans = findOrphans(nodes, edges);
    if (orphans.length > 0 && nodes.length > 1) warn(`unconnected nodes: ${orphans.join(", ")}`);

    for (const node of implicit) {
      emitNode(node);
      await sleep(paceMs);
    }
    // Every endpoint has been emitted by now, which is what the contract requires of edge events.
    for (const edge of edges) {
      emitEdge(edge);
      await sleep(paceMs);
    }

    await finish(nodes, edges, implicit.length);
  } catch (err) {
    deps.log.error(`${tag} pipeline failed`, err);
    const message = userMessage(err);
    try {
      await store.put({ ...map, status: "error", error: message, nodes: [], edges: [] });
    } catch (storeErr) {
      deps.log.error(`${tag} could not persist error status`, storeErr);
    }
    emit({ type: "error", message });
  }
}
