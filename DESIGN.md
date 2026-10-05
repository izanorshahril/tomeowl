---
name: Tomeowl
description: A local evidence map with role clouds, concentric source bands, warm orange controls, and inspectable sources.
colors:
  canvas: "#151716"
  chrome: "#191c1a"
  panel: "#1b1e1c"
  surface: "#242824"
  line: "#333a34"
  text: "#ecede5"
  muted: "#a5ada4"
  quiet: "#858e85"
  accent: "#ecae7d"
  selected: "#342b23"
  mint: "#9ec9ba"
  focus: "#f2b486"
  group-lavender: "#c1ade5"
  group-sky: "#88bdd8"
  group-sand: "#dfbf8d"
  group-rose: "#d8a6b6"
  group-blue: "#a7c4e0"
  group-sage: "#c0cb92"
  contrast-canvas: "#0a0b0a"
  contrast-chrome: "#101310"
  contrast-muted: "#c8cec7"
  contrast-line: "#6f786f"
  role-project: "#d9b781"
  role-guidance: "#eaaa70"
  role-skill: "#f38b4c"
  role-app: "#79b9ed"
  role-document: "#b4a0ed"
  role-research: "#c185e8"
  role-citation: "#77cbd3"
  role-channel: "#eaaa70"
  role-video: "#79b9ed"
  role-description: "#d9b781"
  role-transcript: "#9ec9ba"
  reference-canvas: "#0a0c10"
  reference-surface: "#14141e"
  reference-muted: "#a9a7b6"
  reference-highlight: "#fff0ce"
typography:
  headline:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "26px"
    fontWeight: 550
    lineHeight: 1.2
    letterSpacing: "-.025em"
  title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "22px"
    fontWeight: 550
    lineHeight: 1.35
    letterSpacing: "-.02em"
  body:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
  evidence:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "13px"
    lineHeight: 1.8
  label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 600
  mono:
    fontFamily: "Consolas, monospace"
    fontSize: "10px"
    lineHeight: 1.6
  role-label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: ".055em"
rounded:
  compact: "3px"
  inset: "4px"
  control: "5px"
  group: "6px"
  overlay: "10px"
  sheet: "12px"
spacing:
  micro: "4px"
  tight: "6px"
  compact: "8px"
  control: "10px"
  content: "12px"
  section: "16px"
  roomy: "20px"
  rail: "24px"
  map: "26px"
components:
  text-button:
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "10px 0"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "{spacing.compact}"
  lens-option:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "11px 10px"
  lens-option-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "11px 10px"
  dimension-option:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  dimension-option-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  search-field:
    textColor: "{colors.text}"
    rounded: "{rounded.group}"
    padding: "8px 9px"
  layer-chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  layer-chip-active:
    backgroundColor: "#31362f"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  endpoint-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.compact}"
    padding: "{spacing.content}"
  original-quote:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.mono}"
    rounded: "{rounded.inset}"
    padding: "{spacing.control}"
  graph-form-option:
    textColor: "{colors.muted}"
    rounded: "4px 4px 0 0"
    padding: "8px 12px"
  graph-form-option-active:
    textColor: "{colors.accent}"
    rounded: "4px 4px 0 0"
    padding: "8px 12px"
---

# Design System: Tomeowl

The user froze the current UI/UX on 2026-10-04 as baseline `ui-2026-10-04`.
Preserve the current forms, command-center layout, tokens, interactions, motion controls, illumination, and relationship focus for subsequent data and backend work.
Visual or interaction redesign requires a subsequent user request.
The [baseline guide](docs/UI-BASELINE.md) describes reproducible CLI builds and reuse of the authored renderer with other datasets.

## Overview

**Creative North Star: "Evidence Constellation"**

Tomeowl's implemented viewer is an Operate workspace for finding a source, following recorded links, and inspecting cited evidence.
A dominant charcoal map opens in Command center between divided workspace and research dashboard rails, with navigation and evidence available as temporary panels.
Warm orange marks actions and selection, while role colors distinguish source clouds and concentric bands.
Source selection reveals actual linked neighborhoods through progressive distance emphasis, with a reset that preserves the active view.

