# Implementation status

## Directed Viberaven media graph, 2026-10-05

Delivered the [bounded media graph recipe](VIDEO-GRAPH.md), using current raw JSON from Viberaven's supplied archive.
The captured sample has four of 41 channels, eight of 4,298 videos, eight description passages, 24 transcript passages, 40 containment arrows, and seven lexical overlap links.
The Directed view retains motion/glow, 2D/3D, progressive selection focus, timestamp evidence, original artifact hashes, and the full selected source list.
Existing workspace forms/defaults remain available; media preferences use a separate browser key.
The archive SQLite and raw files were inspected without source writes, and selected raw hashes remained unchanged through final verification.
Review fixes cover canonical output containment, bounded file reads, Unicode split preservation, channel URL validation, original description offsets, record line citations, and parent metadata evidence.
Full validation passed 216 tests with 2,429 assertions; 15 focused checks with 196 assertions passed after refinement.
Browser inspection exercised desktop/mobile layouts, zero motion, selected-chunk evidence/fading, and preserved 44 nodes/40 ownership arrows in 3D.
The [verification record](../data/viberaven-2026-10-05-final/verification.json) and captured [desktop](../data/viberaven-2026-10-05-final/desktop.jpg)/[mobile](../data/viberaven-2026-10-05-final/mobile.jpg) views retain the evidence.
Models remain deferred; QMD is an optional Markdown projection, and actual Graphify document extraction was not run.

## Retrieval evaluation and excerpt quality, 2026-10-04

Delivered the [repeatable retrieval evaluation](RETRIEVAL-EVALUATION.md) over all 13 existing research notes, including the raw note, with 123 indexed chunks and 14 independently annotated questions.
The helper uses an in-memory catalog, partial exact evidence labels, declared budgets, suite/corpus/runtime/implementation fingerprints and checks for indexed citation authenticity and serialized packet integrity.
The final evaluator was replayed against SHA-verified pre-change runtime copies and the original corpus paths; baseline metrics match the original recorded run.
Paired reports preserve identical questions, corpus, profile and search rankings.
The 1,600-character context profile retains 11 of 14 evidence anchors, up from 10; macro labeled-source Recall@5 remains 100% and macro exact-anchor Recall@5 remains 92.3%.
All 86 checked search/passage/link citations in each run are authentic and every response stays within its requested budget.
The checked no-answer case returns empty search and context, without claiming generated-answer abstention or general RAG quality.

Native FTS5 match spans now anchor actual phrases, all/any windows favor nearby distinct query groups, overlapping groups retain their whole covered span and fitting matches outrank oversized clipped fallbacks.
Quotes preserve original indexed code units, exact UTF-16 offsets and line locators, while private highlight metadata stays outside public JSON.
Four targeted support-span failures improve from 0/4 to 4/4; additional fitting/overlap/marker/Unicode regressions pass without changing query semantics or ranking.
The literal-marker fallback remains an approximate Unicode lexer, and CJK whole-token segmentation is unchanged.
Two packet support-chunk misses and one vocabulary-shift miss remain measured next-step gates; no model/provider was added to mask them.

Final validation passed 193 tests with 2,228 assertions and Windows x64 compilation.
Independent final review passed 39 targeted tests with 303 assertions and found no remaining actionable defect in this slice.
The rebuilt executable passed six compiled excerpt scenarios, tiny-budget behavior and structured invalid-bound failure with only System32 on PATH; read commands preserved its synthetic catalog SHA-256.
All twenty frozen viewer hashes, including the regenerated bundle, match `ui-2026-10-04`.
The [verification record](../data/retrieval-evaluation-2026-10-04/verification.json) links paired reports, executable/source hashes, review and compiled proof; verified before-copies remain under its `before` directory.

## Native capability improvements, 2026-10-04

