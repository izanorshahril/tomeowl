# Tomeowl Architecture and Memory Integration Research

> Historical pre-research, retained for context.
> Detailed capabilities and performance figures below are hypotheses unless independently sourced in the newer research notes.
> The current review proposal is [PLAN.md](PLAN.md), which reuses qmd + Graphify rather than committing to the replacement engine below.
> See [baseline corrections](RESEARCH-BASELINE.md), [memory systems](RESEARCH-MEMORY.md), [ingestion](RESEARCH-INGESTION.md), and [evaluation](RESEARCH-EVALUATION.md).

This document compiles primary-source research on agent memory architectures, coding harnesses, and retrieval systems across the local workspace and broader ecosystem.
It establishes the technical foundation for Tomeowl as an interactive, local-first memory and context engine.
Every section links observed capabilities to implementation decisions for Tomeowl.

---

## 1. Primary Source Systems Research

### 1.1 Oh My Pi (`can1357/oh-my-pi`) Memory Subsystem

Oh My Pi provides five distinct memory configurations via `memory.backend` in `config.yml`: `off`, `local`, `hindsight`, `mnemopi`, and `sharpshooter`.

#### Local Summary Pipeline (`memory.backend: local`)
- The local pipeline uses a two-phase background extraction and consolidation pipeline executed on session boundaries.
- Phase 1 reads modified past sessions and extracts durable technical decisions, environment constraints, and resolved failures using a configured LLM role (`default`).
- Phase 2 consolidates extracted memories across sessions into three disk artifacts: `MEMORY.md` (curated long-term document), `memory_summary.md` (compact bootstrap text injected at session start), and `skills/` (procedural markdown playbooks).
- Startup uses lease locks and heartbeat files to prevent race conditions during concurrent harness launches.
- Explicit durable lessons are captured through the `learn` tool into `learned.md`, which is prepended newest-first, deduplicated, and capped at 100 entries.
- Prompt injection shares a bounded token budget (`memories.summaryInjectionTokenLimit`, default 5000 tokens) between `memory_summary.md` and `learned.md`.
- Read access is exposed via internal protocol paths: `memory://root`, `memory://root/MEMORY.md`, and `memory://root/learned.md`.

#### Mnemopi SQLite Backend (`memory.backend: mnemopi`)
- Mnemopi (`@oh-my-pi/pi-mnemopi`) is an embedded SQLite memory engine supporting multi-bank scoping.
- Scoping modes include `global` (one shared database), `per-project` (database derived from repository root path hash), and `per-project-tagged` (project-local writes with global recall visibility).
- Polyphonic Recall (`mnemopi.polyphonicRecall`): Fuses reciprocal rank fusion (RRF) across vector similarity, full-text search (FTS5), entity graphs, fact tables, and temporal recency voices.
- Proactive Linking (`mnemopi.proactiveLinking`): Dynamically extracts entities and links new memories into an episodic graph during ingestion.
- Exposes five agent tools: `recall` (previews with IDs), `retain` (explicit fact writes), `reflect` (synthesis across memories), `memory_edit` (update/forget/invalidate by ID), and `learn`.
- Full-row resolution is available through `memory://<memory-id>`, returning a complete YAML frontmatter header (importance, veracity, timestamp, session ID, metadata) to prevent accidental truncation during updates.
- Injects recalled context before compaction (`preCompactionContext`) so essential memory is retained across context pruning.

#### Hindsight Remote Backend (`memory.backend: hindsight`)
- Integrates with a standalone Vectorize Hindsight daemon over HTTP (`http://localhost:8888`).
- Organizes storage into bank scopes with per-project tags based on lowercased checkout roots.
- Automatic recall runs on turn 1 (`hindsight.autoRecall: true`), and automatic retention triggers every three completed user turns.
- Exposes mental-model lifecycle management via `/memory mm` (`list`, `show`, `refresh`, `history`, `seed`, `delete`, `reload`).
- Recall acts as background context rather than directive prompt instructions, preventing model hallucination of authority.

---

### 1.2 Jcode (`1jehuang/jcode`) Embedded Memory Architecture

Jcode is a high-performance Rust coding agent harness designed for low-overhead multi-agent swarms.

