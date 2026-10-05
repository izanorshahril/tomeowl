import { closeSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { contextPacket, type ContextPacket } from "../src/context-query";
import { hash, TomeowlError, type Evidence, type SearchResult } from "../src/domain";
import { evidencePredicate } from "../src/evidence-query";
import { ingest } from "../src/ingest";
import { openStore, searchStore } from "../src/store";

export type EvaluationCase = {
  id: string; query: string; match: "any" | "all" | "phrase";
  expected: Array<{ path: string; quote: string }>; kind: string; notes: string;
};
export const profile = {
  searchLimit: 10,
  context: { limit: 20, maxSources: 8, maxChunks: 12, maxChars: 1600, maxBytes: 12000, depth: 1 },
} as const;
const projectRoot = resolve(import.meta.dir, "..");
const localPath = (root: string, path: string) => relative(root, path).split(sep).join("/");

function readSuite(path: string) {
  if (!statSync(path).isFile()) throw new TomeowlError("Evaluation suite must be a regular file", "INVALID_EVALUATION");
  const descriptor = openSync(path, "r"), buffer = Buffer.alloc(1024 * 1024 + 1);
  try {
    let length = 0, count: number;
    while (length < buffer.length && (count = readSync(descriptor, buffer, length, buffer.length - length, null))) length += count;
    if (length > 1024 * 1024) throw new TomeowlError("Evaluation suite exceeds 1 MiB", "INVALID_EVALUATION");
    return buffer.subarray(0, length).toString("utf8");
  } finally { closeSync(descriptor); }
}

/** Partial, manually selected relevance labels; unlisted results are unjudged. */
export function parseCases(value: unknown): EvaluationCase[] {
  const fail = () => { throw new TomeowlError("Invalid evaluation cases: expected 1..64 unique cases with literal queries and research evidence anchors", "INVALID_EVALUATION"); };
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return fail();
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const { id, query, match, expected, kind, notes } = item;
    const terms = typeof query === "string" ? query.match(/[\p{L}\p{N}_]+/gu) : null;
    if (typeof id !== "string" || !/^[a-z0-9-]{1,100}$/.test(id) || ids.has(id)
      || typeof query !== "string" || query.length > 2000 || !terms?.length || terms.length > 64
      || !["any", "all", "phrase"].includes(match) || typeof kind !== "string" || !kind.length || kind.length > 100
      || typeof notes !== "string" || notes.length > 4000 || !Array.isArray(expected) || expected.length > 16) return fail();
    ids.add(id);
    const anchors = new Set<string>();
    for (const anchor of expected) {
      if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)
        || typeof anchor.path !== "string" || !/^docs\/research\/[a-zA-Z0-9_./-]+\.(?:md|txt)$/.test(anchor.path)
        || anchor.path.split("/").some((part: string) => !part || part === "." || part === "..")
        || anchor.path.length > 1000 || typeof anchor.quote !== "string" || !anchor.quote.length || anchor.quote.length > 1600) return fail();
      const key = JSON.stringify([anchor.path, anchor.quote]);
      if (anchors.has(key)) return fail();
      anchors.add(key);
    }
  }
  return value as EvaluationCase[];
}

export function citationIsAuthentic(db: Database, citation: Evidence & { excerpt?: SearchResult["excerpt"] }): boolean {
  // A one-row CTE binds evidence once even though the shared guard reads it many times.
  const row = db.query(`WITH supplied(evidence) AS (VALUES (?)) SELECT c.body,s.path FROM supplied,chunks c
    JOIN sources s ON s.id=c.source_id AND s.revision=c.revision
    WHERE c.id=? AND c.source_id=? AND c.revision=? AND ${evidencePredicate("c", "supplied.evidence")}`)
    .get(JSON.stringify(citation), citation.chunkId, citation.sourceId, citation.revision) as { body: string; path: string } | null;
  if (!row) return false;
  if ("path" in citation && citation.path !== row.path) return false;
  const span = citation.excerpt;
  return !span || (Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0
    && span.end >= span.start && span.end <= row.body.length && row.body.slice(span.start, span.end) === citation.quote);
}

