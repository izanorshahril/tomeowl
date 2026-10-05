# Tomeowl backend options (checked 2026-10-02)

## Recommendation

Keep SQLite as the default local system of record.
The existing store already has transactional scope replacement, revisioned sources/chunks, FTS5, relations, and citation evidence.
Add embeddings as an optional, rebuildable retrieval index behind a `VectorIndex` seam; retain exact cosine search in application code or SQLite scans for small collections, then benchmark `sqlite-vec` before accepting its pre-v1 extension and packaging cost.
Keep graph persistence behind a future `GraphRepository` seam and do not adopt a second database until representative traversal queries and operational needs demonstrate a measurable advantage.
Export a versioned graph/search contract independently of the visual renderer.

Graph similarity is a useful navigation signal, not a complete community or semantic label.
Use embeddings to rank neighbors and drive a selectable similarity heat layer; preserve node type, collection, evidence quality, and score semantics as separate visual channels.
A cluster layout should use graph topology/community detection, while vector similarity can suggest or color proximity.
Never present model-inferred relations as established facts without evidence and explicit acceptance.
Keep relation method/basis (such as structural, imported, or model-extracted) separate from acceptance status (candidate, accepted, or retracted) and revision validity (current or stale).
Treat a raw model score as a score with a documented meaning; call it confidence only after calibration and evaluation support that interpretation.

## Current Tomeowl baseline

`src/domain.ts` models sources, revisioned chunks, evidence, four relation kinds, and JSON snapshots.
`src/store.ts` persists these in `bun:sqlite`, enables FTS5, replaces scopes transactionally, and filters relation evidence to extant matching revisions.
`src/adapters/graphify.ts` normalizes Graphify edges into Tomeowl relation candidates, resolving absolute source paths and line ranges into chunk evidence.
`src/graphify-validation.ts` imposes 5 MB input, 20,000-node, 50,000-edge, catalog-byte, and warning bounds and skips stale/incomplete sources.
This is a useful validation/normalization boundary; persistence of imported Graphify relations is not yet shipped.
Graphify output should remain an adapter input, not become the canonical schema.

Current full-text search is lexical.
The present type model lacks entity records, typed predicates beyond `RelationKind`, embeddings/model metadata, relation confidence, chunking provenance, and clusters; evolve those with versioned migrations or derived side indexes rather than silently overloading current fields.

## Candidates

