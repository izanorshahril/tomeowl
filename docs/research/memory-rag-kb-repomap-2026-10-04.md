# Tomeowl as memory, RAG retrieval, knowledgebase, and repository map

This note describes the pre-follow-up assessment; the subsequent [native capability guide](../CAPABILITIES.md) records what is now delivered and its limits.

Checked 2026-10-04 against the local implementation and primary upstream sources.
This is an assessment and proposed sequence, not a shipped capability or comparative benchmark.
Keep the frozen UI, SQLite evidence catalog, and compiled CLI as the common foundation; other tools remain optional.

## Current fit

| Use | Shipped foundation | Missing requirement |
| --- | --- | --- |
| Knowledgebase | Local document/caption ingestion, lexical search, revisioned citations, and explicit-reference graph | Stable portable collection identity, repeatable ingest configuration, richer metadata, lifecycle and restore workflow |
| RAG retrieval | Scoped `search`, `neighbors`, `path`, and bounded `context` packets | Better excerpt selection and relevance evaluation; optional consumer or generator for answers |
| Durable memory | Ordinary Markdown/transcript sources can be stored and retrieved | Explicit memory admission, namespace, update/conflict, expiry, retraction, and history semantics |
| Repository map | Code-text indexing, source inventory, and recorded document links | Definitions/signatures, syntax references/imports, language coverage, and a query-relevant bounded outline |

These claims follow [ingestion](../../src/ingest.ts), [store](../../src/store.ts), [context assembly](../../src/context-query.ts), [domain records](../../src/domain.ts), and the [native query contract](../NATIVE-QUERIES.md).
There are no external package dependencies in the [manifest](../../package.json).
Graph positions are presentation coordinates, not evidence of dependency or relevance.

## Local reliability prerequisite

The [local audit evidence](../../data/capability-review-2026-10-04/memory-kb/verification.json) reproduces three catalog synchronization failures on task-owned fixtures in Bun 1.4.2 on Windows.
Re-ingesting one file removes an indexed sibling and its relationship even though the sibling still exists; scanning an emptied directory leaves deleted content searchable.
A synthetic second-scope write failure or relation-insert failure leaves earlier source changes committed despite the ingest command failing.
These are verified local implementation findings, not claims about the upstream systems below.
Fix catalog reconciliation and commit all staged sources, chunks, pruning, and relationships atomically before building memory lifecycle or improving retrieval quality.
Treat a file root as a targeted update, reconcile an authoritative empty directory scope, and keep bounded or incomplete scans from silently pruning inventory they did not inspect.

## What the reference systems establish