Delivered the [native capability guide](CAPABILITIES.md): catalog synchronization/atomicity, portable collection manifests, stronger RAG packets, explicit accepted memory, a bounded JS/TS module map, structural status and verified backup/restore.
Targeted single-file updates preserve siblings, empty authoritative scopes reconcile deletion, and later source/relation failures roll back every ingest write.
Complete/skipped/bounded coverage is reported rather than authorizing unseen-source deletion.
Collection-relative identities survive separate-catalog rebuilds and same-catalog root rebinding, with conflicts rejected; legacy absolute-path identities remain unchanged.
Context selection covers distinct sources first, centers excerpts on query matches with exact UTF-16 offsets, prefers relevant linked chunks and bounds the whole UTF-8 CLI response including metadata/newline.
Original freshness reads are bounded with explicit reasons, and writable opens maintain endpoint indexes.
Graph/snapshot evidence now validates literal chunk quote membership and contained typed coordinates; repeated-text narrowed-line occurrence and semantic entailment are outside that guarantee.
Accepted memory has explicit namespaces, actors, kinds, expiry, transactional correction/retraction, retained citation copies and logical forgetting; its separately versioned optional tables initialize only on writes.
The native module map uses the embedded scanner without running source code and discloses type-only, signature/span, parser/reconstruction and runtime-call limitations.
Backup captures committed SQLite content and memory tables, verifies checksum/integrity, and restores only into a fresh destination without existing journal sidecars or an applicable manifest destination.

The full check passed 170 tests with 2,050 assertions, and Windows x64 compilation passed.
The compiled executable exercised portable ingestion/root relocation, bounded context and actual JS/TS scanner output, retained memory quotes after revision change, correction/forgetting, read-only hashes and backup/restore with only Windows System32 on PATH.
A fresh captured index of thirteen real research notes returned seven cited passages within 1,500 quoted characters and 8,000 serialized bytes.
Independent targeted review exposed fabricated graph citations and stale restore sidecars; both were corrected and verified with regressions, including a real conflicting WAL fixture.
The frozen viewer's twenty hashes, including the regenerated browser bundle, remain unchanged.
No external package, model, provider service, upload or viewer interaction was added.
The [release verification](../data/capability-improvements-2026-10-04/verification.json) records the source/executable hashes, compiled proof and contracts; SHA-verified before-copies remain under its `root-before`, `catalog-before` and `packet-before` directories.

Broader retrieval-quality/production-latency evaluation, semantic memory/retrieval, answer generation, full symbol/call maps, file-rename identity, legacy-ID migration, whole-source revision archives and harness writeback remain future work.
Memory recall is literal case-sensitive matching; forgetting logically removes owned memory records/quotes and excludes original files, prior exports/backups and forensic erasure.
Partial portable root rebinding can retain some old physical paths until a complete pass; skipped entries conservatively prevent pruning.
The earlier assessment below describes the pre-improvement build and does not supersede this release status.

## Memory, RAG, knowledgebase and repomap assessment, 2026-10-04

Completed two independent code audits and a primary-source research pass without changing application code, dependencies, schema or the frozen viewer.
The [capability review](drafts/MEMORY-RAG-KB-REPOMAP-REVIEW.md) records current fit, concrete gaps, proposed module boundaries and delivery gates; [research](research/memory-rag-kb-repomap-2026-10-04.md) supports the upstream comparisons.
Synthetic fixtures reproduced three open catalog defects: targeted single-file ingestion prunes still-existing siblings, an authoritative empty-root scan leaves deleted evidence retrievable, and a later scope or relation failure can leave a partially committed ingest.
The [catalog audit](../data/capability-review-2026-10-04/memory-kb/REVIEW.md) and its [verification record](../data/capability-review-2026-10-04/memory-kb/verification.json) capture these cases and demonstrate replaced historical citations, path-dependent identity and uncapped original-file freshness reads.
Separate in-memory [packet checks](../data/capability-review-2026-10-04/retrieval/verification.json) demonstrate one-source domination, clipping away a late query hit and serialized metadata outside the quoted-character budget.
The metadata case is an intentionally constructed contract counterexample, not a normal-corpus size benchmark.
Recommended next work is catalog synchronization and atomicity, followed by retrieval evaluation/packet quality and portable identity, then independent intentional-memory and native module-map slices.
The current release's 102 passing tests remain the last full-suite result; this review did not rerun that suite or fix the newly identified defects.
No durable memory API, symbol repomap, generator, embedding runtime, backup/restore command or portable migration was introduced by this assessment.

## Native query release, 2026-10-04

