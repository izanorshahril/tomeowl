import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { Evidence, Relation } from "../src/domain";
import { graphNeighborhood, graphPath } from "../src/graph-query";
import { addRelations, makeSnapshot, openStore } from "../src/store";

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const db = openStore(":memory:"); databases.push(db);
  const source = (id: string, collection = "public", path = `D:/graph/public/${id}.md`) => {
    db.query("INSERT INTO sources(id,title,path,collection,kind,revision,scope) VALUES(?,?,?,?,?,?,?)")
      .run(id, `Source ${id}`, path, collection, "document", "r1", "D:/graph");
    db.query("INSERT INTO chunks(id,source_id,revision,body,locator,ordinal) VALUES(?,?,?,?,?,?)")
      .run(`chunk-${id}`, id, "r1", `Citation from ${id}`, JSON.stringify({ lineStart: 1, lineEnd: 1 }), 0);
  };
  const citation = (id: string, changes: Partial<Evidence> = {}): Evidence => ({
    sourceId: id, revision: "r1", chunkId: `chunk-${id}`, quote: `Citation from ${id}`, locator: { lineStart: 1, lineEnd: 1 }, ...changes
  });
  const edge = (id: string, from: string, to: string, citations = [citation(from)]) => {
    const relation: Relation = { id, source: from, target: to, kind: "references", basis: "structural", evidence: citations };
    addRelations(db, [relation]);
  };
  return { db, source, citation, edge };
}

