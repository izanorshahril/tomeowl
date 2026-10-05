# Implementation sequence

## Native capability follow-up, 2026-10-04

The [capability guide](CAPABILITIES.md) records the delivered catalog repairs, portable collection manifests, stronger context packets, explicit memory workflow, native module map and backup/restore.
The [status](STATUS.md) contains the current verification evidence; the earlier [review](drafts/MEMORY-RAG-KB-REPOMAP-REVIEW.md) is a historical assessment of the pre-fix build.
Keep the UI frozen and build future slices against the existing CLI/module interfaces.
The [research-note retrieval evaluation](RETRIEVAL-EVALUATION.md) now supplies the first corpus-level baseline and fixes actual-span excerpt selection without changing ranking or UI.
Next measured gates are packet chunk selection/diversity on broader independent labels, richer language parsing, legacy-ID migration/rename policy and optional semantic recall; no new provider is a prerequisite.

## First release

Establish the domain records and versioned SQLite store before ingestion or presentation.
Build line-based and caption parsers behind a bounded explicit-root ingestion interface.
Prove revision replacement and citation retrieval through the same interfaces used by the CLI.
Build the snapshot exporter and modular viewer independently of the database.
Generate and embed browser assets before compiling the executable.
Add qmd projection and Graphify parsing as optional derived integrations with explicit provenance.
Exercise the release against public Viberaven transcripts and three selected project README files.

## Context and memory distinction

A source is an original document or transcript identified by its canonical location.
A chunk is a revisioned searchable excerpt with a locator.
A relationship is a typed claim backed by provenance; a visual collection is only a grouping.
A context packet is a bounded query result, not a persistent memory.
An accepted memory is an intentionally admitted assertion or procedural note with its own lifecycle and captured evidence references, delivered by the [memory workflow](CAPABILITIES.md#explicit-memory).
These concepts must not share an undifferentiated node table or implicit writeback behavior.

## Later milestones

The user's 2026-10-04 direction makes native retrieval the primary next backend capability while the UI/UX remains frozen.
The native slice delivers scoped any/all/phrase search, bounded cited context assembly, and provenance-preserving neighborhood/path traversal over recorded links.
Its [query guide](NATIVE-QUERIES.md) defines the shipped flags and budgets; subsequent retrieval-quality and large-catalog performance work should use a declared evaluation set.
An external retriever, extractor, parser, or model is optional and must leave ordinary native indexing/search/source lookup/export usable when absent.
The [native retrieval decision](research/native-retrieval-2026-10-04.md) defines the distinction from full qmd or Graphify parity.

| Milestone | Trigger | Acceptance condition |
|---|---|---|
| Retrieval adapters | Fixed query set shows gaps after native retrieval improvements | Compare optional providers such as qmd with citation correctness, latency, corpus coverage, local resource costs, and operation with the provider absent |
| Code graph import | Real dependency questions require it | Current paths and revisions validated; extracted and inferred edges remain distinguishable |
| Harness interaction | Repeated CLI usage establishes required mutations | Versioned JSON interface with idempotent writes, explicit scope, and bounded output |
| Durable memory | Accepted facts need reuse across sessions | Supersession, contradictory claims, expiration, evidence, deletion, and audit rules specified and tested |
| Domain ingestion | Approved nonconfidential sample corpus exists | Tester identifiers, schematic references, page/table locators, revisions, and units preserved |
| Desktop shell | Browser export prevents a demonstrated workflow | Reuse the same headless core and viewer; no duplicate data model |

The archived prototype is available for comparisons and recovery; no active command reads its database by default.

## Recommended modernization sequence

Use [M0-M6 in the modernization specification](drafts/MODERNIZATION-SPEC.md) for the next presentation-focused work.
The bounded M1/E0 atlas slice is delivered with the evidence recorded in [STATUS.md](STATUS.md); wider draft requirements remain proposed.
The concrete [UI slice in the current specification](SPEC.md#ui-design-slice-2026-10-03) is now the execution contract for M1/E0.
It delivers two real local sample corpora and optional 3D perspective alongside grouped navigation, meaningful categorical color, readable evidence, stable selection, and Engineer/Presentation presets.
Start from the existing viewer and versioned snapshot rather than a new frontend framework or database.
Evaluate optional embeddings and selected-reference heat coloring in M2, and neutral table/Vega-Lite/Deneb export in M3.
Classification/extraction, scaling engines, and a corporate pilot follow their own quality, packaging, and evidence gates.
The broader milestones above remain possible future work; durable memory and harness integration do not block this UI iteration.

## UI tracer bullets

The [local ticket index](../.scratch/ui-direction/README.md) gives independently verifiable slices and their real blocking edges.
Each slice exercises a complete user outcome through scoped input, neutral projection, presentation, and relevant behavior checks.
The [decision map](decisions/ui-direction/MAP.md) separates resolved UI direction from future capability decisions.

| Slice | User-visible result | Proof |
|---|---|---|
| Grouped atlas | Recognize corpus and collections, enter a neighborhood, inspect a source, and return to overview | Counts, unassigned path, stable selection, readable labels, keyboard journey |
| Real sample corpora | Choose project documentation or repository research notes with honest scope/coverage | Bounded read-only discovery, idempotent catalog imports, explicit skips and usable exported maps |
| Relationship evidence | Follow a recorded reference and inspect why it exists | Supporting passage, revision/locator, relation-kind label, distinct membership encoding |
| Optional 3D | Rotate a perspective map while retaining selected source and evidence | Noncoplanar depth/rotation proof, reset/zoom alternatives, same evidence in 2D and 3D |
| Resumable accessible presentation | Restore a profile and complete core tasks in still, keyboard, and narrow-screen flows | Corrupt-storage fallback, reduced motion, focus/panel recovery, offline output, independent rubric review |

Do not report these slices complete until their acceptance evidence is recorded in [STATUS.md](STATUS.md).
The independent 9/10 UI target is a review gate under the current rubric, while the user's future rating remains their own assessment.

## Future literature gate

The research-note demonstration validates organization, explicit reference edges, and passage inspection using already available inputs.
It does not complete E1's bibliography import, duplicate/version review, screening decisions, claim/method matrix, or richer document locators.
Implement one declared bibliography-to-evidence journey before extending to providers or PDF workers, with neutral export and portable identity migration proved together where needed.
Measurement, STDF, and read-only program slices remain separate capability gates with their existing data-semantics fixtures.
