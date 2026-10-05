# Ingestion and Semiconductor Retrieval Research

Research snapshot: 2026-10-01.

## Recommendation

Build one ingestion boundary that emits stable, source-linked records, then let the existing search and graph tools consume those records through adapters.
Keep plain Markdown, text, JSON, and known source files on a small deterministic path first; call heavier PDF layout/OCR and domain parsers only for formats that actually need them.
For the first end-to-end sample, use a local, access-controlled slice of `D:\Dev\tp-agentkit` because its `.tp` tree and packaged work material are closest to semiconductor test engineering.
The observed local corpus has Markdown and source/config files but no PDF, native EDA project, or explicit loadboard netlist fixture, so create clearly synthetic examples for those later and keep them separate from real project material.

## Parser choices and boundaries

| Need | Candidate | What it provides | Tradeoff for Tomeowl |
|---|---|---|---|
| Quick PDF text and geometry | PDFium | C API for page text, Unicode extraction, and rectangles around text ranges; project source is Apache-2.0 licensed. | A compact native PDF primitive, but it does not itself provide OCR, semantic table parsing, or electrical meaning; those are separate layers. |
| PDF command-line inspection | Poppler utilities | Maintained PDF rendering library with command-line utilities in its project ecosystem. | Useful as an optional diagnostic or batch adapter; it is another native runtime to package and should be compared on actual manuals before adoption. |
| Searchable/OCR PDF text | Tesseract | Local OCR executable/library with text, TSV and hOCR outputs; hOCR includes word coordinates. | Useful for scanned pages after page-level quality checks; OCR output is evidence with uncertainty, not authoritative source text. |
| PDF blocks, text positions, and OCR | PyMuPDF | Text blocks and words carry position data; it can OCR pages through Tesseract and reuse OCR text pages. | The upstream offers AGPL and commercial licensing routes; resolve that distribution choice before bundling it in a closed product. OCR is documented as far slower than ordinary extraction, so cache it and run once per page. |
| Layout, reading order, tables, office files, OCR | Docling | Unified document tree for text, tables, pictures, hierarchy, bounding boxes, and provenance; supports PDF, office formats, Markdown, images, and more. | Strong optional high-fidelity adapter, but PDF pipelines need model artifacts; those can be pre-fetched for offline use. Its own docs warn that low-quality OCR inside pictures can pollute chunks, so preserve OCR separately and include it selectively. |
| Test-program syntax | Tree-sitter | Incremental concrete syntax trees, tolerant of syntax errors, with a pure C11 runtime that can be embedded. | Good for source locations and syntax-aware extraction when the actual test-program dialect has a suitable grammar; syntax trees do not supply ATE domain semantics by themselves. |
| Schematic connectivity | Native CAD netlist export, when available | CAD-native netlists provide explicit component/pin-to-net connectivity; KiCad documents a schematic netlist export as one example. | Determine the actual loadboard authoring/export format before selecting an adapter. OCR and PDF geometry alone cannot prove connectivity. |