/** Search ranks count chunks, including repeat sources. Anchor coverage requires the entire exact quote. */
export function scoreCase(db: Database, root: string, item: EvaluationCase, hits: SearchResult[], packet: ContextPacket, requestedLimits = packet.limits) {
  const sourcePaths = new Set(item.expected.map(anchor => anchor.path));
  const ranked = hits.map(hit => ({ path: localPath(root, hit.path), chunkId: hit.chunkId, score: hit.score }));
  const anchors = item.expected.map(anchor => {
    const sourceRank = hits.findIndex(hit => localPath(root, hit.path) === anchor.path) + 1;
    const anchorRank = hits.findIndex(hit => localPath(root, hit.path) === anchor.path && hit.quote.includes(anchor.quote)) + 1;
    const passages = packet.passages.filter(hit => localPath(root, hit.path) === anchor.path);
    const covered = passages.some(hit => hit.quote.includes(anchor.quote));
    const supportingChunks = db.query(`SELECT c.id FROM chunks c JOIN sources s ON s.id=c.source_id AND s.revision=c.revision
      WHERE s.path=? AND instr(c.body,?)>0`).all(resolve(root, anchor.path), anchor.quote) as Array<{ id: string }>;
    const reason = covered ? null : !supportingChunks.length ? "anchor-crosses-chunks"
      : !hits.length ? "no-search-hit" : !sourceRank ? "search-source-missed" : !anchorRank ? "search-support-chunk-missed"
      : !passages.length ? "context-source-missed" : passages.some(hit => supportingChunks.some(chunk => chunk.id === hit.chunkId))
        ? "context-support-clipped" : "context-support-chunk-missed";
    return { path: anchor.path, sourceRank: sourceRank || null, anchorRank: anchorRank || null, contextCovered: covered,
      supportingChunkCount: supportingChunks.length, miss: reason };
  });
  const sourceRecall = (k: number) => sourcePaths.size ? [...sourcePaths].filter(path => ranked.slice(0, k).some(hit => hit.path === path)).length / sourcePaths.size : null;
  const anchorRecall = (k: number) => anchors.length ? anchors.filter(anchor => anchor.anchorRank !== null && anchor.anchorRank <= k).length / anchors.length : null;
  const firstSource = ranked.findIndex(hit => sourcePaths.has(hit.path)) + 1;
  const firstAnchor = anchors.map(anchor => anchor.anchorRank).filter((rank): rank is number => rank !== null).sort((a, b) => a - b)[0];
  const citations = [...hits, ...packet.passages, ...packet.relations.flatMap(relation => relation.evidence)];
  const invalidCitations = citations.filter(citation => !citationIsAuthentic(db, citation)).map(citation => citation.chunkId);
  const bytes = Buffer.byteLength(JSON.stringify({ ok: true, ...packet }) + "\n", "utf8");
  const characters = packet.passages.reduce((count, passage) => count + passage.quote.length, 0)
    + packet.relations.reduce((count, relation) => count + relation.evidence.reduce((sum, citation) => sum + citation.quote.length, 0), 0);
  const sourceIds = new Set(packet.sources.map(source => source.id));
  const requiredSources = [...packet.passages.map(passage => passage.sourceId),
    ...packet.relations.flatMap(relation => [relation.source, relation.target, ...relation.evidence.map(citation => citation.sourceId)])];
  const invalidSources = [...new Set([...requiredSources.filter(id => !sourceIds.has(id)), ...packet.sources.filter(source => {
    const current = db.query("SELECT path,revision FROM sources WHERE id=?").get(source.id) as { path: string; revision: string } | null;
    return !current || current.path !== source.path || current.revision !== source.revision;
  }).map(source => source.id)])];
  const chunkIds = new Set([...packet.passages, ...packet.relations.flatMap(relation => relation.evidence)].map(citation => citation.chunkId));
  const limitsMatch = (Object.keys(requestedLimits) as Array<keyof typeof requestedLimits>).every(key => packet.limits[key] === requestedLimits[key]);
  const budgetValid = bytes === packet.used.bytes && bytes <= packet.limits.bytes && characters === packet.used.characters
    && characters <= packet.limits.characters && packet.used.sources === sourceIds.size && sourceIds.size <= packet.limits.sources
    && packet.used.chunks === chunkIds.size && chunkIds.size <= packet.limits.chunks && packet.used.passages === packet.passages.length
    && sourceIds.size === packet.sources.length && limitsMatch;
  return {
    id: item.id, query: item.query, match: item.match, kind: item.kind, notes: item.notes,
    labeledSources: sourcePaths.size, labeledAnchors: anchors.length,
    sourceRecallAt5: sourceRecall(5), sourceRecallAt10: sourceRecall(10), anchorRecallAt5: anchorRecall(5), anchorRecallAt10: anchorRecall(10),
    sourceReciprocalRank: sourcePaths.size ? (firstSource ? 1 / firstSource : 0) : null,
    anchorReciprocalRank: anchors.length ? (firstAnchor ? 1 / firstAnchor : 0) : null,
    contextAnchorCoverage: anchors.length ? anchors.filter(anchor => anchor.contextCovered).length / anchors.length : null,
    unjudgedSearchHits: ranked.filter(hit => !sourcePaths.has(hit.path)).length,
    emptySearch: !hits.length, emptyContext: !packet.passages.length, ranked, anchors,
    integrity: { checkedCitations: citations.length, invalidCitations, invalidSources, budgetValid },
    context: { used: packet.used, omissions: packet.omissions },
  };
}

