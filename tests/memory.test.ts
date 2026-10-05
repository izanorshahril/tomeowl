import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { hash, type Source } from "../src/domain";
import { addMemory, forgetMemory, getMemory, recallMemory, retractMemory, supersedeMemory, type MemoryInput } from "../src/memory";
import { openExistingStore, openStore, replaceScope } from "../src/store";

const temporary: string[] = [];
const databases: ReturnType<typeof openStore>[] = [];
const NOW = "2026-10-04T01:00:00.000Z";
const LATER = "2026-10-04T02:00:00.000Z";
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of temporary.splice(0)) {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("tomeowl-memory-"))
      throw new Error("Unexpected test cleanup target");
    rmSync(directory, { recursive: true, force: true });
  }
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "tomeowl-memory-")); temporary.push(directory);
  const file = join(directory, "catalog.sqlite"), db = openStore(file); databases.push(db);
  return { db, file, directory };
}
function memory(overrides: Partial<MemoryInput> = {}): MemoryInput {
  return { namespace: "project:sample", id: "memory-1", kind: "decision", text: "Prefer explicit local retrieval.", author: "fixture-user", origin: "authored", ...overrides };
}
function source(db: ReturnType<typeof openStore>, text = "Verified original evidence.") {
  const revision = hash(text), item: Source = { id: "source-1", title: "Fixture source", path: "fixture.md",
    collection: "fixture", kind: "document", revision, chunkCount: 1, scope: "fixture-root" };
  const chunk = { id: `chunk-${revision}`, sourceId: item.id, revision, text, locator: { lineStart: 1, lineEnd: 1 }, ordinal: 0 };
  replaceScope(db, item.scope, [{ source: item, chunks: [chunk] }]);
  return { item, chunk };
}
function code(action: () => unknown) {
  try { action(); throw new Error("Expected error"); } catch (error: any) { return error.code; }
}

