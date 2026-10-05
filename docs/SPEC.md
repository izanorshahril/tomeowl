# Release and UI direction specification

## Outcome

Index explicitly selected local documentation and video captions, retrieve revisioned evidence, and export an interactive map without an online service.
This is a new implementation, not a continuation of the archived prototype.

## Functional contract

1. Initialize a versioned SQLite catalog without destroying existing data.
2. Ingest repeated explicit roots with file, byte, and chunk limits; skip hidden directories, dependencies, generated material, symlinks, and unsupported formats.
3. Parse Markdown/plain text with line citations and Viberaven transcript JSON with time citations.
4. Preserve stable source identity and replace changed content transactionally; repeated unchanged imports create no duplicate chunks.
5. Search with literal user terms and bounded results containing source path, revision, quote, chunk ID, score, and locator.
6. Export a schema-versioned JSON snapshot and a self-contained HTML viewer.
7. Preview the same viewer from a foreground loopback-only process.
8. Project a fresh citation-bearing Markdown corpus for qmd and validate bounded Graphify files without changing canonical records.

The first implementation may produce a map with no semantic edges when the corpus contains no verified references.
The viewer must clearly distinguish collection membership from recorded source relationships.
Changed or missing original files must not be silently represented as verified current source content.

## Native retrieval direction, 2026-10-04

The user wants Tomeowl to provide its own retrieval while reducing mandatory dependencies and retaining optional integrations.
Native ingestion, search, source/chunk lookup, recorded-reference export, and offline viewing must remain usable without qmd, Graphify, an external model, or a graph server.
The shipped search ranks chunk bodies with SQLite FTS5/BM25; its default treats terms as alternatives, while explicit all-term and phrase modes constrain matching.
Collection/path scope applies before search limits, with exact collection names and exact file/subtree paths.
Original-file freshness is checked by source/chunk lookup, rather than guaranteed by every search result or offline snapshot.
The viewer's source-title/path filter is distinct from CLI full-text passage retrieval.
Native `neighbors`, `path`, and `context` commands now implement the accepted next slice over the existing catalog without a schema change.
Traversal retains actual edge direction/basis and current indexed citations, applies scope to both endpoints and supporting evidence, and distinguishes capped misses from proven absence.
Context packets separate keyword rank from hop distance and enforce unique cited-source/chunk limits plus a budget on all quoted passage and link-evidence characters.
Supporting citations consume those budgets even when not displayed as passages.
Responses explain truncation, and found paths disclose whether traversal limits prevent a shortest-path guarantee.
All new retrieval commands open the catalog read-only and reject unsupported inputs with structured errors/nonzero exit status.
The [native query guide](NATIVE-QUERIES.md) defines exact flags, bounds, result semantics, and Windows path case limits.
Paraphrase retrieval, model reranking, and code-AST extraction remain future capabilities with their own optional implementation or integration gates.
Evaluate them against a declared query/relationship fixture before expanding dependencies.
Every derived relationship must retain its extraction basis, source revision, and evidence rather than becoming a factual edge by visual proximity.
Keep the frozen [UI baseline](UI-BASELINE.md) intact while evolving these headless capabilities.
The [native retrieval evaluation](RETRIEVAL-EVALUATION.md) now measures an independently annotated research-note suite with corpus/profile fingerprints, citation checks and disclosed packet misses.
Phrase excerpts must follow actual FTS matches, all/any excerpts must favor nearby distinct query terms, and original quote offsets/locators and public JSON remain intact.
The [native retrieval decision](research/native-retrieval-2026-10-04.md) contains the capability comparison and verified smoke evidence.

## Native capability improvements, 2026-10-04

