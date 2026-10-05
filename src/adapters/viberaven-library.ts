import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { hash, TomeowlError, type Chunk, type Evidence, type Relation, type Source } from "../domain";
import { descriptionPassages, MEDIA_STOP_WORDS, parseArchivedVideo, transcriptPassages, type ArchivedVideo, type MediaPassage } from "./viberaven";
import { openExistingStore, openStore } from "../store";
import { projectMarkdown } from "./qmd";
import { renderSnapshot } from "../viewer/export";
import type { Snapshot, ViewerSource } from "../viewer/types";

const DEFAULT_DATABASE = "D:/Dev/viberaven/transcripts/manifest.sqlite3";
const DEFAULT_ROOT = "D:/Dev/viberaven/transcripts";
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_CUES = 100_000;
const MAX_RAW_ENTRIES = 500_000;
const MAX_VIEW = 400;
const OUTPUT_DB = "videos.sqlite";
const SOURCE_SCOPE = "records";

type RawFile = { path: string; size: number; mtimeMs: number; error?: string };
type RawCandidate = { folder: string; transcript?: RawFile; description?: RawFile };
type RawScan = { root: string; videos: Map<string, RawCandidate[]>; counts: { transcriptFiles: number; descriptionFiles: number; omissions: Record<string, number> } };
type DbVideo = Record<string, any> & { video_id: string };
type PendingRecord = { source: Source; chunk: Chunk; meta: Record<string, unknown>; body: string };
type PendingRelation = Relation;
type Decode = { video?: ArchivedVideo; text?: string; sha256?: string; error?: string; bytes?: number };

const omit = (counts: Record<string, number>, reason: string) => counts[reason] = (counts[reason] ?? 0) + 1;
const keyPath = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;
const inside = (path: string, root: string) => keyPath(path) === keyPath(root) || keyPath(path).startsWith(keyPath(root) + sep);

function canonicalFuturePath(path: string) {
  const missing: string[] = [];
  let ancestor = resolve(path);
  while (!existsSync(ancestor)) { missing.unshift(basename(ancestor)); const parent = dirname(ancestor); if (parent === ancestor) break; ancestor = parent; }
  return resolve(realpathSync(ancestor), ...missing);
}

function validateOutput(output: string, roots: string[]) {
  const path = resolve(output);
  try { lstatSync(path); throw new TomeowlError("Choose a new output directory; existing library outputs are not overwritten", "OUTPUT_EXISTS"); }
  catch (error) { if (error instanceof TomeowlError) throw error; if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const canonical = canonicalFuturePath(path);
  if (roots.some(root => inside(canonical, root))) throw new TomeowlError("Output must be outside every source directory", "INVALID_OUTPUT");
  return { path, canonical };
}

function writeReportFile(path: string, contents: string) {
  let exists = false;
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new TomeowlError("Library report must be a regular file", "INVALID_OUTPUT");
    exists = true;
  } catch (error) {
    if (error instanceof TomeowlError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  writeFileSync(path, contents, { flag: exists ? "w" : "wx" });
}

function list(directory: string, count: { value: number }) {
  const handle = opendirSync(directory), entries = [];
  try { for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
    if (++count.value > MAX_RAW_ENTRIES) throw new TomeowlError("Raw archive exceeds the directory-entry bound", "INPUT_TOO_LARGE");
    entries.push(entry);
  } } finally { handle.closeSync(); }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function scanRawRoot(input: string, maxBytes: number): RawScan {
  const requested = resolve(input), rootInfo = lstatSync(requested);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new TomeowlError("Raw archive root must be a regular directory", "INVALID_ROOT");
  const root = realpathSync(requested), videos = new Map<string, RawCandidate[]>(), omissions: Record<string, number> = {};
  const counts = { transcriptFiles: 0, descriptionFiles: 0, omissions };
  const entries = { value: 0 };
  for (const channel of list(root, entries)) {
    if (channel.isSymbolicLink()) { omit(omissions, "symlinkChannelDirectories"); continue; }
    if (channel.name.startsWith(".")) { if (channel.isDirectory()) omit(omissions, "hiddenChannelDirectories"); continue; }
    if (!channel.isDirectory()) continue;
    const channelPath=join(root,channel.name);
    if(!inside(realpathSync(channelPath),root)){omit(omissions,"escapedChannelDirectories");continue;}
    for (const item of list(channelPath, entries)) {
      if (item.isSymbolicLink()) { omit(omissions, "symlinkVideoDirectories"); continue; }
      if (!item.isDirectory()) continue;
      if (!/^[\w-]{11}$/.test(item.name)) { omit(omissions, "invalidVideoDirectories"); continue; }
      const base = join(channelPath, item.name);
      if(!inside(realpathSync(base),root)){omit(omissions,"escapedVideoDirectories");continue;}
      const candidate: RawCandidate = { folder: channel.name };
      for (const [name, key] of [["transcript.json", "transcript"], ["description.txt", "description"]] as const) {
        const path = join(base, name);
        if (!existsSync(path)) continue;
        const info = lstatSync(path);
        if (info.isSymbolicLink()) { omit(omissions, "symlinkArtifacts"); candidate[key] = { path, size: info.size, mtimeMs: info.mtimeMs, error: "symlink" }; continue; }
        if (!info.isFile()) { omit(omissions, "nonRegularArtifacts"); candidate[key] = { path, size: info.size, mtimeMs: info.mtimeMs, error: "not-regular-file" }; continue; }
        if(!inside(realpathSync(path),root)){omit(omissions,"escapedArtifacts");candidate[key]={path,size:info.size,mtimeMs:info.mtimeMs,error:"escaped-root"};continue;}
        if (info.size > maxBytes) { omit(omissions, "oversizedArtifacts"); candidate[key] = { path, size: info.size, mtimeMs: info.mtimeMs, error: "size-limit" }; continue; }
        candidate[key] = { path, size: info.size, mtimeMs: info.mtimeMs };
        if (key === "transcript") counts.transcriptFiles++; else counts.descriptionFiles++;
      }
      if (candidate.transcript || candidate.description) (videos.get(item.name) ?? (videos.set(item.name, []), videos.get(item.name)!)).push(candidate);
    }
  }
  return { root, videos, counts };
}

function readBounded(path: string, maxBytes: number, root?: string): { bytes: Buffer; mtimeMs: number } {
  const beforePath = lstatSync(path);
  if (beforePath.isSymbolicLink() || !beforePath.isFile()) throw new TomeowlError("Raw artifact must be a regular file", "INVALID_ARTIFACT");
  if(root&&!inside(realpathSync(path),root))throw new TomeowlError("Raw artifact escaped the configured root", "INVALID_ARTIFACT");
  if (beforePath.size > maxBytes) throw new TomeowlError("Raw artifact exceeds the configured byte limit", "INPUT_TOO_LARGE");
  const fd = openSync(path, "r");
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size !== beforePath.size || before.ino !== beforePath.ino || before.dev !== beforePath.dev) throw new TomeowlError("Raw artifact changed identity", "SOURCE_CHANGED");
    const bytes = Buffer.alloc(before.size + 1); let length = 0;
    while (length < bytes.length) { const read = readSync(fd, bytes, length, bytes.length - length, null); if (!read) break; length += read; }
    const after = fstatSync(fd), current = lstatSync(path);
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || current.isSymbolicLink() || current.ino !== before.ino || current.dev !== before.dev) throw new TomeowlError("Raw artifact changed during read", "SOURCE_CHANGED");
    return { bytes: bytes.subarray(0, length), mtimeMs: before.mtimeMs };
  } finally { closeSync(fd); }
}

function decode(textBytes: Buffer | string, videoId: string, sourcePath: string, maxBytes: number, maxCues: number): Decode {
  const bytes = Buffer.isBuffer(textBytes) ? textBytes : Buffer.from(textBytes, "utf8");
  if (bytes.byteLength > maxBytes) return { error: "size-limit", bytes: bytes.byteLength };
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) return { error: "invalid-utf8", bytes: bytes.byteLength };
  try { const video = parseArchivedVideo(text, videoId, sourcePath, maxCues); return { video, text, sha256: hash(text), bytes: bytes.byteLength }; }
  catch (error) { return { error: error instanceof Error ? error.message : String(error), bytes: bytes.byteLength }; }
}

function validateSourceSchema(db: Database) {
  const tables = new Set((db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name));
  const required: Record<string, string[]> = {
    videos: ["video_id", "channel_url", "channel_name", "video_url", "title", "published_at", "language", "language_code", "is_generated", "artifact_path", "artifact_sha256", "imported_at", "description", "extraction_status"],
    transcript_artifacts: ["artifact_id", "video_id", "source_format", "raw_sha256", "raw_payload", "imported_at", "is_current"],
    transcript_segments: ["artifact_id", "parser_version", "ordinal", "start_seconds", "end_seconds", "text"],
    video_links: ["link_id", "video_id", "url", "domain", "created_at"],
  };
  for (const [table, columns] of Object.entries(required)) {
    if (!tables.has(table)) throw new TomeowlError(`Source SQLite is missing ${table}`, "INVALID_SOURCE_SCHEMA");
    const available = new Set((db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name));
    for (const column of columns) if (!available.has(column)) throw new TomeowlError(`Source SQLite ${table} is missing ${column}`, "INVALID_SOURCE_SCHEMA");
  }
}

function createLibraryTables(db: Database) {
  db.exec(`
    CREATE TABLE viberaven_library(singleton INTEGER PRIMARY KEY CHECK(singleton=1),schema_version INTEGER NOT NULL,started_at TEXT NOT NULL,completed_at TEXT,complete INTEGER NOT NULL,source_database TEXT NOT NULL,source_root TEXT,coverage_json TEXT NOT NULL,provenance_json TEXT NOT NULL);
    CREATE TABLE viberaven_video_coverage(video_id TEXT PRIMARY KEY,video_source_id TEXT NOT NULL,channel_source_id TEXT NOT NULL,source_kind TEXT NOT NULL,transcript_status TEXT NOT NULL,transcript_source TEXT,transcript_sha256 TEXT,sqlite_sha256 TEXT,raw_sha256 TEXT,raw_path TEXT,transcript_cues INTEGER NOT NULL,transcript_passages INTEGER NOT NULL,description_status TEXT NOT NULL,description_source TEXT,description_sha256 TEXT,description_passages INTEGER NOT NULL,link_count INTEGER NOT NULL,conflicts_json TEXT NOT NULL,errors_json TEXT NOT NULL);
    CREATE TABLE viberaven_source_metadata(source_id TEXT PRIMARY KEY,layer TEXT NOT NULL,video_id TEXT,channel_id TEXT,ordinal INTEGER,metadata_json TEXT NOT NULL);
    CREATE INDEX viberaven_metadata_video_idx ON viberaven_source_metadata(video_id,layer,ordinal);
    CREATE INDEX viberaven_metadata_channel_idx ON viberaven_source_metadata(channel_id,layer);
    CREATE TABLE viberaven_video_links(link_id INTEGER PRIMARY KEY,video_id TEXT NOT NULL,url TEXT NOT NULL,domain TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE viberaven_description_conflicts(video_id TEXT NOT NULL,source TEXT NOT NULL,path TEXT NOT NULL,sha256 TEXT NOT NULL,content TEXT NOT NULL,PRIMARY KEY(video_id,source,path));
    CREATE TABLE viberaven_lexical_edges(relation_id TEXT PRIMARY KEY,score REAL NOT NULL,shared_terms TEXT NOT NULL);
    CREATE VIRTUAL TABLE viberaven_lexical_fts USING fts5(source_id UNINDEXED,video_id UNINDEXED,layer UNINDEXED,body,tokenize='unicode61');
    INSERT INTO viberaven_library VALUES(1,1,datetime('now'),NULL,0,'',NULL,'{}','{}');
  `);
}