Delivered scoped native any/all/phrase search, cited bounded `neighbors` and `path` queries, and the compact `context` command without qmd, Graphify, models, new packages, or a schema migration.
The [query guide](NATIVE-QUERIES.md) records exact CLI flags, response contracts, budgets, and limits.
The scope module is shared by search, graph endpoints/supporting citations, and context metadata; recorded direction/basis and latest indexed evidence remain intact.
Path results distinguish `found`, `not-found`, and `truncated`, with a conservative `shortest` guarantee on found paths.
Context budgets include distinct supporting citation chunks/sources and every returned quote; keyword ranking and link distance remain separate signals.
The frozen viewer's twenty file hashes, including its regenerated browser bundle, match `ui-2026-10-04`.

The check passed 102 tests with 1,601 assertions, and Windows x64 compilation passed.
The compiled executable exercised all three match modes, exact path/collection scopes, a two-edge shortest path, exhaustive absence, a capped miss, full/tiny context budgets, and structured invalid-mode failure with only Windows System32 on PATH.
The synthetic six-file catalog's SHA-256 stayed unchanged after every read command.
A read-only context query over the actual research catalog also returned cited material within its 1,500-character budget.
The loopback search API returned one scoped phrase result and a structured HTTP 400 for an invalid match mode; its task-owned verification server was stopped.
Independent Spec and Standards reviews approved the final source; review caught a supporting-citation chunk-budget issue, which was fixed with a focused regression and an independent read-only reproduction.
The machine-readable release proof is `data/native-query-release/verification.json`, with full CLI and API records alongside it.
Twelve SHA-256-verified before-copies, including the previous executable, remain under `data/native-query-release/before`.
The immutable UI source archive continues to represent its earlier freeze; the current project and executable include this native query release.

Semantic/paraphrase retrieval and AST extraction remain future optional capabilities.
Windows scope matching folds ASCII case while preserving exact accented spelling; non-ASCII case variants remain distinct.
Quoted-character budgets count UTF-16 units rather than model tokens or total JSON size, and bounded graph material does not guarantee large-catalog query time.
Original-file freshness remains a source/chunk lookup check; the new queries explicitly use indexed revisions.

## Native retrieval direction and proof, 2026-10-04

This section records the decision pass before the native query release above.
The user made native retrieval primary and retained qmd, Graphify, and other integrations as optional.
Updated product, architecture, current specification, and implementation guidance without changing application code or the frozen frontend.
The [native retrieval decision](research/native-retrieval-2026-10-04.md) separates shipped behavior from future capabilities.
The existing compiled Windows executable indexed three synthetic Markdown files, retrieved one identifier-bearing passage with revision/chunk/line evidence, looked up that exact chunk with `stale: false`, and exported one cited explicit reference.
Its temporary PATH contained only Windows System32, and no external retrieval/extraction tool was invoked.
The two-term query matched either term across two documents, while a paraphrase query returned no results, confirming the current lexical-only search semantics.
This proof is saved under `data/native-retrieval-2026-10-04/verification.json` and does not establish qmd semantic or Graphify AST parity.
Native scoped query modes, bounded cited context assembly, and recorded-link CLI traversal remain proposed next work.
No new dependency, parser, model, schema, or shipped command was introduced by this decision pass.

## Frozen UI baseline, 2026-10-04

The user froze the current UI/UX as `ui-2026-10-04` after the relationship-focus refinement.
All authored viewer files are retained without a visual or interaction change.
The [baseline guide](UI-BASELINE.md) records CLI rebuilds, the exact enriched sample, frontend reuse, and target-platform limits.
The local freeze directory is `data/ui-freeze-2026-10-04`, with a SHA-256 manifest, rebuildable source archive, standalone sample HTML/JSON, reference capture, and Windows x64 runtime.
The local sample is preserved separately from the reusable source archive.
The new source-run `snapshot:export` helper renders an enriched JSON snapshot directly through the existing renderer, preserving dashboard metadata that ordinary catalog exports do not reconstruct.
qmd projection and Graphify validation remain optional; neither tool is required to build or display the frozen frontend.
The [primary-source portability note](research/cli-portability-2026-10-04.md) explains their separate retrieval/extraction roles.
Freeze verification and archive rebuild results are recorded in `data/ui-freeze-2026-10-04/verification.json`.
The check passed 74 tests with 1,371 assertions and Windows x64 compilation; direct rendering of the preserved JSON reproduced the frozen 732,545-byte HTML with the same SHA-256.
The independent scoped audit confirmed the CLI recipes, enriched metadata retention, and unchanged snapshot input.

