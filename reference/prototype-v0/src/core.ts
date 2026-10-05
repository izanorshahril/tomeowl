import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const SCHEMA_VERSION = 1;
const SCOPE = "prototype";
const MAX_TRANSCRIPTS = 40;
const MAX_PROJECT_ROOTS = 8;
const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024;
const MAX_PROJECT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_INGEST_BYTES = 32 * 1024 * 1024;
const MAX_SNIPPETS = 25_000;
const MAX_CHUNKS = 200_000;
const MAX_CHUNK_CHARS = 20_000;
const MAX_WARNINGS = 100;
const MAX_EVIDENCE_PER_EDGE = 100;

const TOPICS = [
  { id: "topic:qmd", label: "QMD", group: "tools", patterns: [/\bqmd\b/i] },
  { id: "topic:gbrain", label: "GBrain", group: "tools", patterns: [/\bg[ -]?brain\b/i] },
  { id: "topic:graphify", label: "Graphify", group: "tools", patterns: [/\bgraphify\b/i] },
  { id: "topic:skills", label: "Skills", group: "practice", patterns: [/\bskills?\b/i] },
  {
    id: "topic:memory",
    label: "Memory",
    group: "practice",
    patterns: [/\bmemor(?:y|ies)\b/i, /\bsecond[ -]brain\b/i, /\bknowledge[ -]base\b/i],
  },
  {
    id: "topic:orchestration",
    label: "Orchestration",
    group: "practice",
    patterns: [/\borchestrat(?:e|es|ed|ing|ion|or|ors)\b/i, /\bagent[ -]harness\b/i],
  },
] as const;

export type GraphKind = "video" | "topic" | "project" | "document";

export interface GraphEvidence {
  path: string;
  line?: number;
  start?: number;
  end?: number;
  text: string;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphKind;
  source?: string;
  url?: string;
  group?: string;
  summary?: string;
  excerpt?: string;
  topics?: string[];
  counts?: Record<string, number>;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  evidence: GraphEvidence[];
  evidenceCount?: number;
  note?: string;
}

export interface GraphData {
  schemaVersion: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: Record<string, unknown>;
  warnings: string[];
}

export interface IngestOptions {
  dbPath: string;
  transcriptRoot: string;
  limit?: number;
  projectRoots?: string[];
}

export interface IngestResult {
  schemaVersion: 1;
  imported: { videos: number; documents: number; chunks: number };
  warnings: string[];
  graph: GraphData;
}

export interface SearchResult {
  id: string;
  title: string;
  text: string;
  path: string;
  start?: number;
  end?: number;
  line?: number;
  url?: string;
  score: number;
}

interface ChunkInput {
  ordinal: number;
  line: number | null;
  start: number | null;
  end: number | null;
  text: string;
}

interface SourceInput {
  id: string;
  kind: "video" | "document";
  label: string;
  source: string;
  url: string | null;
  group: string;
  hash: string;
  summary: string;
  metadata: Record<string, unknown>;
  chunks: ChunkInput[];
}

interface SourceRow {
  id: string;
  kind: "video" | "document";
  label: string;
  source: string;
  url: string | null;
  group_key: string;
  content_hash: string;
  summary: string;
  metadata_json: string;
}

interface ChunkRow extends ChunkInput {
  id: number;
  source_id: string;
}