The [capability guide](CAPABILITIES.md) is the exact CLI and limit contract for this implemented follow-up.
Explicit-file imports preserve siblings; authoritative empty folders reconcile deletion; all ingest writes roll back together on failure.
Partial/skipped/unvisited scopes disclose coverage and preserve unseen evidence.
An optional collection manifest supplies portable logical IDs and local root bindings without changing legacy identities or silently migrating incompatible catalogs.
Context covers distinct sources first, selects query-centered excerpts and relevant linked chunks, and accounts for the complete UTF-8 JSON success envelope plus newline through `--max-bytes`.
Graph/snapshot citations require literal chunk quote membership and typed contained locator ranges; coordinate containment is not exact narrowed-line entailment.
Original-file checks are bounded and report `freshnessReason`.
Explicit namespaced memory accepts authored assertions, captures verified evidence, recalls active unexpired records, preserves supersession and logically forgets owned records/history.
Memory reads do not initialize tables, and cited provenance does not establish assertion truth.
Native `repomap` is a bounded indexed JS/TS import/export module inventory with declared coverage, not a symbol/signature or runtime call graph.
`status`, `backup` and fresh-target `restore` provide bounded structural reporting and checksum/integrity-verified catalog operations, including captured memory evidence.
Backups omit original documents and restore refuses existing database journal sidecars.
No new package, model, service or viewer interaction is introduced.

## UI design slice, 2026-10-03

This section defines the current presentation contract and its implementation acceptance requirements.
It supersedes the flat-map presentation emphasis of the initial release; implementation and review evidence belongs in [STATUS.md](STATUS.md) and [UI-REVIEW.md](UI-REVIEW.md).
Requirements are not delivered merely because they appear here.
The requested independent review target is 9/10, with reference fidelity as an explicit visual requirement.
The user rated the reference-form build 7/10 and requested motion in 2D plus useful command-center dashboard sections.
The resulting revision requires its own review; earlier reviewer assessments do not replace that user rating or establish a new one.
The [modernization draft](drafts/MODERNIZATION-SPEC.md) supplies the wider M1 roadmap, while this slice concentrates that roadmap into a bounded, demoable local evidence atlas.

### Problem Statement

An arbitrary project grid or a single source circle does not express the user's supplied cloud and concentric-ring references.
An isolated graph also lacks the useful context of the supplied command-center reference, and an animation option limited to 3D leaves the primary 2D view static.
An engineer or presenter needs to recognize the corpus, identify a useful neighborhood, understand why sources are connected, and reach readable supporting passages.
The visual direction should support both local project discovery and literature-shaped exploration without fabricating semantic relationships or implying that proposed analytical capabilities already exist.

### Solution

Provide a distinctive evidence workspace with Constellation role clouds, Orbital concentric bands, an Atlas collection overview, source neighborhoods, and an evidence inspector.
Frame the default Command center with six divided real-data sections while preserving a separate Map surface for the larger canvas.
Make 2D and optional 3D perspectives share the same corpus, filtering, selection, and provenance.
Provide bounded ambient motion in both dimensions, a visible still control, interruptible scene changes, and drag feedback that preserves the final camera pose.
Use the project's research notes and explicitly selected local project documentation as two real demonstration corpora.
Keep effects secondary to orientation, readable labels, and evidence navigation.
Use the actual [cluster](../reference/visual-direction/rubric-clusters.png), [Rings](../reference/visual-direction/rubric-rings.png), and [Agentic OS arms](../reference/visual-direction/agentic-os-arms.png) images for graph geometry, with [command-center](../reference/visual-direction/rubric-command-center.png) chrome and [dependency-map](../reference/visual-direction/claude-dependency-map.png) inspection context.
Translate their visual roles to real local sources without copying unrelated routines, app logos, or dashboard activity.

### User Stories

