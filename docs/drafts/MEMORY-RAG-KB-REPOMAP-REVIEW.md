# Memory, RAG, knowledgebase, and repomap review

Status: historical assessment of the build before the native capability follow-up on 2026-10-04.
The three catalog defects below are now repaired, and native packet, portable collection, explicit memory, module-map and backup/restore improvements are delivered in the [capability guide](../CAPABILITIES.md).
The findings, line references and before-build audit scripts below remain historical evidence; current regressions in `tests/` verify repaired behavior.
Wider archive/migration, parser, model and evaluation proposals remain future gates.

Reviewed 2026-10-04 on Windows with Bun 1.4.2.
This document assesses the shipped code and recommends future work; it does not deliver the proposed capabilities or repair the findings below.
The UI remains frozen as `ui-2026-10-04`.
The [current query contract](../NATIVE-QUERIES.md), [platform vision](PLATFORM-VISION.md), and [modernization draft](MODERNIZATION-SPEC.md) are inputs to this review.
The [primary-source research](../research/memory-rag-kb-repomap-2026-10-04.md) records the upstream comparisons and their limits.

## Recommendation

Keep one local evidence catalog, with separate retrieval, accepted-memory, and repository-structure capabilities over it.
Keep SQLite, native CLI JSON, and the existing offline viewer.
qmd, Graphify, embeddings, models, and MCP can remain optional integrations; none is required for the first useful version of these capabilities.
Fix catalog synchronization first, then improve retrieval quality and portable identity.
Build intentional memory and a limited native module map as independent slices after those foundations are reliable.
Do not adopt a new database or broad agent framework without a measured requirement.

| Use | What works today | What makes it dependable next |
|---|---|---|
| Knowledgebase | Selected document/code/transcript ingestion, lexical search, located citations, explicit document references, offline maps | Correct refresh/deletion, named collection manifests, metadata and aliases, source status, consistent backup/restore |
| RAG | Native scoped `search`, `neighbors`, `path`, and cited `context` packets for a caller's generator | Relevant excerpts, source diversity, section context, real output budgets, retrieval evaluation, answer citation/abstention checks in the consumer |
| Memory | Authored Markdown decisions or preferences can already be indexed and recalled as documents | Stable memory IDs, deliberate admission, namespaces, correction/conflict/supersession, expiry, forgetting, retained supporting evidence |
| Repomap | Files can be inventoried and code text searched | Module/import structure first; later parser-derived definitions, signatures and located references with query-relevant packing |

Current citations identify the indexed revision; the catalog retains the current chunks rather than an archive of every historical revision.
A transcript is source history, a retrieved passage is evidence, and an accepted memory is an assertion with a lifecycle.
An inventory graph is useful navigation, but it is not yet a language-aware dependency map.

## Current defects to repair first

The three P1 findings below were reproduced with synthetic, task-owned fixtures rather than inferred only from source inspection.
They affect the current ingest contract, independently of whether memory or models are added.
Reproduction code, fixtures, acceptance checks, and observations are in the [catalog audit](../../data/capability-review-2026-10-04/memory-kb/REVIEW.md) and its [verification record](../../data/capability-review-2026-10-04/memory-kb/verification.json).
The catalog reproduction refuses an existing fixture directory to preserve its evidence.

| Finding | Reproduced outcome | Responsible code | Smallest repair |
|---|---|---|---|
| P1: file input prunes siblings | After ingesting two sibling documents, ingesting only one removes the other source, FTS hit and edge while its file still exists | [ingest.ts](../../src/ingest.ts), lines 31, 170, 210; [store.ts](../../src/store.ts), line 88 | Track selection intent separately from ownership; explicit file input only upserts selected files |
| P1: empty root keeps deleted evidence | Delete the last file and reingest its folder: `scopes=0`, `removed=0`; deleted text still appears in search/context | [ingest.ts](../../src/ingest.ts), lines 161, 184, 210 | Register successfully observed empty directory scopes and reconcile them; incomplete scans preserve unseen data and report omissions |
| P1: ingest can commit partially | Injected second-scope failure leaves the first scope updated; injected relation failure leaves changed chunks without intended new edges | [ingest.ts](../../src/ingest.ts), lines 210, 214; [store.ts](../../src/store.ts), lines 67, 104 | One transaction for all validated scopes, chunks, FTS changes and relationships; failure rolls everything back |

