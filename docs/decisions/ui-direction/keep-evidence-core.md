# Keep the existing evidence core and deepen projection

**Type:** wayfinder:research
**Status:** resolved
**Assignee:** architecture-spec agent
**Blocked by:** None

## Question

Does the current UI direction require a new framework, graph database, or broad source-tree scaffold, or can the existing evidence and viewer modules support it?

## Resolution

Keep Bun/TypeScript, SQLite FTS5, the schema v1 snapshot, and the authored offline viewer.
Deepen the projection module at the snapshot seam so grouping, corpus membership, relevant recorded relationships, and counts are shared by map, list, and evidence navigation.
The project-document and research-document corpora are two real adapters; the 2D and 3D presentations provide leverage from the same evidence interface.
This improves locality without speculative extension modules or empty packages.

The current repository already separates headless evidence modules, viewer source, behavioral tests, generated local data, frozen prototype, and future specifications.
Keep that structure and create a file only when current behavior earns it under the deletion test.
The selected module's interface is the test surface, with catalog revision/provenance behavior retained below it.

## Evidence

The active source and [architecture](../../ARCHITECTURE.md) already isolate the catalog from the exported viewer.
The [backend research](../../research/backend-options-2026-10-02.md) and [engineering research](../../research/engineering-evidence-platform-2026-10-03.md) recommend adding an engine only for a demonstrated workload and measured benefit.
This decision is reversible and does not need a new ADR.
