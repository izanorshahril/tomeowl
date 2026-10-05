# Evidence atlas UI tracer bullets

This is the local implementation index for the [current UI slice](../../docs/SPEC.md#ui-design-slice-2026-10-03).
The [decision map](../../docs/decisions/ui-direction/MAP.md) records direction; each ticket below owns its behavior, blockers, and acceptance criteria.
These files are local tickets, not remotely published issues.
The user authorized the coordinator to choose granularity and proceed without a ticket interview.
All five bounded slices are complete, with [release evidence](../../docs/STATUS.md) and [9/10 independent UI confirmation](../../docs/UI-REVIEW.md).

| Ticket | Blocked by | Demoable outcome |
|---|---|---|
| [Recognize and explore a grouped atlas](issues/01-grouped-atlas.md) | None | Corpus overview to collection neighborhood to selected source and back |
| [Explore real project and research corpora](issues/02-real-corpora.md) | Recognize and explore a grouped atlas | Two honest bounded local samples with source-role navigation |
| [Inspect why sources are connected](issues/03-relationship-evidence.md) | Recognize and explore a grouped atlas | Readable passages and provenance for a recorded reference |
| [Inspect the same evidence in 3D](issues/04-perspective-view.md) | Recognize and explore a grouped atlas | Optional perspective, orbit/reset, and unchanged source/evidence |
| [Resume an accessible offline workspace](issues/05-accessible-profiles.md) | Recognize and explore a grouped atlas; Inspect the same evidence in 3D | Restored preferences and complete keyboard/still/narrow-screen journeys |

The last ticket includes the integration review of both real samples, while each earlier slice still requires its own focused checks.
Record actual completion and remaining work in [the project status](../../docs/STATUS.md); a `ready-for-agent` ticket does not certify delivery.
Bibliographic screening, measurement and program capabilities, models, and report exporters remain separate future efforts under their existing capability gates.
