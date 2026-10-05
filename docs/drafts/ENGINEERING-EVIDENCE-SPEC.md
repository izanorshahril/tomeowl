# Engineering evidence workbench specification

**Status:** public future-release draft; requirements are proposed, not shipped features.
**Date:** 2026-10-03.
**Research basis:** [Engineering evidence platform research](../research/engineering-evidence-platform-2026-10-03.md).

## Product outcome and document ownership

Tomeowl should let an engineer trace a question across literature, documents, measurements, and program definitions, then produce a reproducible evidence packet or presentation.
It should remain useful offline with exact search and direct inspection, while optional analytical and model capabilities enrich selected workflows.
The command-center experience should make relationships, populations, changes, and uncertainty easy to see and impressive to demonstrate.

[SPEC.md](../SPEC.md) owns the current executable's contract.
[SPEC.md's UI slice](../SPEC.md#ui-design-slice-2026-10-03) owns the immediate grouped-map, project/research sample, and 3D implementation acceptance contract.
[MODERNIZATION-SPEC.md](MODERNIZATION-SPEC.md) retains the wider M1-M6 roadmap and proposed semantic, personalization, and reporting contracts.
This document extends the public use cases, future evidence contracts, analytical interactions, and capability gates.
It does not retroactively change schema v1 or turn the entire roadmap into one implementation task.

Public documentation, source, examples, and release fixtures describe reusable software behavior.
User workspace content and organization-specific configuration are stored outside the software distribution and are included in an export only by an explicit scope policy.
The software repository must not contain links to unrelated unpublished workspaces or their contents.

## Use-case journeys

| Journey | Inputs | Actions | Reviewable result |
|---|---|---|---|
| Literature review | Selected bibliography, permitted papers, notes | Discover, deduplicate, screen, annotate, compare methods and claims | Source matrix and cited claims with retained screening decisions |
| Measurement investigation | Selected transformed test exports, metadata, limits | Filter a population, brush a distribution, compare sites/attempts/history | Revision-pinned finding with denominator, warnings, selected units, and source records |
| Program-change review | Selected Java/C++/configuration revisions and mapping profile | Search definitions, inspect spans/diffs, compare limits, follow reviewed result links | Change evidence and unresolved mapping list |
| Engineering evidence review | Requirements, datasheets, tables, drawings, verification records | Inspect regions, connect reviewed entities, compare versions | Requirement-to-evidence projection with uncertainty and coverage |
| Project/context retrieval | Selected repository/session/document roots | Search exact identifiers, inspect neighborhoods, assemble bounded context | Cited context packet with scope and revision metadata |
| Experiment comparison | Dataset/model/preprocessing/evaluation manifests | Compare metrics and error cohorts, inspect reproducibility | Run comparison tied to exact input and output revisions |
| Presentation/export | Selected findings, sources, chart recipes, view preferences | Curate a view, annotate, preview scope, export | Portable chart/report bundle with reconciled counts and locators |

The first semiconductor workflows are offline and after test.
The program workflow is read-only and operates on permitted source/configuration files rather than executing a tester SDK or test program.
The product does not automatically kill units/lots, change limits, or alter test flow.
Future in-tester inference would require its own runtime, validation, deployment, and mutation contract.

## Capability boundaries

| Layer | Responsibility | Excluded responsibility |
|---|---|---|
| Evidence core | Workspace identity, revisions, locators, provenance, scopes, annotations, jobs | Domain-specific numerical or electrical interpretation |
| Document capability | Text/layout/table extraction, bibliography, passages | Treating arbitrary media conversion as authoritative measurement parsing |
| Measurement capability | Typed observations, attempts, cohorts, aggregates, analysis runs | Unreviewed trace joins or production disposition writes |
| Program capability | Syntax spans, definitions, diffs, declared configuration, reviewed mappings | Claiming complete runtime semantics from syntax alone |
| Optional model capability | Versioned vectors, scores, candidates, evaluated predictions | Mandatory inference or silent fact promotion |
| View/projection layer | Coordinated selections, layouts, charts, comparisons, presentation | Owning canonical evidence identities or internal database schema |
| Export/adapters | Versioned neutral bundles and validated downstream projections | Scraping the viewer or distributing arbitrary workspace content |

Implement capabilities through explicit adapters and small modules when a concrete slice needs them.
Begin with a static adapter registry; a general plugin marketplace, arbitrary downloaded executables, and dynamic extension discovery are outside this draft.
Keep a model, graph database, document service, or desktop shell out of the mandatory baseline.

## Future contracts

### Evidence objects

| Object | Proposed minimum fields/invariant |
|---|---|
| Workspace manifest | Schema, stable workspace ID, allowed roots/assets, capability settings, export policy; no credentials in public projections |
| Source | Stable workspace-local ID, kind, aliases, title, origin metadata; path is an alias rather than identity |
| Revision | Source ID, input hash, observed timestamp, lineage; identical bytes do not merge independent sources |
| Extraction run | Parser/version/config hash, input revision, output schema/hash, completeness, warnings |
| Evidence reference | Source ID, revision, extraction run, typed locator, excerpt/value reference |
| Entity/definition | Stable local ID, type, revision scope, supporting evidence; domain meaning belongs to its capability |
| Relation | Typed endpoints, direction, method, supporting evidence, current/candidate/reviewed status, optional score definition |
| Analysis run | Scoped inputs, recipe and transform hashes, optional model identity, result asset hash, warnings, completeness |
| Finding/annotation | Author/tool, interpretation, cited evidence, review state, supersession history |
| Projection manifest | Schema, permitted scope, input revision set, transformations, omitted fields, asset hashes, producer |
| View profile | Version, surface/panels, filters, camera/layout, labels, colors, motion, presentation preferences |

A source is an original item, a dataset is a typed asset, and a finding is an interpretation with evidence.
Keep these concepts separate even when all appear in the same workspace.
Facts, reviewed joins, inferred candidates, similarities, and visual group memberships retain different lifecycle and trust semantics.

Typed locators should preserve the original granularity:

| Kind | Locator fields | Validation |
|---|---|---|
| Text | Line interval and optional byte span | Bounds match the cited revision |
| Transcript | Time interval and text span | Time units and revision are explicit |
| PDF/image | Page/frame and bounding box with coordinate convention | Region maps to the original artifact; OCR uncertainty is visible |
| Spreadsheet | Sheet, cell/range, optional table/row key | Formula/value interpretation and workbook revision are preserved |
| Dataset/STDF | Dataset revision, record/row selector, native record offset where available | Selector resolves uniquely or reports ambiguity; head/site/attempt context is retained |
| Program | File revision, byte/line span, grammar/config identity, optional symbol | Parser errors and unresolved semantics remain visible |

Use a versioned tagged locator union when this capability is implemented.
Keep old line/time records readable during migration.
Never manufacture a precise locator for a parser that only supplies flat text; expose a coarse locator and its limitation.

### Small module interfaces

| Seam | Conceptual request/result | Implementation rule |
|---|---|---|
| Ingest | Explicit inputs + mapping/config + bounds -> job/results/warnings | Preserve originals; stage and validate before activation |
| EvidenceQuery | Scope + query/filter + limits -> citations/relations/coverage | Apply scope before retrieval and traversal |
| AnalyticalQuery | Dataset revision + approved recipe + typed predicate + bounds -> batches/aggregate/run | No unrestricted user/model SQL in the baseline |
| Project | Scoped evidence/run references + view intent -> bounded versioned view data | Renderer-neutral; derived provenance travels with results |
| Export | Projection policy + selected references -> preview/manifest/assets | Recompute permitted derivatives and verify output closure |

Extend existing modules rather than introduce interfaces for hypothetical implementations.
Separate external adapter/runtime details from these operations once a real second implementation or failure boundary exists.
CLI and UI must reuse the same contracts so another dashboard or agent does not need to read SQLite internals.

### Shared selection and query coordination

The frontend needs typed state for workspace scope, active surface, selected evidence, analytical cohort, comparison cohort, focus, and pending query generation.
A measurement cohort is a revision-pinned predicate, not an unbounded array of unit IDs.
Small explicit ID selections can still be used for pinned findings.
Graph selection and analytical filtering are distinct actions unless the user invokes a documented cross-view operation.

Illustrative future state, not a current API:

```json
{
  "schema": "tomeowl.selection/1",
  "workspaceId": "fixture-workspace",
  "scopeId": "review-scope",
  "surface": "measure",
  "generation": 12,
  "focus": { "kind": "testDefinition", "id": "definition-17" },
  "cohort": {
    "datasetId": "fixture-measurements",
    "revision": "fixture-revision-1",
    "where": {
      "op": "and",
      "args": [
        { "op": "eq", "field": "testDefinitionId", "value": "definition-17" },
        { "op": "gt", "field": "value", "value": 1.2 }
      ]
    },
    "attemptPolicy": "all-valid-attempts"
  },
  "evidenceRefs": [],
  "comparison": null
}
```

Allow only declared fields, typed values, and a bounded predicate grammar.
The query layer resolves definition units and compatible populations before interpreting a numerical range.
Debounce transient brushing, cancel obsolete work where supported, and accept results only for the matching workspace/revision/generation.
A slower response from an earlier selection must never overwrite a later view.
The query coordinator should avoid recursive selection events across panels and reuse cached compatible aggregates.
Show pending, stale, partial, and empty results distinctly.

## Requirements and acceptance behavior

P0 means required when the named capability is released, not that every row belongs in the next implementation task.
P1 means a later enhancement within that capability.
The capability gates below determine delivery order.

### Evidence core, portability, and scope

| ID | Priority | Requirement and acceptance |
|---|---|---|
| EVD-01 | P0 | Explicit workspace roots/assets bound discovery; fixtures confirm unrelated files are never scanned |
| EVD-02 | P0 | Introduce source identity independent of absolute path with explicit legacy mapping; relocation preserves citations without merging byte-identical sources |
| EVD-03 | P0 | Every result identifies revision, extraction/analysis run, and usable typed locator; unresolved/coarse locators are labeled |
| EVD-04 | P0 | Input/config/parser/model changes invalidate affected derivatives; unaffected evidence and the last complete result remain inspectable |
| EVD-05 | P0 | Scope is enforced before search, ranking, traversal, aggregation, and grouping; export fixtures contain no excluded records or forbidden derived information |
| EVD-06 | P0 | Candidate, reviewed, factual, lexical, and similarity relationships remain distinguishable in queries, visuals, and exports |
| EVD-07 | P0 | Jobs have bounded resources, progress, warnings, cancellation, and explicit terminal states; failed staging cannot replace a good revision |
| EVD-08 | P0 | External derived assets activate through a validated hash manifest; interrupted activation/rebuild leaves a recoverable catalog |
| EVD-09 | P0 | Neutral schema-versioned exports preserve identities, locators, definitions, and lineage; unsupported versions fail explicitly |
| EVD-10 | P0 | Restricted-machine baseline works without network, administrator install, model pack, WebGL, or optional helper; unavailable capabilities have a clear fallback |
| EVD-11 | P0 | Public source/docs/examples/package manifests omit unrelated unpublished workspace names, paths, and contents; release scope is reviewable |
| EVD-12 | P1 | Incremental rebuild and cache invalidation reuse unchanged assets without treating old parser output as current |

### Literature and multi-format documents

| ID | Priority | Requirement and acceptance |
|---|---|---|
| LIT-01 | P0 | Import one declared bibliographic export format with stable source keys and provenance before adding online providers |
| LIT-02 | P0 | Screening records include decision, reason, and source version; duplicates and related versions are reviewable rather than silently merged |
| LIT-03 | P0 | Full-text findings cite inspectable passages/regions; metadata-only results cannot claim paper findings without supporting content |
| LIT-04 | P0 | Claim/method matrix separates passages, analyst interpretation, and model suggestions, and exports those distinctions |
| LIT-05 | P0 | Multi-format adapters disclose layout/table/OCR limitations, missing assets, and parsing failures; originals remain inspectable |
| LIT-06 | P1 | Explicit provider queries record request scope/time/provider, honor cache/backoff/quota configuration, and preserve usable offline exports |

### Measurement analytics

| ID | Priority | Requirement and acceptance |
|---|---|---|
| MEAS-01 | P0 | Ingest a declared transformed schema with mapping/version, typed values, units, limits, flags, and original row references; reconcile input/output counts |
| MEAS-02 | P0 | Preserve valid pass/fail, invalid, missing, and not-executed states separately; fixtures cover null and sentinel behavior |
| MEAS-03 | P0 | Keep unit identity, attempt/retest policy, site/head/time/setup, and unresolved joins explicit; no accidental retest collapse or cross-file identity merge |
| MEAS-04 | P0 | Cohorts retain dataset revision, predicate, denominator, exclusion/missingness rules, and attempt policy; saved analysis reproduces counts |
| MEAS-05 | P0 | Histograms, trends, and population comparisons show units/limits/context and distinguish incompatible program/setup populations |
| MEAS-06 | P0 | Analytical requests use bounded approved recipes and parameterized values; network, extension installation, and unrestricted paths are disabled in the selected worker profile |
| MEAS-07 | P0 | Raw STDF adapter declares supported dialect/records and verifies decoding, scaling, flags, multisite/attempt joins, compression, and malformed files against independent fixtures |
| MEAS-08 | P1 | Numerical representations/model results record preprocessing, revision-aware populations, missingness, evaluation splits, uncertainty, and baseline comparison |

### Program and engineering evidence

| ID | Priority | Requirement and acceptance |
|---|---|---|
| PROG-01 | P0 | Read selected source/configuration revisions without executing them or loading tester SDKs; public fixtures use self-authored code |
| PROG-02 | P0 | Parsed spans identify grammar/config version and errors; syntax references never appear as proven runtime calls |
| PROG-03 | P0 | Definition/limit changes link to both source revisions and expose mapping assumptions, units, effective revision, and uncertainty |
| PROG-04 | P0 | Test-result joins use reviewed revision-aware definition mappings; ambiguous ID/name/condition matches remain unresolved candidates |
| PROG-05 | P1 | Additional netlist/drawing/verification adapters preserve native locators and reviewed domain semantics; image descriptions cannot silently create electrical connections |

### Hyperinteractive frontend

| ID | Priority | Requirement and acceptance |
|---|---|---|
| UXC-01 | P0 | Overview, neighborhood, and evidence levels preserve context, selection, breadcrumbs, and unassigned sources; follows M1 MAP requirements |
| UXC-02 | P0 | Stable categorical groups use labels/boundaries/shape as well as color; legend and counts reconcile at each level |
| UXC-03 | P0 | Similarity heat names its source/query reference and score meaning, retains missing-score state, and remains separate from group color/status/recorded links |
| UXC-04 | P0 | Map, table, chart, document, and code views use shared typed selections; the declared histogram-to-unit-to-definition journey has consistent scope and counts |
| UXC-05 | P0 | Selection does not relayout unaffected content; rapid filter changes cannot display old-generation results as current |
| UXC-06 | P0 | Engineer and Presentation profiles restore panels/filters/camera/layout/preferences without altering evidence facts |
| UXC-07 | P0 | Purposeful group/focus transitions retain stable reading and hit targets; reduced motion/still mode and default-off sound preserve all functionality |
| UXC-08 | P0 | Keyboard/DOM alternatives, visible focus, selection announcements, readable inspectors, and narrow-screen flows support the same task outcomes |
| UXC-09 | P0 | Loading, missing-model/helper, partial, stale, error, and empty states show actionable context plus retry/cancel where applicable |
| UXC-10 | P1 | Pin cohort A/B, compare revisions and evidence side by side, annotate a finding, and restore the comparison from a saved view |
| UXC-11 | P1 | Aggregate/LOD projections and worker layout are introduced only after measured scale need; visible support limits and omitted counts stay accurate |
| UXC-12 | P1 | Curated presentation/export reproduces the selected evidence and metric definitions without exposing private paths or excluded derivations |

### Optional models and integrations

| ID | Priority | Requirement and acceptance |
|---|---|---|
| OPT-01 | P0 | Models remain optional, locally configured, licensed, and revisioned; missing runtime/weights never disable lexical search/direct inspection |
| OPT-02 | P0 | Predictions/extractions expose calibration/abstention, supporting evidence, review status, and evaluated error behavior; no automatic production mutation |
| OPT-03 | P0 | New engine/renderer/helper adoption requires a named workload, baseline comparison, clean-machine packaging, exact pins, and artifact/license inventory |
| OPT-04 | P1 | Vega-Lite/BI projections consume neutral contracts, reconcile counts, and validate field/metadata scope; PBIP remains a downstream template |
| OPT-05 | P1 | Another app/agent consumes bounded CLI or versioned API outputs without reading private database tables or viewer markup |

## Frontend experience brief

### Shared shell and surfaces

Use a compact scope/search bar, a context/collection rail, a dominant task surface, and an evidence inspector.
The active surface changes with the task instead of forcing a graph beside every workflow.
Preserve a consistent selection summary, freshness state, and path back to source evidence.
The proposed surfaces are Evidence Map, Measure Lab, Program Atlas, and Review Desk.
They can arrive independently; the first iteration needs only the existing map and inspector.

The map overview shows category/group regions with representative labels and real counts.
Entering a region reveals a bounded neighborhood; selecting a source opens readable evidence with revision and relation provenance.
Use stable positions for unaffected sources and an explicit recompute action.
Manual groups and collection membership work before embeddings exist.

Measure Lab centers on a chosen test/population, distribution/trend panel, selected-unit table, and context inspector.
Program Atlas centers on definitions, revision comparison, declared flow/dependencies, and native code/configuration spans.
Review Desk holds pinned evidence, claim/method comparisons, annotated charts, and a presentation sequence.
Public examples use real synthetic/fixture outputs rather than invented operational counts.

### Signature interactions and personalization

The primary visual moment is a stable group expansion with a short trace from selection to supporting evidence.
Use dimming and selective edge emphasis to show focus, and deliberate chart/source-region emphasis to explain a link.
Keep glow confined to meaningful active elements rather than illuminating every node equally.
Use visual hierarchy and type/shape/category contrast before motion.

Provide theme, density, palette, label detail, inspector placement, saved filters, layout/camera, glow, and motion presets.
Include a high-contrast still preset alongside Engineer and Presentation profiles.
Presentation can opt into bounded ambient effects; reading and pointer selection pause movement where needed.
Large numeric datasets appear as aggregate cohorts and charts, not millions of animated graph nodes.
Do not add ornamental email/calendar/agent panels without a genuine source and task.

### Renderer and chart choices

Keep the authored SVG/DOM renderer for M1 and a simple view state independent of the rendering engine.
Evaluate ECharts or Vega-Lite on one concrete numerical interaction rather than adopting both as general chart owners.
Vega-Lite is the preferred first exported chart artifact; the live analytical chart choice remains a benchmark decision.
Use Mosaic's coordinated query/view pattern as a reference; validate its runtime fit before adopting its packages.
Consider Perspective if pivot/streaming table needs justify an additional analytical component.
Benchmark stable Sigma/Graphology or Cytoscape on a declared large-map or program-flow workload only when the current renderer misses its gate.
No renderer/library is newly adopted by this specification.

## Numerical and program semantics

Prefer normalized dimension/observation assets with explicit mapping profiles and provenance.
Storage layout is an implementation decision guided by representative queries, not a public contract.
Dataset revisions include export/parser/mapping changes so two analyses do not silently compare different interpretations of the same file.
Retest and aggregation policies are visible parameters in the UI and query manifest.
Cross-site/setup/program comparisons require compatible definitions or disclose their differences.
Every chart title/inspector should make population, units, time/program context, and exclusions discoverable.
Declare precision, large-identifier, decimal-scaling, nonfinite, timestamp, and null serialization rules across the analytical worker, JSON, and browser.
Display rounding must not change cohort predicates, and lossy conversions must preserve a raw value reference or expose the limitation.
Include these cases in transformed-data reconciliation fixtures.

Raw STDF support follows transformed-data correctness rather than precedes it.
Independent small fixtures cover complete/incomplete files, multiple sites and attempts, valid/invalid states, limits, scaling, and supported record families.
Unknown records, malformed joins, and absent trace keys produce visible warnings and completeness states.
No parser may infer a globally unique unit identity or causal root cause from unavailable fields.

Program analysis starts with Java/configuration source review and optional C++ after an equivalent public fixture exists.
Maintain distinctions between file syntax, declared parameters, build/preprocessing assumptions, reviewed runtime mappings, and actual measured outcomes.
An electrical dependency requires domain evidence; a code reference or image embedding alone cannot establish one.

## Jobs, recovery, migration, and deployment

Use the current executable and built-in SQLite as the base deployment profile.
Optional helpers use documented arguments, explicit exit codes, bounded structured output, and a per-project runtime/package manifest.
Cancel/timeout handling must stop or discard the actual background work rather than only remove a spinner.
If a worker cannot safely interrupt a request, terminate its task-owned process or discard its late output and report the limitation.
Staging files, memory, temp disk, CPU threads, output rows/bytes, and error excerpts have declared limits.
Model/helper packs require explicit local configuration and never download at ordinary application startup.

SQLite metadata and external assets use a manifest-driven activation protocol with recoverable staging cleanup.
Keep previous complete revisions until retention policy permits deletion.
Before an identity/schema migration, create and verify a supported backup, preview legacy mapping, and retain a rollback path.
Do not copy a live database as an ordinary file backup or treat renamed paths as a completed identity migration.

Separate static HTML, local workbench, and future shared-service capability profiles.
Static HTML can show precomputed views when live Wasm/helpers are unavailable.
The local workbench binds to loopback in the foreground and uses locally packaged assets.
Wasm/WebGL/worker support is feature-detected; missing features preserve list/evidence and precomputed review.
A future shared server requires enforceable authentication and scope authorization before confidential deployment.

## Acceptance fixtures and provisional budgets

These targets are proposed budgets, not current performance claims.
Name the Windows/browser/hardware reference environment and record corpus/package/config hashes, cold/warm runs, median/p95, peak memory, and bundle/assets size.

| Fixture | Correctness evidence | Proposed interaction gate |
|---|---|---|
| Existing 33-source map plus declared 1k-source corpus | Group counts, no lost/unassigned source, relation distinctions, saved-state restoration, keyboard/still/offline paths | p95 selection feedback below 100 ms; pan/zoom frames below 33 ms; 1k bounded view interactive within 2 s |
| Selected bibliography and permitted document fixtures | Version/dedup/screen decisions, inspectable locators, no metadata-only invented claim | Search/select feedback below 100 ms once data is loaded; extraction progress/cancellation remains responsive |
| Synthetic 1m-row measurement fixture with declared columns/partitions | Input/output reconciliation, null/flag/retest semantics, cohort and histogram counts, reproducible saved recipe | p95 warm supported aggregate/filter result below 500 ms; visible feedback below 100 ms; record import/cold query separately |
| Tiny independently decoded STDF fixtures | Supported records, flags/scaling, byte order/compression, joins, truncation/completeness | Bounded parser memory/output; throughput is measured before any supported rate is claimed |
| Synthetic Java/configuration and optional C++ fixture | Span/diff correctness, parse errors, reviewed mapping, no execution/SDK requirement | Selected definition and cached evidence feedback below 100 ms; background indexing remains cancelable |
| Scoped export fixture with excluded source influences | No excluded records, paths, labels, neighbors, aggregates, report metadata, or unpermitted derivative leaks | Counts/hashes/schema round-trip reconcile; output opens in its declared offline profile |
| Rapid selection/cancel/reload sequence | No old-generation response replaces current state; last complete revision survives failures | Stable reading/selection targets and bounded queued work |

The 1m-row fixture is a benchmark workload to design, not a claim that current Tomeowl can ingest it.
If a gate fails, reduce the declared capability or revise the implementation before expanding scale.
5k/10k graph views, 10k/50k text chunks, and model workloads need separate measured fixtures.
Do not increase the existing spatial limit through documentation alone.
User comprehension also matters: run the existing M1 topic/evidence tasks and confirm participants distinguish similarity, recorded relations, and unresolved candidates.

## Capability delivery gates

| Gate | Small deliverable | Required proof | Relationship to existing roadmap |
|---|---|---|---|
| E0 | Grouped, layered current map with readable evidence and saved profiles | M1 task, accessibility, motion, offline, and interaction checks | Same next slice as M1; no core rebuild blocks it |
| E1 | Portable evidence identities/locators, neutral export, one literature workflow | Legacy identity mapping/rollback, source matrix, passage/export lineage | Enables richer consumers; reuse M3 neutral export where applicable |
| E2 | One transformed measurement schema and linked histogram/table/definition inspector | Typed semantics, counts, bounded query, rapid-selection behavior, clean-machine worker profile | Separate analytics slice; does not require embeddings |
| E3a | Optional raw STDF adapter | Independent decode and head/site/attempt/flag/scaling fixtures | Domain adapter after E2 semantics |
| E3b | Read-only Java/configuration atlas and reviewed test mapping | Span/diff/mapping evidence and no SDK/code execution; optional C++ separately | Independent source-analysis slice after relevant E1 contracts |
| E4 | One optional model or renderer/engine scaling experiment | Baseline quality/performance and packaging/license results | Aligns with M2/M4/M5; adopt only demonstrated benefit |
| E5 | One reusable BI/internal-app projection or deployment profile | Neutral contract, scope/count reconciliation, target-environment validation | Aligns with M3/M6; shared deployment needs its own authorization boundary |

E3a and E3b can proceed independently once their prerequisites exist.
E1/E2 should not be coupled to all optional model and graph work.
Prefer one useful end-to-end task at each gate over simultaneous adoption of many frameworks.
Capture rejected alternatives and benchmark outcomes as dated evidence rather than leave several default engines in the product.

## Bounded coding-agent workflow

Use Codex or Claude to implement a selected gate with a short task plan, fixed public fixture, narrow file ownership, rollback, and acceptance evidence.
Read the current baseline and relevant spec section before changing a schema or interface.
Keep generated output and models outside public source; do not send workspace data to a hosted model merely because the coding harness can access it.
Delegate disjoint investigation/build/review tasks when the requested model and applicable instructions permit it, with one integrator owning shared contracts.
Exact-pin adopted dependencies, inspect lifecycle scripts, and use the project's runner/lockfile.
Update current-status documentation only after actual verification.

Suggested immediate task:

```text
Implement E0, which is M1 in docs/drafts/MODERNIZATION-SPEC.md.
Read PRODUCT.md, DESIGN.md, docs/SPEC.md, and the current UX assessment.
Use the current authored viewer and public map fixtures.
Deliver group overview, focused neighborhoods, readable evidence,
stable category colors, and saved Engineer/Presentation profiles.
Preserve evidence semantics and the current executable/offline behavior.
Record before/after task and interaction evidence, then run relevant checks.
Do not add a graph database, analytics runtime, model, or desktop shell.
```

Suggested later analytical spike:

```text
Design only the E2 vertical slice using synthetic transformed test data.
Inspect the current modules and E1 evidence/locator decisions first.
Compare a native/helper and browser-Wasm query route on the same fixture.
Prove units, validity flags, retest policy, cohort counts, query bounds,
histogram/table linking, cancellation, and stale-response rejection.
Use approved typed query recipes and locally packaged assets.
Report clean-machine packaging, artifact licenses, size, memory, and p95.
Choose at most one analytical runtime from measured evidence.
Keep STDF, production data, tester execution, and model inference outside the spike.
```

## Decisions still requiring implementation evidence

| Decision | Default until evidence exists | Evidence that can change it |
|---|---|---|
| Native/helper versus Wasm analytics | Neither is adopted yet | Same-fixture correctness, Windows packaging, cancellation, memory, latency, offline profile |
| ECharts versus Vega-Lite live charts | One small spike; Vega-Lite first export format | Cross-view interaction quality, accessibility, performance, artifact reuse |
| Exact scan versus vector engine | Bounded optional exact scan | Fixed-query recall, filters/scope, measured resource/latency limits |
| SQLite edges versus graph engine | Existing catalog edges | Named query workload and demonstrated portability/performance advantage |
| SVG versus larger graph renderer | Current SVG limit | Measured graph workload failure and replacement proof |
| Generic converter versus rich document parser | Smallest adapter meeting locator needs | Representative table/layout/OCR errors and packaging cost |
| Test-definition mapping profile | Explicit reviewed mappings | Representative supported exports and unambiguous revision/condition keys |
| Public software license | No new license selected | Explicit owner choice and inventory of shipped artifacts |

The roadmap is deliberately broader than the next release.
All additional capabilities remain proposed until their gate is verified and current documentation records the delivered behavior.
