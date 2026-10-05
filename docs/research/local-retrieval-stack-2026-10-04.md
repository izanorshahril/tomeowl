# Local retrieval, memory and repository-map stack

Checked on 2026-10-04 against primary repositories, model cards, documentation and papers.
The recent window is 2026-09-04 through 2026-10-04; an old capability whose documentation was crawled recently is not a new release.
This note supports a stack decision for Tomeowl's Windows-first, portable, offline-friendly CLI and frozen viewer.
No packages, models, databases or services were installed, and no local documents were transmitted for this research.
Jev and community discussion are covered by the companion research produced for the same request.

## Recommendation

Keep the existing SQLite catalog, FTS5 search, literal citations, explicit accepted-memory lifecycle and native module map as the default.
Improve bounded context selection before adding a model, then evaluate one optional local semantic route: Qwen3-Embedding-0.6B through a pinned, per-project llama.cpp runtime, normalized vectors in a rebuildable SQLite cache, scoped exhaustive cosine retrieval, and reciprocal-rank fusion with lexical candidates.
For an English-only CPU reranking experiment, trial Ettin 17M before Qwen3 0.6B, with Ettin 32M as the quality comparison and Qwen retained for multilingual assessment.
Add a reranker only if its separately measured packet gains justify the model and runtime integration.
This is a proposed fit for Tomeowl's constraints, not a claim that this exact stack is the universal state of the art or that it has been benchmarked on this machine.

The latest recorded project evaluation covers 11 of 14 annotated evidence anchors, with two support-chunk selection misses and one vocabulary-shift miss.
Lexical search already reaches all labeled sources within the first five chunks, while exact-anchor Recall@5 is 92.3%.
Those partial labels indicate that candidate-to-packet selection is the larger demonstrated immediate issue; embeddings are a plausible experiment for vocabulary mismatch, not a demonstrated fix for every remaining omission.
See the [evaluation guide](../RETRIEVAL-EVALUATION.md) and [paired verification](../../data/retrieval-evaluation-2026-10-04/verification.json).

## What the current store does

Tomeowl currently has no embedding table, vector index, embedding model, semantic scorer or generator.
The SQLite source schema stores source metadata and revisions, complete captured chunk bodies and locators, an FTS5 virtual table over chunk bodies, and evidence-bearing relations.
`searchStore()` ranks literal FTS matches with SQLite BM25, `contextCandidates()` diversifies candidates across sources, and `contextPacket()` assembles bounded, cited passages with separate graph-origin metadata.
Accepted memories have a separate versioned table with namespace, author/origin, lifecycle state and optional captured citations; recall presently uses literal case-sensitive substring matching.
`repomap()` reads indexed JS/TS text and uses the embedded Bun scanner for import paths and exported names.
These claims follow the current [store](../../src/store.ts), [context selector](../../src/context-query.ts), [memory module](../../src/memory.ts), [module map](../../src/repomap.ts) and [capability guide](../CAPABILITIES.md).

The store is a local searchable evidence catalog, rather than a trained model's memory.
Keeping complete quoted source text makes an optional vector index replaceable without turning a model representation into the evidence of record.
SQLite's built-in FTS5 provides BM25 and native match highlighting; neither capability computes embeddings. [SQLite FTS5 documentation](https://sqlite.org/fts5.html).

## Concrete candidate and alternatives

| Layer | Recommended direction | Reason and limit |
|---|---|---|
| Authoritative catalog | Existing SQLite tables and original-body citations. | Preserve current portability, revision checks and backup behavior. |
| Lexical retrieval | Existing FTS5 BM25. | Good for exact identifiers, quoted phrases and source-specific vocabulary. |
| Optional semantic encoder | Evaluate Qwen3-Embedding-0.6B first. | Apache-2.0 model, multilingual/code capabilities, instruction-aware queries and configurable dimensions; actual Malay, English and code quality needs local evaluation. |
| Optional inference runtime | Per-project pinned llama.cpp Windows CPU binary and pinned local GGUF artifact. | Avoid Python, Docker and a mandatory persistent service; runtime/model compatibility and conversion fidelity remain acceptance checks. |
| First vector implementation | Normalized float vectors in a derived SQLite cache with exhaustive scoped top-k cosine search. | Small implementation and exact search over the stored representation; scan latency grows with vector count and dimension. |
| Optional reranking | Trial Ettin 17M/32M for English CPU use; compare Qwen3-Reranker-0.6B for multilingual use. | Prove complete scoring and Windows packaging; a reranker cannot recover a passage absent from its candidates. |
| Larger vector catalogs | Evaluate sqlite-vec if exhaustive search misses measured latency or memory targets. | Retains SQLite deployment; introduces a native extension, version coupling and more release/restore tests. |
| Rich repository map | Add a pinned Tree-sitter parser and only needed grammars when symbol/signature evidence is required. | Embeddings can rank code but do not establish symbol definitions, call targets or language semantics. |