#### Memory Decisions without Vector Overhead
- In standard builds, Jcode excludes ONNX and heavy tokenizer runtimes, reducing baseline resident set size to 27.8 MB RAM (compared to 144 MB for Pi, 371 MB for OpenCode, and 386 MB for Claude Code).
- Startup time to first frame is 14 ms, and time to first input is 48.7 ms.
- Jcode replaces vector similarity scans with Jev Typed Relevance Decisions (`J`).
- Recall evaluates active memories directly against the prompt using a designated evaluator model (`memory_jev_provider` and `memory_jev_threshold`).
- Bypasses traditional token-tax RAG indexing and embedding recomputation when files or sessions change.
- Scoping partitions state into local project memories (`P`) and local global memories (`G`).
- Every memory within active scope is evaluated for eligibility without artificial time decay or prerequisite vector fields.
- The dense vector embedding pipeline is preserved strictly as an opt-in Cargo compilation feature (`--features embeddings`) for historical benchmarking.

---

### 1.3 Hermes Agent (`NousResearch/hermes-agent`) Persistent Memory

Hermes Agent implements a consent-aware, dual-tier memory system optimized for model cache stability.

#### Dual Markdown Memory Model
- Personal notes and operational rules live in `~/.hermes/memories/MEMORY.md` (strict 2,200 character cap, approximately 800 tokens).
- User profile facts and interaction preferences live in `~/.hermes/memories/USER.md` (strict 1,375 character cap, approximately 500 tokens).
- The system prompt injects these files as a frozen snapshot at session start with section sign (`§`) delimiters and explicit capacity percentages.
- Frozen snapshots preserve provider prompt prefix caching across multi-turn interactions.
- Memory edits during a session take effect on disk immediately but do not invalidate the running session's prefix cache until the next session boundary.

#### Hard Capacity Gates and Maintenance
- The `memory` tool exposes `add`, `replace` (via unique substring matching), and `remove`.
- When an `add` or `replace` exceeds the character budget, the tool fails closed with an error payload listing current entries.
- The model is forced to consolidate overlapping entries or delete obsolete items within the same execution turn before retrying.
- Exact duplicates are rejected automatically.
- Inputs undergo regex threat scanning to block prompt injection, credential exfiltration patterns, and invisible Unicode payloads.

#### Session Search Subsystem
- Full conversation history is indexed into an embedded SQLite database (`~/.hermes/state.db`) using FTS5.
- The `session_search` tool queries historical messages across months of work with sub-20ms latency and zero model token cost.
- Procedural knowledge is isolated from factual memory and stored as executable playbooks in `~/.hermes/skills/`.
- Unattended memory writes can be routed through an approval staging directory (`~/.hermes/pending/`) before commitment.
- Learning progress and memory expansion can be visualized through the interactive terminal command `/journey`.

---

### 1.4 OpenClaw (`openclaw/openclaw`) Workspace Memory

OpenClaw stores agent memory as plain Markdown documents directly inside the agent workspace (`~/.openclaw/workspace/`).

#### Tiered Workspace Storage
- `USER.md`: Imperative user model directives with active/superseded tracking.
- `MEMORY.md`: Long-term curated facts and standing architectural decisions injected into bootstrap context.
- `memory/YYYY-MM-DD.md`: Append-only daily logs and session observation journals.
- `DREAMS.md`: Human-reviewable dream diary recording background consolidation passes.

#### Dreaming Consolidation Sweep
- Background scheduled sweep (sleep-time compute) consolidates daily notes into `MEMORY.md`.
- Candidates must pass deterministic score gates, recall-frequency thresholds, and query-diversity criteria.
- Untrusted, system-derived, and speculative items are taint-gated from promotion.
- Merges and supersessions are processed during idle periods, writing consolidated entries and summaries to `DREAMS.md`.

#### Pre-Compaction Automatic Memory Flush
- Before transcript compaction truncates a conversation, OpenClaw executes a silent housekeeping turn.
- The model is prompted to flush uncommitted facts, decisions, and constraints into daily memory files.
- Operates on a private conversation copy so housekeeping exchanges never pollute the permanent session transcript.

