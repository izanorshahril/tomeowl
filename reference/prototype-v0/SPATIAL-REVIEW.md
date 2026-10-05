# Spatial prototype review

## Current verdict

The user's current verdict is **6/10** for the animated map, with requested improvements to sound effects and command-center UI/UX.
The earlier v6 critic score of 8/10 is historical and does not represent user acceptance.
The command-center revision is built and verified; user visual assessment remains pending.

## Command-center verification

The two supplied videos and local auto-caption transcripts are examined in [the command-center research note](RESEARCH-COMMAND-CENTER.md).
The viewer now provides counted project/topic navigation, a map work area, a persistent desktop evidence inspector, a status strip, and a searchable Ctrl+K command palette.
Browser checks confirmed action execution, repeated arrow-key navigation, Escape focus return, source selection, accurate navigation state, and native sound activation/muting.
At 390 by 844 pixels, the map has a nonzero height, has no horizontal overflow, and provides a collapsible collections rail and evidence bottom sheet.
The shipped sound-cue function passed checks for muted/suspended gating, bounded gain and duration, rapid-repeat suppression, and audio-node cleanup.
Audio timbre was not assessed by listening; sounds are optional, off by default, and restricted to deliberate interactions.
Corpus integrity, malformed-import preservation, standalone export, Graphify snapshot export, and Windows compilation passed.
The former mobile zero-height layout, toolbar overlap, native close-button styling, palette focus regression, and stale navigation state were corrected.
These checks cover the bounded local demonstration corpus; no new visual score or user acceptance is claimed.

The final static rendered review was historically scored 8/10; that was not an acceptance pass.

## Historical build and interaction verification

The final Windows executable and standalone HTML were rebuilt from the reviewed renderer.
Corpus checks pass for canonical IDs, relationship endpoints, evidence references, three projects, SQLite retrieval, and script-safe export.
Executable search returned two qmd results with Bun absent from the temporary process PATH, which was restored afterward.
Browser checks confirmed pan displacement, zoom from 62% to 74%, Fit reset, keyboard search/list selection, and focus moving to the evidence drawer.
Clicking a real excerpt mark opened a single mentions_topic relationship with the reference video's located text at 8:48 and its 528-second source link.
Repeating the Cluster-to-Rings switch produced byte-identical desktop screenshots; the final browser error log was empty.
The actual inline import handler rejects null nodes, null evidence entries, and dangling endpoints while preserving the existing map.
The offline viewer uses no external script or font asset; its inline script parses successfully.
These checks concern the bounded demonstration corpus, not a 35,466-file scale benchmark or semiconductor ingestion.

Review target: rendered v1 captures in `prototype-data/review/` on 2026-10-02, checked against the cluster and rings references and `NEXT-SPATIAL-PROTOTYPE.md`.

## v1 decision

**Overall: 5/10 - reject; below the 8/10 acceptance threshold.** Fidelity: 6/10.
Usability: 4/10.
Data honesty: 7/10.
Mobile: 4/10.

The captures show the intended dark full-window map, group colors, floating controls, mixed node glyphs, and honest 32-source / 6-topic / 499-excerpt counts.
In the cluster capture, nodes crowd the lower center and labels overlap both one another and cluster captions.
The hex grid and group outlines compete with the data.
In the rings capture, sources form loose vertical arcs around a handful of isolated anchors; there are no readable named bands, and the layout does not resemble the reference's concentric rings.
The mobile capture crowds map content and the legend into one viewport; labels overlap, the controls consume much of the usable width, and no readable evidence state is visible.

## Required fixes, ranked

1.
Eliminate label collisions and clipping.
Hide ordinary source labels at overview scale; show selected or searched labels, and keep group captions clear of members.
Include visible labels in fit bounds.
2.
Make rings a real radial layout.
Give each group a stable concentric band, fit the outer band to the available short side, separate members around the band, and show each band's name and count.
3.
Reduce background prominence.
Lower hex-grid and cluster-fill contrast so nodes and relationships lead.
4.
Adapt mobile composition.
Keep map controls compact, prevent legend/control overlap, suppress overview labels, and make the evidence drawer readable without hiding all useful map context.

