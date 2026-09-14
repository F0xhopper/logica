import { EXAMPLE_ESSAY } from "@logica/schema";
import type { ModelBrief, ModelProposition, ModelStructure, Stages } from "./types.ts";

/**
 * Deterministic stand-in for Claude, so the app works end-to-end without an API key.
 * The example essay gets the hand-built map from PIPELINE.md §11; anything else gets a
 * sentence-level heuristic that is obviously not real analysis but exercises every event type.
 */

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

const isExample = (source: string) => source.trim() === EXAMPLE_ESSAY.trim();

const EXAMPLE_BRIEF: ModelBrief = {
  genre: "op-ed",
  argumentative: true,
  standpoints: ["Schools should ban phones."],
  nonArgumentativeSpans: [],
  keyTerms: [{ term: "ban phones", definedInText: false, note: "In class, or on school premises at all?" }],
  audience: "General readers; parents and educators.",
};

const EXAMPLE_PROPOSITIONS: ModelProposition[] = [
  {
    id: "C",
    kind: "main_conclusion",
    text: "Schools should ban phones.",
    quote: "We should ban phones in schools",
    assertedBy: "author",
    qualifier: "unqualified",
    scope: null,
    confidence: 0.95,
  },
  {
    id: "P1",
    kind: "evidence",
    text: "Students who use phones in class get lower grades.",
    quote: "Studies show students who use phones in class get lower grades",
    assertedBy: "author",
    qualifier: "unqualified",
    scope: null,
    confidence: 0.9,
  },
  {
    id: "P2",
    kind: "premise",
    text: "Every teacher the author has spoken to wants phones gone from schools.",
    quote: "every teacher I've spoken to wants them gone",
    assertedBy: "author",
    qualifier: "unqualified",
    scope: "all",
    confidence: 0.85,
  },
  {
    id: "O1",
    kind: "objection",
    text: "Phones are needed for emergencies.",
    quote: "phones are needed for emergencies",
    assertedBy: "reported",
    qualifier: "unqualified",
    scope: null,
    confidence: 0.9,
  },
  {
    id: "R1",
    kind: "rebuttal",
    text: "Schools have landlines.",
    quote: "schools have landlines",
    assertedBy: "author",
    qualifier: "unqualified",
    scope: null,
    confidence: 0.85,
  },
];

const EXAMPLE_STRUCTURE: ModelStructure = {
  implicit: [
    {
      id: "W1a",
      kind: "assumption",
      text: "Phone use in class causes the lower grades.",
      qualifier: "unqualified",
      scope: null,
      authorWouldAccept: "yes",
      confidence: 0.8,
    },
    {
      id: "W1b",
      kind: "assumption",
      text: "Harm to grades of this size justifies banning phones in schools.",
      qualifier: "unqualified",
      scope: null,
      authorWouldAccept: "probably",
      confidence: 0.7,
    },
    {
      id: "W2",
      kind: "assumption",
      text: "Teachers' preferences are a good guide to school phone policy.",
      qualifier: "unqualified",
      scope: null,
      authorWouldAccept: "probably",
      confidence: 0.65,
    },
  ],
  relations: [
    { from: "P1", to: "C", kind: "supports", structure: "convergent", attackType: null, explicit: true },
    { from: "P2", to: "C", kind: "supports", structure: "convergent", attackType: null, explicit: true },
    { from: "W1a", to: "C", kind: "supports", structure: "linked", attackType: null, explicit: false },
    { from: "W1b", to: "C", kind: "supports", structure: "linked", attackType: null, explicit: false },
    { from: "W2", to: "C", kind: "supports", structure: "linked", attackType: null, explicit: false },
    { from: "O1", to: "C", kind: "attacks", structure: "none", attackType: "rebut", explicit: true },
    { from: "R1", to: "O1", kind: "attacks", structure: "none", attackType: "undermine", explicit: true },
  ],
};

const MAX_HEURISTIC_NODES = 15;
const OBJECTION = /^(but|however|yet|some (argue|say|claim|think|believe)|critics|opponents|others (argue|say|claim))\b/i;
const REPORTED = /^(some|critics|opponents|others)\b/i;

function sentences(source: string): string[] {
  return (source.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).map((s) => s.trim()).filter((s) => /\w/.test(s));
}

function heuristicPropositions(source: string): ModelProposition[] {
  return sentences(source)
    .slice(0, MAX_HEURISTIC_NODES)
    .map((sentence, i) => {
      const objection = i > 0 && OBJECTION.test(sentence);
      return {
        id: `P${i + 1}`,
        kind: i === 0 ? "main_conclusion" : objection ? "objection" : "premise",
        text: sentence,
        quote: sentence,
        assertedBy: objection && REPORTED.test(sentence) ? "reported" : "author",
        qualifier: "unqualified",
        scope: null,
        confidence: 0.3,
      };
    });
}

function heuristicStructure(propositions: ModelProposition[]): ModelStructure {
  const [main, ...rest] = propositions;
  if (!main) return { implicit: [], relations: [] };
  return {
    implicit: [],
    relations: rest.map((p) =>
      p.kind === "objection"
        ? { from: p.id, to: main.id, kind: "attacks", structure: "none", attackType: "rebut", explicit: true }
        : { from: p.id, to: main.id, kind: "supports", structure: "convergent", attackType: null, explicit: true },
    ),
  };
}

export class MockStages implements Stages {
  /** @param delayMs pause per stage, so streaming is visible in the UI. 0 in tests. */
  constructor(private readonly delayMs = 500) {}

  async read(source: string): Promise<ModelBrief> {
    await sleep(this.delayMs);
    if (isExample(source)) return structuredClone(EXAMPLE_BRIEF);
    const first = sentences(source)[0] ?? "";
    return {
      genre: "unknown (mock)",
      argumentative: first.length > 0,
      standpoints: first ? [first] : [],
      nonArgumentativeSpans: [],
      keyTerms: [],
      audience: "unknown (mock)",
    };
  }

  async segment(source: string): Promise<ModelProposition[]> {
    await sleep(this.delayMs);
    return isExample(source) ? structuredClone(EXAMPLE_PROPOSITIONS) : heuristicPropositions(source);
  }

  async structure(source: string, _brief: ModelBrief, propositions: ModelProposition[]): Promise<ModelStructure> {
    await sleep(this.delayMs);
    return isExample(source) ? structuredClone(EXAMPLE_STRUCTURE) : heuristicStructure(propositions);
  }
}