#### Pluggable Backends and Knowledge Wiki
- Backends include Builtin SQLite (FTS5 + vector search), LanceDB (`memory-lancedb`), and Honcho (`memory-honcho`).
- The `memory-wiki` plugin compiles durable memory into an Obsidian-compatible wiki vault with deterministic file structures, claim verification, contradiction alerts, and freshness auditing.

---

### 1.5 GBrain (`garrytan/gbrain`) Knowledge Brain

GBrain is an enterprise-scale personal and organizational knowledge brain created by Garry Tan, operating over 150,000 pages of notes, contacts, companies, and communications.

#### Architecture and Storage
- Implemented in TypeScript on the Bun runtime.
- Pluggable database layer: PGLite (WASM embedded Postgres, zero configuration) for local setups, or standard Postgres with `pgvector` for multi-agent and cloud deployments.
- Exposes a 7-verb memory protocol (`MEMORY_VERBS v1`): `recall`, `remember`, `entity`, `synthesize`, `forget`, `context_pack`, and `delta`.

#### Query Tiers: Search vs Think
- `gbrain search`: Raw hybrid retrieval combining BM25 keyword matching, vector embeddings, reciprocal rank fusion, source-tier boosting, and reranking.
- `gbrain think`: Synthesizes unified prose answers across entities with mandatory source citations.
- Built-in Gap Analysis: Identifies and prints what the brain does not know, missing citations, conflicting records, and stale time horizons.

#### Network Exposure and Multi-Agent Governance
- Exposes an MCP endpoint over Tailscale networks (`gbrain mcp expose`) with HTTPS, native OAuth 2.1, PKCE, and role-based access control (`read`, `write`, `admin`, `agent`).
- Distinguishes shared brain visibility from private personal facts via record-level visibility tags.
- Provides background ingestion daemons that parse notes, email archives, meeting transcripts, and web sources into typed knowledge graph relations.

---

### 1.6 ARMS Framework and the Video Baseline

The reference implementation ("Build your Ultimate Second Brain" by RoboNuggets) demonstrates four architectural layers:

1. **Applications**: Client interfaces where work occurs (IDE extensions, coding terminals, chat UIs).
2. **Routines**: Scheduled or event-driven background automations (sleep sweeps, morning briefings, compaction flushes).
3. **Memory**: The persistent retrieval engine combining semantic search, relational records, and entity graphs.
4. **Skills**: Modular, load-on-demand procedural workflows executing specific engineering tasks.

#### Component Technologies
- **QMD (Tobi Lütke / Shopify)**: Local markdown document engine using small local GGUF models (`embeddinggemma-300M` for embeddings, `qmd-query-expansion-1.7B` for query generation, and `Qwen3-Reranker-0.6B` for candidate scoring). Configured in the local workspace inside `tokenmill/.qmd/index.yml`.
- **Graphify (`Graphify-Labs/graphify`)**: Deterministic AST and document parser extracting function call graphs, module hierarchies, and markdown links without vector database dependencies.
- **Cost Reduction Result**: Reduces token consumption across codebases by 40% (dropping typical query footprints from 50k tokens to 30k tokens) by replacing brute-force file context dumps with scoped entity and snippet retrieval.

---

## 2. Comparative Matrix: Memory Tools and Frameworks