The interface uses system fonts, authored inline SVG, native controls, and an offline snapshot.
Its command-center identity comes from precise chrome, organized layers, actual snapshot inventory, and optional illumination around real source particles and role layers.
The supplied [clusters](reference/visual-direction/rubric-clusters.png) establishes the volumetric role-cloud form; [Rings](reference/visual-direction/rubric-rings.png) and [Agentic OS arms](reference/visual-direction/agentic-os-arms.png) establish concentric role bands.
The [command-center](reference/visual-direction/rubric-command-center.png) informs the divided side modules and dominant central graph, while the [dependency map](reference/visual-direction/claude-dependency-map.png) informs readable inspection.
Reference geometry and glyphs are adapted to actual source roles rather than copying the references' unrelated application, routine, or dashboard data.
The archived prototype is a reference rather than the active rendering system.

This document records the implemented Command center and Map surfaces, Constellation/Orbital/Atlas forms over the Projects and Research lenses, source neighborhoods, dashboard sections, and evidence inspector.
Measure Lab, Program Atlas, and Review Desk remain proposed surfaces in the [engineering evidence specification](docs/drafts/ENGINEERING-EVIDENCE-SPEC.md).
Their analytical interactions are not implemented viewer components.

**Key Characteristics:**

- A dominant evidence map framed by real snapshot sections or expanded in the separate Map surface.
- Warm orange actions and selection over charcoal surfaces.
- Volumetric role clouds and concentric bands over actual source particles.
- Role color and glyph shape separated from recorded relationships.
- Animated 2D and 3D with stable reading/targeting and a visible still control.
- System typography and authored inline SVG that work offline.

## Colors

The frontmatter preserves the exact reused colors from [viewer.css](src/viewer/viewer.css), the Atlas group palette in [projection.ts](src/viewer/projection.ts), and the role palette in [reference-geometry.ts](src/viewer/reference-geometry.ts).
It owns the primitive values; the sidecar adds role metadata and illustrative tonal ramps.

### Primary

The warm orange `accent` identifies links, active navigation, selected sources, and return actions.
Graph glow retains each particle's existing role color and uses warm central illumination, independently of motion or source selection.
The lighter `focus` supports a visible keyboard outline.
The dark warm `selected` surface holds an active navigation or source row without turning the whole rail orange.

**The Selection Rule.** Distinguish selection with an outline and active-row surface independently of graph illumination because Skills also uses warm orange.
Selected source particles remain bright while actual recorded link distance progressively reduces the emphasis of other particles and their bloom.
This emphasis expresses undirected connectivity within the current corpus/neighborhood rather than confidence, agreement, or dependency direction.

### Secondary

Constellation and Orbital use the fixed `role-*` palette: warm project and main-document anchors, orange skills, blue app manifests, purple documents and research, and cyan citations.
Role color is paired with a label and shape: Skills are diamonds, App manifests are hexagons, and other source roles use circles.
The `mint` color marks source types, evidence locators, and the recorded-link legend outside that role encoding.
Atlas uses the separate seven-color group palette, beginning with `mint` and followed by `group-lavender`, `group-sky`, `group-sand`, `group-rose`, `group-blue`, and `group-sage`.
Atlas group assignment follows the sorted group identities within a corpus, so filtering a snapshot does not reshuffle its palette.
The colors distinguish categories; they do not encode confidence or semantic similarity.

**The Evidence Channel Rule.** Keep category color, visual grouping, inventory membership, and recorded references visibly distinct.

### Neutral

The `canvas` is the map and page foundation; `chrome` holds the topbar and rails.
The `panel` is the command-dialog surface, and `surface` holds active segmented controls, endpoint cards, and original quoted text.
The `line` color defines low-contrast structural borders.
The `text`, `muted`, and `quiet` colors separate primary reading, supporting metadata, and peripheral hints.
Reference forms use `reference-canvas` and `reference-surface` for the deeper graph gradient and label stroke, `reference-muted` for role counts, and `reference-highlight` for glyph hover and role selection.
The contrast preset overrides the canvas, chrome, muted text, and border roles with the corresponding `contrast-*` values.
Command-center chrome, dashboard rails, and skill tiles add deeper local neutral surface overrides in the authored stylesheet; the existing primitive values and role palette remain unchanged.

