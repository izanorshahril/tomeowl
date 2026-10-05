# Native retrieval with optional integrations

Checked 2026-10-04 against the local implementation and primary upstream documentation.
The user's adopted direction makes Tomeowl's native evidence retrieval and recorded-reference graph the primary path, with qmd, Graphify, and model workers as explicit optional capabilities.
The frozen frontend and existing snapshot contract need no change for this direction.

## Shipped capability

[The package manifest](../../package.json) declares no external package dependencies and pins Bun 1.4.2 for development.
[The store](../../src/store.ts) uses built-in `bun:sqlite`, probes FTS5, and keeps sources, revisioned chunks, and evidence-bearing relationships in SQLite.
[Native retrieval](../../src/retrieval.ts) delegates directly to `searchStore`; it does not call qmd or Graphify.
Search quotes literal letter/number/underscore query terms, defaults to OR, also supports explicit all-term/phrase matching, ranks chunk-body matches with BM25, and returns source/chunk IDs, revision, path, collection, quote, and locator.
Exact collection and file/subtree scopes apply before limiting results.
Search limits are 1-1,000 results; the query is matched against the indexed revision, rather than checking the live file on every search.
[Source details](../../src/store.ts) accepts source or chunk IDs and reports whether the original file differs from its indexed revision.
[The CLI](../../src/cli.ts) ships `search`, `show`/`get`, `map`, offline `export`, and the optional loopback `/api/search` endpoint.

[Ingestion](../../src/ingest.ts) already indexes supported documentation, configuration, source-code text, and caption JSON from explicit local roots.
It extracts local Markdown references to other indexed sources and retains the referring passage and line locator.
Indexing a code file as text does not extract its AST, definitions, calls, or language-resolved dependencies.
[Snapshot generation](../../src/store.ts) exports recorded relations with evidence that still matches indexed chunks and revisions.
The viewer's shortest-path traversal remains presentation behavior; the new headless graph module separately queries bounded current indexed evidence without changing the UI.

## What the optional tools add

| Capability | Native Tomeowl today | Optional extension |
| --- | --- | --- |
| Keyword evidence retrieval | FTS5/BM25 with revisioned citations | qmd is unnecessary for this baseline |
| Paraphrase/cross-language retrieval | No embedding, query expansion, or model reranking | Evaluated embedding worker or qmd adapter |
| Recorded source graph | Explicit references, cited bounded neighbors/paths, and compact context expansion | Optional extractors can add richer candidates after provenance validation |
| Code/concept extraction | Raw text and local Markdown references | Graphify or a narrowly scoped syntax/model adapter |

SQLite FTS5 provides full-text search, BM25 ranking, phrase, prefix, proximity, and boolean query facilities.
These facilities leave room for native lexical improvements, although Tomeowl currently exposes literal any-term search rather than all FTS syntax.
They do not supply embedding-based semantic retrieval. [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html)

qmd combines lexical search with optional model-assisted retrieval paths including vectors, query expansion, and reranking.
Its model paths add local GGUF artifacts and inference infrastructure; those are distinct from keyword search. [qmd official README](https://github.com/tobi/qmd#readme)
Graphify provides local tree-sitter AST extraction, graph traversal, and separate semantic passes for other material, with a Python runtime.
Its capabilities are broader than Tomeowl's current reference graph. [Graphify official README](https://github.com/Graphify-Labs/graphify#readme)

[The existing qmd adapter](../../src/adapters/qmd.ts) only projects citation-bearing Markdown.
[Graphify validation](../../src/graphify-validation.ts) validates bounded candidate files without persisting accepted edges.
Neither is a live retrieval or extraction dependency today.

## Accepted native slice

Build a headless native evidence-query slice over the existing store: apply collection/path scope before search or traversal, expose bounded neighbors and shortest recorded-reference paths, and assemble citation-bearing context packets with explicit source/result/character budgets and truncation status.
This accepted slice is now implemented by `search`, `neighbors`, `path`, and `context`; the [native query guide](../NATIVE-QUERIES.md) defines the actual flags, bounds, and limitations.
Keep lexical ranking and graph distance separate, and explain which recorded path contributed each additional source.
Evaluate exact identifiers, vocabulary matches, paraphrases, disconnected sources, revisions, and scope leakage on a fixed query set before adding semantic machinery.
Use the existing SQLite relations for the initial graph query; adopt another graph/vector engine only after a measured requirement.
Embeddings may remove the need for qmd, but still require an explicit model and inference runtime; removing an external CLI does not remove that compute requirement.

The [architecture deferred seam](../ARCHITECTURE.md#deferred-seams) now keeps native retrieval primary and treats qmd as one optional provider after a demonstrated recall gap.
The [implementation sequence](../IMPLEMENTATION.md) and [current specification](../SPEC.md) record this direction explicitly; earlier [backend research](backend-options-2026-10-02.md) supports the embedded lexical baseline and optional integrations.

## Native CLI smoke proof

The existing compiled executable indexed three task-owned synthetic Markdown files with only Windows System32 on its temporary PATH.
An identifier query returned one passage with source/chunk IDs, revision, quote, and line locator; lookup of that exact chunk returned `stale: false`.
Snapshot export retained one explicit Markdown reference with evidence, without invoking qmd or Graphify.
A two-term query returned either-term matches in two documents, and the paraphrase query returned zero results.
The [machine-readable proof](../../data/native-retrieval-2026-10-04/verification.json) confirms current functionality and its lexical limit, rather than semantic retrieval quality.

## Verification limits

This note records source inspection, a synthetic compiled CLI smoke proof, and current upstream documentation, not a new implementation or comparative retrieval benchmark.
No external tool was installed or executed, no model was downloaded, and no local corpus was sent to a remote service.
Native semantic retrieval and full qmd/Graphify feature parity remain unimplemented or unverified.
The native query release's compiled CLI and review proof is recorded separately under `data/native-query-release` and in [STATUS.md](../STATUS.md).