## Current relationship focus refinement, 2026-10-04

Source selection now progressively fades real particles by shortest undirected distance through canonical links in the complete current corpus/group.
Query and layer filters do not remove hidden intermediate sources from the path calculation.
The selected source stays at opacity 1; one-hop neighbors use 0.9, two hops 0.42, three 0.16, four 0.055, five or more 0.025, and disconnected sources 0.012.
Glyph-only bloom proxies use matching emphasis, and edges follow their lesser endpoint while direct highlights remain.
Selecting a recorded relationship keeps both endpoints bright; guides, auras, the central hub, and role labels recede during focus.
Actual source targets reveal on hover or keyboard focus, while Explore and original source/evidence navigation remain complete.
Show all nodes clears source/relation selection and restores normal emphasis while preserving query, layer, and camera.
The selected-evidence reading hold remains until clear or Resume, and selection/reset opacity settles over 220ms except under reduced motion.
Cross-corpus research-source jumps retain the full Research lens with citation records, and scope feedback explains visible direct/indirect connections or the selected source's empty-link state.
Atlas's aggregate project overview remains normally emphasized; source neighborhoods and the legacy circle use progressive focus.

The current check passed 70 tests with 1,353 assertions.
Windows x64 compilation passed; the compiled fixture viewer exported at 125,951 bytes with Bun absent from its child PATH, and the full workspace HTML regenerated at 732,545 bytes with all five focus fragments.
Browser checks found matching opacity on the 181 workspace source/bloom pairs: one root, three direct neighbors, seven indirect sources, and 170 disconnected records.
The 106-record Research lens retained one root, 27 direct sources, 59 sources at two hops, and 19 at three hops.
Selected-link focus kept both endpoints at opacity 1, and a faded unselected keyboard target revealed from 0.012 to 1.
Show all nodes restored the same source ID set and camera; selection may change DOM stacking priority, while source identities remain stable.
Atlas and the legacy source circle each exercised eleven source nodes with one root, two direct neighbors, and eight at two hops.
The 390px mobile view had no horizontal overflow, a 59.7×40px Show all nodes target, a 42px context strip, and a 345px graph area.
Dense-center pointer overlap initially selected a neighboring source; nearest-projected-center picking corrected the native visible-glyph selection without changing glyph geometry or keyboard IDs.
An isolated source then selected its expected canonical identity, displayed the empty-link feedback, and left the other 180 records disconnected.
The independent scoped review returned `ship` without a numeric score and approved the final picking correction; the final browser warning/error logs were empty.
Saved evidence includes [automated verification](../data/relationship-focus/verification.json), [browser verification](../data/relationship-focus/browser-verification.json), and the [final desktop capture](../data/relationship-focus/review/desktop-final.jpg).
This refinement has no new user rating or numeric review score; earlier verification below remains evidence for its completed scope.

## Completed speed and glow refinement, 2026-10-04

The authored viewer now exposes primary Motion speed and Glow controls alongside the existing command-center graph.
Motion speed ranges from Still at 0% to the preceding current pace at 100%, with fractional slower scaling and synchronized Display controls.
The unchanged 100% pace is internal speed 25, and validated v4 restoration clamps older speeds to 0–25 rather than allowing faster movement.
Positive speed changes resume eligible motion; selected/hovered/focused reading targets, dragging, hidden pages, reduced motion, and High contrast retain their stillness gates.
The primary Glow toggle and Display's Graph glow option add role-colored particle bloom, occupied-role cloud/band auras, and warm central illumination independently of movement.
Glow off and High contrast remove the illumination; Atlas receives a restrained glyph glow.
Decorative SVG light proxies are aria-hidden and noninteractive, so source and relationship identities, hit targets, and evidence navigation stay canonical.

The current check passed 63 tests with 1,299 assertions.
Windows x64 compilation passed, and the compiled fixture viewer exported at 121,401 bytes with Bun absent from its child PATH.
The full workspace standalone export was regenerated at 727,995 bytes.
Coordinator browser checks verified frozen poses at zero, 100%/99% primary slider steps, synchronized Display zero, zero-speed restoration, and disabled motion/glow with all illumination hidden in High contrast.
The 3D Constellation retained 181 actual nodes, 181 noninteractive light proxies, and five auras; particle movement at 100% preserved stable source identities, with no focusable decorative proxies.
The 390px mobile view had no horizontal overflow, and browser warning/error logs were empty.
The independent review returned `ship` for this narrow follow-up without assigning a numeric score.
This refinement has no new user rating; the preceding command-center verification below remains evidence for that completed revision.