function evidence(record: PendingRecord): Evidence {
  return { sourceId: record.source.id, revision: record.source.revision, chunkId: record.chunk.id, quote: record.chunk.text, locator: record.chunk.locator };
}

function sourceIdFor(layer: string, key: string) { return hash(`viberaven\0${layer}\0${key}`).slice(0, 32); }

function pendingRecord(args: { id: string; title: string; text: string; locator: Chunk["locator"]; layer: string; videoId: string; channelId: string; channel: string; url?: string; ordinal?: number; media?: Record<string, unknown>; output: string }): PendingRecord {
  const safeVideoDirectory = /^[\w-]{11}$/.test(args.videoId) ? args.videoId : `invalid-${sourceIdFor("invalid-video", args.videoId)}`;
  const scope = join(args.output, "records"), path = join(scope, args.layer === "channel" ? "channels" : safeVideoDirectory, `${args.id}.txt`), revision = hash(args.text);
  const source: Source = { id: args.id, title: args.title, path, collection: args.channel || "Viberaven", ...(args.url ? { url: args.url } : {}), kind: args.layer === "transcript" ? "transcript" : "document", revision, chunkCount: 1, scope };
  const chunk: Chunk = { id: hash(`${args.id}\0${revision}\0${0}`).slice(0, 32), sourceId: args.id, revision, text: args.text, locator: args.locator, ordinal: 0 };
  const meta = { layer: args.layer, corpus: "workspace", projectId: args.channelId, media: { channelId: args.channelId, ...(args.layer === "channel" ? {} : { videoId: args.videoId }), ...(args.ordinal === undefined ? {} : { ordinal: args.ordinal }), ...args.media } };
  return { source, chunk, body: args.text, meta };
}

function canonicalChannel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["youtube.com", "www.youtube.com"].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !/^\/(?:@[\w.-]+|(?:channel|c|user)\/[\w.-]+)\/?$/.test(url.pathname)) return undefined;
    url.hostname = "www.youtube.com"; url.pathname = url.pathname.replace(/\/$/, ""); return url.href;
  } catch { return undefined; }
}

function sameCues(a: ArchivedVideo, b: ArchivedVideo) {
  return a.cues.length === b.cues.length && a.cues.every((cue, index) => cue.start === b.cues[index]!.start && cue.end === b.cues[index]!.end && cue.text === b.cues[index]!.text);
}

function validTimestamp(value: unknown) { return typeof value === "string" ? Date.parse(value) : NaN; }

function ensureUtf8(bytes: Buffer) {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new TomeowlError("Description artifact must be valid UTF-8", "INVALID_DESCRIPTION");
  return text;
}

function bytesOf(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(String(value), "utf8");
}