Re-review the rendered cluster, rings, and mobile captures after these fixes.
No source-only score can pass the visual gate.

## v2 decision

Review target: `spatial-cluster-v2.png`, `spatial-rings-v2.png`, `spatial-mobile-v2-settled.png`, and `spatial-mobile-evidence-v2.png`.
The first mobile capture was taken before resize settled and is excluded from scoring.

**Overall: 7/10 - improved, but still below the 8/10 threshold.** Fidelity: 7/10.
Usability: 7/10.
Data honesty: 8/10.
Mobile: 7/10.

The cluster capture now has a clearer composition, quieter labels, less prominent grid, and honest corpus counts.
Hiding ordinary source labels at overview scale is appropriate: source identification remains available through search, the source list, and selection.
The mobile evidence capture shows a readable selected video title, provenance, excerpt, and relationships, so the initial distorted mobile image was a capture timing artifact rather than a steady-state defect.

The remaining blocker is the rings layout.
The desktop and settled mobile captures place almost all leaf sources on one outer orbit, while the inner marks are mostly anchors and links.
The ring guides do not correspond to named data groups, and a single horizontal `TOPICS · 6 / PROJECTS · 3 / DOCUMENTS · …` caption crosses and clips through the graph.
This misses the reference's named concentric bands and makes the rings view harder to read than the cluster view.

### v2 remaining fixes

1.
Make each ring represent a meaningful group or source class; distribute its members around that band's radius and keep group anchors/labels aligned with the same band.
2.
Replace the combined horizontal caption with short per-band labels positioned in clear gaps; prevent clipping at desktop and mobile widths.
3.
Re-capture the settled mobile rings view after the band change and confirm the evidence drawer still leaves enough map context.

Re-review the v3 cluster, rings, settled mobile, and selected-evidence captures before passing the 8/10 visual gate.

## v3 historical static review

Review target: `spatial-cluster-v3.png`, `spatial-rings-v3.png`, `spatial-mobile-v3.png`, and `spatial-mobile-evidence-v3.png`.

**Historical static-capture score: 8/10.** This score did not evaluate live motion and is superseded by the user's 3/10 verdict.

The cluster view now combines the dark full-window canvas, quiet hex grid, restrained group fields, color-coded glyphs, and compact floating controls from the visual reference.
It uses the actual 32 sources, 6 topics, 51 links, and 499 excerpts; excerpt marks add visible density without presenting each excerpt as an independent source.
Group names and counts are legible, while leaf labels remain available through the Labels control, search, Sources list, and evidence drawer.

The rings view now has four named, colored bands for transcripts, documents, projects, and topics, with counts and different radii.
The labels sit along the top-center bands without the v2 horizontal collision.
The settled mobile capture keeps all bands visible at overview scale.
The mobile evidence capture retains the selected source title, provenance, excerpt, and relationship details in a readable drawer.

No blocking visual defects remain in these captures.
On the narrow selected-evidence view, portions of the map are necessarily covered by the drawer and one long ring caption is clipped at the right edge; the source evidence itself remains readable.
Keep testing labels, drawer sizing, and ring fit with longer names and smaller viewports as the corpus grows.

## Historical v4 static-capture check

Reviewed `spatial-cluster-final.png`, `spatial-rings-final.png`, `spatial-mobile-final.png`, and `spatial-mobile-evidence-final.png`. **Historical static-capture score: 8/10; this was not an acceptance pass.** The rings labels now sit above their corresponding band markers, and the north transcript glyph is clear in both desktop and settled mobile views.
Group names and counts remain readable on mobile.
The evidence drawer remains legible with the source title, local provenance, excerpt text, and relationship evidence visible.

Residual risk is limited to map context behind the open mobile drawer: ring labels can be partly off-screen while a source is focused, although the selected source and evidence remain readable.
Those checked screenshots meet the static visual target; validate long group names and unusually narrow screens if those enter the supported target. The live-motion verdict is recorded below.

## v5 live-motion review (historical)

**Historical score: 6/10 - below the user's acceptance target at v5.** Reference fidelity: 7/10. Motion craft: 5/10. Usability: 7/10. Performance: 8/10.

