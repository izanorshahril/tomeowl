import { describe, expect, test } from "bun:test";
import { referenceLayout } from "../src/viewer/reference-geometry";
import { projectView } from "../src/viewer/projection";
import { initialState } from "../src/viewer/state";
import type { Snapshot, SourceLayer, ViewerSource } from "../src/viewer/types";

const source = (id: string, layer: SourceLayer): ViewerSource => ({
  id, layer, title: id, path: `${layer}/${id}.md`, collection: "sample", corpus: "workspace",
  kind: "document", revision: "r1", chunkCount: 1,
});
const layers: SourceLayer[] = ["project", "guidance", "skill", "app", "document", "research", "citation"];
const sources = layers.flatMap(layer => Array.from({ length: layer === "citation" ? 37 : 11 },
  (_, index) => source(`${layer}-${String(index).padStart(2, "0")}`, layer)));

describe("reference graph forms", () => {
  for (const mode of ["constellation", "orbital"] as const) {
    test(`${mode} keeps every actual identity, deterministic placement and unmodified input`, () => {
      const before = structuredClone(sources);
      const layout = referenceLayout(sources, mode);
      expect(layout.positions.size).toBe(sources.length);
      expect([...layout.positions.keys()].sort()).toEqual(sources.map(source => source.id).sort());
      expect(layout).toEqual(referenceLayout(sources, mode));
      expect(layout).toEqual(referenceLayout([...sources].reverse(), mode));
      expect(sources).toEqual(before);
      for (const point of layout.positions.values()) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)).toBe(true);
      }
      expect(new Set([...layout.positions.values()].map(point => point.z)).size).toBeGreaterThan(20);
      expect(layout.anchors.map(anchor => anchor.layer)).toEqual(layers);
      expect(layout.anchors.reduce((sum, anchor) => sum + anchor.count, 0)).toBe(sources.length);
    });

    test(`${mode} preserves positions when the renderer filters the complete scope`, () => {
      const snapshot: Snapshot = { schemaVersion: 1, generatedAt: "2026-10-03T00:00:00Z",
        sources, relations: [], stats: { sources: sources.length, chunks: sources.length, relations: 0 } };
      const state = { ...initialState(snapshot), query: "document-04", layer: "document" as const };
      const shown = projectView(snapshot, state).sources;
      const scope = projectView(snapshot, { ...state, layer: "all", query: "" }).sources;
      const filtered = referenceLayout(scope, mode);
      expect(shown).toHaveLength(1);
      expect(filtered.positions.get(shown[0]!.id)).toEqual(referenceLayout(sources, mode).positions.get(shown[0]!.id));
    });

    test(`${mode} handles empty and singleton scopes without invented nodes`, () => {
      const empty = referenceLayout([], mode);
      expect(empty.positions.size).toBe(0);
      expect(empty.anchors).toEqual([]);
      expect(empty.rings).toEqual([]);
      expect(empty.core).toEqual({ x: 0, y: 0, z: 0 });
      expect(empty.extent).toBe(0);
      const one = referenceLayout([source("only", "research")], mode);
      expect([...one.positions.keys()]).toEqual(["only"]);
      expect(one.anchors).toHaveLength(1);
      expect(one.anchors[0]!.count).toBe(1);
      expect(Number.isFinite(one.extent) && one.extent > 0).toBe(true);
      if (mode === "constellation") {
        expect(referenceLayout([source("project", "project")], mode).positions.get("project")).toEqual(empty.core);
      }
    });
  }

  test("constellation separates role clouds and places each source within its own volume", () => {
    const layout = referenceLayout(sources, "constellation");
    expect(layout.rings).toEqual([]);
    const outer = layout.anchors.filter(anchor => anchor.layer !== "project" && anchor.layer !== "guidance");
    for (const anchor of layout.anchors) {
      for (const item of sources.filter(item => item.layer === anchor.layer)) {
        const point = layout.positions.get(item.id)!;
        expect(Math.hypot(point.x - anchor.point.x, point.y - anchor.point.y)).toBeLessThanOrEqual(anchor.radius);
      }
    }
    for (let index = 0; index < outer.length; index++) {
      for (const other of outer.slice(index + 1)) {
        const anchor = outer[index]!;
        expect(Math.hypot(anchor.point.x - other.point.x, anchor.point.y - other.point.y))
          .toBeGreaterThan(anchor.radius + other.radius);
      }
    }
    const project = layout.anchors.find(anchor => anchor.layer === "project")!;
    const guidance = layout.anchors.find(anchor => anchor.layer === "guidance")!;
    expect(project.point).toEqual(layout.core);
    expect(project.radius).toBeLessThan(guidance.radius);
    for (const item of sources.filter(item => item.layer === "project")) {
      const point = layout.positions.get(item.id)!;
      expect(Math.hypot(point.x, point.y)).toBeGreaterThan(24);
      expect(Math.hypot(point.x, point.y)).toBeLessThan(50);
    }
    const thirtyProjects = referenceLayout(Array.from({ length: 30 }, (_, index) => source(`project-${index}`, "project")), "constellation");
    for (const point of thirtyProjects.positions.values()) {
      expect(Math.hypot(point.x, point.y)).toBeGreaterThan(47);
      expect(Math.hypot(point.x, point.y)).toBeLessThan(50);
    }
  });

  test("constellation radius grows with recorded source count within a bounded extent", () => {
    const small = referenceLayout([source("one", "document")], "constellation");
    const largeSources = Array.from({ length: 1000 }, (_, index) => source(`doc-${index}`, "document"));
    const large = referenceLayout(largeSources, "constellation");
    expect(large.positions.size).toBe(1000);
    expect(large.anchors[0]!.radius).toBeGreaterThan(small.anchors[0]!.radius);
    expect(large.anchors[0]!.radius).toBeLessThanOrEqual(150);
    expect(large.extent).toBeLessThan(600);
  });

  test("large constellation role clouds retain separation when every outer role reaches its bound", () => {
    const outerLayers = layers.filter(layer => layer !== "project" && layer !== "guidance");
    const crowded = outerLayers.flatMap(layer => Array.from({ length: 1000 }, (_, index) => source(`${layer}-${index}`, layer)));
    const layout = referenceLayout(crowded, "constellation");
    expect(layout.positions.size).toBe(5000);
    for (let index = 0; index < layout.anchors.length; index++) {
      const anchor = layout.anchors[index]!;
      for (const other of layout.anchors.slice(index + 1)) {
        expect(Math.hypot(anchor.point.x - other.point.x, anchor.point.y - other.point.y))
          .toBeGreaterThan(anchor.radius + other.radius);
      }
    }
  });

  test("orbital uses concentric role bands, disjoint knowledge sectors and multiple actual-source tracks", () => {
    const layout = referenceLayout(sources, "orbital");
    const ring = (layer: SourceLayer) => layout.rings.find(ring => ring.layer === layer)!;
    expect(ring("project").outerRadius).toBeLessThan(ring("guidance").innerRadius);
    expect(ring("guidance").outerRadius).toBeLessThan(ring("skill").innerRadius);
    expect(ring("skill").outerRadius).toBeLessThan(ring("document").innerRadius);
    expect(ring("document").outerRadius).toBeLessThan(ring("app").innerRadius);
    expect(ring("document").radius).toBe(ring("research").radius);
    expect(ring("research").radius).toBe(ring("citation").radius);
    expect(ring("document").endAngle).toBeLessThan(ring("research").startAngle);
    expect(ring("research").endAngle).toBeLessThan(ring("citation").startAngle);
    const citationRadii = new Set<number>();
    const citationAngles = new Set<number>();
    for (const item of sources) {
      const point = layout.positions.get(item.id)!;
      const bounds = ring(item.layer!);
      const radius = Math.hypot(point.x, point.y);
      expect(radius).toBeGreaterThanOrEqual(bounds.innerRadius - 0.000001);
      expect(radius).toBeLessThanOrEqual(bounds.outerRadius + 0.000001);
      if (item.layer === "project") expect(radius).toBeGreaterThan(24);
      if (item.layer === "document" || item.layer === "research" || item.layer === "citation") {
        let angle = Math.atan2(point.y, point.x);
        if (angle < bounds.startAngle) angle += Math.PI * 2;
        if (angle > bounds.endAngle) angle -= Math.PI * 2;
        expect(angle).toBeGreaterThan(bounds.startAngle);
        expect(angle).toBeLessThan(bounds.endAngle);
      }
      if (item.layer === "citation") {
        citationRadii.add(Math.round(radius));
        citationAngles.add(Math.round(Math.atan2(point.y, point.x) * 1e9));
      }
    }
    expect(citationRadii.size).toBeGreaterThan(1);
    expect(citationAngles.size).toBe(sources.filter(item => item.layer === "citation").length);
    const anchor = (layer: SourceLayer) => layout.anchors.find(anchor => anchor.layer === layer)!;
    expect(anchor("project").point.x < 0 && anchor("project").point.y < 0).toBe(true);
    expect(anchor("guidance").point.x > 0 && anchor("guidance").point.y < 0).toBe(true);
    expect(anchor("skill").point.x > 0 && anchor("skill").point.y > 0).toBe(true);
    expect(anchor("app").point.x).toBeCloseTo(0);
    expect(anchor("app").point.y).toBeGreaterThan(ring("app").outerRadius);
    expect(anchor("app").title).toBe("App manifests");
    for (const layer of ["document", "research", "citation"] as const) {
      expect(Math.hypot(anchor(layer).point.x, anchor(layer).point.y)).toBeCloseTo(ring(layer).outerRadius + 45);
    }
  });

  test("literature keeps citations factual and sorts tied paths by source identity", () => {
    const tied = [source("z", "citation"), source("a", "citation"), source("b", "citation")];
    tied.forEach(item => { item.path = "same.md"; });
    const degree = new Map([["z", 12], ["a", 3], ["b", 3]]);
    for (const mode of ["constellation", "orbital"] as const) {
      const layout = referenceLayout(tied, mode, { literature: true, degrees: degree });
      expect([...layout.positions.keys()]).toEqual(["z", "a", "b"]);
      expect(layout).toEqual(referenceLayout([...tied].reverse(), mode, { literature: true, degrees: degree }));
      expect(layout.anchors[0]!.title).toBe("Cited sources");
      expect(layout.anchors[0]!.count).toBe(3);
    }
  });
});
