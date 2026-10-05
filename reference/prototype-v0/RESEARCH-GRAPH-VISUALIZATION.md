# Dependency map visualization research

Reviewed 2026-10-02 against Anthropic’s article and plugin source, primary visualization docs, and the current Tomeowl viewer/core.

## Verified Anthropic implementation

The September 23, 2026 article links its “code modernization plugin” to Anthropic’s public `claude-plugins-official/plugins/code-modernization` repository and calls `/modernize-map` a starting point for mapping code dependencies and documenting workflows ([article](https://claude.com/blog/how-to-prepare-for-ai-driven-code-modernization-projects), [plugin README](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/README.md)).

The [`commands/modernize-map.md`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/commands/modernize-map.md) command produces `topology.json` and a standalone `TOPOLOGY.html`; it prefers existing compiler/import/build dependency exports, advises checking sample edges against code, and calls out dependency facts static import graphs may miss, including dynamic dispatch, deployment entry points, and config-mediated data stores.

Its JSON is a hierarchy plus graph: `root` contains nested `domain` and leaf objects; leaves carry `id/name/kind` and optionally `language/loc/file/description`; `edges` carry leaf `source/target/kind`; and top-level `entryPoints`, `deadEnds`, `observations`, and persona `flows` carry execution context. Edge kinds are calls, dispatch, reads, and writes; uncertain dynamic calls stay observations instead of being mislabeled as dead ends.

Verified viewer implementation: [`assets/topology-viewer.html`](https://github.com/anthropics/claude-plugins-official/blob/3b9df6160068f836214bfae942a2ca2530489c84/plugins/code-modernization/assets/topology-viewer.html), pinned to its latest listed file revision `3b9df6160068f836214bfae942a2ca2530489c84` (June 9, 2026), inlines a subset of D3 v7 for hierarchy/pack/zoom/selection/easing, and computes a fixed 8000×8000 circle-pack layout once with leaf area derived from LOC and a size floor for non-code nodes.

The viewer then draws circles and typed dependency curves on a Canvas, with a dark palette, pan/zoom, zoom-based child reveal, viewport culling, search, edge-kind toggles, selection details, and persona-flow walkthrough. Its source comments say the one-time layout avoids recomputation during zoom and targets 60fps; this is an implementation claim, not an independently measured benchmark.

This is a real clustered dependency-map implementation, but its clusters are explicit nested domains and its glyphs are all circles; it is not a force layout or an inferred community algorithm, and does not verify the hexagon/star styles in the RoboNuggets second-brain reference. The template also includes a restrictive CSP, escapes injected untrusted JSON in the map command, and works offline without external assets.

The plugin’s [license](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/LICENSE) is Apache-2.0; the viewer says its inlined D3 subset retains its ISC copyright/license notice. Reuse/adaptation is permitted with license and notice obligations: preserve D3’s notice, include applicable Apache license text, retain attribution, and mark modified files. The repository showed 37,266 stars, 4,187 forks, and a 2026-09-30 push in the public GitHub API when checked ([repo metadata](https://api.github.com/repos/anthropics/claude-plugins-official)); these counts are a dated snapshot.

## Tomeowl baseline and implication

The current snapshot reports 38 nodes, 51 relationships, and 11,095 chunks; chunks are evidence rows, not map nodes. Six regex-defined topics plus project/document nodes make the graph, and the canvas shows up to 24 source nodes with the larger bounded corpus available in the source list ([`src/core.ts`](src/core.ts#L593), [`src/viewer.html`](src/viewer.html#L32), [demo snapshot stats](prototype-data/map.json#L4217)).

The core currently emits project-contains-document edges, regex-based source-topic mentions, and co-mentions within one text span; a co-mention explicitly does not prove integration. These are sourced evidence relationships, not code import/call dependencies or validated semantic communities.

The present [viewer](src/viewer.html#L32) draws a light fixed-column SVG map, with rectangles, no pan/zoom, and a 24-source canvas cutoff. The user’s updated direction supersedes the light, bounded, ordered graph assumption recorded in `DESIGN.md`: the proposed next surface is a dark clustered Canvas with mixed glyphs and a DOM evidence/list panel. Keep that explicit as proposed work; the existing viewer does not implement it.

## Layout options

- **D3 circle pack:** The official description says containment communicates hierarchy while leaf-circle size conveys a quantitative measure; parent areas approximate subtree totals, with some distortion ([D3 pack docs](https://d3js.org/d3-hierarchy/pack)). It is the closest match to Anthropic’s groups and provides stable layouts, but expects a tree, so overlapping topic memberships should reuse one node identity instead of duplicating source nodes.
- **D3 force:** The many-body force acts globally, including across disconnected subgraphs, and uses Barnes–Hut approximation at O(n log n) per application ([D3 many-body docs](https://d3js.org/d3-force/many-body)). Force adds useful freeform exploration but does not itself explain group membership and should not drive an unstable animation on each open.
- **Sigma + Graphology:** Sigma is a WebGL graph renderer, while Graphology supplies Louvain communities and ForceAtlas2 layouts, including worker support ([Sigma docs](https://www.sigmajs.org/docs/), [Louvain docs](https://graphology.github.io/standard-library/communities-louvain.html), [ForceAtlas2 docs](https://graphology.github.io/standard-library/layout-forceatlas2.html)). This is the likely later option for a large, genuinely edge-dense network, at greater library/runtime cost.
- **Cytoscape.js:** It supports compound graphs and built-in layouts, but its docs note increased rendering cost with graph size and edges; its layout guidance also warns large graphs become visual noise and encourages selecting useful subgraphs ([docs](https://js.cytoscape.org/), [layout guidance](https://blog.js.cytoscape.org/2020/05/11/layouts/)).

Folders and topics are explicit groups; Louvain communities are inferred from edge density and can cross folder boundaries. Show derived communities with their method and edge basis, separately from known source ownership.

## Recommendation

Keep the JSON hand-off, Bun SQLite core, and standalone offline HTML, and adapt the smallest useful part of Anthropic’s viewer: fixed coordinates computed once, one Canvas transform for pan/zoom, and progressive node/edge reveal. The plugin’s Apache license and the embedded D3 ISC notice permit adaptation when their obligations are retained.

For the requested design, use a dark Canvas map with compact colored clusters, circles/hexagons/stars as node-kind glyphs, and relationship types distinguished by line color/style; use DOM for accessible search, list navigation, selected-node details, and source evidence. Group known project/folder sources explicitly, keep stable ids across overlapping topic filters, and present inferred communities as a labeled overlay only after a defensible edge signal exists.

A small renderer pipeline is: source/evidence JSON → explicit groups and typed links → deterministic group ordering and weight aggregation → pack positions once → Canvas transform plus visible-node/edge culling → hit test by stable node id → DOM inspector lookup of original evidence. The current corpus is small enough that a custom Canvas renderer or narrowly vendored D3 hierarchy/zoom subset is simpler than Sigma or Cytoscape; vendor a pinned build with notices rather than loading from a CDN.

Do not draw one node per chunk: keep the 11,095 evidence rows attached to source relationships and disclose the 24-source interaction cap until a representative corpus benchmark supports changing it. Future scale work should expand/collapse aggregate clusters, keep stable coordinates between exports, and render only visible/selected neighborhoods.

## Limits

The plugin is evidence of its own public implementation, not proof that its analysis produces complete dependency facts for an arbitrary codebase; its command explicitly warns about upfront analysis and unresolved dynamic behavior. The RoboNuggets screenshot’s generator, cluster algorithm, and shape semantics remain unverified here. No visual, performance, keyboard, or mobile benchmark was run for Tomeowl or the candidate libraries.