The release's existing 102 passing tests are useful behavioral evidence, but they did not cover these newly reproduced cases.
Do not interpret a successful command or an `indexed-revisions` freshness label as proof that synchronization is complete.
Once the fixes land, test targeted file updates, last-file deletion, bounded/skipped scans, overlapping roots, second-scope failure and relation failure through the ingest interface.

## Shared evidence foundations

**Portable identity.**
Source IDs currently hash absolute paths in [ingest.ts](../../src/ingest.ts), lines 179-182.
Relocating identical content produced the same revision hash and a different source ID in the catalog audit.
Introduce a stable workspace/collection ID, relative logical source path, and explicit local root binding before external clients persist memories or repomap references.
Two different projects containing `README.md` must remain distinct, while moving one project must preserve its logical identity.
Migration should retain aliases for existing IDs and preserve version-1 viewer exports; an explicit file-rename policy is also needed because relative-path identity alone does not survive renames.

**Evidence retention.**
Updating a source currently deletes previous chunks in [store.ts](../../src/store.ts), lines 79-81.
The audit captured an old citation, updated the decision, and observed `NOT_FOUND` on that chunk.
This is the documented current-index behavior, not a regression.
For accepted memories or retained reports, preserve the cited revision/span under a stated retention policy, with latest searchable content separate from historical evidence lookup.
Retaining only referenced revisions is a smaller starting point than archiving every revision forever.
Forgetting must account for retained revisions as well as active retrieval.

**Freshness and coverage.**
Publish catalog generation, indexed time, complete/partial scan status, and structured omission reasons.
Keep ordinary retrieval over captured indexed evidence; make checking originals an explicit bounded option.
The audit grew an indexed file to 16 MiB and confirmed [store.ts](../../src/store.ts), line 177, reads and hashes the entire current file despite the 2 MiB ingest bound.
No out-of-memory failure or blocked special-file behavior was tested.
Bound freshness verification and distinguish changed, missing, unreadable, and unverified states instead of forcing all into a single boolean.