## Completed command center and motion revision, 2026-10-03

The user's latest assessment of the reference-form build is 7/10, with requests for 2D animation, motion/drag/transition effects, and useful dashboard sections like the supplied command-center reference.
This revision adds those requested behaviors; the earlier independent 9/10 review does not replace the user's score or establish a new one.
Command center is the default surface, with Workspace pulse, App manifests, Source layers, Research connections, Skills deck, and Snapshot coverage around the graph.
Map preserves the larger canvas, form selection, and expanded/restored panel choice; Explore and Evidence retain the complete navigation path in both surfaces.
Dashboard sections use whole-snapshot counts, actual source actions, distinct recorded citation/shared-URL counts, and bounded coverage metadata rather than fabricated activity or running capabilities.
At 900px and below the sections follow the graph, and at 740px and below they stack vertically.

Ambient motion now works in 2D and 3D with visible Pause/Resume and zero-speed still controls.
Movement pauses for selected sources/relations, hovered or keyboard-focused map targets, dragging, hidden pages, reduced motion, and High contrast.
The pause-aware clock preserves the displayed pose and avoids catch-up jumps, with bounded time steps and reversible role-preserving movement.
Scene changes use interruptible 250ms transitions, and drag feedback settles over 180ms without drifting the final camera pose; reduced motion suppresses these effects.
Validated `tomeowl.display.v4` preferences save surface, scope, form, camera, effects, and layout.
One-time v3/v2 migration initializes the requested animated command-center view and refits while retaining valid graph form and scope; saved v4 pauses and zero speed remain still.

The actual sample remains 30 projects, 287 sources, 920 chunks, and 437 valid recorded relationships, with 28 app manifests, four skill documents, ten research notes, and 96 unfetched URL records.
Coverage reports 161 selected eligible files from 262 discovered, with depth and scan-pass omissions disclosed separately; these figures do not claim a complete machine inventory.
The dashboard model's targeted checks passed five tests with 34 assertions, and the viewer bundle compiled.
The full current check passed 61 tests with 1,282 assertions, and Windows x64 executable compilation passed.
Coordinator browser proofs covered 1440×900 and 1280×720 desktop plus 390×844 mobile dashboard placement and source/evidence actions.
The running 2D sample changed 151 actual source-particle poses; manual Pause/Resume, selected-source stillness, zero speed, and the still preset were exercised.
A 30px drag changed the pan and produced the release-feedback state, and the final mobile legend was separated from role labels and camera controls.
The independent final reviewer confirmed the corrected legend and returned `ship` with a 9/10 manual assessment; the user's latest rating remains 7/10.
The sample standalone HTML was regenerated at 722,366 bytes, and the compiled executable exported its 115,772-byte embedded viewer with only Windows System32 on PATH.
Global documentation checks passed across 34 active documents/tickets and 228 local links, with eighteen unique UI requirement IDs and no incomplete implementation tickets.
The regenerated standalone sample was opened through `/saved` and displayed the command center, actual 287-source inventory, and all 181 workspace particles.
Keyboard focus and particle positions remained stable during inspection, both workspace surfaces preserved their scope, and native 3D rotation changed all 181 projected source positions.
Browser warning/error logs were empty, and the temporary viewport override was reset before delivery.
The final coordinator record is `data/command-center/verification.json`.
Review evidence and limits belong in the [UI review](UI-REVIEW.md)/[code review](CODE-REVIEW.md), independently of the user's rating.

No dependency or catalog schema change was introduced, and no other local project was modified.
Thirty-three scoped before-copies were SHA-256 verified under `data/command-center/before`.
The new pure dashboard/motion modules extend the existing snapshot/projection/camera seams; the source tree remains one portable catalog/CLI and one authored viewer.
Preview: `http://127.0.0.1:4318/`; generated sample: `data/design-workspace/final`; executable: `dist/tomeowl.exe`.

## Earlier reference forms revision, 2026-10-03

