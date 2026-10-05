import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { Evidence, Locator, TomeowlError } from "./domain";

export type MemoryKind = "fact" | "preference" | "decision" | "procedure";
export type MemoryStatus = "active" | "superseded" | "retracted";
export type MemoryCitation = { chunkId: string; quote: string; sourceId?: string; revision?: string };
export type CapturedMemoryEvidence = Evidence & { title: string; path: string; collection: string };
export type MemoryInput = {
  namespace: string; kind: MemoryKind; text: string; author: string; origin: string;
  id?: string; expiresAt?: string; evidence?: MemoryCitation[];
};
export type MemoryRecord = {
  id: string; namespace: string; kind: MemoryKind; text: string; author: string; origin: string;
  basis: "authored" | "cited"; status: MemoryStatus; createdAt: string; updatedAt: string;
  expiresAt?: string; supersedes?: string; evidence: CapturedMemoryEvidence[]; expired: boolean;
};
export type MemoryRecallOptions = {
  namespace: string; query?: string; status?: MemoryStatus | "all"; includeExpired?: boolean;
  limit?: number; maxBytes?: number; now?: string;
};
export type MemoryRecall = {
  schemaVersion: 1; namespace: string; memories: MemoryRecord[]; truncated: boolean;
  limits: { limit: number; maxBytes: number }; used: { memories: number; bytes: number }; omissions: string[];
};

