import type { Database } from "bun:sqlite";
import { Evidence, Locator, Relation, TomeowlError } from "./domain";
import { QueryScope, scopePredicate } from "./query-scope";
import { evidencePredicate } from "./evidence-query";

export type GraphOptions = QueryScope & { depth?: number; limit?: number; maxEdges?: number };
export type GraphSource = { id: string; title: string; path: string; collection: string; revision: string; chunkCount: number };
export type GraphResult = {
  sources: GraphSource[];
  relations: Relation[];
  distances: Record<string, number>;
  paths: Record<string, string[]>;
  truncated: boolean;
  limits: { depth: number; limit: number; maxEdges: number };
  omissions: string[];
};
export type GraphPathResult = GraphResult & {
  status: "found" | "not-found" | "truncated";
  sourceIds: string[];
  relationIds: string[];
  shortest: boolean;
  explanation: string;
};

type EdgeRow = { id: string; source: string; target: string; kind: Relation["kind"]; basis: Relation["basis"]; citation: string };
type CitationRow = Evidence & { quoteClipped: number; storedCitations: number };
type Traversal = GraphResult & { parents: Map<string, { source: string; relation: string }>; citationFlags: Map<string, CitationRow> };

function limits(options: GraphOptions, defaultDepth: number): GraphResult["limits"] {
  const values = { depth: options.depth ?? defaultDepth, limit: options.limit ?? 100, maxEdges: options.maxEdges ?? 500 };
  for (const [name, min, max, code] of [["depth", 0, 8, "INVALID_DEPTH"], ["limit", 1, 1000, "INVALID_LIMIT"], ["maxEdges", 1, 5000, "INVALID_MAX_EDGES"]] as const) {
    if (!Number.isInteger(values[name]) || values[name] < min || values[name] > max) {
      throw new TomeowlError(`${name} must be an integer from ${min} to ${max}`, code);
    }
  }
  return values;
}

// The SQL clips evidence before it enters JavaScript, and never loads the whole graph.
// All three sources (both endpoints and the citation source) must pass the same scope.
function readers(db: Database, scope: QueryScope) {
  const filter = scopePredicate(scope);
  const scoped = `SELECT s.* FROM sources s WHERE ${filter.sql}`;
  const sourceQuery = db.query(`WITH scoped AS NOT MATERIALIZED (${scoped})
    SELECT s.id,s.title,s.path,s.collection,s.revision,
      (SELECT COUNT(*) FROM chunks c WHERE c.source_id=s.id AND c.revision=s.revision) chunkCount
    FROM scoped s WHERE s.id=?`);
  const object = "CASE WHEN e.type='object' THEN e.value ELSE '{}' END";
  const field = (name: string) => `json_extract(${object},'$.${name}')`;
  const numeric = (name: string) => `CASE WHEN json_type(${object},'$.locator.${name}') IN ('integer','real') THEN json_extract(${object},'$.locator.${name}') END`;
  const adjacencyQuery = db.query(`WITH scoped AS NOT MATERIALIZED (${scoped}), candidates AS (
    SELECT r.id,r.source_id source,r.target_id target,r.kind,r.basis,
      (SELECT json_object('sourceId',es.id,'revision',es.revision,'chunkId',c.id,
        'quote',substr(${field("quote")},1,300),'quoteClipped',length(${field("quote")})>300,
        'storedCitations',json_array_length(r.evidence),
        'locator',json_object('lineStart',${numeric("lineStart")},'lineEnd',${numeric("lineEnd")},
          'startSeconds',${numeric("startSeconds")},'endSeconds',${numeric("endSeconds")}))
      FROM json_each(CASE WHEN json_valid(r.evidence) THEN CASE WHEN json_type(r.evidence)='array' THEN r.evidence ELSE '[]' END ELSE '[]' END) e
      JOIN scoped es ON es.id=${field("sourceId")} AND es.revision=${field("revision")}
      JOIN chunks c ON c.id=${field("chunkId")} AND c.source_id=es.id AND c.revision=es.revision
      WHERE e.type='object' AND ${evidencePredicate("c", object)}
      ORDER BY CAST(e.key AS INTEGER) LIMIT 1) citation
    FROM relations r JOIN scoped a ON a.id=r.source_id JOIN scoped b ON b.id=r.target_id
    WHERE r.source_id=? OR r.target_id=?
  ) SELECT id,source,target,kind,basis,citation FROM candidates WHERE citation IS NOT NULL ORDER BY id LIMIT ?`);
  return {
    source(id: string): GraphSource {
      const row = sourceQuery.get(...filter.params, id) as GraphSource | null;
      if (!row) throw new TomeowlError("No indexed source in the requested scope", "NOT_FOUND");
      return row;
    },
    adjacent(id: string, bound: number): EdgeRow[] {
      return adjacencyQuery.all(...filter.params, id, id, bound) as EdgeRow[];
    }
  };
}

function evidence(row: CitationRow): Evidence {
  const locator: Locator = {};
  for (const name of ["lineStart", "lineEnd", "startSeconds", "endSeconds"] as const) {
    if (typeof row.locator[name] === "number" && Number.isFinite(row.locator[name])) locator[name] = row.locator[name];
  }
  let quote = row.quote.slice(0, 300);
  if (/[\uD800-\uDBFF]$/.test(quote)) quote = quote.slice(0, -1);
  return { sourceId: row.sourceId, revision: row.revision, chunkId: row.chunkId, quote, locator };
}