This section preserves verification for the preceding graph-form revision; its review score and v3 startup behavior are historical.

The user's graph-form correction is delivered: Constellation follows the reference's unequal role clouds and central hierarchy; Orbital follows its concentric bands and outer app-manifest hexagons.
Atlas preserves the earlier project grid and source neighborhoods as a third primary form; the legacy Source circle remains in Display.
Both new forms support genuine 3D perspective and display every source in the current workspace/research scope, with a 400-source spatial bound.
Source-role frames, tracks, and dashed callout leaders describe organization; only catalog relationships carry evidence.
The graph starts expanded, and validated v3 preferences retain the form, camera, source scope, effects, and restored/expanded panel choice.
Existing v2 views migrate once to Constellation and refit without changing evidence.

The independent reference review returned `ship` and 9/10, recorded with its limits in [UI-REVIEW.md](UI-REVIEW.md).
Independent Standards and Spec confirmations report zero unresolved findings in [CODE-REVIEW.md](CODE-REVIEW.md).
Browser checks covered 1440×900 desktop and 390×844 mobile, stable role filtering and keyboard focus, hidden-navigation source selection, original relationship evidence, panel dismissal, actual 3D rotation, camera/panel restoration, and the retained Atlas index.
A resize-triggered fit now saves its final camera pose, and Glow off removes selected-particle effects in both reference forms and Atlas.
Mobile document dimensions remained 390×844, and warning/error logs were empty.

The current sample remains 30 projects, 287 sources, 920 chunks, and 437 recorded relationships, including ten research notes and 96 unfetched URL citation records.
The new workspace form shows all 181 sources, and the research form shows all 106 records; snapshots remain revision-pinned rather than live file monitors.
No other project was modified, no dependency was added, and fourteen scoped before-copies were SHA-256 verified under `data/reference-form/before`.
The pure reference geometry and separate DOM scene extend the existing projection/camera seam without restructuring the evidence catalog.
Affected design, specification, architecture, and usage documentation now describe the actual forms.

Final runtime verification passed 48 tests with 1,062 assertions and Windows x64 compilation.
Documentation checks passed across 34 active documents/tickets and 220 local links, with eighteen unique UI requirement IDs and no incomplete implementation tickets.
The compiled executable exported its embedded three-form viewer with only Windows System32 on PATH.
The regenerated standalone sample HTML also opened through `/saved` and displayed all 181 workspace sources.
Current preview: `http://127.0.0.1:4318/`; sample snapshot/HTML: `data/design-workspace/final`; executable: `dist/tomeowl.exe`.
The current verification record is `data/reference-form/verification.json`.
Dense-map pointing, very large corpora, cross-platform builds, and a full assistive-technology audit remain unmeasured; Explore and keyboard controls retain the complete evidence path.

## Earlier evidence atlas revision, 2026-10-03

This section records the previous grid-led revision; its rendering bounds and review result are historical for that form.

Delivered the bounded M1/E0 UI slice: Projects and Research lenses, grouped overview, source neighborhoods, readable evidence, relationship provenance, saved view profiles, and genuine optional 3D perspective.
The independent review reached 9/10 under the five-dimension rubric and returned `ship` for the three final visual corrections; this is a reviewer assessment, not a new user rating or measured accessibility certification.
The reviewed changes and limits are recorded in [UI-REVIEW.md](UI-REVIEW.md), with separate [Standards and Spec code review](CODE-REVIEW.md).

The local sample covers 30 of 30 discovered direct project directories, with 161 selected files, ten research notes, and 96 unfetched URL citation records.
It contains 287 sources, 920 chunks, and 437 recorded relationships, including generated inventory membership and quoted explicit references.
Projects and Research use the same source/revision/citation identities; visual groups and proximity do not create semantic links.
Coverage discloses global bounds, selected/discovered counts, and omissions per project.
Other projects were read without executing their code or changing their content.

The current preview is `http://127.0.0.1:4318/`, using `data/design-workspace/final/workspace.snapshot.json`.
The local sample's standalone viewer is `data/design-workspace/final/workspace.html`; `/saved` serves it and `/prototype` serves the separate three-composition study.
The fresh enriched snapshot preserves view-only roles and coverage; neutral CLI map export preserves evidence without reconstructing that metadata.
The compiled release is `dist/tomeowl.exe`.