1. As an engineer, I want to choose a corpus, so that I know which sources the map represents.
2. As an engineer, I want a project overview, so that I can recognize the local projects before inspecting their documents.
3. As an engineer, I want named collections with source counts, so that the map's organization is understandable.
4. As an engineer, I want to drill into a collection, so that I can inspect its documents without losing the wider context.
5. As an engineer, I want recognizable document roles, so that I can distinguish main documentation, skills, app documentation, research, and other supporting material.
6. As an engineer, I want to search source titles or paths, so that I can quickly find a particular document.
7. As a research reader, I want to explore the existing research notes, so that I can see how their references connect the investigations.
8. As a research reader, I want to inspect a recorded relationship, so that I can understand its method and supporting source passage.
9. As a research reader, I want grouping to differ from recorded references, so that I do not mistake collection membership for evidence of related findings.
10. As a research reader, I want an honest empty-link state, so that the absence of recorded relationships is clear.
11. As an engineer, I want a readable source excerpt with its locator, so that I can check the evidence without reading raw document markup first.
12. As an engineer, I want source revision information, so that I can distinguish a snapshot from verified current file content.
13. As an engineer, I want an unassigned path, so that a source is not lost because it lacks a known group.
14. As an engineer, I want a consistent return-to-overview action, so that I can recover orientation.
15. As a presenter, I want an optional 3D perspective, so that I can show the workspace's structure from another angle.
16. As a presenter, I want 3D rotation, zoom, and reset controls, so that I can recover a useful view without relying on drag gestures.
17. As a presenter, I want readable labels and selected evidence in 3D, so that depth does not prevent source inspection.
18. As a keyboard user, I want list and control navigation, so that the same source and evidence tasks are available without spatial pointing.
19. As a motion-sensitive user, I want still mode and reduced-motion support, so that I can use every core task comfortably.
20. As an engineer, I want saved view preferences, so that I can resume a comfortable layout without modifying knowledge records.
21. As a narrow-screen user, I want independently dismissible source and evidence panels, so that I can navigate without overflow or obscured focus.
22. As an engineer, I want real coverage and omission counts, so that I can see the bounds of the sample and rendering.
23. As an integrator, I want a neutral versioned snapshot, so that another presentation can reuse the evidence without reading viewer markup.
24. As a presenter, I want a self-contained offline export, so that opening the demonstration does not require a service, model, or remote asset.
25. As an engineer, I want to switch between role clouds, concentric bands, and the Atlas, so that each view explains the same real source corpus.
26. As a presenter, I want to expand the map and restore contextual panels, so that the graph can use the available viewport without losing evidence access.
27. As an engineer, I want useful whole-snapshot inventory around the graph, so that I can open project manifests, skill documents, research notes, and scan coverage without mistaking those records for live activity.
28. As an engineer, I want the 2D graph to feel responsive while motion pauses for reading and targeting, so that effects do not disrupt evidence inspection.

### Implementation Decisions

| ID | Contract |
|---|---|
| UI-01 | Retain the existing portable catalog and authored viewer; introduce no framework, model, or graph database solely for the design iteration. |
| UI-02 | Provide explicit corpus choice between research notes and local project documentation; show current graph scope and counts separately from whole-snapshot dashboard inventory, with clear absent-corpus behavior. |
| UI-03 | Atlas overview presents named collections with source counts; selecting one enters a bounded neighborhood; every form opens source evidence and preserves a direct overview route. |
| UI-04 | Project documentation roles are derived navigation categories with disclosed deterministic rules, not runtime behavior or factual dependencies. |
| UI-05 | Keep every scoped source searchable and reachable through the source list; reference forms render up to 400 actual particles, while Atlas retains its 120-source cap and twelve shared-citation representatives. |
| UI-06 | Reference forms use stable role colors and glyphs, while Atlas retains categorical collection colors; labels, real counts, and a legend separate organization, membership, and recorded relationships. |
| UI-07 | Relationship inspection names kind and method and retains supporting source revision, chunk, quote, and locator; selection progressively emphasizes shortest undirected distance through actual complete-scope links, including hidden filtered intermediates, without creating edges or implying dependency direction/confidence; selected links keep both endpoints bright. |
| UI-08 | The inspector prefers readable representative content and preserves the original raw evidence and locator; markup cleanup never invents a quote. |
| UI-09 | The primary switch offers Constellation role clouds, Orbital concentric bands, and Atlas; legacy Source circle remains secondary, all forms support 2D/3D, and switching preserves selection and scope. |
| UI-10 | 3D uses noncoplanar coordinates, a perspective camera, and yaw/pitch rotation; a CSS tilt of a flat map does not meet this contract. |
| UI-11 | Pan and 3D rotation supply click and keyboard alternatives alongside dragging, fit/reset, and zoom; labels face the screen and selected evidence remains reachable regardless of occlusion. |
| UI-12 | Selection and ordinary filtering preserve unaffected base positions; bounded animated poses derive from that layout, and fitting or changing layout is explicit; 250ms scene transitions are interruptible, focus opacity settles over 220ms except reduced motion, and drag-release feedback lasts 180ms without camera inertia. |
| UI-13 | Motion works in 2D/3D with visible Pause/Resume and speed controls: 0% is Still, 100% is the existing pace, and intermediate values scale fractionally without exceeding it; positive changes resume eligible motion, while selection, hovered/focused map targets, dragging, hidden pages, reduced motion, and High contrast retain stillness; graph glow is independent and sound starts off. |
| UI-14 | Primary controls serve surface, corpus, search, form, dimension, evidence, Pause/Resume, Motion speed, Glow, and Show all nodes; clearing focus restores normal emphasis without changing filters/camera, while Display mirrors speed/Graph glow and other preferences remain secondary. |
| UI-15 | Profiles, form, surface, scope/filter, camera, effects, and the expanded/restored Map choice are validated v4 view state; v3/v2 migration initializes the requested animated Command center and fits once while retaining valid graph form and scope, subject to still overrides; saved v4 pauses/zero speed persist and restored pace clamps to the current bound without changing evidence. |
| UI-16 | The default Command center surrounds a dominant graph with six useful snapshot sections; Map retains expanded/restored panels; narrow screens place dashboard sections below the graph and preserve text, focus, dismissal, and a complete source-to-evidence path through Explore/Evidence. |
| UI-17 | Samples record discovered projects, included sources, skips, bounds, and omissions; dashboard manifests, skills, citation rankings, and coverage come from actual records and metadata with URL-only/bounded-scan disclosures; inventory stays in generated data, separate from distributable software and public fixtures. |
| UI-18 | Offline output embeds required styles, script, and snapshot; no remote font, model download, or WebGL requirement is introduced by 3D. |

