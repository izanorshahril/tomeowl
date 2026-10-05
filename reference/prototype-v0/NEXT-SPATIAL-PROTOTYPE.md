# Spatial prototype

Status: implemented on the bounded real corpus; rendered review is recorded in SPATIAL-REVIEW.md.
Updated: 2026-10-02, Asia/Kuala_Lumpur.
The dark Canvas viewer replaces the initial light workbench, whose verified rollback copy is retained in prototype-data/spatial-rollback-20261002.

## Decision

Keep the Bun/SQLite headless core and replace the primary presentation with a dark, full-window clustered map.
Use Canvas with deterministic packing and ring placement for this bounded prototype, following the interaction patterns studied in [visualization research](RESEARCH-GRAPH-VISUALIZATION.md).
The initial D3 subset proposal is replaced by a dependency-free renderer; no Anthropic or D3 source is copied.
Retain source search, a keyboard-accessible list, and an evidence drawer as HTML controls.
Keep qmd and Graphify optional; adopting their entire runtime is not necessary to implement this view.
If adapting the Anthropic viewer, include its Apache-2.0 license, mark modified files, and preserve the embedded D3 ISC notice.

## Data before appearance

The current demo has 38 nodes and 51 relationships, despite having 11,095 search chunks.
Those chunks are caption spans or document lines, not 11,095 independent ideas or dependencies.
The layout must not create decorative entities to mimic the reference's density.
Located evidence excerpts may appear as smaller presentation dots, counted separately from canonical entities and linked back to their source relationship.
Project documents retain explicit project grouping.
Videos may be arranged by strongest extracted topic membership, clearly identified as presentation grouping rather than an inferred dependency or community algorithm.
Place each canonical source once in the containment tree; represent additional topic memberships as edges rather than duplicate sources.
Allow a selected source to expand into meaningful sections only when section extraction is available, with original line/timestamp ranges preserved.
Avoid exposing every automatic-caption fragment as an overview node.

| Field | Purpose | First slice |
|---|---|---|
| Current: `id`, `kind`, `label`, `source`; proposed: `revision` | Stable identity and provenance | Preserve current fields; add revision as an optional compatible extension |
| Group membership / parent | Explicit project or collection ownership | Derive from source metadata; keep independent of topics |
| Relation and evidence | Explain why two entities are linked | Preserve contains, mentions_topic, co_mentioned and adapter types |
| Layout coordinates | Reproducible position and reset | Deterministic sort and initial packing; separate presentation metadata |
| Inference method/status | Distinguish evidence from suggestions | Required before introducing inferred communities or semantic links |

An extension to the map format must remain compatible with existing schemaVersion 1 imports or explicitly version the new format.
Do not change SQLite memory storage merely to add groups or layout coordinates.
Community detection is a later alternate grouping mode: compute it over selected relation types and label its algorithm and input revision.
A folder cluster, similarity link, topic mention, and executable dependency mean different things.

## Interaction and rendering

Sort identities, calculate bounded glyph sizes, pack once, and draw glyphs plus cross-group edges under one viewport transform.
Use bounded weights so long transcripts do not monopolize the canvas; show actual counts in the inspector.
At overview zoom, show group names, aggregate counts, and faint or collapsed links.
At closer zoom, reveal source glyphs, selected-neighborhood links, and readable labels.
Use circles for sources, hexagons for projects, and distinct topic glyphs with text legends; colors identify groups rather than evidence strength.
Add pan, wheel/pinch zoom, fit/reset, search-to-node, click inspection, and group expansion.
Hit testing must convert pointer coordinates through the inverse viewport transform.
Node selection highlights its neighbors; edge selection shows relation, direction, source revision and located evidence.
Preserve keyboard search/list navigation and drawer access, since Canvas nodes alone are not an accessible interface.
Use selected-link emphasis, restrained glow and a quiet background; legibility takes priority over matching every visual effect.
Rings form a second deterministic view over the same identities; defer force simulation until it has a demonstrated navigation benefit.

## Retrieval and memory

The map is a navigation projection, not the retrieval index.
Continue searching SQLite/qmd, return bounded located evidence, then follow only a small selected graph neighborhood.
Retain originals; store curated notes and corrections separately from generated indexes.
Promote repeated useful findings to concise knowledge files with source citations, while keeping detailed reference material searchable on demand.
Distinguish a correction that changes knowledge from one that changes a reasoning procedure.
Future memory writes need revision/status and supersession handling, plus regression questions for corrected facts.
Do not add autonomous consolidation or memory writes to this visual slice.

## Proof before broadening

Validate standalone HTML offline and the rebuilt Windows executable with Bun absent from PATH.
Check stable identities, deterministic initial positions, cross-topic source reuse, import bounds and script-safe escaping.
Exercise zoom, drag, search focus, source and edge inspection, reset, keyboard list access and mobile detail reading.
Measure startup and interaction latency on the actual corpus before claiming support for the creator's reported 35,466 files.
Require each selected relationship to explain its evidence; a caption co-mention must never appear as a verified code dependency.
Use a synthetic bounded scale fixture for rendering only and label it clearly; keep retrieval-quality evaluation on real sources.

Done: deterministic clusters and named Rings, located excerpt marks, viewport interaction, accessible search/list navigation, and the evidence drawer.
Next: review the rendered proof and retrieval usefulness before expanding ingestion or adding durable memory writes.
