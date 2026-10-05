# Frozen UI baseline and CLI rebuild

Baseline: `ui-2026-10-04`, frozen at the user's request on 2026-10-04.
The authored UI/UX is the accepted working direction for subsequent data and backend work.
This freeze does not assign a new score; the user's latest numerical rating remains 7/10.

## What is frozen

Preserve the existing dark canvas, role palette, typography, command center with six dashboard sections, Map surface, Projects and Research lenses, Constellation and Orbital forms, retained Atlas and legacy source circle, and optional 3D perspective.
Preserve the 0–100% motion-speed control, glow, drag and scene effects, reading holds, reduced-motion/High contrast behavior, progressive relationship focus, Show all nodes, evidence inspection, keyboard navigation, and responsive layout.
Source data can change without redesigning the frontend.
Further visual or interaction changes require a subsequent user request.
The subsequent 2026-10-05 request authorizes the [Directed video graph](VIDEO-GRAPH.md) as a media-only form and metadata extension; captured baseline artifacts remain unchanged.
The design authority is [DESIGN.md](../DESIGN.md), the implemented contracts are in [SPEC.md](SPEC.md), and previous review results and limits remain in [UI-REVIEW.md](UI-REVIEW.md).

The local freeze directory is `data/ui-freeze-2026-10-04`.
Its `manifest.json` records SHA-256 hashes and the captured viewer source identity.
Its `tomeowl-source.zip` contains authored source, scripts, tests, documentation, and design references, excluding the local corpus, executable, and old prototype.
Its `viewer/workspace.html` and `viewer/workspace.snapshot.json` preserve the exact sample input and standalone application; `runtime/tomeowl.exe` preserves the Windows x64 release.
The snapshot and HTML contain local paths and source excerpts, so carry them as local work data separately from the reusable software.
The reference capture is illustrative; saved browser preferences, viewport, selected source, and ambient animation phase are not embedded in the HTML.
This is a source/content freeze, not a promise of byte-identical executables or pixel-identical rendering on every OS and browser.

## Rebuild the current sample with only CLI commands

Use Bun 1.4.2 already available on the build machine.
This baseline has no external package dependencies or lockfile, so no package installation is needed.
Run these PowerShell commands from the source root:

```powershell
Set-Location D:\Dev\tomeowl
bun --version
bun run check
bun run build
bun run snapshot:export --snapshot data/ui-freeze-2026-10-04/viewer/workspace.snapshot.json --out data/workspace-rebuilt.html
bun scripts/preview-workspace.ts --snapshot data/ui-freeze-2026-10-04/viewer/workspace.snapshot.json --html data/workspace-rebuilt.html --port 4319
```

The foreground preview reports its loopback URL as JSON.
Open `http://127.0.0.1:4319/` for the rebuilt renderer or `/saved` for the generated HTML, and stop the process with Ctrl+C.
Building and exporting are headless; inspecting the frontend still uses a browser.
The `snapshot:export` helper is a Bun script, not a subcommand in the compiled executable.
It retains enriched metadata, bounds JSON input to 16 MiB, and rejects an output with the same resolved or canonical path as the input snapshot.

## Rebuild from the archive

Copy the source archive to the destination and expand it into an empty destination folder.
For example, on Windows:

```powershell
Expand-Archive -LiteralPath D:\Transfer\tomeowl-source.zip -DestinationPath D:\Tools\tomeowl-ui
Set-Location D:\Tools\tomeowl-ui
bun --version
bun run check
bun run build
```

The archive expands with `package.json`, `src`, and `scripts` directly under the destination.
For the same sample, copy the separate frozen JSON to `D:\Work\workspace.snapshot.json`, then render it:

```powershell
bun run snapshot:export --snapshot D:/Work/workspace.snapshot.json --out D:/Work/workspace.html
```

For another machine's project inventory, provide that machine's explicit root and a project beneath it whose `docs/research` should supplement the scan:

```powershell
bun run viewer:build
bun run sample:workspace --dev-root D:/Work --project-root D:/Work/my-project --out data/my-workspace-001
bun scripts/preview-workspace.ts --snapshot data/my-workspace-001/workspace.snapshot.json --port 4319
```

Use a fresh output directory for each new sample because the recipe refuses an existing database or records directory.
The recipe treats immediate subdirectories of `--dev-root` as projects and scans bounded documentation and manifests rather than every file.
`--project-root` identifies the additional research input; it does not identify the Tomeowl source checkout.
The default bounds and omissions remain documented in [README.md](../README.md).

## Use the existing runtime without Bun