Sources: [Docling document model](https://docling-project.github.io/docling/concepts/docling_document/), [Docling supported formats](https://docling-project.github.io/docling/usage/supported_formats/), [Docling OCR and chunking caveat](https://docling-project.github.io/docling/_generated/examples/advanced_chunking_and_serialization/), [Docling offline model artifacts](https://docling-project.github.io/docling/reference/pipeline_options/), [Docling project license](https://github.com/docling-project/docling/blob/main/LICENSE), [PyMuPDF text extraction](https://pymupdf.readthedocs.io/en/latest/recipes-text.html), [PyMuPDF OCR](https://pymupdf.readthedocs.io/en/latest/recipes-ocr.html), [PyMuPDF licensing](https://pymupdf.io/licensing), [PDFium text API](https://pdfium.googlesource.com/pdfium/+/3522876/fpdfsdk/include/fpdftext.h), [PDFium license](https://pdfium.googlesource.com/pdfium/+/main/LICENSE), [Poppler release notes](https://poppler.freedesktop.org/releases.html), [Tesseract manual](https://tesseract-ocr.github.io/tessdoc/), [Tree-sitter introduction](https://tree-sitter.github.io/tree-sitter/), [KiCad schematic editor manual](https://docs.kicad.org/9.0/en/eeschema/eeschema.pdf).

The PDFium, PyMuPDF, and Docling documents describe different levels of the pipeline: PDFium/PyMuPDF expose positioned text primitives, while Docling adds layout and document-structure inference.
Treat the richer structure as parser output with provenance and confidence; do not discard the original text spans or page geometry.
Docling can run offline after its required PDF-model artifacts are present, but a default first use can fetch artifacts, so the installer/runtime must not quietly introduce that network side effect.
Tree-sitter should initially parse only languages actually present in the corpus; a proprietary ATE DSL needs a tested grammar or a small explicit parser, and generic AST extraction must not be presented as verified pin/limit semantics.

## Ingestion record and relation model

Every extracted text block, table cell, code symbol, or schematic connection should retain a link to the original file and a stable location.
Store at least: project/root scope, normalized relative path, raw-file SHA-256, detected format, source revision/effective date when known, parser name/version/configuration, ingestion timestamp, source page or line/byte range, bounding box where available, original text/value/unit, and extraction method/confidence.
Keep source identity distinct from a content hash so two revisions with identical bytes can still retain their document identity, while changed bytes create a new immutable revision record.

Use a small typed graph over those records: `defines`, `calls`, `uses_pin`, `assigns_channel`, `limit_for`, `documents_parameter`, `connects_net`, `maps_product_pin`, and `supersedes`.
Mark each edge as `explicit` (present in a source or native netlist), `parsed` (produced by a deterministic grammar/rule), or `inferred` (hypothesis requiring review), and store the source span and parser rule for every edge.
Keep datasheet/manual revisions separate; retrieval must filter by the requested product and revision before combining values.
For every electrical quantity, retain the literal and unit, canonical value and unit if conversion is exact, dimension, test conditions, temperature, min/typ/max or limit boundary, and conversion rule/version; never compare values with incompatible dimensions or missing conditions as though they were directly equivalent.
For schematics, accept a CAD-exported netlist or human-validated connection as connectivity evidence; OCR'd labels, line crossings, and spatial proximity remain hypotheses until confirmed.

Suggested source-to-graph path:

```text
original file -> fingerprint/revision -> format adapter -> located elements -> typed claims/edges -> local search + graph views
```

Retain original files in place by default and store extracted sidecars/index records locally; make copying, OCR model downloads, and remote model calls explicit per project.
The raw file remains the citation target, while normalized text and graph records are rebuildable caches.

## Local corpus manifest

Inventory was read-only and bounded to regular files below the three named project roots, excluding `.git`, dependency, and build directories; archives were counted from ZIP central-directory metadata without extracting or opening their contents.

| Candidate | Observed files and types | Fit |
|---|---|---|
| `D:\Dev\tester-toolkit-t2k` | 20 files: 6 `.md`, 3 `.mp4`, 3 `.py`, 2 `.bat`, 1 `.html`, 1 `.pptx`, 1 `.toml`, 3 `.gitignore`. | Useful later for tool behavior and operator documentation, but no visible manual/datasheet/schematic corpus. |
| `D:\Dev\tp-agentkit` | 28 files: 23 `.md`, 2 `.json`, 2 `.zip`, 1 `.gitignore`; `.tp` includes knowledge, work notes, and skills for test-program mapping and product documents. `product-docs-baseline-20260821.zip` contains 3 `.md` entries (6,345 uncompressed bytes); `rework-baseline-20260821.zip` contains 153 entries: 71 `.py`, 70 `.md`, 3 `.mdc`, 3 `.txt`, 2 `.bat`, 2 `.gitignore`, and 2 `.json` (1,258,247 uncompressed bytes). | Best first local corpus for retrieval behavior and test-program-to-document workflows; archives show no PDF or EDA/native schematic formats. |
| `D:\Dev\WSGen` | 20 files: 5 `.svg`, 3 `.css`, 2 `.json`, 2 `.md`, 2 `.mjs`, 2 `.tsx`, 1 `.ts`, 1 `.yaml`, 1 `.ico`, and 1 `.gitignore`. | UI/code sample, not a semiconductor evidence corpus. |

The inventory reports file names, extensions, and archive metadata only; no source or document contents were copied into this research note or sent to web services.
The user authorized selection of a suitable local project; use a bounded, locally inspected subset of `tp-agentkit` within that scope, excluding secrets and keeping private content off external services.
Keep derived fixtures in Tomeowl's own test-data folder, with synthetic content visibly marked as synthetic.

## Staged fixtures and evaluation

1. **Stage A - local Markdown corpus:** index a small selected set from `.tp/knowledge`, relevant `map-test-program` reference material, and the product-documentation checkpoint; test exact phrase, heading, and revision queries with path/heading citations, and verify that missing manuals or schematics are reported as absent.
2. **Stage B - synthetic selectable-text PDF and source file:** create a clearly synthetic ATE manual page with one timing table and a test-program source fixture with test declarations, calls, pin assignments, and limits; test that table rows and code symbols retain page/line locations and connect only through explicit matching identifiers.
3. **Stage C - revision and unit traps:** add a second synthetic datasheet revision with a changed parameter, distinct `min/typ/max`, units, and a condition/footnote; ask for the value for each exact revision, compare a program limit only when units and conditions match, and include one intentionally unsupported conversion that must stay unresolved.
4. **Stage D - OCR and schematic:** pair a selectable PDF page with its rasterized scan and known ground truth; compare text/table cells and bounding boxes. Add a synthetic vector schematic plus an explicit netlist fixture, then test pin-to-net mapping. OCR-only connectivity must return “unverified,” not a claimed mapping.

Evaluation should check exact citation hit rate (file, revision, page/line and highlighted region), table-cell correctness, pin/net mapping precision, unit/revision isolation, abstention on unsupported facts, and latency/context size for the same query set.
Include a visualization that opens the cited page region beside the graph path from product pin to loadboard net to test-program symbol; every graph edge should be clickable back to its evidence.

Suggested synthetic query set:

- “For synthetic product `P-01`, revision `B`, what is the `VIL` maximum and what test condition applies? Show the page and table row.”
- “Which test-program symbol assigns `DUT_CLK` to the tester channel, and what is its exact source line?”
- “Does the declared test limit match the datasheet requirement after unit conversion? Show both source spans and state any condition mismatch.”
- “Which loadboard component path connects connector `J1.3` to the device clock pin in the supplied netlist, and where is that netlist cited?”
- “Can the raster schematic alone prove that `J1.3` reaches the device pin? If not, identify the missing evidence.”
- “What changed between synthetic revisions `A` and `B`; which current test symbols or limits are affected?”

The fixture values and names above are placeholders for generated test material, not claims about any actual part, program, or loadboard.

## Decision gate

Before implementation, settle the actual supported ATE test-program dialect and loadboard schematic/export formats using representative, non-sensitive files.
Then build only the Markdown/text provenance path and one source parser first; add PDFium/PyMuPDF or Docling only after a real PDF fixture reveals whether plain positioned text is enough or the workflow needs table/layout/OCR recovery.
Start with the existing `qmd` and `graphify` interfaces as retrieval/graph adapters so the new ingestion layer adds semiconductor-aware provenance and relationships without duplicating their generic indexing work.
