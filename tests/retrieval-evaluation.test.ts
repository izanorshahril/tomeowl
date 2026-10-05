import { afterEach, expect, test } from "bun:test";
import { resolve } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { contextPacket } from "../src/context-query";
import { openStore, replaceScope, searchStore } from "../src/store";
import { citationIsAuthentic, evaluate, parseCases, scoreCase, summarize, type EvaluationCase } from "../scripts/evaluate-retrieval";

const databases: ReturnType<typeof openStore>[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const root = resolve("data", "evaluation-fixture");
function fixture(texts: string[][]) {
  const db = openStore(":memory:"); databases.push(db);
  replaceScope(db, root, texts.map((chunks, index) => ({
    source: { id: `source${index}`, title: `Source ${index}`, path: resolve(root, "docs/research", `source${index}.md`),
      collection: "test", kind: "document" as const, revision: "r1", chunkCount: chunks.length, scope: root },
    chunks: chunks.map((text, ordinal) => ({ id: `chunk${index}-${ordinal}`, sourceId: `source${index}`, revision: "r1", text,
      locator: { lineStart: 1 + ordinal, lineEnd: 1 + ordinal }, ordinal })),
  })));
  return db;
}
const item: EvaluationCase = { id: "support", query: "needle", match: "any", kind: "identifier", notes: "Manually selected partial label",
  expected: [{ path: "docs/research/source0.md", quote: "needle supporting passage" }] };

test("evaluation validates bounded literal queries and portable evidence labels", () => {
  expect(parseCases([item])).toEqual([item]);
  for (const input of [null, [], Array(65).fill(item), [item, item], [{ ...item, query: "!!!" }], [{ ...item, query: "term ".repeat(65) }],
    [{ ...item, expected: [{ path: "docs/research/../../secrets.md", quote: "needle" }] }], [{ ...item, expected: [item.expected[0], item.expected[0]] }]]) {
    expect(() => parseCases(input)).toThrow();
  }
});

test("scoring separates source coverage, exact anchor coverage and unjudged hits", () => {
  const db = fixture([["needle supporting passage"], ["needle other unjudged evidence"]]);
  const hits = searchStore(db, item.query, 10), packet = contextPacket(db, item.query, { depth: 0 });
  const result = scoreCase(db, root, item, hits, packet);
  expect(result.sourceRecallAt5).toBe(1); expect(result.anchorRecallAt5).toBe(1); expect(result.contextAnchorCoverage).toBe(1);
  expect(result.unjudgedSearchHits).toBe(1); expect(result.integrity.invalidCitations).toEqual([]); expect(result.integrity.budgetValid).toBe(true);
  expect(summarize([result]).contextCoveredAnchors).toBe(1);
});

test("source recall ranks count returned chunks rather than silently collapsing repeats", () => {
  const db = fixture([Array(5).fill("needle supporting passage"), ["needle second supporting passage"]]);
  const hits = searchStore(db, "needle", 10);
  const ordered = [...hits.filter(hit => hit.sourceId === "source0"), ...hits.filter(hit => hit.sourceId === "source1")];
  const question = { ...item, expected: [...item.expected, { path: "docs/research/source1.md", quote: "needle second supporting passage" }] };
  const result = scoreCase(db, root, question, ordered, contextPacket(db, "needle", { depth: 0 }));
  expect(result.sourceRecallAt5).toBe(.5); expect(result.sourceRecallAt10).toBe(1);
  expect(result.anchorRecallAt5).toBe(.5); expect(result.anchors[1].sourceRank).toBe(6);
});

test("no-label cases have null relevance metrics and report retrieval emptiness separately", () => {
  const db = fixture([["needle supporting passage"]]);
  const question = { ...item, query: "absentserial", expected: [], kind: "unanswerable" };
  const result = scoreCase(db, root, question, searchStore(db, question.query, 10), contextPacket(db, question.query, { depth: 0 }));
  expect(result.sourceRecallAt5).toBeNull(); expect(result.contextAnchorCoverage).toBeNull();
  expect(result.emptyContext).toBe(true); expect(summarize([result]).macro.sourceRecallAt5).toBeNull();
  expect(summarize([result]).noLabelCases).toEqual([{ id: item.id, emptySearch: true, emptyContext: true }]);
});

test("diagnostics distinguish clipped support from an anchor split across chunks", () => {
  const db = fixture([["needle supporting passage"]]);
  const hits = searchStore(db, "needle", 10), packet = contextPacket(db, "needle", { maxChars: 6, depth: 0 });
  expect(scoreCase(db, root, item, hits, packet).anchors[0].miss).toBe("context-support-clipped");
  const split = fixture([["needle supporting", "passage continues"]]);
  const splitHits = searchStore(split, "needle", 10), splitPacket = contextPacket(split, "needle", { depth: 0 });
  expect(scoreCase(split, root, item, splitHits, splitPacket).anchors[0].miss).toBe("anchor-crosses-chunks");
});

test("evaluation rejects stale revisions, invented quotes, offsets and inconsistent byte counters", () => {
  const db = fixture([["needle supporting passage"]]);
  const hits = searchStore(db, "needle", 10), packet = contextPacket(db, "needle", { depth: 0 });
  expect(citationIsAuthentic(db, hits[0])).toBe(true);
  expect(citationIsAuthentic(db, { ...hits[0], revision: "r2" })).toBe(false);
  expect(citationIsAuthentic(db, { ...hits[0], quote: "fabricated evidence" })).toBe(false);
  expect(citationIsAuthentic(db, { ...hits[0], excerpt: { start: 1, end: hits[0].quote.length } })).toBe(false);
  expect(citationIsAuthentic(db, { ...hits[0], locator: { lineStart: 50, lineEnd: 50 } })).toBe(false);
  expect(citationIsAuthentic(db, { ...hits[0], path: resolve(root, "docs/research/wrong.md") })).toBe(false);
  packet.used.bytes++;
  expect(scoreCase(db, root, item, hits, packet).integrity.budgetValid).toBe(false);
});

test("evaluation checks requested limits and source membership independently of self-reported counters", () => {
  const db = fixture([["needle supporting passage"]]);
  const hits = searchStore(db, "needle", 10), packet = contextPacket(db, "needle", { depth: 0 });
  const requested = { ...packet.limits };
  const resetBytes = () => {
    packet.used.bytes = 0;
    for (;;) {
      const bytes = Buffer.byteLength(JSON.stringify({ ok: true, ...packet }) + "\n");
      if (bytes === packet.used.bytes) return;
      packet.used.bytes = bytes;
    }
  };
  packet.limits.bytes *= 2; resetBytes();
  expect(scoreCase(db, root, item, hits, packet, requested).integrity.budgetValid).toBe(false);
  packet.limits = requested; packet.sources = []; packet.used.sources = 0; resetBytes();
  expect(scoreCase(db, root, item, hits, packet, requested).integrity.invalidSources).toEqual(["source0"]);
});

test("evaluation fails on incomplete ingestion and fingerprints a complete synthetic corpus", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "tomeowl-evaluation-")); directories.push(directory);
  const corpus = resolve(directory, "docs/research"); mkdirSync(corpus, { recursive: true });
  writeFileSync(resolve(corpus, "source0.md"), "needle supporting passage\n");
  writeFileSync(resolve(corpus, ".hidden.md"), "not admitted\n");
  const suite = resolve(directory, "suite.json"); writeFileSync(suite, JSON.stringify([item]));
  expect(() => evaluate(directory, suite, 1)).toThrow("incomplete");
  rmSync(resolve(corpus, ".hidden.md"));
  const report = evaluate(directory, suite, 1);
  expect(report.summary.contextCoveredAnchors).toBe(1);
  expect(report.corpus.sources).toHaveLength(1);
  expect(report.corpus.sources[0].sha256).toBe(report.corpus.sources[0].revision);
  expect(report.implementation.map(source => source.path)).toContain("src/graph-query.ts");
  expect(report.summary.invalidSources).toBe(0);
  expect(report.cases[0].timing.warmed.search.samples).toBe(1);
});