The original RAG paper combines a language generator with a retriever over external, non-parametric memory; its evaluated architecture uses dense Wikipedia retrieval and fine-tuning.
Tomeowl supplies retrieved, cited material that a caller can use for generation, but does not implement that paper's trained model or answer generation.
The proposed practical contract is `question -> scoped evidence packet -> caller's generator -> cited answer`, with the generator optional. [Original RAG paper](https://arxiv.org/abs/2005.11401v4)

LangChain's first-party memory overview distinguishes thread-scoped conversation state from cross-session memory in a custom namespace.
It also separates facts, experiences, and procedures; storing facts is distinct from embedding-based semantic search.
Borrow those distinctions, without adopting LangGraph: an indexed transcript is an archive, while a durable preference or decision needs an intentional lifecycle and recall policy. [Memory overview](https://docs.langchain.com/oss/python/concepts/memory)

Aider's repository map exposes selected files and important definitions/signatures, then ranks relevant portions into a model context budget. [Aider repository-map documentation](https://aider.chat/docs/repomap.html)
Its inspected implementation extracts definition/reference tags with tree-sitter, builds name-based file edges, applies personalized PageRank, and renders selected definition lines.
Some languages use lexical reference fallback, so this is useful structural context rather than proof of fully resolved runtime calls. [Aider implementation](https://github.com/Aider-AI/aider/blob/main/aider/repomap.py)

## Recommended improvements

1. **Improve native packets before adding models.**
   Today keyword excerpts can clip from the beginning of a matching chunk, and recorded-link expansion selects the linked source's first chunk.
   A relevant passage later in either chunk/source can therefore be omitted from a small packet.
   Select a query-centered window with accurate locator spans, and choose relevant linked chunks before spending output budget.
   Add source diversity and adjacent section context only when evaluation improves.
   SQLite already offers query-sensitive `snippet()` and weighted BM25 columns, although its snippet token limit and reconstructed locators need explicit handling. [SQLite FTS5](https://sqlite.org/fts5.html#auxiliary_functions)

2. **Make knowledgebases portable and repeatable.**
   Current source IDs hash absolute file paths, so rebuilding the same relative tree at another root changes identity; collection names default to a root basename.
   Propose an explicit collection ID, root binding, include/exclude policy, and relative logical path, with content revision remaining separate.
   Preserve the existing version-1 catalog and frozen snapshot contract through an explicit migration or opt-in manifest adapter.
   Add catalog status/coverage, missing or changed file checks, deterministic re-ingest, and backup/restore verification.
   SQLite offers online backup and `VACUUM INTO` for consistent live database copies; test the selected Bun binding path rather than assuming ordinary file copy is a live backup. [SQLite backup documentation](https://sqlite.org/backup.html)

3. **Specify durable memory independently of ingest cache.**
   `replaceScope` currently replaces chunks when a source revision changes and prunes missing sources after an eligible complete scan.
   That is useful index maintenance but does not retain historical memory claims.
   Start with explicitly authored Markdown decisions/preferences retrieved as ordinary knowledgebase documents.
   For a native memory lifecycle, propose stable memory IDs with namespace, fact/experience/procedure kind, assertion text, evidence or explicit-author attribution, active/superseded/retracted status, timestamps, optional expiry, and replacement links.
   Updates should preserve history under a stated retention policy; forgetting must define effects on current retrieval, retained versions, exports, and backups.
   Relevance scopes are not access-control boundaries.
   Conflicting claims should remain distinguishable, and retrieved documents or conversation excerpts should not silently become accepted procedural instructions.

4. **Add repository structure in two honest levels.**
   First provide a manifest/file outline plus JS/TS import and exported-name inventory using the existing Bun runtime.
   Bun's `Transpiler.scan()` exposes imports and export names but ignores type-only records; its documented output does not provide full definition spans/signatures. [Bun transpiler API](https://bun.com/docs/runtime/transpiler#scan)
   This can support a clearly limited module map after verifying behavior in pinned Bun 1.4.2 and the compiled executable.
   A later optional parser worker can return typed definitions, signatures, exact revision/span citations, and unresolved reference candidates for explicitly supported languages.
   Keep syntactic references, resolved imports, approximate name matches, and model suggestions distinguishable; do not call them proven call edges.
   Cache derived records by source revision plus parser/query version, and invalidate them on change.

5. **Offer a small agent-facing contract.**
   Keep CLI JSON as the default integration surface.
   Add deterministic Markdown context export and a caller-owned generator example only after the packet contract is tested.
   Current character limits count quoted UTF-16 text, not JSON metadata or model tokens.
   Add a separate serialized-byte bound; expose exact model-token budgets only with an identified tokenizer, or clearly label estimates.
   Consumers should receive freshness, omissions, scope, and citation identities alongside excerpts.
   MCP, semantic embeddings, rerankers, qmd, Graphify, and parser/model workers can remain optional adapters after a measured need.

## Minimal sequence and evaluation gates

| Stage | Bounded deliverable | Evidence needed before expansion |
| --- | --- | --- |
| 0 | Correct targeted-file and empty-scope reconciliation; one all-scope sources/chunks/relations commit per ingest | Existing sibling survives file-root update; authoritative emptied scope removes deleted hits; bounded scans preserve unseen sources; injected second-scope and relation failures restore the complete previous catalog |
| 1 | Fixed query set; query-centered excerpts; relevant linked chunks; serialized packet bound | Recall@5/10 and reciprocal rank on annotated passages; no citation/scope regression; irrelevant expansion rate; quoted/serialized size; warm/cold p95 latency |
| 2 | Portable collection manifest, status and backup/restore contract | Relocated corpus preserves logical identities; complete versus bounded scans disclose omissions; restore returns equivalent evidence; changed/deleted-file fixtures pass |
| 3 | Memory lifecycle specification and one explicit authored-memory workflow | Namespace isolation, supersession/conflict, expiry, forget/restore, and evidence retention fixtures; zero silent promotion of archive text into accepted memory |
| 4 | Native module outline, then optional syntax worker for one language | Known definitions/imports recovered; unsupported and type-only coverage disclosed; references classified honestly; deterministic output within declared budget |
| 5 | Optional semantic channel or generator | Measured improvement on paraphrase/cross-language/answer tasks; citation support and abstention evaluated separately; recorded model/runtime cost and target-platform packaging |

Use research documents, project manifests, a small code fixture, explicit memory notes, and contradictory/expired/missing evidence cases in the evaluation set.
Generated-answer quality, native retrieval quality, and memory lifecycle correctness require separate measurements.
Do not infer a retrieval-quality score from the existing functional test count or transfer upstream benchmark results to Tomeowl.

## Limits of this assessment

Source inspection, upstream documentation, and the linked synthetic catalog audit support these recommendations; no new implementation, dependency, model download, or corpus upload was performed.
No native memory command, semantic retrieval, syntax worker, true symbol repomap, portable catalog migration, or answer generator is claimed as shipped.
The Bun module scanner and backup path remain proposed experiments on the pinned target runtime.
The existing [native retrieval decision](native-retrieval-2026-10-04.md) and [backend research](backend-options-2026-10-02.md) remain inputs rather than being replaced.