## Typography

The system font stack keeps the viewer native to Windows and available offline.
Consolas is reserved for original quoted text and its monospace fallback.
There is no separate display face or downloaded font.

- **Headline:** The main workspace heading uses the headline role, with smaller responsive overrides.
- **Title:** Inspector headings use the title treatment with a local size override.
- **Body:** The root role establishes the inherited UI font; descriptive paragraphs use compact local sizes and generous line height.
- **Evidence:** Excerpts use the evidence role with preserved line breaks and wrapping for long text.
- **Label:** Section headings and compact labels use restrained weight; counts use tabular numerals.
- **Mono:** Original quoted text stays visually distinct from the cleaned reading excerpt.
- **Role label:** Screen-scaled role headings identify the cloud or band, with a tighter letter-spacing override on mobile.

**The Reading Rule.** Keep excerpts readable and preserve original quoted text in a separate native disclosure.

## Layout

The default desktop workspace is Command center, with a fixed 66px topbar, a dominant central graph, and two divided dashboard rails that scroll independently.
Its base rails are 248px and 288px, expanding to 280px and 320px at 1500px and above and narrowing to 222px and 254px between 901px and 1180px.
The graph keeps the remaining width; its compact heading uses a 20px override and the form/dimension/still controls remain visible.
Explore and Evidence open temporary 320px drawers above the dashboard and graph rather than replacing their snapshot content.
The topbar surface switch opens Map for a larger canvas, where Restore panels returns navigation, a flexible map, and the evidence inspector.
At the base restored Map size, those rails are 224px and 292px; at 1500px and above, they expand to 248px and 316px; at 1250px and below, they narrow to 202px and 270px.

At 900px and below, Command center places the dashboard rails below the graph in two columns and lets the workspace page scroll.
At 740px and below, those sections become one vertical stack; the graph panel keeps a 660px minimum height with a 345px minimum graph area before the dashboard sections.
The compact mobile legend occupies its own bottom-left space below the outer role labels, separated from the bottom-right camera controls.
In Map at 1080px and below, the inspector becomes a dismissible right drawer and navigation keeps a 208px rail.
At 740px and below, the topbar becomes 58px tall, navigation opens in a left drawer, and evidence opens in a bottom sheet occupying 72dvh.
Mobile source neighborhoods and Research retain the heading, dimension switch, display controls, wrapping layer filters, legend, and camera controls.
Atlas's mobile 2D Projects overview uses a scrollable two-column index with full project titles, categorical dots, and real counts.
Those rows open the same project neighborhoods; the spatial overview remains available on desktop and in 3D.
The compact overview hides graph camera controls and the spatial legend.
The source list remains the complete alternative to spatial selection.

The visible graph-form switch offers Constellation, Orbital, and Atlas.
Constellation is the default form: project inventory occupies the core, main documents wrap the center, and skills, applications, documents, research, and citations form distinct clouds with genuine depth.
Orbital uses true concentric role bands: projects and main documents at the center, skills inside, documents/research/citations in middle sectors, and applications on the outer ring.
Only occupied roles receive a frame, label, or source count.
Constellation and Orbital render up to 400 actual sources without Atlas's citation-representative reduction; every scoped source remains available in Explore.
Atlas retains the regular project grid and layer neighborhoods, with a 120-source spatial cap and up to twelve shared research citation representatives.
The former Rings arrangement remains available in Display as Source circle · legacy; it is a single source circle rather than Orbital's concentric role bands.
All forms support the default 2D view and optional perspective 3D over the same scoped projection.
Role filtering and search reuse positions calculated from the complete unfiltered scope.
The separate Map surface starts expanded; Explore and Evidence reopen temporary panels, and Restore panels returns its ordinary shell.
Expand map restores the larger graph canvas, and the surface plus expanded/restored preferences survive reloads.
Scope and node-cap metadata occupy a separate strip above the graph: Map reserves 42px on desktop and 48px on mobile; Command center uses compact 32px/42px overrides.
Workspace pulse and Source layers explicitly describe the whole snapshot, while map counts and source rows describe the active corpus and filter.

