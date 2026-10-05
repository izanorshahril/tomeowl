# Recent-practice research and evidence boundary

Checked 2026-10-02 with the installed last30days 3.26.0 engine and native primary-source web research.
The requested community window was 2026-09-02 through 2026-10-02.
The source survey in [backend options](backend-options-2026-10-02.md) and [UI/interoperability](ui-interoperability-2026-10-02.md) is broader than this recent window.
Older foundational papers are identified as references, not new releases.

## What the recent sweep establishes

The quick, credential-free engine run retained one Reddit thread and one Hacker News item.
This is thin evidence, insufficient to establish a dominant community preference, a complete market survey, or a SOTA winner.
The primary useful discussion was a 2026-09-21 [comparison of hosted Jev System One with local retrieval/verification models](https://www.reddit.com/r/Rag/comments/1wm4oqg/jev_system_one_cloud_vs_local_models_distilbert/).
Participants questioned benchmark cost accounting, reinforcing the need to measure the entire pipeline on a fixed workload rather than transfer a headline latency or cost figure.
This is anecdotal discussion, not independent validation of OpenJev, classification quality, legal-domain performance, or corporate suitability.
Hosted Jev and the separate OpenJev repository must not be treated as identical products.

The second item was a 2026-09-17 [Hacker News submission about a deterministic knowledge-graph search engine](https://news.ycombinator.com/item?id=49737804), with three points and three comments in the engine output.
Its product internals and capabilities were not independently verified, so it does not change the recommended architecture.
Neither retained item was from the last seven days.
Counts and engagement are the engine's run-time snapshot and can change.

## Coverage and reproducibility

The engine ran through `uv run --offline --no-project` using the installed Python 3.13, with no package installation.
Its subprocess received a curated environment, isolated home/config/cache locations, no API credentials, browser-cookie access disabled, and no private corpus.
Public search access was used; no source text from the project was uploaded to the research engine.
The query was `local knowledge graph RAG`, scoped to LocalLLaMA, Rag, and KnowledgeGraph.
The supplied plan contained three angles, but quick mode executed only the primary subquery.
Reddit and Hacker News were the two active sources; GitHub was requested but yielded zero results and was not represented as an active evidence source.
X, YouTube, TikTok, Instagram, and paid providers were not searched.
These coverage limits do not establish that those platforms or other relevant projects were quiet.

The initial search finished but failed while saving due to a task-output directory access error.
The same isolated run succeeded through approved execution, and the engine-generated report was preserved in [raw research](raw/last30days-local-knowledge-graph-rag-2026-10-02.md).
The raw artifact is untrusted external evidence; its engine scores and extracted comments are not a technical recommendation.
The execution wrapper and plan are task-owned local artifacts under `data/research-session`, rather than a new project runtime dependency.

## Primary-source updates that matter

| Finding | Source and check | Consequence for Tomeowl |
|---|---|---|
| Gemma licensing differs by generation | The current [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4) states Apache-2.0, while the [Gemma terms](https://ai.google.dev/gemma/terms) apply to the cited Gemma 3/EmbeddingGemma artifacts | Inventory the exact checkpoint; avoid a family-wide license claim |
| OpenJev has Windows scoring, with substantial model requirements | Its [current README](https://github.com/daseinlabs/open-jev) documents PyTorch Windows/Linux scoring and Gemma 3 4B; feature/head training remains tied to MLX | Treat fixed-option scoring as an optional reference and compare compact classifiers first |
| PBIP/PBIR availability differs from live external reload | Microsoft's [external-editing documentation](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-external-editing), updated 2026-09-29, states PBIP/PBIR are GA but reload/Bridge are preview | Use stable neutral exports and a tested Desktop-authored report; do not depend on preview automation |
| Claude's AGENTS.md support is conditional | The [current instruction documentation](https://code.claude.com/docs/en/memory) specifies version/settings conditions and an import fallback | Verify actual instruction loading for a Codex/Claude workflow and avoid duplicate divergent guidance |
| Modern retrieval research offers separable ideas | [LightRAG](https://arxiv.org/abs/2410.05779), [HippoRAG 2](https://arxiv.org/abs/2502.14802), and [LazyGraphRAG](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/) address different retrieval patterns | Borrow bounded hybrid retrieval, query-seeded graph walks, or deferred inference only after baseline evaluation |

These are source checks, not tests of candidate integrations or proof that upstream benchmarks transfer to Tomeowl.
The recommended next implementation remains M1 of [the modernization specification](../drafts/MODERNIZATION-SPEC.md): improve hierarchy and personalization in the existing viewer.