The versioned snapshot is the existing seam for tests and presentation consumers.
The projection module concentrates membership, counts, visible relationships, and corpus navigation behind a small interface shared by 2D, 3D, and the source list.
The two demonstration corpus adapters justify that seam; hypothetical analytical or model adapters do not need scaffold directories now.
The existing catalog schema remains unchanged for this slice.
Constellation places main documents around a project core and other occupied roles in volumetric clouds.
Orbital places projects/main documents centrally, skills inside, documents/research/citations in middle sectors, and app manifests outside in true concentric bands.
Skills use orange diamonds, app manifests use blue hexagons, documents/research use purple circles, and citations use cyan circles.
Every particle corresponds to an actual scoped source and role counts derive from displayed records.
The new default is Constellation; a legacy single source circle does not satisfy the Orbital contract.
Orbital uses external Projects, Main docs, and Skills callouts so inner-role labels do not collide with source particles.
Role outlines, concentric tracks, organizational spokes, and label leaders must not be inserted into the snapshot as evidence relationships.
The central scope symbol is an organizational anchor rather than an additional source.

The Command center contains Workspace pulse, App manifests, Source layers, Research connections, Skills deck, and Snapshot coverage.
Inventory totals come from source arrays and valid recorded relationship endpoints, while the graph retains the shared scoped projection.
Manifest rows show one selected root manifest per project and open its evidence; the complete role remains reachable through the filter action.
Research rows rank distinct outgoing recorded references to literature citation records, and shared counts mean another research note cites the same URL record.
Skills open their actual documents, and coverage shows selected/discovered eligible files, bounded scan depth, snapshot date, and recorded warnings when present.
No section implies a running application, executed skill, live sync, email, calendar, routine, or operational health.
Dashboard DOM is mounted once and updated without replacing focused rows.
At 900px and below the two dashboard rails follow the graph; at 740px and below they stack vertically.
Ambient elapsed time advances only while movement is allowed, so paused or hidden intervals do not produce catch-up jumps.
Reduced motion suppresses scene transitions and drag-release effects as well as ambient movement.
Primary and Display speed sliders share a 0–100% representation of internal pace 0–25; 100% equals the preceding current pace, and restored speeds cannot exceed it.
Graph glow supplies role-colored particle bloom, occupied-role cloud/band auras, warm central illumination, and restrained Atlas glyph light independently of movement.
Glow off and High contrast remove those illumination effects.
Decorative light duplicates are aria-hidden and noninteractive, keep labels and hit targets crisp, and never add source records, evidence edges, or selection targets.
Relationship focus traverses the complete current corpus/group before query/layer filtering, using canonical recorded links as an undirected graph and both selected-relation endpoints as roots.
Particle and bloom opacity is 1 at the root, 0.9 at one hop, 0.42 at two, 0.16 at three, 0.055 at four, 0.025 at five or more, and 0.012 when disconnected.
Edges follow the less-emphasized endpoint, direct-link highlights remain, and hovered/keyboard-focused actual source groups reveal fully.
Guides, auras, the hub, and role labels recede during focus; visible direct/indirect counts or an honest selected-scope empty-link message explain the result.
Show all nodes clears source/link selection while retaining active query/layer/camera, and complete source/evidence access remains available throughout.
Atlas aggregate project anchors keep normal overview emphasis; actual source views and the legacy circle use relationship focus.
Cross-corpus research-source jumps retain the whole literature corpus, including citation records, instead of narrowing to the research-note group.

