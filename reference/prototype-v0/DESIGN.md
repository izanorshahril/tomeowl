# Spatial evidence map

Mode: Operate.
Use a dark, full-window canvas as a quiet field for a sparse but evidence-rich local corpus.
A faint hex grid, fine cluster outlines, lilac and cyan topic anchors, and warm project glyphs give the map its visual structure.
Videos are circles, topic anchors are diamonds, projects are hexagons, and documents are diamonds.
Recorded excerpts appear as small marks around the source they came from; each mark opens its actual relationship and located evidence.
These marks are evidence records, not additional source nodes.

The cluster layout assigns each video to its strongest recorded topic mention for presentation only.
Documents follow explicit project containment where available; project and document sources stay in their own project clusters.
Each canonical source appears once.
Other recorded links remain selectable from the source neighborhood, and the persistent evidence inspector names their relationship and shows excerpt text, path, and timestamp or line when present.
Colors identify topics or projects; they do not encode confidence or relationship strength.

The cluster layout packs occupied silhouettes by size with deterministic golden-angle placement; empty primary-topic groups do not receive a misleading count chip or halo.
The Rings layout arranges the same canonical sources in named, counted topic, project, document, and transcript bands.
Excerpt marks occupy rows along their owning source's band; cluster mode packs them around the source glyph.
Leaf labels start hidden to keep dense regions readable; selecting or searching a source reveals its label, and the source list keeps every matching item available to the keyboard.
Both layouts use deterministic placement without a force simulation, downloaded asset, CDN, or runtime dependency.
This intentionally differs from the researched D3 circle-packing proposal: a small self-contained layout keeps the compiled/offline viewer portable and stable.
Node size uses source kind and available relationship/count metadata; the map never invents sources to fill space.
Counts distinguish sources, topics, relationships, and recorded excerpts.

The desktop workspace uses a persistent local-project and occupied-topic rail, a centered map with a compact toolbar, and a right-side action deck that opens on a real collection overview or selected evidence; a bottom status strip reports the current map mode, zoom, selection, and local/offline state.
Map and Sources navigation stays visible in the header, while the collection rail groups only real projects and occupied topic groups with counts from the current map.
The Commands dialog opens from its button or Ctrl+K and searches existing actions for layout, filtering, sources, labels, motion, zoom, fit, import, and export.
Optional interface sounds start off and use short, quiet selection, layout, import-success, and import-error cues only after the user enables sound.
Search filters visible canonical sources and moves the view to a match.
Actual excerpt marks orbit their owning source in Cluster and remain attached to that source. Source anchors and sources with excerpt children stay fixed; only terminal sources with no inferred presentation children orbit their stable group center.
Cluster motion uses a 105-second orbit at the default speed of 25, with no cluster-center drift or group rotation.
Presentation children are only project-contained documents, sources assigned to occupied topic anchors, and real excerpt marks owned by sources; topic mentions only assign sources to groups.
Rings rotates each source category around the map center on 300–350-second cycles, with excerpt marks co-rotating with their owning category.
The accessible Orbit speed slider ranges from 0 to 100 and starts at 25; zero holds map positions while keeping layout morphs and camera fits available.
Motion pauses during layout morphs and eases back in from captured source and excerpt positions, preserving hit targets throughout.
Changing layouts morphs the same source identities between positions, while selected recorded relationships carry small directional particles as a navigation cue, not a claim of live activity.
Motion runs at a bounded 30 frames per second, pauses while the page is hidden or the map is being dragged, and can be paused with the Motion control.
Pausing holds the current displayed source and excerpt positions; resuming continues from that pose.
The system reduced-motion preference starts the map still and disables Motion and Orbit speed controls; a still first frame remains fully readable.
Glow can be toggled independently and uses cached radial sprites for node blooms and relationship focus.
Hovering a source or excerpt mark shows its recorded name and, for evidence, its actual excerpt.
The evidence inspector exposes clickable related sources and safe HTTP(S) source links, with a real collection overview and source workflow before a selection is made.
The HTML source list keeps every matching source keyboard-accessible without depending on canvas hit targets.
On narrow screens, the collection rail opens from a Collections control, the evidence inspector becomes a bottom sheet, and map actions wrap into a compact toolbar.

The map opens offline and preserves the embedded map-data payload, schemaVersion 1 import bounds, URL protocol checks, and HTML escaping.
Imported-snapshot warnings remain visible; malformed records are rejected before replacing the displayed graph.
Automatic captions remain located excerpt evidence; they are not promoted into overview nodes or treated as verified code dependencies.
