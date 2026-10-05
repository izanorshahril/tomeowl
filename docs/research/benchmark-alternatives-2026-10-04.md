# Benchmark alternatives for Tomeowl

Checked on 2026-10-04 using upstream releases, manifests, command source and browser documentation.
This note defines comparable experiments rather than reporting executed benchmarks.
No external tool or model was installed or executed for this research, and no local corpus was transmitted.
The user has deferred the model decision, so the first comparison should remain model-free.

## Separate the workloads

| Track | Tomeowl operation | Alternative | Comparable outcome |
|---|---|---|---|
| Document retrieval | Native FTS5 search over indexed research text. | QMD keyword `search`. | Relevant source ranking, quoted evidence coverage, latency, process memory and index size. |
| Bounded context | Native `context` packet. | QMD results plus an explicitly described, shared excerpt assembler. | Evidence retained under the same final byte and quote budgets. |
| Repository map | Native JS/TS module map and structural relations. | Graphify local AST extraction and graph query. | Supported files, modules/symbols/edges represented, source references, build and query cost. |
| Rendering | Existing SVG graph. | Cytoscape.js, Sigma.js and Three.js benchmark adapters. | First ready frame, interaction latency, frame intervals, available memory metrics and artifact size. |
| Later semantic retrieval | Optional future embedding route. | QMD vector/hybrid/full routes and model-backed Graphify document extraction. | Deferred until exact model contracts and a common labeled corpus exist. |