An exported `workspace.html` carries its data, CSS, and JavaScript and opens offline without installing Bun, qmd, Graphify, a model, or a server.
Copy `runtime/tomeowl.exe` for ordinary indexing, keyword retrieval, catalog export, and loopback serving on another Windows x64 machine:

```powershell
D:\Tools\tomeowl.exe ingest --db D:/Work/evidence.sqlite --root D:/Work/my-project/docs --limit 200
D:\Tools\tomeowl.exe export --db D:/Work/evidence.sqlite --out D:/Work/evidence.html
```

These catalog commands use the same UI but do not automatically reconstruct the enriched project's layers, literature lens, project grouping, and scan coverage.
Use the sample recipe or a custom enriched snapshot for that presentation.
The compiled executable bundles its runtime; its build target is Windows x64.
The current `.exe` cannot run on macOS/Linux, and other OS/architecture builds remain unverified.
The source renderer and standalone HTML are the reuse paths for those environments, subject to target-machine verification.

## Reuse the frontend for other work

Keep one authored renderer and provide a per-work snapshot adapter.
The existing seam is [renderSnapshot](../src/viewer/export.ts), with the input contract in [viewer/types.ts](../src/viewer/types.ts).
Copying the whole `src/viewer` directory retains its internal modules, CSS, build entry, camera, motion, evidence inspector, and dashboard.
Its browser modules do not import the SQLite store, CLI, qmd, or Graphify.
The bundle is generated locally with `bun src/viewer/build.ts` and embedded by `renderSnapshot` into a standalone HTML application.
Use the `snapshot:export` helper when the source checkout is available; embedding in another application can call the same renderer.
The current title and navigation copy identify Tomeowl; product-specific branding is a separate requested adaptation, not an already-built generic template API.

| Snapshot field | Purpose |
| --- | --- |
| `schemaVersion: 1`, `generatedAt`, `stats` | Version and captured source/chunk/relation counts. |
| `sources` | Stable IDs, titles, paths, collections, kinds, revisions, chunk counts, and available excerpts/locators. |
| `relations` | Actual source/target IDs, typed link basis, and traceable evidence. |
| Source `layer`, `corpus`, `projectId` | Role bands, workspace/literature separation, and project membership. |
| `sample.projects`, `sample.scan` | Workspace inventory and the coverage dashboard. |

Populate counts and relationships from the actual work; spatial proximity is visual organization and must not invent evidence.
The renderer performs top-level snapshot checks, while the TypeScript contract defines the complete expected shape.
Custom adapters must produce valid source identities, relation endpoints, and evidence records; it is not a general external-graph importer.
Reference forms display at most 400 source particles per scope; Explore and evidence remain available for records outside that spatial bound.
Re-ingesting moved files changes source IDs because the current catalog hashes absolute paths.
For a new machine, rebuild from its roots rather than treating a copied database as incremental synchronization.
The frozen snapshot retains captured excerpts; it is not a full backup of every original source file.

Preferences use browser-local `tomeowl.display.v4` and stay with that browser origin.
A new origin or machine uses the existing default Constellation/2D command center with glow and permitted motion enabled; choose Orbital, speed, and other preferences locally if desired.
The exact selected source, camera, pause, and viewport from a reference screenshot do not travel with the HTML.

## Optional tools

| Tool | Needed for this UI? | Separate reason to add it |
| --- | --- | --- |
| Bun 1.4.2 | For building source and the sample/export scripts. | Compile the viewer and target-specific CLI. |
| Browser | For viewing HTML. | Inspect the map and evidence. |
| qmd | No. | Optional hybrid/semantic Markdown retrieval after a measured need. |
| Graphify | No. | Optional richer code/concept extraction after a measured need. |
| Design skills or visual editor | No. | Future design work; they are not application dependencies. |

Tomeowl's `project` command only emits Markdown for qmd; live qmd retrieval is not integrated.
`validate-graphify` reports candidate provenance and warnings read-only; persisting those candidates is not implemented.
Neither tool is required to draw relationships already recorded in the snapshot.
The [dated primary-source research](research/cli-portability-2026-10-04.md) records their upstream capabilities and additional runtimes/models.

## Verification

The freeze's machine-readable verification is `data/ui-freeze-2026-10-04/verification.json`.
It records source identity checks, archive reconstruction, the exact-snapshot HTML comparison, runtime help, automated checks, and documentation validation.
The completed check passed 74 tests with 1,371 assertions, and Windows x64 compilation passed.
Rendering the frozen JSON through the new helper produced a 732,545-byte HTML file with the same SHA-256 as the frozen sample.
Independent review confirmed the documented CLI recipes and the helper's enriched metadata preservation.
Cross-platform executable runtime, large-corpus performance, and full assistive-technology certification remain unverified.