interface ReadFileResult {
  path: string;
  bytes: Buffer;
  text: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'document')),
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  group_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_chunks (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  line INTEGER,
  start REAL,
  end REAL,
  text TEXT NOT NULL,
  UNIQUE (source_id, ordinal)
);
CREATE INDEX IF NOT EXISTS source_chunks_source_order ON source_chunks(source_id, ordinal);
CREATE VIRTUAL TABLE IF NOT EXISTS source_chunks_fts USING fts5(
  text,
  content='source_chunks',
  content_rowid='id',
  tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS source_chunks_ai AFTER INSERT ON source_chunks BEGIN
  INSERT INTO source_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS source_chunks_ad AFTER DELETE ON source_chunks BEGIN
  INSERT INTO source_chunks_fts(source_chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TABLE IF NOT EXISTS ingest_warnings (
  id INTEGER PRIMARY KEY,
  message TEXT NOT NULL
);
`;

function addWarning(warnings: string[], message: string): void {
  if (warnings.length < MAX_WARNINGS) warnings.push(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function realDirectory(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return undefined;
  return realpathSync(path);
}

function readUtf8File(path: string, root: string, maxBytes: number): ReadFileResult {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not a regular file");
  const realPath = realpathSync(path);
  if (!isWithin(root, realPath)) throw new Error("file escaped its source root");
  if (stat.size > maxBytes) throw new Error(`file exceeds ${maxBytes} byte limit`);
  const bytes = readFileSync(realPath);
  if (bytes.byteLength > maxBytes) throw new Error(`file exceeds ${maxBytes} byte limit`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { path: realPath, bytes, text };
}

function transcriptDirectory(input: string): string {
  const root = realDirectory(resolve(input));
  if (!root) throw new Error(`transcriptRoot must be an existing local directory: ${input}`);
  const candidates = [
    basename(root).toLowerCase() === "robonuggets" ? root : "",
    join(root, "RoboNuggets"),
    join(root, "transcripts", "RoboNuggets"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const directory = realDirectory(candidate);
    if (directory) return directory;
  }
  throw new Error(`RoboNuggets transcript directory was not found below: ${root}`);
}

function defaultProjectRoots(channelRoot: string): string[] {
  const transcriptsRoot = dirname(channelRoot);
  const viberavenRoot = dirname(transcriptsRoot);
  if (basename(transcriptsRoot).toLowerCase() !== "transcripts" || basename(viberavenRoot).toLowerCase() !== "viberaven") {
    return [];
  }
  const devRoot = dirname(viberavenRoot);
  return ["viberaven", "tokenmill", "firstmate"].map((name) => join(devRoot, name)).filter((path) => !!realDirectory(path));
}

function validVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{6,20}$/.test(value);
}

function asFinite(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function firstText(chunks: ChunkInput[]): string {
  return chunks.map((chunk) => chunk.text).join(" ").replace(/\s+/g, " ").slice(0, 500);
}

function parseTranscript(file: ReadFileResult, directoryId: string, warnings: string[]): SourceInput | undefined {
  let value: unknown;
  try {
    value = JSON.parse(file.text);
  } catch {
    addWarning(warnings, `Skipped malformed transcript JSON: ${file.path}`);
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    addWarning(warnings, `Skipped transcript with invalid root object: ${file.path}`);
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.video_id !== directoryId || !validVideoId(directoryId)) {
    addWarning(warnings, `Skipped transcript whose video_id does not match its folder: ${file.path}`);
    return undefined;
  }
  if (!Array.isArray(record.snippets) || record.snippets.length > MAX_SNIPPETS) {
    addWarning(warnings, `Skipped transcript with invalid or excessive snippets: ${file.path}`);
    return undefined;
  }

  const chunks: ChunkInput[] = [];
  for (let index = 0; index < record.snippets.length; index++) {
    const snippet = record.snippets[index];
    if (!snippet || typeof snippet !== "object" || Array.isArray(snippet)) continue;
    const caption = snippet as Record<string, unknown>;
    if (typeof caption.text !== "string" || caption.text.trim().length === 0 || caption.text.length > MAX_CHUNK_CHARS) continue;
    const start = asFinite(caption.start);
    const duration = asFinite(caption.duration);
    const suppliedEnd = asFinite(caption.end);
    const end = suppliedEnd ?? (start !== null && duration !== null ? start + duration : null);
    if (start === null || start < 0 || end === null || end < start) continue;
    chunks.push({ ordinal: index + 1, line: null, start, end, text: caption.text });
  }
  if (chunks.length === 0) {
    addWarning(warnings, `Skipped transcript without valid timestamped text: ${file.path}`);
    return undefined;
  }
  if (chunks.length !== record.snippets.length) {
    addWarning(warnings, `Transcript had ${record.snippets.length - chunks.length} invalid or oversized snippets: ${file.path}`);
  }

  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : directoryId;
  const duration = asFinite(record.duration_seconds);
  const videoUrl = `https://www.youtube.com/watch?v=${directoryId}`;
  return {
    id: `video:${directoryId}`,
    kind: "video",
    label: title,
    source: file.path,
    url: videoUrl,
    group: "RoboNuggets",
    hash: sha256(file.bytes),
    summary: firstText(chunks),
    metadata: {
      videoId: directoryId,
      author: typeof record.author_name === "string" ? record.author_name : null,
      language: typeof record.language_code === "string" ? record.language_code : null,
      generated: typeof record.is_generated === "boolean" ? record.is_generated : null,
      publishedAt: typeof record.published_at === "string" ? record.published_at : null,
      durationSeconds: duration,
      snippetCount: chunks.length,
    },
    chunks,
  };
}

function loadTranscripts(channelRoot: string, limit: number, warnings: string[], totalBytes: { value: number }): SourceInput[] {
  const directories = readdirSync(channelRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && validVideoId(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
  const prioritized = directories.includes("VoKiKvgpk78")
    ? ["VoKiKvgpk78", ...directories.filter((id) => id !== "VoKiKvgpk78")]
    : directories;

  const sources: SourceInput[] = [];
  for (const id of prioritized.slice(0, limit)) {
    const folder = join(channelRoot, id);
    const realFolder = realDirectory(folder);
    if (!realFolder || !isWithin(channelRoot, realFolder)) {
      addWarning(warnings, `Skipped non-local transcript folder: ${folder}`);
      continue;
    }
    const path = join(realFolder, "transcript.json");
    try {
      const file = readUtf8File(path, channelRoot, MAX_TRANSCRIPT_BYTES);
      if (totalBytes.value + file.bytes.byteLength > MAX_INGEST_BYTES) {
        addWarning(warnings, `Skipped transcript after total ingest byte limit: ${file.path}`);
        continue;
      }
      totalBytes.value += file.bytes.byteLength;
      const source = parseTranscript(file, id, warnings);
      if (source) sources.push(source);
    } catch (error) {
      addWarning(warnings, `Skipped transcript ${path}: ${error instanceof Error ? error.message : "read failed"}`);
    }
  }
  return sources;
}

function projectDocuments(roots: string[], warnings: string[], totalBytes: { value: number }): SourceInput[] {
  if (roots.length > MAX_PROJECT_ROOTS) throw new Error(`projectRoots is limited to ${MAX_PROJECT_ROOTS} entries`);
  const seenRoots = new Set<string>();
  const sources: SourceInput[] = [];

  for (const requestedRoot of roots) {
    const root = realDirectory(resolve(requestedRoot));
    if (!root) {
      addWarning(warnings, `Skipped missing project root: ${requestedRoot}`);
      continue;
    }
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);

    const projectLabel = basename(root);
    const projectId = projectLabel.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    const names = ["README.md", "Cargo.toml", "package.json"];
    let projectSourceCount = 0;
    for (const name of names) {
      const path = join(root, name);
      if (!existsSync(path)) continue;
      try {
        const file = readUtf8File(path, root, MAX_PROJECT_FILE_BYTES);
        if (totalBytes.value + file.bytes.byteLength > MAX_INGEST_BYTES) {
          addWarning(warnings, `Skipped project file after total ingest byte limit: ${file.path}`);
          continue;
        }
        totalBytes.value += file.bytes.byteLength;
        const lines = file.text.split(/\r\n|\n|\r/);
        const chunks = lines.flatMap((text, index) => text.trim() && text.length <= MAX_CHUNK_CHARS
          ? [{ ordinal: index + 1, line: index + 1, start: null, end: null, text }]
          : []);
        const kind = "document" as const;
        const docName = name.toLowerCase();
        sources.push({
          id: `document:${projectId}:${docName}`,
          kind,
          label: name,
          source: file.path,
          url: null,
          group: projectId,
          hash: sha256(file.bytes),
          summary: file.text.slice(0, 500),
          metadata: { projectId, projectLabel, projectRoot: root, fileName: name },
          chunks,
        });
        projectSourceCount++;
      } catch (error) {
        addWarning(warnings, `Skipped project file ${path}: ${error instanceof Error ? error.message : "read failed"}`);
      }
    }
    if (projectSourceCount === 0) addWarning(warnings, `No README.md, Cargo.toml, or package.json found in: ${root}`);
  }
  return sources;
}

function openDatabase(dbPath: string, readonly = false): Database {
  if (typeof dbPath !== "string" || !dbPath.trim()) throw new Error("dbPath is required");
  const path = resolve(dbPath);
  if (readonly && !existsSync(path)) throw new Error(`Database not found; ingest sources first: ${path}`);
  if (!readonly) mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, readonly ? { readonly: true } : { create: true });
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (!readonly) db.exec("PRAGMA journal_mode = WAL;");
    const versionRow = db.query("PRAGMA user_version").get() as { user_version?: number } | null;
    const currentVersion = Number(versionRow?.user_version ?? 0);
    if (currentVersion > SCHEMA_VERSION) throw new Error(`database schema ${currentVersion} is newer than supported schema ${SCHEMA_VERSION}`);
    if (readonly) { if (currentVersion !== SCHEMA_VERSION) throw new Error('Database has not been initialized by Tomeowl'); return db; }
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function replacePrototypeSources(db: Database, sources: SourceInput[], warnings: string[]): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.query(`DELETE FROM source_chunks WHERE source_id IN (SELECT id FROM source_documents WHERE scope = ?)`)
      .run(SCOPE);
    db.query("DELETE FROM source_documents WHERE scope = ?").run(SCOPE);
    db.query("DELETE FROM ingest_warnings").run();

    const insertSource = db.query(`
      INSERT INTO source_documents
        (id, scope, kind, label, source, url, group_key, content_hash, summary, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertChunk = db.query(`
      INSERT INTO source_chunks(source_id, ordinal, line, start, end, text)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const source of sources) {
      insertSource.run(source.id, SCOPE, source.kind, source.label, source.source, source.url, source.group,
        source.hash, source.summary, JSON.stringify(source.metadata));
      for (const chunk of source.chunks) {
        insertChunk.run(source.id, chunk.ordinal, chunk.line, chunk.start, chunk.end, chunk.text);
      }
    }
    const insertWarning = db.query("INSERT INTO ingest_warnings(message) VALUES (?)");
    for (const warning of warnings.slice(0, MAX_WARNINGS)) insertWarning.run(warning);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  }
}

