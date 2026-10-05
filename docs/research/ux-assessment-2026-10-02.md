# Current command-center UX assessment

Checked on 2026-10-02 using current viewer code, PRODUCT.md, DESIGN.md, the release spec, and the stored [desktop capture](../../data/review/v1-desktop.png).
The earlier [UI review](../UI-REVIEW.md) verified rendering and interaction defects; this assessment concerns product hierarchy and comprehension.
It does not claim a new live-browser usability study or measured improvement.
The user's 7/10 rating remains the supplied subjective assessment.

## Result

The core workspace is coherent and functional, but the map does not communicate enough structure to justify its visual prominence.
The current dataset has 33 sources, 360 chunks, and zero recorded relations.
Thirty sources belong to one transcript collection, so collection membership and source-kind color produce one visually dominant orange cloud.
More glow or a larger graph engine would not solve that hierarchy problem by themselves.

| Finding | Evidence | Impact | Proposed response |
|---|---|---|---|
| P1: Groups lack visible boundaries and nested levels | `geometry.ts` arranges members around collection anchors; there are no hulls, aggregate expansion, topics, or breadcrumbs | Users see dots before they see a usable map of subjects | Add overview, neighborhood, and evidence levels with counts and local expansion |
| P1: Node color communicates little | CSS mostly distinguishes document/transcript; the fixture is predominantly transcripts | The dominant collection looks uniform even where subjects differ | Stable categorical group colors, type shapes, and an explicit mode legend |
| P1: Similarity is absent and geometric proximity can be overread | Positions follow source order/hash and collection rather than meaning | Users may infer a topical neighborhood from arbitrary layout | Explain grouping and introduce a separate optional, reference-based similarity layer |
| P1: Most labels disappear until selection | `source-node text` is hidden except selection/hover/focus | Reduced overlap comes at the cost of recognizing what to select | Show group/representative labels at overview and density-aware detail labels |
| P1: Inspector begins with raw markup | Stored desktop capture shows README HTML/badge markup; `makeSnapshot` selects the first chunk substring | Evidence is traceable but the first impression is difficult to read | Choose a readable representative excerpt while keeping raw text and precise locators |
| P2: Effects compete with primary tasks | Orbit, Glow, Motion, and SFX occupy the top map toolbar | The workspace presents customization before scope and meaning | Put effect controls in personalization; prioritize scope/search/view/evidence |
| P2: Personalization is session state | `initialState` hard-codes defaults and state lives on `window`; no persisted profiles | Users and presenters repeat setup and lose their spatial context | Named profiles plus explicit portable export/import and graceful storage failure |
| P2: A frozen snapshot offers no live operational summaries | Snapshot counts are real, but source metrics and panel providers are absent | A manager view risks becoming decorative if panels are added without data | Add only real coverage/freshness/relationship summaries through separate providers |

Collection grouping already exists in the library and collection anchors are different from sources.
The missing capability is semantic and visual hierarchy beyond those flat collections.
The current title/path filter is not full-text or semantic evidence search; a future search UI must name its actual mode.

## Design direction

Retain the dark, warm command-center identity while giving groups distinct semantic color and stronger labels.
Use restrained chrome, spacious aggregate groups, selective edge visibility, and a high-salience evidence selection.
Give Engineer mode stable targets and Presentation mode optional ambient motion and clean summary panels.
Make colors, motion, contrast, label density, and panel choice user preferences without changing canonical knowledge.
Similarity heat coloring needs a selected source/query reference or a small comparison matrix; one globally assigned hue cannot explain every pair of vector distances.
Separate genuine recorded links from semantic candidates, and make the reason for grouping available in the inspector.

## Task-based verification for the next slice

| Scenario | Verify |
|---|---|
| Engineer finds a topic in the 30-transcript collection | Recognizable groups, useful labels, search scope, and a readable evidence passage |
| First-time user compares two nodes | Can identify whether the link is recorded, extracted, or only similar, and inspect its basis |
| Presenter opens a saved project view | Camera, filters, colors, layout, and readable metrics restore without decorative fabricated content |
| Keyboard/reduced-motion user explores the same topic | Equivalent list navigation, focus, text status/legend, stable targets, and no ambient motion |
| Dense or empty corpus | Count reconciliation, unassigned sources, no label storm, clear bounds and honest empty states |
| Offline file export | All assets remain local, preferences fail gracefully if file-origin storage is unavailable, and source/evidence data remains intact |

Use the detailed requirements and provisional budgets in [the modernization specification](../drafts/MODERNIZATION-SPEC.md).
The first slice needs UI and projection work; semantic models and backend replacement are separate experiments.
