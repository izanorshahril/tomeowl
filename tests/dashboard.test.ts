import { describe, expect, test } from "bun:test";
import { createDashboardModel } from "../src/viewer/dashboard-model";
import type { Snapshot, SourceLayer, ViewerRelation, ViewerSource } from "../src/viewer/types";

const source = (id: string, layer: SourceLayer, corpus: "workspace" | "literature" = "workspace", overrides: Partial<ViewerSource> = {}): ViewerSource => ({
  id, title: id, path: `${id}.md`, collection: "Demo", kind: "document", revision: "revision", chunkCount: 2,
  layer, corpus, projectId: corpus === "workspace" ? "demo" : undefined, ...overrides,
});
const relation = (id: string, from: string, to: string, overrides: Partial<ViewerRelation> = {}): ViewerRelation => ({
  id, source: from, target: to, kind: "references", basis: "structural", evidence: [], ...overrides,
});
const snapshot = (sources: ViewerSource[], relations: ViewerRelation[] = []): Snapshot => ({
  schemaVersion: 1, generatedAt: "2026-10-03T05:09:36.425Z", sources, relations,
  stats: { sources: 999, chunks: 999, relations: 999 },
});

describe("command center inventory", () => {
  test("uses actual snapshot arrays and valid links, including cross-corpus records", () => {
    const data = snapshot([source("project", "project"), source("skill", "skill"),
      source("note", "research", "literature"), source("url", "citation", "literature")], [
      relation("contains", "project", "skill", { kind: "contains" }),
      relation("cites", "note", "url"), relation("cross", "project", "note"),
      relation("missing", "note", "absent"),
    ]);
    const before = structuredClone(data);
    const model = createDashboardModel(data);
    expect(model.totals).toEqual({ projects: 1, sources: 4, chunks: 8, relations: 3 });
    expect(model.layers.reduce((total, layer) => total + layer.count, 0)).toBe(4);
    expect(model.researchCount).toBe(1); expect(model.citationCount).toBe(1);
    expect(model.research[0]!.referenceCount).toBe(1);
    expect(model.layers.find(layer => layer.layer === "research")!.corpora).toEqual(["literature"]);
    expect(data).toEqual(before);
  });

  test("ranks distinct citations and shared URLs without treating proximity or mentions as citations", () => {
    const data = snapshot([source("Alpha", "research", "literature"), source("Beta", "research", "literature"),
      source("Zero", "research", "literature"), source("shared", "citation", "literature"),
      source("unique", "citation", "literature"), source("workspace", "document")], [
      relation("alpha-shared", "Alpha", "shared"), relation("duplicate-span", "Alpha", "shared", { basis: "imported" }),
      relation("alpha-unique", "Alpha", "unique"), relation("beta-shared", "Beta", "shared", { basis: "lexical" }),
      relation("beta-mentions", "Beta", "unique", { kind: "mentions" }),
      relation("beta-similar", "Beta", "unique", { kind: "similar" }),
      relation("zero-cross", "Zero", "workspace"), relation("reverse", "unique", "Zero"),
    ]);
    const model = createDashboardModel(data);
    expect(model.research.map(note => [note.source.id, note.referenceCount, note.sharedCount]))
      .toEqual([["Alpha", 2, 1], ["Beta", 1, 1], ["Zero", 0, 0]]);
    expect(model.research).toEqual(createDashboardModel({ ...data, sources: [...data.sources].reverse(), relations: [...data.relations].reverse() }).research);
  });

  test("lists one root manifest per project while retaining the full manifest count", () => {
    const data = snapshot([
      source("nested", "app", "workspace", { path: "D:\\Dev\\Demo\\crates\\api\\Cargo.toml" }),
      source("root", "app", "workspace", { path: "d:/dev/demo/Cargo.toml", title: "Comment read as title" }),
      source("other", "app", "workspace", { projectId: "other", path: "D:\\Dev\\Other\\package.json" }),
      source("skill", "skill", "workspace", { title: "Inspect evidence" }),
    ]);
    data.sample = {
      name: "Local", workspaceRoot: "D:\\Dev", projects: [
        { id: "demo", title: "Demo", path: "D:\\Dev\\Demo", sourceIds: ["root", "nested", "skill"] },
        { id: "other", title: "Other", path: "D:\\Dev\\Other", sourceIds: ["other"] },
      ], scan: { projectCount: 2, selectedFiles: 4, researchFiles: 0, citationRecords: 0,
        omissions: {}, warnings: [], bounds: { maxDepth: 4, filesPerProject: 10, maxFileBytes: 256, maxTotalBytes: 1024, maxResearchFiles: 32, maxCitationRecords: 96 } },
    };
    const model = createDashboardModel(data);
    expect(model.manifestCount).toBe(3);
    expect(model.manifests.map(item => [item.source.id, item.name, item.path]))
      .toEqual([["root", "Demo", "Cargo.toml"], ["other", "Other", "package.json"]]);
    expect(model.skills.map(item => [item.name, item.projectName])).toEqual([["Inspect evidence", "Demo"]]);
    expect(model.totals.projects).toBe(2); expect(model.projectLabel).toBe("Projects");
    expect(model.coverage!.selectedFiles).toBe(4); expect(model.coverage!.fraction).toBeNull();
  });

  test("reports bounded coverage without converting scan-pass omissions into a missing-file total", () => {
    const data = snapshot([]);
    data.sample = {
      name: "Bounded scan", workspaceRoot: "D:\\Dev", projects: [],
      scan: { projectCount: 30, discoveredProjects: 30, selectedFiles: 161, discoveredFiles: 262, researchFiles: 10, citationRecords: 96,
        omissions: { fileBudgetReached: 110, directoryBudgetReached: 2574 }, warnings: ["One source unreadable"],
        bounds: { maxDepth: 4, filesPerProject: 10, maxFileBytes: 262144, maxTotalBytes: 8388608, maxResearchFiles: 32, maxCitationRecords: 96 } },
    };
    const coverage = createDashboardModel(data).coverage!;
    expect(coverage.selectedFiles).toBe(161); expect(coverage.discoveredFiles).toBe(262);
    expect(coverage.fraction).toBeCloseTo(161 / 262);
    expect(coverage.warnings).toEqual(["One source unreadable"]);
    expect(coverage).not.toHaveProperty("missingFiles");
    expect(coverage).not.toHaveProperty("complete");
  });

  test("handles legacy and empty snapshots without inventing coverage, research, or dates", () => {
    const legacy = source("legacy", "document", "workspace", { projectId: undefined, layer: undefined, corpus: undefined, collection: "" });
    const model = createDashboardModel({ ...snapshot([legacy]), generatedAt: "unknown" });
    expect(model.projectLabel).toBe("Source groups"); expect(model.totals.projects).toBe(1);
    expect(model.coverage).toBeNull(); expect(model.workspaceRoot).toBeNull(); expect(model.generatedAt).toBeNull();
    expect(model.researchCount).toBe(0); expect(model.citationCount).toBe(0);
    const empty = createDashboardModel(snapshot([]));
    expect(empty.totals).toEqual({ projects: 0, sources: 0, chunks: 0, relations: 0 });
    expect(empty.layers.every(layer => layer.count === 0)).toBe(true);
    expect(empty.manifests).toEqual([]); expect(empty.skills).toEqual([]); expect(empty.research).toEqual([]);
  });
});