function tokenize(text: string, limit = 96) {
  const counts = new Map<string, number>();
  for (const term of text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
    if (term.length < 3 || term.length > 48 || MEDIA_STOP_WORDS.has(term) || /^\d+$/.test(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit));
}

function lexicalEdges(db: Database, candidateLimit: number) {
  if (candidateLimit < 1) return { links: 0, candidatesPerPassage: 0 };
  db.exec("DROP TABLE IF EXISTS viberaven_vocab; DROP TABLE IF EXISTS viberaven_lexical_degree; CREATE VIRTUAL TABLE viberaven_vocab USING fts5vocab(viberaven_lexical_fts,'row'); CREATE TABLE viberaven_lexical_degree(source_id TEXT PRIMARY KEY,degree INTEGER NOT NULL);");
  db.exec("PRAGMA temp_store=FILE; DROP TABLE IF EXISTS temp.cached_frequency; CREATE TEMP TABLE cached_frequency(term TEXT PRIMARY KEY,doc INTEGER NOT NULL) WITHOUT ROWID; INSERT INTO cached_frequency SELECT term,doc FROM viberaven_vocab;");
  const total = (db.query("SELECT count(*) n FROM viberaven_lexical_fts").get() as { n: number }).n;
  const pages = db.query("SELECT rowid,source_id,video_id,layer,body FROM viberaven_lexical_fts WHERE rowid>? ORDER BY rowid LIMIT ?");
  const findCandidates = db.query(`SELECT rowid,source_id,video_id,layer,body FROM viberaven_lexical_fts
    WHERE viberaven_lexical_fts MATCH ? AND rowid>? AND video_id<>?
    ORDER BY bm25(viberaven_lexical_fts),rowid LIMIT ?`);
  const docFreq = db.query("SELECT term,doc FROM temp.cached_frequency WHERE term IN (SELECT value FROM json_each(?))");
  const degree = db.query("SELECT degree FROM viberaven_lexical_degree WHERE source_id=?");
  const relation = db.query("INSERT OR IGNORE INTO relations(id,source_id,target_id,kind,basis,evidence) VALUES (?,?,?,'similar','lexical',?)");
  const edgeInfo = db.query("INSERT OR IGNORE INTO viberaven_lexical_edges(relation_id,score,shared_terms) VALUES (?,?,?)");
  const bump = db.query("INSERT INTO viberaven_lexical_degree(source_id,degree) VALUES (?,1) ON CONFLICT(source_id) DO UPDATE SET degree=degree+1");
  const chunks = db.query("SELECT s.id,s.revision,c.id chunk_id,c.body,c.locator FROM sources s JOIN chunks c ON c.source_id=s.id AND c.revision=s.revision WHERE s.id=?");
  let last = 0, links = 0;
  while (true) {
    const rows = pages.all(last, 256) as Array<{rowid:number;source_id:string;video_id:string;layer:string;body:string}>;
    if (!rows.length) break;
    const writeBatch = db.transaction(() => {
      for (const focus of rows) {
        last = focus.rowid;
        let focusDegree=(degree.get(focus.source_id) as {degree:number}|null)?.degree??0;
        if(focusDegree>=2)continue;
        const focusTerms = tokenize(focus.body);
        if (focusTerms.size < 3) continue;
        const common=(docFreq.all(JSON.stringify([...focusTerms.keys()])) as Array<{term:string;doc:number}>).reduce((map,row)=>map.set(row.term,row.doc),new Map<string,number>());
        const rareTerms=[...focusTerms.keys()].filter(term=>{const df=common.get(term)??total;return df<=64&&(total<8||df<=total*.5);})
          .sort((a,b)=>(common.get(a)??total)-(common.get(b)??total)||a.localeCompare(b)).slice(0,8);
        if(rareTerms.length<3)continue;
        const expression = rareTerms.map(term => `"${term.replaceAll('"','""')}"`).join(" OR ");
        const candidates = findCandidates.all(expression, focus.rowid, focus.video_id, candidateLimit) as Array<{rowid:number;source_id:string;video_id:string;layer:string;body:string}>;
        if (!candidates.length) continue;
        const vectors = [focusTerms, ...candidates.map(row => tokenize(row.body))];
        const wordSet = new Set(vectors.flatMap(vector => [...vector.keys()]));
        const frequencies = new Map((docFreq.all(JSON.stringify([...wordSet])) as Array<{term:string;doc:number}>).map(row => [row.term,row.doc]));
        const idf = (term:string) => Math.log(1 + total / (1 + (frequencies.get(term) ?? total)));
        const weighted = vectors.map(vector => new Map([...vector].map(([term,count]) => [term,(1+Math.log(count))*idf(term)])));
        const norm = weighted.map(vector => Math.sqrt([...vector.values()].reduce((sum,weight)=>sum+weight*weight,0)));
        const scored = candidates.map((candidate,index) => {
          const other=weighted[index+1]!, shared=[...weighted[0]!.keys()].filter(term=>other.has(term));
          if(shared.length<3||!norm[0]||!norm[index+1])return undefined;
          const score=shared.reduce((sum,term)=>sum+weighted[0]!.get(term)!*other.get(term)!,0)/(norm[0]!*norm[index+1]!);
          return score<.28?undefined:{candidate,score,sharedTerms:shared.sort((a,b)=>other.get(b)!*weighted[0]!.get(b)!-other.get(a)!*weighted[0]!.get(a)!).slice(0,8)};
        }).filter((row):row is {candidate:typeof candidates[number];score:number;sharedTerms:string[]}=>!!row)
          .sort((a,b)=>b.score-a.score||a.candidate.source_id.localeCompare(b.candidate.source_id));
        for(const row of scored){
          if(focusDegree>=2)break;
          const candidateDegree=(degree.get(row.candidate.source_id) as {degree:number}|null)?.degree??0;
          if(candidateDegree>=2)continue;
          const [source,target]=[focus.source_id,row.candidate.source_id].sort(),id=hash(`lexical\0${source}\0${target}`).slice(0,32);
          const cited=[source,target].map(sourceId=>{
            const c=chunks.get(sourceId) as any;
            return {sourceId,revision:c.revision,chunkId:c.chunk_id,quote:c.body,locator:JSON.parse(c.locator)};
          });
          relation.run(id,source,target,JSON.stringify(cited)); edgeInfo.run(id,row.score,JSON.stringify(row.sharedTerms));
          bump.run(focus.source_id);bump.run(row.candidate.source_id);focusDegree++;links++;
        }
      }
    });
    writeBatch();
  }
  db.exec("DROP TABLE temp.cached_frequency;");
  return { links, candidatesPerPassage: candidateLimit };
}

export async function importLibrary(options: { database: string; root?: string; output: string; maxArtifactBytes?: number; maxCues?: number; lexicalCandidates?: number }) {
  const maxBytes = options.maxArtifactBytes ?? DEFAULT_MAX_BYTES, maxCues = options.maxCues ?? DEFAULT_MAX_CUES;
  const lexicalCandidates = options.lexicalCandidates ?? 40;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_048_576 || maxBytes > 64 * 1024 * 1024) throw new TomeowlError("maxArtifactBytes must be from 1 MiB to 64 MiB", "INVALID_LIMIT");
  if (!Number.isSafeInteger(maxCues) || maxCues < 1 || maxCues > 500_000) throw new TomeowlError("maxCues must be from 1 to 500000", "INVALID_LIMIT");
  if (!Number.isSafeInteger(lexicalCandidates) || lexicalCandidates < 0 || lexicalCandidates > 200) throw new TomeowlError("lexicalCandidates must be from 0 to 200", "INVALID_LIMIT");
  const database = resolve(options.database), dbInfo = lstatSync(database);
  if (dbInfo.isSymbolicLink() || !dbInfo.isFile()) throw new TomeowlError("Source database must be a regular non-symlink file", "INVALID_DATABASE");
  const sourceDbPath = realpathSync(database), dbRoot = realpathSync(dirname(sourceDbPath));
  const raw = options.root ? scanRawRoot(options.root,maxBytes) : undefined;
  const roots = [...new Set([dbRoot,...(raw?[raw.root]:[])])];
  const outputCheck=validateOutput(options.output,roots), output=outputCheck.path;
  mkdirSync(dirname(output),{recursive:true});mkdirSync(output);const recordsRoot=join(output,"records");mkdirSync(recordsRoot);
  const source = new Database(sourceDbPath,{readonly:true}), target = openStore(join(output,OUTPUT_DB));
  const startedAt=new Date().toISOString(), rawIds=new Set(raw?.videos.keys()??[]), seenRaw=new Set<string>();
  const counts={sqliteVideos:0,rawOnlyVideos:0,channels:0,descriptionPassages:0,transcriptPassages:0,structuralRelations:0,lexicalLinks:0,videoLinks:0,contentComplete:true,rawBytes:0,omissions:{...(raw?.counts.omissions??{})} as Record<string,number>};
  if(Object.values(counts.omissions).some(count=>count>0))counts.contentComplete=false;
  try {
    source.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000; BEGIN DEFERRED;");
    validateSourceSchema(source);createLibraryTables(target);
    const initialProvenance={schemaVersion:1,createdAt:startedAt,source:{database:sourceDbPath,root:raw?.root??null,readOnly:true,readTransaction:true},inputBounds:{maxArtifactBytes:maxBytes,maxCues},lexical:{method:"FTS5 candidate retrieval followed by corpus-IDF TF-IDF cosine",candidateLimit:lexicalCandidates,minimumScore:.28,minimumSharedTerms:3,maximumDegree:2,semanticInference:false},coverage:{complete:false}};
    target.query("UPDATE viberaven_library SET source_database=?,source_root=?,provenance_json=?,complete=0 WHERE singleton=1").run(sourceDbPath,raw?.root??null,JSON.stringify(initialProvenance));
    writeReportFile(join(output,"provenance.json"),JSON.stringify(initialProvenance,null,2));
    const insertSource=target.query("INSERT INTO sources(id,title,path,collection,url,kind,revision,scope) VALUES (?,?,?,?,?,?,?,?)");
    const insertChunk=target.query("INSERT INTO chunks(id,source_id,revision,body,locator,ordinal) VALUES (?,?,?,CAST(? AS TEXT),?,?)");
    const insertFts=target.query("INSERT INTO chunk_fts(chunk_id,body) VALUES (?,CAST(? AS TEXT))");
    const insertMeta=target.query("INSERT INTO viberaven_source_metadata(source_id,layer,video_id,channel_id,ordinal,metadata_json) VALUES (?,?,?,?,?,?)");
    const insertRel=target.query("INSERT INTO relations(id,source_id,target_id,kind,basis,evidence) VALUES (?,?,?,'contains','structural',?)");
    const insertLexicalFts=target.query("INSERT INTO viberaven_lexical_fts(source_id,video_id,layer,body) VALUES (?,?,?,CAST(? AS TEXT))");
    const insertCoverage=target.query("INSERT INTO viberaven_video_coverage(video_id,video_source_id,channel_source_id,source_kind,transcript_status,transcript_source,transcript_sha256,sqlite_sha256,raw_sha256,raw_path,transcript_cues,transcript_passages,description_status,description_source,description_sha256,description_passages,link_count,conflicts_json,errors_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const insertLink=target.query("INSERT INTO viberaven_video_links(link_id,video_id,url,domain,created_at) VALUES (?,?,?,?,?)");
    const insertDescriptionConflict=target.query("INSERT INTO viberaven_description_conflicts(video_id,source,path,sha256,content) VALUES (?,?,?,?,CAST(? AS TEXT))");
    const writeVideo=target.transaction((args:{records:PendingRecord[];relations:PendingRelation[];coverage:unknown;links:Array<any>;descriptionConflicts:Array<any>})=>{
      for(const record of args.records){
        insertSource.run(record.source.id,record.source.title,record.source.path,record.source.collection,record.source.url??null,record.source.kind,record.source.revision,record.source.scope);
        const bodyUtf8=Buffer.from(record.chunk.text,"utf8");
        insertChunk.run(record.chunk.id,record.chunk.sourceId,record.chunk.revision,bodyUtf8,JSON.stringify(record.chunk.locator),record.chunk.ordinal);
        insertFts.run(record.chunk.id,bodyUtf8);insertMeta.run(record.source.id,(record.meta as any).layer,(record.meta as any).media.videoId??null,(record.meta as any).media.channelId,(record.meta as any).media.ordinal??null,JSON.stringify(record.meta));
        if(["description","transcript"].includes((record.meta as any).layer))insertLexicalFts.run(record.source.id,(record.meta as any).media.videoId,(record.meta as any).layer,bodyUtf8);
      }
      for(const rel of args.relations)insertRel.run(rel.id,rel.source,rel.target,JSON.stringify(rel.evidence));
      for(const link of args.links)insertLink.run(link.link_id,link.video_id,link.url,link.domain,link.created_at);
      for(const row of args.descriptionConflicts)insertDescriptionConflict.run(row.videoId,row.source,row.path,row.sha256,Buffer.from(row.content,"utf8"));
      const c=args.coverage as any;insertCoverage.run(c.videoId,c.videoSourceId,c.channelSourceId,c.sourceKind,c.transcriptStatus,c.transcriptSource,c.transcriptSha256,c.sqliteSha256,c.rawSha256,c.rawPath,c.transcriptCues,c.transcriptPassages,c.descriptionStatus,c.descriptionSource,c.descriptionSha256,c.descriptionPassages,c.linkCount,JSON.stringify(c.conflicts),JSON.stringify(c.errors));
    });
    const channelIds=new Map<string,string>(), channelRecords=new Map<string,PendingRecord>();
    const rows=source.query("SELECT video_id,channel_url,channel_name,video_url,title,published_at,language,language_code,is_generated,artifact_path,artifact_sha256,imported_at,extraction_status,CASE WHEN length(CAST(description AS BLOB))<=? THEN description END description,length(CAST(description AS BLOB)) description_bytes FROM videos ORDER BY video_id").iterate(maxBytes);
    const processVideo=(row:DbVideo|undefined, videoId:string, candidates:RawCandidate[], rawOnly:boolean)=>{
      const errors:string[]=[],conflicts:any[]=[];
      if(!/^[\w-]{11}$/.test(videoId)){errors.push("invalid-video-id");counts.contentComplete=false;}
      const currentArtifacts=row?source.query("SELECT artifact_id,raw_sha256,source_format,imported_at FROM transcript_artifacts WHERE video_id=? AND is_current=1 ORDER BY (source_format='json') DESC,imported_at DESC,artifact_id DESC").all(videoId) as any[]:[];
      const chosenSummary=currentArtifacts[0],chosenDb=chosenSummary?source.query("SELECT artifact_id,raw_sha256,CASE WHEN length(raw_payload)<=? THEN raw_payload END raw_payload,length(raw_payload) payload_bytes,source_format,imported_at,retrieved_at,track_key FROM transcript_artifacts WHERE artifact_id=?").get(maxBytes,chosenSummary.artifact_id) as any:undefined;
      if(currentArtifacts.length>1){conflicts.push({kind:"multiple-current-sqlite-artifacts",artifacts:currentArtifacts.map(a=>({artifactId:a.artifact_id,format:a.source_format,sha256:a.raw_sha256}))});counts.contentComplete=false;}
      const dbSourcePath=chosenDb?`${sourceDbPath}#transcript_artifacts:${chosenDb.artifact_id}`:sourceDbPath;
      let sqliteDecode:Decode|undefined;
      if(chosenDb){
        counts.rawBytes+=chosenDb.payload_bytes;
        if(chosenDb.source_format!=="json")sqliteDecode={error:`unsupported-format:${chosenDb.source_format}`,bytes:chosenDb.payload_bytes};
        else if(chosenDb.payload_bytes>maxBytes)sqliteDecode={error:"size-limit",bytes:chosenDb.payload_bytes};
        else{
          sqliteDecode=decode(bytesOf(chosenDb.raw_payload),videoId,dbSourcePath,maxBytes,maxCues);
          if(sqliteDecode.sha256&&sqliteDecode.sha256!==chosenDb.raw_sha256)sqliteDecode={error:"stored-hash-mismatch",bytes:chosenDb.payload_bytes};
        }
      }
      const rawDecoded:Array<{candidate:RawCandidate;decode?:Decode;description?:string;descSha?:string;descError?:string}> = [];
      for(const candidate of candidates){
        let decoded:Decode|undefined, description:string|undefined,descSha:string|undefined,descError:string|undefined;
        if(candidate.transcript&&!candidate.transcript.error){
          try{const read=readBounded(candidate.transcript.path,maxBytes,raw?.root);counts.rawBytes+=read.bytes.byteLength;decoded=decode(read.bytes,videoId,candidate.transcript.path,maxBytes,maxCues);if(decoded.error)omit(counts.omissions,`invalidRawTranscript:${decoded.error}`);}
          catch(error){decoded={error:error instanceof Error?error.message:String(error)};omit(counts.omissions,"unreadableRawTranscript");}
        }
        if(candidate.description&&!candidate.description.error){
          try{const read=readBounded(candidate.description.path,maxBytes,raw?.root);counts.rawBytes+=read.bytes.byteLength;description=ensureUtf8(read.bytes);descSha=hash(description);}
          catch(error){descError=error instanceof Error?error.message:String(error);omit(counts.omissions,"unreadableRawDescription");}
        }
        rawDecoded.push({candidate,decode:decoded,description,descSha,descError});
      }
      for(const item of rawDecoded){
        if(item.candidate.transcript?.error)errors.push(`raw-transcript:${item.candidate.transcript.error}`);
        else if(item.decode?.error)errors.push(`raw-transcript:${item.decode.error}`);
        if(item.candidate.description?.error)errors.push(`raw-description:${item.candidate.description.error}`);
        else if(item.descError)errors.push(`raw-description:${item.descError}`);
      }
      const expectedChannel=canonicalChannel(row?.channel_url),matchingRaw=rawDecoded.filter(item=>item.decode?.video&&(!expectedChannel||item.decode.video.channelUrl===expectedChannel));
      const rawWinner=matchingRaw[0]??rawDecoded.find(item=>item.decode?.video);
      if(rawDecoded.filter(item=>item.decode?.video).length>1){conflicts.push({kind:"multiple-raw-transcripts",paths:rawDecoded.filter(item=>item.decode?.video).map(item=>item.candidate.transcript?.path)});counts.contentComplete=false;}
      const rawVideo=rawWinner?.decode?.video;
      let selected=sqliteDecode?.video,transcriptSource=selected?"sqlite-current":undefined,transcriptStatus=selected?"sqlite-current":"missing";
      const sqliteHash=chosenDb?.raw_sha256 as string|undefined,rawHash=rawWinner?.decode?.sha256;
      if(!selected&&rawVideo){selected=rawVideo;transcriptSource="raw-json-fallback";transcriptStatus="raw-fallback";}
      if(selected&&sqliteDecode?.error&&rawVideo){conflicts.push({kind:"invalid-sqlite-transcript-fell-back-to-raw",sqliteError:sqliteDecode.error,rawSha256:rawHash});errors.push(`sqlite:${sqliteDecode.error}`);counts.contentComplete=false;}
      if(selected&&rawVideo&&sqliteDecode?.video){
        if(sameCues(sqliteDecode.video,rawVideo)){
          if(rawHash!==sqliteHash)conflicts.push({kind:"artifact-metadata-hash-difference",sqliteSha256:sqliteHash,rawSha256:rawHash,transcriptCuesEqual:true});
          transcriptStatus="sqlite-current";
        }else{
          const sourceTime=validTimestamp(chosenDb?.retrieved_at??chosenDb?.imported_at??row?.imported_at),rawTime=rawWinner?.candidate.transcript?.mtimeMs??0;
          if(rawTime>0&&sourceTime===sourceTime&&rawTime>sourceTime){selected=rawVideo;transcriptSource="raw-newer";transcriptStatus="conflict-raw-newer";}
          else transcriptStatus="conflict-sqlite-current";
          conflicts.push({kind:"transcript-cues-differ",sqliteSha256:sqliteHash,rawSha256:rawHash,chosen:transcriptSource});counts.contentComplete=false;
        }
      }
      if(!selected){
        const unavailable=row&&["no_track_confirmed","video_unavailable_or_restricted"].includes(row.extraction_status);
        const rawInvalid=rawDecoded.some(item=>!!item.candidate.transcript&&!!(item.decode?.error||item.candidate.transcript.error));
        transcriptStatus=sqliteDecode?.error?.includes("size-limit")||chosenDb?.payload_bytes>maxBytes?"oversized":sqliteDecode||rawInvalid?"invalid":unavailable?"unavailable":"missing";
        if(sqliteDecode?.error)errors.push(`sqlite:${sqliteDecode.error}`);
        if(transcriptStatus==="invalid"||transcriptStatus==="oversized"||transcriptStatus==="missing")counts.contentComplete=false;
      }
      const channelName=(row?.channel_name||selected?.channel||rawVideo?.channel||"").trim();
      const channelUrl=expectedChannel??canonicalChannel(selected?.channelUrl)??canonicalChannel(rawVideo?.channelUrl);
      const channelKey=channelUrl??`unknown:${videoId}`,channelId=sourceIdFor("channel",channelKey),videoSourceId=sourceIdFor("video",videoId);
      let channelRecord=channelRecords.get(channelId);
      if(!channelRecord){
        const existing=target.query("SELECT id,title,path,collection,url,kind,revision,scope FROM sources WHERE id=?").get(channelId) as any;
        if(existing){
          const chunk=target.query("SELECT id,source_id,revision,body,locator,ordinal FROM chunks WHERE source_id=? ORDER BY ordinal LIMIT 1").get(channelId) as any;
          const meta=target.query("SELECT metadata_json FROM viberaven_source_metadata WHERE source_id=?").get(channelId) as any;
          channelRecord={source:existing,chunk:{...chunk,locator:JSON.parse(chunk.locator)},body:chunk.body,meta:JSON.parse(meta.metadata_json)};
        }else{
          const body=channelName?`Channel: ${channelName}\nChannel URL: ${channelUrl??"unavailable"}\n`:`Channel: unavailable\nChannel URL: unavailable\nVideo identity: ${videoId}\n`;
          channelRecord=pendingRecord({id:channelId,title:channelName||`Unknown channel · ${videoId}`,text:body,locator:{lineStart:1,lineEnd:body.trimEnd().split("\n").length},layer:"channel",videoId,channelId,channel:channelName,url:channelUrl,output,media:{channelUrl,identitySource:channelUrl?"stored-channel-url":"unavailable"}});counts.channels++;
        }
      }
      channelRecords.set(channelId,channelRecord);
      const title=(row?.title||selected?.title||videoId).trim(),videoUrl=(typeof row?.video_url==="string"&&row.video_url.startsWith("https://")?row.video_url:selected?.url??rawVideo?.url);
      const descCandidates:Array<{source:string;path:string;text:string;sha256:string;mtimeMs:number}> = [];
      const storedDescription=typeof row?.description==="string"?row.description:"";
      if(typeof row?.description==="string")descCandidates.push({source:"videos.description",path:sourceDbPath,text:storedDescription,sha256:hash(storedDescription),mtimeMs:Infinity});
      if(sqliteDecode?.video?.descriptionPresent)descCandidates.push({source:"sqlite-payload.description",path:dbSourcePath,text:sqliteDecode.video.description,sha256:hash(sqliteDecode.video.description),mtimeMs:validTimestamp(chosenDb?.imported_at)});
      for(const item of rawDecoded){
        if(item.decode?.video?.descriptionPresent)descCandidates.push({source:"raw-json.description",path:item.candidate.transcript?.path??"",text:item.decode.video.description,sha256:hash(item.decode.video.description),mtimeMs:item.candidate.transcript?.mtimeMs??0});
        if(item.description!==undefined)descCandidates.push({source:"description.txt",path:item.candidate.description!.path,text:item.description,sha256:item.descSha!,mtimeMs:item.candidate.description!.mtimeMs});
      }
      const chosenDescription=descCandidates.find(x=>x.source==="videos.description")??descCandidates.find(x=>x.source==="raw-json.description")??descCandidates.find(x=>x.source==="sqlite-payload.description")??descCandidates.find(x=>x.source==="description.txt");
      const normalizeLines=(text:string)=>text.replace(/\r+\n/g,"\n").replace(/\r/g,"\n").replace(/\n+$/g,"");
      for(const candidate of descCandidates){if(candidate.sha256!==chosenDescription?.sha256){const normalized=chosenDescription?.text!==undefined&&normalizeLines(candidate.text)===normalizeLines(chosenDescription.text);conflicts.push({kind:normalized?"description-newline-variant":"description-variant",source:candidate.source,path:candidate.path,sha256:candidate.sha256,chosen:chosenDescription?.source});}}
      if(row?.description_bytes!==null&&row?.description_bytes!==undefined&&row.description_bytes>maxBytes){errors.push("sqlite:description-size-limit");counts.contentComplete=false;}
      const description=chosenDescription?.text??"",descStatus=row?.description_bytes!==null&&row?.description_bytes!==undefined&&row.description_bytes>maxBytes?"oversized":chosenDescription?(description.trim()?"available":"empty"):"missing";
      const descPassages=descriptionPassages(description),cuePassages=selected?transcriptPassages(selected.cues):[];
      const videoBody=`Title: ${title}\nVideo ID: ${videoId}\nChannel: ${channelName||"unavailable"}\nChannel URL: ${channelUrl??"unavailable"}\nVideo URL: ${videoUrl??"unavailable"}\nPublished (supplied): ${row?.published_at??selected?.publishedAt??"unknown"}\nCaption language: ${row?.language_code??row?.language??selected?.language??"unknown"}\nGenerated captions: ${row?.is_generated===null||row?.is_generated===undefined?selected?.isGenerated??"unknown":!!row.is_generated}\nTranscript status: ${transcriptStatus}\nDescription status: ${descStatus}\nDescription passages: ${descPassages.length}\nTranscript passages: ${cuePassages.length}\n`;
      const videoRecord=pendingRecord({id:videoSourceId,title,text:videoBody,locator:{lineStart:1,lineEnd:videoBody.trimEnd().split("\n").length},layer:"video",videoId,channelId,channel:channelName,url:videoUrl,output,media:{parentId:channelId,videoId,rawArtifactSha256:rawHash,sqliteArtifactSha256:sqliteHash,transcriptSource,transcriptStatus,descriptionSource:chosenDescription?.source,descriptionSha256:chosenDescription?.sha256,language:row?.language_code??row?.language??selected?.language,isGenerated:row?.is_generated===null||row?.is_generated===undefined?selected?.isGenerated:!!row.is_generated}});
      const records=[...(target.query("SELECT 1 FROM sources WHERE id=?").get(channelId)?[]:[channelRecord]),videoRecord],relations:PendingRelation[]=[];
      const relation=(parent:PendingRecord,child:PendingRecord)=>relations.push({id:hash(`contains\0${parent.source.id}\0${child.source.id}`).slice(0,32),source:parent.source.id,target:child.source.id,kind:"contains",basis:"structural",evidence:[evidence(parent),evidence(child)]});
      relation(channelRecord,videoRecord);
      const addPassages=(layer:"description"|"transcript",passages:MediaPassage[],revisionSource:string,contentHash:string|undefined)=>{
        passages.forEach((passage,ordinal)=>{
          const id=sourceIdFor(layer,`${videoId}\0${layer}\0${contentHash??"missing"}\0${ordinal}`),media:Record<string,unknown>={parentId:videoSourceId,ordinal,originalPath:revisionSource,rawSha256:layer==="transcript"?(transcriptSource==="raw-newer"||transcriptSource==="raw-json-fallback"?rawHash:sqliteHash):undefined};
          let locator=passage.locator;
          if(layer==="description"){locator={lineStart:1,lineEnd:passage.text.split("\n").length};Object.assign(media,{descriptionSha256:contentHash,descriptionSource:chosenDescription?.source,originalField:"description",charStart:passage.charStart,charEnd:passage.charEnd,originalLineStart:passage.locator.lineStart,originalLineEnd:passage.locator.lineEnd});}
          else Object.assign(media,{language:row?.language_code??row?.language??selected?.language,isGenerated:row?.is_generated===null||row?.is_generated===undefined?selected?.isGenerated:!!row.is_generated,cueStart:passage.cueStart,cueEnd:passage.cueEnd,cueSpans:passage.cueSpans});
          const record=pendingRecord({id,title:`${title} · ${layer==="description"?"Description":"Transcript"} ${ordinal+1}`,text:passage.text,locator,layer,videoId,channelId,channel:channelName,url:videoUrl,ordinal,output,media});records.push(record);relation(videoRecord,record);
        });
      };
      addPassages("description",descPassages,chosenDescription?.path??sourceDbPath,chosenDescription?.sha256);
      addPassages("transcript",cuePassages,transcriptSource==="raw-newer"||transcriptSource==="raw-json-fallback"?(rawWinner?.candidate.transcript?.path??sourceDbPath):dbSourcePath,selected?.rawSha256);
      const links=source.query("SELECT link_id,video_id,url,domain,created_at FROM video_links WHERE video_id=? ORDER BY link_id").all(videoId) as any[];
      const segmentInfo=chosenDb?source.query("SELECT parser_version,count(*) n,min(ordinal) first,max(ordinal) last FROM transcript_segments WHERE artifact_id=? GROUP BY parser_version ORDER BY parser_version DESC LIMIT 1").get(chosenDb.artifact_id) as any:undefined;
      if(selected&&segmentInfo&&segmentInfo.n!==selected.cues.length){conflicts.push({kind:"normalized-segment-count-mismatch",parserVersion:segmentInfo.parser_version,segments:segmentInfo.n,cues:selected.cues.length});counts.contentComplete=false;}
      const normalizeDescription=(text:string)=>text.replace(/\r+\n/g,"\n").replace(/\r/g,"\n").replace(/\n+$/g,"");
      const descriptionConflicts=descCandidates.filter(candidate=>candidate.sha256!==chosenDescription?.sha256&&normalizeDescription(candidate.text)!==normalizeDescription(chosenDescription?.text??"")).map(candidate=>({videoId,source:candidate.source,path:candidate.path,sha256:candidate.sha256,content:candidate.text}));
      if(errors.length)counts.contentComplete=false;
      const coverage={videoId,videoSourceId,channelSourceId:channelId,sourceKind:rawOnly?"raw-only":"sqlite",transcriptStatus,transcriptSource,transcriptSha256:selected?.rawSha256,sqliteSha256:sqliteHash,rawSha256:rawHash,rawPath:rawWinner?.candidate.transcript?.path??null,transcriptCues:selected?.cues.length??0,transcriptPassages:cuePassages.length,descriptionStatus:descStatus,descriptionSource:chosenDescription?.source??null,descriptionSha256:chosenDescription?.sha256??null,descriptionPassages:descPassages.length,linkCount:links.length,conflicts,errors};
      const newFiles:string[]=[];
      try{
        for(const record of records){mkdirSync(dirname(record.source.path),{recursive:true});writeFileSync(record.source.path,record.chunk.text,{flag:"wx"});newFiles.push(record.source.path);}
        writeVideo({records,relations,coverage,links,descriptionConflicts});
      }catch(error){for(const path of newFiles)try{unlinkSync(path);}catch{}throw error;}
      counts.structuralRelations+=relations.length;counts.descriptionPassages+=descPassages.length;counts.transcriptPassages+=cuePassages.length;counts.videoLinks+=links.length;
      seenRaw.add(videoId);
    };
    for(const row of rows as IterableIterator<DbVideo>){processVideo(row,row.video_id,raw?.videos.get(row.video_id)??[],false);counts.sqliteVideos++;}
    if(raw){for(const [videoId,candidates] of raw.videos){if(seenRaw.has(videoId)||counts.sqliteVideos&&target.query("SELECT 1 FROM viberaven_video_coverage WHERE video_id=?").get(videoId))continue;processVideo(undefined,videoId,candidates,true);counts.rawOnlyVideos++;}}
     const summary={sqliteVideos:counts.sqliteVideos,rawOnlyVideos:counts.rawOnlyVideos,mappedVideos:counts.sqliteVideos+counts.rawOnlyVideos,channels:counts.channels,descriptionPassages:counts.descriptionPassages,transcriptPassages:counts.transcriptPassages,structuralRelations:counts.structuralRelations,lexicalLinks:0,videoLinks:counts.videoLinks,rawBytes:counts.rawBytes,omissions:counts.omissions,complete:counts.contentComplete};
     const incompleteCoverage={...summary,lexicalLinks:0,complete:false};
     const incompleteProvenance={schemaVersion:1,createdAt:startedAt,source:{database:sourceDbPath,root:raw?.root??null,readOnly:true,readTransaction:true},inputBounds:{maxArtifactBytes:maxBytes,maxCues},coverage:{sqliteVideos:counts.sqliteVideos,rawOnlyVideos:counts.rawOnlyVideos,mappedVideos:counts.sqliteVideos+counts.rawOnlyVideos,descriptionPassages:counts.descriptionPassages,transcriptPassages:counts.transcriptPassages,structuralRelations:counts.structuralRelations,videoLinks:counts.videoLinks,lexicalLinks:0,complete:false},lexical:{method:"FTS5 candidate retrieval followed by corpus-IDF TF-IDF cosine",candidateLimit:lexicalCandidates,minimumScore:.28,minimumSharedTerms:3,maximumDegree:2,semanticInference:false},rawDiscovery:raw?.counts??null,omissions:counts.omissions};
     target.query("UPDATE viberaven_library SET coverage_json=?,provenance_json=?,complete=0 WHERE singleton=1").run(JSON.stringify(incompleteCoverage),JSON.stringify(incompleteProvenance));
     writeReportFile(join(output,"coverage.json"),JSON.stringify(incompleteCoverage,null,2));writeReportFile(join(output,"provenance.json"),JSON.stringify(incompleteProvenance,null,2));
    let lexical={links:0,candidatesPerPassage:0};
    if(lexicalCandidates)lexical=lexicalEdges(target,lexicalCandidates);
    counts.lexicalLinks=lexical.links;
    const coverage={...summary,lexicalLinks:lexical.links,complete:counts.contentComplete};
    const provenance={schemaVersion:1,createdAt:new Date().toISOString(),source:{database:sourceDbPath,root:raw?.root??null,readOnly:true,readTransaction:true},inputBounds:{maxArtifactBytes:maxBytes,maxCues},coverage:{sqliteVideos:counts.sqliteVideos,rawOnlyVideos:counts.rawOnlyVideos,mappedVideos:counts.sqliteVideos+counts.rawOnlyVideos,descriptionPassages:counts.descriptionPassages,transcriptPassages:counts.transcriptPassages,structuralRelations:counts.structuralRelations,videoLinks:counts.videoLinks,lexicalLinks:lexical.links,complete:counts.contentComplete},lexical:{method:"FTS5 candidate retrieval followed by corpus-IDF TF-IDF cosine",candidateLimit:lexical.candidatesPerPassage,minimumScore:.28,minimumSharedTerms:3,maximumDegree:2,semanticInference:false},rawDiscovery:raw?.counts??null,omissions:counts.omissions};
     target.query("UPDATE viberaven_library SET completed_at=?,complete=?,source_database=?,source_root=?,coverage_json=?,provenance_json=? WHERE singleton=1").run(new Date().toISOString(),counts.contentComplete?1:0,sourceDbPath,raw?.root??null,JSON.stringify(coverage),JSON.stringify(provenance));
     source.exec("COMMIT;");
     writeReportFile(join(output,"coverage.json"),JSON.stringify(coverage,null,2));writeReportFile(join(output,"provenance.json"),JSON.stringify(provenance,null,2));
    return {output,database:join(output,OUTPUT_DB),coverage,provenance};
  }catch(error){try{source.exec("ROLLBACK;");}catch{}throw error;}
  finally{source.close();target.close();}
}

function openWritableLibrary(path: string) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile()) throw new TomeowlError("Library database must be a regular non-symlink file", "INVALID_DATABASE");
  const db = new Database(path);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const version = db.query("SELECT version FROM tomeowl_meta").all() as Array<{ version: number }>;
    if (version.length !== 1 || version[0]!.version !== 1) throw new TomeowlError("Unsupported library database schema", "SCHEMA_VERSION");
    const tables = new Set((db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name));
    for (const table of ["sources", "chunks", "relations", "viberaven_library", "viberaven_video_coverage", "viberaven_source_metadata", "viberaven_video_links", "viberaven_lexical_edges", "viberaven_lexical_fts"]) {
      if (!tables.has(table)) throw new TomeowlError(`Library database is missing ${table}`, "DATABASE_NOT_LIBRARY");
    }
    return db;
  } catch (error) { db.close(); throw error; }
}

