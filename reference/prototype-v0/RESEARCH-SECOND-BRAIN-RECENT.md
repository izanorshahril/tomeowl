# Second-brain research, 2026-10-02

This note combines public discussion and project documentation for 2026-09-02 through 2026-10-02, then marks older references separately.

## Recommendation

The recommendations below are my synthesis of the evidence, not a universal standard or a consensus across mature personal-brain systems.

Start with a local folder of Markdown source notes and a small SQLite catalog, then add hybrid retrieval or automated synthesis only when a measured retrieval gap justifies it.

Treat files as the durable, human-readable source of truth and SQLite as a rebuildable index so backups, diffs, edits, and tool changes do not depend on one application.

Make capture low-friction and curation selective: preserve source material in an inbox, promote only reusable facts or decisions into linked notes, and archive the rest without demanding a perfect taxonomy up front.

The strongest recent user signal is friction from elaborate systems that people stop revisiting; a September 26 r/productivity thread (59 points, 35 comments) describes abandoning an overbuilt PARA setup for searchable plain notes, while an Obsidian thread questions whether the AI layer adds enough value ([discussion](https://www.reddit.com/r/productivity/comments/1wqz6tf/are_second_brain_and_para_systems_making_us_more/), [Obsidian discussion](https://www.reddit.com/r/ObsidianMD/comments/1wgted1/i_tried_building_my_ai_second_brain_in_notion_now/)).

Keep the core schema small but preserve provenance and time from the start: stable note IDs, source URL or file path, captured-at and updated-at timestamps, author or origin, and explicit links between notes.

For facts that change, append a correction or superseding assertion with both when it became true and when the system learned it; retain the old value and its evidence so “what is true now?” and “what did I believe then?” remain answerable.

Keep extracted claims separate from raw captures, and keep the rules for how an agent reasons separate from the knowledge it applies; Meta’s September 2 account reports that this split made fixes easier to attribute and reduced context loaded per turn by about 80% in its organizational system ([Meta Engineering](https://engineering.fb.com/2026/09/02/ml-applications/organizational-second-brain-ai-learns-from-experts/)).

Use explicit Markdown links or typed relation records for a small navigable graph, label machine-inferred links as inferred, and preserve the source for every promoted claim so generated connections do not quietly become accepted facts.

Begin retrieval with SQLite FTS5, filters, and direct links, returning a short excerpt with the file path and line or heading; SQLite’s official docs warn that external-content FTS tables can drift from their content table unless triggers or rebuilds keep them synchronized ([SQLite FTS5](https://www.sqlite.org/fts5.html)).

Add semantic search only after a query set shows lexical search misses meaningful paraphrases; QMD is a current local option that fuses BM25 and local vector search with query expansion and reranking, but its local model runtime and multiple stages are extra weight ([QMD repository](https://github.com/tobi/qmd)).

A hybrid ranker should combine lexical, semantic, and graph candidates with reciprocal-rank fusion, then keep a human-readable explanation of why each result matched.

Exclude revoked or superseded claims from current-answer candidates but retain them for historical queries, while an older source still marked valid can be down-ranked without being discarded.

Make every correction improve a replay set: retain representative questions, expected source notes, citation checks, known-unanswerable questions, and previous answers that users corrected.

Track retrieval quality with recall@k or reciprocal rank on a small fixed query set, citation correctness, stale-fact rate, correction acceptance, and abstention on unsupported questions; replay the same questions after changing extraction, indexing, or prompts.

For personal use, make write permissions explicit: agents may draft and link notes, while deletion, merging, or replacing a human assertion should require review or produce a reversible revision.

## Evidence from the requested window

The primary pinned-engine run used deep mode and covered 70 items from Reddit, Hacker News, and GitHub between September 2 and October 2: 29 Reddit items, 38 HN items, and 3 GitHub items, with 23 of 70 dated items in the final seven days.

A separate quick-mode run completed in 22.8 seconds and returned 12 items, 6 Reddit and 6 HN, with 0 GitHub results; the two runs are kept separate and the quick run's raw report is [here](prototype-data/research-tools/output/building-a-second-brain-best-practices-raw-2026-10-02.md).

Its ranked Reddit evidence was narrow: the higher-engagement thread focused on system overhead, and other recent threads raised Obsidian adoption, vault structure, and changing beliefs; these are useful friction signals rather than validated architecture benchmarks.

The engine returned three GitHub items after relevance pruning, but its highest ranked clusters did not establish a fresh, widely adopted personal-knowledge architecture; treat its social-signal output as discovery, not as proof that a stack works.

Meta’s September 2, 2026 engineering article is the clearest first-party design report in the window: it separates curated, frequently used knowledge from sparse reference material retrieved on demand, routes by explicit indexes and thresholds, and separates declarative facts from procedural recipes.

Meta also describes recording expert corrections, tracing them to knowledge or procedure gaps, validating minimal edits against targeted replays and a growing regression set, then requesting human review; that is a useful correction loop even for a personal vault, scaled down to one user and a handful of saved questions.

A September 29 Reddit post argues that a memory should track changes in thinking, while September 21 comments propose explicit limits and uncertainty fields; those ideas fit append-only corrections, but the posts have little engagement and are not independently validated ([belief-history discussion](https://www.reddit.com/r/secondbrain/comments/1wt5uig/a_second_brain_should_track_how_your_thinking/), [knowledge-portfolio discussion](https://www.reddit.com/r/AIAssisted/comments/1wlzuzq/im_building_a_knowledge_portfolio_instead_of_a/)).

## Projects and older references

QMD is the strongest high-traction implementation lead found: GitHub’s public API showed 30,136 stars and 1,883 forks on October 2, 2026, with its latest push on September 9; its repository documents local BM25, vectors, reciprocal-rank fusion, and reranking ([QMD](https://github.com/tobi/qmd), [public repository API](https://api.github.com/repos/tobi/qmd)).

QMD is a search layer, not the canonical store, so keep the notes portable and the index disposable if adopting it.

Smriti is a small, current design reference for a single-file SQLite memory system with provenance and bi-temporal supersession; the public repository API showed 14 stars, 2 forks, and a September 27 push on October 2, which is too little adoption evidence to treat its claims as benchmark results ([Smriti](https://github.com/vn-envy/Smriti), [public repository API](https://api.github.com/repos/vn-envy/Smriti)).

Google’s Open Knowledge Format is a useful vocabulary for Markdown frontmatter, sources, provenance, trust signals, and lifecycle metadata, but its repository’s last push was August 21, outside this research window; borrow its small interoperability conventions rather than adopting a broad schema wholesale ([OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), [repository API](https://api.github.com/repos/GoogleCloudPlatform/open-knowledge-format)).

Two requested discovery repositories are early examples rather than established choices: stancsz/second-brain had 7 stars and a last push on August 13, while h3qing/building-a-second-brain had 1 star and a September 28 push on the API snapshot date ([stancsz](https://github.com/stancsz/second-brain), [h3qing](https://github.com/h3qing/building-a-second-brain)).

Karpathy’s LLM Wiki proposal and OKF were published in April and June 2026 respectively, so their markdown-wiki and cross-linking patterns are foundational context, not evidence from the requested month ([LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)).

The metadata above is a point-in-time GitHub API snapshot from October 2, 2026; star counts indicate attention, not quality, safety, or maintenance health.

## Reproducibility and limits

The actual pinned source was `mvanhorn/last30days-skill` commit `5103ba478b380552207a3754b74c7655d64208cd`, resolved through the anonymous public GitHub commits API; the staged `SKILL.md` SHA-256 is `C2BF3A4745E58DABD18387D2291B48991257BCCACC2E3CEAA273C471250261C2`.

The staged engine script SHA-256 is `99D037286B540D362290ADE2EFAAF7AD024115B3D58D895554AA156D2F2E87CE`, and the pinned runtime remains under `prototype-data/research-tools/last30days-skill-5103ba478b380552207a3754b74c7655d64208cd`.

The inspected preflight ran with `uv run --no-project --offline`, an empty inherited environment except basic Windows process paths, an isolated home, empty skill config, keychain disabled, and browser cookies disabled; it reported no credentials, no active cookie source, no project config, and local output only.

The first-run setup wizard was not invoked because this scope excludes its tool installs and browser or credential setup; the engine ran directly after the sanitized preflight with only public sources selected.

The primary engine command was `uv run --no-project --offline python <staged-script> "building a second brain best practices" --days=30 --as-of=2026-10-02 --search=reddit,hackernews,github --web-backend=none --no-browser-cookies --plan=<second-brain-plan.json> --deep --emit=md --save-dir=<output>`.

For a repeatable sanitized quick-mode invocation, run `pwsh -NoProfile -File prototype-data/research-tools/run-last30days.ps1`; pass `-Deep` to reproduce the primary deep-mode run.

The primary raw engine report is [building-a-second-brain-best-practices-raw.md](prototype-data/research-tools/output/building-a-second-brain-best-practices-raw.md).

I used two post-engine web-search supplement calls containing six targeted query strings and inspected primary Meta, SQLite, QMD, OKF, and Smriti sources; those web results are separate from the engine’s 70 items and were not counted as engine evidence.

The date window is applied by the engine as September 2 through October 2, 2026, and no X, YouTube, TikTok, Instagram, Polymarket, or web backend was selected.

The main limitation is evidence sparsity: the recent human discussion is anecdotal and partially noisy, and the newer small repositories have little public traction or independent evaluation.
