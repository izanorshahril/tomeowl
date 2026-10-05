import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "../src/ingest";
import { makeSnapshot, openStore } from "../src/store";
import { buildWorkspaceSample, scanWorkspace } from "../scripts/workspace-sample";
import { createPreviewServer } from "../scripts/preview-workspace";

const tempDirs: string[] = [];
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() { const dir = mkdtempSync(join(tmpdir(), "tomeowl-workspace-")); tempDirs.push(dir); return dir; }

test("recorded links resolve across explicit file roots and Windows path casing", () => {
  const dir = fixture();
  const a = join(dir, "a"), b = join(dir, "b"); mkdirSync(a); mkdirSync(b);
  const target = join(b, "Evidence Note.md"), source = join(a, "README.md");
  const linkedPath = process.platform === "win32" ? target.toUpperCase() : target;
  writeFileSync(target, "# Evidence note\nRecorded target.\n");
  writeFileSync(source, `# Overview\nSee [recorded note](<${linkedPath}>).\n`);
  const db = openStore(join(dir, "index.sqlite"));
  try {
    ingest([source, target], { db, limit: 20 });
    const snapshot = makeSnapshot(db);
    expect(snapshot.relations).toHaveLength(1);
    expect(snapshot.relations[0].evidence[0].locator).toEqual({ lineStart: 2, lineEnd: 2 });
  } finally { db.close(); }
});

