# Platform landscape and research notes

**Reviewed:** 2026-10-02.
**Purpose:** source-backed options for Tomeowl's portability, memory, retrieval, graph, ingestion, and presentation direction.
**Decision state:** recommendations for review; no new runtime or backend is approved by this report.

## Executive recommendation

Treat Tomeowl as a local evidence/catalog core with replaceable ingestion, retrieval, enrichment, harness, and presentation adapters.

Keep SQLite plus FTS5 and the current CLI as the portable base, use existing QMD and Graphify behind explicit adapters, and postpone a native graph database until a benchmark demonstrates a concrete gap in multi-hop traversal or graph analysis.

Represent asserted knowledge, source evidence, session events, inferred candidates, workflow edges, and saved visual layout as distinct versioned data; let multiple UI or report surfaces render the same source-backed snapshot.

Use local models only as optional and reviewable enrichment tools; test a narrow classifier before open-ended extraction, preserve abstention and provenance, and audit model terms separately from code licenses.

For presentation, separate a customizable command-center shell from the underlying graph: use interactive graph visualization for maps, a dedicated workflow canvas for flows, Vega-Lite for portable analytics, and a Power BI adapter only where a real dashboard requirement exists.

The recommendation is conservative because the strongest constraints are portability, evidence quality, and avoiding duplicate runtimes, not a lack of available graph or memory frameworks.

## Research method and evidence limits

This report combines current primary project documentation and release pages checked on the date above with prior local research notes and the supplied timestamped RoboNuggets transcript.

The local [second-brain research report](../../reference/prototype-v0/RESEARCH-SECOND-BRAIN-RECENT.md) records a pinned `last30days-skill` deep run covering 70 recent Reddit, Hacker News, and GitHub items dated 2026-09-02 through 2026-10-02; its recent discussion is useful for friction signals but is anecdotal and sparse for architecture decisions.

The skill's broad-source method is useful for discovery and short-term community signals; primary specifications, release notes, package manifests, and license files were used for technical and licensing facts.

Social popularity and GitHub stars indicate attention, not product quality, security, suitability, or support guarantees; snapshot counts in earlier notes are labeled as such.

The video analysis is based on the local auto-generated transcript, not a verified backend repository; creator-reported file counts and token reductions are not independent benchmarks.

This report is not a legal opinion; licenses can change and corporate distribution needs a pinned-version component audit.

## Architectural fit by capability

| Candidate | Useful role | Fit and caution | Recommendation |
|---|---|---|---|
| SQLite + FTS5 | Local catalog, exact text retrieval, metadata and provenance | Small, embedded, familiar, and fits a self-contained CLI; graph queries remain possible for bounded traversals, though not a specialized graph engine | Keep as the default core; probe FTS5 in each compiled target and benchmark actual queries |
| QMD | Hybrid local text/vector retrieval and reranking | Strong existing candidate for paraphrase search and short evidence packets; brings its own model and runtime/storage needs, and is not the canonical catalog | Keep optional; call its supported CLI/library/MCP interface and do not share private tables |
| Graphify | Code/document graph extraction and graph exports | Useful existing structural extractor; broader semantic paths can invoke models, package/runtime extras matter, and outputs require source/path revision validation | Keep optional and explicit; preserve edge type and provenance, use code-only mode for deterministic structure |
| LadybugDB | Embedded property-graph/Cypher engine | A small-ish graph-native candidate with MIT source license and recent release activity; still introduces an additional native runtime/data format and migration surface | Benchmark later against named SQLite traversals; do not add just for the visual graph |
| Graphiti / Mem0 / Letta | Memory lifecycle, entity/temporal modeling, or stateful-agent patterns | Useful references for retention, retrieval, time, scopes, and correction; full products add services, databases, models, or agent runtime beyond Tomeowl's portability target | Borrow design patterns; do not embed the full framework without a concrete requirement |
| Microsoft GraphRAG | Community detection and corpus-level graph-RAG algorithms | Useful research and algorithm reference; Python/model-driven indexing and upstream compatibility expectations conflict with minimal offline deployment | Algorithm reference or experimental adapter, not core runtime |
| Dify | Full workflow, RAG, and AI application platform | Useful interaction and workflow reference; it is a broad deployable application and its custom open-source license has additional conditions beyond Apache-2.0 | Study interaction patterns; do not treat it as a small embedded dependency |

