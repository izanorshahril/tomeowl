import type { Database } from "bun:sqlite";
import { extname, resolve, dirname, sep } from "node:path";
import { TomeowlError, type Locator } from "./domain";
import { scopePredicate, type QueryScope } from "./query-scope";

type ModuleSource = { id: string; path: string; title: string; revision: string; collection: string; lexicalHit: number; metadataRank: number };
type Import = { specifier: string; kind: string; resolution: "indexed-relative" | "unresolved-relative" | "external-or-alias"; targetId?: string };
type Module = ModuleSource & { chunkIds: string[]; exports: string[]; imports: Import[]; relevance: number; status: "scanned" | "unsupported-chunks" | "parse-error" | "input-limit" };
export type RepomapOptions = QueryScope & { query?: string; limit?: number; maxBytes?: number };
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const key = (path: string) => process.platform === "win32" ? path.replace(/[A-Z]/g, c => c.toLowerCase()) : path;

function bound(value: number | undefined, fallback: number, min: number, max: number, name: string) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new TomeowlError(`${name} must be from ${min} to ${max}`, "INVALID_LIMIT");
  return result;
}

/** Inventory and syntax import/export names; no symbol spans, type-only records or call resolution. */
export function repositoryMap(db: Database, options: RepomapOptions = {}) {
  const limit = bound(options.limit, 100, 1, 500, "limit");
  const maxBytes = bound(options.maxBytes, 65536, 512, 1048576, "max-bytes");
  if (options.query !== undefined && (typeof options.query !== "string" || !options.query.trim() || options.query.length > 2000)) throw new TomeowlError("query must contain 1-2000 characters", "INVALID_QUERY");
  const scope = { collection: options.collection, path: options.path };
  const filter = scopePredicate(scope);
  const terms = (options.query?.match(/[\p{L}\p{N}_]+/gu) ?? []).map(t => t.toLowerCase());
  if (options.query !== undefined && (!terms.length || terms.length > 64)) throw new TomeowlError("query must contain 1-64 literal terms", "INVALID_QUERY");
  const suffix = EXTENSIONS.map(() => "lower(s.path) LIKE ?").join(" OR ");
  const lexical = terms.length ? `WITH hits AS MATERIALIZED (
    SELECT c.source_id,bm25(chunk_fts) rank FROM chunk_fts JOIN chunks c ON c.id=chunk_fts.chunk_id
    JOIN sources x ON x.id=c.source_id AND x.revision=c.revision WHERE chunk_fts MATCH ?
  ), relevance AS (SELECT source_id,MIN(rank) rank FROM hits GROUP BY source_id)` : "";
  const metadataRank = terms.length ? terms.map(() => "CASE WHEN instr(lower(s.path || ' ' || s.title),?)>0 THEN 1 ELSE 0 END").join("+") : "0";
  const sources = db.query(`${lexical} SELECT s.id,s.path,s.title,s.revision,s.collection,
    ${terms.length ? "CASE WHEN r.source_id IS NULL THEN 0 ELSE 1 END" : "0"} lexicalHit,(${metadataRank}) metadataRank FROM sources s
    ${terms.length ? "LEFT JOIN relevance r ON r.source_id=s.id" : ""}
    WHERE s.kind='document' AND ${filter.sql} AND (${suffix})
    ORDER BY metadataRank DESC,lexicalHit DESC,${terms.length ? "r.rank," : ""}s.path,s.id LIMIT ?`)
    .all(...(terms.length ? [terms.map(t => `"${t}"`).join(" OR "), ...terms] : []), ...filter.params, ...EXTENSIONS.map(e => `%${e}`), limit + 1) as ModuleSource[];
  const omissions = new Set<string>(["type-only-imports-and-exports", "symbol-signatures-and-spans", "runtime-call-resolution"]);
  let truncated = sources.length > limit;
  if (truncated) omissions.add("file-limit");
  const selected = sources.slice(0, limit);
  const indexedPath = db.query(`SELECT s.id FROM sources s WHERE ${filter.sql} AND ${process.platform === "win32" ? "lower(s.path)=lower(?)" : "s.path=?"} LIMIT 1`);
  function resolveImport(from: string, specifier: string): Import["targetId"] {
    const bare = resolve(dirname(from), specifier);
    // Explicit file, common runtime-to-TS counterparts, then extensionless/index conventions.
    const candidates = [bare];
    if (/\.m?js$/i.test(bare)) candidates.push(bare.replace(/\.m?js$/i, ".ts"), bare.replace(/\.m?js$/i, ".tsx"));
    if (!extname(bare)) candidates.push(...EXTENSIONS.map(e => bare + e), ...EXTENSIONS.map(e => resolve(bare, "index" + e)));
    for (const candidate of candidates) {
      const found = indexedPath.get(...filter.params, candidate) as { id: string } | null;
      if (found) return found.id;
    }
    return undefined;
  }
  const sizeQuery = db.query("SELECT COUNT(*) count,COALESCE(SUM(length(CAST(body AS BLOB))+1),0) bytes FROM chunks WHERE source_id=? AND revision=?");
  const chunks = db.query("SELECT id,body,locator FROM chunks WHERE source_id=? AND revision=? ORDER BY ordinal LIMIT 2000");
  let scannedBytes = 0;
  const modules: Module[] = selected.map(source => {
    const { lexicalHit, metadataRank: _metadataRank, ...metadata } = source;
    const module: Module = { ...metadata, chunkIds: [], exports: [], imports: [], relevance: lexicalHit, status: "scanned" };
    const size = sizeQuery.get(source.id, source.revision) as { count: number; bytes: number };
    if (size.count > 2000 || size.bytes > 2 * 1024 * 1024 || scannedBytes + size.bytes > 8 * 1024 * 1024) {
      module.status = "input-limit"; truncated = true; omissions.add("input-limit"); return module;
    }
    scannedBytes += size.bytes;
    const rows = chunks.all(source.id, source.revision) as Array<{ id: string; body: string; locator: string }>;
    const pieces: string[] = [];
    let previousLine = 0;
    for (const row of rows) {
      let locator: Locator;
      try { locator = JSON.parse(row.locator); } catch { module.status = "unsupported-chunks"; break; }
      const lineCount = row.body.split("\n").length;
      if (!Number.isInteger(locator.lineStart) || !Number.isInteger(locator.lineEnd) || locator.lineStart !== previousLine + 1 || locator.lineEnd !== locator.lineStart! + lineCount - 1) {
        module.status = "unsupported-chunks"; break;
      }
      pieces.push(row.body);
      previousLine = locator.lineEnd!;
      module.chunkIds.push(row.id);
    }
    if (module.status === "scanned") {
      const text = pieces.join("\n");
      const extension = extname(source.path).toLowerCase();
      const loader = extension === ".tsx" ? "tsx" : extension === ".jsx" ? "jsx" : extension === ".ts" ? "ts" : "js";
      try {
        const scan = new Bun.Transpiler({ loader }).scan(text);
        module.exports = [...scan.exports].sort();
        module.imports = scan.imports.map(item => {
          const relative = item.path.startsWith("./") || item.path.startsWith("../");
          const targetId = relative ? resolveImport(source.path, item.path) : undefined;
          return { specifier: item.path, kind: item.kind, resolution: relative ? targetId ? "indexed-relative" : "unresolved-relative" : "external-or-alias", ...(targetId ? { targetId } : {}) } as Import;
        }).sort((a, b) => a.specifier.localeCompare(b.specifier) || a.kind.localeCompare(b.kind));
      } catch { module.status = "parse-error"; }
    }
    if (module.status !== "scanned") { truncated = true; omissions.add(module.status); }
    const inventory = [source.path.split(sep).join("/"), ...module.exports, ...module.imports.map(i => i.specifier)].join(" ").toLowerCase();
    module.relevance += terms.reduce((n, term) => n + (inventory.includes(term) ? 1 : 0), 0);
    return module;
  }).sort((a, b) => b.relevance - a.relevance || key(a.path).localeCompare(key(b.path)) || a.id.localeCompare(b.id));
  const packet = {
    schemaVersion: 1, kind: "module-map", freshness: "indexed-revisions", scope, query: options.query,
    limits: { files: limit, bytes: maxBytes, inputBytes: 8 * 1024 * 1024 },
    used: { files: modules.length, scannedBytes, bytes: 0 }, truncated, omissions: [...omissions].sort(), modules,
  };
  const measure = () => {
    for (let i = 0; i < 8; i++) {
      const bytes = Buffer.byteLength(JSON.stringify({ ok: true, ...packet }) + "\n");
      if (bytes === packet.used.bytes) return bytes;
      packet.used.bytes = bytes;
    }
    return packet.used.bytes;
  };
  while (measure() > maxBytes && packet.modules.length) {
    packet.modules.pop(); packet.used.files = packet.modules.length;
    packet.truncated = true;
    if (!packet.omissions.includes("byte-limit")) packet.omissions.push("byte-limit");
  }
  if (measure() > maxBytes) throw new TomeowlError("Output budget cannot hold the module-map envelope", "OUTPUT_BUDGET_TOO_SMALL");
  return packet;
}