export async function finalizeLibrary(options: { database: string; libraryDatabase: string; root?: string; maxArtifactBytes?: number; maxCues?: number; lexicalCandidates?: number }) {
  const maxBytes = options.maxArtifactBytes ?? DEFAULT_MAX_BYTES, maxCues = options.maxCues ?? DEFAULT_MAX_CUES, candidateLimit = options.lexicalCandidates ?? 40;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_048_576 || maxBytes > 64 * 1024 * 1024) throw new TomeowlError("maxArtifactBytes must be from 1 MiB to 64 MiB", "INVALID_LIMIT");
  if (!Number.isSafeInteger(maxCues) || maxCues < 1 || maxCues > 500_000) throw new TomeowlError("maxCues must be from 1 to 500000", "INVALID_LIMIT");
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit < 0 || candidateLimit > 200) throw new TomeowlError("lexicalCandidates must be from 0 to 200", "INVALID_LIMIT");
  const sourceRequested = resolve(options.database), libraryRequested = resolve(options.libraryDatabase);
  const sourceInfo = lstatSync(sourceRequested), libraryInfo = lstatSync(libraryRequested);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) throw new TomeowlError("Source database must be a regular non-symlink file", "INVALID_DATABASE");
  if (libraryInfo.isSymbolicLink() || !libraryInfo.isFile()) throw new TomeowlError("Library database must be a regular non-symlink file", "INVALID_DATABASE");
  const sourcePath = realpathSync(sourceRequested), libraryPath = realpathSync(libraryRequested), sourceDirectory = realpathSync(dirname(sourcePath)), libraryDirectory = realpathSync(dirname(libraryPath));
  if (keyPath(sourcePath) === keyPath(libraryPath)) throw new TomeowlError("Source and library databases must be different files", "INVALID_DATABASE");
  const raw = options.root ? scanRawRoot(options.root, maxBytes) : undefined;
  if (inside(libraryDirectory, sourceDirectory) || (raw && inside(libraryDirectory, raw.root))) throw new TomeowlError("Library output must be outside every source directory", "INVALID_OUTPUT");

  const source = new Database(sourcePath, { readonly: true }), target = openWritableLibrary(libraryPath);
  const writeStartedAt = new Date().toISOString();
  try {
    source.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000; BEGIN DEFERRED;");
    validateSourceSchema(source);
    const library = target.query("SELECT source_database,source_root,coverage_json,provenance_json FROM viberaven_library WHERE singleton=1").get() as any;
    if (!library) throw new TomeowlError("Database is not a VibeRaven library", "DATABASE_NOT_LIBRARY");
    const priorProvenance = JSON.parse(library.provenance_json || "{}");
    const samePath = (a: string, b: string) => keyPath(resolve(a)) === keyPath(resolve(b));
    if (library.source_database && !samePath(library.source_database, sourcePath)) throw new TomeowlError("Source database does not match the imported library", "SOURCE_MISMATCH");
    if (priorProvenance.source?.database && !samePath(priorProvenance.source.database, sourcePath)) throw new TomeowlError("Source database does not match library provenance", "SOURCE_MISMATCH");
    if (library.source_root && (!raw || !samePath(library.source_root, raw.root))) throw new TomeowlError("Configured raw root does not match the imported library", "SOURCE_MISMATCH");
    if (priorProvenance.source?.root && (!raw || !samePath(priorProvenance.source.root, raw.root))) throw new TomeowlError("Configured raw root does not match library provenance", "SOURCE_MISMATCH");
    if (!raw && (target.query("SELECT 1 FROM viberaven_video_coverage WHERE raw_path IS NOT NULL LIMIT 1").get() || priorProvenance.source?.root)) throw new TomeowlError("This library was imported with a raw archive; finalize with the same --root", "SOURCE_MISMATCH");
    if (priorProvenance.inputBounds?.maxArtifactBytes && priorProvenance.inputBounds.maxArtifactBytes !== maxBytes) throw new TomeowlError("maxArtifactBytes must match the import bounds", "SOURCE_MISMATCH");
    if (priorProvenance.inputBounds?.maxCues && priorProvenance.inputBounds.maxCues !== maxCues) throw new TomeowlError("maxCues must match the import bounds", "SOURCE_MISMATCH");
    if (raw && Object.values(raw.counts.omissions).some(count => count > 0)) throw new TomeowlError("Raw archive scan has omissions; library cannot be finalized", "INCOMPLETE_LIBRARY");

    const sourceIds = new Set<string>();
    const sourceVideoRows = source.query("SELECT video_id FROM videos ORDER BY video_id").iterate() as IterableIterator<{ video_id: string }>;
    const currentArtifact = source.query("SELECT artifact_id,raw_sha256 FROM transcript_artifacts WHERE video_id=? AND is_current=1 ORDER BY (source_format='json') DESC,imported_at DESC,artifact_id DESC");
    const segmentInfo = source.query("SELECT parser_version,count(*) n FROM transcript_segments WHERE artifact_id=? GROUP BY parser_version ORDER BY parser_version DESC LIMIT 1");
    const sourceVideoLinkCount = source.query("SELECT count(*) n FROM video_links WHERE video_id=?");
    const coverageByVideo = target.query("SELECT video_source_id,channel_source_id,source_kind,transcript_status,transcript_source,transcript_sha256,sqlite_sha256,raw_sha256,raw_path,transcript_cues,transcript_passages,description_status,description_source,description_sha256,description_passages,link_count,conflicts_json,errors_json FROM viberaven_video_coverage WHERE video_id=?");
    const sourcePayload = source.query("SELECT CASE WHEN length(raw_payload)<=? THEN raw_payload END raw_payload,length(raw_payload) payload_bytes,source_format,raw_sha256 FROM transcript_artifacts WHERE artifact_id=?");
    const sourceDescription = source.query("SELECT CASE WHEN length(CAST(description AS BLOB))<=? THEN description END description,length(CAST(description AS BLOB)) description_bytes FROM videos WHERE video_id=?");
    const sourceRecord = target.query("SELECT 1 FROM sources WHERE id=?");
    const metadataRecord = target.query("SELECT layer,video_id,channel_id,metadata_json FROM viberaven_source_metadata WHERE source_id=?");
    let sqliteVideos = 0, expectedSqlLinks = 0;
    for (const row of sourceVideoRows) {
      sourceIds.add(row.video_id); sqliteVideos++;
      const coverage = coverageByVideo.get(row.video_id) as any;
      if (!coverage || coverage.source_kind !== "sqlite") throw new TomeowlError("A SQLite video is not mapped exactly once in the library", "INCOMPLETE_LIBRARY");
      const errors = JSON.parse(coverage.errors_json), conflicts = JSON.parse(coverage.conflicts_json);
      const blockingConflict = conflicts.some((item: any) => ["multiple-current-sqlite-artifacts", "multiple-raw-transcripts", "invalid-sqlite-transcript-fell-back-to-raw", "transcript-cues-differ", "normalized-segment-count-mismatch"].includes(item.kind));
      if (!Array.isArray(errors) || errors.length || blockingConflict || ["missing", "invalid", "oversized", "conflict-raw-newer", "conflict-sqlite-current"].includes(coverage.transcript_status) || ["missing", "oversized"].includes(coverage.description_status)) throw new TomeowlError("Library contains incomplete or conflicting per-video resources", "INCOMPLETE_LIBRARY");
      const videoIdExpected = sourceIdFor("video", row.video_id);
      if (coverage.video_source_id !== videoIdExpected || !sourceRecord.get(coverage.video_source_id) || !sourceRecord.get(coverage.channel_source_id)) throw new TomeowlError("A mapped video or channel source is missing", "INCOMPLETE_LIBRARY");
      const videoMeta = metadataRecord.get(coverage.video_source_id) as any;
      if (!videoMeta || videoMeta.layer !== "video" || videoMeta.video_id !== row.video_id || videoMeta.channel_id !== coverage.channel_source_id) throw new TomeowlError("A mapped video source has inconsistent identity metadata", "INCOMPLETE_LIBRARY");
      const artifact = currentArtifact.get(row.video_id) as any;
      if (coverage.transcript_source === "sqlite-current") {
        if (!artifact || artifact.raw_sha256 !== coverage.sqlite_sha256) throw new TomeowlError("Current SQLite transcript provenance does not match source", "SOURCE_MISMATCH");
        const segments = segmentInfo.get(artifact.artifact_id) as { n: number } | null;
        if (coverage.transcript_cues !== (segments?.n ?? 0)) throw new TomeowlError("Mapped cue count differs from normalized SQLite segments", "SOURCE_MISMATCH");
      } else if (coverage.transcript_source === "raw-json-fallback" && !coverage.raw_path) throw new TomeowlError("Raw transcript fallback has no archived source path", "INCOMPLETE_LIBRARY");
      expectedSqlLinks += (sourceVideoLinkCount.get(row.video_id) as { n: number }).n;
    }

    const targetCoverage = target.query("SELECT video_id,video_source_id,channel_source_id,source_kind,raw_path FROM viberaven_video_coverage").iterate() as IterableIterator<any>;
    let rawOnlyVideos = 0, mappedVideos = 0;
    for (const row of targetCoverage) {
      mappedVideos++;
      const coverage = coverageByVideo.get(row.video_id) as any;
      const errors = JSON.parse(coverage.errors_json), conflicts = JSON.parse(coverage.conflicts_json);
      const blockingConflict = conflicts.some((item: any) => ["multiple-current-sqlite-artifacts", "multiple-raw-transcripts", "invalid-sqlite-transcript-fell-back-to-raw", "transcript-cues-differ", "normalized-segment-count-mismatch"].includes(item.kind));
      if (!Array.isArray(errors) || errors.length || blockingConflict || ["missing", "invalid", "oversized", "conflict-raw-newer", "conflict-sqlite-current"].includes(coverage.transcript_status) || ["missing", "oversized"].includes(coverage.description_status)) throw new TomeowlError("Library contains incomplete or conflicting per-video resources", "INCOMPLETE_LIBRARY");
      if (row.video_source_id !== sourceIdFor("video", row.video_id) || !sourceRecord.get(row.video_source_id) || !sourceRecord.get(row.channel_source_id)) throw new TomeowlError("A mapped video or channel source is missing", "INCOMPLETE_LIBRARY");
      const videoMeta = metadataRecord.get(row.video_source_id) as any;
      if (!videoMeta || videoMeta.layer !== "video" || videoMeta.video_id !== row.video_id || videoMeta.channel_id !== row.channel_source_id) throw new TomeowlError("A mapped video source has inconsistent identity metadata", "INCOMPLETE_LIBRARY");
      const copiedVideoLinks = (target.query("SELECT count(*) n FROM viberaven_video_links WHERE video_id=?").get(row.video_id) as { n: number }).n;
      if (copiedVideoLinks !== coverage.link_count || (row.source_kind === "raw-only" && copiedVideoLinks !== 0)) throw new TomeowlError("Per-video link counts do not match copied provenance", "SOURCE_MISMATCH");
      let sqliteText: string | undefined;
      const artifact = row.source_kind === "sqlite" ? currentArtifact.get(row.video_id) as any : undefined;
      if (coverage.transcript_source === "sqlite-current" || coverage.description_source === "sqlite-payload.description") {
        if (!artifact) throw new TomeowlError("Chosen SQLite content has no current source artifact", "SOURCE_MISMATCH");
        const payload = sourcePayload.get(maxBytes, artifact.artifact_id) as any;
        if (!payload || payload.payload_bytes > maxBytes) throw new TomeowlError("Selected SQLite transcript exceeds its configured hash bound", "SOURCE_MISMATCH");
        if (payload.source_format !== "json") throw new TomeowlError("Selected SQLite transcript format changed", "SOURCE_MISMATCH");
        sqliteText = ensureUtf8(bytesOf(payload.raw_payload));
        const actualSqlHash = hash(sqliteText);
        if (actualSqlHash !== payload.raw_sha256 || actualSqlHash !== coverage.sqlite_sha256 || artifact.raw_sha256 !== actualSqlHash) throw new TomeowlError("Selected SQLite transcript hash changed", "SOURCE_MISMATCH");
      }
      let rawText: string | undefined;
      if (row.raw_path) {
        if (!raw || !coverage.raw_sha256) throw new TomeowlError("Stored raw transcript has no declared source hash", "SOURCE_MISMATCH");
        const rawBytes = readBounded(row.raw_path, maxBytes, raw.root).bytes;
        rawText = ensureUtf8(rawBytes);
        const actualRawHash = hash(rawText);
        if (actualRawHash !== coverage.raw_sha256) throw new TomeowlError("Archived raw transcript hash changed", "SOURCE_MISMATCH");
      } else if (coverage.raw_sha256) throw new TomeowlError("Archived raw transcript hash has no declared path", "SOURCE_MISMATCH");
      if (coverage.transcript_source === "sqlite-current" && coverage.transcript_sha256 !== coverage.sqlite_sha256) throw new TomeowlError("Selected transcript hash does not match its SQLite artifact", "SOURCE_MISMATCH");
      if (coverage.transcript_source === "raw-json-fallback" && coverage.transcript_sha256 !== coverage.raw_sha256) throw new TomeowlError("Selected transcript hash does not match its raw artifact", "SOURCE_MISMATCH");
      let chosenDescription: string | undefined;
      if (coverage.description_source === "videos.description") {
        const rowDescription = sourceDescription.get(maxBytes, row.video_id) as any;
        if (!rowDescription || rowDescription.description_bytes > maxBytes || typeof rowDescription.description !== "string") throw new TomeowlError("Chosen videos.description is absent or exceeds its configured hash bound", "SOURCE_MISMATCH");
        chosenDescription = rowDescription.description;
      } else if (coverage.description_source === "sqlite-payload.description") {
        if (sqliteText === undefined) throw new TomeowlError("Chosen SQLite description has no verified payload", "SOURCE_MISMATCH");
        let value: any; try { value = JSON.parse(sqliteText); } catch { throw new TomeowlError("Chosen SQLite description payload is no longer valid JSON", "SOURCE_MISMATCH"); }
        if (value.video_id !== row.video_id || typeof value.description !== "string") throw new TomeowlError("Chosen SQLite description field changed", "SOURCE_MISMATCH");
        chosenDescription = value.description;
      } else if (coverage.description_source === "raw-json.description") {
        if (rawText === undefined) throw new TomeowlError("Chosen raw JSON description has no verified transcript", "SOURCE_MISMATCH");
        let value: any; try { value = JSON.parse(rawText); } catch { throw new TomeowlError("Chosen raw description transcript is no longer valid JSON", "SOURCE_MISMATCH"); }
        if (value.video_id !== row.video_id || typeof value.description !== "string") throw new TomeowlError("Chosen raw JSON description field changed", "SOURCE_MISMATCH");
        chosenDescription = value.description;
      } else if (coverage.description_source === "description.txt") {
        if (!raw) throw new TomeowlError("Chosen description.txt requires the configured archive root", "SOURCE_MISMATCH");
        const passageMeta = target.query("SELECT metadata_json FROM viberaven_source_metadata WHERE video_id=? AND layer='description' ORDER BY ordinal LIMIT 1").get(row.video_id) as { metadata_json: string } | null;
        const declaredPath = passageMeta ? (JSON.parse(passageMeta.metadata_json) as any).media?.originalPath : undefined;
        const candidates = raw.videos.get(row.video_id)?.flatMap((candidate: RawCandidate) => candidate.description && !candidate.description.error ? [candidate.description] : []) ?? [];
        const matching: Array<{ path: string; text: string }> = [];
        for (const candidate of candidates) {
          if (declaredPath && keyPath(resolve(candidate.path)) !== keyPath(resolve(declaredPath))) continue;
          const text = ensureUtf8(readBounded(candidate.path, maxBytes, raw.root).bytes);
          if (hash(text) === coverage.description_sha256) matching.push({ path: candidate.path, text });
        }
        if (!matching.length || (!declaredPath && matching.length !== 1)) throw new TomeowlError("Chosen description.txt hash or source path changed", "SOURCE_MISMATCH");
        chosenDescription = matching[0]!.text;
      } else throw new TomeowlError("Chosen description source is missing or unknown", "INCOMPLETE_LIBRARY");
      if (hash(chosenDescription) !== coverage.description_sha256) throw new TomeowlError("Chosen description hash changed", "SOURCE_MISMATCH");
      if (row.source_kind === "sqlite") {
        if (!sourceIds.has(row.video_id)) throw new TomeowlError("Library has an unmapped SQLite identity", "SOURCE_MISMATCH");
      } else if (row.source_kind === "raw-only") {
        if (!raw || sourceIds.has(row.video_id) || !raw.videos.has(row.video_id)) throw new TomeowlError("Raw-only library identity is absent from the configured archive", "SOURCE_MISMATCH");
        rawOnlyVideos++;
      } else throw new TomeowlError("Library has an unknown video source kind", "INCOMPLETE_LIBRARY");
      if (row.raw_path) {
        const paths = raw?.videos.get(row.video_id)?.flatMap((candidate: RawCandidate) => candidate.transcript && !candidate.transcript.error ? [resolve(candidate.transcript.path)] : []) ?? [];
        if (!raw || !inside(resolve(row.raw_path), raw.root) || !paths.includes(resolve(row.raw_path))) throw new TomeowlError("Stored raw transcript path does not match the configured archive", "SOURCE_MISMATCH");
      }
    }
    const rawOnlyExpected = raw ? [...raw.videos.keys()].filter(videoId => !sourceIds.has(videoId)).length : 0;
    if (mappedVideos !== sqliteVideos + rawOnlyExpected || rawOnlyVideos !== rawOnlyExpected) throw new TomeowlError("Source and library video identity counts do not match", "SOURCE_MISMATCH");

    const sourceLinkRows = source.query("SELECT link_id,video_id,url,domain,created_at FROM video_links ORDER BY link_id").iterate() as IterableIterator<any>;
    const findLibraryLink = target.query("SELECT video_id,url,domain,created_at FROM viberaven_video_links WHERE link_id=?");
    let sourceLinks = 0, mismatchedLinks = 0;
    for (const link of sourceLinkRows) {
      sourceLinks++;
      const copied = findLibraryLink.get(link.link_id) as any;
      if (!copied || copied.video_id !== link.video_id || copied.url !== link.url || copied.domain !== link.domain || copied.created_at !== link.created_at) mismatchedLinks++;
    }
    const libraryLinks = (target.query("SELECT count(*) n FROM viberaven_video_links").get() as { n: number }).n;
    if (sourceLinks !== libraryLinks || mismatchedLinks || expectedSqlLinks !== sourceLinks) throw new TomeowlError("Video link provenance does not match source SQLite", "SOURCE_MISMATCH");

    const metadataCounts = target.query("SELECT layer,count(*) n FROM viberaven_source_metadata GROUP BY layer").all() as Array<{ layer: string; n: number }>;
    const layerCounts = Object.fromEntries(metadataCounts.map(row => [row.layer, row.n])) as Record<string, number>;
    const expectedStructural = sqliteVideos + rawOnlyVideos + (layerCounts.description ?? 0) + (layerCounts.transcript ?? 0);
    const structuralRelations = (target.query("SELECT count(*) n FROM relations WHERE basis='structural' AND kind='contains'").get() as { n: number }).n;
    const danglingStructural = (target.query("SELECT count(*) n FROM relations r WHERE r.basis='structural' AND r.kind='contains' AND (NOT EXISTS(SELECT 1 FROM viberaven_source_metadata p WHERE p.source_id=r.source_id) OR NOT EXISTS(SELECT 1 FROM viberaven_source_metadata c WHERE c.source_id=r.target_id) OR NOT ((SELECT layer FROM viberaven_source_metadata WHERE source_id=r.source_id)='channel' AND (SELECT layer FROM viberaven_source_metadata WHERE source_id=r.target_id)='video' AND (SELECT channel_id FROM viberaven_source_metadata WHERE source_id=r.target_id)=r.source_id OR (SELECT layer FROM viberaven_source_metadata WHERE source_id=r.source_id)='video' AND (SELECT layer FROM viberaven_source_metadata WHERE source_id=r.target_id) IN ('description','transcript') AND json_extract((SELECT metadata_json FROM viberaven_source_metadata WHERE source_id=r.target_id),'$.media.parentId')=r.source_id))").get() as { n: number }).n;
    if (layerCounts.video !== mappedVideos || layerCounts.channel !== target.query("SELECT count(DISTINCT channel_source_id) n FROM viberaven_video_coverage").get()!.n || structuralRelations !== expectedStructural || danglingStructural) throw new TomeowlError("Structural media graph has missing or invalid endpoints", "INCOMPLETE_LIBRARY");
    const structuralEvidence = target.query("SELECT source_id,target_id,evidence FROM relations WHERE basis='structural' AND kind='contains'").iterate() as IterableIterator<{source_id:string;target_id:string;evidence:string}>;
    for (const relation of structuralEvidence) {
      const citations=JSON.parse(relation.evidence) as Evidence[];
      if (!citations.some(citation=>citation.sourceId===relation.source_id) || !citations.some(citation=>citation.sourceId===relation.target_id)) throw new TomeowlError("A structural media edge is missing endpoint citations", "INCOMPLETE_LIBRARY");
    }

    const maxStoredRawPath = raw ? null : target.query("SELECT 1 FROM viberaven_video_coverage WHERE raw_path IS NOT NULL LIMIT 1").get();
    if (maxStoredRawPath) throw new TomeowlError("Stored raw transcript paths require the configured archive root", "SOURCE_MISMATCH");
    const rawBytes = (source.query("SELECT coalesce(sum(length(raw_payload)),0) bytes FROM transcript_artifacts WHERE is_current=1").get() as { bytes: number }).bytes + (raw ? [...raw.videos.values()].flatMap(candidates => candidates.flatMap(candidate => [candidate.transcript,candidate.description])).reduce((sum, file) => sum + (file?.size ?? 0), 0) : 0);
    const channelCount = layerCounts.channel ?? 0, descriptionPassages = layerCounts.description ?? 0, transcriptPassages = layerCounts.transcript ?? 0;
    source.exec("COMMIT;");

    const provisionalCoverage = { sqliteVideos, rawOnlyVideos, mappedVideos, channels: channelCount, descriptionPassages, transcriptPassages, structuralRelations, lexicalLinks: 0, videoLinks: sourceLinks, rawBytes, omissions: raw?.counts.omissions ?? {}, complete: false };
    const provisionalProvenance = { schemaVersion: 1, createdAt: priorProvenance.createdAt ?? writeStartedAt, finalizedAt: null, source: { database: sourcePath, root: raw?.root ?? null, readOnly: true, readTransaction: true }, inputBounds: { maxArtifactBytes: maxBytes, maxCues }, coverage: provisionalCoverage, lexical: { method: "FTS5 candidate retrieval followed by corpus-IDF TF-IDF cosine", candidateLimit, minimumScore: .28, minimumSharedTerms: 3, maximumDegree: 2, semanticInference: false }, rawDiscovery: raw?.counts ?? null, omissions: raw?.counts.omissions ?? {} };
    target.transaction(() => {
      target.exec("DELETE FROM relations WHERE basis='lexical'; DELETE FROM viberaven_lexical_edges; DROP TABLE IF EXISTS viberaven_vocab; DROP TABLE IF EXISTS viberaven_lexical_degree;");
      target.query("UPDATE viberaven_library SET completed_at=NULL,complete=0,source_database=?,source_root=?,coverage_json=?,provenance_json=? WHERE singleton=1").run(sourcePath,raw?.root??null,JSON.stringify(provisionalCoverage),JSON.stringify(provisionalProvenance));
    })();
    writeReportFile(join(libraryDirectory,"coverage.json"),JSON.stringify(provisionalCoverage,null,2));
    writeReportFile(join(libraryDirectory,"provenance.json"),JSON.stringify(provisionalProvenance,null,2));

    const lexical = lexicalEdges(target, candidateLimit);
    const coverage = { ...provisionalCoverage, lexicalLinks: lexical.links, complete: true };
    const provenance = { ...provisionalProvenance, finalizedAt: new Date().toISOString(), coverage, lexical: { ...provisionalProvenance.lexical, candidateLimit: lexical.candidatesPerPassage } };
    writeReportFile(join(libraryDirectory,"coverage.json"),JSON.stringify({ ...coverage, complete: false },null,2));
    writeReportFile(join(libraryDirectory,"provenance.json"),JSON.stringify({ ...provenance, finalizedAt: null, coverage: { ...coverage, complete: false } },null,2));
    target.query("UPDATE viberaven_library SET completed_at=?,complete=1,source_database=?,source_root=?,coverage_json=?,provenance_json=? WHERE singleton=1").run(provenance.finalizedAt,sourcePath,raw?.root??null,JSON.stringify(coverage),JSON.stringify(provenance));
    try {
      writeReportFile(join(libraryDirectory,"coverage.json"),JSON.stringify(coverage,null,2));
      writeReportFile(join(libraryDirectory,"provenance.json"),JSON.stringify(provenance,null,2));
    } catch (error) {
      target.query("UPDATE viberaven_library SET completed_at=NULL,complete=0,coverage_json=?,provenance_json=? WHERE singleton=1").run(JSON.stringify({ ...coverage, complete:false }),JSON.stringify({ ...provenance, finalizedAt:null, coverage:{ ...coverage, complete:false } }));
      throw error;
    }
    return { database: libraryPath, coverage, provenance };
  } catch (error) {
    try { source.exec("ROLLBACK;"); } catch {}
    throw error;
  } finally { source.close(); target.close(); }
}

