import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { contextPacket } from "../src/context-query";
import { ingest } from "../src/ingest";
import { addRelations, makeSnapshot, openStore, sourceDetails } from "../src/store";

const fixtures: Array<{ dir: string; db: Database }> = [];
afterEach(() => { for (const { dir, db } of fixtures.splice(0)) { db.close(); rmSync(dir, { recursive: true, force: true }); } });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "tomeowl-context-")), root = join(dir, "alpha"), other = join(dir, "beta");
  mkdirSync(root); mkdirSync(other);
  writeFileSync(join(root, "a.md"), "# Anchor\nANCHOR_NATIVE records a measurement.\nSee [method](b.md).\n");
  writeFileSync(join(root, "b.md"), "# Method\nA documented procedure.\nSee [outcome](c.md) and [outside](../beta/outside.md).\n");
  writeFileSync(join(root, "c.md"), "# Outcome\nRecorded observations.\n");
  writeFileSync(join(other, "outside.md"), "# Outside\nExcluded source passage.\n");
  const db = openStore(join(dir, "catalog.sqlite"));
  fixtures.push({ dir, db }); ingest([root, other], { db, limit: 20 });
  return { dir, root, other, db };
}

test("context combines native matches and grounded link paths without mixing ranking and distance", () => {
  const { db, root } = fixture();
  const packet = contextPacket(db, "ANCHOR_NATIVE", { path: root, depth: 2 });
  expect(packet.sources).toHaveLength(3);
  expect(packet.passages).toHaveLength(3);
  const anchor = packet.passages.find(passage => passage.origin === "keyword")!;
  expect(anchor.distance).toBe(0); expect(anchor.keywordScore).toBeGreaterThan(0); expect(anchor.via).toEqual([]);
  const outcome = packet.passages.find(passage => passage.path.endsWith("c.md"))!;
  expect(outcome.origin).toBe("recorded-link"); expect(outcome.keywordScore).toBeNull();
  expect(outcome.distance).toBe(2); expect(outcome.via).toHaveLength(2);
  for (const passage of packet.passages) {
    expect(passage.revision).toHaveLength(64); expect(passage.chunkId).toHaveLength(32);
    expect(passage.locator.lineStart).toBeGreaterThan(0);
    expect(passage.via.every(id => packet.relations.some(edge => edge.id === id))).toBe(true);
  }
  const quoted = packet.passages.reduce((sum, passage) => sum + passage.quote.length, 0)
    + packet.relations.reduce((sum, relation) => sum + relation.evidence.reduce((count, citation) => count + citation.quote.length, 0), 0);
  expect(packet.used.characters).toBe(quoted);
  expect(packet.freshness).toBe("indexed-revisions");
  expect(packet.sources.every(source => source.collection === "alpha")).toBe(true);
  expect(JSON.stringify(packet)).not.toContain("Excluded source passage");
});

test("context respects source, chunk and quote budgets and identifies truncation", () => {
  const { db, root } = fixture();
  const sourceBound = contextPacket(db, "ANCHOR_NATIVE", { path: root, maxSources: 1 });
  expect(sourceBound.used.sources).toBe(1); expect(sourceBound.passages).toHaveLength(1);
  expect(sourceBound.truncated).toBe(true); expect(sourceBound.omissions).toContain("source-limit");
  const chunkBound = contextPacket(db, "ANCHOR_NATIVE", { path: root, maxChunks: 1 });
  expect(chunkBound.used.chunks).toBe(1); expect(chunkBound.truncated).toBe(true);
  const charBound = contextPacket(db, "ANCHOR_NATIVE", { path: root, maxChars: 12 });
  expect(charBound.used.characters).toBeLessThanOrEqual(12);
  expect(charBound.passages[0].quoteTruncated).toBe(true);
  expect(charBound.omissions).toContain("character-limit");
  expect(charBound.relations).toHaveLength(0);
});