describe("native recorded-reference graph", () => {
  test("cycles, reversed links, and equal-length alternatives have deterministic shortest paths", () => {
    const { db, source, edge } = fixture(); for (const id of ["a", "b", "c", "d"]) source(id);
    edge("02-ac", "c", "a"); edge("01-ab", "a", "b"); edge("04-cd", "c", "d"); edge("03-bd", "d", "b"); edge("05-bc", "b", "c");
    const neighborhood = graphNeighborhood(db, ["a"], { depth: 3 });
    expect(neighborhood.sources.map(row => row.id)).toEqual(["a", "b", "c", "d"]);
    expect(neighborhood.distances).toEqual({ a: 0, b: 1, c: 1, d: 2 });
    expect(neighborhood.paths.d).toEqual(["01-ab", "03-bd"]);
    expect(neighborhood.truncated).toBe(false);
    const path = graphPath(db, "a", "d");
    expect(path.status).toBe("found"); expect(path.sourceIds).toEqual(["a", "b", "d"]);
    expect(path.relationIds).toEqual(["01-ab", "03-bd"]);
    expect(path.relations[1]).toMatchObject({ source: "d", target: "b", kind: "references", basis: "structural" });
    expect(path.relations[1].evidence[0]).toMatchObject({ sourceId: "d", chunkId: "chunk-d", revision: "r1", locator: { lineStart: 1, lineEnd: 1 } });
    expect(path.explanation).toContain("Undirected");
    expect(graphPath(db, "a", "d").relationIds).toEqual(path.relationIds);
  });

  test("scope excludes hidden bridges and out-of-scope supporting citations", () => {
    const { db, source, edge, citation } = fixture(); source("a"); source("b"); source("hidden", "private", "D:/graph/private/hidden.md");
    edge("01-ah", "a", "hidden"); edge("02-hb", "hidden", "b");
    edge("03-ab-hidden-evidence", "a", "b", [citation("hidden")]);
    const scoped = graphNeighborhood(db, ["a"], { collection: "public", depth: 8 });
    expect(scoped.sources.map(row => row.id)).toEqual(["a"]); expect(scoped.relations).toEqual([]);
    expect(scoped.truncated).toBe(false);
    expect(graphPath(db, "a", "b", { collection: "public", depth: 8 }).status).toBe("not-found");
    expect(graphPath(db, "a", "b").status).toBe("found");
    expect(() => graphNeighborhood(db, ["hidden"], { collection: "public" })).toThrow("No indexed source in the requested scope");
    expect(() => graphPath(db, "a", "hidden", { path: "D:/graph/public" })).toThrow("No indexed source in the requested scope");
    expect(graphNeighborhood(db, ["a"], { path: "D:/graph/public", depth: 8 }).relations).toEqual([]);
  });

  test("only latest indexed source, chunk, and revision evidence grounds traversal", () => {
    const { db, source, edge, citation } = fixture(); for (const id of ["a", "b", "c", "d", "e"]) source(id);
    edge("01-old-revision", "a", "b", [citation("a", { revision: "r0" })]);
    edge("02-wrong-chunk-source", "a", "c", [citation("a", { chunkId: "chunk-c" })]);
    edge("03-missing-chunk", "a", "d", [citation("a", { chunkId: "missing" })]);
    edge("04-stale-source", "a", "e", [citation("e")]);
    db.query("UPDATE sources SET revision='r2' WHERE id='e'").run();
    expect(graphNeighborhood(db, ["a"], { depth: 8 }).relations).toEqual([]);
    edge("05-current", "a", "b", [citation("a")]);
    expect(graphPath(db, "a", "b").relationIds).toEqual(["05-current"]);
    // This query reads the indexed revision, and does not require live files.
    expect(graphPath(db, "a", "b").relations[0].evidence[0].revision).toBe("r1");
  });

  test("dangling endpoints and malformed evidence are ignored without crashing", () => {
    const { db, source, edge } = fixture(); source("a"); source("b"); edge("good", "a", "b");
    db.exec("PRAGMA foreign_keys=OFF");
    db.query("INSERT INTO relations(id,source_id,target_id,kind,basis,evidence) VALUES(?,?,?,?,?,?)")
      .run("dangling", "a", "missing", "references", "structural", "[]");
    for (const [id, content] of [["malformed", "{oops"], ["object", "{}"], ["primitives", '["text",1,null]']]) {
      db.query("INSERT INTO relations(id,source_id,target_id,kind,basis,evidence) VALUES(?,?,?,?,?,?)")
        .run(id, "a", "b", "references", "structural", content);
    }
    expect(graphNeighborhood(db, ["a"]).relations.map(row => row.id)).toEqual(["good"]);
  });

  test("isolated and missing roots have explicit behavior; zero depth can be exhaustive", () => {
    const { db, source, edge } = fixture(); source("a"); source("b"); source("isolated"); edge("ab", "a", "b");
    const isolated = graphNeighborhood(db, ["isolated"], { depth: 0 });
    expect(isolated.sources).toHaveLength(1); expect(isolated.relations).toEqual([]); expect(isolated.truncated).toBe(false);
    expect(graphNeighborhood(db, ["a"], { depth: 0 }).truncated).toBe(true);
    expect(graphPath(db, "a", "isolated", { depth: 8 }).status).toBe("not-found");
    const self = graphPath(db, "a", "a", { depth: 0, limit: 1 });
    expect(self.status).toBe("found"); expect(self.sourceIds).toEqual(["a"]); expect(self.relationIds).toEqual([]); expect(self.truncated).toBe(false);
    let unknown: unknown; try { graphNeighborhood(db, ["missing"]); } catch (error) { unknown = error; }
    expect(unknown).toMatchObject({ code: "NOT_FOUND", message: "No indexed source in the requested scope" });
    expect(() => graphNeighborhood(db, [])).toThrow("Supply between 1 and 100 source IDs");
  });

  test("source, edge, and depth limits produce bounded results and honest misses", () => {
    const { db, source, edge } = fixture(); for (const id of ["a", "b", "c", "d"]) source(id);
    edge("01-ab", "a", "b"); edge("02-bc", "b", "c"); edge("03-cd", "c", "d");
    const limited = graphNeighborhood(db, ["a"], { depth: 8, limit: 2 });
    expect(limited.sources).toHaveLength(2); expect(limited.relations).toHaveLength(1); expect(limited.truncated).toBe(true);
    expect(limited.omissions.some(text => text.startsWith("Source limit"))).toBe(true);
    expect(graphNeighborhood(db, ["a"], { depth: 8, maxEdges: 1 }).relations).toHaveLength(1);
    expect(graphPath(db, "a", "d", { depth: 2 }).status).toBe("truncated");
    expect(graphPath(db, "a", "d", { limit: 2 }).status).toBe("truncated");
    expect(graphPath(db, "a", "d", { maxEdges: 1 }).status).toBe("truncated");
    expect(graphPath(db, "a", "d", { depth: 3 }).status).toBe("found");
    expect(graphNeighborhood(db, ["a", "a"]).sources.map(row => row.id)).toEqual(["a", "b"]);
    expect(() => graphNeighborhood(db, ["a", "b"], { limit: 1 })).toThrow("Source limit must accommodate every root");
  });

  test("high-degree queries bound retained sources, edges, and evidence output", () => {
    const { db, source, edge, citation } = fixture(); source("root");
    db.query("UPDATE chunks SET body=? WHERE id='chunk-root'").run(`Citation from root ${"x".repeat(10_000)}`);
    for (let i = 0; i < 150; i++) {
      const id = `n${String(i).padStart(3, "0")}`; source(id);
      edge(id, "root", id, [citation("root", { quote: "x".repeat(10_000) }), citation(id)]);
    }
    const result = graphNeighborhood(db, ["root"], { limit: 7, maxEdges: 5 });
    expect(result.sources).toHaveLength(6); expect(result.relations).toHaveLength(5); expect(result.truncated).toBe(true);
    expect(result.sources.map(row => row.id)).toEqual(["root", "n000", "n001", "n002", "n003", "n004"]);
    expect(result.relations.every(row => row.evidence.length === 1 && row.evidence[0].quote.length === 300)).toBe(true);
    expect(result.omissions.some(text => text.includes("300 characters"))).toBe(true);
    expect(result.omissions.some(text => text.includes("additional stored citations"))).toBe(true);
    const direct = graphPath(db, "root", "n000", { maxEdges: 1 });
    expect(direct.status).toBe("found"); expect(direct.truncated).toBe(true); expect(direct.shortest).toBe(false);
  });

  test("evidence selects the first valid scoped citation and bounds locator shape", () => {
    const { db, source, edge, citation } = fixture(); source("a"); source("b"); source("hidden", "private");
    db.query("UPDATE sources SET kind='transcript' WHERE id='b'").run();
    db.query("UPDATE chunks SET locator=? WHERE id='chunk-b'").run(JSON.stringify({ startSeconds: 4, endSeconds: 6 }));
    edge("ab", "a", "b", [citation("hidden"), citation("a", { revision: "old" }), citation("b", { locator: { startSeconds: 4, endSeconds: 6 } })]);
    const result = graphNeighborhood(db, ["a"], { collection: "public" });
    expect(result.relations[0].evidence).toEqual([citation("b", { locator: { startSeconds: 4, endSeconds: 6 } })]);
    expect(JSON.stringify(result)).not.toContain("hidden");
  });

  test("Unicode quotes fit the character budget without splitting surrogate pairs", () => {
    const { db, source, edge, citation } = fixture(); source("a"); source("b");
    db.query("UPDATE chunks SET body=? WHERE id='chunk-a'").run(`x${"\u{1f98b}".repeat(300)}`);
    edge("ab", "a", "b", [citation("a", { quote: `x${"\u{1f98b}".repeat(300)}` })]);
    const result = graphNeighborhood(db, ["a"]), quote = result.relations[0].evidence[0].quote;
    expect(quote.length).toBeLessThanOrEqual(300); expect(/[\uD800-\uDBFF]$/.test(quote)).toBe(false);
    expect(result.omissions.some(text => text.includes("300 characters"))).toBe(true);
  });

  test("multiple roots retain zero distances and deterministic tie selection", () => {
    const { db, source, edge } = fixture(); for (const id of ["a", "b", "c"]) source(id);
    edge("ac", "a", "c"); edge("bc", "b", "c");
    const result = graphNeighborhood(db, ["b", "a"], { depth: 1 });
    expect(result.sources.map(row => row.id)).toEqual(["a", "b", "c"]);
    expect(result.distances).toEqual({ a: 0, b: 0, c: 1 }); expect(result.paths.c).toEqual(["ac"]);
    expect(result.relations).toHaveLength(2); expect(result.truncated).toBe(false);
  });

  test("validates all limits and never writes to the database", () => {
    const { db, source, edge } = fixture(); source("a"); source("b"); edge("ab", "a", "b");
    for (const options of [{ depth: -1 }, { depth: 9 }, { depth: 0.5 }, { limit: 0 }, { limit: 1001 }, { maxEdges: 0 }, { maxEdges: 5001 }]) {
      expect(() => graphNeighborhood(db, ["a"], options)).toThrow();
    }
    expect(() => graphNeighborhood(db, ["a"], { collection: "" })).toThrow();
    const before = db.query("SELECT total_changes() n").get(); db.exec("PRAGMA query_only=ON");
    expect(graphNeighborhood(db, ["a"]).relations).toHaveLength(1); expect(graphPath(db, "b", "a").status).toBe("found");
    expect(db.query("SELECT total_changes() n").get()).toEqual(before);
  });

  test("current citation IDs do not admit invented quotes, empty quotes or out-of-chunk locators", () => {
    const { db, source, edge, citation } = fixture(); source("a"); source("b");
    const changes: Partial<Evidence>[] = [
      { quote: "invented quotation" }, { quote: "" }, { locator: { lineStart: 99, lineEnd: 99 } },
      { locator: { lineStart: 1, lineEnd: 99 } }, { locator: { lineStart: 1.5, lineEnd: 1.5 } },
      { locator: { lineStart: 0, lineEnd: 1 } }, { locator: {} },
      { locator: { startSeconds: 1, endSeconds: 2 } },
    ];
    changes.forEach((change, index) => edge(`bad-${index}`, "a", "b", [citation("a", change)]));
    expect(graphNeighborhood(db, ["a"]).relations).toEqual([]);
    expect(graphPath(db, "a", "b").status).toBe("not-found");
    expect(makeSnapshot(db).relations).toEqual([]);
    // Authentication checks the whole stored quotation before applying its output prefix limit.
    db.query("UPDATE chunks SET body=? WHERE id='chunk-a'").run("x".repeat(300));
    edge("bad-tail", "a", "b", [citation("a", { quote: `${"x".repeat(300)}invented tail` })]);
    expect(graphNeighborhood(db, ["a"]).relations).toEqual([]);
    expect(makeSnapshot(db).relations).toEqual([]);
  });

  test("first authentic alternate citation is selected and narrower line coordinates remain intact", () => {
    const { db, source, edge, citation } = fixture(); source("a"); source("b");
    db.query("UPDATE chunks SET body=?,locator=? WHERE id='chunk-a'")
      .run("Introduction\nLocated supporting quote\nConclusion", JSON.stringify({ lineStart: 10, lineEnd: 12 }));
    const narrow = citation("a", { quote: "Located supporting quote", locator: { lineStart: 11, lineEnd: 11 } });
    edge("ab", "a", "b", [citation("a", { quote: "invented" }),
      citation("a", { quote: "Introduction", locator: { lineStart: 11, lineEnd: 10 } }), narrow]);
    expect(graphNeighborhood(db, ["a"]).relations[0].evidence).toEqual([narrow]);
    expect(makeSnapshot(db).relations[0].evidence).toEqual([narrow]);
  });

  test("timestamp bounds authenticate ranges, reject unsupported coordinates and preserve point fallback", () => {
    const { db, source, edge, citation } = fixture(); source("a"); source("b");
    db.query("UPDATE sources SET kind='transcript' WHERE id='a'").run();
    db.query("UPDATE chunks SET locator=? WHERE id='chunk-a'").run(JSON.stringify({ startSeconds: 4, endSeconds: 6 }));
    for (const [index, locator] of [{ startSeconds: 3, endSeconds: 5 }, { startSeconds: 4, endSeconds: 7 },
      { startSeconds: 5, endSeconds: 4 }, { startSeconds: Infinity, endSeconds: Infinity }, {}].entries()) {
      edge(`bad-${index}`, "a", "b", [citation("a", { locator })]);
    }
    expect(graphNeighborhood(db, ["a"]).relations).toEqual([]); expect(makeSnapshot(db).relations).toEqual([]);
    const point = citation("a", { locator: { startSeconds: 5 } }); edge("point", "a", "b", [point]);
    expect(graphNeighborhood(db, ["a"]).relations[0].evidence).toEqual([point]);
    expect(makeSnapshot(db).relations[0].evidence).toEqual([point]);
    db.exec("DELETE FROM relations");
    db.query("UPDATE chunks SET locator='{}' WHERE id='chunk-a'").run();
    const unlocated = citation("a", { locator: {} }); edge("unlocated", "a", "b", [unlocated]);
    expect(graphNeighborhood(db, ["a"]).relations[0].evidence).toEqual([unlocated]);
    expect(makeSnapshot(db).relations[0].evidence).toEqual([unlocated]);
  });
});
