import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contextPacket } from "../src/context-query";
import { hash, TomeowlError } from "../src/domain";
import { ingest } from "../src/ingest";
import { retrieve } from "../src/retrieval";
import { addRelations, openExistingStore, openStore, replaceScope, sourceDetails } from "../src/store";

const databases: ReturnType<typeof openStore>[] = [], directories: string[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture(rows: Array<{ id: string; title?: string; texts: string[] }>) {
  const db = openStore(":memory:"); databases.push(db);
  const scope = resolve("data", "context-quality-fixture");
  replaceScope(db, scope, rows.map(row => ({
    source: { id: row.id, title: row.title ?? row.id, path: join(scope, `${row.id}.md`), collection: "quality", kind: "document" as const,
      revision: "r1", chunkCount: row.texts.length, scope },
    chunks: row.texts.map((text, ordinal) => ({ id: `${row.id}${ordinal}`, sourceId: row.id, revision: "r1", text,
      locator: { lineStart: 50 + ordinal * 10, lineEnd: 50 + ordinal * 10 + text.split("\n").length - 1 }, ordinal })),
  })));
  return { db, scope };
}
function checkPacketBytes(packet: ReturnType<typeof contextPacket>) {
  const bytes = Buffer.byteLength(JSON.stringify({ ok: true, ...packet }) + "\n", "utf8");
  expect(packet.used.bytes).toBe(bytes); expect(bytes).toBeLessThanOrEqual(packet.limits.bytes);
  expect(packet.used.characters).toBe(packet.passages.reduce((sum, p) => sum + p.quote.length, 0)
    + packet.relations.reduce((sum, r) => sum + r.evidence.reduce((n, e) => n + e.quote.length, 0), 0));
}

test("context candidates and admission cover distinct sources before additional chunks", () => {
  const { db } = fixture([{ id: "a", texts: Array(4).fill("memory") }, { id: "b", texts: [`memory ${"extra filler ".repeat(80)}`] }]);
  const packet = contextPacket(db, "memory", { limit: 4, maxChunks: 3, depth: 0 });
  expect(packet.passages.map(p => p.chunkId)).toEqual(["a0", "b0", "a1"]);
  expect(packet.sources.map(s => s.id)).toEqual(["a", "b"]);
  expect(packet.omissions).toContain("candidate-limit"); expect(packet.omissions).toContain("chunk-limit");
  expect(contextPacket(db, "memory", { limit: 1, depth: 0 }).omissions).toContain("candidate-source-limit");
  checkPacketBytes(packet);
});

test("fair first-source quote allocations preserve both hits under a character budget", () => {
  const { db } = fixture([{ id: "a", texts: [`memory ${"a ".repeat(300)}`] }, { id: "b", texts: [`memory ${"b ".repeat(300)}`] }]);
  const packet = contextPacket(db, "memory", { maxChars: 20, maxChunks: 2, depth: 0 });
  expect(packet.passages).toHaveLength(2); expect(packet.passages.every(p => p.quote.includes("memory"))).toBe(true);
  expect(packet.used.characters).toBe(20); checkPacketBytes(packet);
});

test("late multiline excerpts retain matching text, chunk identity and exact UTF-16 subspans", () => {
  const text = "first line\nmore introductory material\nTARGET_IDENTIFIER later 😀\nlast";
  const { db } = fixture([{ id: "late", texts: [text] }]);
  const hit = retrieve(db, "TARGET_IDENTIFIER", 1, { quoteChars: 10 })[0];
  expect(hit.quote).toBe("TARGET_IDE"); expect(hit.quoteTruncated).toBe(true);
  expect(hit.locator).toEqual({ lineStart: 52, lineEnd: 52 });
  expect(hit.chunkId).toBe("late0"); expect(hit.revision).toBe("r1");
  expect(text.slice(hit.excerpt!.start, hit.excerpt!.end)).toBe(hit.quote);
  const packet = contextPacket(db, "TARGET_IDENTIFIER", { maxChars: 10, depth: 0 });
  expect(packet.passages[0].quote).toBe(hit.quote); expect(packet.passages[0].excerpt).toEqual(hit.excerpt);
  checkPacketBytes(packet);
});

test("linked sources prefer later query-relevant chunks over an introductory fallback", () => {
  const { db } = fixture([{ id: "a", texts: ["needle"] }, { id: "b", texts: ["Introduction only", `Later needle ${"filler ".repeat(40)}`] },
    { id: "c", texts: ["An introductory fallback"] }]);
  addRelations(db, ["b", "c"].map(id => ({ id: `a-${id}`, source: "a", target: id, kind: "references" as const, basis: "structural" as const,
    evidence: [{ sourceId: "a", revision: "r1", chunkId: "a0", quote: "needle", locator: { lineStart: 50, lineEnd: 50 } }] })));
  const packet = contextPacket(db, "needle", { limit: 1, depth: 1 });
  expect(packet.passages.find(p => p.sourceId === "b")).toMatchObject({ chunkId: "b1", origin: "recorded-link", selection: "query-match" });
  expect(packet.passages.find(p => p.sourceId === "c")).toMatchObject({ chunkId: "c0", selection: "first-chunk" });
  checkPacketBytes(packet);
});

test("serialized byte budget contains metadata, UTF-8 quotes, omissions and CLI envelope", () => {
  const { db } = fixture([{ id: "huge", title: "Metadata ".repeat(2000), texts: ["needle"] },
    { id: "normal", texts: [`needle ${"中😀 ".repeat(1000)}`] }]);
  const packet = contextPacket(db, "needle", { maxChars: 2048, maxBytes: 2400, depth: 0 });
  expect(packet.sources.map(s => s.id)).toEqual(["normal"]);
  expect(packet.passages[0].quote.includes("needle")).toBe(true);
  expect(packet.omissions).toContain("byte-limit"); checkPacketBytes(packet);
  expect(packet.passages[0].quote).not.toMatch(/[\uD800-\uDBFF]$/);
});

test("serialized envelope failures and byte limits produce structured errors", () => {
  const { db } = fixture([{ id: "a", texts: ["needle"] }]);
  for (const maxBytes of [0, 511, 1048577, 600.5, NaN, null, "900"]) {
    expect(() => contextPacket(db, "needle", { maxBytes: maxBytes as number })).toThrow();
  }
  try { contextPacket(db, `needle${" ".repeat(1994)}`, { maxBytes: 512 }); throw new Error("Expected output budget error"); }
  catch (error) { expect(error).toBeInstanceOf(TomeowlError); expect((error as TomeowlError).code).toBe("OUTPUT_BUDGET_TOO_SMALL"); }
  checkPacketBytes(contextPacket(db, "unmatched", { maxBytes: 512 }));
});

test("freshness reads are capped and distinguish changed, missing, non-files and oversized originals", () => {
  const dir = mkdtempSync(join(tmpdir(), "tomeowl-freshness-")); directories.push(dir);
  const path = join(dir, "a.md"), db = openStore(join(dir, "catalog.sqlite")); databases.push(db);
  const text = "captured evidence\n"; writeFileSync(path, text); ingest(path, { db });
  const id = retrieve(db, "captured")[0].sourceId;
  expect(sourceDetails(db, id)).toMatchObject({ stale: false, freshnessReason: "current" });
  writeFileSync(path, "changed\n"); expect(sourceDetails(db, id)).toMatchObject({ stale: true, freshnessReason: "changed" });
  writeFileSync(path, Buffer.alloc(2 * 1024 * 1024 + 1, 97)); expect(sourceDetails(db, id)).toMatchObject({ stale: true, freshnessReason: "size-limit" });
  unlinkSync(path); expect(sourceDetails(db, id)).toMatchObject({ stale: true, freshnessReason: "missing" });
  mkdirSync(path); expect(sourceDetails(db, id)).toMatchObject({ stale: true, freshnessReason: "not-regular-file" });
  expect(retrieve(db, "captured")[0].revision).toBe(hash(text));
});

test("freshness refuses symlink ancestors, using a Windows junction without privileged installers", () => {
  const dir = mkdtempSync(join(tmpdir(), "tomeowl-freshness-link-")); directories.push(dir);
  const root = join(dir, "root"), target = join(dir, "target"); mkdirSync(root); mkdirSync(target);
  const path = join(root, "a.md"), text = "captured evidence\n"; writeFileSync(path, text);
  const db = openStore(join(dir, "catalog.sqlite")); databases.push(db); ingest(root, { db });
  const id = retrieve(db, "captured")[0].sourceId;
  rmSync(root, { recursive: true }); writeFileSync(join(target, "a.md"), text);
  symlinkSync(target, root, process.platform === "win32" ? "junction" : "dir");
  expect(sourceDetails(db, id)).toMatchObject({ stale: true, freshnessReason: "symlink" });
});

test("writable stores add endpoint indexes while read-only queries preserve the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "tomeowl-indexes-")); directories.push(dir);
  const path = join(dir, "catalog.sqlite"), db = openStore(path); databases.push(db);
  const columns = (db.query("PRAGMA index_list(relations)").all() as Array<{ name: string }>).flatMap(index =>
    db.query(`PRAGMA index_info('${index.name.replaceAll("'", "''")}')`).all() as Array<{ name: string }>);
  expect(columns.map(column => column.name)).toContain("source_id"); expect(columns.map(column => column.name)).toContain("target_id");
  const plan = db.query("EXPLAIN QUERY PLAN SELECT id FROM relations WHERE source_id=? OR target_id=? ORDER BY id LIMIT ?").all("a", "a", 10);
  expect(JSON.stringify(plan)).toContain("MULTI-INDEX OR");
  const reader = openExistingStore(path); databases.push(reader);
  expect(() => reader.exec("DELETE FROM relations")).toThrow();
});