Qwen's official model card specifies 0.6B parameters, 32K input context, up to 1,024 embedding dimensions, configurable 32-1,024 dimensions, and Apache-2.0 licensing.
Its query examples use an instruction while document examples do not; changing prompt, pooling, normalization or dimensions changes the embedding contract.
Its cited leading 8B MTEB result is explicitly dated 2025-06-05, so it cannot establish a 2026-10-04 leaderboard winner. [Qwen3-Embedding-0.6B model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).

The 0.6B reranker is also Apache-2.0, scores query/passage pairs, and documents 100+ languages and a 32K context.
Scores are ranking signals, not calibrated confidence that a claim is true. [Qwen3-Reranker-0.6B model card](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B).
The runtime documentation demonstrates embedding and reranking endpoints, including a Qwen3 0.6B reranker, and its release page supplies Windows CPU builds.
A loopback endpoint can be started and stopped by the invoking command; the process ownership, failure behavior and offline loading policy would be Tomeowl implementation choices rather than already implemented capabilities. [llama.cpp serving documentation](https://llama.app/docs/serve), [Windows release artifacts](https://github.com/ggml-org/llama.cpp/releases).
The runtime uses MIT licensing, while model and converted-artifact licenses must be checked independently. [llama.cpp license](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE).

### Smaller English reranker audit

Ettin's release is dated 2026-05-19, outside the recent window. [Publisher release](https://huggingface.co/blog/ettin-reranker).
Both small model cards declare English, Apache-2.0 and a configured maximum of 7,999 tokens; the blog's rounded 8K description should not replace that configuration. [17M card](https://huggingface.co/cross-encoder/ettin-reranker-17m-v1), [32M card](https://huggingface.co/cross-encoder/ettin-reranker-32m-v1).

| Candidate | Parameters | Publisher English NDCG@10 | Declared language scope |
|---|---|---|---|
| Ettin 17M. | 17.6M. | 0.5576. | English. |
| Ettin 32M. | 32.8M. | 0.5779. | English. |
| Qwen3 0.6B. | Approximately 596M in this comparison. | 0.5940. | 100+ languages. |

These are publisher MTEB English retrieval results averaged across six embedding pairings with top-100 reranking, not multilingual or Tomeowl results.
The same release reports 267.4 and 92.5 pairs/second for 17M and 32M on an i7-13700K CPU with SDPA and passages limited to 512 tokens; those throughput figures do not establish Windows request latency or ONNX speed here. [Publisher comparison and CPU methodology](https://huggingface.co/blog/ettin-reranker).
Official repositories already contain generic ONNX files of 67.3 MB and 128 MB, plus AVX2 uint8 variants of 17.1 MB and 32.4 MB respectively; these are artifact sizes, not peak RAM. [17M ONNX files](https://huggingface.co/cross-encoder/ettin-reranker-17m-v1/tree/main/onnx), [32M ONNX files](https://huggingface.co/cross-encoder/ettin-reranker-32m-v1/tree/main/onnx).
Combined with ONNX Runtime's Windows CPU support, this makes a tiny local trial plausible, but compiled Bun integration remains unverified.

The model is a modular Transformer, CLS pooling, Dense/GELU, LayerNorm and final Dense score chain. [Model modules](https://huggingface.co/cross-encoder/ettin-reranker-17m-v1/blob/main/modules.json), [17M architecture](https://huggingface.co/cross-encoder/ettin-reranker-17m-v1).
A future direct ONNX adapter must inspect graph outputs and prove that all head modules, paired tokenization and final activation reproduce the reference scorer; this research did not verify that one published ONNX file alone contains the complete chain.
Sentence Transformers documents ONNX loading and warns that external consumers may need matching activation processing. [Cross-encoder backend guide](https://sbert.net/docs/cross_encoder/usage/efficiency.html).
The revised first trial is Ettin 17M for bounded English candidate scoring, with a 32M ablation; Malay and mixed-language queries need separate labels before replacing the multilingual Qwen comparator.

EmbeddingGemma 300M is a reasonable lower-resource comparison: its official card specifies a 2K context, 768 dimensions with smaller Matryoshka options, and more than 100 training languages.
It uses Gemma terms rather than Qwen's Apache-2.0 declaration; the smaller context and model-specific input/output processing need separate validation. [EmbeddingGemma model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card).
Jina v5 text nano is another compact current candidate, with 239M parameters, 8,192 input tokens and 768 dimensions, but its card declares CC BY-NC 4.0 and documents a custom llama.cpp branch for nano support.
These licensing and integration differences make it a comparison candidate rather than the default recommended Tomeowl encoder. [Jina v5 text nano retrieval model card](https://huggingface.co/jinaai/jina-embeddings-v5-text-nano-retrieval).

ONNX Runtime's Node binding has prebuilt Windows x64/arm64 CPU and DirectML support.
That establishes a Windows alternative, but not compatibility of `onnxruntime-node`, tokenization, a specific exported model and native assets inside Tomeowl's compiled Bun executable; these require proof before adoption. [ONNX Runtime Node platform matrix](https://onnxruntime.ai/docs/get-started/with-javascript/node.html).

sqlite-vec is pure C with no additional library dependencies, supports Windows and float/int8/binary vectors, and explicitly warns that it is pre-v1.
Its repository declares MIT and Apache-2.0 licenses. [sqlite-vec repository](https://github.com/asg017/sqlite-vec).
The checked release page marks v0.1.9 as the latest stable release dated 2026-03-31; v0.1.10-alpha.1 introduces new ANN indexes and later alpha releases fix related bugs.
These are established and experimental March-May changes, not September additions. [sqlite-vec releases](https://github.com/asg017/sqlite-vec/releases).
No evidence from the current 123-chunk evaluation justifies a separately operated vector database for Tomeowl.

## What advanced memory systems contribute

Memory admission, identity, validity, corrections, provenance and forgetting are separate decisions from vector similarity.
Letta's memory blocks illustrate useful context that is always attached to an agent, without retrieval; that pattern can be represented as a small bounded accepted-memory packet. [Letta memory blocks](https://docs.letta.com/v1-sdk/memory/memory-blocks).
Graphiti illustrates temporal entity/fact graphs, episode provenance and hybrid semantic/keyword/graph retrieval.
Its open-source framework is Apache-2.0, brings a graph backend and Python stack, defaults to OpenAI inference/embedding, and allows configured local compatible providers; the managed Zep implementation is a different deployment.
Its documentation also cautions that smaller models may fail structured-output ingestion. [Graphiti repository](https://github.com/getzep/graphiti).

Mem0's current repository describes semantic, BM25 and entity signals plus temporal retrieval, and its April 2026 algorithm discussion distinguishes managed benchmark results from proprietary optimizations unavailable in the OSS SDK.
Therefore its headline numbers cannot be assumed to describe an equivalent local Windows deployment. [Mem0 repository](https://github.com/mem0ai/mem0).
The useful architectural lesson for Tomeowl is selective retrieval of scoped, dated memories with explicit provenance; adopting the whole platform is unnecessary to add that behavior.
Optional LLM-extracted summaries or proposed facts should remain derived candidates until an explicit admission policy accepts them, and should preserve the original citation and extraction-model identity.
A document similarity score must never silently change a memory's active, superseded, expired or retracted state.
These are design recommendations, not assertions that Tomeowl currently extracts or adjudicates memories automatically.

## Repository maps need structure

Aider's map includes important classes/functions, types and call signatures, then ranks dependency-connected portions to fit a context budget. [Aider repository-map documentation](https://aider.chat/docs/repomap.html).
Its implementation uses Tree-sitter-derived definitions/references and graph ranking. [Aider map implementation](https://github.com/Aider-AI/aider/blob/main/aider/repomap.py).
Tomeowl's embedded Bun scanner already avoids a parser dependency for its present module-map contract, but Bun explicitly ignores type-only imports/exports. [Bun Transpiler scanner documentation](https://bun.sh/docs/runtime/transpiler).
The next richer layer should expose symbol name, kind, signature, definition span, references and parser status with source/revision evidence, while labeling unresolved aliases and calls.
Tree-sitter supplies incremental syntax trees and an embeddable C11 runtime under MIT; each selected grammar and binding still needs its own version, license and Windows packaging checks. [Tree-sitter introduction](https://tree-sitter.github.io/tree-sitter/), [runtime license](https://github.com/tree-sitter/tree-sitter/blob/master/LICENSE).
Syntax parsing alone is not full type resolution, especially for dynamic dispatch and cross-language calls.

## Verified developments within the recent window

| Verified date | Primary result | Implication for Tomeowl |
|---|---|---|
| 2026-09-04 | Embedding Surgery proposes localized vector updates driven by feedback and ranking constraints, and the record states CIKM 2026 acceptance. | A future feedback layer should keep derived corrections/versioning separate from original evidence; this does not justify fine-tuning or editing cached vectors now. |
| 2026-09-10 | Grounding Agent Memory proposes read-only environment probing to validate and refresh curator candidates without changing task-agent write authority. | Freshness checks and scoped cited memory admission matter alongside retrieval quality; reported task gains are not Tomeowl results. |
| 2026-09-16 | Quanta proposes a compact dense/BM25/graph pipeline, weighted reciprocal-rank fusion, and graph expansion followed by content rescoring. | Useful design pattern for optional semantic retrieval; graph distance should not become semantic relevance or confidence. |
| 2026-10-03 to 2026-10-04 | llama.cpp releases include Windows fixes and currently available Windows CPU artifacts. | Pin and verify a tested runtime build rather than depending on a moving latest download. |

The dates and descriptions come from [Embedding Surgery](https://arxiv.org/abs/2609.05110), [Grounding Agent Memory](https://arxiv.org/abs/2609.11060), [Quanta](https://arxiv.org/abs/2609.18248), and [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases).
Quanta's paper explicitly says its deployment observations characterize architecture rather than establish retrieval superiority, and calls for controlled relevance-labeled comparisons.
Its repository is MIT, with a service-free vector/DuckDB core and optional Tantivy, Neo4j and Redis components; Windows execution was not verified here. [Quanta paper](https://arxiv.org/html/2609.18248v1), [Quanta repository](https://github.com/ilivieris/quanta).
Import the demonstrated idea, not its additional Python storage stack, for the present Tomeowl scope.

LongMemEval-V2 and EvoMemBench are relevant 2026 evaluation developments outside this window.
LongMemEval-V2 evaluates static/dynamic state, workflows, environment gotchas and premise awareness using compact memory evidence and latency, rather than only fact lookup. [Official LongMemEval-V2 repository](https://github.com/xiaowu0162/LongMemEval-V2).
EvoMemBench compares memory forms across scope and knowledge/execution settings and finds no single memory form consistently best. [EvoMemBench, June 2026 revision](https://arxiv.org/abs/2605.18421).
The current live MTEB page does not expose a readable model ranking through the checked fetch, so this research does not assign an absolute October leaderboard winner. [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard).

## Acceptance gates for an optional semantic slice

1. Expand the independent local suite with genuine English/Malay paraphrases, code identifiers, acronym variants, exact phrases, temporal corrections and unavailable-answer cases.
2. Compare lexical-only, better packet selection, semantic-only and lexical-plus-semantic using the same corpus, labels, packet bytes and quoted-character budget.
3. Add bounded reranking as a separate ablation, so retrieval coverage and candidate-selection gains are distinguishable.
4. Record model/runtime SHA, artifact origin/license, tokenizer, pooling, prompt, output dimension, normalization and quantization; reject mismatched or non-finite vectors explicitly.
5. Key cached vectors by chunk/revision and embedding contract, exclude stale/deleted chunks, and keep admission-state filters authoritative before ranking accepted memories.
6. Preserve literal source quotes and typed locators after every ranking route; semantic similarity does not create graph evidence or validate answer entailment.
7. Measure index build time, disk growth, peak RSS, first-load and warmed latency on the target Windows CPU, plus restart/rebind/backup behavior with networking disabled and provider failure fallback.

These gates are proposed work, not checks run in this research.
Exact cosine should consider the full bounded collection scope rather than only FTS hits when measuring vocabulary recovery, or the semantic experiment cannot recover documents with no lexical match.
A normalized float32 cache costs approximately `vector_count * dimensions * 4` bytes before metadata: 100,000 vectors at 512 dimensions require 204.8 MB in decimal units.
That arithmetic means vector growth could exceed Tomeowl's present 256 MiB catalog backup limit after text and other tables are included; a rebuildable companion cache or an explicitly revised backup contract needs deliberate design.
Exact vector search still scans the chosen scope and must disclose a cutoff if a bound prevents complete search.
Moving to ANN should follow measured scale/latency failure and include its own approximate-recall, delete, scope-filter and restore evidence.