**Backup and restore.**
Provide a consistent catalog snapshot plus collection/root bindings and a verified restore path.
Do not assume copying a live SQLite file produces a complete backup.
The native backup route remains a target-runtime experiment, supported by [SQLite's backup documentation](https://sqlite.org/backup.html).
Verify restored evidence and relocatable references, and state whether source documents and retained evidence are included.

## Retrieval and RAG quality

The existing packet is a useful interface: it retains revision/chunk locators, applies scope before selection, separates BM25 score from graph distance, and reports truncation.
It is the retrieval side of a RAG workflow; generated answering remains a caller responsibility.
The [original RAG paper](https://arxiv.org/abs/2005.11401v4) combines retrieval with generation, but adopting its dense retriever or trained model is not required to consume Tomeowl's evidence.

Improve these native behaviors before evaluating embeddings:

| Gap | Evidence | Proposed improvement and acceptance |
|---|---|---|
| One source can consume the packet | Global BM25 chunk order is admitted directly in [context-query.ts](../../src/context-query.ts), line 86; a two-source fixture returned three chunks from only one source | Deterministic per-source limits with sufficient candidate coverage; measure relevant-source recall rather than assuming diversity always improves answers |
| Clipping can remove the query hit | [store.ts](../../src/store.ts), line 127, and [context-query.ts](../../src/context-query.ts), lines 23-26, keep prefixes; a late `TARGET_IDENTIFIER` hit became `An introdu` at ten characters | Query-centered windows with exact subspan locators; test late/multiline hits, Unicode and tiny budgets |
| Graph expansion ignores relevant later sections | [context-query.ts](../../src/context-query.ts), lines 93-106, selects the first chunk of reached sources | Select relevant chunks within the reached source, then citation-anchor context; label any introductory fallback and measure irrelevant expansion |
| Quoted-character limits do not bound the output | A manually inserted long title produced 36,695 serialized bytes for ten quoted characters | Separate serialized-byte ceiling, bounded metadata and optional identified tokenizer; retain honest UTF-16 character accounting |
| Chunking ignores document structure | [ingest.ts](../../src/ingest.ts), lines 110-124, batches lines around a character target | Section/paragraph/fence-aware Markdown and bounded transcript splitting, preserving exact locators; prove boundary-spanning questions |

The metadata fixture is a contract counterexample, not a claim about normal corpus size.
Reproducible packet cases are saved in the [retrieval verification record](../../data/capability-review-2026-10-04/retrieval/verification.json).
No retrieval-quality or large-catalog latency benchmark has been run in this review.
Relation endpoint indexes are absent in [store.ts](../../src/store.ts), and current adjacency SQL can scan more rows than the returned graph budget.
Inspect SQLite query plans and a bounded scaling fixture before deciding whether indexes or another engine are needed.

Build an annotated evaluation set from this project's research notes, selected project manifests from the existing `D:\Dev` sample, and small synthetic code/memory fixtures.
Include identifier, phrase, paraphrase, cross-document, late-section, contradiction, expired-memory and unanswerable questions.
Measure passage/source Recall@5/10, reciprocal rank, citation validity, irrelevant expansion, serialized size and warm/cold p95 latency.
Evaluate generated answer support and abstention separately if a caller adds generation.
Only add semantic retrieval or reranking after this set demonstrates a gap worth its runtime and distribution cost.

## Intentional memory

Start with explicitly authored decision/preference notes as normal knowledgebase sources.
Then add a small accepted-memory record with `id`, `namespace`, `kind`, assertion, origin/actor, evidence references, created/updated time, status, optional expiry and supersession links.
Kinds can begin with fact, preference, decision and procedure; model suggestions stay distinguishable from accepted records.
Scope defaults should be explicit, such as workspace/project, with deliberate promotion into a global namespace.
Do not silently promote transcript text or retrieved procedural instructions into accepted memory.

A minimal lifecycle is create -> recall -> correct/supersede -> retract/expire -> forget.
Default recall excludes superseded, retracted and expired assertions, while conflicting active assertions remain visible with their origins.
Correction should preserve its explanation and supporting evidence without pretending an unsupported assertion is verified.
Forgetting needs two clear operations: remove from active recall, and purge owned content/derived copies under the selected retention policy.
External originals, prior exports and backups are separate copies; report their disposition honestly rather than promising a global erase.
Prevent reimport of a deliberately forgotten memory according to its source/namespace policy.
CLI writes must be explicit, transactional and idempotent; namespace, expiry, conflict, supersession, retained-citation and forget/restore fixtures precede agent integration.
The distinction between thread state and cross-session memory is supported by the [first-party memory concepts](https://docs.langchain.com/oss/python/concepts/memory); no LangChain dependency is proposed.

## Repository maps and literature graphs

Deliver a limited native module map first: files, manifests, JS/TS import paths, exported names, entry points and coverage warnings.
The existing Bun runtime offers `Transpiler.scan()` without a new package, but it ignores type-only imports/exports and its documented output lacks definition/signature spans.
Verify that scanner in pinned Bun 1.4.2 and the compiled Windows executable before adopting it. [Bun API](https://bun.com/docs/runtime/transpiler#scan)
A symbol repomap is a separate later capability requiring supported-language parsing for definitions, signatures and syntax references, plus query-relevant budgeted packing.
Aider demonstrates that richer approach using parser-derived tags and file ranking; its name-based references do not establish fully resolved runtime calls. [Aider map](https://aider.chat/docs/repomap.html), [implementation](https://github.com/Aider-AI/aider/blob/main/aider/repomap.py)

Cache derived records by source revision and parser/query version, with exact source spans and coverage status.
Keep resolved local imports, unresolved imports, syntax references, approximate name matches and model suggestions distinct.
Use a code fixture containing aliases, dynamic imports, type-only imports, duplicate symbol names and unsupported syntax to expose the supported boundary.
The current `D:\Dev` atlas records observed project inventory and selected evidence; it does not establish a complete dependency graph across every project.

For literature review, reuse real research notes and their located citations first.
Separate note -> cited paper, paper -> topic, and claim -> supporting/contradicting passage relationships.
Shared citation URLs show a recorded connection; they do not prove that papers agree or support the same claim.
Unfetched URL records remain bibliographic metadata until actual paper content is ingested.
Add DOI/URL aliases and explicit claim evidence later, without replacing the frozen viewer or inferring relations from its visual proximity.

## Lean module boundaries

Strengthen the current modules before rearranging directories.
Put complete ingest commits, root reconciliation, identity and retained evidence behind the catalog interface so memory and retrieval cannot each implement their own storage lifecycle.
Keep `contextPacket` as the deep retrieval interface; it owns candidate selection, citations, scope and budget accounting rather than exposing several provider-specific steps to CLI callers.
Add memory as its own assertion/lifecycle module and repomap as its own derived-structure module when those slices are implemented.
The existing CLI remains a thin command adapter, and the frozen viewer consumes its existing snapshot projection.
Add optional parser/model/MCP adapters only when a concrete second implementation or consumer justifies the seam.
Do not create separate databases, duplicated source catalogs or a universal untyped node system for each use case.

## Delivery order and gates

These are proposed slices, not implementation tickets or shipped commands.

| Order | Slice | Completion gate |
|---|---|---|
| 0 | Repair targeted updates, empty-root reconciliation and atomic ingestion | Synthetic defects become regressions; failure leaves sources/chunks/FTS/edges unchanged; partial scans preserve unseen evidence |
| 1 | Retrieval evaluation, query-centered/source-diverse packets, serialized output bound | Fixed corpus shows retained or improved retrieval relevance; accurate locators, scopes, omissions and all output bounds pass |
| 2 | Portable collection manifest, root rebinding, freshness/coverage, verified backup/restore | Relocation preserves logical IDs; existing citation aliases resolve; backup/restore evidence matches; original reads stay bounded |
| 3a | File-backed memory, explicit accepted lifecycle and retained supporting evidence | Namespace, contradiction, correction, expiry, retraction, forgetting and historical-citation fixtures pass |
| 3b | Limited native JS/TS module map | Deterministic import/export inventory with explicit missing/type-only coverage, within budget, in compiled runtime |
| 4 | Optional symbol parser, semantic channel or generator, selected independently | Each addition improves a named evaluation task and has verified target-platform packaging, resource bounds and provenance |

Memory and module mapping can proceed independently after the shared gates; neither requires the other to be finished.
The recommended next implementation is slice 0, because it fixes current behavior rather than adding another feature over unreliable refresh semantics.
For personal CLI use, collection/path are selection filters; they are not access-control boundaries.
Any future agent adapter should intersect requested scope with its configured allowed catalog/roots, while multiuser hosting remains a separate requirement.

## Review evidence and limits

Two independent code audits covered catalog/memory and retrieval/repomap, with a third agent checking primary-source research.
Catalog repros and packet counterexamples use synthetic local fixtures; no documents were uploaded and no tools or packages were installed.
Application source, executable, database schema and viewer behavior were not changed.
The full application release suite was not rerun for this assessment; its last recorded result remains 102 tests and 1,601 assertions in [status](../STATUS.md).
This review adds reproducible findings and a narrowed roadmap, with the defects still open.
The [assessment verification](../../data/capability-review-2026-10-04/verification.json) records seven catalog observations, four packet checks, documentation link checks, twenty unchanged viewer hashes and the unchanged release executable.
An independent final audit checked the review's outcomes and source citations against the reproductions and found no material inaccuracies.
