# Native knowledgebase, RAG, memory and module maps

The compiled CLI now supports portable collection ingestion, improved cited packets, explicit accepted memory, a JS/TS module map, catalog status and verified backup/restore.
No qmd, Graphify, embedding runtime, generator, framework, package install or running service is required.
The UI remains frozen as `ui-2026-10-04` and consumes the existing version-1 snapshot.
These capabilities extend the [native query guide](NATIVE-QUERIES.md); the [capability review](drafts/MEMORY-RAG-KB-REPOMAP-REVIEW.md) records their motivation and broader future work.

## Portable collections

Start with a fresh catalog and the [example manifest](../examples/collections.json):

```powershell
bun run build
.\dist\tomeowl.exe ingest --manifest examples/collections.json --db data/knowledge.sqlite --limit 200
.\dist\tomeowl.exe status --db data/knowledge.sqlite
```

A manifest has `schemaVersion: 1` and 1-64 collections with stable `id`, display `name` and directory `root`.
Relative roots resolve against the manifest's directory.
IDs contain 1-200 ASCII letters/digits/dots/underscores/hyphens and begin with a letter or digit; names contain 1-200 characters.
The manifest file is bounded to 1 MiB.
Do not combine `--manifest` and `--root`.

Portable source IDs derive from collection ID and its relative logical path, with ASCII case folded consistently across machines.
The content revision and chunk ordinal still determine chunk IDs.
Changing only the root binding preserves source/chunk/link IDs for unchanged content, including a rebuild into another catalog.
Distinct collection IDs keep identical relative paths in different projects separate.
Case-colliding logical paths, overlapping ownership, duplicate collection IDs/roots and an already indexed incompatible physical path fail rather than silently merging evidence.
Legacy `--root` catalogs keep their absolute-path identities; this release does not migrate them into portable identities or preserve identity after a file rename.

Single-file ingestion updates only that file and retains its indexed owner, including an existing portable collection.
A directory scan prunes unseen sources only when the whole observed scope is complete with no skipped entries.
An authoritative empty directory reconciles the last deletion.
Bounded or skipped scans preserve unseen evidence and return `coverage` counts for complete scopes, partial scopes, file selections and unvisited roots.
All source/chunk/FTS/relationship changes in one ingest commit atomically.
After a partial root rebind some captured records can retain old physical paths until a complete scan; omissions remain visible.
The manifest is the explicit root-binding configuration and must travel with the catalog.

## Retrieval for RAG

```powershell
.\dist\tomeowl.exe context --db data/knowledge.sqlite --collection research --query "FTS5 evidence" --max-chars 1500 --max-bytes 8000 --depth 1
```

Context selects distinct source hits before extra chunks from the same source, with a fair initial quote allocation.
Linked sources prefer a query-matching chunk; an introductory fallback is labeled `selection: first-chunk`.
Keyword and graph-origin passages remain distinguishable, and graph distance is separate from keyword score.
Query-centered excerpts retain source/revision/chunk IDs, exact chunk-relative UTF-16 `excerpt.start`/`excerpt.end` offsets and adjusted line locators.
Native FTS5 spans now anchor actual phrase matches; all/any excerpts favor nearby distinct query groups rather than an early isolated mention.
Overlapping groups retain their covered span, with original-body quotes and no internal highlight metadata in public JSON.
Literal marker collisions use an approximate Unicode token fallback, and tiny budgets may still clip matching text with disclosed truncation.
Transcript timestamp ranges remain the captured chunk range rather than invented word timestamps.

`--max-chars` limits quoted UTF-16 characters, including relationship quotes.
`--max-bytes` defaults to 65,536 and allows 512-1,048,576 bytes.
It limits the complete compact UTF-8 CLI JSON response, including `{ok:true}`, metadata, omissions, `used.bytes` and the final newline.
If the query/scope/envelope alone cannot fit, the command fails with `OUTPUT_BUDGET_TOO_SMALL`.
Neither limit claims an exact model-token budget.
The consumer supplies generation if needed; Tomeowl does not generate answers or verify a model's answer entailment.

Graph and snapshot evidence now requires a nonempty literal quote in the referenced current chunk and contained, typed line/time coordinates.
Invalid earlier citations are skipped in favor of a valid alternate.
This verifies quote membership and coordinate containment at the chunk level; it does not prove occurrence on a particular narrowed line when the same text repeats, word-level timing, or assertion truth.
Endpoint indexes support native adjacency; the [project research-note evaluation](RETRIEVAL-EVALUATION.md) measures exact labeled evidence coverage, without claiming general retrieval quality or production latency.

`show` retains its `stale` field and adds `freshnessReason`: `current`, `changed`, `missing`, `unreadable`, `symlink`, `not-regular-file`, `size-limit`, or `changed-during-check`.
Original verification rejects detected symlink paths/ancestors and nonregular files and reads at most 2 MiB plus one byte.
Search/context still operate on explicitly labeled indexed revisions, without checking every original.
`status` reports structural counts and bounded collection groups, not a persisted scan history or a live freshness audit.

## Explicit memory

```powershell
.\dist\tomeowl.exe memory add --db data/knowledge.sqlite --namespace project:tomeowl --id retrieval-policy --kind decision --text "Use native SQLite retrieval by default." --author owner
.\dist\tomeowl.exe memory recall --db data/knowledge.sqlite --namespace project:tomeowl --query SQLite
.\dist\tomeowl.exe memory correct --db data/knowledge.sqlite --namespace project:tomeowl --id retrieval-policy --replacement-id retrieval-policy-v2 --kind decision --text "Keep native retrieval primary and integrations optional." --author owner
.\dist\tomeowl.exe memory show --db data/knowledge.sqlite --namespace project:tomeowl --id retrieval-policy
```