test("context supports phrase filtering and zero-depth retrieval without graph expansion", () => {
  const { db, root } = fixture();
  const packet = contextPacket(db, "records a measurement", { path: root, match: "phrase", depth: 0 });
  expect(packet.match).toBe("phrase"); expect(packet.passages).toHaveLength(1);
  expect(packet.relations).toEqual([]); expect(packet.truncated).toBe(false);
  expect(contextPacket(db, "measurement a records", { path: root, match: "phrase" }).passages).toEqual([]);
  expect(contextPacket(db, "unmatched vocabulary", { path: root }).sources).toEqual([]);
});

test("context detects bounded candidates and deduplicates passages and relation citations", () => {
  const { db, root } = fixture();
  const packet = contextPacket(db, "documented observations records", { path: root, limit: 1, depth: 0 });
  expect(packet.passages).toHaveLength(1); expect(packet.omissions).toContain("candidate-limit");
  const expanded = contextPacket(db, "documented observations records", { path: root, depth: 2 });
  expect(new Set(expanded.passages.map(passage => passage.chunkId)).size).toBe(expanded.passages.length);
  expect(new Set(expanded.relations.map(relation => relation.id)).size).toBe(expanded.relations.length);
});

test("context does not split a Unicode surrogate pair at a tiny quote budget", () => {
  const { db, root } = fixture();
  writeFileSync(join(root, "emoji.md"), "😀UNICODE_NATIVE document.\n"); ingest(root, { db, limit: 20 });
  const packet = contextPacket(db, "UNICODE_NATIVE", { path: root, depth: 0, maxChars: 1 });
  expect(packet.used.characters).toBe(1); expect(packet.passages[0].quote).toBe("U");
  expect(packet.passages[0].excerpt).toEqual({ start: 2, end: 3 });
  expect(packet.truncated).toBe(true); expect(packet.omissions).toContain("character-limit");
});

test("context validates budgets and queries and never changes the catalog", () => {
  const { db } = fixture();
  const before = db.query("SELECT COUNT(*) n FROM sources").get();
  for (const options of [{ maxChars: 0 }, { maxSources: 65 }, { maxChunks: 129 }, { limit: 101 }, { depth: 4 }, { maxChars: NaN }]) {
    expect(() => contextPacket(db, "ANCHOR_NATIVE", options)).toThrow();
  }
  expect(() => contextPacket(db, "*", {})).toThrow();
  contextPacket(db, "ANCHOR_NATIVE", { depth: 2 });
  expect(db.query("SELECT COUNT(*) n FROM sources").get()).toEqual(before);
});

test("context chunk budget includes supporting link citations outside the displayed passages", () => {
  const { db, root } = fixture();
  writeFileSync(join(root, "support.md"), "Supporting material.\n".repeat(100) + "CITATION_ONLY support.\n");
  ingest(root, { db, limit: 20 });
  const snapshot = makeSnapshot(db);
  const anchor = snapshot.sources.find(source => source.path.endsWith("a.md"))!;
  const method = snapshot.sources.find(source => source.path.endsWith("b.md"))!;
  const support = snapshot.sources.find(source => source.path.endsWith("support.md"))!;
  const citation = sourceDetails(db, support.id, 20).chunks.at(-1)!;
  db.exec("DELETE FROM relations");
  addRelations(db, [{ id: "supporting-link", source: anchor.id, target: method.id, kind: "references", basis: "structural",
    evidence: [{ sourceId: support.id, revision: citation.revision, chunkId: citation.id, quote: "CITATION_ONLY support.", locator: citation.locator }] }]);
  const tooSmall = contextPacket(db, "ANCHOR_NATIVE", { path: root, maxChunks: 2 });
  expect(tooSmall.passages).toHaveLength(1); expect(tooSmall.used.chunks).toBe(1);
  expect(tooSmall.omissions).toContain("chunk-limit");
  const adequate = contextPacket(db, "ANCHOR_NATIVE", { path: root, maxChunks: 3 });
  expect(adequate.passages).toHaveLength(2); expect(adequate.used.chunks).toBe(3);
  expect(adequate.sources.some(source => source.id === support.id)).toBe(true);
  const allQuotedChunks = new Set([...adequate.passages.map(passage => passage.chunkId), ...adequate.relations.flatMap(edge => edge.evidence.map(evidence => evidence.chunkId))]);
  expect(adequate.used.chunks).toBe(allQuotedChunks.size);
});