function snapshotFromRows(db: Database, selected: string[], total: number, view: { type: string; offset: number; nextOffset: number|null; omitted: number; limit: number }, coverage: any, provenance: any): Snapshot {
  const ids=new Set(selected), sources:ViewerSource[]=[];
  const stmt=db.query(`SELECT s.id,s.title,s.path,s.collection,s.url,s.kind,s.revision,COUNT(c.id) chunkCount,
    (SELECT c.id FROM chunks c WHERE c.source_id=s.id AND c.revision=s.revision ORDER BY c.ordinal LIMIT 1) chunkId,
    (SELECT c.body FROM chunks c WHERE c.source_id=s.id AND c.revision=s.revision ORDER BY c.ordinal LIMIT 1) quote,
    (SELECT c.locator FROM chunks c WHERE c.source_id=s.id AND c.revision=s.revision ORDER BY c.ordinal LIMIT 1) locator,
    m.metadata_json FROM sources s JOIN viberaven_source_metadata m ON m.source_id=s.id LEFT JOIN chunks c ON c.source_id=s.id AND c.revision=s.revision
    WHERE s.id=? GROUP BY s.id`);
  for(const id of selected){const row=stmt.get(id) as any;if(!row)continue;const meta=JSON.parse(row.metadata_json);if(meta.media?.cueSpans)delete meta.media.cueSpans;sources.push({id:row.id,title:row.title,path:row.path,collection:row.collection,...(row.url?{url:row.url}:{}),kind:row.kind,revision:row.revision,chunkCount:row.chunkCount,...meta,excerpt:row.chunkId?{quote:row.quote,chunkId:row.chunkId,locator:JSON.parse(row.locator)}:undefined});}
  const marks=selected.map(()=>"?").join(",");
  const relRows=selected.length?db.query(`SELECT id,source_id source,target_id target,kind,basis,evidence FROM relations WHERE source_id IN (${marks}) AND target_id IN (${marks}) ORDER BY id`).all(...selected,...selected) as any[]:[];
  const relations=relRows.map(row=>{
    const citations=JSON.parse(row.evidence) as Evidence[];
    const extra=db.query("SELECT score,shared_terms FROM viberaven_lexical_edges WHERE relation_id=?").get(row.id) as any;
    return {id:row.id,source:row.source,target:row.target,kind:row.kind,basis:row.basis,evidence:citations,directed:row.kind==="contains",...(extra?{score:extra.score,sharedTerms:JSON.parse(extra.shared_terms)}:{})};
  });
  const channelCount=sources.filter(source=>source.layer==="channel").length;
  const videoCount=sources.filter(source=>source.layer==="video").length;
  const descriptionChunks=sources.filter(source=>source.layer==="description").length;
  const transcriptChunks=sources.filter(source=>source.layer==="transcript").length;
  const media={name:"Viberaven video library",channelCount,videoCount,descriptionChunks,transcriptChunks,lexicalLinks:relations.filter(relation=>relation.basis==="lexical").length,totalVideos:coverage.mappedVideos,totalChannels:coverage.channels,warnings:[`View coverage: showing ${sources.length} of ${total} selected sources; ${view.omitted} omitted from this page.`,...(coverage.complete?[]:["Library coverage is incomplete; inspect coverage.json and per-video coverage in videos.sqlite."]),"Directed graph arrows show channel/video/content ownership. Dashed lexical links are bounded FTS5 candidate heuristics, not semantic inference."]};
  return {schemaVersion:1,generatedAt:new Date().toISOString(),stats:{sources:sources.length,chunks:sources.reduce((n,s)=>n+s.chunkCount,0),relations:relations.length},sources,relations,media} as Snapshot;
}