test("loopback preview rereads enriched snapshots and saved HTML between requests", async () => {
  const dir = fixture(), snapshotPath = join(dir, "workspace.snapshot.json"), htmlPath = join(dir, "workspace.html");
  const snapshot = { schemaVersion: 1, generatedAt: "2026-10-03T00:00:00.000Z", sources: [], relations: [], stats: { sources: 0, chunks: 0, relations: 0 }, sample: { name: "first" } };
  writeFileSync(snapshotPath, JSON.stringify(snapshot)); writeFileSync(htmlPath, "<h1>First saved view</h1>");
  const server = createPreviewServer({ snapshot: snapshotPath, html: htmlPath, port: 0 });
  try {
    expect(server.hostname).toBe("127.0.0.1");
    const first = await fetch(`${server.url}api/map`); expect((await first.json()).sample.name).toBe("first");
    writeFileSync(snapshotPath, JSON.stringify({ ...snapshot, sample: { name: "second" } }));
    const second = await fetch(`${server.url}api/map`); expect((await second.json()).sample.name).toBe("second");
    expect(second.headers.get("cache-control")).toBe("no-store");
    expect(await (await fetch(`${server.url}saved`)).text()).toContain("First saved view");
    writeFileSync(htmlPath, "<h1>Second saved view</h1>");
    expect(await (await fetch(`${server.url}saved`)).text()).toContain("Second saved view");
    const root = await fetch(server.url); expect(await root.text()).toContain('"name":"second"');
    expect((await fetch(server.url, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${server.url}missing`)).status).toBe(404);
  } finally { server.stop(true); }
});

test("workspace inventory includes empty projects and reports excluded and bounded files", () => {
  const dir = fixture(), root = join(dir, "dev"); mkdirSync(root);
  const alpha = join(root, "alpha"), empty = join(root, "empty"); mkdirSync(alpha); mkdirSync(empty);
  writeFileSync(join(alpha, "README.md"), "# Alpha\n");
  writeFileSync(join(alpha, "AGENTS.md"), "# Project guidance\n");
  writeFileSync(join(alpha, "secrets.md"), "must not ingest\n");
  mkdirSync(join(alpha, ".private")); writeFileSync(join(alpha, ".private", "note.md"), "hidden\n");
  mkdirSync(join(alpha, "node_modules")); writeFileSync(join(alpha, "node_modules", "README.md"), "dependency\n");
  const scan = scanWorkspace(root, alpha, { filesPerProject: 1 });
  expect(scan.projects.map(project => project.title)).toEqual(["alpha", "empty"]);
  expect(scan.projects[0].files.map(file => file.path)).toEqual([join(alpha, "README.md")]);
  expect(scan.projects[1].files).toHaveLength(0);
  expect(scan.discoveredFiles).toBe(2);
  expect(scan.discoveredProjects).toBe(2);
  expect(scan.omissions.secretNames).toBe(1);
  expect(scan.omissions.hiddenEntries).toBe(1);
  expect(scan.omissions.excludedDirectories).toBe(1);
  expect(scan.omissions.fileBudgetReached).toBe(1);
  expect(scan.projects[0].omissions.fileBudgetReached).toBe(1);
  expect(scan.projects[0].discoveredFiles).toBe(2);
  expect(scan.projects[0].files[0].layer).toBe("guidance");
  expect(scan.projects[1].omissions).toEqual({});
});

test("inventory preserves membership for filenames with URL delimiters", async () => {
  const dir=fixture(),root=join(dir,"dev"),project=join(root,"sample");mkdirSync(project,{recursive:true});
  const note=join(project,"Notes#1%202.md");writeFileSync(note,"# Literal filename\nEvidence.\n");
  const result=await buildWorkspaceSample({workspaceRoot:root,projectRoot:project,output:join(dir,"output"),html:false});
  const source=result.snapshot.sources.find(s=>s.path===note)!;
  expect(source).toBeDefined();
  expect(result.snapshot.relations.some(r=>r.target===source.id&&r.kind==="contains")).toBe(true);
  expect(result.snapshot.sample.projects[0].coverage.selectedFiles).toBe(1);
});

test("sample records membership and shared citations with valid chunk evidence without touching input", async () => {
  const dir = fixture(), root = join(dir, "dev"), output = join(dir, "sample"); mkdirSync(root);
  const project = join(root, "tomeowl"), empty = join(root, "empty"); mkdirSync(project); mkdirSync(empty);
  const research = join(project, "docs", "research"); mkdirSync(research, { recursive: true });
  const noteA = join(research, "a.md"), noteB = join(research, "b.md");
  const contentA = "# Research A\nSee [B](b.md) and [primary spec](https://example.com/spec).\n";
  writeFileSync(noteA, contentA);
  writeFileSync(noteB, "# Research B\nSee [same spec](https://example.com/spec).\n```md\n[example only](https://example.com/ignored)\n```\n");
  const result = await buildWorkspaceSample({ workspaceRoot: root, projectRoot: project, output, html: false });
  const snapshot = result.snapshot;
  expect(snapshot.sample.projects).toHaveLength(2);
  expect(snapshot.sample.scan.researchFiles).toBe(2);
  expect(snapshot.sample.scan.citationRecords).toBe(1);
  const citation = snapshot.sources.find(source => source.layer === "citation")!;
  expect(citation.url).toBe("https://example.com/spec");
  expect(citation.excerpt?.quote).toContain("content has not been fetched");
  const cited = snapshot.relations.filter(relation => relation.target === citation.id);
  expect(cited).toHaveLength(2);
  expect(cited.every(relation => relation.kind === "references" && relation.basis === "structural")).toBe(true);
  expect(snapshot.relations.filter(relation => relation.kind === "contains")).toHaveLength(2);
  expect(snapshot.relations.filter(relation => relation.kind === "references")).toHaveLength(3);
  const db = openStore(result.database);
  try {
    for (const relation of snapshot.relations) for (const evidence of relation.evidence) {
      expect(db.query("SELECT 1 FROM chunks WHERE id=? AND source_id=? AND revision=?").get(evidence.chunkId, evidence.sourceId, evidence.revision)).not.toBeNull();
    }
  } finally { db.close(); }
  expect(await Bun.file(noteA).text()).toBe(contentA);
  await expect(buildWorkspaceSample({ workspaceRoot: root, projectRoot: project, output, html: false })).rejects.toThrow("already exists");
});
