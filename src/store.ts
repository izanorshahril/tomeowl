import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { Chunk, Evidence, Relation, SearchResult, Snapshot, Source, TomeowlError, hash } from "./domain";
import { SearchOptions, scopePredicate } from "./query-scope";
import { excerptHit, nativeMatchSpans, type MatchedHit } from "./excerpt";
import { evidencePredicate } from "./evidence-query";

const VERSION = 1;
export function openStore(path: string): Database {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path, { create: true });
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.__fts_probe USING fts5(text); DROP TABLE temp.__fts_probe;");
    const hasMeta = db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tomeowl_meta'").get();
    if (hasMeta) {
      const rows = db.query("SELECT version FROM tomeowl_meta").all() as Array<{version:number}>;
      if (rows.length !== 1 || rows[0].version !== VERSION) throw new TomeowlError(`Unsupported or malformed database schema version`, "SCHEMA_VERSION");
    } else {
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if (tables.length) throw new TomeowlError("Database contains unrelated tables and has no Tomeowl schema", "DATABASE_NOT_TOMEOWL");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS tomeowl_meta(version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(
        id TEXT PRIMARY KEY, title TEXT NOT NULL, path TEXT NOT NULL, collection TEXT NOT NULL, url TEXT,
        kind TEXT NOT NULL CHECK(kind IN ('document','transcript')), revision TEXT NOT NULL,
        scope TEXT NOT NULL, UNIQUE(scope,path)
      );
      CREATE TABLE IF NOT EXISTS chunks(
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        revision TEXT NOT NULL, body TEXT NOT NULL, locator TEXT NOT NULL, ordinal INTEGER NOT NULL,
        UNIQUE(source_id,ordinal)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(chunk_id UNINDEXED, body);
      CREATE TABLE IF NOT EXISTS relations(
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, basis TEXT NOT NULL, evidence TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS relations_source_idx ON relations(source_id);
      CREATE INDEX IF NOT EXISTS relations_target_idx ON relations(target_id);
    `);
    const count = (db.query("SELECT COUNT(*) AS n FROM tomeowl_meta").get() as { n: number }).n;
    if (!count) db.query("INSERT INTO tomeowl_meta(version) VALUES (?)").run(VERSION);
    return db;
  } catch (error) { db.close(); throw error; }
}

export function openExistingStore(path: string): Database {
  if (!existsSync(path) || !statSync(path).isFile()) throw new TomeowlError(`Database does not exist: ${path}`, "DATABASE_NOT_FOUND");
  const db=new Database(path,{readonly:true});
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const hasMeta=db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tomeowl_meta'").get();
    if(!hasMeta)throw new TomeowlError("Database has no Tomeowl schema","DATABASE_NOT_TOMEOWL");
    const versions=db.query("SELECT version FROM tomeowl_meta").all() as Array<{version:number}>;
    if(versions.length!==1||versions[0].version!==VERSION)throw new TomeowlError("Unsupported or malformed database schema version","SCHEMA_VERSION");
    const tables=new Set((db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name:string}>).map(x=>x.name));
    for(const name of ["sources","chunks","chunk_fts","relations"])if(!tables.has(name))throw new TomeowlError(`Database is missing table ${name}`,"DATABASE_NOT_TOMEOWL");
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.__fts_probe USING fts5(text); DROP TABLE temp.__fts_probe;");
    return db;
  } catch(e) { db.close();throw e; }
}

export type Staged = { source: Source; chunks: Chunk[] };
export function replaceScope(db: Database, scope: string, staged: Staged[], relations: Relation[] = [], prune = true): { added: number; updated: number; unchanged: number; removed: number } {
  let added = 0, updated = 0, unchanged = 0, removed = 0;
  const current = new Set(staged.map(x => x.source.id));
  const run = db.transaction(() => {
    const old = db.query("SELECT id,revision FROM sources WHERE scope=?").all(scope) as Array<{id:string;revision:string}>;
    const oldRevs = new Map(old.map(x => [x.id, x.revision]));
    for (const { source, chunks } of staged) {
      const prior = oldRevs.get(source.id);
      if (prior === undefined) added++;
      else if (prior === source.revision) unchanged++;
      else updated++;
      db.query(`INSERT INTO sources(id,title,path,collection,url,kind,revision,scope) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,path=excluded.path,collection=excluded.collection,url=excluded.url,kind=excluded.kind,revision=excluded.revision,scope=excluded.scope`)
        .run(source.id, source.title, source.path, source.collection, source.url ?? null, source.kind, source.revision, scope);
      if (prior === source.revision) continue;
      db.query("DELETE FROM relations WHERE source_id=?").run(source.id);
      db.query("DELETE FROM chunk_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id=?)").run(source.id);
      db.query("DELETE FROM chunks WHERE source_id=?").run(source.id);
      for (const chunk of chunks) {
        db.query("INSERT INTO chunks(id,source_id,revision,body,locator,ordinal) VALUES (?,?,?,?,?,?)")
          .run(chunk.id, source.id, chunk.revision, chunk.text, JSON.stringify(chunk.locator), chunk.ordinal);
        db.query("INSERT INTO chunk_fts(chunk_id,body) VALUES (?,?)").run(chunk.id, chunk.text);
      }
    }
    for (const row of old) if (prune && !current.has(row.id)) {
      db.query("DELETE FROM relations WHERE source_id=? OR target_id=?").run(row.id, row.id);
      db.query("DELETE FROM chunk_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id=?)").run(row.id);
      db.query("DELETE FROM sources WHERE id=?").run(row.id); removed++;
    }
    for (const rel of relations) {
      if (!db.query("SELECT 1 FROM sources WHERE id=?").get(rel.source) || !db.query("SELECT 1 FROM sources WHERE id=?").get(rel.target)) continue;
      db.query("INSERT OR IGNORE INTO relations(id,source_id,target_id,kind,basis,evidence) VALUES (?,?,?,?,?,?)")
        .run(rel.id, rel.source, rel.target, rel.kind, rel.basis, JSON.stringify(rel.evidence));
    }
  });
  run();
  return { added, updated, unchanged, removed };
}

export function addRelations(db: Database, relations: Relation[]): void {
  const run=db.transaction(()=>{for(const rel of relations) {
    if (!db.query("SELECT 1 FROM sources WHERE id=?").get(rel.source) || !db.query("SELECT 1 FROM sources WHERE id=?").get(rel.target)) continue;
    db.query("INSERT OR IGNORE INTO relations(id,source_id,target_id,kind,basis,evidence) VALUES (?,?,?,?,?,?)")
      .run(rel.id,rel.source,rel.target,rel.kind,rel.basis,JSON.stringify(rel.evidence));
  }});
  run();
}

function literalFtsQuery(value: string, match: SearchOptions["match"]): string {
  if (typeof value !== "string" || value.length > 2000) throw new TomeowlError("Query must be a string of at most 2000 characters", "INVALID_QUERY");
  const terms = value.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (!terms.length) throw new TomeowlError("Query must contain at least one letter or number", "INVALID_QUERY");
  if (terms.length > 64) throw new TomeowlError("Query must contain at most 64 terms", "INVALID_QUERY");
  if (match === "phrase") return `"${terms.join(" ")}"`;
  return terms.map(x => `"${x}"`).join(match === "all" ? " AND " : " OR ");
}

export function searchStore(db: Database, query: string, limit: number, options: SearchOptions = {}): SearchResult[] {
  return searchRows(db, query, limit, options, false).hits.map(({ matchSpans, ...hit }) => hit);
}

/** Round-robin ranked chunks across sources; candidate cap cannot be monopolized by one source. */
export function contextCandidates(db: Database, query: string, limit: number, options: SearchOptions = {}) {
  return searchRows(db, query, limit, options, true);
}

/** Highest lexical match within one reached source, respecting the caller's scope. */
export function sourceContextCandidate(db: Database, id: string, query: string, options: SearchOptions = {}): MatchedHit | undefined {
  return searchRows(db, query, 1, options, false, id).hits[0];
}

function searchRows(db: Database, query: string, limit: number, options: SearchOptions, diverse: boolean, sourceId?: string): { hits: MatchedHit[]; matchingSources: number } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new TomeowlError("limit must be an integer from 1 to 1000", "INVALID_LIMIT");
  const scope = scopePredicate(options);
  if (options.match !== undefined && !["any", "all", "phrase"].includes(options.match)) throw new TomeowlError("match must be any, all, or phrase", "INVALID_MATCH");
  if (options.quoteChars !== undefined && (!Number.isInteger(options.quoteChars) || options.quoteChars < 1 || options.quoteChars > 64000)) throw new TomeowlError("quoteChars must be an integer from 1 to 64000", "INVALID_LIMIT");
  const ftsQuery = literalFtsQuery(query, options.match);
  const fields = "s.id sourceId,s.title,s.path,s.collection,s.revision,c.id chunkId,c.body quote,c.locator";
  const capture = diverse || sourceId !== undefined || options.quoteChars !== undefined;
  const highlighted = capture ? ",highlight(chunk_fts,1,char(1),char(2)) highlighted" : "";
  const matched = `SELECT ${diverse ? "s.id sourceId,c.id chunkId" : fields},bm25(chunk_fts) rank${diverse ? "" : highlighted}
    FROM chunk_fts JOIN chunks c ON c.id=chunk_fts.chunk_id JOIN sources s ON s.id=c.source_id AND s.revision=c.revision
    WHERE chunk_fts MATCH ? AND ${scope.sql}${sourceId === undefined ? "" : " AND s.id=?"}`;
  const params = [ftsQuery, ...scope.params, ...(sourceId === undefined ? [] : [sourceId])];
  const sql = diverse
    ? `WITH matched AS MATERIALIZED (${matched}), ranked AS (
        SELECT *,ROW_NUMBER() OVER (PARTITION BY sourceId ORDER BY rank,chunkId) sourceRound FROM matched
      ), selected AS (SELECT * FROM ranked ORDER BY sourceRound,rank,chunkId LIMIT ?)
      SELECT ${fields},selected.rank${highlighted} FROM selected JOIN chunks c ON c.id=selected.chunkId JOIN sources s ON s.id=c.source_id
      JOIN chunk_fts ON chunk_fts.chunk_id=c.id WHERE chunk_fts MATCH ?
      ORDER BY selected.sourceRound,selected.rank,selected.chunkId`
    : `${matched} ORDER BY rank,c.id LIMIT ?`;
  const hits = (db.query(sql).all(...params, limit, ...(diverse ? [ftsQuery] : [])) as any[]).map(r => {
    const hit: MatchedHit = {
      sourceId:r.sourceId,title:r.title,path:r.path,collection:r.collection,revision:r.revision,
      score:-r.rank,quote:r.quote,locator:JSON.parse(r.locator),chunkId:r.chunkId,
      ...(capture ? { matchSpans: nativeMatchSpans(r.quote, r.highlighted, query, options.match) } : {})
    };
    return options.quoteChars === undefined ? hit : excerptHit(hit, query, options.quoteChars, options.match);
  });
  const matchingSources = diverse
    ? (db.query(`SELECT COUNT(DISTINCT s.id) n FROM chunk_fts
        JOIN chunks c ON c.id=chunk_fts.chunk_id JOIN sources s ON s.id=c.source_id AND s.revision=c.revision
        WHERE chunk_fts MATCH ? AND ${scope.sql}`).get(ftsQuery, ...scope.params) as { n: number }).n
    : new Set(hits.map(hit => hit.sourceId)).size;
  return { hits, matchingSources };
}

export function makeSnapshot(db: Database): Snapshot {
  const sources = db.query(`SELECT s.id,s.title,s.path,s.collection,s.url,s.kind,s.revision,COUNT(c.id) chunkCount,
      (SELECT c2.id FROM chunks c2 WHERE c2.source_id=s.id AND c2.revision=s.revision ORDER BY c2.ordinal LIMIT 1) excerptChunkId,
      (SELECT substr(c2.body,1,1000) FROM chunks c2 WHERE c2.source_id=s.id AND c2.revision=s.revision ORDER BY c2.ordinal LIMIT 1) excerptQuote,
      (SELECT c2.locator FROM chunks c2 WHERE c2.source_id=s.id AND c2.revision=s.revision ORDER BY c2.ordinal LIMIT 1) excerptLocator
    FROM sources s LEFT JOIN chunks c ON c.source_id=s.id AND c.revision=s.revision
    GROUP BY s.id ORDER BY s.path,s.id`).all() as Snapshot["sources"];
  for (const source of sources as any[]) if(source.excerptChunkId) {
    source.excerpt={quote:source.excerptQuote,chunkId:source.excerptChunkId,locator:JSON.parse(source.excerptLocator)};
    delete source.excerptChunkId;delete source.excerptQuote;delete source.excerptLocator;
  } else { delete source.excerptChunkId;delete source.excerptQuote;delete source.excerptLocator; }
  for (const source of sources as any[]) if(source.url===null)delete source.url;
  const validCitation = db.query(`SELECT 1 FROM chunks c JOIN sources s ON s.id=c.source_id AND s.revision=c.revision
    WHERE c.id=? AND c.source_id=? AND c.revision=? AND ${evidencePredicate("c", "?4")}`);
  const relations = (db.query("SELECT id,source_id source,target_id target,kind,basis,evidence FROM relations ORDER BY id").all() as any[])
    .map(r => {
      let citations: unknown;
      try { citations = JSON.parse(r.evidence); } catch { citations = []; }
      const evidence = (Array.isArray(citations) ? citations : []).filter((citation): citation is Evidence =>
        citation !== null && typeof citation === "object" && typeof citation.chunkId === "string"
        && typeof citation.sourceId === "string" && typeof citation.revision === "string"
        && !!validCitation.get(citation.chunkId, citation.sourceId, citation.revision, JSON.stringify(citation)));
      return { ...r, evidence };
    })
    .filter(r=>r.evidence.length) as Relation[];
  const chunks = (db.query("SELECT COUNT(*) n FROM chunks").get() as {n:number}).n;
  return { schemaVersion:1, generatedAt:new Date().toISOString(), stats:{sources:sources.length,chunks,relations:relations.length}, sources, relations };
}

type FreshnessReason = "current" | "changed" | "missing" | "unreadable" | "symlink" | "not-regular-file" | "size-limit" | "changed-during-check";
type SourceDetails = { source: Omit<Source,"scope">; chunks: Chunk[]; stale: boolean; freshnessReason: FreshnessReason; returnedChunks:number; truncated:boolean };
export function sourceDetails(db: Database, id: string, limit = 20): SourceDetails {
  return readDetails(db,id,limit);
}
function readDetails(db: Database, id: string, limit: number, chunkId?: string): SourceDetails {
  if(!Number.isInteger(limit)||limit<1||limit>2000)throw new TomeowlError("detail limit must be an integer from 1 to 2000","INVALID_LIMIT");
  const row = db.query("SELECT id,title,path,collection,url,kind,revision,scope,(SELECT COUNT(*) FROM chunks WHERE source_id=sources.id AND revision=sources.revision) chunkCount FROM sources WHERE id=?").get(id) as Source | null;
  if (!row) {
    const chunk = db.query("SELECT source_id FROM chunks WHERE id=?").get(id) as {source_id:string} | null;
    if (!chunk) throw new TomeowlError(`No indexed source or chunk: ${id}`, "NOT_FOUND");
    return readDetails(db, chunk.source_id, 1, id);
  }
  const rows=chunkId
    ? [db.query("SELECT id,source_id sourceId,revision,body text,locator,ordinal FROM chunks WHERE id=? AND source_id=? AND revision=?").get(chunkId,id,row.revision)].filter(Boolean) as any[]
    : db.query("SELECT id,source_id sourceId,revision,body text,locator,ordinal FROM chunks WHERE source_id=? AND revision=? ORDER BY ordinal LIMIT ?").all(id,row.revision,limit) as any[];
  const chunks = rows.map(c => ({...c, locator:JSON.parse(c.locator)}));
  const freshnessReason = checkFreshness(resolve(row.scope, row.path.replaceAll("/", sep)), row.revision);
  const {scope:_, ...source} = row;
  if(source.url===null)delete (source as any).url;
  return { source, chunks, stale: freshnessReason !== "current", freshnessReason, returnedChunks:chunks.length, truncated:chunks.length<source.chunkCount };
}

// Verification never follows a detected link or reads more than the ingest file ceiling + 1 byte.
function checkFreshness(path: string, revision: string): FreshnessReason {
  const cap = 2 * 1024 * 1024;
  let fd: number | undefined;
  try {
    for (let part = path;; part = dirname(part)) {
      if (lstatSync(part).isSymbolicLink()) return "symlink";
      if (dirname(part) === part) break;
    }
    const before = lstatSync(path);
    if (!before.isFile()) return "not-regular-file";
    if (before.size > cap) return "size-limit";
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile()) return "not-regular-file";
    if (opened.size > cap) return "size-limit";
    if (opened.ino !== before.ino || opened.dev !== before.dev) return "changed-during-check";
    const buffer = Buffer.alloc(cap + 1);
    let bytes = 0, count = 0;
    while (bytes < buffer.length && (count = readSync(fd, buffer, bytes, buffer.length - bytes, null)) > 0) bytes += count;
    if (bytes > cap) return "size-limit";
    const after = fstatSync(fd), current = lstatSync(path);
    if (current.isSymbolicLink()) return "symlink";
    if (after.size !== bytes || after.mtimeMs !== opened.mtimeMs || current.ino !== opened.ino || current.dev !== opened.dev) return "changed-during-check";
    return hash(buffer.subarray(0, bytes).toString("utf8")) === revision ? "current" : "changed";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable";
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function indexedPaths(db: Database): Map<string,string> {
  const rows = db.query("SELECT id,scope,path FROM sources").all() as Array<{id:string;scope:string;path:string}>;
  return new Map(rows.map(r => [resolve(r.scope, r.path.replaceAll("/", sep)), r.id]));
}
