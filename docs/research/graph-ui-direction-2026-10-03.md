# Graph UI direction research

Checked 2026-10-03 for the current UI design slice.
This note supplements the existing [UX assessment](ux-assessment-2026-10-02.md), [UI interoperability survey](ui-interoperability-2026-10-02.md), and [engineering evidence research](engineering-evidence-platform-2026-10-03.md).
It introduces no runtime dependency and reports no new usability experiment.

## Recommendation

Keep the authored offline viewer and make a readable collection overview the entry point.
Use explicit drill-down from overview to neighborhood to located evidence, with an accessible source list throughout.
Provide the requested 3D mode as an optional perspective camera over the same source and relationship projection, while preserving a direct 2D path for reading and comparison.
Keep collection membership, recorded references, and future similarity or extraction candidates visually distinct.
These choices are a design inference from the primary sources below and the existing local requirements, rather than a finding that one renderer or layout is universally best.

## Primary-source findings and application

| Finding | Primary source | Application to this slice |
|---|---|---|
| Information-seeking tasks include overview, zoom, filter, details, relate, history, and extraction. | Ben Shneiderman's [The Eyes Have It, 1996](https://www.cs.umd.edu/users/ben/papers/Shneiderman1996eyes.pdf) | Show meaningful groups first, then allow bounded drill-down, inspect evidence, and return to context. |
| Depth introduces occlusion, perspective distortion, interaction effort, and text readability risks for abstract data. | Tamara Munzner's [Visualization Analysis and Design tutorial](https://www.cs.ubc.ca/~tmm/talks/minicourse14/minicourse14-session4.pdf) | Keep labels facing the screen, provide camera reset and direct source navigation, and avoid interpreting projected node size as importance. |
| Graph benefits from stereoscopic 3D have been demonstrated under particular display and task conditions. | UNH Data Visualization Research Lab's [network research](https://vislab-ccom.unh.edu/projects/networks/) | Do not transfer stereo-display findings into a claim that a normal desktop perspective view improves comprehension. |
| Color must not be the only way information or actions are distinguished. | W3C [Understanding Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) | Pair collection colors with names and counts; pair relationship encodings with textual method labels and line styles. |
| Drag-operated functionality needs a single-pointer alternative unless an exception applies; keyboard equivalence is a separate concern. | W3C [Understanding Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Add click controls for pan, zoom, fit, and camera rotation alongside keyboard controls; source-list navigation must provide the same evidence outcome. |
| Interface controls need minimum target size or one of the specified spacing/equivalence exceptions. | W3C [WCAG 2.2 additions](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) | Use comfortable control sizes and a larger list alternative for small spatial nodes; inspect narrow-screen focus and hit targets. |
| Interaction-triggered motion can cause vestibular symptoms; disable nonessential animation when requested. | W3C [Understanding Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | Honor reduced-motion preferences and retain immediate selection, camera, and evidence operations when motion is off. |

The W3C animation criterion is Level AAA; adopting its behavior is a product choice rather than a claim that the complete viewer conforms to WCAG.
WCAG conformance requires a broader audit than these focused checks.
Munzner's document-collection examples also caution that a network can make label lookup harder than a list; this reinforces the list as a primary navigation option rather than a hidden fallback.

## Decisions from the local evidence

The previous release specification concentrated on animation mechanics and a flat source map, while the modernization draft already identified grouping, readable evidence, stable navigation, and saved views as M1.
The latest user request rates the current build 4/10 and adds a 3D option, project-wide discovery, and the repository's research documents as a sample corpus.
The current [release specification](../SPEC.md) now makes that design slice concrete while retaining the catalog's revision and citation contract.

A research-note corpus is a useful literature-shaped demonstration because explicit Markdown links can connect reports, proposals, and citations.
It does not supply a bibliographic database, paper screening workflow, or verified claim matrix; those remain the E1 literature gate.
A project corpus can show project collections and document roles such as main documentation, skills, mini-app documentation, and research.
Role-based organization alone must not imply that a skill is executed, an application is healthy, or one project depends on another.

## What to verify

Test finding a project, identifying its documentation roles, opening a research note, following an explicit reference, returning to overview, and obtaining the same evidence in 2D and 3D.
Inspect desktop and narrow-screen rendering, keyboard focus, reduced-motion startup, still-state stability, camera controls, saved-state recovery, empty results, omitted counts, and offline exports.
Record the named review rubric, independent reviewer score, captures, test results, and remaining limits in the status and UI review documents.
A 9/10 reviewer target is a useful iteration gate, but it cannot substitute for those observed task outcomes or a future user rating.