The source tree remains one headless catalog/CLI and one authored viewer, with shared projection and tested pure placement seams.
Removed unused geometry/gesture paths and obsolete collection state rather than scaffolding empty packages or speculative adapters.
Updated the domain glossary, current spec, design tokens/sidecar, architecture, local decision map, and five implementation tickets.
Future literature screening/claim matrices, PDF/OCR, measurement/STDF analysis, program semantics, models, durable memory, and report adapters remain separate capability gates.

Final checks passed 36 tests with 219 assertions and Windows x64 compilation.
Documentation checks passed across 34 active documents and tickets with 192 local links, eighteen unique UI requirements, and no incomplete implementation tickets.
The compiled executable indexed two synthetic sources with two chunks and one reference, re-ingested them unchanged, retrieved `TMEASURE_42`, and exported JSON/HTML with Bun absent from its child PATH.
The generated verification record is `data/design-workspace/release-smoke/verification.json`.
The sandbox initially denied spawning the executable; approved execution completed the same local fixture check.
Offline HTML embeds the authored styles, script, and snapshot; no dependency, remote font, model download, or WebGL requirement was added.

Coordinator browser checks covered 1440×900 desktop and 390×844 mobile navigation, reference inspection, raw evidence, panel dismissal/focus return, true 3D rotation, saved camera/selection, keyboard-pan restoration, stable filtering, command selection, empty search, and zero-speed motion restart.
The final narrow-screen document remained 390×844 without document overflow, and browser warning/error logs were empty.
Reduced-motion and damaged-state recovery have focused fixture coverage; OS-level media preference emulation and a full assistive-technology/WCAG audit were not performed.
The Impeccable context/detector engine was unavailable, so the review used manual code and image evidence; its live design panel remains unverified.
SFX audibility, cross-platform builds, large-corpus performance, and a live human usability study remain unmeasured.

Source neighborhoods render at most 120 nodes; the research overview retains ten notes and twelve most-shared citation representatives so selection stays readable and stable.
All sample sources and relationships remain reachable through Explore and the evidence inspector, including records omitted from the spatial view.
Small-screen 2D Projects uses a scrolling named overview; desktop and 3D retain spatial project groups.
Snapshots retain the revisions captured during generation and do not silently check live file changes.
Bounds counters record discovery-pass events, which are not a unique count of final missing files; the additional research pass can include a document initially excluded by the per-project selection budget.
Because no Git repository is configured, the verified pre-change copies remain under `data/design-workspace/before` for recovery.

## Earlier implementation and research history

The following results describe earlier releases and research-only passes, not the current viewer's node bound or preview port.

## Preservation

The prototype was copied to `reference/prototype-v0` and all 619 original files were SHA-256 verified before the active files were cleared.
The archived manifest and original proof artifacts remain available locally.
The active implementation uses new modules and a new database rather than migrating the prototype's topic graph.

## Decisions

Use Bun 1.4.2 and SQLite FTS5 for the first Windows x64 release.
Keep canonical documents on disk and revisioned citations in the catalog.
Use bounded SVG rendering with an offline export rather than a desktop shell.
Keep qmd projection and Graphify validation optional and explicit.
Use GPT-6 Luna at xhigh for implementation and GPT-6.1 Sol at low reasoning for UI/UX review.

## Verification

The first compiled smoke run indexed 33 sources into 360 chunks from Viberaven captions and three project README files.
Repeating the same ingestion reported 33 unchanged sources and no duplicates.
The compiled executable retrieved the exact fixture identifier with revision and locator metadata using a child process PATH containing only Windows System32.
The citation fixture exported three sources and one explicit Markdown reference.
A first standalone HTML export and 33-file qmd projection completed successfully.
Final verification passed 24 tests with 249 assertions, followed by Windows x64 compilation.
The final executable exported the fixture viewer with Bun absent from the child process PATH.
The actual Tokenmill Graphify snapshot parsed in NetworkX `links` format and returned zero verified relations with 1113 provenance/path warnings; the output retained 100 warnings and reported omissions.
The GPT-6.1 Sol review is recorded in [UI-REVIEW.md](UI-REVIEW.md), including resolved rendering, revision wrapping, and label collisions.
Coordinator checks at 1280×720 and 390×844 found no horizontal or vertical document overflow after the camera fix.
The final mobile graph rendered 33 source nodes in a 674-pixel-high map rather than an expanding SVG container.
Mobile collection filtering and evidence dismissal, paused source pose, Glow, Orbit controls, and default-off SFX toggling were exercised without console errors.
SFX audibility and cross-platform executable targets were not independently measured.
Full orbit camera envelopes are covered by the geometry tests, and viewport changes trigger a refit.
The runnable preview remains at `http://127.0.0.1:4317/`; standalone output is `data/map.html` and the executable is `dist/tomeowl.exe`.

