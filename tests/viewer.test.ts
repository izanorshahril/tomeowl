import { describe, expect, test } from "bun:test";
import { layerZ, sourceLayout } from "../src/viewer/geometry";
import { renderSnapshot } from "../src/viewer/export";
import { projectView } from "../src/viewer/projection";
import { compactMapLabel, initialState } from "../src/viewer/state";
import type { Snapshot, SourceLayer, ViewerSource } from "../src/viewer/types";

const sample = (): Snapshot => ({
  schemaVersion: 1,
  generatedAt: "2026-10-02T10:00:00Z",
  stats: { sources: 3, chunks: 8, relations: 1 },
  sources: [
    { id: "a", title: "First document", path: "notes/first.md", collection: "Notes", kind: "document", revision: "r1", chunkCount: 3 },
    { id: "b", title: "Second document", path: "notes/second.md", collection: "Notes", kind: "document", revision: "r2", chunkCount: 4 },
    { id: "c", title: "Solo transcript", path: "video/solo.vtt", collection: "Videos", kind: "transcript", revision: "r3", chunkCount: 1 },
  ],
  relations: [{ id: "contains-a-b", source: "a", target: "b", kind: "contains", basis: "structural", evidence: [] }],
});

const source = (id: string, layer: SourceLayer, path = id): ViewerSource => ({
  id, layer, path, title: id, collection: "Notes", kind: "document", revision: "r1", chunkCount: 1,
});

describe("viewer layout", () => {
  test("keeps long source labels compact without changing the source title", () => {
    const data = sample();
    const fullTitle = "A source title long enough to overlap every nearby map node in a normal library";
    expect(compactMapLabel(fullTitle)).toHaveLength(44);
    expect(compactMapLabel(fullTitle).endsWith("…")).toBe(true);
    expect(data.sources[0]!.title).toBe("First document");
  });

  test("retains source identities and domain layers with deterministic path-sorted placement", () => {
    const sources = [source("skill", "skill"), source("later", "document", "z.md"), source("app", "app"),
      source("project", "project"), source("citation", "citation"), source("earlier", "document", "a.md"),
      source("research", "research"), source("guidance", "guidance")];
    const before = structuredClone(sources);
    const layout = sourceLayout(sources, "cluster");
    expect([...layout.positions.keys()].sort()).toEqual(sources.map(source => source.id).sort());
    expect(layout.layers).toEqual(["project", "guidance", "skill", "app", "document", "research", "citation"]);
    expect(layout).toEqual(sourceLayout(sources, "cluster"));
    expect(layout.positions).toEqual(sourceLayout([...sources].reverse(), "cluster").positions);
    expect(sources).toEqual(before);
    expect(layout.positions.get("earlier")).toEqual({ x: 320, y: -36, z: 0 });
    expect(layout.positions.get("later")).toEqual({ x: 320, y: 36, z: 0 });
    expect(layout.worldWidth).toBe(2240);
    expect(layout.worldHeight).toBe(380);
    expect(new Set([...layout.positions.values()].map(point => point.z)).size).toBeGreaterThan(1);
    for (const item of sources) expect(layout.positions.get(item.id)!.z).toBe(layerZ[item.layer!]);
  });

  test("keeps common source positions when filters and selection change over a full scope", () => {
    const data = sample();
    const initial = initialState(data);
    for (const mode of ["cluster", "rings"] as const) {
      const baseline = sourceLayout(data.sources, mode);
      for (const state of [{ ...initial, query: "second" }, { ...initial, layer: "document" as const, selectedSourceId: "a" }]) {
        const shown = projectView(data, state).sources;
        const placement = projectView(data, { ...state, layer: "all", query: "" }).sources;
        const filtered = sourceLayout(placement, mode);
        expect(shown.length).toBeLessThan(data.sources.length);
        expect(filtered.layers).toEqual(baseline.layers);
        for (const item of shown) {
          expect(filtered.positions.get(item.id)).toEqual(baseline.positions.get(item.id));
        }
      }
    }
  });

  test("places ring sources in supplied order with larger citation radii and layer depth", () => {
    const sources = [...sample().sources, source("citation", "citation")];
    const layout = sourceLayout(sources, "rings");
    expect(layout.positions.get("a")!.x).toBeCloseTo(0);
    expect(layout.positions.get("a")!.y).toBeCloseTo(-240);
    expect(layout.positions.get("b")!.x).toBeCloseTo(240);
    expect(layout.positions.get("b")!.y).toBeCloseTo(0);
    expect(layout.positions.get("c")!.y).toBeCloseTo(240);
    expect(layout.positions.get("c")!.z).toBe(-90);
    expect(layout.positions.get("citation")!.x).toBeCloseTo(-365);
    expect(layout.positions.get("citation")!.z).toBe(160);
    expect(layout.worldWidth).toBe(1000);
    expect(layout.worldHeight).toBe(900);
  });

  test("sorts citations by degree then path and places literature overflow in twelve-row columns", () => {
    const citations = Array.from({ length: 14 }, (_, index) => source(`c${String(index).padStart(2, "0")}`, "citation"));
    const degrees = new Map([["c13", 9], ["c00", 5]]);
    const sources = [source("research", "research"), ...citations.reverse()];
    const layout = sourceLayout(sources, "cluster", { literature: true, columnGap: 400, degrees });
    expect(layout.positions.get("c13")).toEqual({ x: 200, y: -396, z: 160 });
    expect(layout.positions.get("c00")).toEqual({ x: 200, y: -324, z: 160 });
    expect(layout.positions.get("c01")).toEqual({ x: 200, y: -252, z: 160 });
    expect(layout.positions.get("c11")).toEqual({ x: 600, y: -396, z: 160 });
    expect(layout.positions.get("c12")).toEqual({ x: 600, y: -324, z: 160 });
    expect(layout.columnGap).toBe(400);
    expect(layout.worldWidth).toBe(800);
    expect(layout.worldHeight).toBe(864);
    const unpaged = sourceLayout(sources, "cluster", { degrees });
    expect(unpaged.positions.get("c12")).toEqual({ x: 160, y: 468, z: 160 });
    expect(unpaged.worldHeight).toBe(1008);
  });

  test("returns finite bounds without inventing positions or layers for an empty scope", () => {
    for (const mode of ["cluster", "rings"] as const) {
      const layout = sourceLayout([], mode);
      expect(layout.positions.size).toBe(0);
      expect(layout.layers).toEqual([]);
      expect(Number.isFinite(layout.worldWidth) && layout.worldWidth > 0).toBe(true);
      expect(Number.isFinite(layout.worldHeight) && layout.worldHeight > 0).toBe(true);
      expect(layout.columnGap).toBe(320);
    }
  });
});

test("exports self-contained HTML while neutralizing script-closing and markup payloads", async () => {
  const data = sample();
  data.sources[0]!.title = "<img src=x onerror=alert(1)>";
  data.sources[0]!.excerpt = { quote: "</script><script>alert(1)</script>&" };
  const html = await renderSnapshot(data);
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("window.__TOMEOWL_SNAPSHOT__=");
  expect(html).toContain("\\u003cimg src=x onerror=alert(1)\\u003e");
  expect(html).toContain("\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e\\u0026");
  expect(html).not.toContain("</script><script>alert(1)</script>");
  expect(html).toContain("@media(max-width:740px)");
  expect(html).toContain("height:100dvh");
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  expect(html).toContain("matchMedia(\"(prefers-reduced-motion: reduce)\")");
});