**The Shared Scope Rule.** Derive map nodes, source rows, scope counts, and inspectable links from the same scoped projection, and label whole-snapshot dashboard inventory separately.

## Elevation & Depth

The resting shell relies on tonal layering and thin borders.
Overlay shadows are structural: display settings and the command dialog float above the map, while drawers and the mobile evidence sheet separate temporary reading space.
Selection treatment remains distinct from the optional graph-wide illumination.
Graph glow adds role-colored particle bloom, cloud/band auras, and warm central light without blurring labels, evidence paths, or hit targets.
Constellation uses occupied-role cloud auras, while Orbital adds a bounded knowledge-band wash and central light; Atlas retains a modest glyph glow.
Glow off and High contrast remove the bloom, auras, and central halo.
The sidecar carries additional shadow, motion, breakpoint, and component metadata outside the primitive token schema.

Optional perspective 3D adds depth planes and camera rotation without adding another evidence model.
Engineer is the default profile with bounded ambient motion in 2D and 3D, and Presentation retains that movement unless a still override applies.
Constellation moves actual particles within their role clouds; Orbital preserves concentric role bands and knowledge-sector gaps, while Atlas uses restrained overview/terminal-node motion.
The visible Pause/Resume action and primary Motion speed slider preserve a still view without removing evidence tasks.
The native range runs from Still at 0% to the existing pace at 100%, with slower fractional scaling and a synchronized Display slider.
Its 100% endpoint maps to the existing internal pace of 25; restoration clamps saved speed to that bound, so the control does not accelerate beyond the existing movement.
A positive speed change resumes ambient motion when allowed, and selected/hovered/focused/dragged/hidden/reduced-motion/High contrast holds remain active.
High contrast selects a stronger neutral palette and turns glow and motion off when chosen.
The browser saves view preferences, scope, and camera state; selection sound starts off and is never restored as enabled.
Preferences use `tomeowl.display.v4`; valid v3/v2 views migrate once into the requested animated Command center and refit while retaining graph form and scope, subject to reduced-motion and High contrast overrides.
Saved v4 pauses and zero speed remain still on reload, and the validated surface choice is saved alongside the other view preferences.
The validated `mapExpanded` boolean defaults to true and is saved with the view.
Reset display preferences keeps the current surface and expanded/restored Map choice.
Ambient motion pauses for a selected source or relation, a hovered or keyboard-focused map target, dragging, a hidden page, zero speed, reduced motion, or High contrast.
The elapsed clock stops on pause and bounds active time steps, so a resumed or visible page does not jump ahead.
Form, corpus, neighborhood, role, and dimension changes use cancellable 250ms opacity/blur transitions with an exponential ease-out curve.
Selection and Show all nodes settle particle/bloom opacity from the prior displayed pose over 220ms with the same ease-out curve, independently of the ambient-motion reading hold.
Dragging adds a restrained pointer-following accent wash and guide attenuation, then settles over 180ms without inertial camera drift.
The reduced-motion rules remove ambient movement, scene transitions, panel entrance animation, and drag-release effects while keeping the final view visible.
Reduced motion also skips the relationship-focus opacity settle and applies the final emphasis immediately.

**The Still Reading Rule.** Pause ambient movement while a source or relation is selected or a map target is hovered or keyboard-focused so reading and selection stay stable.

## Shapes

