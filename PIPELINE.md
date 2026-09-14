# Logica — Reasoning Pipeline

*How to get from raw input (essay, PDF, web page, video, debate) to the most faithful and most useful argument map, grounded in the logic and philosophy traditions that already solved most of these problems.*

Companion documents: [PLAN.md](PLAN.md) (stack and data model) · [EXECUTIVE_PLAN.md](EXECUTIVE_PLAN.md) (product).

---

## 1. Design principles

These fall out of the traditions in §2 and of practical experience with LLM extraction. Every stage below is justified by one or more of them.

1. **Interpret before you evaluate.** Reconstruction (what does the author argue?) and evaluation (does it hold?) are separate passes with separate prompts. Mixing them makes the model "fix" the argument while extracting it, or critique before it understands. This is the hermeneutic rule and the principle of charity.
2. **Charity in reconstruction, fidelity in anchoring.** Explicit nodes carry a verbatim quote and must be faithful. Implicit nodes (unstated premises, warrants) are reconstructed in their most plausible form and clearly marked as implicit. Charity never gets to rewrite a quote.
3. **Small typed steps beat one big prompt.** Argument-mining research (Stab & Gurevych; Lawrence & Reed) decomposes the task into segmentation, component classification, relation identification and structure. LLMs do the same steps better in sequence than all at once, and each step can be checked.
4. **The model judges; algorithms propagate.** Once the graph exists, acceptability, cycles, orphans and load-bearing premises are computed deterministically (Dung's argumentation frameworks, graph algorithms). Never ask the model to do arithmetic on a graph it could hand to code.
5. **Every inference is typed.** Each inference step gets an argumentation scheme (Aristotle's *Topics*, Walton). Schemes come with critical questions, so challenges and fallacy flags are derived from a known template, not improvised.
6. **Preserve modality, scope and attribution.** "Some", "most", "probably", "necessarily" are part of the claim. "Some say X" is not the author asserting X. Qualifier stripping and misattribution are the two most common extraction errors.
7. **Questions with confidence, not verdicts. Aporia is allowed.** Analysis outputs are framed as critical questions the text has or hasn't answered, with a confidence level. A stage may say "unresolved". Socrates ended most dialogues that way.
8. **Verify against the source.** A separate faithfulness pass checks the map against the text. Trust is the product; this is the cheapest insurance for it.

## 2. What each tradition contributes

| Tradition | Core idea | Where it lands in the pipeline |
|---|---|---|
| **Socrates / Plato** (elenchus, definition-seeking, maieutics, aporia) | Elicit commitments, test them for joint consistency; demand definitions of key terms; draw out what's implicit by questioning; accept impasse | Key-term audit (S1), internal-consistency check (S7d), the Socratic op (S10), "unresolved" as a valid output |
| **Aristotle, *Prior/Posterior Analytics*** | Syllogistic validity; demonstration from premises that are primary, true and better known than the conclusion (first principles) | Validity check on deductive steps (S7a); foundations classification of leaf premises (S7b); the "why?" descent stop rule |
| **Aristotle, *Rhetoric*** (enthymeme, ethos/pathos/logos) | Real arguments suppress a premise; persuasion mixes character and emotion with logic | Implicit-premise reconstruction (S6); separating persuasive moves from logical content (S3) |
| **Aristotle, *Topics* & *Sophistical Refutations*** | The topoi: reusable argument patterns; the first fallacy catalogue (equivocation, begging the question, …) | Scheme classification (S5); equivocation check across premises (S7c); fallacy derivation (S7e) |
| **Stoic logic** (Chrysippus) | Propositional forms: modus ponens, modus tollens, disjunctive syllogism; their invalid look-alikes | Formal pattern check on conditional reasoning (S7a) |
| **Scholastic *disputatio*** (Aquinas) | State objections first and at full strength; reply; resolve by drawing a distinction | Structure of the Counter op (S10); "distinguo" as a resolution move |
| **Descartes** (method, foundations) | Divide into parts, order simple to complex, doubt down to what is clear and distinct | Rebuild-from-foundations op (S10); descent ordering |
| **Mill** (*On Liberty* ch. 2; *System of Logic*) | Know the opposing case in its strongest form; methods for evaluating causal evidence | Dialectical-completeness check (S7h); correlation-vs-causation critical questions (S5) |
| **Toulmin** | Claim, grounds, warrant, backing, qualifier, rebuttal; the warrant is usually implicit | Component vocabulary (S3); warrant = the implicit premise of S6; qualifier as a first-class field |
| **Walton** (argumentation schemes + critical questions) | ~60 defeasible patterns (expert opinion, analogy, consequences, sign, cause, precedent…), each with the questions that test it | S5 scheme classification; S7 evaluation; S10 Challenge op. The backbone of principled critique |
| **Pragma-dialectics** (van Eemeren) | Argument as critical discussion with rules; fallacies as rule violations; multiple vs coordinative vs subordinative structure | Linked vs convergent premises (S4); standpoint identification (S1); rule-violation fallacies (S7e) |
| **Pollock** (defeasible reasoning) | Three ways to attack: rebut the claim, undercut the inference, undermine a premise | Attack typology on edges (S4). Tells the user *where* an objection bites |
| **Dung** (abstract argumentation) | Given arguments and attacks, compute which are acceptable | Deterministic status propagation (S7f) after every edit |
| **Hamblin / IAT** (commitment stores; Inference Anchoring Theory) | Track what each speaker has committed to; link dialogue moves to argument structure | Debate and dialogue handling (§7) |
| **Popper** | What would falsify this? | Consequence and falsifiability probe (S7g) |
| **Principle of charity / Rapoport's rules** (Davidson, Dennett) | Reconstruct the strongest reasonable version before criticising; state agreement first | Governs S2–S6 prompts; Counter op ordering |
| **Argument mining** (Stab & Gurevych; Lawrence & Reed; AIF) | Staged extraction; I-nodes and S-nodes; annotated corpora | Overall stage decomposition; eval datasets (§10) |

## 3. Data model additions

Extends the sketch in PLAN.md §5. These fields exist because a stage below produces or consumes them.

```ts
type NodeKind = "main_conclusion" | "intermediate_conclusion" | "premise" | "evidence"
              | "definition" | "assumption" | "objection" | "rebuttal" | "concession" | "background";

type PremiseType = "empirical" | "definitional" | "normative" | "principle" | "testimonial" | "assumption";
type Qualifier   = "necessarily" | "certainly" | "probably" | "typically" | "possibly" | "unqualified";

interface ArgNode {
  id: string; kind: NodeKind; text: string;      // text = canonical standalone proposition
  quote?: string; anchor?: Anchor;               // required when explicit
  explicit: boolean;                             // false = reconstructed (enthymeme / warrant)
  assertedBy: "author" | "reported" | string;    // speaker id in dialogues
  qualifier: Qualifier; scope?: "all" | "most" | "some" | "one";
  premiseType?: PremiseType;                     // leaves only, set in S7b
  acceptability?: "supported" | "unsupported" | "contested" | "common_ground";
  authorWouldAccept?: "yes" | "probably" | "unclear"; // implicit nodes only
  confidence: number;
}

interface Inference {                            // an S-node: premises jointly → conclusion
  id: string; premises: string[]; conclusion: string;
  structure: "linked" | "convergent_member" | "serial";
  scheme: SchemeId;                              // e.g. "expert_opinion", "analogy", "consequences", "modus_ponens"
  criticalQuestions: { q: string; answeredInText: boolean; anchor?: Anchor }[];
  strength?: "strong" | "moderate" | "weak" | "invalid"; strengthReason?: string;
}

interface Attack { id: string; from: string; to: string; type: "rebut" | "undercut" | "undermine"; }

interface Analysis {
  foundations: { nodeId: string; premiseType: PremiseType; acceptability: string }[];
  crux: string[];                                // load-bearing + weak
  issues: Issue[];                               // gaps, equivocation, contradiction, fallacy, unanswered CQ
  status: Record<string, "in" | "out" | "undecided">; // Dung semantics
  unresolved: string[];                          // aporia
}
```

## 4. Pipeline overview

```
raw input ─► S0 ingest/normalize ─► S1 triage & reading brief
                                        │
                     ┌── RECONSTRUCTION (charitable, faithful) ──┐
                     │  S2 segment into propositions            │
                     │  S3 classify components + rhetoric        │
                     │  S4 structure: inferences & attacks       │
                     │  S5+S6 scheme + implicit premises         │
                     └───────────────────────────────────────────┘
                                        │
                     ┌── EVALUATION (critical, derived) ─────────┐
                     │  S7a validity / strength per inference    │
                     │  S7b premise types & acceptability        │
                     │  S7c term consistency                     │
                     │  S7d internal consistency (elenchus)      │
                     │  S7e fallacies (derived from a–d)         │
                     │  S7f status, cycles, crux  (algorithmic)  │
                     │  S7g falsifiability & consequences        │
                     │  S7h dialectical completeness             │
                     └───────────────────────────────────────────┘
                                        │
                     S8 synthesis ─► S9 faithfulness verification ─► render
                                        │
                     S10 interactive ops (why? / challenge / strengthen / counter / socratic / rebuild)
                          each op = cached prefix + one instruction → graph delta → recompute S7f
```

Roughly 8–10 model calls for a document, most of them small and all sharing a cached prefix (taxonomy → source → reading brief → graph). Cost on Opus 5 is on the order of $0.10–0.50 for an essay and a few dollars for a two-hour debate.

## 5. Stages

### S0 · Ingest and normalize
Covered in PLAN.md §7. Output is a `Source` with anchored text. Two things matter here for later quality:
- **Transcripts:** clean disfluencies but keep an offset map to the raw transcript so quotes still verify. Preserve speaker turns; standpoints belong to speakers. Flag low-confidence ASR spans so S9 can tolerate fuzzy quote matches there.
- **PDFs:** send the PDF to the model directly rather than through a text extractor. Page anchors come from the model's output and are verified in S9.

### S1 · Triage and reading brief
*Basis: pragma-dialectics (confrontation stage), Socratic definition-seeking.*

One call over the whole document, output used as context by every later stage, the way a human reads the abstract before the paper.
- **Genre and register:** essay, op-ed, paper, brief, lecture, debate, interview. Sets expectations (a paper has explicit hedges; an op-ed has enthymemes everywhere).
- **Argumentative vs not:** which spans argue, which explain, narrate, describe or entertain. Later stages only mine the argumentative spans. This single step kills most over-extraction.
- **Standpoints:** the main thesis or theses, and whose they are. In a debate, one per speaker plus the proposition at issue.
- **Key terms:** the 5–10 terms the argument depends on, whether the text defines them, and any sense shift you can already see. ("What is X?" before anything else.)
- **Rhetorical situation:** intended audience, what the author treats as common ground. Feeds the charity judgement in S6.

### S2 · Segmentation into propositions
*Basis: argument mining (ADUs); Socratic clarification.*

Split argumentative spans into elementary propositions. For each: a **canonical form** (a standalone declarative sentence with pronouns resolved and ellipsis restored) and the **verbatim quote**. Rules the prompt must enforce:
- A sentence can hold two propositions; a proposition can span sentences.
- Rhetorical questions and irony become the claim they imply, marked as such.
- "Some argue…", "critics say…", "it used to be thought…" → `assertedBy: "reported"`. This is the attribution rule and it is non-negotiable.
- Capture `qualifier` and `scope` from the surface text. "Most studies suggest" is not "studies prove".

### S3 · Component classification
*Basis: Toulmin; Aristotle's Rhetoric.*

Label each proposition with a `NodeKind`. Additionally tag **persuasive moves that are not premises**: appeals to the speaker's character (ethos), emotional framing (pathos), loaded language. They render greyed-out on the map. They are not fallacies by default; they are non-logical work the text is doing, and instructors want students to see them.

### S4 · Structure: inferences and attacks
*Basis: pragma-dialectics structure types; Pollock's attack typology; AIF.*

Build the graph. For each conclusion, group its supporting premises into inference steps and decide:
- **Linked** (premises only work together: if one is false the step collapses) vs **convergent** (independent reasons, each stands alone). Test the model must apply: "If this premise were false, would the remaining premises still support the conclusion?"
- **Serial** chains through intermediate conclusions.
- **Attacks**, typed: *rebut* (denies the claim), *undercut* (denies that the premises support the claim, without denying either), *undermine* (denies a premise). Objections the author raises against themselves are attacks with `assertedBy: "reported"`, and their rebuttals are attacks on those.

Then run structural checks in code before moving on: dangling references; nodes unreachable from any standpoint (orphans, returned to the model with "attach or mark as background"); cycles in the support graph (returned as "is this circular reasoning, or a structure error?").

### S5 + S6 · Scheme classification and implicit-premise reconstruction
*Basis: Aristotle's Topics and enthymeme; Walton's schemes; Toulmin's warrant.*

One call per inference step (batched), two outputs. They're combined because each scheme is a template with slots, and **the unfilled slots are precisely the implicit premises**. Classifying the scheme first tells you the shape of what's missing.

- Assign a scheme from a fixed list of ~20 that cover most real text: deductive forms (modus ponens, modus tollens, categorical syllogism, disjunctive syllogism), argument from expert opinion, from popular opinion, from example / inductive generalization, statistical syllogism, from analogy, from precedent, from sign, from cause to effect, from correlation to cause, from consequences (practical reasoning), from values, from definition / classification, slippery slope, from ignorance, inference to the best explanation, argument from commitment.
- Fill the scheme's slots from the text. Slots with no textual support become nodes with `explicit: false`, phrased in the **most plausible form the author would accept** (charity), with `authorWouldAccept` rated. Never the weakest form. Never a strawman.
- Attach the scheme's **critical questions** and record which ones the text answers, with anchors. This is the raw material for S7 and for the Challenge op, and it is why Logica's challenges will be specific rather than generic.
- Also reconstruct **implicit conclusions**: the point the author leaves the reader to draw.

Enthymeme reconstruction is the stage that makes evaluation possible at all. You cannot judge whether "students on phones get lower grades, so ban phones" is valid until "correlation here reflects causation" and "sufficient harm justifies a ban" are on the table.

### S7 · Evaluation
Now, and only now, the prompts switch from "reconstruct" to "evaluate". Each sub-check is its own small call or a piece of code.

**S7a · Inference validity and strength** *(Aristotle, Stoics, Walton).* For deductive schemes, check the form: is this modus ponens or affirming the consequent? Is the syllogism in a valid mood? For defeasible schemes, rate strength from the critical-question record: how many are answered, how well, and does any unanswered one look fatal? Output `strong | moderate | weak | invalid` with a one-sentence reason anchored to the text.

**S7b · Premise types and acceptability** *(Posterior Analytics, Descartes).* For each leaf node: `premiseType` (empirical, definitional, normative, principle, testimonial, assumption) and `acceptability` (supported in text, unsupported, contested, common ground). This *is* the foundations view. An argument that rests on two checkable facts and one shared principle is in different shape from one resting on an unsupported empirical claim and an unexamined value judgement, even if both are valid.

**S7c · Term consistency** *(Sophistical Refutations: equivocation).* For each key term from S1, list the sense used in each node where it appears. Flag shifts, with both anchors. Equivocation is the most common serious flaw in persuasive writing and the one readers miss most reliably.

**S7d · Internal consistency (elenchus)** *(Socrates).* Collect everything the author has committed to: asserted premises, conclusions, concessions, and implicit premises rated "yes". Check for pairwise and joint tensions. A contradiction between the author's own commitments is the Socratic refutation and it is far more powerful than any external objection, because it needs no outside premise.

**S7e · Fallacies, derived** *(Aristotle; pragma-dialectical rules).* Fallacy flags are **only** generated from an upstream finding: a formal invalidity (S7a), a fatal unanswered critical question (S5/S7a), an equivocation (S7c), a contradiction (S7d), or a discussion-rule violation (shifting the burden of proof, strawmanning a reported view, dismissing a person instead of an argument). The model names the fallacy in both traditional and plain language, cites the anchor, explains why the *inference* fails, and gives a confidence. Free-form "this looks like ad hominem" is forbidden. Precision matters far more than recall; a false fallacy flag costs more trust than a missed one.

**S7f · Structural status (algorithmic).** No model call. Compute:
- Acceptability per node under Dung's grounded semantics given the attack graph and inference strengths (a claim whose only support is undercut by an undefeated objection is *out*).
- **Load**: for each premise, whether removing it disconnects the standpoint from all support (min-cut), and how many conclusions depend on it.
- **Crux**: nodes with high load and low acceptability or a weak inference. This is where a debater attacks and a writer shores up.
- Depth of justification per node; orphans; cycles.
Re-run after every edit; it's instant.

**S7g · Falsifiability and consequences** *(Popper; reductio).* For the standpoint and each crux node: what observation or case would refute it? What follows if it's true that the author might not accept? This produces the best Socratic material and often the sharpest counter-argument.

**S7h · Dialectical completeness** *(Mill; disputatio).* What are the strongest known objections to this standpoint, and which ones does the text address? Steelman the other side first (Rapoport's rules: restate it so its proponents would sign off), then mark each objection as answered / partly answered / ignored. For well-known debates, an optional web search grounds this in real opposing literature.

### S8 · Synthesis
Assemble the map, the foundations panel, the crux, and a ranked issue list (rank ≈ load × weakness). The overall assessment is phrased as the three to five questions the argument most needs to answer, with confidence, and lists anything left `unresolved`. Show the strongest reading of the argument *before* the issues; that ordering is charity made visible.

### S9 · Faithfulness verification
An independent judge call with the source and the map:
- Every explicit node's quote exists in the source (code, exact match; fuzzy match within a threshold only inside flagged ASR spans).
- Each canonical form is a faithful paraphrase of its quote, with qualifier and scope intact.
- Nothing `assertedBy: "author"` is actually a reported view.
- Each implicit node is plausibly something the author would accept.
Failures are fixed by targeted re-extraction of the affected span, or flagged on the node. This pass is the single biggest lever on trust and costs a fraction of the pipeline.

## 6. Interactive ops (S10)

Every op is the same shape: cached prefix (taxonomy → source → brief → graph) + one instruction → a structured **delta** (nodes and edges added, changed, removed) → S7f recompute → new version. Ops are reversible because versions are immutable.

| Op | Tradition | Behaviour |
|---|---|---|
| **Why?** | Socratic regress; Posterior Analytics | Add the premise the author would need one level down, marked implicit. Stop rule: halt at empirical-checkable, definitional, explicit value judgement, or widely shared principle; default depth 3; label the bottom "bedrock *for this argument*", never absolute (Agrippa's trilemma is real; don't pretend otherwise). |
| **Challenge** | Walton critical questions; Pollock | Pick the unanswered critical question with the most bite; present it as rebut, undercut, or undermine so the user sees where it lands. |
| **Strengthen** | Toulmin backing; charity | What backing, evidence or qualifier change would make this premise or inference hold? Suggest the strongest honest version. |
| **Counter** | Disputatio; Rapoport's rules | Strongest objection, steelmanned; the author's most likely reply; then a *distinction* that might dissolve the dispute. Three moves, in that order. |
| **Socratic dialogue** | Elenchus, maieutics; Paul–Elder question types | One question at a time, never a lecture. Rotate through clarification, assumption, evidence, perspective, implication. Keep a commitment store of the user's answers; when two commitments conflict, surface it as a question. End with what changed in the map, or with honest aporia. |
| **Rebuild from foundations** | Descartes | Keep only bedrock-typed premises, drop analogy and authority moves, produce the shortest valid chain to the standpoint. Show what had to be assumed to get there. |
| **Mode label** | Aristotle's topoi | Classify how the whole argument mostly reasons: from principles, from evidence, by analogy, by authority, by precedent, by consequences. One line, for teaching. |

## 7. Dialogue, debate and video

*Basis: Hamblin's commitment stores; Inference Anchoring Theory (Reed & Budzynska); pragma-dialectics.*

- Run S1–S6 **per speaker**: each has their own standpoints and their own graph. Then a cross-speaker pass maps attacks between graphs.
- Track each speaker's **commitment store**: assertions, concessions, retractions. Concessions are gold: they are premises the other side can now use for free.
- Record **dialogue moves**, not just propositions: asserting, questioning, challenging, conceding, evading. "Challenge issued at 41:20, never answered" is a debate feature nobody else has.
- Run S7d per speaker (self-contradiction across a two-hour debate is common and devastating) and S7h across speakers (which of A's objections did B actually address?).
- Video nodes anchor to timestamps; the map becomes a navigable index of the debate.

## 8. Long documents

A 1M-token context fits any brief or book chapter, but attention dilutes and the map becomes unreadable. So:
- S1 runs over the whole document and produces the global brief.
- S2–S6 run **per section** with the brief as shared context, producing section sub-maps under their intermediate conclusions.
- A **merge pass** links cross-section relations (a premise in §2 supporting a conclusion in §5) and reconciles duplicate propositions.
- The UI shows the standpoint and intermediate conclusions collapsed; users expand a branch to see its sub-map. S7f runs over the full merged graph.

## 9. Model and prompt configuration

| Stage | Prompt mode | Effort (start) | Notes |
|---|---|---|---|
| S1 triage | reconstruct | medium | Whole-document; streaming |
| S2 segmentation | reconstruct | high | Anchors are load-bearing for everything after |
| S3 classification | reconstruct | medium | Batched over propositions |
| S4 structure | reconstruct | high | Linked/convergent test spelled out in the prompt |
| S5+S6 schemes & enthymemes | reconstruct, charitable | high | Batched per inference; scheme list + CQs live in the cached system prefix |
| S7a–e, g, h evaluation | evaluate | high | Separate system prompt from reconstruction stages |
| S7f status | none | — | Code |
| S9 verification | judge | high | Independent call; do not share the extractor's reasoning |
| S10 ops | per op | medium | Measure whether `low` holds for Why? and Challenge |

- **Model:** `claude-opus-5`, adaptive thinking (on by default), structured outputs on every stage so the graph is always schema-valid. Streaming for S1, S2 and anything over a few thousand output tokens.
- **Cache order:** taxonomy and scheme definitions (frozen) → source text → reading brief → current graph → the stage or op instruction. Nothing volatile before the last breakpoint.
- **Two system prompts, not one.** A *reconstruction* prompt whose job is fidelity and charity and which is told it must not evaluate, and an *evaluation* prompt that receives the finished graph. The verifier gets a third, minimal prompt.
- **Definitions in the prompt, not in the model's memory.** The scheme list with critical questions, the attack typology, the component taxonomy and the linked/convergent test are written out in the system prefix. It's stable, so it caches, and it stops the model from drifting between its own half-remembered versions of these concepts.
- **Few-shot with care.** Two or three short worked examples (a classic syllogism, a real op-ed enthymeme, a debate exchange) help the schema land. Keep them short and varied or the model will imitate their structure.
- **Self-consistency is optional.** Sampling S4 two or three times and reconciling improves structure but triples cost. The verifier (S9) is the cheaper, targeted alternative. Reserve sampling for the eval set and possibly a Pro "deep analysis" mode.

## 10. Evaluating the pipeline

Build the eval set before the analysis layer ships (EXECUTIVE_PLAN §9). Mix:
- **Textbook arguments with canonical reconstructions** (Chinese Room, trolley variants, Anselm, classic op-ed exercises from critical-thinking textbooks). Ground truth exists.
- **Real op-eds and student essays**, hand-annotated.
- **Debate transcripts**, a few with speaker-level annotation.
- **Existing corpora to bootstrap:** Stab & Gurevych's persuasive-essay corpus, AIFdb / AraucariaDB, IBM Debater datasets, the US2016 election-debate corpus annotated with IAT.

Score per stage, because failures compound: segmentation and anchor F1 (S2), component accuracy (S3), relation and linked/convergent F1 (S4), implicit-premise plausibility rated by a human (S6), inference-strength agreement (S7a), and **fallacy precision** above all (S7e). Track the S9 catch rate: how many verifier corrections per document. Regress every prompt change against the set.

## 11. Worked example

Input (op-ed paragraph):

> We should ban phones in schools. Studies show students who use phones in class get lower grades. Besides, every teacher I've spoken to wants them gone. Some argue phones are needed for emergencies, but schools have landlines.

| Stage | Result |
|---|---|
| S1 | Op-ed; fully argumentative; standpoint C: *schools should ban phones*. Key term **"ban phones"** is undefined: in class, or on the premises? |
| S2 | P1 *Students who use phones in class get lower grades* (qualifier: unqualified; evidence cited as "studies", no source). P2 *Every teacher the author has spoken to wants phones gone* (scope: the author's sample). O1 *Phones are needed for emergencies* (`assertedBy: reported`). R1 *Schools have landlines*. C as above (normative). |
| S3 | P1 evidence; P2 testimonial premise; O1 objection; R1 rebuttal; C main conclusion. |
| S4 | P1→C and P2→C are **convergent** (each offered as an independent reason). O1 **rebuts** C. R1 **undermines** O1 (denies that phones are *needed*, not that emergencies happen). |
| S5+S6 | P1→C: *argument from consequences* on top of *correlation-to-cause*. Implicit W1a *phone use causes the lower grades* (`authorWouldAccept: yes`), W1b *harm of this size justifies a ban* (`probably`). P2→C: *argument from popular/expert opinion*. Implicit W2 *teachers' preferences are a good guide to policy* (`probably`). Critical questions unanswered: is the correlation causal? are the studies about class use or any use? how many teachers, selected how? |
| S7a | P1→C **moderate-weak**: causation unestablished. P2→C **weak**: self-selected sample. R1→O1 **moderate**: only covers emergencies during school hours near a landline. |
| S7b | P1 empirical, unsupported. P2 testimonial, unsupported. W1b normative, unexamined. W1a assumption. Foundations: the argument rests on one uncited empirical claim, one anecdotal sample, and one unstated causal assumption. |
| S7c | "Ban phones" shifts between *use in class* (P1) and *possession at school* (O1/R1). Flag, low-moderate confidence. |
| S7d | No internal contradiction. |
| S7e | Hasty generalization on P2 (from S7a, confidence medium). Correlation-causation on P1 (from unanswered CQ, confidence medium). No ad hominem, no strawman. |
| S7f | C's status: *undecided*. Crux: **W1a**. Load: P1 carries most of the weight; P2 is supplementary. |
| S7g | Falsifier: schools that banned phones with no grade improvement (natural experiments exist). Consequence: by W1b, anything correlated with lower grades could be banned; the author may not accept that. |
| S7h | Unaddressed objections: phones as learning tools; enforcement cost; student autonomy; the emergency objection only partly answered. |
| S8 | Strongest reading: *phones in class hurt learning and the people in the room agree, so remove them.* Questions the argument most needs to answer: (1) does phone use cause lower grades or merely correlate? (2) does the evidence concern classroom use or all use, and what exactly would be banned? (3) is one anecdotal sample a basis for policy? |

## 12. Open questions

- **How much formalism in S7a?** Translating deductive steps into propositional form and checking them mechanically is possible, but real text rarely offers clean deductive steps. Start with model judgement on the small, explicit steps S6 produces; add a formal checker only if evals show formal errors slipping through.
- **Scheme list size.** Twenty schemes cover most text; Walton's full sixty add precision at the cost of classifier confusion. Grow the list from eval failures, not from the literature.
- **Charity vs fidelity in the UI.** Users must be able to see at a glance which nodes the author actually said and which Logica supplied. The visual distinction (solid vs dashed, say) is a product decision with epistemic weight.
- **Where confidence comes from.** Model-reported confidence is weakly calibrated. Prefer derived signals where possible: number of unanswered critical questions, verifier agreement, quote match quality.
