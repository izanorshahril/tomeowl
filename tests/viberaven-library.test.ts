import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { hash } from "../src/domain";
import { evidencePredicate } from "../src/evidence-query";
import { exportLibraryView, finalizeLibrary, importLibrary } from "../src/adapters/viberaven-library";

const owned: string[] = [];
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() { const root = mkdtempSync(join(tmpdir(), "tomeowl-library-")); owned.push(root); return root; }

function sourceDb(path: string) {
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA journal_mode=DELETE;
    CREATE TABLE videos(video_id TEXT PRIMARY KEY,channel_url TEXT,channel_name TEXT,video_url TEXT,title TEXT,published_at TEXT,language TEXT,language_code TEXT,is_generated INTEGER,artifact_path TEXT,artifact_sha256 TEXT,imported_at TEXT,description TEXT,extraction_status TEXT);
    CREATE TABLE transcript_artifacts(artifact_id INTEGER PRIMARY KEY,video_id TEXT,source_format TEXT,raw_sha256 TEXT,raw_payload BLOB,imported_at TEXT,retrieved_at TEXT,track_key TEXT,is_current INTEGER);
    CREATE TABLE transcript_segments(artifact_id INTEGER,parser_version TEXT,ordinal INTEGER,start_seconds REAL,end_seconds REAL,text TEXT);
    CREATE TABLE video_links(link_id INTEGER PRIMARY KEY,video_id TEXT,url TEXT,domain TEXT,created_at TEXT);
  `);
  return db;
}

function payload(id: string, cues: Array<{ text: string; start: number; end: number }>, description?: string) {
  return JSON.stringify({ video_id: id, title: `Video ${id}`, author_name: "Example", author_url: "https://www.youtube.com/@example",
    ...(description === undefined ? {} : { description }), total_snippets: cues.length, language_code: "en", is_generated: true,
    snippets: cues.map(cue => ({ ...cue })) });
}

function addVideo(db: Database, args: { id: string; cues?: Array<{ text: string; start: number; end: number }>; description?: string | null; payloadDescription?: string; linkCount?: number }) {
  const cues = args.cues ?? [{ text: "Graph retrieval preserves citations across video passages.", start: 0, end: 5 }];
  const description = args.description === undefined ? "A canonical description with source provenance." : args.description;
  const raw = payload(args.id, cues, args.payloadDescription === undefined ? (description ?? undefined) : args.payloadDescription);
  db.query("INSERT INTO videos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(args.id, "https://www.youtube.com/@example", "Example", `https://www.youtube.com/watch?v=${args.id}`,
    `Video ${args.id}`, "2024-01-02", "English", "en", 1, "../../untrusted-not-read.json", hash(raw), "2024-01-03", description, "ok");
  const artifactInsert = db.query("INSERT INTO transcript_artifacts(video_id,source_format,raw_sha256,raw_payload,imported_at,retrieved_at,track_key,is_current) VALUES (?,?,?,?,?,?,?,1)").run(args.id, "json", hash(raw), Buffer.from(raw), "2024-01-03", "2024-01-03", "en");
  const artifactId = Number(artifactInsert.lastInsertRowid);
  cues.forEach((cue, ordinal) => db.query("INSERT INTO transcript_segments VALUES (?,?,?,?,?,?)").run(artifactId, "fixture-v1", ordinal, cue.start, cue.end, cue.text));
  for (let index = 0; index < (args.linkCount ?? 0); index++) db.query("INSERT INTO video_links VALUES (?,?,?,?,?)").run(Number(db.query("SELECT coalesce(max(link_id),0)+1 n FROM video_links").get()!.n), args.id, `https://example.test/${index}`, "example.test", "2024-01-04");
  return raw;
}

function rawArtifact(root: string, channel: string, id: string, transcript: string, description: string) {
  const directory = join(root, channel, id); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "transcript.json"), transcript);
  writeFileSync(join(directory, "description.txt"), description);
  return directory;
}