Controls have modest corners, ranging from compact rows to grouped controls and larger overlays.
The frontmatter captures the repeated radius scale rather than imposing one radius on every element.
Borders are thin and quiet, with a warmer active surface for navigation and a stronger focus outline.
Constellation role clouds use light circular outlines and, in 3D, wire depth guides around volumetric source placements.
Orbital role bands use concentric circular tracks and middle knowledge sectors.
Projects, Main docs, and Skills labels sit outside the outer band with dashed organizational leaders; their source particles remain in the corresponding inner bands.
Skills use orange diamonds, app manifests use blue hexagons, and documents/research/citations use colored circular particles.
Every source particle is backed by an actual scoped source.
The central scope symbol and role frames are organizational anchors, not additional evidence records.
Atlas retains dashed elliptical project hulls, central counts, small layer satellites, and circular source glyphs with inset app/skill marks.
Its compact mobile project index uses flat divided rows instead of shrinking those spatial anchors.

## Components

### Actions and fields

Text actions use warm orange; icon actions use muted text until interaction.
Buttons use a subtle translucent hover surface and short background, color, and border transitions.
Keyboard focus uses a 2px outline with an offset; disabled buttons reduce opacity and use the default cursor.
The search field combines an inline search icon, a transparent native input, and a keyboard hint inside a bordered group.
Native select, checkbox, and range controls handle display preferences.
Motion speed is a primary labeled range with a percentage output and an explicit existing-pace endpoint; 0% reads Still, and Display exposes the same synchronized value.
Glow is a primary pressed-state button paired with Display's Graph glow checkbox and is independent of the motion controls.
High contrast disables illumination; reduced motion preserves a stable graph and its usable controls.

### Navigation and filters

Projects and Research are the two implemented lenses.
Command center and Map are the two shell surfaces, selected through native topbar buttons with the existing warm active surface.
An active lens or selected source row uses the warm selected surface and orange text.
Source rows show a title, a path or citation status, and an authored icon; group rows add categorical dots and actual counts.
Layer chips filter the shared projection, and the segmented dimension control switches 2D and 3D.
The graph-form tabs expose Constellation, Orbital, and Atlas as primary choices, with a warm underline on the selected form.
Role labels filter the corresponding layer and show counts from the visible source set.
Restore panels and Expand map change the reading space without changing evidence, and the choice is saved.
The Overview action returns from a project neighborhood.
Small-screen Explore and Evidence buttons open dismissible navigation and inspector surfaces.

### Dashboard sections

Workspace pulse, App manifests, Source layers, Research connections, Skills deck, and Snapshot coverage are six asymmetric divided modules framing the graph.
Thin horizontal separators and compact type provide structure; module heights follow their real content rather than a repeated card template.
Command center uses local neutral overrides for its topbar (`#101210`), dashboard rails (`#111310`), and skill tiles (`#1b1e19`); these are component surfaces rather than a replacement palette.
Pulse uses a semantic definition list with tabular values and explicit whole-snapshot scope, plus Projects/Research actions and the observed workspace root.
Manifest rows pair the actual project name with a relative manifest path and open revisioned evidence; one root manifest per project appears in the shortlist.
Layer rows pair actual counts with quantitative role-colored bars and filter the appropriate corpus.
Research rows rank distinct recorded citation URLs, disclose URLs shared by other notes, and open the actual note; the footer preserves the unfetched URL boundary.
The Skills deck uses four compact document buttons in a two-column grid with source names and project context, without implying skill execution.
Coverage shows selected/discovered eligible files, bounded depth, recorded warnings when present, the snapshot date, and an action to inspect detailed scan coverage.
All user-supplied text is inserted as text, and dashboard updates preserve existing row DOM and focus.

### Evidence inspector

The inspector changes from a workspace brief to a group summary, a source excerpt, or a recorded relationship.
Readable excerpts, locators, relation endpoints, and source/revision disclosures form the reading hierarchy.
Original quoted text remains available beneath the cleaned excerpt.
Citation records explicitly identify unfetched URLs, and missing excerpts explain the available next action.
Copy citation includes the original quote, revision, and locator, with a selectable-text fallback when the clipboard is unavailable.

### Map and camera