SQLite FTS5 offers BM25-ranked full-text search through SQLite's virtual-table module ([SQLite FTS5](https://www.sqlite.org/fts5.html)).

QMD describes a local hybrid pipeline combining keyword search, vectors, fusion, and reranking; its own runtime and model footprint mean it should remain independently selectable ([QMD](https://github.com/tobi/qmd)).

Graphify describes tree-sitter-based code extraction and broader document/media processing with exportable graph artifacts; inspect the pinned package manifest because repository and package/component licensing can differ ([Graphify repository](https://github.com/Graphify-Labs/graphify), [`graphifyy` package manifest](https://github.com/Graphify-Labs/graphify/blob/main/pyproject.toml)).

LadybugDB's upstream release page listed v0.21.2 on 2026-10-01, making it a current candidate to benchmark rather than a mandatory architecture choice ([LadybugDB releases](https://github.com/LadybugDB/ladybug/releases)).

Graphiti, Mem0, and Letta expose different memory products rather than a common universal memory standard; their docs and deployment models should be compared only against a specified lifecycle requirement ([Graphiti](https://github.com/getzep/graphiti), [Mem0](https://github.com/mem0ai/mem0), [Letta memory docs](https://github.com/letta-ai/letta-docs-md/blob/main/configuration/memory/index.md)).

Microsoft GraphRAG is valuable as an indexing and graph-retrieval reference, but its model/API and Python requirements make it an optional experiment for Tomeowl ([GraphRAG](https://github.com/microsoft/graphrag), [indexing overview](https://github.com/microsoft/graphrag/blob/main/docs/index/overview.md)).

Dify demonstrates an integrated workflow/RAG application, but its project uses a custom license based on Apache-2.0 with additional conditions; it is a UI and workflow reference rather than a portability shortcut ([Dify repository and license](https://github.com/langgenius/dify)).

## License and distribution screen

| Component | Upstream code-license signal | Separate review required |
|---|---|---|
| SQLite | Public domain | Build configuration, any bundled extensions, and FTS5 availability |
| QMD | MIT | Pinned transitive packages, model files/runtime, and its independently stored index |
| Graphify / `graphifyy` | Upstream repository includes MIT and Apache license files, while its Python package manifest declares MIT | Confirm the exact pinned distribution, bundled grammars, transitive Python packages, and model/provider path |
| Tree-sitter | MIT core | Each language grammar and generated parser is its own component to inventory |
| Docling / MarkItDown | MIT project code | Optional parser dependencies, model/weights, OCR engines, and format-specific codecs |
| OpenJev / Gemma | OpenJev code is MIT; its Gemma 3 4B checkpoint has separate Gemma terms, while Gemma 4 is Apache-2.0 | Review the exact model generation/checkpoint, runtime binaries, redistribution obligations, and organization policy |
| Cytoscape.js / React Flow / Vega-Lite | MIT for Cytoscape.js and React Flow; BSD-3-Clause for Vega-Lite | Bundled dependencies and vendored/inlined third-party source notices |
| Dify | Custom Dify Open Source License based on Apache-2.0 with additional conditions | Legal review before bundling, modifying, or redistributing components |

These are initial upstream signals, not a legal compatibility determination; review the exact version archives and all transitive components before a release ([SQLite copyright](https://sqlite.org/copyright.html), [QMD license](https://github.com/tobi/qmd/blob/main/LICENSE), [Graphify package manifest](https://github.com/Graphify-Labs/graphify/blob/main/pyproject.toml), [Tree-sitter license](https://github.com/tree-sitter/tree-sitter/blob/master/LICENSE), [Docling license](https://github.com/docling-project/docling/blob/main/LICENSE), [MarkItDown license](https://github.com/microsoft/markitdown/blob/main/LICENSE), [OpenJev license](https://github.com/daseinlabs/open-jev/blob/main/LICENSE), [Gemma terms](https://ai.google.dev/gemma/terms), [Cytoscape.js license](https://github.com/cytoscape/cytoscape.js/blob/unstable/LICENSE), [React Flow license](https://github.com/xyflow/xyflow/blob/main/LICENSE), [Vega-Lite license](https://github.com/vega/vega-lite/blob/main/LICENSE), [Dify license](https://github.com/langgenius/dify/blob/main/LICENSE)).

## Retrieval, memory, and graph are separate products

RAG returns source passages for a question; agent memory retains a smaller set of reusable, scoped facts or procedures; a knowledge base organizes evidence and relationships; a mapper visualizes structural or asserted links; a workflow canvas represents process and run state.

Combining them into one graph may be convenient to display, but does not make their lifecycle or trust semantics equivalent.

The local recent research finds a useful repeated pattern in second-brain discussions: preserve low-friction source captures, retrieve reference material on demand, and promote only selected reusable knowledge; treat social posts as user-experience evidence rather than measured effectiveness ([recent second-brain findings](../../reference/prototype-v0/RESEARCH-SECOND-BRAIN-RECENT.md)).

The prior harness-memory survey distinguishes orchestration products such as Orca from actual memory engines and notes that ORG2 session replay, Buzz engrams, and agent-memory APIs solve related but non-identical problems ([memory research](../../reference/prototype-v0/RESEARCH-MEMORY.md)).

For Tomeowl, keep immutable or revisioned session/source records separate from accepted memories, and make memory scopes and forget/correct behavior explicit.

The strongest recent first-party design reference in the checked period is Meta's September 2, 2026 account of an organizational second brain: it separates compact curated knowledge used frequently from broader reference material retrieved on demand, and describes a correction loop that replays targeted evaluations after edits ([Meta Engineering](https://engineering.fb.com/2026/09/02/ml-applications/organizational-second-brain-ai-learns-from-experts/)).

Treat Meta's reported context reduction as a company-reported result for its own system, not as a portable Tomeowl target; the useful design evidence is the separation of knowledge tiers and its regression process.

ORG2's project description emphasizes agent sessions, replay, backfill, and session-to-code traceability, while its public overview does not establish the internals of its memory store; borrow the session provenance concept without assuming its memory implementation is a reusable backend ([ORG2](https://github.com/org2AI/ORG2)).

Block's Buzz NIP-AE proposal uses scoped encrypted agent engrams for durable state, but explicitly leaves provenance, trust levels, and taxonomies out of scope; Tomeowl must supply those evidence rules independently ([Buzz NIP-AE](https://github.com/block/buzz/blob/main/docs/nips/NIP-AE.md)).

Paperclip's memory service document is a design proposal rather than proof of a shipped universal engine; its provider/scope separation and operation attribution are useful adapter-contract ideas ([Paperclip memory service plan](https://github.com/paperclipai/paperclip/blob/master/doc/plans/2026-03-17-memory-service-surface-api.md)).

## Ingestion and model options

| Tool or method | Strong use | Portability and license notes | Candidate path |
|---|---|---|---|
| Tree-sitter | Code syntax trees and symbol-level structure | MIT core; each grammar is a separately reviewed component; syntax does not imply type or domain semantics | Small parser adapter for selected languages, with explicit grammar inventory |
| Docling | Structure-rich documents, hierarchical/token chunking, tables | MIT project code, but model/assets and optional format paths have their own terms and runtime dependencies; Python stack is not one-file baseline | Optional parser worker tested on real, approved documents |
| MarkItDown | Conversion of common document formats to Markdown | MIT project; Python and format-specific optional extras; conversion output can lose layout details relevant to engineering manuals | Lightweight conversion fallback for supported families |
| OpenJev | Fixed-option local scoring with Gemma 3 4B | Windows/Linux PyTorch scoring is documented; the featured 4B setup is substantial, and feature/head training remains tied to MLX | Compare rules and compact classifiers before a bounded fixed-label experiment |
| Gemma | Local model family for bounded extraction/classification | Gemma 3 and EmbeddingGemma have Gemma terms; Gemma 4 is Apache-2.0; actual artifact/runtime requirements still vary | Optional exact-checkpoint experiment after model/runtime review |
| GLiNER | Prompted named-entity extraction against a provided ontology | Framework and checkpoint terms must both be checked; entity extraction does not resolve all relations or coreference | Evaluate only for fixed domain entities with cited spans |

Docling documents a hybrid chunker that respects document structure and token budgets and can repeat table headers in chunks ([chunking documentation](https://docling-project.github.io/docling/concepts/chunking/)); its release stream is active, including v2.132.0 on 2026-10-01 ([releases](https://github.com/docling-project/docling/releases)).

MarkItDown is an MIT conversion project with format-specific optional dependencies, so it is a viable utility but not a no-dependency ingestion guarantee ([MarkItDown](https://github.com/microsoft/markitdown)).

Tree-sitter is an MIT parsing library, while language grammars are separate dependencies and licenses ([Tree-sitter](https://github.com/tree-sitter/tree-sitter)).

OpenJev's repository documents Gemma-based local classification and currently warns that its zero-shot probabilities are not calibrated judgments; use a held-out, domain-specific evaluation before relying on a predicted class ([OpenJev](https://github.com/daseinlabs/open-jev)).

Google publishes generation-specific model licenses and cards; the wrapper's license does not settle downloaded-weight obligations ([Gemma terms](https://ai.google.dev/gemma/terms), [Gemma 3 model card](https://ai.google.dev/gemma/docs/core/model_card_3), [Gemma 4 Apache-2.0 model card](https://ai.google.dev/gemma/docs/core/model_card_4)).

GLiNER is a possible entity-extraction reference, but the framework, selected checkpoint, and downstream task quality need separate checks ([GLiNER](https://github.com/urchade/GLiNER)).

For industrial manuals, code, schematics, mail, and spreadsheets, use format-specific locators and typed values; an extraction tool's generic file support does not demonstrate correct interpretation of a tester's format or a proprietary schematic.

## Presentation and interchange

| Option | Best fit | Tradeoff | Recommendation |
|---|---|---|---|
| Cytoscape.js | Interactive entity, code, or dependency graph | Focused graph visualization library with JSON elements and graph algorithms; UI shell and product-specific command center still need to be built | Strong candidate for the map layer after data contracts stabilize |
| React Flow | Editable process/workflow canvas | Rich workflow interaction and JSON state; requires React and represents a different abstraction than a knowledge graph | Use only for a dedicated workflow surface |
| Vega-Lite | Declarative analytical charts and exportable visual specs | Strong portable chart grammar but not a general dependency-map renderer | Use for metrics and reports that benefit from portable chart specifications |
| JSON-LD / GraphML | Data/graph interchange | Both preserve shareable structure better than viewer-specific state; export still needs a documented schema and provenance rules | Define a versioned canonical JSON shape first, then provide these exports as needed |
| Deneb / PBIP | Power BI dashboards and source-controlled report projects | Power BI is a separate host/runtime and PBIP is Power BI's project format, not a neutral Tomeowl backend | Build an optional adapter only for a confirmed BI use case |
| Anthropic modernization map | Clustered code dependency map reference | Source describes a specific code hierarchy, typed edges, and standalone HTML viewer; it is not a general memory system | Reuse its separation of hierarchy, dependencies, observations, and user flows as a design reference |

Cytoscape.js exposes JSON graph data, layout and interaction features, and a permissively licensed browser library; it can power a map without defining Tomeowl's canonical schema ([Cytoscape.js docs](https://js.cytoscape.org/index.html)).

React Flow serializes nodes, edges, and viewport state, which is a useful workflow-view contract but should remain separate from factual domain relations ([React Flow JSON object](https://reactflow.dev/api-reference/types/react-flow-json-object), [save and restore](https://reactflow.dev/examples/interaction/save-and-restore)).

Vega-Lite defines layered and multi-view declarative charts, and its JSON spec is suitable for diffable analytics exports ([Vega-Lite documentation](https://vega.github.io/vega-lite/docs/)).

The W3C JSON-LD 1.1 recommendation supplies a linked-data JSON format, and GraphML defines an XML graph-exchange format ([JSON-LD 1.1](https://www.w3.org/TR/json-ld11/), [GraphML specification](https://graphml.graphdrawing.org/specification.html)).

Deneb embeds Vega/Vega-Lite visuals in Power BI and is a separately versioned Power BI component; Microsoft's PBIP/PBIR documentation describes report project files, not a neutral graph interchange layer ([Deneb releases](https://github.com/deneb-viz/deneb/releases), [PBIP overview](https://learn.microsoft.com/en-in/power-bi/developer/projects/projects-overview), [PBIR report format](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report)).

Anthropic's code-modernization plugin is a useful example of a clustered interactive dependency map: its command emits topology JSON and a standalone HTML viewer, separating a code hierarchy from typed dependency edges and uncertain observations ([modernization map command](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/commands/modernize-map.md), [viewer source](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/assets/topology-viewer.html)).

The video screenshot's rings should be treated as one navigation visualization mode; user-customizable panels and accessible interaction states can surround it without forcing operational analytics or workflows into the same circle layout.

## Portability and license fit

“Free to use” and “runs locally” do not mean “approved for redistribution in a corporate environment.”

Review code license, model terms, transitive dependencies, parser grammars, bundled UI assets, fonts, optional format libraries, update behavior, and storage format for every pinned release.

QMD, Graphify, Docling, MarkItDown, Cytoscape.js, and the candidate visualization ecosystem are individually useful, but combining them blindly would recreate the stack sprawl the project intends to avoid.

Keep the release executable small and deterministic; package optional parsers and model runtimes separately, and make the offline core useful without them.

Bun's compiled executable bundles the Bun runtime for a chosen target; this helps a Windows user-space CLI but still requires separate builds and smoke tests for other operating systems and CPU targets ([Bun executable documentation](https://bun.sh/docs/bundler/executables)).

Tomeowl's existing architecture research details the SQLite, QMD, Graphify, and compiled-executable constraints and should remain the implementation baseline until revised by measured evidence ([current architecture research](architecture.md)).

## Research workflow for later implementation with Codex or Claude

1. Confirm a narrow user question and define the source types, data scope, offline boundary, expected output, and acceptance evidence.
2. Build a tiny representative, non-confidential fixture set and a fixed query/retrieval evaluation before choosing an engine or model.
3. Specify stable identifiers, provenance, locator, and adapter contracts before parallel code work; keep a decision log for choices that change storage or data semantics.
4. Implement one vertical slice through ingestion, search, citation, export, and UI drill-down; keep optional tools behind replaceable boundaries.
5. Delegate bounded research or implementation tasks with source links, output files, and acceptance checks; have one integrator review the contracts and run the end-to-end checks.
6. Review the UI with realistic fixtures and several screen sizes, then test accessibility, reduced motion, error/empty states, evidence navigation, and performance before adding effects.
7. Re-run a fixed query and package suite after changing a parser, ranker, model, or schema; compare quality, latency, disk, license inventory, and install steps.
8. Keep new frameworks and plugins optional until their operational and licensing cost is visible in an install, SBOM, and clean-machine test.

Use the current Codex research workflow or Claude's research/UI skills as methods, not as runtime dependencies; the video transcript does not show the creator using the specific `frontend-design`, `visualize`, `code-modernization`, or Impeccable skills.

The `last30days-skill` is valuable for discovering current practice and community sentiment, but its engine/source connectors have their own setup and data-source behavior; inspect its current contract before invoking it in a corporate environment ([repository](https://github.com/mvanhorn/last30days-skill)).

## Future research backlog

| Priority | Question | Evidence needed |
|---|---|---|
| P1 | What coding-agent session archives are present locally, and which fields are stable across harness versions? | Read-only schema inventory and safe sample fixtures for Codex, Claude Code, Gemini CLI, Goose, and other installed agents |
| P1 | Is a single global index or project-local indexes safer and more useful for Farseer and `D:\Dev`? | Scope/access tests, database contention/backup behavior, project-bound query examples |
| P1 | Which graph traversal actually exceeds SQLite? | Fixed representative graph, query plans, p50/p95 latency, memory, import/export and rebuild comparison with LadybugDB |
| P1 | Which interactive map layouts match which questions? | User task testing for rings, clustered pack, force, dependency, timeline, and workflow canvas on realistic data sizes |
| P1 | Which sources and licenses may be included in a company distribution? | Pinned transitive SBOM, model terms, grammar and asset notices, offline update policy, counsel/security review |
| P2 | Can OpenJev or another small local classifier improve triage without harmful false confidence? | Held-out labels, confusion matrix, calibration, abstention, CPU/GPU, installation and weight redistribution review |
| P2 | Which document parser best preserves manual structure and table anchors? | Representative PDFs/Office files, table-cell/page citations, malformed-file behavior, extraction diffs, runtime and disk costs |
| P2 | Can code/agent telemetry use a shared event contract? | OpenTelemetry GenAI conventions maturity review and comparison with actual local archive formats |
| P2 | What export satisfies future Power BI use without coupling the core to Power BI? | Versioned graph JSON, Vega-Lite dashboard sample, Deneb proof, PBIP deployment/package test |
| P3 | Which UI personalization and ambient effects improve routine use? | Prototype task tests, motion/contrast/accessibility audit, user preference persistence and performance measurements |

The OpenTelemetry GenAI agent span conventions are marked Development, so treat them as an evolving integration reference rather than a stable promise that all harnesses will emit compatible records ([agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md), [GenAI spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md)).

## Source and local reference index

- [Tomeowl platform vision draft](../drafts/PLATFORM-VISION.md) is the proposed product and architecture outline for review.
- [Tomeowl current architecture](architecture.md), [implementation specification](../SPEC.md), and [release status](../STATUS.md) describe what exists today; this report does not imply that proposed capabilities have shipped.
- [Prototype-era source landscape](../../reference/prototype-v0/RESEARCH-BASELINE.md), [memory and harness survey](../../reference/prototype-v0/RESEARCH-MEMORY.md), [recent second-brain research](../../reference/prototype-v0/RESEARCH-SECOND-BRAIN-RECENT.md), and [creator transcript analysis](../../reference/prototype-v0/RESEARCH-CREATOR.md) preserve earlier evidence and detail.
- [QMD](https://github.com/tobi/qmd), [Graphify](https://github.com/Graphify-Labs/graphify), [GBrain](https://github.com/garrytan/gbrain), [LadybugDB](https://github.com/LadybugDB/ladybug), [Docling](https://github.com/docling-project/docling), and [MarkItDown](https://github.com/microsoft/markitdown) are upstream sources for their respective projects.
- [SQLite FTS5](https://www.sqlite.org/fts5.html), [Tree-sitter](https://github.com/tree-sitter/tree-sitter), [OpenJev](https://github.com/daseinlabs/open-jev), [Gemma terms](https://ai.google.dev/gemma/terms), and [GLiNER](https://github.com/urchade/GLiNER) are primary technical/terms references for search and extraction.
- [Cytoscape.js](https://js.cytoscape.org/index.html), [React Flow](https://reactflow.dev/), [Vega-Lite](https://vega.github.io/vega-lite/docs/), [JSON-LD](https://www.w3.org/TR/json-ld11/), and [GraphML](https://graphml.graphdrawing.org/specification.html) cover visualization and graph interchange.
- [Deneb](https://github.com/deneb-viz/deneb), [Microsoft PBIP/PBIR](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview), and [Anthropic's modernization map](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-modernization) are presentation/export references.
- [Bun executable docs](https://bun.sh/docs/bundler/executables), [GraphRAG](https://github.com/microsoft/graphrag), [Graphiti](https://github.com/getzep/graphiti), [Mem0](https://github.com/mem0ai/mem0), [Letta](https://github.com/letta-ai/letta), [Dify](https://github.com/langgenius/dify), and [`last30days-skill`](https://github.com/mvanhorn/last30days-skill) are optional product or workflow comparisons, not selected dependencies.

## Research maintenance note

Recheck release versions, license files, model terms, runtime requirements, and standards maturity before implementation or corporate packaging; online project pages change after this dated snapshot.

Add future findings to this report with a check date, the exact version or commit reviewed, direct source links, a short evidence boundary, and the decision that the evidence changes.

## Follow-up modernization research

The detailed [backend comparison](backend-options-2026-10-02.md) evaluates SQLite vector extensions, LadybugDB, Graphify, OpenJev, compact embedding/extraction models, Gemma 4, and lightweight ideas from LightRAG, LazyGraphRAG, HippoRAG 2, RAPTOR, and late chunking.
The [UI/interoperability report](ui-interoperability-2026-10-02.md) compares renderers/layouts, semantic grouping/heat encodings, saved views, neutral exports, Vega-Lite/Deneb, and PBIP/PBIR boundaries.
The [recent-practice note](recent-practice-2026-10-02.md) records the actual last30days engine run and its thin coverage rather than treating a search as comprehensive consensus.
The [modernization specification](../drafts/MODERNIZATION-SPEC.md) and [UX assessment](ux-assessment-2026-10-02.md) convert the follow-up brainstorm into actionable requirements and a UI-first delivery order.