### Sample contracts

The research sample includes active research notes and URL citation records selected from this project.
Related specifications remain project documents and are reachable through recorded cross-lens references where those links exist.
Explicit local Markdown references may be recorded with citation evidence; an external bibliography reference is not an ingested paper or a verified paper finding.
This is a literature-shaped input demonstration rather than the completed future literature-review capability.

The local project sample discovers project directories under the user-requested `D:\Dev` root and includes bounded selected documentation per project.
Discovery and inclusion are separately counted, with reasons for skipped or partial projects.
Skip hidden/dependency/generated/archive trees and links, exclude secrets, and limit file counts and bytes.
Do not execute another project's scripts, load its dependency code, or mutate its content.
Keep the inventory and derived map under local generated data; public documentation need not enumerate unrelated project names.
Projects, main Markdown, skills, and mini-app documentation form navigable groups only where matching source documents exist.
Do not manufacture a node to suggest an absent capability or infer a dependency from a shared document role.

### Testing Decisions

Tests exercise the snapshot/projection and exported viewer interfaces rather than private drawing helpers unless a focused geometry invariant needs direct proof.
Reuse existing revision, citation, snapshot injection, and layout tests as regression coverage.
Add focused evidence for collection counts and scope, relation provenance, missing/unassigned sources, stable position behavior, perspective depth/rotation, and damaged saved-state recovery.
Exercise the pure reference geometry for deterministic positions, genuine volume, concentric band order, occupied-role counts, and stability under filtered scene drawing.
Exercise preference migration, form selection, particle-to-evidence activation, and expanded-map panel recovery through the authored viewer seam.
Verify that restored panels survive reloads and that display reset preserves the panel choice.
Exercise Command center/Map surface persistence, one-time v3/v2 initialization, saved v4 pause/zero-speed restoration, and dashboard source/filter/coverage actions.
Test actual snapshot-wide totals, valid cross-corpus relationships, distinct citation/shared-URL ranking, manifest deduplication, and missing coverage metadata without relying on local private fixtures.
Test 2D/3D motion eligibility, paused clocks, bounded time steps, role-preserving poses, and terminal Atlas movement through the pure motion seam.
Test fractional slower pace, the unchanged 100% endpoint, zero stillness, and clamping of older saved speeds to the current bound.
Test shortest undirected paths, cycles, disconnected sources, multiple roots, invalid endpoints, corpus/group boundaries, and filtered hidden intermediates through the pure relationship-focus seam.
Keep software-only synthetic fixtures independent of unrelated local project content.

Review these journeys in the real generated samples: choose corpus, open a collection, find a source, inspect evidence, follow an explicit reference when available, return to overview, and repeat source inspection in 3D.
Exercise keyboard controls, clickable camera alternatives, reduced-motion startup, frozen pose, empty results, offline export, and narrow-screen panel dismissal.
Inspect motion pause/resume, hover/focus/selection stability, zero-speed restart, actual 2D particle movement, interruptible scene changes, drag-release feedback, and dashboard placement below the mobile graph.
Exercise primary/Display speed synchronization, slower movement, persisted values, Glow on/off, High contrast's unlit view, and source/edge evidence navigation through the illuminated scene.
Exercise progressive focus in source forms, paired bloom/edge fading, hover and keyboard reveal, full Research citation context, selected-link endpoints, Show all nodes with preserved filters/camera, and immediate reduced-motion emphasis.
Record the actual test count, build result, review environment, captures, and outstanding gaps in the status documents.
Test the 400-source reference-form bound and Atlas's narrower rendering policy; do not claim unbounded spatial rendering or performance budgets without a measured fixture.

