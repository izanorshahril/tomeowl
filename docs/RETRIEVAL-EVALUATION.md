# Native retrieval evaluation

Tomeowl has a repeatable evaluation over its existing research notes, plus focused regressions for excerpt selection.
The frozen viewer is unchanged and native retrieval still needs no qmd, Graphify, model or service.
This development helper requires the project's pinned Bun 1.4.2; ordinary compiled CLI retrieval remains standalone.

## Run it

From the repository root, choose a fresh output filename:

```powershell
bun run eval:retrieval --out data/retrieval-run.json
bun run eval:retrieval --out data/retrieval-custom.json --cases tests/fixtures/retrieval-eval/research-cases.json --iterations 3
```

Omit `--out` to write the complete compact JSON report to stdout.
An existing output file is refused, and errors go to stderr with a nonzero exit code.
Evidence-integrity or budget failures also produce a nonzero exit; labeled retrieval misses remain measurements rather than automatic release failures.
The helper builds an in-memory catalog from `docs/research`, including its raw note, without reading or changing a saved catalog or the viewer.
Incomplete ingestion, missing evidence anchors, or corpus/implementation changes during the run fail explicitly.
Suite files are limited to 1 MiB, 64 cases and 16 anchors per case; warm repetitions allow 1-10.

## What is measured

The [manual suite](../tests/fixtures/retrieval-eval/research-cases.json) contains 14 questions selected independently of retrieval runs, with 14 exact evidence anchors in 13 labeled cases and one checked no-answer case.
These are partial relevance labels: unlisted results are unjudged, so the report does not call them irrelevant or claim precision.
Source recall counts distinct labeled paths reached within the first 5 or 10 returned chunks; repeated-source chunks retain their actual ranks.
Anchor recall requires the full annotated quote in a returned search chunk, while context coverage requires it in the emitted passage.
Reciprocal rank and macro means exclude cases with no evidence labels, whose retrieval emptiness is reported separately.
Diagnostics distinguish missing sources, missing support chunks, clipped support and annotations spanning chunk boundaries.
Citation checks validate current source/chunk/revision, original literal quote membership, contained locator coordinates and exact UTF-16 offsets when present.
Packet checks include declared source membership, requested limits, counters and the complete UTF-8 success envelope plus newline.
These checks establish indexed citation authenticity, not factual truth, exact occurrence on a repeated narrowed line or model-answer entailment.

The fixed profile returns 10 search chunks and context with 20 candidates, 8 sources, 12 chunks, 1,600 quoted UTF-16 units, 12,000 response bytes and depth 1.
Reports record suite/corpus hashes, all source revisions, implementation hashes, Bun/SQLite versions and that profile.
Compare runs only with identical suite, corpus and profile; implementation fingerprints identify the change under test.
Timings separate first queries after ingestion from per-case warmed repetitions in an in-memory database.
They are neither disk cold-start timings nor a production latency benchmark, and their small-sample p95 is descriptive.

## Recorded result, 2026-10-04

The unchanged corpus contains 13 notes and 123 chunks.

| Check | Before | After |
|---|---|---|
| Macro labeled-source Recall@5 | 100% | 100% |
| Macro exact-anchor Recall@5 | 92.3% | 92.3% |
| Context evidence anchors fully retained | 10/14 | 11/14 |
| Targeted actual-match excerpt regressions | 0/4 | 4/4 |
| Invalid citations or response budgets | 0 | 0 |

Native FTS5 match spans now anchor phrase excerpts; all/any excerpts prefer windows covering distinct literal query groups.
Quotes remain original-body slices, overlapping groups retain their full covered span, and internal match metadata does not enter public JSON.
Literal highlight-marker collisions use an approximate Unicode token fallback; native ranking and tokenizer behavior remain unchanged.
Tiny budgets may still clip a phrase and are disclosed rather than fabricating complete evidence.

Three annotated spans remain uncovered: two supporting chunks are omitted by the bounded packet selection, and one vocabulary-shift question does not retrieve the annotated chunk.
The checked no-answer query returns empty search and context, which is not a generated-answer abstention guarantee.
The next quality gate is packet chunk diversity/selection on an expanded independent suite; optional semantic retrieval should be assessed against the remaining vocabulary gaps before adding a provider.
This small, project-specific evaluation does not establish general RAG quality, multilingual segmentation coverage or a numerical UI score.

The [verification record](../data/retrieval-evaluation-2026-10-04/verification.json) links paired reports, regression evidence, compilation and the frozen-viewer hash check.
