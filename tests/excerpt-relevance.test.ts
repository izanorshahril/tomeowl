import { expect, test } from "bun:test";
import { contextPacket } from "../src/context-query";
import { hash } from "../src/domain";
import { openStore, replaceScope, searchStore } from "../src/store";

const filler = "neutral filler background material. ".repeat(12);
type Match = "any" | "all" | "phrase";
function withChunk(text: string, callback: (db: ReturnType<typeof openStore>) => void) {
  const db = openStore(":memory:"), sourceId = hash(text).slice(0, 32), revision = hash(text);
  try {
    replaceScope(db, "excerpt-fixture", [{
      source: { id: sourceId, title: "Excerpt fixture", path: "excerpt-fixture.md", collection: "excerpt-fixture", kind: "document", revision, scope: "excerpt-fixture", chunkCount: 1 },
      chunks: [{ id: hash(`${sourceId}:${revision}:0`).slice(0, 32), sourceId, revision, text, locator: { lineStart: 10, lineEnd: 10 + (text.match(/\n/g)?.length ?? 0) }, ordinal: 0 }],
    }]);
    callback(db);
  } finally { db.close(); }
}

function assertExactCitation(text: string, passage: ReturnType<typeof contextPacket>["passages"][number], maxChars: number) {
  expect(passage.quote.length).toBeLessThanOrEqual(maxChars);
  expect(passage.excerpt).toBeDefined();
  const span = passage.excerpt!;
  expect(text.slice(span.start, span.end)).toBe(passage.quote);
  const lineStart = 10 + (text.slice(0, span.start).match(/\n/g)?.length ?? 0);
  expect(passage.locator.lineStart).toBe(lineStart);
  expect(passage.locator.lineEnd).toBe(lineStart + (passage.quote.replace(/\n$/, "").match(/\n/g)?.length ?? 0));
  expect(JSON.stringify(passage)).not.toContain("matchSpans");
}

for (const match of ["phrase", "all", "any"] as const) {
  test(`${match} excerpts choose the compact matching span after an isolated early token`, () => {
    const target = match === "phrase" ? "Graph retrieval" : "Graph and retrieval";
    const text = `Graph has an earlier isolated mention.\n${filler}\n${target} combines cited evidence.\n`;
    withChunk(text, db => {
      const packet = contextPacket(db, "graph retrieval", { match, depth: 0, maxChars: 80 });
      expect(packet.passages).toHaveLength(1);
      expect(packet.passages[0].quote).toContain(target);
      assertExactCitation(text, packet.passages[0], 80);
      const bounded = searchStore(db, "graph retrieval", 2, { match, quoteChars: 80 });
      expect(bounded[0].quote).toContain(target);
      expect(JSON.stringify(bounded)).not.toContain("matchSpans");
      expect(searchStore(db, "graph retrieval", 2, { match })[0].quote).toBe(text);
      expect(JSON.stringify(searchStore(db, "graph retrieval", 2, { match }))).not.toContain("matchSpans");
    });
  });
}

test("underscore query excerpts use the spaced phrase actually matched by FTS5", () => {
  const text = `Initial descriptive heading and introductory notes.\n${filler}\nThe repo map records module boundaries.\n`;
  withChunk(text, db => {
    const packet = contextPacket(db, "repo_map", { match: "phrase", depth: 0, maxChars: 80 });
    expect(packet.passages).toHaveLength(1);
    expect(packet.passages[0].quote).toContain("repo map");
    assertExactCitation(text, packet.passages[0], 80);
  });
});

test("decomposed accents retain the native match and original code units", () => {
  const text = `Initial descriptive heading and introductory notes.\n${filler}\nA re\u0301sume\u0301 records project decisions.\n`;
  withChunk(text, db => {
    const packet = contextPacket(db, "resume", { depth: 0, maxChars: 80 });
    expect(packet.passages).toHaveLength(1);
    expect(packet.passages[0].quote).toContain("re\u0301sume\u0301");
    assertExactCitation(text, packet.passages[0], 80);
  });
});

