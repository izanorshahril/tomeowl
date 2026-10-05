# Tomeowl architecture research

Checked 2026-10-02 against upstream Bun, SQLite, QMD, and Graphify documentation. This note narrows the earlier multi-store proposal in [RESEARCH.md](../../reference/prototype-v0/RESEARCH.md) to a first architecture that can ship and be replaced incrementally.

## Recommendation

Build Tomeowl first as a Bun/TypeScript command-line tool with one SQLite database for application metadata and a rebuildable FTS5 retrieval index. Keep original files and user-authored Markdown as the canonical content on disk. Store paths, hashes, locators, and extracted text needed for search in SQLite, but make every result resolve back to its source. This gives the first release one runtime, one database, no server, and no mandatory model download.

Bun documents a standalone `--compile` executable that bundles the application and Bun runtime, with explicit Windows, macOS, Linux, architecture, and Linux libc targets; ship a build per supported target rather than promising one executable for every OS. Bun also has a synchronous built-in SQLite driver. SQLite documents its database file as cross-platform, but journal/WAL sidecars are part of live transaction recovery, so copying a database must happen after closing/checkpointing it or while preserving its companion files. [Bun executable targets](https://bun.sh/docs/bundler/executables), [Bun SQLite](https://bun.sh/docs/runtime/sqlite), [SQLite cross-platform format](https://www.sqlite.org/onefile.html), [SQLite file format and journals](https://sqlite.org/fileformat.html)

## Boundaries

1. **Canonical content:** retain original imported files in place by default; if Tomeowl copies or creates content, put it in a user-visible project data directory in ordinary Markdown/text formats. Never make an index row the only copy of user content.
2. **Ingestion:** convert supported inputs into text plus stable source locators. Record source path/URI, content hash or source revision, extractor and version, and a locator such as page, section, line, or byte range. Mark extraction failures and unsupported formats instead of silently treating partial text as complete.
3. **Retrieval:** expose a small internal contract that accepts a query and scope and returns ranked snippets with source IDs and locators. Start with FTS5/BM25 and exact identifier matching; avoid a custom ranking framework until a fixed query set shows a gap.
4. **Evidence:** keep evidence references separate from generated answers. A returned answer should cite the snippet's source and locator; graph or semantic relationships must carry their own provenance and an `extracted` versus `inferred` label. Never turn a retrieval score or inferred edge into a source fact.
5. **Index lifecycle:** make the SQLite index disposable and rebuildable from canonical sources. Persist its schema/version and source hashes, and provide explicit `index`, `search`, `show`/`get`, and `doctor` commands with JSON output for automation.

SQLite FTS5 is a virtual-table full-text search module, but Bun's `bun:sqlite` guide does not promise FTS5 support in every shipped build. Probe it by creating a temporary FTS5 virtual table at startup/diagnostics and report a clear error or documented fallback if unavailable; do not adopt native extensions as a portability shortcut. [SQLite FTS5](https://www.sqlite.org/fts5.html), [Bun SQLite](https://bun.sh/docs/runtime/sqlite)

## Optional integrations

- **QMD:** treat as an optional retrieval adapter behind the query/result contract, or a separately selected search engine. Its upstream CLI/library already combines FTS5, vectors, and local reranking; it owns its own SQLite schema and indexes Markdown collections. Do not write Tomeowl's canonical data into QMD tables. QMD requires Node 22+ or Bun, and its default embedding, reranking, and query-expansion models download on first use (roughly 2 GB combined), so semantic mode is not a zero-download/offline baseline. Keep keyword search independently useful. [QMD README](https://github.com/tobi/qmd)
- **Graphify:** treat generated graph files as optional derived ingestion output, not as Tomeowl's primary database. Its code-only extraction uses local tree-sitter parsing, while documents and media may take a semantic pass using a model backend. It is distributed as the `graphifyy` Python package and requires Python 3.10+; optional format extras add more runtime and dependency surface. Consume its source references and extracted/inferred edge labels if adopted, and revalidate paths against current source files. [Graphify README](https://github.com/Graphify-Labs/graphify)

## First implementation slice

1. Build `tomeowl` for Windows x64 first, with Bun and built-in SQLite; keep the database and all paths configurable and relative paths normalized at the filesystem boundary.
2. Index Markdown and plain text only, preserving file hash plus heading/line or byte locators; add FTS5 search and a source-show command that opens the canonical file and returns the cited range.
3. Emit stable JSON records containing query, source path, locator, excerpt, and rank; keep terminal output readable and deterministic.
4. Add a small fixed retrieval corpus with exact identifiers, duplicate filenames, changed files, and missing sources; use it to compare FTS5 against optional QMD before enabling any semantic index.
5. Add Graphify ingestion only when a concrete code-graph query cannot be answered through source search; keep it a separate command/import path.

## Limits to resolve during implementation

- Bun's docs establish compile targets and a SQLite API, but do not establish FTS5 presence across all targets; verify the exact pinned Bun release and each shipped binary.
- Standalone executables are target-specific. Windows, macOS, glibc Linux, musl Linux, and architectures need separate build and smoke-test artifacts as supported.
- A single SQLite file is portable at rest; concurrent writers, live WAL copying, network filesystems, permissions, and locked files still need explicit handling appropriate to the supported OSes.
- QMD's first-use model download and native vector dependencies can conflict with strict offline or self-contained deployment; keep that mode opt-in and report its storage/runtime needs.
- Graphify's broad file-format coverage does not by itself prove domain-specific understanding of proprietary tester programs, datalogs, or schematics. Preserve page/table/row identifiers and typed units for those formats if that scope is later added.

## Background retained from prior notes

The earlier notes correctly identify QMD as hybrid local retrieval and Graphify as optional graph extraction, but their proposed Rust binary plus separate relational, vector, graph, and blob stores, automatic hooks, and consolidation routines are design hypotheses rather than demonstrated requirements. The video/token-saving claims remain unverified benchmarks; evaluate retrieval quality, exact-identifier recall, citation correctness, disk use, and latency on a fixed corpus before adding complexity. See [RESEARCH-BASELINE.md](../../reference/prototype-v0/RESEARCH-BASELINE.md), [RESEARCH-INGESTION.md](../../reference/prototype-v0/RESEARCH-INGESTION.md), and [RESEARCH.md](../../reference/prototype-v0/RESEARCH.md).

