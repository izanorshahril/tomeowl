# Retrieval, memory lifecycle, and evaluation

Research date: 2026-10-01, Asia/Kuala_Lumpur.
These findings inform a proposed design, not implemented capabilities.
Public papers were inspected through their abstracts/project pages; their experiments were not reproduced.

## Memory and RAG solve different parts of the problem

Tomeowl should distinguish source knowledge (manuals, code, schematics, specifications), episodic evidence (session events and outcomes), durable memory (accepted decisions and lessons), and procedural knowledge (linked workflows).
This is a proposed product taxonomy, not a claim that every surveyed system implements it.
Source retrieval needs exact references and revision filtering; durable memory additionally needs admission, correction, supersession, and deletion.
Keeping raw evidence alongside derived notes allows a user to verify or rebuild the notes.

## Recent evidence that changes the design

| Source | Observed finding | Proposed consequence | Limit |
|---|---|---|---|
| [Revoked but Still Authoritative](https://arxiv.org/abs/2609.08258), submitted September 8 | In the authors' tested configurations, soft revocation was not enforced by default across five memory systems. | Exclude revoked/superseded facts from normal retrieval before ranking and packing; expose history only explicitly. | Abstract inspected; configurations and results not independently reproduced. |
| [The Memory Trust Gap](https://arxiv.org/abs/2609.01852), submitted September 1 | Stale memory can override current authoritative evidence; metadata alone did not consistently fix this across model sizes. | Resolve revision conflicts in the retrieval layer; show unresolved conflicts and abstain rather than relying on prompt wording. | Closed-set study, not an ATE validation. |
| [Copilot agentic autofix memory](https://github.blog/changelog/2026-09-25-agentic-autofix-now-uses-copilot-memory/), September 25 | Autofix retrieves repository memories and stores patterns learned from fixes for reuse by other Copilot features. | Capture lessons with repository scope and evidence of an observed result. | Product behavior announcement, not an accuracy benchmark or portable backend. |
| [MemDelta](https://arxiv.org/abs/2606.29914), June 29 | Memory comparisons can change with embedding/reader models and retrieval configuration; write-path costs matter. | Match models, data, budgets, and hardware; account for ingestion and consolidation as well as query costs. | Preprint; use methodology guidance rather than treating reported scores as universal. |
| [LongMemEval-V2](https://xiaowu0162.github.io/longmemeval-v2/) | Evaluates environment experience, including workflow knowledge, state changes, gotchas, and premise awareness, with accuracy and latency. | Add corrected-decision and recurring-workflow cases to local evaluation. | Web-agent histories do not validate semiconductor engineering accuracy. |

September papers are recent and directly relevant to lifecycle design, but their maturity is below established production documentation.
No download, citation, or sentiment ranking was verified for these papers; recency does not establish popularity.

## Frameworks to learn from without importing their stacks

| Option | Verified characteristic | Tomeowl fit |
|---|---|---|
| [Microsoft GraphRAG](https://github.com/microsoft/graphrag) | Graph-based retrieval methodology; repository explicitly warns that indexing can be expensive. | Study graph-assisted synthesis later; unnecessary as the first mandatory stack. |
| [LightRAG](https://github.com/HKUDS/LightRAG) | Offers configurable storage and parser integration; recommends PostgreSQL for production and documents parser sidecars. | Learn interchange and ingestion lifecycle patterns; adoption requires comparing its runtime and write costs against existing tools. |
| [LlamaIndex](https://github.com/run-llama/llama_index) | Modular core and integrations; current repository describes a focus on parsing/extraction, including LiteParse and LlamaParse. | Evaluate a specific parser separately; adding the whole framework is not required for retrieval orchestration. |

Recommendation: qmd handles existing textual search, Graphify supplies available graph artifacts, and Tomeowl owns provenance, scope, revision rules, context packing, and inspection.
Add a replacement search/graph engine only after an adapter limitation is measured.

## Local evaluation proposal

Use two corpora: a small software repository and a semiconductor-oriented repository plus explicitly synthetic missing documents.
Record corpus manifest, hashes, exclusions, installed tool versions, model identifiers, configuration, machine resources, and run dates.
Keep private corpus contents local.

Compare these paths on the same answerable questions:

1. Current manual file search and current qmd + Graphify workflow.
2. qmd-only retrieval with the same context budget.
3. Tomeowl orchestration with lexical/exact lookup, qmd search, and bounded graph expansion.
4. Optional expensive semantic/reranked mode, with cold and warm runs separated.

Score retrieval independently from answer generation.
Use annotated source spans and entity/edge IDs for recall@k, citation precision, multi-hop evidence completeness, and missed/conflicting revisions.
Measure payload tokens, total reader tokens where available, tool-call count, p50/p95 latency, index time, peak memory, disk size, and write-path model costs.
FTS computation does not use model tokens, but returned snippets and tool envelopes do.
If an exact tokenizer is unavailable, report character/byte counts and label token estimates.

Start with 30 reviewed cases: 10 software/workspace, 10 semiconductor relationships/limits, 5 revision or contradiction cases, and 5 missing-evidence cases.
Partition tuning and held-out questions; do not tune and claim success on the same set.
Include exact identifiers, aliases, unit conversions, operating-condition footnotes, project isolation, deleted sources, repeated imports, and source changes.
Synthetic cases must be labeled and cannot establish performance on real scanned manuals or proprietary schematics.

Proposed acceptance gates, subject to review:

- Every returned engineering claim and graph edge has a resolvable source reference or an explicit inferred/unverified label.
- No revoked fact, wrong-project source, or incompatible revision appears as active evidence in the negative tests.
- Recall and evidence completeness meet or exceed the existing workflow at the same context budget.
- Aim for at least 30% less packed context on answerable cases without quality loss; this is a target, not an established saving.
- Query latency and total task time are reported separately; do not accept a smaller payload that makes typical turns materially slower.

Suggested budgets for the first experiment are 2k, 4k, and 8k tokens per pack.
Default deterministic lookup should avoid a query-time LLM.
LLM extraction or synthesis is optional, explicit, cached, and included in cost reports.

Done: primary-source evaluation review and proposed local test protocol.
Next: review PLAN.md, then create fixtures and measure the existing workflow before implementation.