function validateLimit(value: number | undefined, fallback: number, maximum: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  return limit;
}

export function ingest(options: IngestOptions): IngestResult {
  const limit = validateLimit(options.limit, MAX_TRANSCRIPTS, MAX_TRANSCRIPTS, "limit");
  const channelRoot = transcriptDirectory(options.transcriptRoot);
  const warnings: string[] = [];
  const totalBytes = { value: 0 };
  const transcripts = loadTranscripts(channelRoot, limit, warnings, totalBytes);
  const projectRoots = options.projectRoots ?? defaultProjectRoots(channelRoot);
  const projects = projectDocuments(projectRoots, warnings, totalBytes);
  const sources = [...transcripts, ...projects];
  const chunks = sources.reduce((count, source) => count + source.chunks.length, 0);
  if (chunks > MAX_CHUNKS) throw new Error(`ingest exceeds ${MAX_CHUNKS} chunk limit`);

  const db = openDatabase(options.dbPath);
  try {
    replacePrototypeSources(db, sources, warnings);
  } finally {
    db.close();
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    imported: {
      videos: transcripts.length,
      documents: projects.length,
      chunks,
    },
    warnings,
    graph: map(options.dbPath),
  };
}

function termsFor(query: string): string[] {
  if (typeof query !== "string" || query.length > 500) throw new Error("query must be a string of at most 500 characters");
  return [...new Set(query.match(/[\p{L}\p{N}_]+/gu) ?? [])].slice(0, 32);
}

