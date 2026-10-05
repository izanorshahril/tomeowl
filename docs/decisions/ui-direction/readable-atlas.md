# Start with a readable atlas and keep 3D optional

**Type:** wayfinder:prototype
**Status:** resolved autonomous direction; implementation and review complete
**Assignee:** coordinator and UI reviewer
**Blocked by:** Keep the existing evidence core and deepen projection

## Question

What visual and interaction direction makes the existing map useful to a daily engineer and credible in a short presentation while satisfying the requested 3D option?

## Resolution

Use recognizable named groups, a readable collection overview, a selected neighborhood, and an inspector that leads to located evidence.
Keep warm charcoal and restrained orange accents while assigning stable categorical collection colors with a visible legend and non-color labels.
Move secondary effects away from primary scope, search, view, and evidence controls.
Keep the source list available and provide direct return-to-overview navigation.

Provide a real perspective camera over noncoplanar positions, with yaw/pitch controls, fit/reset, screen-facing labels, and click/keyboard alternatives to dragging.
Keep a 2D reading path and preserve corpus/selection when the view changes.
Start still when reduced motion is requested and preserve all tasks with effects off.

This is an agent-selected direction under the user's explicit authorization, not a completed HITL prototype interview or usability study.
The throwaway composition study at the local preview's `/prototype` route compares a spatial atlas, reading desk, and layer stack using real project counts.
Choose the atlas because project structure and recorded connections are the requested primary view, while its adjacent list and evidence inspector support reading.
The reading desk makes the graph too secondary for this goal; the layer stack repeats project names across broad roles and makes quoted evidence harder to keep in context.
The active viewer implements the chosen direction independently of the throwaway study.
Narrow-screen 2D Projects uses full named rows rather than compressing thirty spatial labels; 3D remains an optional spatial view.
The [independent review](../../UI-REVIEW.md) records the final 9/10 rubric assessment and its verification limits.

## Evidence

The [existing UX assessment](../../research/ux-assessment-2026-10-02.md) identifies missing group recognition, hidden source labels, raw excerpts, and effect-heavy controls.
The [graph UI research](../../research/graph-ui-direction-2026-10-03.md) supports layered navigation and documents the 3D accessibility and perception tradeoffs.