test("literal highlight marker collisions preserve original text and useful spans", () => {
  const text = `\u0001literal marker\u0002 introductory notes.\nGraph has an earlier isolated mention.\n${filler}\nGraph retrieval cites evidence.\n`;
  withChunk(text, db => {
    const packet = contextPacket(db, "graph retrieval", { match: "phrase", depth: 0, maxChars: 80 });
    expect(packet.passages).toHaveLength(1);
    expect(packet.passages[0].quote).toContain("Graph retrieval");
    assertExactCitation(text, packet.passages[0], 80);
    expect(searchStore(db, "graph retrieval", 2, { match: "phrase" })[0].quote).toBe(text);
  });
});

test("a tiny budget clips the real phrase without splitting Unicode surrogate pairs", () => {
  const text = `Graph has an earlier isolated mention.\n${filler}\n😀Graph retrieval cites evidence.\n`;
  withChunk(text, db => {
    const packet = contextPacket(db, "graph retrieval", { match: "phrase", depth: 0, maxChars: 2 });
    expect(packet.passages).toHaveLength(1);
    expect(packet.passages[0].quote).toBe("Gr");
    expect(packet.passages[0].excerpt!.start).toBe(text.lastIndexOf("Graph retrieval"));
    assertExactCitation(text, packet.passages[0], 2);
    expect(packet.omissions).toContain("character-limit");
  });
});

test("one-token matches retain the earliest deterministic excerpt", () => {
  const text = `Graph is the first match.\n${filler}\nGraph is a later match.\n`;
  withChunk(text, db => {
    const packet = contextPacket(db, "graph", { depth: 0, maxChars: 30 });
    expect(packet.passages[0].quote).toBe(text.slice(0, 30));
    assertExactCitation(text, packet.passages[0], 30);
  });
});

test("overlapping literal query groups retain the full covered native phrase", () => {
  const target = `alpha${" ".repeat(60)}beta${" ".repeat(60)}gamma`;
  const text = `${filler}\n${target}\n${filler}`;
  withChunk(text, db => {
    const packet = contextPacket(db, "alpha_beta_gamma beta", { match: "all", depth: 0, maxChars: 160 });
    expect(packet.passages).toHaveLength(1);
    expect(packet.passages[0].quote).toContain(target);
    assertExactCitation(text, packet.passages[0], 160);
  });
});

for (const { match, query } of [
  { match: "phrase", query: "alpha beta" },
  { match: "any", query: "alpha_beta" },
  { match: "all", query: "alpha_beta" },
] as const) {
  test(`${match} chooses a later complete phrase over an oversized first literal group`, () => {
    const text = `alpha${" ".repeat(300)}beta\n${filler}\nalpha beta supports the conclusion.\n${filler}`;
    withChunk(text, db => {
      const packet = contextPacket(db, query, { match, depth: 0, maxChars: 80 });
      expect(packet.passages).toHaveLength(1);
      expect(packet.passages[0].quote).toContain("alpha beta");
      assertExactCitation(text, packet.passages[0], 80);
    });
  });
}

for (const match of ["any", "all"] as const) {
  test(`${match} chooses a fitting query group over an oversized earlier group`, () => {
    const text = `alpha${" ".repeat(300)}beta\n${filler}\ngamma supports the conclusion.\n${filler}`;
    withChunk(text, db => {
      const packet = contextPacket(db, "alpha_beta gamma", { match, depth: 0, maxChars: 80 });
      expect(packet.passages).toHaveLength(1);
      expect(packet.passages[0].quote).toContain("gamma");
      assertExactCitation(text, packet.passages[0], 80);
    });
  });
}

test("oversized matches still clip the earliest actual phrase when none fit", () => {
  const first = `alpha${" ".repeat(300)}beta`, text = `Introductory notes.\n${first}\n${filler}\n${first}\n`;
  withChunk(text, db => {
    const packet = contextPacket(db, "alpha beta", { match: "phrase", depth: 0, maxChars: 2 });
    expect(packet.passages).toHaveLength(1);
    expect(packet.passages[0].quote).toBe("al");
    expect(packet.passages[0].excerpt!.start).toBe(text.indexOf("alpha"));
    assertExactCitation(text, packet.passages[0], 2);
  });
});