function timestampUrl(url: string | null, start: number | null): string | undefined {
  if (!url) return undefined;
  if (start === null) return url;
  return `${url}&t=${Math.max(0, Math.floor(start))}s`;
}

export function search(dbPath: string, query: string, limit?: number): { results: SearchResult[]; warnings: string[] } {
  const boundedLimit = validateLimit(limit, 20, 100, "limit");
  const terms = termsFor(query);
  if (terms.length === 0) return { results: [], warnings: [] };
  const expression = terms.map((term) => term.toLowerCase()==='gbrain' ? '("gbrain" OR "g brain")' : `"${term.replaceAll('"', '""')}"`).join(" OR ");
  const db = openDatabase(dbPath,true);
  try {
    const rows = db.query(`
      SELECT d.id AS source_id, d.label AS title, d.source AS path, d.url,
             c.id AS chunk_id, c.line, c.start, c.end, c.text,
             bm25(source_chunks_fts) AS rank
      FROM source_chunks_fts
      JOIN source_chunks c ON c.id = source_chunks_fts.rowid
      JOIN source_documents d ON d.id = c.source_id
      WHERE source_chunks_fts MATCH ? AND d.scope = ?
      ORDER BY rank, d.label COLLATE NOCASE, c.ordinal
      LIMIT ?
    `).all(expression, SCOPE, boundedLimit) as Array<{
      source_id: string; title: string; path: string; url: string | null; chunk_id: number;
      line: number | null; start: number | null; end: number | null; text: string; rank: number;
    }>;
    return {
      results: rows.map((row) => ({
        id: `chunk:${row.source_id}:${row.chunk_id}`,
        title: row.title,
        text: row.text,
        path: row.path,
        ...(row.start === null ? {} : { start: row.start }),
        ...(row.end === null ? {} : { end: row.end }),
        ...(row.line === null ? {} : { line: row.line }),
        ...(timestampUrl(row.url, row.start) ? { url: timestampUrl(row.url, row.start) } : {}),
        score: -Number(row.rank),
      })),
      warnings: [],
    };
  } finally {
    db.close();
  }
}

