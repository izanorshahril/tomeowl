# Workspace and literature projection (checked 2026-10-03)

Retain SQLite as the revisioned local catalog and derive the two visual corpora from one bounded sample build.
The current store already indexes chunks, full-text search, and relationship evidence; SQLite's [FTS5 documentation](https://sqlite.org/fts5.html) describes document-term retrieval and ranking, so a separate search service is unnecessary for this demonstration.

Use recorded inline Markdown destinations as source relationships, with their original line and chunk revision.
[CommonMark's link specification](https://spec.commonmark.org/0.31.2/#links) distinguishes link destinations, optional titles, and reference links.
The lightweight local parser handles inline destinations, angle-wrapped destinations, percent-encoded paths, and optional quoted titles; it does not claim complete CommonMark parsing.
The sample's external citation extractor also records autolinks and reference definitions, and skips fenced examples.

A generated project inventory is a document that records directory membership.
Its `contains` edges state membership only; they do not assert dependency or functional relationships.
Project, guidance, skill, app manifest, document, research, and citation labels are view metadata, rather than new source kinds or a store migration.

An external URL gets an explicitly labeled citation record containing the URL and mention count.
The cited publication is not fetched, ingested, or verified.
Two local research documents connect through the same recorded URL; that connection is shared citation evidence, not semantic similarity.

The inventory includes each eligible direct project directory under the requested workspace even when no readable documents are selected.
It reads only bounded Markdown and whitelisted manifests, skips hidden directories, secret-like names, symlinks, dependencies, generated outputs, and sample data, and records omissions in `workspace.scan.json`.
Its depth, entry, document, citation, per-file byte, and total-byte limits make it a representative sample, not a complete literature review or complete machine catalog.
