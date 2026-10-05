# Retrieval and graph rendering benchmarks

Tomeowl has isolated benchmark helpers for retrieval versus QMD, repository maps versus Graphify, and the current graph scene versus Three.js and Cytoscape.js.
The product implementation and frozen UI remain unchanged.
These helpers require Bun 1.4.2 for development; their optional dependencies are separate from the compiled application.
Models remain deferred, so this experiment measures retrieval and graph processing rather than embedding, reranker or generator inference.

## Keyword retrieval

From the repository root, choose an output directory that does not exist:

```powershell
bun run bench:retrieval --out data/benchmark-new/retrieval --iterations 3
```

The helper discovers QMD or accepts `--qmd PATH`; its audited profile requires `@tobilu/qmd@2.8.3` in the standard Bun global package layout.
It records actual package hashes and invokes its CLI under Bun without the Windows shell wrapper.
It does not install QMD or modify an existing user index; an unavailable tool produces a partial report and nonzero exit.
Each run freezes raw research text, hashes the suite and implementation, uses isolated state and verifies identical complete source bytes in both catalogs.
Subprocess output and execution are bounded, and original results are retained.

The first recorded corpus contains 17 notes, 165 Tomeowl chunks and 232,817 original text bytes.
Eleven phrase/all cases are comparable, including ten labeled cases and one no-answer question.
Three `match:any` cases are excluded because this QMD parser lacks equivalent OR semantics.
Common metrics deduplicate original source ranks; unlabeled hits remain unjudged.
Tokenization, stemming, title/path weighting and document-versus-chunk ranking still differ.
Candidate limits cover the whole small corpus.
QMD emits full bodies for authenticity checks, while Tomeowl emits cited chunks, so serialization costs and passage budgets differ.
Whole-document anchor inclusion is not scored against bounded passage coverage as an equal outcome.

| Recorded metric | Tomeowl | QMD 2.8.3 |
|---|---:|---:|
| Macro source Recall@5 | 1.000 | 1.000 |
| Macro source reciprocal rank | 0.8083 | 0.7833 |
| Warm complete CLI median | 55.49 ms | 183.10 ms |
| Warm complete CLI p95 | 62.19 ms | 192.26 ms |
| Isolated catalog file | 1,134,592 bytes | 815,104 bytes |
| Invalid returned evidence | 0 | 0 |

The [retrieval report](../data/benchmark-2026-10-04/retrieval-release/report.json) contains 33 warmed process samples per tool for the common cases.
Each starts a fresh process and includes startup, catalog open, search and complete JSON emission; warmed means OS caches are warm.
These are neither persistent query-only nor disk-cold timings.
Both tools returned empty results for the checked no-answer query.
The same frozen corpus passed Tomeowl's context evaluation, retaining 11/14 anchors with no invalid citations or budgets.
QMD created no embedding vectors or model artifacts in its isolated state.
This small manually labeled corpus does not establish general retrieval superiority or semantic and multilingual quality.

## Graphify repository-map track

Graphify uses an optional per-project environment with `graphifyy==0.9.75`, a complete uv lockfile and the existing Python 3.13 interpreter.
Setup accepts wheels only; no global installer, provider credentials, model or service is required.
First setup may need approved network execution inside a sandbox:

```powershell
bun run bench:graphify --out data/benchmark-new/graphify --setup --iterations 3
```

After installation, omit `--setup` for locked offline runs in fresh output directories.
The helper checks the installed environment against the lock, records Python/uv/package versions, copies bounded code sources and runs code-only extraction with clustering disabled.
Graphify query emits text and has no supported JSON query flag; raw output and source references are retained.

The [code-graph report](../data/benchmarks-2026-10-04/graphify-final/report.json) uses the same 36 TypeScript files for both tools.
Tomeowl scanned all 36 modules; Graphify emitted 312 nodes and 1,032 edges and warned that `viewer/build.ts` yielded no symbols.
Tomeowl text ingestion took about 173 ms and Graphify's richer extraction about 4,533 ms.
Four identifier queries with three warm repetitions each took roughly 71-80 ms for Tomeowl and 1,023-1,111 ms for Graphify.
Graphify calls include uv/Python startup and loading a precomputed symbol graph; Tomeowl reparses imports and exports for each module-map call.
Budgets, graph detail and response contracts differ, so no equal-quality retrieval or symbol-edge accuracy winner is claimed.
Graphify's environment occupies 141,302,738 file bytes, excluding Python/uv executables and installer cache.
The [initial setup failure](../data/benchmarks-2026-10-04/graphify/report.json) is retained; a disabled sandbox proxy caused a download timeout before approved direct registry execution completed setup.

