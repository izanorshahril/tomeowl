# Tomeowl

Tomeowl is a local evidence workspace for an engineer working across repositories, technical research, documents, measurements, and program structure.
The current release retrieves a small, cited context packet and lets the engineer inspect how its sources relate.
The proposed product extends that task into a coordinated workbench for literature review, semiconductor measurement investigation, read-only test-program analytics, and traceable presentations.
Original files remain canonical; derived indexes and maps can be rebuilt.
Explicitly accepted memory is separately persisted in the catalog with its own lifecycle and retained supporting quotes, so it travels with catalog backups rather than being regenerated from source ingestion.

The first release targets Windows x64 with a compiled Bun CLI and SQLite.
Exported HTML works offline, without a desktop framework or background service.
The initial release exercised public video transcripts from Viberaven and selected project documentation.
The current evidence atlas adds a bounded read-only sample of all direct local development projects and this repository's research notes with recorded citation URLs.
Measurement datasets and program-analysis adapters are outside this release.

Retrieval, ingestion, provenance, and the interactive map are separate modules.
Native retrieval is the default product direction: Tomeowl owns its evidence catalog, keyword ranking, recorded relationships, and bounded cited results without requiring qmd or Graphify.
Improve that native path before adding a provider; optional retrieval, extraction, or model integrations must not become prerequisites for ordinary indexing, search, source lookup, or export.
The delivered [native query slice](docs/NATIVE-QUERIES.md) provides scoped literal search, recorded-link neighborhoods/paths, and compact context packets with source, chunk, and quoted-character budgets.
The [native retrieval decision](docs/research/native-retrieval-2026-10-04.md) distinguishes those capabilities from future optional semantics and extraction.
qmd and Graphify remain optional integrations with their own runtimes; GBrain is a design reference until a concrete interoperable format is verified.
No command silently starts a model, uploads content, or scans all projects.
The [directed video archive recipe](docs/VIDEO-GRAPH.md) supplies a separate media snapshot with channel/video identities, sibling description/transcript passages, timestamped citations, and explicit lexical overlap.
This media snapshot defaults to its own Directed map and preference key while existing workspace snapshots retain the frozen UI direction.
The [native capability release](docs/CAPABILITIES.md) adds portable collection identities, explicit accepted-memory writes/correction/forgetting, bounded JS/TS module maps, structural status and verified backup/restore.
Automatic memory admission, semantic recall, full symbol/call extraction and harness writeback remain later capabilities.

The previous implementation is historical material under [reference/prototype-v0](reference/prototype-v0/README.md).
The active requirements and implementation status live in [docs/SPEC.md](docs/SPEC.md).

## Current evidence atlas

The viewer provides Projects and Research lenses, Constellation/Orbital/Atlas graph forms, source neighborhoods, readable revisioned evidence, and optional 3D perspective.
Stable categorical colors, layer navigation, an accessible source list, and Engineer/Presentation/High contrast profiles support the same evidence model.
The default Command center frames the graph with Workspace pulse, App manifests, Source layers, Research connections, Skills deck, and Snapshot coverage.
These sections use whole-snapshot counts and open actual sources, filters, or coverage; app manifests and skill documents are inspectable inventory rather than running capabilities.
Research connections rank distinct recorded citation URLs and show shared URLs across notes without inferring similarity or agreement.
The Map surface retains the larger canvas and saved expanded/restored panel choice.
Dashboard sections follow the graph on narrow screens, while Atlas's mobile 2D Projects overview retains its named scrolling index.
Constellation and Orbital render up to 400 actual source particles; Atlas retains its smaller spatial and shared-citation representative bounds, with the complete list and inspector in every form.
Ambient motion works in 2D and 3D and has a visible Pause/Resume action, zero-speed still option, and reduced-motion/High contrast support.
Movement pauses for selected, hovered, or keyboard-focused map targets, during dragging, and while the page is hidden.
Interruptible scene transitions and drag-release feedback communicate interaction while preserving evidence and the final camera pose.
Validated v4 view preferences save surface, scope, camera, effects, and layout; valid older preferences migrate into the requested command-center presentation once.
URL records disclose that their external content has not been fetched.
The user's latest assessment of the reference-form build is 7/10; the command-center revision does not establish a replacement user score.
The [implementation status](docs/STATUS.md) and [independent UI review](docs/UI-REVIEW.md) distinguish delivery evidence from future capabilities.
Future internal apps and Power BI reports should consume versioned projections rather than the viewer or private database schema.
The [modernization specification](docs/drafts/MODERNIZATION-SPEC.md) turns these goals into staged requirements without making a model, graph server, or corporate rollout part of the current release.

## Broader public engineering workflows

Documents, numerical observations, and program definitions should share scope, identities, revision lineage, and evidence references while retaining domain-specific parsing and analysis.
The [engineering evidence specification](docs/drafts/ENGINEERING-EVIDENCE-SPEC.md) defines literature screening and claim matrices, cohort/distribution review, program definition/diff analysis, experiment comparison, and portable reporting.
Evidence Map, Measure Lab, Program Atlas, and Review Desk are proposed task surfaces over the same evidence contracts.
Selecting a chart population should connect to a unit table, reviewed definition, source span, and supporting document without losing scope or revision context.

The proposed default retains SQLite for evidence and lexical retrieval, adds optional columnar analytics for measurements, and keeps parsers/models/graph engines behind bounded capability gates.
The [engineering platform research](docs/research/engineering-evidence-platform-2026-10-03.md) records candidate capabilities, packaging uncertainties, and validation experiments.
Public code, docs, and fixtures describe reusable workflows; user and organization content stays in separately configured local workspaces.
The bounded M1/E0 atlas slice is delivered; complete literature, measurement, and program workflows require their separate capability gates.
