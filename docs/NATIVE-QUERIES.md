# Native evidence queries

Tomeowl owns keyword retrieval, scoped recorded-link traversal, and bounded cited context assembly.
These commands need only the compiled Windows x64 executable and an existing catalog; qmd, Graphify, models, and graph services are optional.
The frozen UI and version-1 source catalog/snapshot contract are unchanged; optional accepted memory has a separately initialized versioned table contract described in the [capability guide](CAPABILITIES.md).

## Search

```powershell
.\dist\tomeowl.exe search --db data/evidence.sqlite --query "thermal drift" --match phrase --collection research --path docs/research --limit 5
```

`--match any` is the backward-compatible default and matches any literal query term.
`--match all` requires every term in a chunk; `--match phrase` requires the ordered token sequence.
Quotes, operators, punctuation, and wildcard syntax in the query are treated as literal token input rather than executable FTS syntax.
Phrase matching uses SQLite tokenization rather than byte-exact punctuation matching.
Bounded excerpts use actual native match spans and preserve original text; all/any windows favor distinct nearby query groups.
The [evaluation guide](RETRIEVAL-EVALUATION.md) records the exact research-note profile, partial manual labels and remaining misses.
Queries allow at most 2,000 UTF-16 characters and 64 extracted terms; `--limit` allows 1–1,000 results.
Results retain BM25-derived keyword score, source and chunk IDs, path, collection, indexed revision, quote, and line/time locator.

Optional scope combines an exact, case-sensitive collection name with an exact source path or directory subtree.
Relative paths resolve against the command's working directory; subtree matching respects directory boundaries and treats `%`/`_` literally.
Scopes are applied before ranking and traversal rather than filtering a previously limited response.
Windows normalizes separators and ASCII letter case; exact accented path spelling works, while non-ASCII case variants remain distinct.
Scope matching does not require the original file to exist.
The existing loopback `/api/search` accepts `match`, `collection`, and `path` query parameters with the same semantics.
The viewer's title/path filter remains a separate frozen interaction.

## Recorded-link graph

Use source IDs returned by search or `map`:

```powershell
.\dist\tomeowl.exe neighbors --db data/evidence.sqlite --id SOURCE_ID --depth 2 --limit 100 --max-edges 500
.\dist\tomeowl.exe path --db data/evidence.sqlite --from SOURCE_ID --to OTHER_SOURCE_ID --depth 6 --limit 100 --max-edges 500
```

`SOURCE_ID` and `OTHER_SOURCE_ID` are placeholders for actual catalog source IDs; chunk IDs are used by `show`, not these graph commands.
Both commands accept `--collection` and `--path` scope.
Traversal treats recorded relationships as undirected for reachability while retaining each edge's original direction, kind, basis, and evidence.
It does not infer dependencies or create links from spatial proximity.
Both endpoints and the supporting citation source must be in scope.
Evidence must match a current indexed source/chunk/revision, quote literal text within that chunk, and contain typed line/time coordinates within the chunk's locator; malformed, dangling, or unsupported evidence cannot ground a returned edge.
This validates chunk membership and coordinate containment rather than occurrence on a specific narrowed line or assertion entailment.
An unknown or out-of-scope endpoint returns structured `NOT_FOUND` and exits nonzero.

Neighborhoods return source metadata, actual relations, shortest hop distances within explored bounds, and relation-ID paths explaining how each source was reached.
The source limit includes roots and visited nodes; the edge limit bounds retained relations and each adjacency read.
Default neighborhood depth is 1 and path depth is 6; allowed depth is 0–8, sources 1–1,000, and edges 1–5,000.
Each edge contains one current scoped citation with a quote capped at 300 UTF-16 characters, and omissions disclose additional citations or quote clipping.
Depth, source, or edge cutoffs set `truncated` and explain the limit.

| Path status | Meaning |
| --- | --- |
| `found` | A valid cited path was found; `shortest: true` guarantees the scoped shortest path, while `false` means earlier traversal limits prevent that guarantee. |
| `not-found` | Exhaustive traversal found no path in the valid scoped indexed graph. |
| `truncated` | No path was found within the limits; this does not establish absence. |

Found path responses contain only the selected path's sources and edges, plus any traversal-limit disclosure.
A hop count and lexical score describe different signals and are never combined into an invented confidence score.
Returned material is bounded and writable opens maintain source/target endpoint indexes; wall time on very large catalogs remains a measured future gate.

## Compact context packets

```powershell
.\dist\tomeowl.exe context --db data/evidence.sqlite --query "thermal drift" --match all --path docs/research --limit 20 --max-sources 8 --max-chunks 12 --max-chars 12000 --max-bytes 65536 --depth 1
```

The context command uses native keyword matches as seeds and optionally adds passages from sources reached through recorded links.
`--depth 0` returns keyword passages without graph expansion; context allows depth 0–3.
Keyword passages retain their ranking under `keywordScore`; link-expanded passages use `keywordScore: null`, a hop distance, and actual `via` relation IDs.
The packet includes every retained path relation and supporting source metadata so its added material remains traceable.
Passage and relation identities are deduplicated.
Candidate selection covers distinct matching sources before their additional chunks, with fair first-pass quote allocation.
Link-expanded excerpts prefer a query-matching chunk and label any introductory first-chunk fallback through `selection`.

| Budget | Default | Allowed range |
| --- | --- | --- |
| Keyword candidates, `--limit` | 20 | 1–100 |
| Unique cited sources, `--max-sources` | 8 | 1–64 |
| Unique cited chunks, `--max-chunks` | 12 | 1–128 |
| Quoted UTF-16 characters, `--max-chars` | 12,000 | 1–64,000 |
| Complete serialized UTF-8 response bytes, `--max-bytes` | 65,536 | 512–1,048,576 |

Source and chunk budgets include supporting relationship citations, even when that supporting chunk is not a displayed passage.
The character budget counts all returned passage quotes and relation-evidence quotes, including repeated text; it does not count JSON metadata or claim a model-token estimate.
Query-centered clipping preserves revision/chunk identity, reports exact chunk-relative `excerpt.start`/`excerpt.end` offsets, adjusts line locators, and marks `quoteTruncated`; it does not split UTF-16 surrogate pairs.
Transcript timestamps retain the captured chunk's range.
`used` reports sources, unique cited chunks, displayed passages, quoted characters and complete serialized bytes, including the CLI success envelope and final newline.
Metadata and late omissions also fit the byte limit; an impossible envelope fails with `OUTPUT_BUDGET_TOO_SMALL`.
`truncated` and `omissions` explain candidate, source, chunk, quote, or graph cutoffs.
Graph expansion also has internal 100-source/500-edge discovery caps; the packet's final output budgets still apply.
The packet's `freshness: indexed-revisions` describes captured catalog content; use `show --id CHUNK_ID` for bounded original-file verification and its structured `freshnessReason`.

## Operation and limits

Search, neighbors, path, and context open the catalog read-only and do not start a provider, modify sources, or write inferred relationships.
They return compact JSON on stdout, structured errors on stderr, and nonzero exit status on invalid input.
There is no schema migration or new package dependency for this slice.
Semantic/paraphrase search, AST extraction, and model reranking remain future optional capabilities.
The [architecture](ARCHITECTURE.md), [current specification](SPEC.md), and [native retrieval decision](research/native-retrieval-2026-10-04.md) record this boundary.