function evidenceOmissions(flags: Iterable<CitationRow>): string[] {
  let clipped = false, additional = false;
  for (const flag of flags) { clipped ||= !!flag.quoteClipped; additional ||= flag.storedCitations > 1; }
  return [
    ...(additional ? ["Each relation includes one current scoped citation; additional stored citations are omitted."] : []),
    ...(clipped ? ["Relation quotes are clipped to 300 characters."] : [])
  ];
}

function traverse(db: Database, roots: string[], options: GraphOptions, defaultDepth: number, stopAt?: string): Traversal {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TomeowlError("Graph options must be an object", "INVALID_GRAPH_OPTIONS");
  const cap = limits(options, defaultDepth);
  if (!Array.isArray(roots) || roots.length === 0 || roots.length > 100 || roots.some(id => typeof id !== "string" || !id.trim())) {
    throw new TomeowlError("Supply between 1 and 100 source IDs", "INVALID_ROOTS");
  }
  const uniqueRoots = [...new Set(roots)].sort();
  if (uniqueRoots.length > cap.limit) throw new TomeowlError("Source limit must accommodate every root", "INVALID_LIMIT");
  const read = readers(db, options);
  const sources = new Map(uniqueRoots.map(id => [id, read.source(id)]));
  if (stopAt !== undefined) read.source(stopAt);
  const distances: Record<string, number> = Object.create(null);
  const paths: Record<string, string[]> = Object.create(null);
  const parents = new Map<string, { source: string; relation: string }>();
  const relations = new Map<string, Relation>();
  const citationFlags = new Map<string, CitationRow>();
  const queue = [...uniqueRoots];
  const omissions = new Set<string>();
  let stopped = stopAt !== undefined && sources.has(stopAt);
  for (const id of queue) { distances[id] = 0; paths[id] = []; }
  for (let index = 0; index < queue.length && !stopped; index++) {
    const id = queue[index], distance = distances[id];
    // At most maxEdges + 1 rows are materialized per visited source. The extra
    // row proves an adjacency was cut off without allocating its whole degree.
    const rows = read.adjacent(id, cap.maxEdges + 1);
    if (rows.length > cap.maxEdges) omissions.add("Edge limit reached; some recorded links were not explored.");
    for (const row of rows.slice(0, cap.maxEdges)) {
      if (relations.has(row.id)) continue;
      const next = row.source === id ? row.target : row.source;
      const known = sources.has(next);
      if (!known && distance >= cap.depth) { omissions.add("Depth limit reached; more distant sources were not explored."); continue; }
      if (!known && sources.size >= cap.limit) { omissions.add("Source limit reached; some sources were not explored."); continue; }
      if (relations.size >= cap.maxEdges) { omissions.add("Edge limit reached; some recorded links were not explored."); continue; }
      const citation = JSON.parse(row.citation) as CitationRow;
      if (citation.quote.length > 300) citation.quoteClipped = 1;
      relations.set(row.id, { id: row.id, source: row.source, target: row.target, kind: row.kind, basis: row.basis, evidence: [evidence(citation)] });
      citationFlags.set(row.id, citation);
      if (!known) {
        sources.set(next, read.source(next));
        distances[next] = distance + 1;
        paths[next] = [...paths[id], row.id];
        parents.set(next, { source: id, relation: row.id });
        queue.push(next);
        if (next === stopAt) { stopped = true; break; }
      }
    }
  }
  return {
    sources: [...sources.values()], relations: [...relations.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    distances, paths, truncated: omissions.size > 0, limits: cap,
    omissions: [...omissions, ...evidenceOmissions(citationFlags.values())], parents, citationFlags
  };
}

/** Bounded undirected neighborhood of recorded, currently indexed, scoped links. */
export function graphNeighborhood(db: Database, rootIds: string[], options: GraphOptions = {}): GraphResult {
  const { parents: _, citationFlags: __, ...result } = traverse(db, rootIds, options, 1);
  return result;
}

/** Finds a cited recorded-link path; shortest is guaranteed only without truncation. */
export function graphPath(db: Database, from: string, to: string, options: GraphOptions = {}): GraphPathResult {
  if (typeof to !== "string" || !to.trim()) throw new TomeowlError("Supply a target source ID", "INVALID_ROOTS");
  const walk = traverse(db, [from], options, 6, to);
  const { parents, citationFlags, ...result } = walk;
  if (!(to in result.distances)) return {
    ...result, status: result.truncated ? "truncated" : "not-found", sourceIds: [], relationIds: [], shortest: false,
    explanation: result.truncated ? "No path found within the reported traversal limits; absence is not proven." : "No recorded-link path exists in this scoped indexed graph."
  };
  const sourceIds = [to];
  for (let current = to; current !== from;) { current = parents.get(current)!.source; sourceIds.push(current); }
  sourceIds.reverse();
  const relationIds = result.paths[to];
  const relationMap = new Map(result.relations.map(row => [row.id, row]));
  const sourceMap = new Map(result.sources.map(row => [row.id, row]));
  const distances: Record<string, number> = Object.create(null), paths: Record<string, string[]> = Object.create(null);
  for (const id of sourceIds) { distances[id] = result.distances[id]; paths[id] = result.paths[id]; }
  return {
    ...result, sources: sourceIds.map(id => sourceMap.get(id)!), relations: relationIds.map(id => relationMap.get(id)!),
    distances, paths, omissions: [...result.omissions.filter(text => text.includes("limit reached")), ...evidenceOmissions(relationIds.map(id => citationFlags.get(id)!))],
    status: "found", sourceIds, relationIds, shortest: !result.truncated,
    explanation: result.truncated
      ? "A valid undirected recorded-link path was found, but traversal limits prevent proving it is globally shortest."
      : "Undirected shortest path through recorded links; endpoint direction and cited evidence are retained."
  };
}