Graphify describes code extraction as local AST parsing, while documents and media use a semantic backend, and it explicitly distinguishes its graph from a vector index. [Official Graphify overview](https://github.com/Graphify-Labs/graphify).
Therefore a Graphify code-only query result cannot serve as a direct document-retrieval or embedding-inference score.
Model inference, retrieval and generated-answer quality should have separate columns, rather than assigning an inference time to a tool that has no model in that run.

## Verified tool pins and commands

### QMD

The current official release is `@tobilu/qmd@2.8.3`; the release page marks it latest and the tagged manifest requires Node >=22, includes `node-llama-cpp@3.20.0`, and declares native SQLite dependencies. [Release](https://github.com/tobi/qmd/releases/tag/v2.8.3), [tagged manifest](https://github.com/tobi/qmd/blob/v2.8.3/package.json).
The exact top-level pin does not fix ranged transitive dependencies, so preserve the isolated installation's lockfile and runtime identity.
Review native lifecycle scripts before enabling any needed one; an installation failure is an installation result, rather than a zero-latency retrieval result.

For a staged Markdown corpus, the verified command shape is:

```powershell
qmd collection add D:/Dev/tomeowl/data/benchmark/corpus/research --name bench --mask "**/*.md"
qmd search "literal test query" -c bench --json -n 10
```

Use the installed tool's help to confirm the pinned package and run with task-local config/cache paths.
QMD supports `QMD_CONFIG_DIR`, `XDG_CONFIG_HOME` and `XDG_CACHE_HOME`; `qmd init` also creates a project-local index. [QMD configuration and storage](https://github.com/tobi/qmd#configuring-indexyml).
Do not index the evolving repository directly or carry across configured collection update commands.

At the release tag, `search()` calls `searchFTS()` directly, and `--json` emits an array with the document file/URI, title, line, rounded score and optional docid/context/snippet or full body.
The default JSON snippet extraction target is 300 characters; document ranks and snippets are different units from Tomeowl's ranked chunks. [Tagged search and output implementation](https://github.com/tobi/qmd/blob/v2.8.3/src/cli/qmd.ts#L2263).
Compare unique-source ranks using a declared deduplication policy, and report native chunk ranks separately.
Treat each engine's score as its own ranking signal; do not compare numerical scores directly.

QMD's `embed`, `vsearch` and hybrid `query` use local model routes, and its documented default models download on first use. [Model requirements](https://github.com/tobi/qmd#gguf-models-via-node-llama-cpp).
Avoid those commands, `pull`, and the default all-backend `bench` in the model-free run.
The package launcher selects Node or Bun using installation lockfiles because native addon ABI mismatches matter. [Tagged launcher](https://github.com/tobi/qmd/blob/v2.8.3/bin/qmd).
Record the actual child runtime rather than assuming that a Bun-installed command ran entirely inside Bun.

### Graphify

The official package is `graphifyy==0.9.75`, released 2026-10-04 for Python >=3.10.
The wheel SHA-256 is `7067b7e19aa9b0758ba1103734e72349d9b4a00a9db1f6174f6b9f16f498a72c`, and the publisher attestation identifies commit `48d7c0e832cd2d67d86850e716ddea16df6238ea`. [Exact PyPI release and provenance](https://pypi.org/project/graphifyy/0.9.75/).
The active upstream branch is `v8`; `main` contains an older 0.1.14 manifest and should not establish the current benchmark contract.
Base dependencies include NetworkX, NumPy, RapidFuzz and many Tree-sitter language bindings, without requiring model-provider or MCP extras. [Release manifest](https://github.com/Graphify-Labs/graphify/blob/48d7c0e832cd2d67d86850e716ddea16df6238ea/pyproject.toml).
Use an isolated project environment and preserve its resolved lock; the graphify wheel being platform-neutral does not establish that every transitive language binding has a matching Windows wheel.

The source-verified bounded command shapes are:

```powershell
graphify extract D:/Dev/tomeowl/data/benchmark/corpus/code --code-only --no-cluster --max-workers 1 --out D:/Dev/tomeowl/data/benchmark/graphify
graphify query "module relationship question" --graph D:/Dev/tomeowl/data/benchmark/graphify/graphify-out/graph.json --budget 2000
```

The extraction flags skip the document/media semantic pass and clustering; the raw output contains `nodes`, `edges` and `hyperedges`. [Release extraction implementation](https://github.com/Graphify-Labs/graphify/blob/48d7c0e832cd2d67d86850e716ddea16df6238ea/graphify/cli.py#L3248).
There is no need to add `--no-viz` to this raw-output route, because it returns before the visualization stage.
Avoid `install`, hooks, global registration, provider configuration, `label` and `--dedup-llm`.
Bare `cluster-only` may label communities through a backend, so any separate clustering trial must use `--no-label` explicitly. [Command reference](https://github.com/Graphify-Labs/graphify/blob/48d7c0e832cd2d67d86850e716ddea16df6238ea/graphify/__main__.py#L570).

At this release, `query` prints graph text and has no JSON output flag; unknown `--json` is skipped.
It loads the graph, accepts `edges` as an alias for `links`, runs undirected BFS with depth 2, and touches a query stamp beside the graph. [Release query dispatch](https://github.com/Graphify-Labs/graphify/blob/48d7c0e832cd2d67d86850e716ddea16df6238ea/graphify/cli.py#L1207).
Preserve raw text and graph JSON; do not claim that text source references are equivalent to Tomeowl's literal quoted citation packet.
If a harness calls `_query_graph_text()` directly for repeated in-process timing, label it as a private Python API adapter, separate from full CLI timing. [Release query implementation](https://github.com/Graphify-Labs/graphify/blob/48d7c0e832cd2d67d86850e716ddea16df6238ea/graphify/serve.py#L1280).
Use a credential-free child environment, task-local home/cache, `GRAPHIFY_NO_AUTO_REFRESH=1` and disabled query logging, with network denied during corpus execution.
These containment choices are benchmark policy, not proof that a particular run made no network requests.

## Renderer alternatives

| Adapter | Fixed candidate | Initial scope | Distribution evidence |
|---|---|---|---|
| Tomeowl SVG | Current implementation hashes. | Actual frozen viewer plus a shared primitive scene. | Existing [graph](../../src/viewer/graph.ts), [reference scene](../../src/viewer/reference-scene.ts) and [projection](../../src/viewer/projection.ts). |
| Cytoscape.js | `cytoscape@3.34.3`. | 2D renderer with `preset` coordinates, no force layout. | [Release](https://github.com/cytoscape/cytoscape.js/releases/tag/v3.34.3), [manifest browser bundles](https://github.com/cytoscape/cytoscape.js/blob/v3.34.3/package.json). |
| Sigma.js | `sigma@3.0.3` plus `graphology@0.26.0`. | 2D WebGL graph rendering using shared coordinates. | [Sigma release](https://github.com/jacomyal/sigma.js/releases/tag/sigma%403.0.3), [Graphology release](https://github.com/graphology/graphology/releases/tag/0.26.0), [official integration](https://www.sigmajs.org/docs/). |
| Three.js | `three@0.186.1`. | WebGL primitive rendering, then a separately reported 3D scene. | [Exact registry metadata](https://registry.npmjs.org/three/0.186.1), [renderer API](https://threejs.org/docs/pages/WebGLRenderer.html). |

Sigma 4.0.0-beta.6 is available, but the stable 3.0.3 line is the primary baseline; a prerelease needs a separately named experiment. [Sigma release list](https://github.com/jacomyal/sigma.js/releases).
Cytoscape's `preset` layout uses supplied positions, avoiding a layout-algorithm confound. [Preset documentation](https://js.cytoscape.org/#layouts/preset).
Bundle pinned dependencies into local benchmark assets rather than using a CDN during measured runs.
Do not replace the product renderer just to perform this comparison.

## Proposed bounded protocol

Freeze a manifest of exact corpus bytes and SHA-256 hashes before adding this research note, because the existing retrieval helper scans all of `docs/research`.
Reuse the [manual retrieval suite](../../tests/fixtures/retrieval-eval/research-cases.json), but retain its partial-label policy: unlabeled hits are unjudged, so precision or NDCG needs expanded relevance judgments.
The existing [evaluation guide](../RETRIEVAL-EVALUATION.md) measures in-memory post-ingestion timing; those measurements must not be relabeled as disk-cold CLI startup.

For retrieval, record index build time, emitted/indexed bytes, disk growth, explicit failures, complete CLI latency and the highest observed process memory sample.
Use identical corpus snapshots, query strings, output limits and final context budgets.
Report first process invocation, repeated fresh processes with an OS-warm index, and optional persistent-process internal timing as separate profiles.
A reasonable first bounded run is one build, five repeats per query and a 60-second child timeout, with total output caps and a recorded timeout policy.
Small-sample p95 is descriptive; do not claim a stable production tail from five repetitions.
Windows sampled working set and peak working set are different metrics, and an unobserved short-lived child must be unavailable rather than zero.

For repository graphs, stage only the same supported code files, inspect skipped/extraction-failed counts, and use manually labeled modules/imports or paths that both tools can represent.
Graphify's richer symbol/call graph can be assessed separately, without marking Tomeowl incorrect for an unsupported symbol-level contract.
Report reference authenticity and relation support independently from node/edge count, because a larger graph is not automatically a better graph.

For rendering, begin at 100, 400 and 1,000 nodes with a fixed edge count, seed, coordinates, viewport, device-pixel ratio, browser build and renderer configuration.
Record requested and actually rendered counts; an existing production cap must not be bypassed silently or compared against a full alternative scene.
Use one shared primitive profile with equal circles, lines, labels, camera path and focus opacity, then a distinct product profile with Tomeowl's glow, guides and interaction chrome.
Measure asset parse/startup, first ready frame, node selection to next displayed update, pan/zoom, animation frame intervals and disposal/recreation behavior.
Keep static motion-zero and full-motion runs separate, and repeat with effects off/on rather than giving only one renderer expensive effects.
Record renderer-ready callbacks and frame intervals as such; `requestAnimationFrame` intervals alone do not measure GPU execution or complete input-to-presentation latency.

`performance.memory` is a deprecated Chromium-specific JavaScript-heap estimate and can omit other allocations, so label it JS heap rather than total renderer RAM. [Browser memory documentation](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory).
`measureUserAgentSpecificMemory()` is experimental, requires a secure isolated context and yields browser-version-dependent estimates; unavailable measurements remain null. [Memory measurement requirements](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory).
Browser process, page heap, DOM objects and GPU resource counts belong in distinct fields.
Three.js renderer resource counts are useful disposal diagnostics, not GPU byte measurements. [Renderer information API](https://threejs.org/docs/pages/WebGLRenderer.html#info).

Choose a renderer only after it improves a measured constraint while preserving the frozen interaction behavior, readable labels, relationship focus, offline export and accessibility.
No numerical winner, latency, memory saving or model-quality claim is established by this note.