export async function exportLibraryView(options: { database: string; output: string; videoId?: string; channelUrl?: string; limit?: number; offset?: number }) {
  if(options.videoId&&options.channelUrl)throw new TomeowlError("Choose either videoId or channelUrl", "INVALID_VIEW");
  const limit=options.limit??MAX_VIEW,offset=options.offset??0;
  if(!Number.isInteger(limit)||limit<1||limit>MAX_VIEW||!Number.isSafeInteger(offset)||offset<0)throw new TomeowlError("limit must be 1–400 and offset a non-negative integer", "INVALID_VIEW");
  if(options.videoId&&limit<3)throw new TomeowlError("Video views require limit >= 3 for channel and video context", "INVALID_VIEW");
  if(options.channelUrl&&limit<3)throw new TomeowlError("Channel views require limit >= 3 for channel and video context", "INVALID_VIEW");
  const output=resolve(options.output);
  const db=openExistingStore(resolve(options.database));
  try{
    const library=db.query("SELECT coverage_json,provenance_json FROM viberaven_library WHERE singleton=1").get() as any;
    if(!library)throw new TomeowlError("Database is not a VibeRaven library", "DATABASE_NOT_LIBRARY");
    const coverage=JSON.parse(library.coverage_json),provenance=JSON.parse(library.provenance_json);
    const sourceRoots=[dirname(realpathSync(resolve(options.database))),...(provenance.source?.database?[dirname(resolve(provenance.source.database))]:[]),...(provenance.source?.root?[resolve(provenance.source.root)]:[])];
    validateOutput(output,sourceRoots);
    let selected:string[]=[],total=0,nextOffset:number|null=null,viewType="overview";
    if(options.videoId){
      viewType="video";
      const row=db.query("SELECT video_source_id,channel_source_id FROM viberaven_video_coverage WHERE video_id=?").get(options.videoId) as any;
      if(!row)throw new TomeowlError(`Unknown video ID: ${options.videoId}`, "NOT_FOUND");
      const contentCount=(db.query("SELECT count(*) n FROM viberaven_source_metadata WHERE video_id=? AND layer IN ('description','transcript')").get(options.videoId) as {n:number}).n;
      if(offset>contentCount)throw new TomeowlError("offset exceeds video content count", "INVALID_VIEW");
      const page=db.query("SELECT source_id FROM viberaven_source_metadata WHERE video_id=? AND layer IN ('description','transcript') ORDER BY CASE layer WHEN 'description' THEN 0 ELSE 1 END,ordinal,source_id LIMIT ? OFFSET ?").all(options.videoId,limit-2,offset) as Array<{source_id:string}>;
      total=contentCount+2;selected=[row.channel_source_id,row.video_source_id,...page.map(item=>item.source_id)];
      if(offset+page.length<contentCount)nextOffset=offset+page.length;
    }else if(options.channelUrl){
      viewType="channel";const channel=canonicalChannel(options.channelUrl)??options.channelUrl;
      const channelRow=db.query("SELECT source_id FROM viberaven_source_metadata WHERE layer='channel' AND json_extract(metadata_json,'$.media.channelUrl')=? ORDER BY source_id LIMIT 1").get(channel) as any;
      if(!channelRow)throw new TomeowlError(`Unknown channel URL: ${options.channelUrl}`, "NOT_FOUND");
      const channelNodes="SELECT m.source_id,m.layer,m.video_id,m.ordinal,(SELECT p.source_id FROM viberaven_source_metadata p WHERE p.layer='video' AND p.video_id=m.video_id) video_source_id FROM viberaven_source_metadata m WHERE m.layer IN ('video','description','transcript') AND m.channel_id=(SELECT channel_id FROM viberaven_source_metadata WHERE source_id=?)";
      const nodeCount=(db.query(`SELECT count(*) n FROM viberaven_source_metadata WHERE layer IN ('video','description','transcript') AND channel_id=(SELECT channel_id FROM viberaven_source_metadata WHERE source_id=?)`).get(channelRow.source_id) as {n:number}).n;
      if(offset>nodeCount)throw new TomeowlError("offset exceeds channel node count", "INVALID_VIEW");
      const page=db.query(`${channelNodes} ORDER BY m.video_id,CASE m.layer WHEN 'video' THEN 0 WHEN 'description' THEN 1 ELSE 2 END,m.ordinal,m.source_id LIMIT ? OFFSET ?`).all(channelRow.source_id,limit,offset) as Array<{source_id:string;layer:string;video_id:string;video_source_id:string;ordinal:number}>;
      selected=[channelRow.source_id];let consumed=0;
      for(const node of page){const required=node.layer==="video"?[node.source_id]:[node.video_source_id,node.source_id];const additions=required.filter(id=>id&&!selected.includes(id));if(selected.length+additions.length>limit)break;selected.push(...additions);consumed++;}
      total=nodeCount+1;if(offset+consumed<nodeCount)nextOffset=offset+consumed;
    }else{
      const channelTotal=(db.query("SELECT count(*) n FROM viberaven_source_metadata WHERE layer='channel'").get() as {n:number}).n;total=coverage.mappedVideos+channelTotal;
      if(channelTotal>=limit){viewType="overview-channels";if(offset>channelTotal)throw new TomeowlError("offset exceeds channel count", "INVALID_VIEW");const page=db.query("SELECT source_id FROM viberaven_source_metadata WHERE layer='channel' ORDER BY source_id LIMIT ? OFFSET ?").all(limit,offset) as Array<{source_id:string}>;selected=page.map(row=>row.source_id);if(offset+page.length<channelTotal)nextOffset=offset+page.length;}
      else{if(offset>coverage.mappedVideos)throw new TomeowlError("offset exceeds video count", "INVALID_VIEW");const channelIds=(db.query("SELECT source_id FROM viberaven_source_metadata WHERE layer='channel' ORDER BY source_id").all() as Array<{source_id:string}>).map(row=>row.source_id),videoLimit=limit-channelTotal;const videos=db.query("SELECT source_id FROM viberaven_source_metadata WHERE layer='video' ORDER BY source_id LIMIT ? OFFSET ?").all(videoLimit,offset) as Array<{source_id:string}>;selected=[...channelIds,...videos.map(item=>item.source_id)];if(offset+videos.length<coverage.mappedVideos)nextOffset=offset+videos.length;}
    }
    const omitted=Math.max(0,total-selected.length),view={type:viewType,offset,nextOffset,omitted,limit};
    const snapshot=snapshotFromRows(db,selected,total,view,coverage,provenance);
    const mediaView={...snapshot.media,view:{...view,shown:snapshot.sources.length,total,available:total}};
    (snapshot as any).media=mediaView;
    const viewDir=output;mkdirSync(dirname(viewDir),{recursive:true});mkdirSync(viewDir);
    const snapshotPath=join(viewDir,"videos.snapshot.json"),htmlPath=join(viewDir,"videos.html"),viewPath=join(viewDir,"view.json");
    writeFileSync(snapshotPath,JSON.stringify(snapshot,null,2),{flag:"wx"});writeFileSync(htmlPath,await renderSnapshot(snapshot),{flag:"wx"});writeFileSync(viewPath,JSON.stringify({schemaVersion:1,view,shown:snapshot.sources.length,total,omitted,nextOffset,coverage,provenance:{source:provenance.source,lexical:provenance.lexical}},null,2),{flag:"wx"});
    const qmdDir=join(viewDir,"qmd");mkdirSync(qmdDir);
    for(const source of snapshot.sources){const detail=db.query("SELECT c.body,c.locator,c.ordinal FROM chunks c WHERE c.source_id=? AND c.revision=? ORDER BY c.ordinal").all(source.id,source.revision) as any[];const projected=projectMarkdown({id:source.id,title:source.title,path:source.path,collection:source.collection,kind:source.kind,revision:source.revision,chunkCount:source.chunkCount,scope:""},detail.map(row=>({id:hash(`${source.id}\0${source.revision}\0${row.ordinal}`).slice(0,32),sourceId:source.id,revision:source.revision,text:row.body,locator:JSON.parse(row.locator),ordinal:row.ordinal})));writeFileSync(join(qmdDir,`${source.id}.md`),projected.markdown,{flag:"wx"});}
    const links=options.videoId?db.query("SELECT link_id,video_id,url,domain,created_at FROM viberaven_video_links WHERE video_id=? ORDER BY link_id").all(options.videoId):[];
    return {snapshot,snapshotPath,htmlPath,viewPath,view:{...view,shown:snapshot.sources.length,total,omitted,nextOffset},links};
  }finally{db.close();}
}

export const libraryDefaults={database:DEFAULT_DATABASE,root:DEFAULT_ROOT,maxArtifactBytes:DEFAULT_MAX_BYTES,maxCues:DEFAULT_MAX_CUES,limit:MAX_VIEW};
