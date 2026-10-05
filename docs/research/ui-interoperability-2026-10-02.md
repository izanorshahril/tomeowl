# Knowledge-map UI and interoperability research

**Checked:** 2026-10-02  
**Scope:** graph exploration, similarity cues, renderer/layout options, Power BI exports, and agent-assisted modernization.  
**Decision status:** recommendations only.
No dependencies or runtime behavior were changed.
Recheck exact versions, transitive licenses, model terms, and Power BI tenant constraints before adoption.

## Recommendation

Treat the graph as a portable, evidence-bearing data product with several views.
Keep the current offline SVG viewer as the compact baseline while adding a semantic layer in stages: distinct visual encodings for meaningful node/edge attributes; evidence-backed, hierarchical group views; then optional embedding similarity as an explicitly exploratory overlay.
The best first renderer candidate to benchmark is Sigma.js with Graphology: Sigma targets graphs in the thousands using WebGL and uses Graphology as its graph model.
Keep SVG for the current 1,000-node bound until a real corpus benchmark demonstrates a need to migrate.
Cytoscape.js is a simpler MIT-licensed, dependency-free Canvas option with graph analysis, but its own docs warn that rendering cost grows with elements, rich styling, edges, and pixel ratio. [Sigma introduction](https://www.sigmajs.org/docs/), [Sigma renderers](https://www.sigmajs.org/docs/advanced/renderers/), [Graphology](https://github.com/graphology/graphology), [Cytoscape.js](https://js.cytoscape.org/index.html)

Keep SQLite and the versioned snapshot as the authority.
Do not add a graph database to improve the picture alone: graph layout, labels, grouping, and view state are presentation needs that can use exported graph records.
Consider an embedded graph engine only if benchmarked query requirements exceed current SQL traversals.
Keep model extraction optional, locally runnable, and reviewable for restricted corporate environments.

## Current product gaps and assets

The current implementation already has a three-region workspace, collection grouping in the source list, visibly distinct collection anchors, selectable sources and evidence inspection, Cluster/Rings layouts, search/filtering, zoom/pan/fit, an offline self-contained export, and reduced-motion/glow controls.
The design explicitly keeps collection membership separate from recorded source relationships.

The current map's Cluster/Rings positions are deterministic geometry based on collection and source order/hash, not semantic layout or computed communities.
Its SVG map colors distinguish document/transcript and relation provenance classes, while most sources share one base color.
There is no similarity score, embedding metadata, community/topic hierarchy, saved theme/view profile, or export adapter for BI.
Spatial rendering currently caps at 1,000 matching sources; larger graph rendering has not been measured.
The current state is consistent with the documented release scope, but does not yet meet the user's wish for stronger grouping and personalization.
These observations come from `src/viewer/geometry.ts`, `src/viewer/render.ts`, `src/viewer/viewer.css`, `src/viewer/state.ts`, `src/viewer/types.ts`, `src/viewer/export.ts`, `DESIGN.md`, and `docs/ARCHITECTURE.md`.

## UI and graph design

| Need | Recommended treatment | Why / boundary |
|---|---|---|
| Better hierarchy | Use nested levels: collection/source type at overview, semantic community at the next level, individual sources at detail. Provide expand/collapse and breadcrumbs; preserve selected IDs across levels. | A stable overview should reduce clutter without hiding the underlying source list or evidence. |
| Explainable color | Provide a user-selectable color mode such as source kind, verified relation type, community, or similarity score. Add text/icon/outline cues and an always-visible legend. | Do not rely on hue alone; retain contrast and readable labels on dark/light themes. |
| Community detection | Start with components and verified typed edges. If useful, benchmark Louvain/Leiden on evidence-backed relations, or Graphology's Louvain implementation. Label the grouping method, relation subset, resolution/parameters, and run date. | Algorithmic communities describe topology under a selected graph and objective. They are not ground-truth subject categories. Leiden was introduced to address poorly connected communities that Louvain may produce. [Graphology community algorithms](https://graphology.github.io/standard-library/), [Leiden paper](https://doi.org/10.1038/s41598-019-41695-z) |
| Embedding similarity | Add a separate “semantic neighborhood” mode/overlay. Show score, embedding model/version, compared text unit, and threshold; allow users to hide it, tune the threshold, and inspect both source excerpts. | Sentence embeddings can be compared with cosine similarity for semantic textual similarity tasks; a high score does not establish that two sources assert a relation, support each other, or refer to the same entity. Do not serialize similarity as a factual `references` or `mentions` edge. [Sentence-BERT paper](https://arxiv.org/abs/1908.10084) |
| Similarity heat map | Prefer score color on similarity connectors in a separate overlay or a pairwise matrix for a selected small subset. Use quantile/relative bands only with a legend stating scope/model. Expose score numerically in details. | The same color range across runs can mislead if score distributions differ; a dense all-pairs matrix is quadratic. Similarity is contextual to model, chunking, corpus, and threshold, not calibrated truth. |
| Stable layouts | Persist positions by stable node ID and keep the last layout as the starting point after additions. Offer “restore saved view” and explicit “recompute layout”; avoid re-running force layout on every interaction. Use deterministic seed and fixed anchors. | Reduces the cognitive cost of node movement and preserves a manager's saved presentation. Store view configuration independently from graph data. |
| Multiscale navigation | At overview zoom, draw collection/community hulls or aggregate nodes; at closer zoom, expand members. Use a threshold for labels, edge bundling/aggregation at coarse zoom, and focus-plus-context around selected evidence. | Rendering every label and edge at once is visually noisy even when a WebGL renderer can draw it. |
| Personalization | Save named view presets with theme, color mode, contrast, motion, glow, label density, layout/seed, filters, and selection. Provide calm/report mode and presentation mode. Keep animation optional, nonessential to meaning, and off under reduced-motion preference. | Preferences are UI state, not canonical knowledge. Offline export should include either the saved view or a user-chosen presentation profile. |
| Relationship semantics | Store relationship method, acceptance status, and revision validity as independent fields. Use method values such as structural, imported, and model; acceptance values candidate, accepted, and retracted; and derive revision validity as current, stale, or unverifiable against cited source revisions. | These fields answer different questions: how a link was produced, whether a human/workflow accepted it, and whether its evidence still matches current source content. Similarity can suggest a candidate, but cannot establish an asserted relation. |

A force-directed layout can be useful as a deliberate “explore” action, not as a live default.
Graphology documents fixed node positions and a force-layout supervisor that runs through requestAnimationFrame; for a workflow/dependency diagram, ELK Layered places nodes in directed layers and supports compound graphs, ports, and edge routing.
ELK computes coordinates, rather than rendering the UI, so it is an optional layout adapter rather than a renderer replacement. [Graphology force layout](https://graphology.github.io/standard-library/layout-force.html), [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html), [ELK overview](https://eclipse.dev/elk/)

## Renderer candidates

| Candidate | Fit | License / portability | Recommendation |
|---|---|---|---|
| Authored SVG (current) | Native DOM interactions, accessible hit targets, easy single-file embedding; current explicit cap is 1,000 map nodes. | No added graph library. | Keep for current release and small subsets; improve hierarchy/styling without paying a migration cost. |
| Sigma.js + Graphology | WebGL graph rendering; Sigma is built on Graphology. Suitable benchmark candidate for thousands of nodes/edges with interaction. Graphology supplies model and graph algorithms. | MIT upstream licenses; still audit pinned versions, transitive packages, bundle output, and license notices. | First scaling candidate. Bundle assets locally; test offline and on corporate graphics/browser configurations. |
| Cytoscape.js | Integrated graph model, visualization, and analysis; MIT core/first-party extensions; no external dependencies. | MIT. Canvas renderer; official performance guide calls out graph size, edge count, styles, and device pixel ratio. | Good lower-complexity alternative if measured load fits. |
| D3 | Low-level web-standard SVG/Canvas/HTML primitives, broad flexibility. | ISC. | Reference/toolkit when bespoke editorial visuals matter; not a drop-in graph-model or large-graph renderer. |
| deck.gl | High-performance data visualization using WebGL2/WebGPU with interactive layers/picking. It is designed for large datasets and is strongest for spatial/geospatial or layered data views. | MIT. | Consider for a spatial/overview/dashboard need; probably excessive for a local evidence graph. |
| ELK.js / Eclipse Layout Kernel | Layout algorithms only; directed layered and compound graph layouts useful for dependency and workflow diagrams. | Verify EPL licensing and JavaScript package/runtime size on exact selected distribution before bundling. | Optional second layout adapter, not core renderer. |
| Vega-Lite | Declarative grammar for common interactive analytical views and multiple composed views. | BSD-3-Clause in upstream project; audit included Vega components. | Best portable analytics/export layer, not the main graph-map renderer. |

License facts above are upstream source indicators, not a corporate legal determination.
Review pinned archives and all dependencies, static assets, font/icon sources, model weights/terms, and any bundled/vendored output before distribution.
Sigma v4 documentation currently describes v4 as alpha; evaluate stable v3 for a near-term benchmark unless v4 has reached a verified stable release. [Sigma v3 docs](https://www.sigmajs.org/docs/), [Sigma v4 notice](https://v4.sigmajs.org/concepts/rendering/), [Cytoscape.js factsheet/performance](https://js.cytoscape.org/index.html), [D3 repository](https://github.com/d3/d3), [deck.gl repository](https://github.com/visgl/deck.gl), [ELK](https://eclipse.dev/elk/), [Vega-Lite](https://vega.github.io/vega-lite/)

## Power BI and portable exports

Use a neutral, versioned graph interchange contract as the durable boundary, then generate view-specific projections:

1. **Canonical snapshot:** JSON with explicit `schemaVersion`, snapshot ID/time, sources/nodes, typed directed or undirected relationships, evidence references, and provenance.
   Stable IDs and source revision/hash/locator fields must survive re-export.
2. **Tabular projection:** `nodes.csv` and `edges.csv` or JSON Lines for Power BI and tools that consume rows.
   Flatten sources, groups, memberships, relations, evidence, and similarities into separate tables.
   Include relation method, acceptance status, revision validity, and provenance in the relation projection; keep similarity scores in their own table.
   Keep large quotes out of the relation table and reference a separate evidence table.
3. **Vega-Lite projection:** versioned JSON spec with a documented data table and inline/sample data or a portable file reference.
   Vega-Lite has a published JSON schema and supports multi-view, layering, selections, transforms, and scales.
   Keep the graph map in Tomeowl/Sigma; use Vega-Lite for management-facing summaries such as relation counts, community size, source freshness, evidence coverage, and similarity-score distributions. [Vega-Lite overview](https://vega.github.io/vega-lite/), [Vega-Lite spec](https://vega.github.io/vega-lite/docs/spec.html)
4. **Deneb:** a practical Power BI route for Vega/Vega-Lite visuals.
   Deneb says its certified visual bundles the required libraries, does not access external resources, supports report interactivity, and is MIT licensed.
   Treat a graph projection as a flattened table with a record kind discriminator or use separate Deneb visuals; verify the exact data roles, row limits, and interactions against the approved Deneb version.
   Corporate tenant policy may restrict custom visuals, and the Deneb visual/template/version itself must be approved. [Deneb](https://deneb-viz.github.io/)
5. **PBIP/PBIR:** a Power BI project format, not Tomeowl's interchange schema.
   As of the Microsoft documentation last updated 2026-09-29 and checked on 2026-10-02, PBIP/PBIR formats are generally available, while external PBIP edit/reload and the Power BI Desktop Bridge are explicitly in preview.
   Use Desktop-authored PBIP/PBIR as a downstream project artifact when a Power BI report is requested, and do not generate PBIR internals as Tomeowl's primary API.
   External reload requires the August 2026 Desktop release or later and enabling a preview feature; it applies supported files, not `.pbix`, may reset filters, and currently excludes several report definition files from external editing.
   PBIP is not supported by the Report Server-optimized Desktop variant, and Windows path length defaults can constrain projects.
   Validate the exact Desktop/Service/Fabric/sovereign-cloud target. [PBIP overview](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview), [PBIR report structure and limits](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report), [external editing constraints](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-external-editing)
Do not export vectors by default.
If later needed for analyst reproducibility, export model name/version, vector dimension, normalization/metric, source text hash, and a separately versioned vector artifact; Power BI visuals should consume scalar similarity scores and explainable metadata, not raw vectors.
Avoid publishing confidential source text or file paths in reports without an explicit redaction/export policy.

A future interchange contract should expose these core record families:

- Sources: `id`, `kind`, `title`, `sourceUri` or redacted display URI, `revision`, `locator`, and safe scalar attributes.
- Groups: `id`, `label`, `method`, `methodVersion`, and optional resolution/configuration metadata.
- Memberships: `groupId`, `sourceId`, and optional membership score/provenance, separate from relation records.
- Relations: `id`, `source`, `target`, `type`, and `direction` describe the relation; `method` (`structural`, `imported`, `model`) describes how it was produced; optional `basisDetail` identifies a subtype such as explicit reference, lexical mention, Graphify import, or model extraction; `acceptanceStatus` (`candidate`, `accepted`, `retracted`) records review/lifecycle state; `revisionValidity` (`current`, `stale`, `unverifiable`) records whether cited source revisions match the latest known sources; `provenance` and `evidenceIds[]` identify origin and support.
- Evidence: `id`, `sourceId`, `revision`, `chunkId`, `locator`, and `quote` under the chosen export policy.
- Similarities: `id`, `source`, `target`, `score`, `modelId`, `modelVersion`, `unit` (document/chunk), `metric`, `normalization`, `threshold`, `runId`, and source revision references; this is a separate computed-score record with no relation acceptance lifecycle.
- Optional view preset: `viewSchemaVersion`, layout name/seed, saved coordinates by node ID, filters, color mapping, theme, and reduced-motion preference.
  Keep this separate from canonical source and relation facts.
JSON-LD is a standards-based linked-data option when cross-system identifiers/context become important; GraphML is a graph interchange format when broader graph-tool import/export is required.
Neither needs to be the initial format: ordinary schema-versioned JSON plus CSV/JSONL projections are simpler for the CLI and Power BI. [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/), [GraphML specification](https://graphml.graphdrawing.org/specification.html)

## Minimal modernization path

1. **Polish the current bounded viewer:** add visual modes with explicit legends, saved local presets, stronger relation/type encodings, user-selectable themes, and a one-click calm/presentation state.
   Keep semantic candidate styling separate.
2. **Make structure legible before adding AI:** add collapsible collection/community nesting based on current catalog metadata, then test task completion on real snapshots.
   Add typed relation filtering and edge inspection.
3. **Benchmark semantic grouping as optional derived metadata:** compare deterministic collection groups, connected components, and Graphology Louvain on evidence-backed edges.
   Separately evaluate top-k embedding neighborhoods.
   Store method/model/version and source revision; never promote scores to facts.
4. **Add a small portable export API:** define versioned JSON plus flattened nodes/edges/evidence tables.
   Create one Vega-Lite report projection and verify it in a local Vega editor/runtime; then use Deneb in an approved Power BI Desktop environment.
5. **Measure before replacing:** compare current SVG and candidate Sigma/Cytoscape against the same synthetic and representative corpus; make renderer choice behind a presentation adapter only after gates pass.
6. **Add deeper workflows when demanded:** use ELK Layered for directed process/dependency diagrams; keep management summary dashboards as separate views over the same schema.

For agent-assisted rebuilds, keep the project's shared `AGENTS.md` concise, add a task-specific plan for multi-hour modernization, and package repeatable workflows as standard `SKILL.md` directories.
Codex's official modernization cookbook recommends an `AGENTS.md` plus an optional living plan for complex work; OpenAI's Skill docs describe the portable folder-based skills format.
Claude Code reads `AGENTS.md` directly by default only when no project or ancestor `CLAUDE.md` or `CLAUDE.local.md` takes precedence, and direct support requires Claude Code v2.1.277 or later.
When the installed Windows version or session support is unknown, a small root `CLAUDE.md` containing `@AGENTS.md` is the explicit fallback; it also ensures shared instructions load whenever a `CLAUDE.md` file exists.
Claude skills, subagents, and hooks support reusable workflows, parallel investigation, and deterministic checks; keep hooks local and optional in constrained/offline deployments, and do not assume Codex and Claude share all configuration or hook semantics. [Codex modernization cookbook](https://developers.openai.com/cookbook/examples/codex/code_modernization), [Codex ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans), [OpenAI Skills docs](https://developers.openai.com/api/docs/guides/tools-skills), [Claude memory and instructions, including AGENTS.md version support and imports](https://code.claude.com/docs/en/memory), [Claude overview](https://code.claude.com/docs/en/overview), [Claude skills](https://code.claude.com/docs/en/skills), [Claude subagents](https://code.claude.com/docs/en/sub-agents), [Claude hooks](https://code.claude.com/docs/en/hooks)

## Benchmark and acceptance gates

Use a fixed corpus with reviewed ground truth and record browser, OS, hardware, exact package/model versions, generated snapshot size, and configuration.

| Gate | Measurement | Minimum decision evidence |
|---|---|---|
| Task UX | Find a source, understand its group, inspect why two items appear related, isolate one collection, prepare a presentation view | Task success/time and whether users confuse similar items with verified relationships |
| Structural group quality | Reviewed expected groups, purity/coverage or NMI plus manual coherence review; repeat with explicit relation subsets | Compare to collection-only baseline; show algorithm and resolution settings |
| Similarity candidate quality | Precision@k, recall@k, false-positive audit on labeled pairs, and threshold stability under chunk/model changes | User accepts it as a candidate cue, not a factual edge; evaluate document versus chunk units separately |
| Layout stability | Coordinate displacement for unaffected nodes after insertions/edits; saved selection/filter and view recovery | Stable IDs preserve positions unless user explicitly recomputes layout |
| Render responsiveness | Initial load, time-to-first-interaction, pan/zoom frame timing, selection latency, memory, bundle size at 1k/5k/10k nodes and representative edge ratios | Pick a target-size promise from actual data; retain clear bounded behavior and source-list alternative |
| Offline/corporate portability | Load exported HTML without network; test browser/WebGL unavailable; verify all assets/licenses local; check Power BI visual policy in target tenant | No silent network/model access; graceful non-WebGL/read-only fallback or clear browser prerequisite |
| Export fidelity | JSON schema validation, stable IDs/revisions/evidence after round-trip; compare counts across JSON/CSV/Vega-Lite/Deneb | No evidence/provenance loss; Power BI aggregation matches canonical data |
| Accessibility/personalization | Keyboard-only navigation, high contrast, color-vision-safe modes, reduced motion, static presentation export | No meaning encoded only in color or animation |

## Sources and limits

All technical candidate claims are tied to official project documentation, upstream repositories, Microsoft's docs, or the cited primary paper.
Social popularity was not used as evidence.
“Latest” pages can change; this note records links rather than pinning package archives or testing integrations.
The current repository was inspected locally, but no candidate library was installed and no benchmark was run.
Corporate licensing/approval, Power BI custom-visual policy, and the supported company target were not independently verified.