## Limits

This release does not claim semantic understanding, measured token savings, durable agent memory, or workplace approval.
Vanilla Graphify exports without source revision stamps cannot be promoted into verified relationships.
Graphify validation is read-only, and direct qmd retrieval remains a future adapter over the generated Markdown corpus.
Lexical search does not normalize aliases: `GBrain` does not match the caption spelling `G Brain` in the current corpus.
The initial viewer is bounded to 1000 spatial sources, and larger-scale performance remains unmeasured.
The sample corpus contains public captions and selected project documentation; semiconductor material is excluded.
Done: reference archive, current architecture/design/specification, modular implementation, compiled release, and bounded verification.
Recommended next slice: M1 of [the modernization specification](drafts/MODERNIZATION-SPEC.md), improving grouped navigation, colors, readable evidence, stable views, and personalization within the current viewer.
Retrieval evaluation, qmd connection, and accepted Graphify imports remain later work with separate evidence gates.

## Modernization research pass, 2026-10-02

Created a detailed future-release specification with requirement IDs, data contracts, migration/portability behavior, acceptance budgets, an ordered delivery plan, and a Codex/Claude task prompt.
Added a [current UX assessment](research/ux-assessment-2026-10-02.md), [backend/model/GraphRAG comparison](research/backend-options-2026-10-02.md), [UI/export research](research/ui-interoperability-2026-10-02.md), and [recent-practice coverage note](research/recent-practice-2026-10-02.md).
Reviewed current source and stored desktop evidence; no new live usability study or candidate performance benchmark was run.
The isolated last30days sweep completed through approved execution after a sandbox output-directory access failure, and its generated public report is preserved under `docs/research/raw`.
No runtime code, package dependency, model installation, database schema, or shipped feature changed in this pass.
The workspace has no Git repository, so document before-copies with matching hashes were retained under `data/research-session/docs-before`.
The documentation check found no broken local Markdown links across 17 active documentation files and no duplicate IDs among the 40 proposed requirements.
Runtime tests were not rerun because this pass changed documentation only; prior release verification above remains historical evidence.

## Engineering evidence research pass, 2026-10-03

Added a public [engineering platform research report](research/engineering-evidence-platform-2026-10-03.md) and [engineering evidence specification](drafts/ENGINEERING-EVIDENCE-SPEC.md).
The proposed use cases cover literature review, semiconductor measurement investigation, read-only program analytics, engineering documents, experiment comparison, and portable reporting.
The core direction retains SQLite evidence/FTS, with optional columnar analytics and bounded domain/model workers; no new graph/vector engine is required by default.
The frontend direction coordinates map, chart, table, document, and code views with meaningful grouping, stable selection, saved preferences, purposeful effects, and still/accessible alternatives.
Updated PRODUCT, DESIGN, architecture, README, and existing roadmap cross-references; M1 remains the recommended next implementation slice.
Public documentation describes reusable software workflows and excludes unrelated unpublished workspace references.
Verified seven affected public document before-copies by SHA-256 under the ignored local research-session directory because this workspace has no Git repository.
Primary sources were checked for current candidate capabilities, maintenance, licenses, and deployment limitations.
No runtime code, package dependencies, model assets, database schemas, or shipped capabilities changed, and no new candidate performance benchmark or live usability study was run.
The new capability requirements and performance budgets are proposals that need declared fixtures and target-environment verification.
Documentation checks passed across 19 active files and 111 local links, including both linked section anchors.
The new specification has 48 unique, sequential requirement IDs and one valid JSON contract example; its research report links 41 primary sources.
A targeted privacy scan of active documentation and source/reference text found no unrelated personal study identifiers or workspace links.
Runtime tests were not rerun for this documentation-only pass; existing release verification remains the historical baseline.