| Candidate | Fit and evidence | Cost, license, and recommendation |
|---|---|---|
| SQLite + FTS5 | Already implemented and embedded; SQLite is a durable single-file relational source of truth. Best default for sources, chunks, provenance, and ordinary graph edges. | No graph server or recurring cost. SQLite is public domain (check the [SQLite copyright page](https://sqlite.org/copyright.html)); extensions and bindings have separate terms. Keep. |
| `sqlite-vec` | Small pure-C SQLite extension, float/int8/binary vectors, KNN, metadata; upstream explicitly supports Windows and says no dependencies. | Apache-2.0/MIT dual licensing is shown upstream, but the project is pre-v1 and warns about breaking changes. Package its matching native binary for every target, pin and audit it, and test extension loading under locked-down Windows. Good first vector prototype, not yet a required core dependency. [Project](https://github.com/asg017/sqlite-vec) |
| `sqlite-vector` | Another SQLite extension with ordinary table integration, Windows binaries, vector search and low-bit options. | Apache-2.0 source license; its documentation makes broad performance/capability claims that need independent reproduction. Compare install footprint, exact/approximate behavior, licensing of packaged binaries, Windows loading, and maintenance before selection. [Project](https://github.com/sqliteai/sqlite-vector), [license](https://github.com/sqliteai/sqlite-vector/blob/main/LICENSE.md) |
| LadybugDB | Embedded Cypher graph DB, plausible only if multi-hop path/community queries become central and costly in current SQLite. Has a C API and first-party .NET bindings; current main repo exposes MIT license. | No service required, but introduces native runtime, language bindings, database migration/backup and second source of truth. Verify official Windows binaries, Bun/Node binding, cross-version file compatibility, backup/restore, and maintenance on an x64 clean Windows machine before a spike. Candidate for an isolated benchmark, not immediate adoption. [Repo](https://github.com/LadybugDB/ladybug), [official .NET binding](https://github.com/LadybugDB/ladybug-dotnet) |
| DuckDB + `vss` | Strong analytical columnar engine; `vss` gives HNSW vector similarity. Could support batch analytics/export experiments, but is not a graph database replacement. | Official docs call `vss` experimental; persistent HNSW is behind an experimental flag, can risk index corruption on crash, and full index is memory resident. Not appropriate as Tomeowl's durable core or default vector index yet. [VSS docs](https://duckdb.org/docs/lts/core_extensions/vss) |
| Graphify | Local graph generation emphasizes deterministic tree-sitter code structure, explicit vs inferred edges, communities, path/explain/query, JSON output, plus optional semantic/document passes and optional database pushes. Its repository currently lists Apache-2.0 and MIT licenses. | Strong reference/import adapter, not a ready embedded graph store: current project requires Python 3.10+, supports Windows, and optional document/model integrations bring more dependencies and separate terms. Tomeowl currently validates and normalizes candidate edges; it does not yet persist imported Graphify relations. Pin a release and inspect full transitive/package/model inventory for company redistribution. [README](https://github.com/Graphify-Labs/graphify), [v8 license](https://github.com/Graphify-Labs/graphify/blob/v8/LICENSE), [pyproject](https://github.com/Graphify-Labs/graphify/blob/v8/pyproject.toml) |

“Zero cost” means no paid service/usage bill here, not zero installation, CPU, storage, security, support, or legal cost.
Open-source code licenses, model-weight terms, asset and dependency licenses, and employer approval are distinct questions.
Do not claim corporate legal clearance from repository badges; review pinned artifacts and SBOM with the organization’s approver.

The original [Kuzu repository](https://github.com/kuzudb/kuzu) is archived and read-only, with the owner archive date shown as 2025-10-10 when checked.
LadybugDB is a candidate to investigate in that embedded-graph ecosystem; predecessor compatibility does not establish its current maintenance quality, binding support, or backup guarantees.
Avoid adopting an archived engine from an older tutorial without an explicit support/maintenance plan.

## Embedding model shortlist

These are evaluation candidates, not a quality ranking.
The first three are small 384-dimensional models with permissive model-card licenses; validate exact checkpoint files, runtime/export path, language coverage, and domain retrieval on the same fixture before choosing.
Model artifact license does not establish training-data provenance or employer approval.

| Model | Verified card facts | Role in a Tomeowl pilot |
|---|---|---|
| `sentence-transformers/all-MiniLM-L6-v2` | Apache-2.0; 22.7M parameters; 384 dimensions; intended for semantic search/similarity/clustering; truncates input beyond 256 word pieces. | Small English baseline with mature Sentence Transformers/Transformers integrations. Simple first control, especially if current materials and queries are English. [Model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) |
| `BAAI/bge-small-en-v1.5` | MIT; 384 dimensions; English; card lists 512 max sequence length and describes v1.5 as improving similarity distribution for use without an instruction. | Compare with MiniLM on English manuals/code explanations; model card exposes ONNX model files. [Model card](https://huggingface.co/BAAI/bge-small-en-v1.5) |
| `intfloat/multilingual-e5-small` | MIT; 12 layers and 384 dimensions; multilingual; inputs must use `query: ` or `passage: ` prefixes, including non-English text. | Small multilingual candidate when Malay/English or cross-language retrieval matters. Prefix policy is part of the model contract and must be applied consistently. [Model card](https://huggingface.co/intfloat/multilingual-e5-small), [E5 model table](https://github.com/microsoft/unilm/blob/master/e5/README.md) |
| `google/embeddinggemma-300m` (EmbeddingGemma) | Approximately 308M parameters; 100+ languages; up to 2,048 input tokens; 768 output dimensions with 512/256/128 options; model card/license metadata says `gemma` and requires accepting Google's usage license. | Multilingual/context candidate if approved, but its terms are not Apache-2.0 and artifact access has an acceptance gate. Verify CPU/ONNX execution and offline packaging before comparing. [Google overview](https://ai.google.dev/gemma/docs/embeddinggemma), [Google model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card), [checkpoint](https://huggingface.co/google/embeddinggemma-300m) |
| `Qwen/Qwen3-Embedding-0.6B` | Apache-2.0; 0.6B parameters; 100+ languages; 32K context; output dimension configurable from 32 to 1,024; instruction-aware. | Higher-capability optional comparison for multilingual/code retrieval, with larger footprint and inference cost than the 384D baselines. Verify ONNX/runtime support and CPU cost using pinned files. [Model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) |

For a minimal first evaluation, compare MiniLM and E5-small (or BGE-small for English-only sources), with lexical FTS5 as the baseline.
Persist model ID, immutable revision/hash, dimensions, normalization and preprocessing/prefix policy alongside each vector set; changing any of these requires a separate or rebuilt index.
Keep exact cosine top-k first at small corpus sizes and only add an ANN extension if measurement justifies it.
These model cards describe capabilities and licenses; they do not prove Tomeowl-specific quality, Windows package compatibility, or SOTA status.

## Local inference options

| Option | Practical role and limits | Recommendation |
|---|---|---|
| OpenJev | OpenJev implements System One-style fixed-option scoring: render a request, score candidate options from Gemma next-token likelihoods, and optionally serve an API. It is not an indexing, chunking, or relation-extraction framework. The checked README warns zero-shot probabilities are uncalibrated; its featured implementation uses Gemma 3 4B, with PyTorch CPU support but the documented feature/head training workflow requiring MLX on Apple silicon. The project code is MIT; this Gemma 3 checkpoint follows Google's separate Gemma model terms. | Useful design/reference for fixed-schema classification after Tomeowl defines options and abstention. Its current MLX workflows are not Windows-native, and a 4B model is not a “small CPU classifier”; test a supported small model and exact Windows packaging first. Gemma licenses vary by family/checkpoint: the official Gemma 4 card, for example, lists Apache-2.0. [OpenJev](https://github.com/daseinlabs/open-jev), [Gemma 3 terms](https://ai.google.dev/gemma/terms), [Gemma 4 card](https://ai.google.dev/gemma/docs/core/model_card_4) |
| Gemma 3 270M / 1B | Google lists 270M and 1B for mobile/single-board targets; model card states 32K context for those sizes. Gemma 3 checkpoint usage is governed by Google's Gemma terms, rather than Gemma 4's Apache-2.0 license. Generation can classify or extract in constrained JSON, but is probabilistic and must be checked against a labeled set. | Candidate for optional, offline, bounded classification or extraction. Start with 270M/1B quantized only after checking approved model artifact, Windows CPU runtime, RAM, latency, and quality. Not needed for deterministic chunk boundaries or semantic relation truth. [Model sizes](https://ai.google.dev/gemma/docs/get_started), [model card](https://ai.google.dev/gemma/docs/core/model_card_3), [terms](https://ai.google.dev/gemma/terms) |
| Gemma 4 E2B / E4B | Google's current model card lists Apache-2.0. E2B is 2.3B effective parameters (5.1B including embeddings); E4B is 4.5B effective (8B including embeddings). Both support configurable thinking and up to 128K context. Thinking configuration is a generation option, not a guarantee of correct classification or structured extraction. | Larger optional model experiment for constrained classification/extraction if CPU latency, peak RAM, model distribution, and artifact approval pass. Check the exact instruction-tuned checkpoint, prompt/template, schema-constrained output support, runtime compatibility and license notice; do not infer Gemma 4 terms from Gemma 3 or OpenJev. [Official Gemma 4 card](https://ai.google.dev/gemma/docs/core/model_card_4) |
| GLiNER / GLiREL | GLiNER is an Apache-2.0 framework for promptable entity spans and advertises CPU, int8, and ONNX deployment. GLiREL is a separate relation-extraction project/model family; verify its code and checkpoint license independently. Entity extraction finds spans; it does not by itself guarantee coreference resolution, valid domain relationships, or calibrated probabilities. | More targeted than a generative LLM for entity extraction; evaluate GLiNER for named entities and GLiREL for typed links as separately replaceable optional workers. Test multilingual/industrial vocabulary, source-span fidelity, precision/recall, CPU behavior, and exact model files. [GLiNER](https://github.com/urchade/GLiNER), [GLiREL](https://github.com/urchade/GLiREL) |
| ONNX Runtime | MIT runtime with CPU execution provider, plus optional hardware-specific providers. Model conversion/export support and compatible operators depend on each selected model. Windows' built-in CPU path is a good portable baseline; accelerator providers add driver/device and license/deployment considerations. | Preferred first target for an optional compact encoder/classifier if a compatible model is found. Ship CPU-only first; accelerators must be opt-in and tested on target hardware. [ORT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE), [Python API](https://github.com/microsoft/onnxruntime/blob/main/docs/python/api_summary.rst) |
| llama.cpp | MIT inference runtime with Windows builds and quantized GGUF ecosystem. A generative runtime may be larger and more operationally complex than a classifier-specific ONNX worker; each model keeps its own license/terms. | Consider only if constrained JSON generation from Gemma or other approved GGUF weights materially beats compact task-specific extraction. Keep runtime/model as optional package. [Project](https://github.com/ggml-org/llama.cpp) |
| OpenVINO | Intel CPU/GPU/NPU execution path; adds hardware/runtime/build matrix. `llama.cpp`'s official OpenVINO backend instructions for Windows include a native toolchain and OpenVINO setup. | Treat as an acceleration experiment after CPU ONNX baseline. It does not make the model or project license enterprise-cleared. Verify redistributable/runtime requirements for the selected packaging. [llama.cpp backend docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENVINO.md), [OpenVINO license](https://github.com/openvinotoolkit/openvino/blob/master/LICENSE) |

Use deterministic format-aware parsing and structure-first chunking as the baseline.
A model can propose labels, candidate entities, and candidate links with exact chunk/span provenance; a validator must enforce allowed types, scope, endpoint existence, score/abstention policy, and revision matching.
Keep relation method/basis, acceptance status, and current/stale revision validity as separate fields, as required by the [modernization specification](../drafts/MODERNIZATION-SPEC.md).
Preserve model name, version/hash, prompt/schema version, runtime, score type, and extraction timestamp.
Do not label raw next-token likelihoods as calibrated confidence.

## Retrieval architecture references

These projects and papers are useful for borrowing a retrieval idea; none needs to become Tomeowl's runtime stack.
Their reported benchmark gains are task- and setup-specific, not forecasts for Tomeowl.

| Reference | What it contributes | What Tomeowl can borrow |
|---|---|---|
| LightRAG | Combines graph entities/relations and vectors, supports local/low-cost modes and multiple retrieval modes. Its current upstream has grown into a broad Python/server product with four storage roles (KV, vector, graph, document status), many adapters, optional parser/model services and a frontend. | Borrow dual retrieval channels (chunk semantic search plus graph neighborhood) and incremental/rebuildable derived indexes. Keep own canonical records and add just the one demonstrated path; do not bring its full storage/server stack into the Windows core. [Upstream](https://github.com/HKUDS/LightRAG), [paper](https://arxiv.org/abs/2410.05779) |
| Microsoft's LazyGraphRAG | Microsoft Research describes doing cheap lexical/vector-style preprocessing and deferring expensive relevance/answer work until query time, with adjustable relevance-test budget. Their blog explicitly says a precomputed entity/relationship/community index still has value, and suggests combining the approaches. The current public GraphRAG README says that repository is largely in maintenance mode; the separate LazyGraphRAG effort is described in Microsoft's blog and was identified by a Microsoft-authored community post as an internal experimental fork, so do not assume a supported public package exists. | Borrow budgeted, staged query expansion: lexical/vector shortlist first; spend more CPU/model work only for ambiguous multi-hop questions. Measure first-query and repeat-query costs. Treat Microsoft's reported quality/cost curves as hypothesis until reproduced. [Microsoft Research blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/), [GraphRAG status](https://github.com/microsoft/graphrag), [internal/experimental caveat](https://techcommunity.microsoft.com/blog/publicsectorblog/from-individual-voices-to-collective-insight/4434590) |
| HippoRAG 2 | Research memory design combines extracted entity/relation links with passage nodes and Personalized PageRank to retrieve associative/multi-hop evidence; paper reports benchmark results for factual, sense-making, and associative tasks. The repository is a research implementation, not a minimal Windows embedded DB. | Borrow a small graph-walk/ranking experiment over Tomeowl's own evidence links after ordinary lexical/vector retrieval, with query-seeded nodes and explainable contributing paths. Avoid adopting its whole research dependencies or assuming benchmark results transfer. [Paper](https://arxiv.org/abs/2502.14802), [official code](https://github.com/OSU-NLP-Group/HippoRAG) |
| RAPTOR | Recursively clusters, summarizes and embeds passages into a tree, allowing retrieval at chunk and summary levels; paper reports improvements on its evaluated long-document QA tasks. Summaries create additional model, provenance, staleness, and hallucination concerns. | Borrow a derived hierarchy or parent-summary tier only for corpora/questions needing cross-document overview. Keep original chunks/evidence as citation ground truth, regenerate summaries on source revision, and make summary retrieval optional. [Paper](https://arxiv.org/abs/2401.18059) |
| Late chunking | For a long-context embedding model exposing token-level representations, encode a broader passage first and pool token representations into chunks afterward. This can preserve surrounding context in chunk vectors; it is not a new graph or chunk boundary detector and needs compatible model/runtime outputs. | Prototype after baseline chunked embeddings, on long sections where neighboring context changes retrieval. Keep current structural chunks and locator spans; compare retrieval on a fixed query set and check model terms/runtime/size. [Paper](https://arxiv.org/abs/2409.04701), [author implementation](https://github.com/jina-ai/late-chunking) |

The lean synthesis is staged hybrid retrieval: keep FTS5; add an optional embedding side-index; use explicit imported/structural relations first; apply graph-neighbor expansion or a bounded personalized walk only when a query signals multi-hop intent; add generated entities, relations, or summaries as rebuildable proposals.
This directly supports better navigation and layered UI while making each additional cost measurable.

## Recommended seams

1. **Keep canonical records stable:** version the snapshot/API and add optional `Entity`, typed `Relation`, provenance, extraction method, confidence semantics, and chunker identity without making a particular model mandatory.
   Store evidence spans against the source revision and chunk.
   Keep relation method/basis separate from acceptance status and revision validity.
2. **Keep search composition independent:** define `LexicalSearch` (current FTS5), `VectorIndex` (chunk/entity vectors, model/dimension/normalization metadata), and a hybrid ranker returning component scores and explanations.
   Start with optional exact cosine over persisted vectors for small corpora; benchmark `sqlite-vec` separately.
   Rebuild embeddings when model/version changes; never lose FTS search if the extension is unavailable.
3. **Keep graph persistence replaceable:** current relational `relations` can serve ordinary graph displays and adjacency/path traversal.
   Define a `GraphRepository` only when a real second engine is tested; make it rebuildable from canonical records with stable IDs and evidence.
   Graphify remains an input adapter and possible export target.
4. **Keep ingestion/model work out of the viewer:** `Chunker`, `EntityExtractor`, and `RelationExtractor` contracts accept bounded input and return typed candidates with source offsets, versioned config, and structured errors.
   Deterministic defaults work offline; optional ONNX or local-LLM providers can be dropped without changing stored source records.
5. **Keep visual encoding honest and portable:** emit a renderer-neutral graph payload with node category, collection, community, relation method/basis, acceptance status, revision validity, score semantics, optional similarity, and coordinates/layout metadata.
   A frontend may map category to hue, similarity to a clearly labeled gradient, acceptance status to a text badge, revision validity to a freshness indicator, and community to hull/group.
   Export core nodes/edges/metrics separately from transient UI state so Cytoscape, Vega/Vega-Lite analytics, or a future Power BI adapter do not define storage.

## Benchmark gates before choosing a backend or model

Use a fixed, approved, non-confidential fixture set with gold answers and pinned artifacts.
Run on the supported clean Windows x64 user-space setup, with network disabled after staging.
Include 1k, 10k, and 50k chunks; 10k and 100k edges; cold and warm start; incremental source update; database copy/backup/restore; absent extension/model behavior; and a bounded memory run.

| Gate | Evidence required to adopt |
|---|---|
| Graph engine | Compare SQLite adjacency/path/community-preparation query latency, import/rebuild time, p50/p95 query time, resident memory, file size, concurrent read/write behavior, crash recovery, and restore correctness against LadybugDB on the same fixture. Adopt only for a named product query with a meaningful repeatable improvement and acceptable portability. |
| Vector engine | Compare exact cosine, sqlite-vec, and (only if justified) sqlite-vector for top-k recall@k, filtered retrieval, insert/update/delete correctness, latency, build time, file/runtime size, RAM, Windows extension loading, and clean-machine offline setup. Measure MRR/nDCG and citation correctness against hybrid lexical baseline; similarity heat coloring alone is not a quality win. |
| Classifier/extractor | Label representative examples; measure per-class precision/recall/F1, macro-F1, abstention coverage, calibration where meaningful, relation precision/recall, exact-span accuracy, unsupported-edge rate, CPU p50/p95, peak RAM, model size, and failure rate. Require citation/evidence and malformed-output validation. Compare simple rules, compact ONNX classifier/GLiNER, then Gemma/OpenJev only if needed. |
| Corporate distribution | Record pinned code and model licenses, transitive SBOM, notices, binary/model hashes, redistribution terms, offline install steps, required VC runtime/drivers, data egress, and security review outcome. “No API bill” does not pass this gate. |
| UX evidence | Have users perform find-topic, inspect-evidence, explore-community, and compare-related-material tasks across node counts. Record task completion/time, error rate, readable contrast, reduced-motion behavior, keyboard path, and frame rate. Do not equate visual effects or vector heat color with better comprehension. |

The 50k/100k points are stress-test gates rather than forecasts of current Tomeowl workload; tune them when the target corporate dataset is known.
No candidate is called SOTA here: the available claims are upstream project descriptions or project-local benchmarks, not an independently reproduced comparison for Tomeowl.

## Research workflow for Codex or Claude implementation

1. Capture the current user tasks, offline boundary, target Windows versions/architectures, approved model policy, and fixed evaluation fixtures.
2. Ask the coding agent to map existing contracts and explain the smallest design change before modifying code; require it to preserve current edits and inspect repository instructions.
3. Have a separate research pass verify exact upstream versions, code/model licenses, Windows artifacts, and dependencies; collect primary links and avoid treating stars or vendor benchmarks as proof.
4. Specify the data contract and adapter boundary first.
   Implement one vertical slice behind opt-in configuration, migrate/back up data reversibly, and retain FTS/canonical export fallback.
5. Review the diff for scope, provenance, errors, license notices, migration safety, and tests that prove retrieval relevance and citation integrity; run the pinned project runner and Windows offline packaging checks.
6. Compare the result against the unchanged baseline on the fixed dataset and disclose failures and limits before expanding model/backend scope.

## Uncertainties to close

- LadybugDB's current Windows binary and binding support must be checked for the actual intended Bun/TypeScript integration; the official .NET package evidence is not proof that Bun has a maintained binding.
- The exact current Graphify release, pinned extra dependency set, and license obligations for optional integrations vary by installation; audit release artifacts and the lockfile before packaging.
- `sqlite-vec` is explicitly pre-v1; check whether that is still true at implementation time and pin its exact extension ABI/build.
- Candidate GLiNER/GLiREL checkpoint licenses and multilingual/domain performance are not settled by the framework repository licenses.
- Check the exact model-card/license for the pinned checkpoint and any downstream employer policy independently from the permissive licenses on OpenJev, llama.cpp, or ONNX Runtime; Gemma 3, EmbeddingGemma, and Gemma 4 do not share one license status.
- No target scale, acceptable install footprint, hardware baseline, or approved document/model policy has been supplied, so selection beyond the existing SQLite baseline remains conditional.

## Primary sources

- Tomeowl: [domain types](../../src/domain.ts), [SQLite store](../../src/store.ts), [Graphify adapter](../../src/adapters/graphify.ts), [Graphify validation](../../src/graphify-validation.ts), [architecture](architecture.md), [landscape](platform-landscape-2026-10-02.md).
- Databases: [SQLite](https://sqlite.org/copyright.html), [sqlite-vec](https://github.com/asg017/sqlite-vec), [sqlite-vector](https://github.com/sqliteai/sqlite-vector), [LadybugDB](https://github.com/LadybugDB/ladybug), [DuckDB VSS](https://duckdb.org/docs/lts/core_extensions/vss).
- Graphify: [README](https://github.com/Graphify-Labs/graphify), [v8 license](https://github.com/Graphify-Labs/graphify/blob/v8/LICENSE), [v8 pyproject](https://github.com/Graphify-Labs/graphify/blob/v8/pyproject.toml).
- Models and runtimes: [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [BGE-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5), [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small), [EmbeddingGemma](https://ai.google.dev/gemma/docs/embeddinggemma/model_card), [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B), [OpenJev](https://github.com/daseinlabs/open-jev), [Gemma 3 sizes](https://ai.google.dev/gemma/docs/get_started), [Gemma 3 model card](https://ai.google.dev/gemma/docs/core/model_card_3), [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4), [Gemma terms](https://ai.google.dev/gemma/terms), [GLiNER](https://github.com/urchade/GLiNER), [GLiREL](https://github.com/urchade/GLiREL), [ONNX Runtime](https://github.com/microsoft/onnxruntime), [llama.cpp](https://github.com/ggml-org/llama.cpp), [OpenVINO](https://github.com/openvinotoolkit/openvino).
- Retrieval research: [LightRAG](https://github.com/HKUDS/LightRAG), [LazyGraphRAG Microsoft Research](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/), [HippoRAG 2](https://arxiv.org/abs/2502.14802), [RAPTOR](https://arxiv.org/abs/2401.18059), [late chunking](https://arxiv.org/abs/2409.04701).
