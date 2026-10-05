import { afterEach, describe, expect, test } from "bun:test";
import { join, resolve, sep } from "node:path";
import { TomeowlError } from "../src/domain";
import { scopePredicate } from "../src/query-scope";
import { retrieve } from "../src/retrieval";
import { openStore, replaceScope, searchStore } from "../src/store";

const databases: ReturnType<typeof openStore>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture(rows: Array<{ id: string; text: string; path?: string; collection?: string }>) {
  const db = openStore(":memory:"); databases.push(db);
  const scope = resolve("data", "scoped-search-fixture");
  replaceScope(db, scope, rows.map(row => ({
    source: { id: row.id, title: `${row.id}.md`, path: row.path ?? join(scope, `${row.id}.md`), collection: row.collection ?? "Research", kind: "document" as const, revision: "r1", chunkCount: 1, scope },
    chunks: [{ id: `chunk-${row.id}`, sourceId: row.id, revision: "r1", text: row.text, locator: { lineStart: 4, lineEnd: 6 }, ordinal: 0 }]
  })));
  return { db, scope };
}
const ids = (rows: ReturnType<typeof retrieve>) => rows.map(row => row.sourceId).sort();
function errorCode(fn: () => unknown): string {
  try { fn(); } catch (error) { expect(error).toBeInstanceOf(TomeowlError); return (error as TomeowlError).code; }
  throw new Error("Expected a structured query error");
}

