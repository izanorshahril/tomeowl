# Local issue tracker

This workspace uses local Markdown for implementation planning alongside the GitHub repository.
No remote issue tracker integration is configured.
No ticket in this workspace implies that a GitHub or Linear issue was published.

Implementation tickets live in `.scratch/<feature>/issues/`, one file per tracer bullet, with descriptive titles, explicit blockers, status, and observable acceptance criteria.
The feature README is the index; a ticket's body is the source of truth for its behavior and status.
`ready-for-agent` means the slice is specified and may be worked when its blockers are complete, rather than a claim that it is implemented.

Wayfinding maps live in `docs/decisions/<feature>/MAP.md` and link separate decision records by title.
Each record states its question, type, status, assignee, blockers, and resolution when available.
Local blocking uses the explicit `Blocked by` field because there is no native tracker relationship.
Resolved autonomous recommendations are identified as such; a live human interview is never implied.
Future decisions remain open or in fog, separate from completed implementation evidence.

Current map: [Choose the evidence atlas UI direction](../decisions/ui-direction/MAP.md).
Current implementation index: [Evidence atlas UI tracer bullets](../../.scratch/ui-direction/README.md).