export function summarize(rows: ReturnType<typeof scoreCase>[]) {
  const mean = (key: "sourceRecallAt5" | "sourceRecallAt10" | "anchorRecallAt5" | "anchorRecallAt10" | "sourceReciprocalRank" | "anchorReciprocalRank" | "contextAnchorCoverage") => {
    const values = rows.map(row => row[key]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  return {
    cases: rows.length, labeledCases: rows.filter(row => row.labeledAnchors).length,
    labeledAnchors: rows.reduce((sum, row) => sum + row.labeledAnchors, 0),
    contextCoveredAnchors: rows.reduce((sum, row) => sum + row.anchors.filter(anchor => anchor.contextCovered).length, 0),
    macro: { sourceRecallAt5: mean("sourceRecallAt5"), sourceRecallAt10: mean("sourceRecallAt10"), anchorRecallAt5: mean("anchorRecallAt5"),
      anchorRecallAt10: mean("anchorRecallAt10"), sourceReciprocalRank: mean("sourceReciprocalRank"), anchorReciprocalRank: mean("anchorReciprocalRank"),
      contextAnchorCoverage: mean("contextAnchorCoverage") },
    checkedCitations: rows.reduce((sum, row) => sum + row.integrity.checkedCitations, 0),
    invalidCitations: rows.reduce((sum, row) => sum + row.integrity.invalidCitations.length, 0),
    invalidSources: rows.reduce((sum, row) => sum + row.integrity.invalidSources.length, 0),
    invalidBudgets: rows.filter(row => !row.integrity.budgetValid).length,
    noLabelCases: rows.filter(row => !row.labeledAnchors).map(row => ({ id: row.id, emptySearch: row.emptySearch, emptyContext: row.emptyContext })),
  };
}

function timing(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
}

export function evaluate(root: string, suitePath: string, iterations = 3) {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) throw new TomeowlError("iterations must be 1..10", "INVALID_LIMIT");
  const suite = readSuite(suitePath), cases = parseCases(JSON.parse(suite));
  const implementationPaths = ["src/store.ts", "src/excerpt.ts", "src/context-query.ts", "src/graph-query.ts", "src/domain.ts",
    "src/ingest.ts", "src/evidence-query.ts", "src/query-scope.ts", "scripts/evaluate-retrieval.ts"];
  const implementation = implementationPaths.map(path => ({ path, sha256: hash(readFileSync(resolve(projectRoot, path), "utf8")) }));
  const db = openStore(":memory:");
  try {
    const ingestion = ingest([], { db, collections: [{ id: "eval.research", name: "Research evaluation", root: resolve(root, "docs/research") }] });
    if (ingestion.coverage.partialScopes || ingestion.coverage.unvisitedRoots) throw new TomeowlError("Evaluation corpus ingest is incomplete", "INCOMPLETE_EVALUATION");
    const sources = db.query("SELECT path,revision FROM sources ORDER BY path").all() as Array<{ path: string; revision: string }>;
    const corpus = sources.map(source => ({ path: localPath(root, source.path), sha256: hash(readFileSync(source.path, "utf8")), revision: source.revision }));
    if (corpus.some(source => source.sha256 !== source.revision)) throw new TomeowlError("Corpus differs from its indexed revision", "CORPUS_CHANGED");
    for (const item of cases) for (const anchor of item.expected) {
      const source = sources.find(source => localPath(root, source.path) === anchor.path);
      if (!source || !readFileSync(source.path, "utf8").includes(anchor.quote)) throw new TomeowlError(`Missing source anchor for ${item.id}`, "INVALID_EVALUATION_ANCHOR");
    }
    const rows = cases.map(item => {
      const options = { collection: "Research evaluation", match: item.match };
      const start = performance.now(), hits = searchStore(db, item.query, profile.searchLimit, options), searchFirst = performance.now() - start;
      const contextStart = performance.now(), packet = contextPacket(db, item.query, { ...profile.context, ...options }), contextFirst = performance.now() - contextStart;
      const searchWarm: number[] = [], contextWarm: number[] = [];
      for (let index = 0; index < iterations; index++) {
        let at = performance.now(); searchStore(db, item.query, profile.searchLimit, options); searchWarm.push(performance.now() - at);
        at = performance.now(); contextPacket(db, item.query, { ...profile.context, ...options }); contextWarm.push(performance.now() - at);
      }
      const requestedLimits = { candidates: profile.context.limit, sources: profile.context.maxSources, chunks: profile.context.maxChunks,
        characters: profile.context.maxChars, bytes: profile.context.maxBytes, depth: profile.context.depth };
      return { ...scoreCase(db, root, item, hits, packet, requestedLimits), timing: { firstAfterIngest: { searchMs: searchFirst, contextMs: contextFirst },
        warmed: { search: timing(searchWarm), context: timing(contextWarm) } } };
    });
    for (const source of corpus) if (hash(readFileSync(resolve(root, source.path), "utf8")) !== source.sha256) throw new TomeowlError("Corpus changed during evaluation", "CORPUS_CHANGED");
    for (const source of implementation) if (hash(readFileSync(resolve(projectRoot, source.path), "utf8")) !== source.sha256)
      throw new TomeowlError("Implementation changed during evaluation", "IMPLEMENTATION_CHANGED");
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), labelPolicy: "partial manual exact anchors; unlabeled hits are unjudged; no generated answers",
      runtime: { bun: Bun.version, sqlite: (db.query("SELECT sqlite_version() version").get() as { version: string }).version, tokenizer: "FTS5 default unicode61" },
      profile, iterations, timingPolicy: "in-memory catalog; first queries follow ingest; warmed per-case repetitions; neither disk cold-start nor a production latency benchmark",
      suite: { sha256: hash(suite), cases: cases.length }, corpus: { sha256: hash(JSON.stringify(corpus)), sources: corpus, chunks: ingestion.chunks },
      implementation, summary: summarize(rows), cases: rows };
  } finally { db.close(); }
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2), flags: Record<string, string> = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index];
      if (!["--out", "--cases", "--iterations"].includes(key) || flags[key] !== undefined || !args[index + 1] || args[index + 1].startsWith("--"))
        throw new TomeowlError("Usage: bun run eval:retrieval [--out new-report.json] [--cases suite.json] [--iterations 1..10]", "INVALID_ARGUMENT");
      flags[key] = args[index + 1];
    }
    const report = evaluate(projectRoot, resolve(flags["--cases"] ?? resolve(projectRoot, "tests/fixtures/retrieval-eval/research-cases.json")), Number(flags["--iterations"] ?? 3));
    const output = JSON.stringify({ ok: true, ...report }) + "\n";
    if (flags["--out"]) {
      writeFileSync(resolve(flags["--out"]), output, { flag: "wx" });
      process.stdout.write(JSON.stringify({ ok: true, output: resolve(flags["--out"]), summary: report.summary }) + "\n");
    } else process.stdout.write(output);
    if (report.summary.invalidCitations || report.summary.invalidSources || report.summary.invalidBudgets) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, error: { code: error instanceof TomeowlError ? error.code : "EVALUATION_FAILED", message: error instanceof Error ? error.message : String(error) } }) + "\n");
    process.exitCode = 1;
  }
}