describe("native scoped search", () => {
  test("default any, all, and ordered phrase use literal tokens", () => {
    const { db } = fixture([
      { id: "alpha", text: "alpha" }, { id: "beta", text: "beta" },
      { id: "forward", text: "alpha beta" }, { id: "reverse", text: "beta alpha" },
      { id: "gap", text: "alpha unrelated beta" }
    ]);
    expect(ids(retrieve(db, "alpha beta"))).toEqual(["alpha", "beta", "forward", "gap", "reverse"]);
    expect(retrieve(db, "alpha beta")).toEqual(retrieve(db, "alpha beta", 20, { match: "any" }));
    expect(ids(retrieve(db, "alpha beta", 20, { match: "all" }))).toEqual(["forward", "gap", "reverse"]);
    expect(ids(retrieve(db, "alpha beta", 20, { match: "phrase" }))).toEqual(["forward"]);
    expect(ids(retrieve(db, "beta alpha", 20, { match: "phrase" }))).toEqual(["reverse"]);
    expect(ids(retrieve(db, '"alpha", beta!', 20, { match: "phrase" }))).toEqual(["forward"]);
    expect(searchStore(db, "alpha beta", 20, { match: "phrase" })).toEqual(retrieve(db, "alpha beta", 20, { match: "phrase" }));
  });

  test("collection and path restrictions apply before the ranked limit", () => {
    const scope = resolve("data", "scoped-search-fixture");
    const { db } = fixture([
      { id: "outside", text: "needle needle needle", collection: "Other", path: join(scope, "other", "a.md") },
      { id: "inside", text: "needle with many additional words", path: join(scope, "wanted", "a.md") },
      { id: "wrong-case", text: "needle", collection: "research", path: join(scope, "wanted", "b.md") }
    ]);
    expect(ids(retrieve(db, "needle", 1, { collection: "Research", path: join(scope, "wanted") }))).toEqual(["inside"]);
    expect(ids(retrieve(db, "needle", 10, { collection: "research" }))).toEqual(["wrong-case"]);
    expect(retrieve(db, "needle", 10, { collection: "Missing" })).toEqual([]);
  });

  test("path matches exact or subtree boundaries without filesystem checks or LIKE wildcards", () => {
    const scope = resolve("data", "scoped-search-fixture");
    const directory = join(scope, "notes%_");
    const exact = join(directory, "deleted.md");
    const { db } = fixture([
      { id: "exact", text: "needle", path: exact },
      { id: "nested", text: "needle", path: join(directory, "deeper", "note.md") },
      { id: "boundary", text: "needle", path: join(scope, "notes%_other", "note.md") },
      { id: "wildcard", text: "needle", path: join(scope, "notesAB", "note.md") }
    ]);
    expect(ids(retrieve(db, "needle", 10, { path: directory }))).toEqual(["exact", "nested"]);
    expect(ids(retrieve(db, "needle", 10, { path: `${directory}${sep}` }))).toEqual(["exact", "nested"]);
    expect(ids(retrieve(db, "needle", 10, { path: exact }))).toEqual(["exact"]);
    expect(ids(retrieve(db, "needle", 10, { path: join(directory, "..", "notes%_") }))).toEqual(["exact", "nested"]);
    expect(retrieve(db, "needle", 10, { path: `${exact}-extra` })).toEqual([]);
  });

  test("Windows paths normalize slashes and case; native non-Windows paths retain case", () => {
    const path = resolve("data", "scoped-search-fixture", "Upper", "Note.md");
    const { db } = fixture([{ id: "source", text: "needle", path }]);
    expect(ids(retrieve(db, "needle", 10, { path }))).toEqual(["source"]);
    if (process.platform === "win32") {
      expect(ids(retrieve(db, "needle", 10, { path: path.toUpperCase().replaceAll("\\", "/") }))).toEqual(["source"]);
      db.query("UPDATE sources SET path=?").run(path.replaceAll("\\", "/"));
      expect(ids(retrieve(db, "needle", 10, { path: path.toLowerCase() }))).toEqual(["source"]);
      expect(ids(retrieve(db, "needle", 10, { path: resolve(path, "..", "..", "..", "..") }))).toEqual(["source"]);
    } else {
      expect(retrieve(db, "needle", 10, { path: path.toUpperCase() })).toEqual([]);
    }
  });

  test("exact Unicode paths preserve non-ASCII spelling alongside Windows ASCII folding", () => {
    const path = resolve("data", "scoped-search-fixture", "CAFÉ", "Évidence.md");
    const { db } = fixture([{ id: "unicode-path", text: "needle", path }]);
    expect(ids(retrieve(db, "needle", 10, { path }))).toEqual(["unicode-path"]);
    if (process.platform === "win32") {
      const asciiLower = path.replace(/[A-Z]/g, letter => letter.toLowerCase());
      expect(ids(retrieve(db, "needle", 10, { path: asciiLower }))).toEqual(["unicode-path"]);
      expect(retrieve(db, "needle", 10, { path: path.toLowerCase() })).toEqual([]);
    }
  });

  test("operators and injected scope syntax remain literal", () => {
    const { db } = fixture([{ id: "plain", text: "alpha beta" }, { id: "literal", text: "alpha OR beta NEAR" }]);
    expect(ids(retrieve(db, "alpha OR beta", 10, { match: "all" }))).toEqual(["literal"]);
    expect(ids(retrieve(db, 'alpha" OR *', 10, { match: "all" }))).toEqual(["literal"]);
    expect(retrieve(db, "alpha", 10, { collection: "Research' OR 1=1 --" })).toEqual([]);
    expect((db.query("SELECT COUNT(*) n FROM sources").get() as { n: number }).n).toBe(2);
    expect(retrieve(db, "alpha NOT nonexistent", 10, { match: "all" })).toEqual([]);
  });

  test("indexed results ignore stale catalog chunks but remain available when live files are absent", () => {
    const { db, scope } = fixture([{ id: "source", text: "retained indexed evidence" }]);
    expect(retrieve(db, "indexed", 10, { path: scope })[0]).toMatchObject({ revision: "r1", quote: "retained indexed evidence", locator: { lineStart: 4, lineEnd: 6 } });
    db.query("UPDATE sources SET revision='r2' WHERE id='source'").run();
    expect(retrieve(db, "indexed", 10, { path: scope })).toEqual([]);
  });

  test("context quote bounds preserve ranking and citations without changing ordinary search shape", () => {
    const body = `needle ${"long evidence ".repeat(10000)}`;
    const { db } = fixture([{ id: "large", text: body }, { id: "short", text: "needle" }]);
    const full = retrieve(db, "needle");
    const bounded = retrieve(db, "needle", 20, { quoteChars: 32 });
    expect(bounded.map(row => ({ sourceId: row.sourceId, chunkId: row.chunkId, revision: row.revision, score: row.score })))
      .toEqual(full.map(row => ({ sourceId: row.sourceId, chunkId: row.chunkId, revision: row.revision, score: row.score })));
    expect(bounded.find(row => row.sourceId === "large")).toMatchObject({ quote: body.slice(0, 32), quoteTruncated: true, locator: { lineStart: 4, lineEnd: 4 }, excerpt: { start: 0, end: 32 } });
    expect("quoteTruncated" in full[0]!).toBe(false);
    expect("quoteTruncated" in bounded.find(row => row.sourceId === "short")!).toBe(false);
  });

  test("bounded quotes use UTF-16 budgets without leaving a split surrogate", () => {
    const { db } = fixture([{ id: "unicode", text: "needle 😀😀😀 rest" }]);
    expect(retrieve(db, "needle", 20, { quoteChars: 8 })[0]).toMatchObject({ quote: "needle ", quoteTruncated: true });
    expect(retrieve(db, "needle", 20, { quoteChars: 9 })[0]).toMatchObject({ quote: "needle 😀", quoteTruncated: true });
  });

  test("query lengths and term counts are bounded with structured errors", () => {
    const { db } = fixture([{ id: "source", text: "alpha" }]);
    expect(retrieve(db, `alpha${" ".repeat(1995)}`)).toHaveLength(1);
    expect(retrieve(db, Array.from({ length: 64 }, () => "alpha").join(" "))).toHaveLength(1);
    for (const query of ["", "!!!", "alpha".repeat(401), "😀".repeat(1001), Array.from({ length: 65 }, () => "alpha").join(" "), null]) {
      expect(errorCode(() => retrieve(db, query as string))).toBe("INVALID_QUERY");
    }
    for (const match of ["raw", null, 7, Symbol("match")]) {
      expect(errorCode(() => retrieve(db, "alpha", 20, { match: match as "any" }))).toBe("INVALID_MATCH");
    }
    for (const options of [null, [], 7, false, { collection: "" }, { collection: 7 }, { path: " " }, { path: "bad\0path" }]) {
      expect(errorCode(() => retrieve(db, "alpha", 20, options as any))).toBe("INVALID_SCOPE");
    }
    for (const quoteChars of [0, 64001, 1.5, NaN, Infinity, null, "10", Symbol("limit")]) {
      expect(errorCode(() => retrieve(db, "alpha", 20, { quoteChars: quoteChars as number }))).toBe("INVALID_LIMIT");
    }
    expect(scopePredicate()).toEqual({ sql: "1=1", params: [] });
  });
});
