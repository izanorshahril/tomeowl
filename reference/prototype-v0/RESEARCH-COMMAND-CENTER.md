# Command-center UI and motion research

Reviewed 2026-10-02 against the two supplied RoboNuggets videos and first-party tool documentation.

## Evidence from the videos

Jay's [Agentic OS walkthrough](https://www.youtube.com/watch?v=8NSyI-npJCU) shows a single command center with calendar and time-zone information, flagged email, links to micro-apps, a custom YouTube widget, scheduled-routine status, a skills deck with per-run model and effort choices, resizable/repositionable widgets, searchable/openable prior artifacts, and a central path into the second brain (00:43-02:06).

The creator's dashboard supports fast access and at-a-glance status; the video does not disclose its implementation, data contract, persistence behavior, or source code.

The [design-tricks video](https://www.youtube.com/watch?v=_SVU3oC4JX8) recommends design-system references and a reusable design skill (00:32-02:28), focused cursor effects (08:00), Canvas UI effects (08:10-08:24), animated icons (09:16-09:38), GSAP for web motion (10:38-11:02), transcript-driven motion graphics with Whisper and HyperFrames (12:02-12:36), and a curated library of reusable 3D assets, motion, and SVG icons (12:39-13:06).

Neither supplied auto-caption transcript mentions interface sound effects or SFX; SFX should not be represented as advice from the creator.

## Recommended direction for Tomeowl

For the current Tomeowl product, prioritize an actual-collection rail, browser search, map actions, and a source-evidence inspector or command palette; Tomeowl already has collections, project maps, source evidence, browser search, and import/export, so keep the command center grounded in those real interactions.
Treat routines, calendar/mail summaries, and artifact launching as future integration ideas only, since they require real adapters and persistent state that Tomeowl does not currently provide.

Only add widget resize and placement if users need personal dashboard layouts, because the video demonstrates that flexibility but provides no evidence that it is essential to the command-center task.

Use brief, purposeful hover, focus, selection, layout-change, and completion feedback, with motion reinforcing state changes rather than running continuously; keep the still state fully usable and honor `prefers-reduced-motion` as supported by the [GSAP accessibility guidance](https://gsap.com/docs/v3/GSAP/gsap.matchMedia/).

Use the existing Impeccable skill for a focused design critique or polish pass, following its [official workflow](https://impeccable.style/docs/improve-design/); the video names this skill at 06:35-07:05.

Prefer existing CSS and SVG for simple UI feedback, and consider [GSAP timelines](https://gsap.com/docs/v3/GSAP/gsap.timeline/) only if a coordinated sequence materially improves the interaction; the project currently has no GSAP dependency.

Treat [Canvas UI](https://canvasui.dev/docs) as an optional source of visual references rather than a baseline dependency, since its documentation says the live-HTML canvas path relies on an experimental browser API.

Treat [HyperFrames](https://hyperframes.app/docs/5-packages/cli) as relevant to rendered video/motion-graphics workflows from the transcript example, not as a command-center UI runtime.

If SFX are still desired, that is a separate product-design choice unsupported by these sources; keep sounds optional, muted by default, and limited to meaningful completed actions.

## Rubric visual reference follow-up

On 2026-10-02, [Rubric's public site](https://www.getrubric.app/) describes a modular command center with flows, skill trees, agents, recurring jobs, generations, documents, links, and sprints.
The site directs installation access through the RoboNuggets community; its underlying implementation was not obtained or verified.
The user's two supplied screenshots establish the requested visual direction: near-black panels, fine warm-orange frame lines, spaced section headings, compact action decks, and luminous multicolor graph nodes.
Tomeowl adapts that presentation to its actual collections, source evidence, and map actions without claiming email, scheduling, or live agent integrations.
The requested Cluster motion treats excerpt marks as terminal visual leaves and holds their source branches and structural anchors stationary.
Topic-mention relationships are evidence links rather than hierarchy edges, so they do not define child nodes.

## Evidence limits

Both local transcripts are marked auto-generated, so captions can misstate tool names; the time ranges point to the supplied transcripts and should be checked against the linked videos for any detail that changes implementation.

The creator's demonstrations establish examples, not a usability study or requirement that Tomeowl reproduce the same layout.