### UI review rubric

The independent review scores five dimensions from 0 to 2, for a total out of 10.
The target is at least 9/10, with no unresolved critical navigation, provenance, accessibility, or rendering failure.
The score is a named reviewer assessment, not a user rating or a measured WCAG conformance result.

| Dimension | A 2-point result |
|---|---|
| Visual direction | Recognizable role clouds or genuinely concentric bands and divided dashboard sections matching the supplied references, a dominant graph, coherent hierarchy and glyphs, and useful real content without fabricated activity. |
| Orientation | Corpus, collection, source, and return path are recognizable, and labels/counts explain the map without guesswork. |
| Evidence clarity | Readable excerpts, usable locators, honest revision/method labels, and distinct grouping/relationship semantics. |
| Interaction | Predictable selection, stable reading/targeting during animated 2D/3D views, effective camera and dashboard actions, interruptible scene changes, useful empty states, and recoverable saved preferences. |
| Accessibility and adaptation | Keyboard/list parity, visible focus, still/reduced-motion operation, click alternatives, and usable narrow-screen panels. |

### Out of Scope

Bibliographic import, paper screening, reviewed claim matrices, PDF/OCR, measurement analytics, STDF, program semantic analysis, embeddings, model extraction, automatic memory admission, harness writeback, BI integration, multiuser hosting, and a new graph engine remain separately staged capability work.
The demonstration does not make source relationships current merely because a file path still exists.
No inferred similarity, topic confidence, operational health, or usage/cost metric is invented for presentation.

### Further Notes

The [graph UI research](research/graph-ui-direction-2026-10-03.md) records the primary-source basis and limitations.
The [decision map](decisions/ui-direction/MAP.md) records selected direction and remaining future decisions.
The [implementation tickets](../.scratch/ui-direction/README.md) break the work into local demoable slices without assuming a remote issue tracker.

## Acceptance evidence

Test source revision replacement, idempotency, transaction failure, citation locators, literal query escaping, and bounded ingestion.
Test the exported HTML against script-closure injection and the pure layout against anchor and terminal-motion invariants.
Compile Windows x64 and run ingest, search, map export, and HTML export through the executable.
Review desktop and mobile rendering and source navigation independently against the UI rubric above when the browser surface is available.
Record observed results and material gaps in [STATUS.md](STATUS.md).

## Directed video archive slice, 2026-10-05

The authorized media extension is specified and exercised in [VIDEO-GRAPH.md](VIDEO-GRAPH.md).
It introduces four source roles with stable channel/video identities and independent description/transcript passage branches.
The enriched snapshot provides explicit containment arrows, symmetric lexical overlap, timestamp/raw-artifact provenance, media coverage, and an isolated Directed form while preserving existing workspace defaults.
The importer remains headless, read-only on the source archive, bounded to 24 videos and 2,048 passages, and compatible with the existing SQLite evidence/retrieval and offline HTML seams.
This slice does not implement embedding inference, actual Graphify document extraction, direct SQLite video import, or whole-archive indexing.

## Later releases

qmd retrieval and Graphify imports must preserve this evidence contract and remain explicit operations.
The first release projects qmd input and validates Graphify candidates; external qmd execution and persisting accepted imported edges are not yet implemented.
Automatic/semantic memory, bidirectional harness updates, PDF/OCR, semiconductor parsers, and desktop packaging require their own specifications.
Do not imply those features are delivered by the first release.

## Next-release research specification

The [modernization specification](drafts/MODERNIZATION-SPEC.md) proposes grouped overview/neighborhood/evidence navigation, semantic color modes, personalization, optional embeddings and extraction, and portable dashboard exports.
M1 recommends a UI/projection slice within the current renderer before any graph-database or model-runtime replacement.
The current release contracts above remain the implemented baseline; future requirements are explicitly staged and have their own acceptance evidence.