## Renderer experiment

Install exact benchmark-only pins and start the helper with a fresh report filename:

```powershell
bun install --cwd scripts/benchmarks/visual --frozen-lockfile --ignore-scripts
bun run bench:visual --port 4320 --out data/benchmark-new/visual.json
```

Open `http://127.0.0.1:4320/?autorun=1` in a foreground browser and keep it visible until the 27 trials finish.
The viewport should contain the entire 960 by 640 CSS-pixel scene; the final recorded viewport is 1,200 by 960.
The page saves bounded results locally after each trial and refuses an existing report at startup.
It compares actual `drawReferenceScene` SVG with Three.js 0.186.1 WebGL and Cytoscape.js 3.34.3 Canvas adapters.
Source IDs, links and deterministic Constellation coordinates are shared, with 25 Hz target updates and three repetitions at 100, 400 and 1,000 requested sources.
Module loading is recorded separately from synchronous mount timing, and renderer order rotates between repetitions.
Glow is off by default; `&glow=true` exercises Tomeowl's illumination in a separate richer-effects profile.

Equal visible counts at 100/400 do not mean equal features.
Tomeowl retains role guides, glyphs, bloom elements and accessibility targets; Three.js uses bare points/lines and Cytoscape retains its own hit targets.
At 1,000 requested nodes, Tomeowl keeps its 400-source cap while the controls render all 1,000; those stress rows must not be ranked together.
Synchronous adapter cost includes internal motion/guides in Tomeowl, queued drawing in Cytoscape and immediate render submission in Three.js.
Two requestAnimationFrame callbacks measure presentation opportunities, not completed paint, GPU time or input-to-screen latency.
Programmatic pan, focus and zoom do not measure pointer hit testing or drag latency, and focus visuals differ.

The [final renderer report](../data/benchmarks-2026-10-04/visual-final.json) completed all 27 trials in foreground Chrome 154 on Windows, with no failures.
At 400 sources and 800 edges, the median across three trial summaries is:

| Renderer | Synchronous mount | Two-RAF opportunity | Adapter mutation/submission per update |
|---|---:|---:|---:|
| Tomeowl SVG | 53.8 ms | 111.8 ms | 4.1 ms |
| Three.js WebGL | 21.6 ms | 24.3 ms | 0.3 ms |
| Cytoscape.js Canvas | 20.5 ms | 127.9 ms | 1.2 ms |

The final run removed an unused external pose computation from the SVG benchmark adapter and corrected the initial clipped viewport.
The [initial trial](../data/benchmarks-2026-10-04/visual-first-clipped-viewport.json) remains archived and is not the reported final result.
The Three.js control has lower measured adapter cost here, but the feature and submission differences prevent treating this as a complete rendering-speed winner.
The benchmark's built adapter chunks are approximately 13 KB for the SVG scene, 540 KB for Three.js and 454 KB for Cytoscape, with a separate 15 KB harness entry.
These exclude CSS and are benchmark transfer artifacts, rather than standalone deployment or runtime-memory footprints.

## Memory and decisions

`performance.memory` is recorded when available, with an explicit reason otherwise.
It is approximate page-wide JavaScript heap, including loaded libraries, fixtures, reports and garbage awaiting collection.
It excludes native DOM and GPU allocations and process RSS, so negative collection deltas cannot rank renderer memory.
The installed Windows Bun runner supplies no validated child-process resource-usage measurements; CLI peak RSS remains explicitly unmeasured.
Catalog, environment, bundle and typed-array sizes are storage or allocation figures rather than total runtime memory.

Keep the frozen SVG UI until a representative product workload demonstrates unacceptable interaction delay.
A renderer migration needs equivalent labels, focus, hit testing, glow and 3D behavior, plus isolated process-memory measurements.
Vector/hybrid/reranker inference and Graphify semantic document extraction remain a later benchmark with exact model contracts and independent paraphrase labels.
Sigma.js is another candidate in the [upstream research](research/benchmark-alternatives-2026-10-04.md), but it was not installed or measured in this run.
