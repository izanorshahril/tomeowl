# Tomeowl

A local CLI for revisioned source evidence, compact retrieval, and offline knowledge maps.
The current UI/UX is frozen as baseline `ui-2026-10-04`; the [CLI rebuild and reuse guide](docs/UI-BASELINE.md) records its archive, commands, data contract, and portability limits.
The [native capability guide](docs/CAPABILITIES.md) covers portable collections, improved RAG packets, explicit accepted memory, JS/TS module maps, catalog status and backup/restore.
The [retrieval evaluation guide](docs/RETRIEVAL-EVALUATION.md) records the research-note benchmark and the repeatable `bun run eval:retrieval` command.
The current viewer offers a command center with six real-data dashboard sections around Constellation role clouds, Orbital concentric source bands, and an Atlas project overview.
Projects and Research share located evidence, animated 2D and optional 3D perspectives, and a separate Map surface for a larger canvas.
The user's current assessment of the reference-form build is 7/10; review and verification results for the command-center revision are recorded separately in [UI-REVIEW.md](docs/UI-REVIEW.md).
The proposed product direction is a portable engineering evidence workbench connecting literature, documents, measurements, and program structure through traceable evidence and coordinated views.
The former implementation is frozen under [reference/prototype-v0](reference/prototype-v0/README.md).
This root contains a new implementation built around the [architecture](docs/ARCHITECTURE.md), [specification](docs/SPEC.md), and [implementation sequence](docs/IMPLEMENTATION.md).

```text
src/
  domain.ts          Source, revision, citation, snapshot contracts
  store.ts           SQLite catalog, FTS5, transactions
  ingest.ts          Explicit-root discovery and parsers
  retrieval.ts       Bounded evidence retrieval
  query-scope.ts     Shared exact collection and file/subtree scopes
  graph-query.ts     Bounded cited neighborhoods and paths
  context-query.ts   Quote/source/chunk-budgeted context packets
  excerpt.ts         Query-centered located evidence windows
  evidence-query.ts  Shared quote and coordinate validation
  collection-manifest.ts  Portable logical identities and root configuration
  memory.ts          Explicit accepted assertions and lifecycle
  repomap.ts         Bounded native JS/TS module inventory
  catalog-backup.ts  Consistent snapshot, restore and status
  cli.ts             JSON commands and loopback preview
  cli-guards.ts      Read-only and projection output guards
  graphify-validation.ts  Bounded validation against current source revisions
  adapters/          Video archives, qmd projection, Graphify provenance validation
  viewer/            Shared projection, pure placement/motion, camera, dashboard, evidence UI, offline export
scripts/             Local corpus imports, bounded samples, evaluation recipes
tests/               Behavioral tests and small cited fixtures
docs/                Current decisions, specification, research, verification
  drafts/            Proposed future capability requirements
reference/           Frozen prototype and original research
data/                Generated local catalog and exports
.scratch/            Local one-file-per-slice implementation tickets
CONTEXT.md           Domain glossary
```

Development requires Bun 1.4.2 and no additional packages.
There are no external dependencies or lockfile to install in this baseline.
Build the authored browser bundle and Windows x64 executable:

```powershell
bun run build
```

Run the release checks:

```powershell
bun run check
```

Index only selected local roots, for example the project's research documentation:

```powershell
.\dist\tomeowl.exe ingest --db data\tomeowl.sqlite --root docs\research --root PRODUCT.md --limit 100
```

Retrieve a bounded evidence packet:

```powershell
.\dist\tomeowl.exe search --db data\tomeowl.sqlite --query "qmd graphify" --limit 5
```

Export a standalone viewer:

```powershell
.\dist\tomeowl.exe export --db data\tomeowl.sqlite --out data\map.html
```

Open the loopback preview at `http://127.0.0.1:4317/`:

```powershell
.\dist\tomeowl.exe serve --db data\tomeowl.sqlite --port 4317
```

