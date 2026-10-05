# Code review

## Command center and motion integration, 2026-10-03

The fixed point is the SHA-256-verified set of 33 files under `data/command-center/before`; this workspace has no Git repository.
The dashboard worker implemented the pure inventory projection and separate DOM surface, while the motion worker implemented bounded pose changes and in-place scene updates.
The independent UI reviewer inspected evidence truth and motion continuity, and the motion worker then performed a read-only review of the coordinator's separate state, layout, rendering and CSS integration.
This was a focused integration review, rather than another complete audit of the catalog backend.

| Finding | Resolution | Evidence |
|---|---|---|
| Dashboard CSS targeted tags/classes different from its emitted markup | Match semantic `dt`/`dd`, skill labels, selected classes, layer colors and native actions | Desktop/mobile image and DOM confirmation |
| Primary Resume could leave a selected or zero-speed graph frozen | Show the reading/still state and clear selected IDs or restore slow speed only on explicit Resume | All selected and zero-speed poses held; Resume restored ambient movement and zero survived reload |
| Layer actions inferred corpus from a role, hiding valid literature documents or skills | Choose a corpus containing actual matching sources, retaining the current corpus when possible | Mixed-corpus regression fixture |
| Mobile grid rows compressed dashboard content into overlapping tracks | Size dashboard rows from content below the graph | Consecutive full-height mobile panels and keyboard access |
| Mobile legend collided with role captions or camera controls | Reserve a narrow, stacked legend beside the camera | Independent targeted confirmation |

The new modules reuse snapshot identities, existing projection and camera math, authored SVG and native controls.
No dependency, remote asset, catalog schema or other project's files changed.
Actual snapshot arrays drive whole-snapshot totals; citation ranking counts distinct recorded URL references and shared use in other notes, without inferring semantic similarity.
Malformed and fresh preferences respect reduced motion, v4 pauses and zero speed persist, and selected, focused, hovered, dragged and hidden states suppress ambient updates.
Scene transitions are interruptible and movement uses bounded time steps rather than catching up wall time after a pause.
Final validation passed 61 tests with 1,282 assertions and Windows x64 compilation.
The compiled executable exported the embedded command center with only Windows System32 on PATH.
The regenerated full sample HTML contains 287 actual sources and requires no external assets.
The listed integration findings are resolved; general hardware performance and an assistive-technology audit remain outside this focused review.

## Reference correction, 2026-10-03

The independent Standards and Spec agents reviewed the reference correction in parallel against the [current UI contract](SPEC.md#ui-design-slice-2026-10-03).
The fixed point is the SHA-256-verified copy under `data/reference-form/before`; this workspace has no Git repository.
Changed-file comparisons use `git diff --no-index` against those copies, while the new reference geometry and scene modules are reviewed directly.

### Standards

The `reference_code_review` agent reported zero documented-standard violations and zero actionable Fowler smell findings.
The correction keeps the evidence core and Atlas, separates pure geometry from DOM drawing, reuses projection/camera state, bounds spatial output, and adds no dependencies or remote assets.

### Spec

The `spec_review` agent found one UI-13 defect: the disabled-Glow selector had lower specificity than the selected-particle effect.
The higher-specificity override now applies to both reference and Atlas glyphs.
The coordinator verified selected-particle `filter: none` with Glow off and its drop shadow with Glow on; the Spec agent confirmed zero unresolved findings.
No additional missing requirement or unintended capability was reported.

### Interaction confirmation

The earlier focused interaction review found role-label focus loss, selection focus entering hidden navigation in expanded mode, and pointless still-2D animation redraws.
The fixes retain role identity through redraw, treat expanded panels as drawers, restore only visible source targets, and restrict reference ambient orbit to 3D.
Browser journeys verified the first two fixes; source confirmation verified the motion restriction.
Resize-triggered fitting now persists the resulting camera pose, with same-viewport camera/panel restoration checked in the browser.
Final verification passed 48 tests with 1,062 assertions, Windows compilation, and compiled export with Bun absent from PATH.
Standards: zero findings; Spec: one resolved finding and zero unresolved findings.

## Earlier evidence atlas review, 2026-10-03

The Standards and Spec axes were reviewed by separate subagents and kept separate through follow-up review.
This workspace has no Git repository, so the fixed point is the verified pre-change copy under `data/design-workspace/before`, rather than a commit or merge-base.
Comparisons use `git diff --no-index data/design-workspace/before/src/viewer/render.ts src/viewer/render.ts` and equivalent changed-file comparisons; new projection/sample modules are reviewed directly.
The review contract is [SPEC.md](SPEC.md#ui-design-slice-2026-10-03), with the supplied AGENTS instructions, current architecture, and the code-review skill's Fowler smell baseline.

## Standards

| Finding | Resolution | Evidence |
|---|---|---|
| Palette selection could inspect a source hidden by the current layer/query | Clear incompatible filters when the selected source is absent from the scoped projection | Browser selected Architecture from Main docs and confirmed the source in the map/list |
| Orbit speed zero could stop motion without restarting at a positive speed | Redraw and synchronize motion after speed changes | Browser confirmed a frozen zero-speed pose and renewed rotation at speed 100 |
| Inventory paths with `#`, `?`, or `%` could lose their membership relationship | Encode generated Markdown destinations | Reserved-filename fixture preserves its cited inventory relationship |
| Transform-only pan/zoom could retain stale label sizing/truncation | Refresh label bounds and inverse sizing through every transform path | Shared `applyTransform` refresh plus browser zoom check |

All four identified correctness findings are resolved.
No remaining documented hard standards violation or substantial Fowler smell was reported in the focused review.
The shared projection and actual pure placement modules replace duplicated rules and unused renderer helpers without new dependencies.

## Spec

| Finding | Resolution | Evidence |
|---|---|---|
| Ordinary filtering refitted/repositioned unaffected sources | Use full-scope placement and remove automatic fitting from search, layer tabs, and inspector summary filters | Placement fixtures and browser camera/node comparisons |
| Saved views omitted scope, filters, camera, and effects | Validate and serialize declared view state; compare saved viewport after final chrome layout | Damaged-state/reduced-motion fixtures and browser reload checks |
| Relationship inspection hid raw quoted text/full revisions | Add original quote, revision, and chunk disclosure | Source/reference journey and original-text inspection |
| Research contract overstated inclusion of specifications | Define the sample as research notes and citation records; specifications remain project documents with actual cross-lens links | Revised sample contract and role disclosure |
| Coverage lacked project-level omissions | Attach discovered/selected counts and omissions per project and expose them in Coverage | Fresh final sample metadata and coverage disclosure |
| Keyboard panning did not save its pose immediately | Persist camera changes from keyboard pan | Browser pan-to-reload equality |

All six identified requirement gaps are resolved or explicitly corrected in the contract.
No unintended analytical/model capability or graph-engine replacement was found.
The independent visual review is recorded separately in [UI-REVIEW.md](UI-REVIEW.md).

## Verification boundary

Subagents inspected code and fixtures; browser journeys and executable checks were performed by the coordinator.
Final verification passed 36 tests with 219 assertions, Windows x64 compilation, and compiled ingestion/search/map/HTML export on a synthetic fixture with only Windows System32 on the child PATH.
The lower assertion count than an intermediate run reflects replacement of obsolete renderer tests with checks of the shipped geometry.
Standards: four findings resolved, zero remaining reported; Spec: six gaps resolved or corrected, zero remaining reported.
