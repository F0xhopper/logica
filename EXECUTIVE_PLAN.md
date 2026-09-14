# Logica — Executive Plan

*Draft v1 · September 2026 · Technical companion: [PLAN.md](PLAN.md)*

---

## 1. Vision

**Make reasoning visible.** Logica turns any argument, whether an essay, article, paper, legal brief, lecture or debate video, into a living map of claims, premises, assumptions, evidence and objections, then lets you probe it: what does this rest on, where are the gaps, what would break it.

One line: *paste it, link it, or name it, and see how the reasoning actually works.*

## 2. The problem

People consume arguments constantly and evaluate them badly. Long-form writing hides structure. Video and debate hide it worse. The standard tools don't help:

- **Reading** gives you the prose, not the structure. Most readers can't say what an argument's conclusion rests on after finishing it.
- **AI chat** (ChatGPT, Claude, NotebookLM) gives you a summary in more prose. It answers "what does this say?" but not "how does this hold together?", and nothing persists or can be explored.
- **Argument-mapping tools** (Kialo, Argdown, Rationale, MindMup) are proven to teach critical thinking, but every map is drawn by hand. Almost nobody does that outside a classroom.

The result: students can't dissect a text, debaters can't find the load-bearing premise, analysts re-read a brief three times, and everyone argues past each other online.

## 3. The product

**Input anything.** Pasted text, a URL, a PDF, a YouTube video or podcast, or just the name of a famous argument ("Searle's Chinese Room").

**Get a map.** Claims, premises, assumptions, evidence, objections and conclusions as nodes; support and attack as edges. Every node is anchored to a verbatim quote, a page, or a timestamp, so you can always jump back to the source.

**Probe it.** Click any claim to see what supports it. Ask *why?* to dig down one level. Challenge or strengthen a premise. Request the best counter-argument. Run Socratic questioning on an assumption.

**See what it rests on.** A foundations view classifies the bedrock of the argument: checkable facts, definitions, shared principles, value judgments, and assumptions nobody argued for. Logica also flags gaps, missing premises, contradictions and common fallacies, always as questions with confidence, never as verdicts.

**Keep and share it.** Maps are versioned, shareable by link, and exportable to Argdown, PNG and PDF.

## 4. Who it's for

**Wedge (first 12 months): critical-thinking education.**
Philosophy and rhetoric instructors, their students, and competitive debate coaches. The value is obvious to them, the vocabulary (Toulmin, premises, fallacies) is already theirs, and there's published research showing argument mapping improves critical-thinking outcomes. They are reachable through a small number of communities and conferences.

**Expansion (year 2): analysts and writers.**
Legal and policy analysts dissecting briefs and reports; editors and serious writers checking their own drafts; researchers reading papers. Higher willingness to pay, harder to reach.

**Long term: anyone consuming a debate.** "Map this video" on a political debate or a long podcast is a consumer feature with viral potential, but it needs the accuracy and scale work of the first two phases behind it.

## 5. Why now

- **Argument mining was a research problem until LLMs.** Extracting claims and relations from free text is now reliable enough to ship, which is why no incumbent has "paste to map".
- **Long context and cheap calls.** A two-hour debate transcript fits in one model call. A full analysis of an essay costs cents.
- **AI-literacy backlash in education.** Instructors want tools that make students think harder, not less. A tool that exposes reasoning is on the right side of that.

## 6. What makes it different

| | Logica | AI chat | Kialo / Argdown / Rationale |
|---|---|---|---|
| Automatic extraction from text, PDF, video | **Yes** | No structured output | No, manual |
| Persistent, interactive map | **Yes** | No | Yes |
| Source-anchored (quote / page / timestamp) | **Yes** | Partial | Manual |
| Foundations & gap analysis | **Yes** | In prose only | No |
| Socratic probing | **Yes** | Ad hoc | No |

**Defensibility.** The model is not the moat; anyone can call Claude. The moat is (1) an evaluated, consistent extraction schema that users trust, (2) the map UX itself, which is genuinely hard to get right, and (3) a growing public library of mapped arguments and debates that becomes both content and a distribution channel.

## 7. Business model