test("full SQLite-only import maps every row, keeps provenance and source read-only", async () => {
  const dir = fixture(), sourceDirectory = join(dir, "source"), output = join(dir, "library"); mkdirSync(sourceDirectory);
  const database = join(sourceDirectory, "manifest.sqlite3"), db = sourceDb(database);
  for (let index = 0; index < 30; index++) {
    const id = `v${index.toString().padStart(10, "0")}`;
    addVideo(db, { id, description: index === 0 ? "" : index === 1 ? null : undefined, linkCount: index === 0 ? 2 : 1 });
  }
  const invalidId = "../../escape";
  db.query("INSERT INTO videos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(invalidId, null, "", null, "Invalid identity", null, null, null, null, "../../outside", null, null, null, "not_checked");
  db.close();
  const before = createHash("sha256").update(readFileSync(database)).digest("hex");
  const result = await importLibrary({ database, output, lexicalCandidates: 0 });
  const after = createHash("sha256").update(readFileSync(database)).digest("hex");
  expect(after).toBe(before);
  expect(result.coverage.sqliteVideos).toBe(31);
  expect(result.coverage.mappedVideos).toBe(31);
  expect(result.coverage.complete).toBe(false);
  expect(existsSync(result.database)).toBe(true);

  const out = new Database(result.database, { readonly: true });
  try {
    const coverage = out.query("SELECT video_id,transcript_status,description_status,link_count,errors_json FROM viberaven_video_coverage ORDER BY video_id").all() as any[];
    expect(coverage).toHaveLength(31);
    expect(coverage.find(row => row.video_id === "v0000000000")?.description_status).toBe("empty");
    expect(coverage.find(row => row.video_id === "v0000000001")?.description_status).toBe("missing");
    expect(coverage.find(row => row.video_id === invalidId)?.errors_json).toContain("invalid-video-id");
    expect(out.query("SELECT count(*) n FROM viberaven_video_links").get()!.n).toBe(31);
    const brokenPath = out.query("SELECT path FROM sources WHERE path LIKE '%invalid-%'").get() as { path: string } | null;
    expect(brokenPath).not.toBeNull();
    expect(relative(output, brokenPath!.path).startsWith("..")).toBe(false);
    const relations = out.query("SELECT source_id,target_id,evidence FROM relations").all() as Array<{ source_id: string; target_id: string; evidence: string }>;
    const sourceIds = new Set((out.query("SELECT id FROM sources").all() as Array<{ id: string }>).map(row => row.id));
    expect(relations.length).toBeGreaterThan(30);
    for (const relation of relations) {
      expect(sourceIds.has(relation.source_id)).toBe(true); expect(sourceIds.has(relation.target_id)).toBe(true);
      const citations = JSON.parse(relation.evidence);
      expect(citations.some((citation: any) => citation.sourceId === relation.source_id)).toBe(true);
      expect(citations.some((citation: any) => citation.sourceId === relation.target_id)).toBe(true);
    }
  } finally { out.close(); }
  await expect(importLibrary({ database, output: join(sourceDirectory, "nested-output"), lexicalCandidates: 0 })).rejects.toThrow("outside");
});

test("raw-only resources and description variants retain their origin and exact conflicts", async () => {
  const dir = fixture(), sourceDirectory = join(dir, "source"), archive = join(dir, "archive"), output = join(dir, "library");
  mkdirSync(sourceDirectory); mkdirSync(archive);
  const database = join(sourceDirectory, "manifest.sqlite3"), db = sourceDb(database);
  const id = "abcdefghijk", cues = [{ text: "The transcript cue remains canonical and cited.", start: 8.25, end: 10.5 }];
  const databaseText = addVideo(db, { id, cues, description: "Canonical description.\n", payloadDescription: "SQLite payload description." });
  const rawJson = payload(id, cues, "Enriched JSON description.");
  const rawDirectory = rawArtifact(archive, "Example", id, rawJson, "Canonical description.\r\n"), rawTranscriptPath = join(rawDirectory, "transcript.json");
  const rawOnlyId = "lmnopqrstuv", rawOnlyText = payload(rawOnlyId, cues, "Raw-only description.");
  rawArtifact(archive, "Example", rawOnlyId, rawOnlyText, "Raw-only description.");
  db.close();
  const result = await importLibrary({ database, root: archive, output, lexicalCandidates: 0 });
  expect(result.coverage.sqliteVideos).toBe(1);
  expect(result.coverage.rawOnlyVideos).toBe(1);
  expect(result.coverage.mappedVideos).toBe(2);

  const out = new Database(result.database, { readonly: true });
  try {
    const sqlRow = out.query("SELECT transcript_status,transcript_source,description_status,description_source,conflicts_json FROM viberaven_video_coverage WHERE video_id=?").get(id) as any;
    expect(sqlRow.transcript_status).toBe("sqlite-current");
    expect(sqlRow.description_source).toBe("videos.description");
    expect(sqlRow.conflicts_json).toContain("description-newline-variant");
    expect(out.query("SELECT source,path,content FROM viberaven_description_conflicts WHERE video_id=?").get(id)).toEqual({ source: "raw-json.description", path: expect.stringContaining("transcript.json"), content: "Enriched JSON description." });
    expect(out.query("SELECT source_kind,transcript_status,description_status FROM viberaven_video_coverage WHERE video_id=?").get(rawOnlyId)).toEqual({ source_kind: "raw-only", transcript_status: "raw-fallback", description_status: "available" });
    const transcriptMeta = out.query("SELECT metadata_json FROM viberaven_source_metadata WHERE video_id=? AND layer='transcript' LIMIT 1").get(id) as { metadata_json: string };
    const cueSpan = JSON.parse(transcriptMeta.metadata_json).media.cueSpans[0];
    expect(cueSpan).toEqual({ ordinal: 0, start: 8.25, end: 10.5, charStart: 0, charEnd: cues[0]!.text.length });
    expect(databaseText).not.toBe(rawJson);
  } finally { out.close(); }
  const interrupted = new Database(result.database);
  const stalePassages = interrupted.query("SELECT s.id source_id,s.revision,c.id chunk_id,c.body quote,c.locator FROM viberaven_source_metadata m JOIN sources s ON s.id=m.source_id JOIN chunks c ON c.source_id=s.id AND c.revision=s.revision WHERE m.video_id=? AND m.layer IN ('description','transcript') ORDER BY m.layer").all(id) as any[];
  expect(stalePassages).toHaveLength(2);
  const staleId = "stale-same-video-edge";
  const staleEvidence = stalePassages.map(row => ({ sourceId: row.source_id, revision: row.revision, chunkId: row.chunk_id, quote: row.quote, locator: JSON.parse(row.locator) }));
  interrupted.query("INSERT INTO relations(id,source_id,target_id,kind,basis,evidence) VALUES (?,?,?,'similar','lexical',?)").run(staleId, stalePassages[0]!.source_id, stalePassages[1]!.source_id, JSON.stringify(staleEvidence));
  interrupted.query("INSERT INTO viberaven_lexical_edges(relation_id,score,shared_terms) VALUES (?,?,?)").run(staleId, 1, JSON.stringify(["stale", "same", "video"]));
  interrupted.query("UPDATE viberaven_library SET complete=1,source_database='',source_root=NULL,coverage_json='{}',provenance_json='{}' WHERE singleton=1").run();
  interrupted.close();
  const expectUnchangedAfterRejection = () => {
    const check = new Database(result.database, { readonly: true });
    try { expect(check.query("SELECT 1 FROM relations WHERE id=?").get(staleId)).not.toBeNull(); expect(check.query("SELECT complete FROM viberaven_library WHERE singleton=1").get()!.complete).toBe(1); }
    finally { check.close(); }
  };
  writeFileSync(rawTranscriptPath, payload(id, cues, "Changed at the original path."));
  await expect(finalizeLibrary({ database, libraryDatabase: result.database, root: archive, lexicalCandidates: 8 })).rejects.toThrow("Archived raw transcript hash changed");
  expectUnchangedAfterRejection();
  writeFileSync(rawTranscriptPath, rawJson);
  const sourceMutation = new Database(database);
  sourceMutation.query("UPDATE videos SET description=? WHERE video_id=?").run("Changed canonical description.", id);
  sourceMutation.close();
  await expect(finalizeLibrary({ database, libraryDatabase: result.database, root: archive, lexicalCandidates: 8 })).rejects.toThrow("Chosen description hash changed");
  expectUnchangedAfterRejection();
  const alteredSqlitePayload = payload(id, cues, "Changed SQLite payload.");
  const changePayload = new Database(database);
  changePayload.query("UPDATE transcript_artifacts SET raw_payload=? WHERE video_id=? AND is_current=1").run(Buffer.from(alteredSqlitePayload), id);
  changePayload.close();
  await expect(finalizeLibrary({ database, libraryDatabase: result.database, root: archive, lexicalCandidates: 8 })).rejects.toThrow("Selected SQLite transcript hash changed");
  expectUnchangedAfterRejection();
  const restoreSource = new Database(database);
  restoreSource.query("UPDATE videos SET description=? WHERE video_id=?").run("Canonical description.\n", id);
  restoreSource.query("UPDATE transcript_artifacts SET raw_payload=? WHERE video_id=? AND is_current=1").run(Buffer.from(databaseText), id);
  restoreSource.close();
  const restoreLibrary = new Database(result.database);
  restoreLibrary.query("UPDATE viberaven_library SET complete=0 WHERE singleton=1").run();
  restoreLibrary.close();
  const finalized = await finalizeLibrary({ database, libraryDatabase: result.database, root: archive, lexicalCandidates: 8 });
  expect(finalized.coverage.complete).toBe(true);
  expect(finalized.coverage.mappedVideos).toBe(2);
  expect(JSON.parse(readFileSync(join(output, "coverage.json"), "utf8")).complete).toBe(true);
  expect(JSON.parse(readFileSync(join(output, "provenance.json"), "utf8")).source.root).toBe(archive);
  const rebuilt = new Database(result.database, { readonly: true });
  try {
    expect(rebuilt.query("SELECT 1 FROM relations WHERE id=?").get(staleId)).toBeNull();
    const rebuiltEdges = rebuilt.query("SELECT r.source_id,r.target_id,l.shared_terms FROM relations r JOIN viberaven_lexical_edges l ON l.relation_id=r.id").all() as any[];
    expect(rebuiltEdges.length).toBeGreaterThan(0);
    for (const edge of rebuiltEdges) {
      const from = rebuilt.query("SELECT video_id FROM viberaven_source_metadata WHERE source_id=?").get(edge.source_id)!.video_id;
      const to = rebuilt.query("SELECT video_id FROM viberaven_source_metadata WHERE source_id=?").get(edge.target_id)!.video_id;
      expect(from).not.toBe(to);
      expect(JSON.parse(edge.shared_terms).length).toBeGreaterThanOrEqual(3);
    }
    const degrees = rebuilt.query("SELECT source_id,COUNT(*) degree FROM (SELECT source_id FROM relations WHERE basis='lexical' UNION ALL SELECT target_id source_id FROM relations WHERE basis='lexical') GROUP BY source_id").all() as Array<{ degree: number }>;
    expect(degrees.every(row => row.degree <= 2)).toBe(true);
    expect(rebuilt.query("SELECT complete FROM viberaven_library WHERE singleton=1").get()!.complete).toBe(1);
  } finally { rebuilt.close(); }
  await expect(exportLibraryView({ database: result.database, output: join(dir, "channel-limit-2"), channelUrl: "https://www.youtube.com/@example", limit: 2 })).rejects.toThrow("limit >= 3");
  const channelSources: any[] = [];
  let offset = 0, pageNumber = 0;
  while (true) {
    const page = await exportLibraryView({ database: result.database, output: join(dir, `channel-limit-3-${pageNumber++}`), channelUrl: "https://www.youtube.com/@example", limit: 3, offset });
    expect(page.snapshot.sources.length).toBeLessThanOrEqual(3);
    channelSources.push(...page.snapshot.sources);
    if (page.view.nextOffset === null) break;
    expect(page.view.nextOffset).toBeGreaterThan(offset);
    offset = page.view.nextOffset;
  }
  expect(new Set(channelSources.map(source => source.id)).size).toBe(7);
  for (const source of channelSources.filter(source => source.layer === "description" || source.layer === "transcript")) {
    expect(channelSources.some(parent => parent.id === source.media?.parentId && parent.layer === "video")).toBe(true);
  }
});

test("leading BOM survives passage, FTS, record, and native citation storage", async () => {
  const dir = fixture(), sourceDirectory = join(dir, "source"); mkdirSync(sourceDirectory);
  const database = join(sourceDirectory, "manifest.sqlite3"), db = sourceDb(database), id = "bom00000001";
  const cue = "\uFEFFWelcome to retrieval evidence with an exact original citation.";
  const description = "\uFEFFDescription evidence retains its original leading marker.";
  const conflictingDescription = "\uFEFFIndependent source description remains exact.";
  const raw = addVideo(db, { id, cues: [{ text: cue, start: 1.25, end: 3.5 }], description: "placeholder", payloadDescription: conflictingDescription });
  db.query("UPDATE videos SET description=CAST(? AS TEXT) WHERE video_id=?").run(Buffer.from(description, "utf8"), id);
  db.close();
  const imported = await importLibrary({ database, output: join(dir, "library"), lexicalCandidates: 0 });
  expect(imported.coverage.complete).toBe(true);
  const out = new Database(imported.database, { readonly: true });
  try {
    const coverage = out.query("SELECT transcript_sha256,description_sha256 FROM viberaven_video_coverage WHERE video_id=?").get(id) as any;
    expect(coverage.transcript_sha256).toBe(hash(raw));
    expect(coverage.description_sha256).toBe(hash(description));
    expect(out.query("SELECT content FROM viberaven_description_conflicts WHERE video_id=? AND source='sqlite-payload.description'").get(id)).toEqual({ content: conflictingDescription });
    const passages = out.query(`SELECT m.layer,s.id source_id,s.revision,s.path,c.id chunk_id,c.body,c.locator
      FROM viberaven_source_metadata m JOIN sources s ON s.id=m.source_id JOIN chunks c ON c.source_id=s.id AND c.revision=s.revision
      WHERE m.video_id=? AND m.layer IN ('description','transcript') ORDER BY m.layer`).all(id) as any[];
    expect(passages.map(row => [row.layer, row.body])).toEqual([["description", description], ["transcript", cue]]);
    for (const passage of passages) {
      expect(passage.revision).toBe(hash(passage.body));
      expect(readFileSync(passage.path, "utf8")).toBe(passage.body);
      expect(out.query("SELECT body FROM chunk_fts WHERE chunk_id=?").get(passage.chunk_id)).toEqual({ body: passage.body });
      expect(out.query("SELECT body FROM viberaven_lexical_fts WHERE source_id=?").get(passage.source_id)).toEqual({ body: passage.body });
      const evidenceRows = out.query("SELECT evidence FROM relations WHERE source_id=? OR target_id=? ORDER BY id").all(passage.source_id, passage.source_id) as Array<{ evidence: string }>;
      const citation = evidenceRows.flatMap(row => JSON.parse(row.evidence)).find((item: any) => item.sourceId === passage.source_id);
      expect(citation.quote).toBe(passage.body);
      expect(out.query(`SELECT 1 FROM chunks c JOIN sources s ON s.id=c.source_id AND s.revision=c.revision
        WHERE c.id=? AND c.source_id=? AND c.revision=? AND ${evidencePredicate("c", "?4")}`)
        .get(passage.chunk_id, passage.source_id, passage.revision, JSON.stringify(citation))).not.toBeNull();
    }
  } finally { out.close(); }
});

test("bounded video export pages past 400 nodes and refuses views that strand context", async () => {
  const dir = fixture(), sourceDirectory = join(dir, "source"); mkdirSync(sourceDirectory);
  const database = join(sourceDirectory, "manifest.sqlite3"), db = sourceDb(database), id = "zyxwvutsrqp";
  const cueText = "retrieval provenance citations graph storage ".repeat(72).slice(0, 3_590);
  const cues = Array.from({ length: 405 }, (_, ordinal) => ({ text: `${ordinal} ${cueText}`, start: ordinal * 2, end: ordinal * 2 + 1 }));
  addVideo(db, { id, cues, description: "Channel view retains its description layer." }); db.close();
  const library = await importLibrary({ database, output: join(dir, "library"), lexicalCandidates: 0 });
  const first = await exportLibraryView({ database: library.database, output: join(dir, "view-1"), videoId: id, limit: 400 });
  expect(first.snapshot.sources.length).toBe(400);
  expect(first.view.nextOffset).toBe(398);
  expect(first.view.omitted).toBe(8);
  const second = await exportLibraryView({ database: library.database, output: join(dir, "view-2"), videoId: id, limit: 400, offset: first.view.nextOffset! });
  expect(second.view.nextOffset).toBeNull();
  const transcriptIds = [...first.snapshot.sources, ...second.snapshot.sources].filter(source => source.layer === "transcript").map(source => source.id);
  expect(transcriptIds).toHaveLength(405);
  expect(new Set(transcriptIds).size).toBe(405);
  const late = second.snapshot.sources.find(source => source.layer === "transcript" && source.media?.ordinal === 404)!;
  expect(readFileSync(late.path, "utf8")).toContain("404 retrieval provenance");
  expect((first.snapshot.media as any).view).toMatchObject({ shown: 400, total: 408, available: 408 });
  const channelFirst = await exportLibraryView({ database: library.database, output: join(dir, "channel-view-1"), channelUrl: "https://www.youtube.com/@example", limit: 400 });
  expect(channelFirst.snapshot.sources.length).toBe(400);
  expect(channelFirst.snapshot.sources.map(source => source.layer)).toContain("channel");
  expect(channelFirst.snapshot.sources.map(source => source.layer)).toContain("video");
  expect(channelFirst.snapshot.sources.map(source => source.layer)).toContain("description");
  expect(channelFirst.snapshot.sources.map(source => source.layer)).toContain("transcript");
  const channelSecond = await exportLibraryView({ database: library.database, output: join(dir, "channel-view-2"), channelUrl: "https://www.youtube.com/@example", limit: 400, offset: channelFirst.view.nextOffset! });
  expect(channelSecond.view.nextOffset).toBeNull();
  const channelIds = new Set([...channelFirst.snapshot.sources, ...channelSecond.snapshot.sources].map(source => source.id));
  expect(channelIds.size).toBe(408);
  await expect(exportLibraryView({ database: library.database, output: join(dir, "view-invalid"), videoId: id, limit: 2 })).rejects.toThrow("limit >= 3");
  await expect(exportLibraryView({ database: library.database, output: join(sourceDirectory, "view-under-source"), videoId: id })).rejects.toThrow("outside");
}, 30_000);
