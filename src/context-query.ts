import type { Database } from "bun:sqlite";
import type { Relation, SearchResult, Source } from "./domain";
import { TomeowlError } from "./domain";
import { excerptHit, type MatchedHit } from "./excerpt";
import { graphNeighborhood } from "./graph-query";
import { scopePredicate, type SearchOptions } from "./query-scope";
import { contextCandidates, sourceContextCandidate } from "./store";

export type ContextOptions = SearchOptions & {
  limit?: number; maxSources?: number; maxChunks?: number; maxChars?: number; maxBytes?: number; depth?: number;
};
type ContextSource = Omit<Source, "scope">;
type ContextPassage = Omit<SearchResult, "score"> & {
  origin: "keyword" | "recorded-link"; keywordScore: number | null; distance: number; via: string[];
  selection: "query-match" | "first-chunk";
};
export type ContextPacket = {
  schemaVersion: 1; query: string; match: "any" | "all" | "phrase"; scope: { collection?: string; path?: string };
  freshness: "indexed-revisions";
  limits: { candidates: number; sources: number; chunks: number; characters: number; bytes: number; depth: number };
  used: { sources: number; chunks: number; passages: number; characters: number; bytes: number };
  truncated: boolean; omissions: string[]; sources: ContextSource[]; passages: ContextPassage[]; relations: Relation[];
};
type Entry = { passage: ContextPassage; path: Relation[]; sources: ContextSource[] };

function bound(value: number | undefined, fallback: number, min: number, max: number, name: string) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result < min || result > max) throw new TomeowlError(`${name} must be an integer from ${min} to ${max}`, "INVALID_LIMIT");
  return result;
}