The executable includes its runtime and viewer assets; Bun is required only for development.
qmd and Graphify remain optional and retain their own runtime requirements.
Tomeowl's own SQLite FTS5/BM25 passage retrieval already runs without either tool and returns revisioned quotes and line/time citations as bounded JSON.
Native retrieval is the default: scoped any/all/phrase search, cited graph neighborhoods/paths, and budgeted context packets are delivered in the [native query guide](docs/NATIVE-QUERIES.md).
The [capability decision](docs/research/native-retrieval-2026-10-04.md) separates these native features from future optional semantic and code-AST extraction.
The [memory, RAG, knowledgebase and repomap review](docs/drafts/MEMORY-RAG-KB-REPOMAP-REVIEW.md) assesses these uses, records reproduced catalog defects, and prioritizes the next native slices; its proposals are not shipped capabilities.
`project --out DIRECTORY` writes a fresh Markdown corpus for qmd and refuses nonempty output directories.
`validate-graphify --file PATH` reports current, cited candidate relationships and warnings without modifying the catalog.
Unversioned Graphify output is reported as unverified rather than silently imported.
The map displays real sources and recorded relationships; role frames, concentric tracks, spokes, and collection membership describe visual organization.
Constellation is the default graph form; the main switch also offers Orbital and Atlas in both 2D and 3D.
Reference forms render up to 400 actual source particles, while Atlas retains its smaller spatial and research-representative policy.
The viewer starts in Command center, where Workspace pulse, App manifests, Source layers, Research connections, Skills deck, and Snapshot coverage frame the graph.
Dashboard inventory counts describe the whole snapshot; graph counts describe the current corpus and filter.
Manifest, research, and skill rows open actual source evidence, and layer actions switch to the appropriate corpus rather than launching applications or skills.
Research rows rank distinct recorded citation URLs and disclose which URLs occur in another note; URL content has not been fetched.
Map opens the larger canvas; Restore panels returns its ordinary shell, and Explore/Evidence retain source access in both surfaces.
The surface and expanded/restored Map preference survive reloads, and display reset preserves those layout choices.
Below 900px, dashboard sections follow the graph in the page; below 740px, the two dashboard rails become one vertical stack.
Ambient motion works in 2D and 3D, with visible Pause/Resume and Motion speed controls.
The primary speed slider runs from Still at 0% to the existing pace at 100%, allowing fractional slower movement without exceeding that pace; its Display counterpart stays synchronized.
Changing to a positive speed resumes eligible motion, while selection, reading, and still overrides retain their pause behavior.
Selection, source hover or keyboard focus, dragging, hidden pages, reduced motion, and High contrast keep the map still while reading or targeting.
Form, corpus, layer, neighborhood, and dimension changes use interruptible 250ms scene transitions; drag feedback settles over 180ms without moving the final camera pose.
Orbital's inner-role labels use dashed organizational leaders to external callouts; the particles remain in their actual role bands.
The legacy Source circle remains in Display.
Preferences use `tomeowl.display.v4`; valid v3/v2 views migrate once into the animated command center and refit while retaining graph form and scope, subject to reduced-motion and High contrast overrides.
Saved v4 pauses and zero speed remain still on reload; restored speeds are bounded by the existing pace, and sound starts off.
The primary Glow toggle and Display's Graph glow control add role-colored particle bloom, source-layer auras, and warm central illumination independently of motion.
Glow off and High contrast remove that illumination, while decorative light proxies remain noninteractive and outside the evidence model.
Selecting a source keeps it bright and progressively fades other particles by shortest undirected distance through actual links in the complete current corpus/neighborhood.
Query and layer filters do not erase hidden intermediate sources from that distance calculation, and bloom follows the same particle emphasis.
Selected relationships keep both endpoints bright; distant particles remain reachable through hover, keyboard focus, Explore, and their evidence.
Show all nodes removes this selection emphasis while preserving the current filters and camera.
Research-source jumps retain the full Research lens, including its citation records, so the selected note's recorded connections remain visible.
Current verification and limitations are recorded in [docs/STATUS.md](docs/STATUS.md).
The relationship-focus check passes 70 tests with 1,353 assertions, Windows compilation, and compiled export with Bun absent from PATH.
Desktop/mobile checks cover progressive fading, actual source selection, reset with the camera preserved, keyboard reveal, and full Research citation context.
The preceding refinements' build, export, and independent review evidence remain recorded in that status.
Measurement/STDF ingestion, program analytics, semantic ranking, full symbol/call maps, and bidirectional harness updates have not been delivered by this release.
Explicit accepted-memory writes are available through the CLI; they do not change the frozen viewer.