interface MutableEdge extends GraphEdge {
  evidenceKeys: Set<string>;
}

function matches(text: string): typeof TOPICS[number][] {
  return TOPICS.filter((topic) => topic.patterns.some((pattern) => pattern.test(text)));
}

function metadataOf(row: SourceRow): Record<string, unknown> {
  try {
    const value = JSON.parse(row.metadata_json) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function evidenceFor(row: SourceRow, chunk: ChunkRow): GraphEvidence {
  return {
    path: row.source,
    ...(chunk.line === null ? {} : { line: chunk.line }),
    ...(chunk.start === null ? {} : { start: chunk.start }),
    ...(chunk.end === null ? {} : { end: chunk.end }),
    text: chunk.text.slice(0, 500),
  };
}

function edgeKey(kind: string, source: string, target: string): string {
  return `${kind}:${source}->${target}`;
}

export function map(dbPath: string): GraphData {
  const db = openDatabase(dbPath,true);
  try {
    const sourceRows = db.query(`
      SELECT id, kind, label, source, url, group_key, content_hash, summary, metadata_json
      FROM source_documents WHERE scope = ? ORDER BY id
    `).all(SCOPE) as SourceRow[];
    const chunkRows = db.query(`
      SELECT id, source_id, ordinal, line, start, end, text
      FROM source_chunks ORDER BY source_id, ordinal
    `).all() as ChunkRow[];
    const warnings = (db.query("SELECT message FROM ingest_warnings ORDER BY id").all() as Array<{ message: string }>)
      .map((row) => row.message);

    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, MutableEdge>();
    const rowsById = new Map(sourceRows.map((row) => [row.id, row]));
    const chunksBySource = new Map<string, ChunkRow[]>();
    for (const chunk of chunkRows) {
      const existing = chunksBySource.get(chunk.source_id) ?? [];
      existing.push(chunk);
      chunksBySource.set(chunk.source_id, existing);
    }
    const addEdge = (kind: string, source: string, target: string, evidence: GraphEvidence, note?: string) => {
      const id = edgeKey(kind, source, target);
      let edge = edges.get(id);
      if (!edge) {
        edge = { id, source, target, kind, evidence: [], evidenceCount: 0, evidenceKeys: new Set(), ...(note ? { note } : {}) };
        edges.set(id, edge);
      }
      const key = `${evidence.path}\0${evidence.line ?? ""}\0${evidence.start ?? ""}\0${evidence.text}`;
      if (!edge.evidenceKeys.has(key)) {
        edge.evidenceKeys.add(key);
        edge.evidenceCount = (edge.evidenceCount ?? 0) + 1;
        if (edge.evidence.length < MAX_EVIDENCE_PER_EDGE) edge.evidence.push(evidence);
      }
    };

    const projectInfo = new Map<string, { label: string; root: string; source: string; summary: string; documentCount: number }>();
    for (const row of sourceRows) {
      const chunks = chunksBySource.get(row.id) ?? [];
      const metadata = metadataOf(row);
      if (row.kind === "video") {
        nodes.set(row.id, {
          id: row.id,
          label: row.label,
          kind: "video",
          source: row.source,
          ...(row.url ? { url: row.url } : {}),
          group: row.group_key,
          summary: row.summary.slice(0, 500),
          excerpt: row.summary.slice(0, 500),
          counts: { segments: chunks.length, topicMentions: 0 },
          topics: [],
          ...metadata,
        });
        continue;
      }

      const projectId = String(metadata.projectId ?? row.group_key);
      const projectLabel = String(metadata.projectLabel ?? projectId);
      const projectRoot = String(metadata.projectRoot ?? dirname(row.source));
      let project = projectInfo.get(projectId);
      if (!project) {
        project = { label: projectLabel, root: projectRoot, source: row.source, summary: "", documentCount: 0 };
        projectInfo.set(projectId, project);
      }
      project.documentCount++;
      const fileName = String(metadata.fileName ?? basename(row.source));
      if (fileName.toLowerCase() === "readme.md" || !project.summary) {
        project.source = row.source;
        project.summary = row.summary.slice(0, 500);
      }
      nodes.set(row.id, {
        id: row.id,
        label: row.label,
        kind: "document",
        source: row.source,
        group: projectId,
        summary: row.summary.slice(0, 500),
        excerpt: row.summary.slice(0, 500),
        counts: { lines: chunks.length, topicMentions: 0 },
        topics: [],
        ...metadata,
      });
      addEdge("contains", `project:${projectId}`, row.id, {
        path: row.source,
        line: chunks[0]?.line ?? 1,
        text: chunks[0]?.text.slice(0, 500) ?? row.summary.slice(0, 500),
      });
    }
    for (const [id, project] of projectInfo) {
      nodes.set(`project:${id}`, {
        id: `project:${id}`,
        label: project.label,
        kind: "project",
        source: project.source,
        group: id,
        summary: project.summary.slice(0, 500),
        excerpt: project.summary.slice(0, 500),
        counts: { documents: project.documentCount, topicMentions: 0 },
      });
    }
    for (const topic of TOPICS) {
      nodes.set(topic.id, {
        id: topic.id,
        label: topic.label,
        kind: "topic",
        group: topic.group,
        counts: { mentions: 0, sources: 0 },
      });
    }

    const topicSources = new Map<string, Set<string>>();
    const sourceTopicLabels = new Map<string, Set<string>>();
    for (const chunk of chunkRows) {
      const row = rowsById.get(chunk.source_id);
      if (!row) continue;
      const sourceNode = row.id;
      const found = matches(chunk.text);
      if (found.length === 0) continue;
      const evidence = evidenceFor(row, chunk);
      const sourceTopics = sourceTopicLabels.get(sourceNode) ?? new Set<string>();
      for (const topic of found) {
        addEdge("mentions_topic", sourceNode, topic.id, evidence);
        sourceTopics.add(topic.label);
        const topicNode = nodes.get(topic.id)!;
        topicNode.counts!.mentions++;
        const topicDocs = topicSources.get(topic.id) ?? new Set<string>();
        topicDocs.add(sourceNode);
        topicSources.set(topic.id, topicDocs);
        const sourceGraphNode = nodes.get(sourceNode);
        if (sourceGraphNode) sourceGraphNode.counts!.topicMentions++;
      }
      sourceTopicLabels.set(sourceNode, sourceTopics);

      const tools = found.filter((topic) => topic.group === "tools");
      for (let left = 0; left < tools.length; left++) {
        for (let right = left + 1; right < tools.length; right++) {
          const [a, b] = [tools[left]!, tools[right]!].sort((x, y) => x.id.localeCompare(y.id));
          addEdge("co_mentioned", a.id, b.id, evidence,
            "Both terms appear in this source span; co-mention does not establish an integration.");
        }
      }
    }

    for (const topic of TOPICS) {
      const node = nodes.get(topic.id)!;
      node.counts!.sources = topicSources.get(topic.id)?.size ?? 0;
    }
    for (const [sourceId, labels] of sourceTopicLabels) {
      const node = nodes.get(sourceId);
      if (node) node.topics = [...labels].sort((a, b) => a.localeCompare(b, "en"));
    }

    const nodeList = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
    const edgeList = [...edges.values()].map(({ evidenceKeys: _keys, ...edge }) => ({
      ...edge,
      evidence: edge.evidence.sort((a, b) => a.path.localeCompare(b.path, "en") ||
        (a.line ?? a.start ?? 0) - (b.line ?? b.start ?? 0)),
    })).sort((a, b) => a.id.localeCompare(b.id, "en"));
    const byKind: Record<string, number> = { video: 0, topic: 0, project: 0, document: 0 };
    for (const node of nodeList) byKind[node.kind]++;
    const mentionEdges = edgeList.filter((edge) => edge.kind === "mentions_topic");
    const coMentionEdges = edgeList.filter((edge) => edge.kind === "co_mentioned");
    if (sourceRows.length === 0 && !warnings.some((warning) => warning.includes("No prototype sources"))) {
      warnings.push("No prototype sources are ingested yet.");
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      nodes: nodeList,
      edges: edgeList,
      stats: {
        sources: sourceRows.length,
        chunks: chunkRows.length,
        nodes: nodeList.length,
        edges: edgeList.length,
        byKind,
        topicMentions: mentionEdges.reduce((total, edge) => total + (edge.evidenceCount ?? 0), 0),
        coMentions: coMentionEdges.reduce((total, edge) => total + (edge.evidenceCount ?? 0), 0),
      },
      warnings: warnings.slice(0, MAX_WARNINGS),
    };
  } finally {
    db.close();
  }
}