/** used.bytes includes compact JSON of {ok:true,...packet} and its CLI newline, not a token estimate. */
export function contextPacket(db: Database, query: string, options: ContextOptions = {}): ContextPacket {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TomeowlError("Context options must be an object", "INVALID_SCOPE");
  const limits = {
    candidates: bound(options.limit, 20, 1, 100, "limit"),
    sources: bound(options.maxSources, 8, 1, 64, "max-sources"),
    chunks: bound(options.maxChunks, 12, 1, 128, "max-chunks"),
    characters: bound(options.maxChars, 12000, 1, 64000, "max-chars"),
    bytes: bound(options.maxBytes, 65536, 512, 1048576, "max-bytes"),
    depth: bound(options.depth, 1, 0, 3, "depth"),
  };
  const scope = { collection: options.collection, path: options.path };
  const filter = scopePredicate(scope);
  const search = contextCandidates(db, query, limits.candidates + 1, { ...scope, match: options.match });
  const candidates = search.hits.slice(0, limits.candidates);
  const omissions = new Set<string>();
  if (search.hits.length > limits.candidates) omissions.add("candidate-limit");
  if (search.matchingSources > new Set(candidates.map(hit => hit.sourceId)).size) omissions.add("candidate-source-limit");
  const entries: Entry[] = [];
  const sourceQuery = db.query(`SELECT s.id,s.title,s.path,s.collection,s.kind,s.revision,s.url,
    (SELECT COUNT(*) FROM chunks c WHERE c.source_id=s.id AND c.revision=s.revision) chunkCount
    FROM sources s WHERE s.id=? AND ${filter.sql}`);
  const getSource = (id: string): ContextSource | null => {
    const source = sourceQuery.get(id, ...filter.params) as ContextSource | null;
    if (source && source.url === null) delete source.url;
    return source;
  };

  function packet(selected = entries): ContextPacket {
    const sources = new Map<string, ContextSource>(), relations = new Map<string, Relation>(), chunks = new Set<string>();
    for (const entry of selected) {
      for (const source of entry.sources) sources.set(source.id, source);
      chunks.add(entry.passage.chunkId);
      for (const relation of entry.path) relations.set(relation.id, relation);
    }
    for (const relation of relations.values()) for (const evidence of relation.evidence) chunks.add(evidence.chunkId);
    const passages = selected.map(entry => entry.passage);
    const characters = passages.reduce((sum, passage) => sum + passage.quote.length, 0)
      + [...relations.values()].reduce((sum, relation) => sum + relation.evidence.reduce((count, evidence) => count + evidence.quote.length, 0), 0);
    const result: ContextPacket = {
      schemaVersion: 1, query, match: options.match ?? "any", scope, freshness: "indexed-revisions", limits,
      used: { sources: sources.size, chunks: chunks.size, passages: passages.length, characters, bytes: 0 },
      truncated: omissions.size > 0, omissions: [...omissions].sort(),
      sources: [...sources.values()], passages, relations: [...relations.values()],
    };
    // Adding the count changes the JSON length; monotonic digit growth reaches a fixed point.
    for (;;) {
      const bytes = Buffer.byteLength(JSON.stringify({ ok: true, ...result }) + "\n", "utf8");
      if (bytes === result.used.bytes) break;
      result.used.bytes = bytes;
    }
    return result;
  }

  if (packet().used.bytes > limits.bytes) throw new TomeowlError("max-bytes cannot contain the query, scope and empty context envelope", "OUTPUT_BUDGET_TOO_SMALL");

  function include(hit: MatchedHit, origin: ContextPassage["origin"], distance: number, path: Relation[] = [], quoteLimit = limits.characters, selection: ContextPassage["selection"] = "query-match") {
    if (entries.some(entry => entry.passage.chunkId === hit.chunkId)) return;
    const current = packet();
    const currentRelations = new Set(current.relations.map(edge => edge.id));
    const linkCharacters = path.filter(edge => !currentRelations.has(edge.id))
      .reduce((sum, edge) => sum + edge.evidence.reduce((count, evidence) => count + evidence.quote.length, 0), 0);
    const available = Math.min(quoteLimit, limits.characters - current.used.characters - linkCharacters);
    if (available <= 0) { omissions.add("character-limit"); return; }
    const requiredIds = new Set([hit.sourceId, ...path.flatMap(edge => [edge.source, edge.target, ...edge.evidence.map(citation => citation.sourceId)])]);
    const sources = [...requiredIds].map(getSource);
    if (sources.some(source => !source)) { omissions.add("unavailable-scoped-source"); return; }
    const makeEntry = (chars: number): Entry => {
      const { score, ...citation } = excerptHit(hit, query, chars, options.match);
      return { passage: { ...citation, origin, keywordScore: origin === "keyword" ? score : null, distance,
        via: path.map(edge => edge.id), selection }, path, sources: sources as ContextSource[] };
    };
    let entry = makeEntry(available);
    if (!entry.passage.quote.length) { omissions.add("character-limit"); return; }
    if (entry.passage.quoteTruncated) omissions.add("character-limit");
    let proposed = packet([...entries, entry]);
    if (proposed.used.chunks > limits.chunks) { omissions.add("chunk-limit"); return; }
    if (proposed.used.sources > limits.sources) { omissions.add("source-limit"); return; }
    if (proposed.used.bytes > limits.bytes) {
      omissions.add("byte-limit");
      let low = 1, high = available, fitting: Entry | undefined;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2), candidate = makeEntry(middle);
        if (candidate.passage.quote.length && packet([...entries, candidate]).used.bytes <= limits.bytes) { fitting = candidate; low = middle + 1; }
        else high = middle - 1;
      }
      if (!fitting) return;
      entry = fitting;
    }
    entries.push(entry);
  }

  // One best chunk per source first, with a fair quote allocation, then ranked additional chunks.
  const first = new Map<string, MatchedHit>();
  for (const hit of candidates) if (!first.has(hit.sourceId)) first.set(hit.sourceId, hit);
  const sourceFirst = [...first.values()];
  for (let index = 0; index < sourceFirst.length; index++) {
    const remaining = Math.min(sourceFirst.length - index, Math.max(1, limits.sources - packet().used.sources));
    include(sourceFirst[index], "keyword", 0, [], Math.max(1, Math.floor((limits.characters - packet().used.characters) / remaining)));
  }
  for (const hit of candidates) include(hit, "keyword", 0);

  const roots = [...new Set(entries.map(entry => entry.passage.sourceId))];
  const beforeGraph = packet();
  if (limits.depth && roots.length && beforeGraph.used.characters < limits.characters && beforeGraph.used.chunks < limits.chunks) {
    const graph = graphNeighborhood(db, roots, { ...scope, depth: limits.depth, limit: 100, maxEdges: 500 });
    if (graph.truncated) omissions.add("graph-truncated");
    for (const omission of graph.omissions) omissions.add(`graph:${omission}`);
    const edges = new Map(graph.relations.map(edge => [edge.id, edge]));
    const graphSources = graph.sources.filter(source => !roots.includes(source.id))
      .sort((a, b) => graph.distances[a.id] - graph.distances[b.id] || a.id.localeCompare(b.id));
    const chunkQuery = db.query(`SELECT c.id chunkId,c.source_id sourceId,c.revision,c.body quote,c.locator
      FROM chunks c JOIN sources s ON s.id=c.source_id AND s.revision=c.revision
      WHERE s.id=? AND ${filter.sql} ORDER BY c.ordinal LIMIT 1`);
    for (const source of graphSources) {
      let hit = sourceContextCandidate(db, source.id, query, { ...scope, match: options.match });
      const selection = hit ? "query-match" : "first-chunk";
      if (!hit) {
        const row = chunkQuery.get(source.id, ...filter.params) as { chunkId: string; sourceId: string; revision: string; quote: string; locator: string } | null;
        if (!row) continue;
        hit = { sourceId: source.id, title: source.title, path: source.path, collection: source.collection,
          revision: row.revision, chunkId: row.chunkId, quote: row.quote, locator: JSON.parse(row.locator), score: 0 };
      }
      const pathIds = graph.paths[source.id] ?? [], path = pathIds.map(id => edges.get(id));
      if (!pathIds.length || path.some(edge => !edge)) { omissions.add("unavailable-recorded-path"); continue; }
      include(hit, "recorded-link", graph.distances[source.id], path as Relation[], limits.characters, selection);
    }
  } else if (limits.depth && roots.length) omissions.add("graph-expansion-budget");

  // Late omission metadata is also budgeted; dropping entries recomputes orphaned sources/citations.
  let result = packet();
  while (result.used.bytes > limits.bytes && entries.length) {
    omissions.add("byte-limit"); entries.pop(); result = packet();
  }
  if (result.used.bytes > limits.bytes) throw new TomeowlError("max-bytes cannot contain the query, scope and omission metadata", "OUTPUT_BUDGET_TOO_SMALL");
  return result;
}