Build a fresh sample atlas from the explicitly selected local development root and this project's research documents:

```powershell
bun run sample:workspace --dev-root D:/Dev --project-root D:/Dev/tomeowl --out data/design-workspace-next
```

The recipe creates `workspace.sqlite`, `workspace.snapshot.json`, `workspace.scan.json`, `workspace.html`, and generated project/citation records in the output directory.
It refuses an existing sample database or records directory; use a fresh output such as `--out data/design-workspace-next` for a rebuild.
`--html false` skips the HTML export.
It reads selected documentation without running another project's scripts and reports discovered projects, selected sources, partial coverage, skips, and bounds.
Default bounds are depth 4, 10 selected documents/manifests per project, 32 additional research files, 96 citation records, 256 KiB per file, and 8 MiB of selected source bytes, with bounded directory/entry discovery.
Generated project inventory describes observed structure, and URL-only citation records are unfetched metadata rather than paper findings.
Bounds counters describe scan-pass events; research supplementation can later include a file initially excluded by the project budget, so use selected/discovered counts to assess final coverage.
Local inventory, project names, source content, and before-copies belong in generated data rather than public software fixtures.

Preview the enriched sample snapshot through a foreground loopback-only process:

```powershell
bun run viewer:build
bun scripts/preview-workspace.ts --snapshot data/design-workspace/final/workspace.snapshot.json --port 4318
```

Open `http://127.0.0.1:4318/` for the current authored viewer, `/api/map` for the snapshot JSON, `/saved` for the saved HTML, or `/prototype` for the throwaway composition study.
Rebuild and restart the preview after changing viewer source.
The preview rereads data, accepts GET requests only, and bounds snapshot input to 16 MiB; it does not run ingestion or change the catalog.
The reviewed local sample is under `data/design-workspace/final`; substitute a newly generated snapshot path when rebuilding the sample.
Its enriched roles and coverage are view metadata; a neutral catalog `map` export retains evidence but does not reconstruct that sample metadata.

Rebuild a standalone HTML file directly from the enriched snapshot without re-ingestion:

```powershell
bun run snapshot:export --snapshot data/design-workspace/final/workspace.snapshot.json --out data/workspace-rebuilt.html
```

This source-run helper keeps project, layer, research, and coverage metadata, bounds its input to 16 MiB, and refuses to overwrite the input snapshot.
It uses the same frozen renderer; it is not a new compiled executable subcommand.

Regenerate the separate three-direction composition study:

```powershell
bun run prototype:ui data/design-workspace/final/workspace.snapshot.json
```

The initial atlas was selected autonomously from the spatial atlas, reading desk, and layer stack under the user's authorization.
The user's subsequent reference-form correction made Constellation and Orbital the primary graph forms while retaining that atlas.
The production viewer uses its own modules; the study is retained as a local design decision artifact.
The [cluster](reference/visual-direction/rubric-clusters.png), [Rings](reference/visual-direction/rubric-rings.png), and [Agentic OS arms](reference/visual-direction/agentic-os-arms.png) images specify source-cloud and concentric-band geometry.
The [command-center reference](reference/visual-direction/rubric-command-center.png) supplies the divided dashboard rails around a dominant graph; their content comes from the actual local snapshot.