Project anchors and source nodes are keyboard focusable and activate with Enter or Space.
Reference-form pointer activation resolves the nearest projected source center so overlapping hit areas select the visible particle while preserving canonical source IDs and keyboard targets.
Role outlines, orbital tracks, constellation spokes, and Orbital label leaders denote visual organization; the organizational hub is not a source.
A dashed Atlas hull denotes visual grouping, a dashed inventory link denotes structural membership, and recorded reference lines open their attached evidence.
Spatial proximity does not imply a recorded link.
Camera controls provide pan, zoom, fit/reset, and optional rotation/tilt; 3D also supports Shift-drag panning.
Role headings and source labels counter-scale with zoom, while particle shapes retain the overview silhouette.
Reference-form source labels reveal on selection, hover, focus, or sufficient inspection zoom; full titles stay available in Explore and the inspector.
Atlas source labels shorten to the available projected gap and viewport edge.
Selected source metadata stays in the inspector rather than adding a competing second map label.
Role-color bloom uses a separate glyph-only SVG layer, and role/cloud/band illumination sits behind the evidence graph.
Those decorative duplicates are aria-hidden and noninteractive, preserve actual source/edge targets, and update with the same camera and particle poses.

### Relationship focus

Source selection uses shortest undirected recorded-link distance over the complete current corpus/neighborhood before applying query or layer filters.
Hidden intermediate sources therefore remain part of the path calculation, while the displayed source set and evidence contracts stay unchanged.
The selected source has opacity 1; direct neighbors use 0.9, two hops 0.42, three hops 0.16, four hops 0.055, five or more hops 0.025, and disconnected sources 0.012.
Glyph-only bloom duplicates use those same values, and evidence edges use the lower endpoint opacity while retaining direct-link highlights.
Selecting a recorded relationship treats both actual endpoints as fully bright roots.
Role guides and auras are subdued to 0.12 during focus, the central hub to 0.18, role anchors to 0.48, and Atlas role headings/depth planes to 0.4.
Actual source groups reveal at full opacity on hover or keyboard focus; the complete Explore list and source/evidence actions remain available.
Atlas's aggregate project overview retains its normal emphasis because project anchors represent groups rather than selected source particles; Atlas source neighborhoods and the legacy circle support the same source fading.
Scope feedback identifies visible direct/indirect connections or the absence of links from the selected source in that scope.
Show all nodes clears source/relation selection and restores normal opacity while preserving query, layer, and camera; the selected-evidence reading hold lasts until clear or Resume.
Cross-corpus research-source selection keeps the full Research lens, including URL records, so actual recorded citations can be shown together.

### Commands and feedback

Jump to anything opens a native modal dialog for source search and navigation commands.
Escape closes temporary panels, while focus returns to their controls.
Empty states explain the current scope and a real next action.
A polite status toast reports citation and preference actions.
The visible Pause/Resume action and synchronized speed output communicate ambient-motion state, while selected, hovered, focused, and dragged map targets temporarily hold movement still.
The sidecar previews these existing primitives without supplying invented workspace records.

**The Provenance Rule.** Every displayed relationship must distinguish structural membership from a recorded reference and expose the evidence it actually carries.

## Do's and Don'ts

### Do:

- Do keep scope, search, layer filters, and evidence ahead of display effects.
- Do preserve the charcoal and warm orange identity with the existing system font stack.
- Do retain a complete source list and keyboard alternatives alongside the map.
- Do show real counts, revision context, and the distinction between fetched evidence and URL-only citation records.
- Do distinguish whole-snapshot dashboard inventory from filtered graph scope and keep dashboard rows connected to actual evidence actions.
- Do preserve stable reading and a useful still view when motion or glow is disabled.
- Do keep faded sources reachable and recorded link-distance emphasis separate from inferred meaning.
- Do retain the reference forms' central hierarchy, role glyphs, and distinct cloud or concentric geometry.

### Don't:

- Don't imply similarity, agreement, or confidence from layout, group color, or shared citation URLs.
- Don't invent decorative messages, calendars, routines, agents, or workspace records.
- Don't replace original quoted text with the cleaned reading excerpt.
- Don't treat proposed analytical surfaces as implemented components.
- Don't make sound or ambient motion a requirement for using the evidence workspace.
- Don't call a single evenly spaced source circle a concentric Orbital view.