| System / Project | Runtime & Engine | Storage Format | Ingestion & Retention | Retrieval Mechanism | Token Reduction Approach | Cross-Session Portability |
|---|---|---|---|---|---|---|
| **Oh My Pi (omp)** | Node.js / Rust; SQLite (`mnemopi`) or Vectorize | SQLite DB, JSONL sessions, markdown artifacts | Turn-based retention (every N turns); background 2-phase consolidation | Polyphonic RRF (Vector + FTS5 + Graph + Facts + Recency) | Compact `memory_summary.md` + lazy `read memory://<id>` | High (exportable SQLite and Markdown) |
| **Jcode** | Rust (single native binary) | Disk files (`.jcode/`) | Per-turn explicit eligibility checks | Jev typed model relevance decisions (Zero-embedding default) | Zero-embedding startup; prompts receive only Jev-filtered records | High (plain local disk records) |
| **Hermes Agent** | Python / Rust | Markdown (`MEMORY.md`, `USER.md`) + SQLite FTS5 | Curated agent updates with hard character limits; consent gate | Frozen prompt snapshot + on-demand FTS5 `session_search` | Strict char caps (~1300 tokens max); zero token FTS5 search | High (standard markdown and SQLite) |
| **OpenClaw** | Node.js / TypeScript | Markdown workspace + SQLite / LanceDB | Pre-compaction silent turn flush; scheduled dreaming sweeps | Hybrid search (Vector + BM25) + `memory_search` tool | Markdown daily note distillation into compact `MEMORY.md` | High (Obsidian-ready Markdown files) |
| **GBrain** | TypeScript (Bun) | PGLite (WASM Postgres) or Postgres + pgvector | Continuous ingestion daemons; scheduled 24/7 dream cycles | 7-verb protocol; Hybrid RRF search vs `think` gap synthesis | `context_pack` verb; gap analysis prevents redundant searches | High (Tailscale MCP and OAuth 2.1) |
| **QMD** | C++ / Go / GGUF | Markdown directory + local vector index | File watcher and manual re-indexing | Hybrid BM25 + dense GGUF embedding + query expansion + rerank | Replaces whole repo dumps with ranked code/doc chunks | High (portable local files and models) |
| **Graphify** | Python CLI | Graph JSON / Markdown index | Deterministic AST code parsing and doc link extraction | Graph adjacency traversal and neighborhood lookups | Traversal returns only dependent modules and related interfaces | High (committed repository artifacts) |
| **Tomeowl (Target)** | Rust (single native binary) | SQLite (FTS5 + vectors) + Markdown mirror | Turn flushes, silent pre-compaction hooks, sleep sweeps | Polyphonic planner (BM25 + Dense GGUF + Graph + Recency) | Frozen prompt budget; deterministic AST graph; gap reporting | Maximum (single portable binary, MCP, CLI) |

---

## 3. Tomeowl Feature Synthesis

Tomeowl combines the strongest capabilities from the surveyed projects into a single, cohesive engine:

1. **Jcode's Low-RAM Native Engine**: Written in Rust as a single, portable binary. Avoids running heavy Python runtimes or external database servers by default.
2. **Hermes's Frozen Snapshot Pattern**: Keeps an always-available, hard-bounded memory block (`USER.md` and `MEMORY.md`) injected into the prompt prefix to maintain provider prompt caching.
3. **Hermes's Zero-Token Session Search**: Integrates SQLite FTS5 across all historical session transcripts and tool outputs for instant, token-free historical lookups.
4. **OpenClaw's Silent Compaction Flush**: Exposes an MCP hook to capture perishable working memory before a coding agent compacts its context window.
5. **OpenClaw's Dreaming Cycle**: Provides an offline consolidation routine that sweeps daily notes, deduplicates facts, resolves contradictions, and promotes durable items.
6. **Oh My Pi's Polyphonic Scoping & URIs**: Supports `global`, `per-project`, and `per-project-tagged` banks with `memory://<id>` URLs exposing full YAML frontmatter metadata.
7. **GBrain's 7-Verb Protocol & Gap Analysis**: Implements `recall`, `remember`, `entity`, `synthesize`, `forget`, `context_pack`, and `delta`, accompanied by an explicit gap analysis indicating what evidence is missing.
8. **QMD & Graphify's Local-First Hybrid Graph**: Combines local GGUF embeddings with deterministic AST code graphs, eliminating external API dependencies.

---

## 4. Use Case Architectural Mappings

### 4.1 Use Case 1: Multi-Project Workspace Management (Local Ecosystem)

#### Problem
- The current workspace contains over twenty distinct projects (`farseer`, `tokenmill`, `peon-py`, `viberaven`, `firstmate`, `augur`, `ocean-raft`).
- Every agent session currently starts blind or spends tens of thousands of tokens re-reading files, leading to high latency and redundant token costs.
- Coding harnesses lack shared awareness of sibling boundaries, contracts, and cross-project decisions.

