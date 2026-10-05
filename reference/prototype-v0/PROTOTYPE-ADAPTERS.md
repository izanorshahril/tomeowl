# Prototype adapter feasibility

Research date: 2026-10-01. Read-only local inspection plus official project documentation. No packages were installed and no indexes, databases, transcripts, or graph artifacts were modified.

This describes the feasibility investigation before implementation.
Current prototype status and exercised adapters are recorded in [README.md](README.md) and [PLAN.md](PLAN.md); the prototype subsequently created a Tomeowl-local qmd index and imported an explicitly stale Graphify snapshot.

## Local findings

| Tool | Local resolution and state | Useful offline interface | Conclusion |
|---|---|---|---|
| QMD | `qmd.exe` resolves at `C:\Users\izanorshahril\.bun\bin\qmd.exe`; version 2.8.3. `bun.exe` resolves from the same directory; version 1.4.2. Running from `D:\Dev\tokenmill` selects its project-local `.qmd\index.sqlite` (5.2 MB, 40 docs, 42 vectors, 16 pending). The existing `viberaven` collection resolves to `D:\Dev\viberaven`, mask `**/*.md`; it uses the user-cache index (10 Markdown files, zero vectors). No project-local `.qmd` directory was found in Viberaven. | `qmd search ... --format json` is local BM25 and requires no model; `qmd query ... --format json` is hybrid search and may need local model files. `qmd mcp` is also available. | Best existing text-search adapter. Create a Viberaven-local QMD index and index a Markdown/text projection of transcript segments; the current collection ignores the transcript files. QMD supports project-local indexes and collection masks. [QMD CLI](https://github.com/tobi/qmd), [formats](https://github.com/tobi/qmd/blob/main/README.md). |
| GBrain | `gbrain` does not resolve on `PATH`; no local GBrain project was found under `D:\Dev`. The Bun global package query was denied by filesystem access controls, so no package-cache claim is made. | Official docs support local PGLite initialization with `gbrain init --pglite --no-embedding`, and JSON outputs from `gbrain remember ... --json` and `gbrain recall <entity> --json`. Basic local memory reads/writes can be keyless; semantic/synthesis/model features are separately configured. PGLite permits only one owning process at a time. [CLI setup](https://github.com/garrytan/gbrain/blob/master/docs/tutorials/connect-coding-agent.md), [keyless setup](https://github.com/garrytan/gbrain/blob/master/docs/guides/in-agent-setup.md). | Keep optional and process-isolated. GBrain can own agent memory, but it introduces a second database engine and is not the transcript/document search index. Do not start parallel CLI/MCP processes against one local brain. |
| Graphify | `graphify` does not resolve on `PATH`; no `.graphify_python` launcher is present in the inspected artifact. `D:\Dev\tokenmill\graphify-out\graph.json` does exist (289 nodes, 824 links; nodes/edges carry source locations and relation/confidence metadata). Its `.graphify_root` points to `C:\Work\Project_Personal\tokenmill`, so this graph's checkout provenance is stale for the current `D:\Dev\tokenmill` path. | Graphify documents deterministic BFS/DFS over an existing JSON graph and machine-readable output; code AST updates can run without an LLM. Graphify's question matcher uses case-folded substring + IDF, with no synonym or semantic expansion. [Query reference](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/skills/agents/references/query.md), [CLI/source](https://github.com/Graphify-Labs/graphify). | Read a verified `graph.json` export directly for the prototype, but treat this local graph as stale until regenerated. It adds code structure; transcript relations should be modeled separately and linked to timestamped evidence segments. |
| Viberaven corpus | `D:\Dev\viberaven\transcripts\manifest.sqlite3` exists. Project documentation says the archive currently tracks channels/videos and hashes, without caption payloads; it proposes immutable transcript artifacts and timestamped segment rows as a later extension. SQLite open through Bun was blocked (`SQLITE_CANTOPEN`), so table counts and live schema were not independently verified. [Import/schema guide](../viberaven/docs/agents/transcript-sqlite-import.md). | Existing source artifacts include `transcript.json`, `.srt`, and timestamped/plain `.txt` under `transcripts/<channel>/<video-id>/`. The guide prefers JSON as the raw source, with ordered segment rows derived from it. | Strong local test corpus for provenance and relation visualization. Model relations with evidence pointers to `video_id`, artifact revision/hash, `segment_id`, ordinal, and time span. Store entity/relation confidence and source; do not infer a relation from co-mention alone. |

## Cheapest adapter boundary

Use child processes with argument arrays and JSON stdout as the initial integration contract; avoid linking QMD or GBrain internals into Tomeowl. QMD is already runnable, GBrain is an optional CLI adapter, and Graphify's JSON is its portable hand-off artifact. Normalize each result into `{source, locator, text, score, provenance}` and deduplicate by stable source ID. For `gbrain serve` or large exports, use one bounded process per operation and clear failure/timeout reporting.

Keep transcript segments in Viberaven's SQLite model as the source of truth. QMD should index only a derived text view for recall; graph nodes and edges should point back to segment IDs and timestamps. That lets a standalone viewer show the citation/evidence beside an edge instead of presenting an unsupported semantic association as fact.

## Bun and standalone HTML

Bun 1.4.2 is installed. Its official docs support compiling a self-contained Windows x64 executable; `bun:sqlite` is built in and Bun statically links its own SQLite build on Windows and Linux. Produce one binary per OS/architecture and keep user data outside the executable. [Windows executable targets](https://bun.sh/docs/bundler/executables), [SQLite runtime](https://bun.sh/docs/runtime/sqlite).

Suggested Windows build shape after prototype review:

```powershell
bun build .\src\cli.ts --compile --target=bun-windows-x64 --outfile .\dist\tomeowl.exe
```

Candidate adapter commands for a later, approved prototype step (none were run here):

Run the QMD initialization and collection commands from `D:\Dev\viberaven` so they select the new project-local index.

```powershell
qmd init
```

```powershell
qmd collection add D:\Dev\viberaven\transcripts --name viberaven-transcripts --mask "**/*.txt"
```

```powershell
qmd search "transcript topic" --format json --full-path -c viberaven-transcripts
```

```powershell
gbrain init --pglite --no-embedding
```

The transcript collection should ultimately point at timestamp-preserving derived segment text rather than every redundant `.txt` sidecar. The initial mask is only a CLI-shape example; finalize source projection and collection path before adding it.

For the visualization, have the CLI emit a self-contained HTML file with an embedded, size-bounded JSON snapshot. This works when opened directly with `file://` and avoids a local server, browser CORS problems, and a second deployment artifact. The embedded snapshot can include QMD hits, GBrain facts, and verified graph neighborhoods, while preserving exact source links/locators. The executable can optionally launch the default browser; the HTML remains usable on its own.

The Bun executable alone will not make external tools disappear: QMD, GBrain, and Graphify remain optional subprocess dependencies. Add a `doctor` command that reports found/missing tools, versions, selected index/store paths, and whether the project graph matches the current checkout. Do not embed QMD's SQLite database or ship a graph snapshot until it has been regenerated against the current path.

## Recommended first slice

1. Use QMD `search --format json` for exact transcript/document recall, without model downloads. Add a dedicated Viberaven-local index over a generated `.md`/`.txt` segment view after review.
2. Treat Graphify as a static graph-file adapter; regenerate the current project graph before trusting its paths. Keep transcript entity/relation graph construction tied to Viberaven segment provenance.
3. Support GBrain through a documented optional CLI adapter, but omit it from the first runnable prototype until the user chooses local memory initialization. It adds value for durable agent facts, not raw segment search.
4. Build the demo HTML from a generated JSON bundle and open it as a file. Use the Viberaven video → transcript artifact → segment → entity/relation chain as the first relation view.

No prototype source code has been created in this research step.