| Tier | Price | Includes |
|---|---|---|
| Free | $0 | 3 maps / month, text and URL input, basic map, sharing |
| Pro | ~$15 / month | Unlimited maps, PDF and video input, foundations and gap analysis, export, version history |
| Education | Per-seat, annual, discounted | Pro for a class or department, instructor dashboard, assignment sharing |
| Team / API | Later | Shared workspaces, API access for legal and research tools |

**Unit economics.** A full analysis costs roughly $0.05–0.15 in model spend; interactive ops cost cents thanks to prompt caching. A Pro user making 30 maps a month costs about $3–5 to serve. Video transcription adds ~$0.20–0.50 per hour of audio. Gross margins are comfortable as long as heavy video users are metered.

## 8. Go-to-market

1. **Prove it on public arguments first.** Publish maps of famous essays and debates (Chinese Room, the Trolley Problem, well-known op-eds, presidential debates). Each one is shareable content, an SEO page, and a demo. This is the marketing engine and it starts before launch.
2. **Instructor-led adoption.** Recruit 10–20 philosophy and rhetoric instructors as design partners for the spring 2027 term. Free Education tier in exchange for feedback and case studies. Present at teaching-of-philosophy and debate-coach communities.
3. **Debate communities.** Coaches and competitive debaters are the most intense early users and the loudest advocates.
4. **Launch.** Product Hunt and Hacker News once the analysis layer is trustworthy, not before. A bad first map costs more than a late launch.
5. **Integrations later.** Export to Notion and Obsidian; a browser extension for "map this page"; a YouTube "map this video" share link.

## 9. Roadmap

| When | Milestone | Proves |
|---|---|---|
| **Oct–Nov 2026** | MVP: paste text → static map. Test on 20+ real essays. | The core idea works and maps are usable |
| **Dec 2026–Jan 2027** | Interactivity (inspect, challenge, counter, Socratic), versioning, URL and PDF input | People engage beyond the first render |
| **Feb–Mar 2027** | Analysis layer: gaps, contradictions, fallacies, foundations. Eval set of 30–50 annotated texts. Design-partner classes live. | Users trust the analysis |
| **Apr–May 2027** | Public launch. Sharing, export, collapsible maps for long documents. Pro tier on. | People pay |
| **H2 2027** | Video and audio with timestamp and speaker anchors; debate mode; "name an argument" lookup; Education tier and instructor dashboard | Expansion and second revenue line |

## 10. Success metrics

- **Activation:** % of new users who create a map in the first session. Target 60%+.
- **North star:** maps with at least one interaction after the initial render. If people don't probe, it's a summarizer, not a reasoning tool.
- **Trust:** extraction eval score against the annotated set, and % of nodes whose quotes verify against the source. Track weekly.
- **Retention:** % of users who make a second map within 30 days.
- **Economics:** model cost per map and per active user; free-to-Pro conversion.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Inconsistent or wrong maps erode trust** | Strict schema, verbatim quotes verified server-side, eval set from month one, analysis presented as questions with confidence |
| **Big AI vendors add "argument map" to chat** | Own the map UX, the education channel, and the public library. Ship fast and stay opinionated about reasoning quality |
| **YouTube blocks caption or audio access** | Captions first, "upload your own transcript", or a third-party transcript provider carrying the risk |
| **Long documents produce unusable maps** | Hierarchical, collapsible sub-arguments before video launches |
| **Cost blowout from heavy users** | Metered video, prompt caching, effort tuning per operation |
| **Name conflict** | "Logica" is the former name of a large IT firm and a Google logic language. Trademark search before launch; keep an alternative ready |

## 12. Team and resources

- **Now:** one founder-engineer can build the MVP through the analysis layer. The stack (TypeScript, React, Postgres, Claude) is chosen to keep that true.
- **By launch:** part-time product designer for the map UX, and a philosophy or rhetoric educator as an advisor for the schema, evals and instructor outreach.
- **Costs to launch:** model spend and hosting stay in the low hundreds of dollars a month until there is real traffic. The main cost is time.

## 13. Decisions needed now

1. **Confirm the wedge.** Education first, analysts second. Everything in tone, depth and pricing follows from this.
2. **How strong the analysis language is.** "Consider whether…" versus "This is invalid." Start soft, tighten as evals improve.
3. **Name.** Run the trademark check this month.
4. **Design partners.** Identify the first five instructors to approach for the spring 2027 term.
