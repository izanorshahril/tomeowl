# CLI portability and optional graph tools

Checked 2026-10-04 against the local implementation and primary upstream documentation.
Recommendation: preserve Tomeowl's authored viewer and use its CLI and snapshot format for repeatable builds; add external tools only when their retrieval or extraction capabilities are required.

## Implemented locally

- [package.json](../../package.json) pins Bun 1.4.2, declares no external package dependencies, and builds a Windows x64 executable after generating the browser bundle.
- [The viewer build](../../src/viewer/build.ts) bundles the existing browser application; [the CLI](../../src/cli.ts) imports its HTML renderer and offers ingestion, search, snapshot JSON, offline HTML export, and loopback serving.
- [The qmd adapter](../../src/adapters/qmd.ts) projects current source chunks into Markdown with IDs, revisions, and evidence locations; it does not run qmd or provide its semantic search.
- [Graphify validation](../../src/graphify-validation.ts) bounds input and validates candidate relations against indexed source evidence; `validate-graphify` returns a report and does not persist those relations.
- [The workspace sampler](../../scripts/workspace-sample.ts) supplies project, layer, and literature metadata that the full command-center example needs.
  Ordinary ingestion and export use the same viewer but do not recreate that sample metadata automatically.

These are repository facts, rather than claims that upstream tools are installed or integrated.

## Optional upstream capabilities

| Tool | Purpose | When it becomes useful here |
| --- | --- | --- |
| qmd | On-device Markdown search combining BM25, vector retrieval, and model reranking; available as CLI, MCP, and SDK. | Add when keyword retrieval is insufficient; it is unnecessary for drawing or exporting the present UI. |
| Graphify | Builds queryable code/concept graphs with AST extraction and HTML/JSON outputs. | Add when richer code relationships or semantic extraction are required; its graph requires a validated Tomeowl ingestion path to appear in this viewer. |

qmd's model-assisted paths use local GGUF models downloaded on first use, so plan separate runtime/model preparation for offline operation.
Its configuration and index are independent of Tomeowl's SQLite catalog.
See [qmd's official README](https://github.com/tobi/qmd#readme).

Graphify requires Python 3.10+; its official package is `graphifyy`, while the CLI is `graphify`.
Code AST extraction is local; semantic extraction of other materials uses the assistant or a configured model backend, including a local Ollama option.
This is additional extraction infrastructure, rather than a frontend dependency.
See [Graphify's official README](https://github.com/Graphify-Labs/graphify#readme).

## Portability recommendation

Keep three delivery modes distinct: an exported HTML file for viewing a frozen dataset, a target-specific compiled executable for indexing/exporting new work, and a source checkout with the pinned Bun runner for development.
Reuse the authored viewer against new valid snapshots instead of reconstructing the design from prompts.
If the destination needs the layered project/literature presentation, carry or regenerate its sample metadata too.

Bun documents that standalone executables include imported code and the Bun runtime, and supports `--target` builds for Windows, Linux, and macOS on supported architectures.
An existing Windows x64 binary is not a cross-platform binary.
See [Bun's standalone executable documentation](https://bun.sh/docs/bundler/executables).

## Limits and unverified results

No qmd or Graphify installation, model download, integration run, or remote data transmission was performed for this investigation.
Upstream documentation describes capabilities, not acceptance evidence on this machine or the future destination machine.
Tomeowl's other-OS builds and runtime behavior need target-machine smoke tests before release.
The current workspace corpus is a bounded representative sample, not a complete machine inventory or semantic literature-review graph.