const KINDS = ["fact", "preference", "decision", "procedure"];
const STATUSES = ["active", "superseded", "retracted"];
const TABLE = "tomeowl_memories";
const MAX_HISTORY = 1000;

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0"))
    throw new TomeowlError(`${label} must contain 1..${maximum} characters without NUL`, "INVALID_MEMORY");
  return value;
}
function timestamp(value: string | undefined, label = "now"): string {
  if (value === undefined) return new Date().toISOString();
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    throw new TomeowlError(`${label} must be an ISO datetime`, "INVALID_MEMORY");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TomeowlError(`${label} must be an ISO datetime`, "INVALID_MEMORY");
  return parsed.toISOString();
}
function integer(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new TomeowlError(`${label} must be an integer from ${minimum} to ${maximum}`, "INVALID_LIMIT");
  return value;
}
function memorySchema(db: Database): boolean {
  const names = new Set((db.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tomeowl_memory_meta','tomeowl_memories')").all() as Array<{ name: string }>).map(row => row.name));
  if (!names.size) return false;
  if (names.size !== 2) throw new TomeowlError("Incomplete memory schema", "SCHEMA_VERSION");
  const versions = db.query("SELECT version FROM tomeowl_memory_meta").all() as Array<{ version: number }>;
  if (versions.length !== 1 || versions[0].version !== 1) throw new TomeowlError("Unsupported or malformed memory schema version", "SCHEMA_VERSION");
  return true;
}
function ensureMemorySchema(db: Database): void {
  if (memorySchema(db)) return;
  const hasCatalog = db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tomeowl_meta'").get();
  if (!hasCatalog) throw new TomeowlError("Memory requires a Tomeowl catalog", "DATABASE_NOT_TOMEOWL");
  const versions = db.query("SELECT version FROM tomeowl_meta").all() as Array<{ version: number }>;
  if (versions.length !== 1 || versions[0].version !== 1) throw new TomeowlError("Unsupported catalog schema version", "SCHEMA_VERSION");
  db.exec(`CREATE TABLE tomeowl_memory_meta(version INTEGER NOT NULL);
    INSERT INTO tomeowl_memory_meta VALUES(1);
    CREATE TABLE ${TABLE}(
      namespace TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('fact','preference','decision','procedure')),
      body TEXT NOT NULL, author TEXT NOT NULL, origin TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','superseded','retracted')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT, supersedes TEXT,
      evidence TEXT NOT NULL, PRIMARY KEY(namespace,id)
    );
    CREATE INDEX tomeowl_memory_recall ON ${TABLE}(namespace,status,updated_at);
    CREATE UNIQUE INDEX tomeowl_memory_successor ON ${TABLE}(namespace,supersedes) WHERE supersedes IS NOT NULL;`);
}
function normalize(input: MemoryInput): MemoryInput & { id: string; evidence: MemoryCitation[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TomeowlError("Memory input must be an object", "INVALID_MEMORY");
  boundedText(input.namespace, "namespace", 256);
  if (!KINDS.includes(input.kind)) throw new TomeowlError("kind must be fact, preference, decision, or procedure", "INVALID_MEMORY");
  boundedText(input.text, "text", 8000);
  boundedText(input.author, "author", 256);
  boundedText(input.origin, "origin", 256);
  const id = input.id === undefined ? randomUUID() : boundedText(input.id, "id", 256);
  const evidence = input.evidence ?? [];
  if (!Array.isArray(evidence) || evidence.length > 8) throw new TomeowlError("A memory may capture at most eight citations", "INVALID_MEMORY");
  for (const citation of evidence) {
    if (!citation || typeof citation !== "object") throw new TomeowlError("Citation must be an object", "INVALID_MEMORY");
    boundedText(citation.chunkId, "chunkId", 256);
    boundedText(citation.quote, "quote", 4000);
    if (citation.sourceId !== undefined) boundedText(citation.sourceId, "sourceId", 256);
    if (citation.revision !== undefined) boundedText(citation.revision, "revision", 256);
  }
  if (new Set(evidence.map(item => `${item.chunkId}\0${item.quote}`)).size !== evidence.length)
    throw new TomeowlError("Duplicate citation", "INVALID_MEMORY");
  return { ...input, id, evidence, ...(input.expiresAt === undefined ? {} : { expiresAt: timestamp(input.expiresAt, "expiresAt") }) };
}
function decode(row: any, now: string): MemoryRecord {
  return {
    id: row.id, namespace: row.namespace, kind: row.kind, text: row.body, author: row.author, origin: row.origin,
    basis: JSON.parse(row.evidence).length ? "cited" : "authored", status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
    ...(row.supersedes === null ? {} : { supersedes: row.supersedes }),
    evidence: JSON.parse(row.evidence), expired: row.expires_at !== null && row.expires_at <= now
  };
}
function find(db: Database, namespace: string, id: string, now: string): MemoryRecord | null {
  const row = db.query(`SELECT * FROM ${TABLE} WHERE namespace=? AND id=?`).get(namespace, id);
  return row ? decode(row, now) : null;
}
function matches(record: MemoryRecord, input: ReturnType<typeof normalize>, supersedes?: string): boolean {
  return record.kind === input.kind && record.text === input.text && record.author === input.author && record.origin === input.origin &&
    record.expiresAt === input.expiresAt && record.supersedes === supersedes && record.evidence.length === input.evidence.length &&
    record.evidence.every((citation, index) => {
      const requested = input.evidence[index];
      return citation.chunkId === requested.chunkId && citation.quote === requested.quote &&
        (requested.sourceId === undefined || citation.sourceId === requested.sourceId) &&
        (requested.revision === undefined || citation.revision === requested.revision);
    });
}
function capture(db: Database, citations: MemoryCitation[]): CapturedMemoryEvidence[] {
  return citations.map(citation => {
    const row = db.query(`SELECT c.source_id sourceId,c.revision,c.body,c.locator,s.title,s.path,s.collection
      FROM chunks c JOIN sources s ON s.id=c.source_id AND s.revision=c.revision WHERE c.id=?`).get(citation.chunkId) as any;
    if (!row || (citation.sourceId !== undefined && row.sourceId !== citation.sourceId) ||
      (citation.revision !== undefined && row.revision !== citation.revision) || !row.body.includes(citation.quote))
      throw new TomeowlError("Citation must quote the referenced current indexed chunk", "INVALID_MEMORY_EVIDENCE");
    // Capture the verified quote and locator independently of the replaceable source tables.
    boundedText(row.sourceId, "evidence sourceId", 256);
    boundedText(row.revision, "evidence revision", 256);
    boundedText(row.title, "evidence title", 1000);
    boundedText(row.path, "evidence path", 4096);
    boundedText(row.collection, "evidence collection", 256);
    if (typeof row.locator !== "string" || row.locator.length > 256) throw new TomeowlError("Invalid evidence locator", "INVALID_MEMORY_EVIDENCE");
    let locator: Locator;
    try { locator = JSON.parse(row.locator); } catch { throw new TomeowlError("Invalid evidence locator", "INVALID_MEMORY_EVIDENCE"); }
    if (!locator || typeof locator !== "object" || Array.isArray(locator) || Object.entries(locator).some(([key, value]) =>
      !["lineStart", "lineEnd", "startSeconds", "endSeconds"].includes(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0))
      throw new TomeowlError("Invalid evidence locator", "INVALID_MEMORY_EVIDENCE");
    return { sourceId: row.sourceId, revision: row.revision, chunkId: citation.chunkId, quote: citation.quote,
      locator, title: row.title, path: row.path, collection: row.collection };
  });
}
function insert(db: Database, input: ReturnType<typeof normalize>, now: string, supersedes?: string): MemoryRecord {
  const existing = find(db, input.namespace, input.id, now);
  if (existing) {
    if (matches(existing, input, supersedes)) return existing;
    throw new TomeowlError("Memory ID already has different content", "MEMORY_CONFLICT");
  }
  const evidence = capture(db, input.evidence);
  db.query(`INSERT INTO ${TABLE}(namespace,id,kind,body,author,origin,status,created_at,updated_at,expires_at,supersedes,evidence)
    VALUES(?,?,?,?,?,?,'active',?,?,?,?,?)`).run(input.namespace, input.id, input.kind, input.text, input.author, input.origin,
      now, now, input.expiresAt ?? null, supersedes ?? null, JSON.stringify(evidence));
  return find(db, input.namespace, input.id, now)!;
}

/** Explicit acceptance only. Citations establish provenance, not assertion truth. */
export function addMemory(db: Database, input: MemoryInput, nowValue?: string): MemoryRecord {
  const normalized = normalize(input), now = timestamp(nowValue);
  return db.transaction(() => { ensureMemorySchema(db); return insert(db, normalized, now); })();
}

/** Read operations never initialize memory tables or update expiry/status. */
export function getMemory(db: Database, namespace: string, id: string, nowValue?: string): MemoryRecord {
  boundedText(namespace, "namespace", 256); boundedText(id, "id", 256);
  const now = timestamp(nowValue), record = memorySchema(db) ? find(db, namespace, id, now) : null;
  if (!record) throw new TomeowlError("Memory not found in this namespace", "NOT_FOUND");
  return record;
}

function measure(packet: MemoryRecall): number {
  // Account for the CLI success envelope, final newline, and the bytes field itself.
  let previous = -1;
  while (packet.used.bytes !== previous) {
    previous = packet.used.bytes;
    packet.used.bytes = Buffer.byteLength(JSON.stringify({ ok: true, ...packet }) + "\n", "utf8");
  }
  return packet.used.bytes;
}
export function recallMemory(db: Database, options: MemoryRecallOptions): MemoryRecall {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TomeowlError("Memory recall options must be an object", "INVALID_MEMORY");
  boundedText(options.namespace, "namespace", 256);
  const limit = integer(options.limit ?? 20, "limit", 1, 100);
  const maxBytes = integer(options.maxBytes ?? 65536, "maxBytes", 2048, 1048576);
  const status = options.status ?? "active", now = timestamp(options.now);
  if (status !== "all" && !STATUSES.includes(status)) throw new TomeowlError("status must be active, superseded, retracted, or all", "INVALID_MEMORY");
  if (options.includeExpired !== undefined && typeof options.includeExpired !== "boolean") throw new TomeowlError("includeExpired must be boolean", "INVALID_MEMORY");
  const clauses = ["namespace=?"], values: Array<string | number> = [options.namespace];
  if (status !== "all") { clauses.push("status=?"); values.push(status); }
  if (!options.includeExpired) { clauses.push("(expires_at IS NULL OR expires_at>?)"); values.push(now); }
  if (options.query !== undefined) {
    boundedText(options.query, "query", 2000);
    // A literal, case-sensitive substring filter; this is intentionally not semantic recall.
    clauses.push("instr(body,?)>0"); values.push(options.query);
  }
  const packet: MemoryRecall = { schemaVersion: 1, namespace: options.namespace, memories: [], truncated: false,
    limits: { limit, maxBytes }, used: { memories: 0, bytes: 0 }, omissions: [] };
  const rows = memorySchema(db) ? db.query(`SELECT * FROM ${TABLE} WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC,id LIMIT ?`).all(...values, limit + 1) : [];
  if (rows.length > limit) { packet.truncated = true; packet.omissions.push("Additional matching memories omitted by limit."); }
  for (const row of rows.slice(0, limit)) {
    const record = decode(row, now);
    packet.memories.push(record); packet.used.memories++;
    // Reserve the possible budget-omission notice before accepting a full record.
    const candidate = { ...packet, used: { ...packet.used }, truncated: true,
      omissions: [...packet.omissions, "Whole memories omitted by byte budget; use memory show for a specific record."] };
    if (measure(candidate) > maxBytes) {
      packet.memories.pop(); packet.used.memories--;
      packet.truncated = true; packet.omissions.push("Whole memories omitted by byte budget; use memory show for a specific record.");
      break;
    }
  }
  measure(packet);
  return packet;
}

/** Correction appends a successor and supersedes its predecessor in one transaction. */
export function supersedeMemory(db: Database, namespace: string, id: string,
  replacement: Omit<MemoryInput, "namespace">, nowValue?: string): MemoryRecord {
  boundedText(namespace, "namespace", 256); boundedText(id, "id", 256);
  const input = normalize({ ...replacement, namespace }), now = timestamp(nowValue);
  if (input.id === id) throw new TomeowlError("A correction must have a different ID", "MEMORY_CONFLICT");
  return db.transaction(() => {
    ensureMemorySchema(db);
    const previous = find(db, namespace, id, now);
    if (!previous) throw new TomeowlError("Memory not found in this namespace", "NOT_FOUND");
    if (previous.status !== "active") {
      const successor = find(db, namespace, input.id, now);
      if (previous.status === "superseded" && successor && matches(successor, input, id)) return successor;
      throw new TomeowlError("Only an active memory may be corrected", "MEMORY_CONFLICT");
    }
    const successor = insert(db, input, now, id);
    db.query(`UPDATE ${TABLE} SET status='superseded',updated_at=? WHERE namespace=? AND id=?`).run(now, namespace, id);
    return successor;
  })();
}
export function retractMemory(db: Database, namespace: string, id: string, nowValue?: string): MemoryRecord {
  boundedText(namespace, "namespace", 256); boundedText(id, "id", 256);
  const now = timestamp(nowValue);
  return db.transaction(() => {
    ensureMemorySchema(db);
    const record = find(db, namespace, id, now);
    if (!record) throw new TomeowlError("Memory not found in this namespace", "NOT_FOUND");
    if (record.status === "superseded") throw new TomeowlError("Retract the active successor instead", "MEMORY_CONFLICT");
    if (record.status !== "retracted") db.query(`UPDATE ${TABLE} SET status='retracted',updated_at=? WHERE namespace=? AND id=?`).run(now, namespace, id);
    return find(db, namespace, id, now)!;
  })();
}

/** Logical deletion covers these owned records and captured quotes, not originals or backups. */
export function forgetMemory(db: Database, namespace: string, id: string, options: { history?: boolean } = {}): {
  namespace: string; deletedIds: string[]; deletedRecords: number; capturedEvidenceCopies: number; scope: "memory-records-only";
} {
  boundedText(namespace, "namespace", 256); boundedText(id, "id", 256);
  if (options.history !== undefined && typeof options.history !== "boolean") throw new TomeowlError("history must be boolean", "INVALID_MEMORY");
  return db.transaction(() => {
    ensureMemorySchema(db);
    let cursor = id;
    if (!db.query(`SELECT 1 FROM ${TABLE} WHERE namespace=? AND id=?`).get(namespace, id)) throw new TomeowlError("Memory not found in this namespace", "NOT_FOUND");
    const visited = new Set<string>();
    if (options.history !== false) while (true) {
      if (visited.has(cursor) || visited.size >= MAX_HISTORY) throw new TomeowlError("Memory history exceeds traversal limit or contains a cycle", "MEMORY_HISTORY_LIMIT");
      visited.add(cursor);
      const row = db.query(`SELECT supersedes FROM ${TABLE} WHERE namespace=? AND id=?`).get(namespace, cursor) as { supersedes: string | null };
      if (!row.supersedes) break;
      cursor = row.supersedes;
    }
    const rows = options.history === false
      ? db.query(`SELECT id,json_array_length(evidence) copies FROM ${TABLE} WHERE namespace=? AND id=?`).all(namespace, id) as Array<{ id: string; copies: number }>
      : db.query(`WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT m.id FROM ${TABLE} m JOIN history h ON m.supersedes=h.id WHERE m.namespace=? LIMIT ?)
        SELECT m.id,json_array_length(m.evidence) copies FROM history h JOIN ${TABLE} m ON m.id=h.id AND m.namespace=? ORDER BY m.created_at,m.id`)
        .all(cursor, namespace, MAX_HISTORY + 1, namespace) as Array<{ id: string; copies: number }>;
    if (rows.length > MAX_HISTORY) throw new TomeowlError("Memory history exceeds deletion limit", "MEMORY_HISTORY_LIMIT");
    for (const row of rows) {
      db.query(`UPDATE ${TABLE} SET supersedes=NULL WHERE namespace=? AND supersedes=?`).run(namespace, row.id);
      db.query(`DELETE FROM ${TABLE} WHERE namespace=? AND id=?`).run(namespace, row.id);
    }
    return { namespace, deletedIds: rows.map(row => row.id), deletedRecords: rows.length,
      capturedEvidenceCopies: rows.reduce((sum, row) => sum + row.copies, 0), scope: "memory-records-only" };
  })();
}