#### Tomeowl Solution
- **Daemon & CLI Modes**: Runs as a background daemon (`tomeowl serve --mcp`) or a one-shot CLI (`tomeowl query "..." --project farseer`).
- **Workspace Bank Scoping**: Derives project scopes from repository roots (`project:farseer`, `project:tokenmill`), supporting cross-cutting queries across common contracts (`architecture/ARCHITECTURE.md`).
- **Harness Integration**:
  - `peon`: Consumes Tomeowl through its extension protocol as an external memory capability.
  - `farseer`: Uses Tomeowl's MCP endpoint for project memory widgets, workspace search, and cross-session audit trails.
  - `tokenmill`: Leverages Tomeowl's scoped retrieval to reduce Copilot context payloads by 40% to 60%.
  - `firstmate`: Replaces bash-based queue files with durable SQLite-backed event envelopes without changing firstmate's single-commander principle.

---

### 4.2 Use Case 2: Enterprise Semiconductor ATE Test Engineering

#### Problem
- Semiconductor Automated Test Equipment (ATE) environments (Advantest V93000, Teradyne UltraFLEX) produce complex, disconnected data artifacts:
  - C++ and SmarTest test methods and test flows.
  - Device datasheets with electrical specifications and DC/AC limits.
  - Board schematics, probe cards, and device-under-test (DUT) socket pin maps.
  - Tester instrument manuals and firmware release notes.
  - High-volume binary STDF (Standard Test Data Format) datalog files and wafer yield maps.
- When a test fails or yields drop, engineers spend hours manually cross-referencing STDF failure bins with schematic netlists and C++ test code.
- General LLMs cannot ingest massive STDF logs and full tester manuals due to context limits and token costs.

#### Tomeowl Solution: The Four-Store Retrieval Planner
- **Relational Store (SQLite)**: Stores structured test definitions, lot IDs, wafer coordinates, test numbers, and upper/lower test limits extracted from STDF and limit sheets.
- **Graph Store (Adjacency Graph)**: Models physical and logical electrical topology:
  - `Device Pin (e.g. VDD_CORE)` $\rightarrow$ `Socket Pin` $\rightarrow$ `Tester Channel (DPS16)` $\rightarrow$ `Test Method (test_iddq)` $\rightarrow$ `Spec Limit (Datasheet Table 4.2)`.
- **Vector Store (Local GGUF Embeddings)**: Encodes text passages from tester manuals, application notes, and previous post-mortem engineering triage journals.
- **Blob Store (Local Filesystem / Object Pointer)**: Retains raw STDF files, wafer heatmaps, and schematic PDF pages.

#### Triage Workflow
1. An ATE test fails with an out-of-bounds leakage current on pin `USB_DP` during wafer sort.
2. The engineer or automated agent asks Tomeowl:
   `tomeowl think "Why is test 2104 failing on Pin 14 across Lot H7829?"`
3. The Retrieval Planner queries:
   - Relational: Retrieves exact mean, sigma, and failure count for test 2104 in Lot H7829.
   - Graph: Traverses `Test 2104` $\rightarrow$ `Pin 14 (USB_DP)` $\rightarrow$ `Power Domain (VDD33_USB)` $\rightarrow$ `Relay K12 on Loadboard Rev B`.
   - Vector: Finds previous triage entries describing relay contact degradation on Loadboard Rev B.
4. Tomeowl returns a synthesized diagnosis citing:
   - Exact limit from datasheet section 3.1.
   - Measured values from STDF records.
   - Graph-linked schematic relay location.
   - Gap warning: "Wafer map shows edge-die clustering; no thermal datalog exists for this run."

---

## 5. Tomeowl Core Technical Specifications

### System Layers
- `surfaces/`: MCP server (stdio and SSE/HTTP), interactive TUI, and command-line interface.
- `core/`: Retrieval planner, fusion ranker (RRF), chunking engine, and gap analyzer.
- `ports/`: Trait interfaces for `RelationalStore`, `VectorStore`, `GraphStore`, `BlobStore`, and `Embedder`.
- `adapters/`: Native embedded implementations (SQLite with FTS5 and sqlite-vec/GGUF, memory-mapped graphs, local filesystem).

### Verification Gates
1. Standalone test: Runs as a single compiled binary without requiring Python, Docker, or external cloud APIs.
2. Token efficiency: Verified against representative project queries to demonstrate context savings of at least 40%.
3. Deterministic attribution: Every retrieved answer must include exact document paths, line ranges, or database row IDs.