describe("explicit accepted memory", () => {
  test("old catalogs support readonly empty recall without creating memory tables", () => {
    const { db, file } = fixture(); db.close(); databases.splice(databases.indexOf(db), 1);
    const before = hash(readFileSync(file).toString("base64"));
    const readonly = openExistingStore(file); databases.push(readonly);
    expect(recallMemory(readonly, { namespace: "project:sample", now: NOW }).memories).toEqual([]);
    expect(code(() => getMemory(readonly, "project:sample", "absent", NOW))).toBe("NOT_FOUND");
    expect(readonly.query("SELECT 1 FROM sqlite_master WHERE name='tomeowl_memories'").get()).toBeNull();
    readonly.close(); databases.splice(databases.indexOf(readonly), 1);
    expect(hash(readFileSync(file).toString("base64"))).toBe(before);
  });

  test("authored memories have explicit identity, author, origin, and exact namespaces", () => {
    const { db } = fixture(); const added = addMemory(db, memory(), NOW);
    expect(added).toMatchObject({ id: "memory-1", namespace: "project:sample", basis: "authored", status: "active",
      author: "fixture-user", origin: "authored", createdAt: NOW, updatedAt: NOW, evidence: [], expired: false });
    expect(addMemory(db, memory(), LATER)).toEqual(added);
    expect(code(() => addMemory(db, memory({ text: "Different content" }), NOW))).toBe("MEMORY_CONFLICT");
    addMemory(db, memory({ namespace: "project:Sample", text: "A separate namespace" }), NOW);
    expect(recallMemory(db, { namespace: "project:sample", now: NOW }).memories).toHaveLength(1);
    expect(recallMemory(db, { namespace: "project:Sample", now: NOW }).memories[0].text).toBe("A separate namespace");
    expect(code(() => getMemory(db, "project:other", "memory-1", NOW))).toBe("NOT_FOUND");
    expect(db.query("SELECT version FROM tomeowl_meta").get()).toEqual({ version: 1 });
    expect(db.query("SELECT version FROM tomeowl_memory_meta").get()).toEqual({ version: 1 });
  });

  test("invalid identity, lifecycle fields, and bounds fail without implicit acceptance", () => {
    const { db } = fixture();
    for (const input of [memory({ namespace: "" }), memory({ kind: "unknown" as any }), memory({ text: "" }),
      memory({ author: "" }), memory({ origin: "" }), memory({ id: "x\0y" }), memory({ text: "a".repeat(8001) }),
      memory({ expiresAt: "tomorrow" })]) expect(code(() => addMemory(db, input, NOW))).toBe("INVALID_MEMORY");
    expect(recallMemory(db, { namespace: "project:sample", now: NOW }).memories).toEqual([]);
    expect(code(() => recallMemory(db, { namespace: "project:sample", status: "expired" as any }))).toBe("INVALID_MEMORY");
    expect(code(() => recallMemory(db, { namespace: "project:sample", maxBytes: 10 }))).toBe("INVALID_LIMIT");
  });

  test("expiry is a readonly recall policy with an exact boundary", () => {
    const { db } = fixture(); addMemory(db, memory({ expiresAt: LATER }), NOW);
    expect(recallMemory(db, { namespace: "project:sample", now: NOW }).memories).toHaveLength(1);
    expect(recallMemory(db, { namespace: "project:sample", now: LATER }).memories).toHaveLength(0);
    expect(recallMemory(db, { namespace: "project:sample", now: LATER, includeExpired: true }).memories[0].expired).toBe(true);
    expect(getMemory(db, "project:sample", "memory-1", LATER)).toMatchObject({ status: "active", updatedAt: NOW, expired: true });
  });

  test("correction preserves predecessor history and is idempotent with an explicit successor ID", () => {
    const { db } = fixture(); addMemory(db, memory(), NOW);
    const replacement = memory({ id: "memory-2", text: "Use deterministic local retrieval." });
    const successor = supersedeMemory(db, replacement.namespace, "memory-1", replacement, LATER);
    expect(successor).toMatchObject({ id: "memory-2", supersedes: "memory-1", status: "active", createdAt: LATER });
    expect(getMemory(db, replacement.namespace, "memory-1", LATER)).toMatchObject({ status: "superseded", updatedAt: LATER });
    expect(recallMemory(db, { namespace: replacement.namespace, now: LATER }).memories.map(row => row.id)).toEqual(["memory-2"]);
    expect(supersedeMemory(db, replacement.namespace, "memory-1", replacement, LATER)).toEqual(successor);
    expect(code(() => supersedeMemory(db, replacement.namespace, "memory-1", memory({ id: "memory-3" }), LATER))).toBe("MEMORY_CONFLICT");
    expect(recallMemory(db, { namespace: replacement.namespace, status: "all", now: LATER }).memories).toHaveLength(2);
  });

  test("failed correction rolls back acceptance and prior status", () => {
    const { db } = fixture(); addMemory(db, memory(), NOW);
    expect(code(() => supersedeMemory(db, "project:sample", "memory-1", memory({ id: "bad-correction",
      evidence: [{ chunkId: "missing", quote: "invented" }] }), LATER))).toBe("INVALID_MEMORY_EVIDENCE");
    expect(getMemory(db, "project:sample", "memory-1", LATER).status).toBe("active");
    expect(code(() => getMemory(db, "project:sample", "bad-correction", LATER))).toBe("NOT_FOUND");
  });

  test("retraction is explicit, idempotent, and excluded from normal recall", () => {
    const { db } = fixture(); addMemory(db, memory(), NOW);
    expect(retractMemory(db, "project:sample", "memory-1", LATER)).toMatchObject({ status: "retracted", updatedAt: LATER });
    expect(retractMemory(db, "project:sample", "memory-1", "2026-10-04T03:00:00.000Z").updatedAt).toBe(LATER);
    expect(recallMemory(db, { namespace: "project:sample", now: LATER }).memories).toHaveLength(0);
    expect(recallMemory(db, { namespace: "project:sample", status: "retracted", now: LATER }).memories).toHaveLength(1);
    expect(code(() => supersedeMemory(db, "project:sample", "memory-1", memory({ id: "next" }), LATER))).toBe("MEMORY_CONFLICT");
  });

  test("accepted evidence verifies quote, chunk, source, and revision", () => {
    const { db } = fixture(), { item, chunk } = source(db);
    for (const citation of [{ chunkId: "missing", quote: "Verified" }, { chunkId: chunk.id, quote: "Invented quote" },
      { chunkId: chunk.id, quote: "Verified", sourceId: "different-source" },
      { chunkId: chunk.id, quote: "Verified", revision: "old-revision" }])
      expect(code(() => addMemory(db, memory({ evidence: [citation] }), NOW))).toBe("INVALID_MEMORY_EVIDENCE");
    const accepted = addMemory(db, memory({ evidence: [{ chunkId: chunk.id, quote: "original evidence", sourceId: item.id, revision: item.revision }] }), NOW);
    expect(accepted.basis).toBe("cited");
    expect(accepted.evidence[0]).toEqual({ sourceId: item.id, revision: item.revision, chunkId: chunk.id, quote: "original evidence",
      locator: { lineStart: 1, lineEnd: 1 }, title: item.title, path: item.path, collection: item.collection });
  });

  test("a rejected first acceptance rolls back lazy schema creation", () => {
    const { db } = fixture();
    expect(code(() => addMemory(db, memory({ evidence: [{ chunkId: "missing", quote: "invented" }] }), NOW))).toBe("INVALID_MEMORY_EVIDENCE");
    expect(db.query("SELECT name FROM sqlite_master WHERE name IN ('tomeowl_memories','tomeowl_memory_meta')").all()).toEqual([]);
  });

  test("captured locators must stay within the bounded native locator contract", () => {
    const { db } = fixture(), { chunk } = source(db);
    db.query("UPDATE chunks SET locator=? WHERE id=?").run(JSON.stringify({ unexpected: "arbitrary metadata" }), chunk.id);
    expect(code(() => addMemory(db, memory({ evidence: [{ chunkId: chunk.id, quote: "Verified" }] }), NOW))).toBe("INVALID_MEMORY_EVIDENCE");
  });

  test("captured evidence survives source replacement and source deletion", () => {
    const { db } = fixture(), { item, chunk } = source(db);
    const input = memory({ evidence: [{ chunkId: chunk.id, quote: "original evidence" }] });
    const accepted = addMemory(db, input, NOW);
    source(db, "New evidence revision.");
    expect(db.query("SELECT 1 FROM chunks WHERE id=?").get(chunk.id)).toBeNull();
    expect(getMemory(db, input.namespace, input.id!, LATER).evidence).toEqual(accepted.evidence);
    expect(addMemory(db, input, LATER)).toEqual(accepted);
    replaceScope(db, item.scope, []);
    expect(db.query("SELECT 1 FROM sources WHERE id=?").get(item.id)).toBeNull();
    expect(getMemory(db, input.namespace, input.id!, LATER).evidence[0].quote).toBe("original evidence");
  });

  test("forget removes connected owned history and quotes while preserving other namespaces and originals", () => {
    const { db } = fixture(), { item, chunk } = source(db);
    addMemory(db, memory({ evidence: [{ chunkId: chunk.id, quote: "original evidence" }] }), NOW);
    supersedeMemory(db, "project:sample", "memory-1", memory({ id: "memory-2" }), LATER);
    supersedeMemory(db, "project:sample", "memory-2", memory({ id: "memory-3" }), LATER);
    addMemory(db, memory({ namespace: "project:other" }), NOW);
    const forgotten = forgetMemory(db, "project:sample", "memory-2");
    expect(forgotten).toMatchObject({ deletedRecords: 3, capturedEvidenceCopies: 1, scope: "memory-records-only" });
    expect(new Set(forgotten.deletedIds)).toEqual(new Set(["memory-1", "memory-2", "memory-3"]));
    expect(recallMemory(db, { namespace: "project:sample", status: "all", includeExpired: true }).memories).toEqual([]);
    expect(getMemory(db, "project:other", "memory-1").id).toBe("memory-1");
    expect(db.query("SELECT id FROM sources WHERE id=?").get(item.id)).toEqual({ id: item.id });
    expect(db.query("SELECT id FROM chunks WHERE id=?").get(chunk.id)).toEqual({ id: chunk.id });
  });

  test("forget can remove only the target and clear surviving history links", () => {
    const { db } = fixture(); addMemory(db, memory(), NOW);
    supersedeMemory(db, "project:sample", "memory-1", memory({ id: "memory-2" }), LATER);
    expect(forgetMemory(db, "project:sample", "memory-1", { history: false }).deletedIds).toEqual(["memory-1"]);
    expect(getMemory(db, "project:sample", "memory-2", LATER).supersedes).toBeUndefined();
  });

  test("literal recall and count limits do not treat query operators as syntax", () => {
    const { db } = fixture(); addMemory(db, memory({ text: "literal %_ OR marker" }), NOW);
    addMemory(db, memory({ id: "memory-2", text: "another literal %_ OR marker" }), LATER);
    expect(recallMemory(db, { namespace: "project:sample", query: "%_ OR", now: LATER }).memories).toHaveLength(2);
    expect(recallMemory(db, { namespace: "project:sample", query: "%_ or", now: LATER }).memories).toHaveLength(0);
    const limited = recallMemory(db, { namespace: "project:sample", limit: 1, now: LATER });
    expect(limited.memories.map(row => row.id)).toEqual(["memory-2"]); expect(limited.truncated).toBe(true);
  });

  test("byte budgets count the CLI envelope, metadata, Unicode, quotes, and newline", () => {
    const { db } = fixture(); addMemory(db, memory({ text: "Unicode 研究 ".repeat(350) }), NOW);
    const omitted = recallMemory(db, { namespace: "project:sample", maxBytes: 2048, now: NOW });
    expect(omitted.memories).toHaveLength(0); expect(omitted.truncated).toBe(true);
    expect(omitted.used.bytes).toBe(Buffer.byteLength(JSON.stringify({ ok: true, ...omitted }) + "\n"));
    expect(omitted.used.bytes).toBeLessThanOrEqual(2048);
    const full = recallMemory(db, { namespace: "project:sample", maxBytes: 65536, now: NOW });
    expect(full.memories).toHaveLength(1); expect(full.truncated).toBe(false);
    expect(full.used.bytes).toBe(Buffer.byteLength(JSON.stringify({ ok: true, ...full }) + "\n"));
    expect(full.used.bytes).toBeLessThanOrEqual(full.limits.maxBytes);
  });

  test("malformed memory schemas are rejected instead of silently replaced", () => {
    const { db } = fixture(); addMemory(db, memory(), NOW);
    db.exec("UPDATE tomeowl_memory_meta SET version=99");
    expect(code(() => recallMemory(db, { namespace: "project:sample" }))).toBe("SCHEMA_VERSION");
    expect(code(() => addMemory(db, memory({ id: "another" }), NOW))).toBe("SCHEMA_VERSION");
  });

  test("initialized catalogs remain byte-identical after readonly recall, show, and expiry evaluation", () => {
    const { db, file } = fixture(); addMemory(db, memory({ expiresAt: LATER }), NOW);
    db.close(); databases.splice(databases.indexOf(db), 1);
    const before = hash(readFileSync(file).toString("base64"));
    const readonly = openExistingStore(file); databases.push(readonly);
    expect(recallMemory(readonly, { namespace: "project:sample", now: LATER }).memories).toHaveLength(0);
    expect(getMemory(readonly, "project:sample", "memory-1", LATER).expired).toBe(true);
    expect(() => addMemory(readonly, memory({ id: "write-attempt" }), LATER)).toThrow();
    readonly.close(); databases.splice(databases.indexOf(readonly), 1);
    expect(hash(readFileSync(file).toString("base64"))).toBe(before);
  });
});