Evidence reviewed: the coordinator's continuous 10.36-second MP4 and 65 timestamped frames, including both layout switches; the Motion-off capture was stable, while Motion-on frames advanced. Rings visibly sweep excerpt marks around the bands, shimmer changes their brightness, and Cluster/Rings morph between layouts. The keyboard `qmd` search still opens the reference video with its five recorded relationships and located evidence.

The map still reads mostly as a static constellation. In Cluster mode, the group centers, source glyphs, and links stay fixed; most idle movement comes from tiny excerpt marks circling each source and a very slight cluster breathe. The more visible sweep occurs in Rings mode, but its primary source glyphs remain largely stationary. This makes the added motion easy to miss at a glance and leaves the visual result short of the user's “impressive” bar. Preserve the honest 32-source/6-topic corpus; improve the motion of the primary sources and their relationships at a readable scale, with a clear idle cue, then re-review a continuous run and Motion-off control.

The reviewer's isolated CUA browser was unavailable (`getState()` returned no browser surfaces and `createBrowserTab("iab", ...)` failed). This historical motion score used the coordinator's timed live capture sequence and MP4 rather than an independently controlled browser session.

## v6 live-motion review

Review target: 160 timestamped PNGs in `prototype-data/review/motion-v2/` and the 11.76-second `motion-demo-v2.mp4`. The captures span 11.709 seconds; Rings was selected at frame 65 and Cluster at frame 125.

**Historical reviewer score: 8/10 - pass.** Reference fidelity: 8/10. Motion craft: 8/10. Usability: 8/10. Performance: 8/10.

The main sources now move with their clusters, the rings glyphs travel along their bands, and relationship lines follow the moving nodes. Comparing frames 0 and 55 shows the cluster members visibly change position over 3.8 seconds; frames 75 and 120 show clear motion along the rings over 3.2 seconds. Frames 130–150 show the return morph. Movement is noticeable at a glance while remaining slow enough to read the map. The 32-source / 6-topic / 51-link / 499-excerpt totals remain honest.

The Motion-off check produced two byte-identical PNGs and an unchanged frame counter. A click on a transformed source position still selected the intended video and opened its Impeccable excerpt at 6:38–6:41 with a safe source link. The provided run therefore confirms both motion and pause behavior plus transformed hit testing.

Residual risk: the motion captures use a changed 1365×1244 viewport and start at 112% zoom, so some cluster/ring extents are cropped in the initial frames; this is not a controlled comparison with v5's viewport. The Rings/Cluster camera fit remains available. No v6 mobile motion capture was included, so verify small-screen motion and label fit before broadening the release claim. The actual entity count remains sparse; preserve that honesty rather than adding filler nodes.

## Rubric motion and command-center refinement

The user's latest requested refinement replaces whole-cluster circulation with terminal-only motion.
Cluster anchors and sources that own excerpt marks stay fixed; terminal sources and actual excerpt marks orbit at approximately 105 seconds per cycle at the default Orbit value of 25.
Rings retains full-band circulation at approximately 300–350 seconds per cycle.
Orbit zero holds circulation while layout transitions remain active; Motion off freezes rendering.
Glow uses cached radial sprites, with an independent toggle and command-palette action.
The shell now uses a warm orange command-center header, charcoal panels, collection controls, and an Action deck populated from real map counts and actions.

The actual display-frame fixture passed fixed-branch, terminal-orbit, excerpt-radius, and slower Rings checks.
Core graph, SQLite retrieval, HTML escaping, import rejection, audio bounds, standalone export, and Windows compilation checks passed.
Compiled-browser review passed at 1280×720 and 390×844, with no horizontal overflow or console errors.
Orbit zero allowed the Rings morph and camera fit to complete; Glow and its keyboard command toggled successfully.
Motion off produced unchanged frame counters and byte-identical screenshots.
Clicking a circulating Rings excerpt opened the gauntlet-loop video's located Skills excerpt at 13:04–13:08.
Mobile source navigation opened the reference video's evidence sheet and timestamp links.

Proof images: `prototype-data/review/rubric-desktop.png`, `rubric-rings.png`, and `rubric-mobile.png`.
The user's last score remains 6/10; this refinement awaits their visual assessment and has no assigned replacement score.
