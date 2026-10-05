import { describe, expect, test } from "bun:test";
import { Chunk, Source } from "../src/domain";
import { parseGraphify } from "../src/adapters/graphify";
import { projectMarkdown } from "../src/adapters/qmd";

const source = (id: string, path: string, revision: string): Omit<Source, "scope"> => ({
  id, title: `Source ${id}`, path, collection: "docs", kind: "document", revision, chunkCount: 1,
});
const chunk = (sourceId: string, revision: string, id = `${sourceId}-chunk`): Chunk => ({
  id, sourceId, revision, ordinal: 0, text: "line one\nline two\nline three", locator: { lineStart: 1, lineEnd: 3 },
});

describe("QMD Markdown projection", () => {
  test("keeps output path contained and source text inside a safe fence", () => {
    const current = source("a", "../../outside.md", "rev-a");
    const content = chunk("a", "rev-a");
    content.text = "line one\n```\n# injected heading\nline three";
    const projected = projectMarkdown(current, [content]);
    expect(projected.relativePath).toMatch(/^sources\/[a-f0-9]{24}\.md$/);
    expect(projected.relativePath.includes("..")).toBe(false);
    expect(projected.markdown).toContain("````\nline one\n```\n# injected heading\nline three\n````");
    expect(projected.markdown).toContain('Source: "../../outside.md"');
  });

  test("rejects chunks from a different revision", () => {
    expect(() => projectMarkdown(source("a", "a.md", "current"), [chunk("a", "old")])).toThrow("current source revision");
  });
});

describe("Graphify import", () => {
  const aPath = "D:\\repo\\a.ts";
  const bPath = "D:\\repo\\b.ts";
  const a = { source: source("a", "a.ts", "rev-a"), chunks: [chunk("a", "rev-a")] };
  const b = { source: source("b", "b.ts", "rev-b"), chunks: [chunk("b", "rev-b")] };
  const catalog = new Map([[aPath, a], [bPath, b]]);
  const graph = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    nodes: [
      { id: "a", source_file: aPath, source_revision: "rev-a" },
      { id: "b", source_file: bPath, source_revision: "rev-b" },
    ],
    edges: [{ id: "e", source: "a", target: "b", relation: "calls", confidence: "EXTRACTED", source_file: aPath, source_revision: "rev-a", source_location: "L2", ...overrides }],
  });

  test("imports only an extracted edge with current path, revision, and cited chunk", () => {
    const result = parseGraphify(graph(), catalog);
    expect(result.warnings).toEqual([]);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toMatchObject({ source: "a", target: "b", kind: "references", basis: "imported" });
    expect(result.relations[0].evidence[0]).toMatchObject({ sourceId: "a", revision: "rev-a", chunkId: "a-chunk", locator: { lineStart: 2, lineEnd: 2 } });
  });

  test("warns and skips stale or unknown source paths", () => {
    const stale = JSON.parse(graph());
    stale.nodes[0].source_revision = "old";
    const staleResult = parseGraphify(JSON.stringify(stale), catalog);
    expect(staleResult.relations).toHaveLength(0);
    expect(staleResult.warnings.some(message => message.includes("missing or stale"))).toBe(true);

    const unknownGraph = JSON.parse(graph());
    unknownGraph.nodes[0].source_file = "D:\\other\\a.ts";
    const unknown = parseGraphify(JSON.stringify(unknownGraph), catalog);
    expect(unknown.relations).toHaveLength(0);
    expect(unknown.warnings.some(message => message.includes("source path is not uniquely indexed"))).toBe(true);
  });

  test("skips dangling and null records with warnings", () => {
    const payload = JSON.parse(graph());
    payload.nodes.push(null);
    payload.edges.push(null, { id: "dangling", source: "missing", target: "b" });
    const result = parseGraphify(JSON.stringify(payload), catalog);
    expect(result.relations).toHaveLength(1);
    expect(result.warnings.some(message => message.includes("malformed node"))).toBe(true);
    expect(result.warnings.some(message => message.includes("malformed edge"))).toBe(true);
    expect(result.warnings.some(message => message.includes("dangling or unvalidated"))).toBe(true);
  });

  test("rejects oversized inputs and unverified vanilla Graphify edges", () => {
    expect(() => parseGraphify(graph(), catalog, { maxBytes: 10 })).toThrow("byte limit");
    const vanilla = JSON.parse(graph());
    delete vanilla.nodes[0].source_revision;
    delete vanilla.nodes[1].source_revision;
    delete vanilla.edges[0].source_revision;
    const result = parseGraphify(JSON.stringify(vanilla), catalog);
    expect(result.relations).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("accepts the NetworkX links shape and warns when revisions are absent", () => {
    const vanilla = JSON.parse(graph());
    delete vanilla.nodes[0].source_revision;
    delete vanilla.nodes[1].source_revision;
    delete vanilla.edges[0].source_revision;
    const networkx = {
      directed: true,
      multigraph: false,
      graph: {},
      nodes: vanilla.nodes,
      links: vanilla.edges,
      hyperedges: [],
      built_at_commit: "snapshot",
    };
    const result = parseGraphify(JSON.stringify(networkx), catalog);
    expect(result.relations).toHaveLength(0);
    expect(result.warnings.some(message => message.includes("source revision is missing or stale"))).toBe(true);
  });

  test("rejects conflicting edges and links arrays", () => {
    const payload = JSON.parse(graph());
    payload.links = [{ source: "a", target: "b", relation: "different" }];
    expect(() => parseGraphify(JSON.stringify(payload), catalog)).toThrow("conflicting edges and links");
  });
});