Namespaces are required and match exactly; they select memory scope rather than provide authorization.
Kinds are `fact`, `preference`, `decision`, and `procedure`.
Records retain explicit author/origin, timestamps, status, optional `expiresAt`, supersession and captured evidence.
CLI additions have origin `authored`; a caller-supplied ID makes matching retries idempotent and conflicting payloads fail.
Correction creates an active successor and preserves its superseded predecessor transactionally.
Recall defaults to active, unexpired records; use `--status all` and `--include-expired true` deliberately for history.
Literal recall is case-sensitive substring matching, not BM25 or semantic memory ranking.
Contradictory authored records remain separate; there is no automatic conflict resolution or transcript-to-memory promotion.

Optional `--evidence-chunk CHUNK_ID --evidence-quote TEXT` captures one CLI citation from a current indexed chunk.
The module supports up to eight citations.
The quote, source, revision and chunk are verified, then quote/locator/source metadata is retained in the memory record independently of replaceable source chunks.
Captured evidence survives later source changes or deletion and is available through `memory show`, not historical ordinary `show` lookups.
`basis: cited` identifies verified provenance; it does not establish that the assertion follows from the quote.
The assertion text allows 8,000 characters, each citation quote 4,000, namespace/ID/author/origin 256, and timestamp/locator fields are validated.

`memory recall` defaults to 20 records and 65,536 serialized bytes, with ranges 1-100 records and 2,048-1,048,576 bytes.
It returns whole records within the CLI JSON/newline budget and reports omissions.
`memory retract` excludes an active assertion from default recall without removing its history.
`memory forget --namespace NAME --id ID` logically deletes the connected supersession history and its captured quotes, bounded to 1,000 records; `--history false` deletes only that record.
The result lists deleted IDs and evidence-copy counts under `scope: memory-records-only`.
Forgetting does not delete original documents, earlier exports or backups, and does not promise forensic erasure of SQLite pages.
Explicit later admission is possible; no automatic importer recreates forgotten memory.

Memory tables initialize only on an explicit write and have their own schema version 1 alongside the unchanged source schema version 1.
Old catalogs return empty memory recall without writes; read commands open the catalog read-only.

## Native module map

```powershell
.\dist\tomeowl.exe repomap --db data/knowledge.sqlite --collection code --query contextPacket --limit 20 --max-bytes 16000
```

The result is `kind: module-map`, containing indexed JS/TS files, exported names and syntax imports.
It uses the embedded Bun scanner and captured indexed chunks, without executing source files or fetching imports.
Path/title and lexical source hits influence selection before the file cap; selected modules then rank by a simple inventory-match signal.
`relevance` is a heuristic count, not confidence or calibrated semantic similarity.
Indexed relative targets follow explicit-file and common extension/index conventions within the requested scope; aliases/packages remain unresolved.
Targets can be indexed but omitted from the returned file list by budget.
Type-only imports/exports, symbol/signature spans and runtime call resolution are explicitly omitted.
This is a first module-map capability, not a complete language-resolved symbol repomap.

Supported extensions are `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs`.
Default file/byte limits are 100 and 65,536, with ranges 1-500 and 512-1,048,576.
Input is capped at 2 MiB/2,000 chunks per file and 8 MiB across selected files.
Ambiguous reconstruction from split long lines, parser errors and input/output cutoffs disclose status/omissions instead of inventing structure.
Chunk IDs and revision ground each scanned file; individual symbol/import spans are not claimed.
Generated bundles can consequently appear as unsupported reconstruction, while authored modules remain available.
Optional richer parsers and semantic ranking stay future capabilities.

## Backup, restore and another machine

```powershell
.\dist\tomeowl.exe backup --db data/knowledge.sqlite --manifest examples/collections.json --out data/knowledge-backup
.\dist\tomeowl.exe restore --from data/knowledge-backup --db data/restored.sqlite
```

Backup requires an empty output directory and snapshots all catalog tables, including accepted memory and captured evidence, through SQLite `VACUUM INTO`.
The bundle contains `catalog.sqlite`, checksum/size metadata in `backup.json`, and optional `collections.json` with resolved root bindings.
Catalogs are capped at 256 MiB for this workflow; checksums stream through a fixed buffer.
Committed WAL content, integrity and restore equivalence are covered by synthetic tests.
The choice follows [SQLite's consistent-copy interface](https://sqlite.org/backup.html), with the actual read-only Bun path tested locally.

Restore verifies checksum/version/integrity and requires a fresh database destination without existing `-wal`, `-shm`, `-journal` or collection-manifest files.
It never removes unrelated sidecars or replaces an existing catalog.
Optional collection configuration restores beside the database as `DATABASE.collections.json`.
Original source documents are not included.
Move the source folders separately, edit restored collection roots, and reingest that manifest to rebind unchanged logical identities.
Memory quotes remain available even before originals are restored.

For the same frozen frontend elsewhere, reuse the [CLI/UI baseline guide](UI-BASELINE.md) and source, or export an offline HTML file.
The supplied executable targets Windows x64; another platform requires compiling its own target.
No new provider, parser package, model download or background service is required.