The [current UI specification](docs/SPEC.md#ui-design-slice-2026-10-03), [direction decision map](docs/decisions/ui-direction/MAP.md), and [completed local tracer bullets](.scratch/ui-direction/README.md) document this slice and its lean scaffold.
The [graph UI research](docs/research/graph-ui-direction-2026-10-03.md) records overview/evidence navigation, accessible drag alternatives, and the reasons to keep a 2D reading path alongside optional 3D.
Delivery, review results, and remaining limitations are recorded in [the status](docs/STATUS.md) and [UI review](docs/UI-REVIEW.md).

The public [engineering evidence specification](docs/drafts/ENGINEERING-EVIDENCE-SPEC.md) defines broader use cases, evidence/locator contracts, linked graph/chart/table/source interactions, capability gates, and acceptance fixtures.
The dated [engineering platform research](docs/research/engineering-evidence-platform-2026-10-03.md) compares optional analytics, document/program parsers, graph/vector engines, interactive frontend references, and portable exports.
User data and organization-specific configuration belong in separate local workspaces; the public product does not include their content.

The proposed multi-mode product direction is a review draft in [docs/drafts/PLATFORM-VISION.md](docs/drafts/PLATFORM-VISION.md), supported by the dated [platform landscape research](docs/research/platform-landscape-2026-10-02.md).
The detailed [modernization specification](docs/drafts/MODERNIZATION-SPEC.md) prioritizes a grouped, layered, personalizable command center, followed by optional semantic navigation and portable reporting.
It includes requirements, data contracts, staged acceptance gates, and a bounded Codex/Claude implementation prompt.
The [current UX assessment](docs/research/ux-assessment-2026-10-02.md), [backend/model comparison](docs/research/backend-options-2026-10-02.md), [UI/Power BI research](docs/research/ui-interoperability-2026-10-02.md), and [recent-practice evidence](docs/research/recent-practice-2026-10-02.md) explain the recommendations and their limits.
Semantic inference, embeddings, full literature-review workflows, and BI adapters remain future-release proposals.
The current UI slice executes the bounded M1/E0 design direction; broader capabilities are delivered through separate evidence gates rather than one backend rebuild.

The [benchmark guide](docs/BENCHMARKS.md) provides isolated CLI comparisons with QMD and Graphify, plus a foreground browser experiment against Three.js and Cytoscape.js.
It records frozen corpora, version pins, raw timings and limits; no model or renderer migration is part of these experiments.
## Directed video archive sample

The [Viberaven graph recipe](docs/VIDEO-GRAPH.md) builds channel → video → description/transcript passages with directed ownership, timestamped evidence, and labelled text-overlap links.
Run `bun run sample:videos --root D:/Dev/viberaven/transcripts --out data/viberaven-demo-002 --channels 4 --videos-per-channel 2` to create a new offline catalog, enriched snapshot, HTML viewer, and optional QMD Markdown projection.

For the complete SQLite archive, use the [full-library recipe](docs/VIDEO-GRAPH.md#full-library-from-sqlite).
It indexes every admitted video into a disk-backed catalog, reconciles raw descriptions and transcripts, and exports bounded views through the same viewer.

```powershell
bun run library:videos import --database D:/Dev/viberaven/transcripts/manifest.sqlite3 --root D:/Dev/viberaven/transcripts --out data/viberaven-library-001
bun src/cli.ts search --db data/viberaven-library-001/videos.sqlite --query embeddings --limit 5
bun run library:videos export --database data/viberaven-library-001/videos.sqlite --out data/viberaven-library-view-001 --video-id nX0fgBL3sIM
```

The full catalog and coverage report remain separate from the bounded graph view.
The media import/export recipes require Bun; the compiled executable can search and retrieve their generated catalog.
No QMD, Graphify, embedding model, or service is required.
