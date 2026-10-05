import { existsSync, lstatSync, mkdirSync, opendirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { ingest } from "../src/ingest";
import { hash, type Relation, type Snapshot, TomeowlError } from "../src/domain";
import { addRelations, makeSnapshot, openStore, sourceDetails } from "../src/store";

export type SampleLayer = "project" | "guidance" | "skill" | "app" | "document" | "research" | "citation";
type SelectedFile = { path: string; projectPath: string; projectTitle: string; layer: SampleLayer; bytes: number };
type Project = { title: string; path: string; files: SelectedFile[]; discoveredFiles: number; omissions: Record<string,number> };
export const SAMPLE_BOUNDS = {
  maxDepth: 4, filesPerProject: 10, maxFileBytes: 256 * 1024, maxTotalBytes: 8 * 1024 * 1024,
  maxResearchFiles: 32, maxCitationRecords: 96, maxEntriesPerProject: 10000, maxDirectoriesPerProject: 128,
};
type Bounds = typeof SAMPLE_BOUNDS;
export type SampleMetadata = {
  name: string; workspaceRoot: string;
  projects: Array<{ id: string; title: string; path: string; sourceIds: string[]; coverage: { discoveredFiles:number; selectedFiles:number; omissions:Record<string,number> } }>;
  scan: { discoveredProjects: number; discoveredFiles: number; projectCount: number; selectedFiles: number; researchFiles: number; citationRecords: number; omissions: Record<string, number>; warnings: string[]; bounds: Bounds };
};
export type SampleSnapshot = Snapshot & {
  sample: SampleMetadata;
  sources: Array<Snapshot["sources"][number] & { projectId?: string; layer?: SampleLayer; corpus?: "workspace" | "literature" }>;
};
const EXCLUDED = new Set(["node_modules", "vendor", "dist", "build", "out", "target", "coverage", "venv", "env", "__pycache__", "generated", "artifacts", "data", "reference", "references", "backups", "backup", "archive", "archives", "prototype-data", "downloads", "tmp", "temp"]);
const MANIFESTS = new Set(["package.json", "pyproject.toml", "cargo.toml"]);
const key = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;
const forward = (path: string) => path.split(sep).join("/");
function publicName(name: string) { return !/(?:secret|credential|private[-_]?key|id_rsa|id_ed25519|keyring|\.env)/i.test(name); }
function classify(path: string, root: string): SampleLayer {
  const name = basename(path).toLowerCase(), parts = forward(relative(root, path)).toLowerCase().split("/");
  if (name === "skill.md" || parts.includes("skills")) return "skill";
  if (["agents.md", "claude.md", "context.md"].includes(name) || name === "readme.md" && dirname(path) === root) return "guidance";
  if (MANIFESTS.has(name)) return "app";
  return "document";
}
function ranked(file: SelectedFile) {
  if (basename(file.path).toLowerCase() === "readme.md" && dirname(file.path) === file.projectPath) return 0;
  return ({ guidance: 1, app: 2, skill: 3, document: 4, research: 5, project: 0, citation: 6 })[file.layer];
}

// This is a bounded demonstration inventory, not a filesystem crawler or a complete catalog.
export function scanWorkspace(workspaceRoot: string, projectRoot: string, overrides: Partial<Bounds> = {}) {
  const bounds = { ...SAMPLE_BOUNDS, ...overrides };
  const omissions: Record<string, number> = {}, warnings: string[] = [];
  const omit = (reason: string, count = 1) => { omissions[reason] = (omissions[reason] ?? 0) + count; };
  const root = resolve(workspaceRoot), ownRoot = resolve(projectRoot);
  if (lstatSync(root).isSymbolicLink() || !statSync(root).isDirectory()) throw new TomeowlError("Workspace must be a real directory", "INVALID_ROOT");
  let remainingBytes = bounds.maxTotalBytes;
  const discoveredFiles = new Set<string>();
  const entries = (directory: string, budget: { count: number }) => {
    const found: Array<{ name: string; directory: boolean; symlink: boolean }> = [];
    let handle;
    try {
      handle = opendirSync(directory);
      while (budget.count < bounds.maxEntriesPerProject) {
        const entry = handle.readSync(); if (!entry) break; budget.count++;
        found.push({ name: entry.name, directory: entry.isDirectory(), symlink: entry.isSymbolicLink() });
      }
      if (budget.count >= bounds.maxEntriesPerProject) omit("entryBudgetReached");
    } catch { omit("unreadableDirectories"); if (warnings.length < 20) warnings.push(`Cannot enumerate ${directory}`); }
    finally { handle?.closeSync(); }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  };
  const accept = (path: string, project: Project): SelectedFile | undefined => {
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink()) { omit("symlinks"); return; }
      if (!info.isFile()) return;
      discoveredFiles.add(key(resolve(path)));
      if (info.size > bounds.maxFileBytes) { omit("oversizedFiles"); return; }
      return { path: realpathSync(path), projectPath: project.path, projectTitle: project.title, layer: classify(path, project.path), bytes: info.size };
    } catch { omit("unreadableFiles"); return; }
  };
  const projects: Project[] = [];
  for (const entry of entries(root, { count: 0 })) {
    if (entry.symlink) { omit("symlinks"); continue; }
    if (!entry.directory) continue;
    if (entry.name.startsWith(".")) { omit("hiddenEntries"); continue; }
    if (!publicName(entry.name)) { omit("secretNames"); continue; }
    if (EXCLUDED.has(entry.name.toLowerCase())) { omit("excludedDirectories"); continue; }
    const beforeOmissions={...omissions},beforeFiles=discoveredFiles.size;
    const project: Project = { title: entry.name, path: realpathSync(join(root, entry.name)), files: [], discoveredFiles:0, omissions:{} };
    const candidates: SelectedFile[] = [], queue = [{ path: project.path, depth: 0 }];
    const budget = { count: 0 }; let directories = 0;
    while (queue.length && directories < bounds.maxDirectoriesPerProject && budget.count < bounds.maxEntriesPerProject) {
      const dir = queue.shift()!; directories++;
      for (const item of entries(dir.path, budget)) {
        if (item.symlink) { omit("symlinks"); continue; }
        if (item.name.startsWith(".")) { omit("hiddenEntries"); continue; }
        if (!publicName(item.name)) { omit("secretNames"); continue; }
        const path = join(dir.path, item.name);
        if (item.directory) {
          if (EXCLUDED.has(item.name.toLowerCase())) { omit("excludedDirectories"); continue; }
          if (dir.depth >= bounds.maxDepth) { omit("depthLimitedDirectories"); continue; }
          if (queue.length >= bounds.maxDirectoriesPerProject) { omit("directoryBudgetReached"); continue; }
          queue.push({ path, depth: dir.depth + 1 });
        } else if ([".md", ".markdown"].includes(extname(item.name).toLowerCase()) || MANIFESTS.has(item.name.toLowerCase())) {
          const file = accept(path, project); if (file) candidates.push(file);
        } else omit("unsupportedFiles");
      }
    }
    if (queue.length) omit("unvisitedDirectories", queue.length);
    candidates.sort((a, b) => ranked(a) - ranked(b) || a.path.localeCompare(b.path));
    for (const file of candidates) {
      if (project.files.length >= bounds.filesPerProject) { omit("fileBudgetReached"); continue; }
      if (file.bytes > remainingBytes) { omit("totalByteBudgetReached"); continue; }
      project.files.push(file); remainingBytes -= file.bytes;
    }
    project.discoveredFiles=discoveredFiles.size-beforeFiles;
    project.omissions=Object.fromEntries(Object.entries(omissions).map(([reason,count])=>[reason,count-(beforeOmissions[reason]??0)]).filter(([,count])=>Number(count)>0));
    projects.push(project);
  }
  const ownProject = projects.find(project => key(project.path) === key(ownRoot));
  const researchFiles: SelectedFile[] = [];
  const beforeResearchFiles=discoveredFiles.size,beforeResearchOmissions={...omissions};
  const researchRoot = join(ownRoot, "docs", "research");
  if (ownProject && existsSync(researchRoot) && !lstatSync(researchRoot).isSymbolicLink()) {
    const queue = [{ path: researchRoot, depth: 0 }], budget = { count: 0 };
    while (queue.length && researchFiles.length < bounds.maxResearchFiles && budget.count < bounds.maxEntriesPerProject) {
      const dir = queue.shift()!;
      for (const item of entries(dir.path, budget)) {
        if (item.symlink || item.name.startsWith(".") || !publicName(item.name)) { omit("excludedResearchEntries"); continue; }
        const path = join(dir.path, item.name);
        if (item.directory) { if (dir.depth < bounds.maxDepth && !EXCLUDED.has(item.name.toLowerCase())) queue.push({ path, depth: dir.depth + 1 }); continue; }
        if (![".md", ".markdown"].includes(extname(item.name).toLowerCase())) continue;
        const file = accept(path, ownProject); if (!file) continue;
        if (researchFiles.length >= bounds.maxResearchFiles) { omit("researchFileBudgetReached"); continue; }
        const already = ownProject.files.find(existing => key(existing.path) === key(file.path));
        if (!already && file.bytes > remainingBytes) { omit("totalByteBudgetReached"); continue; }
        file.layer = "research"; researchFiles.push(file);
        if (already) already.layer = "research"; else { ownProject.files.push(file); remainingBytes -= file.bytes; }
      }
    }
    if (queue.length) omit("unvisitedResearchDirectories", queue.length);
  }
  if(ownProject){ownProject.discoveredFiles+=discoveredFiles.size-beforeResearchFiles;for(const [reason,count] of Object.entries(omissions)){const extra=count-(beforeResearchOmissions[reason]??0);if(extra)ownProject.omissions[reason]=(ownProject.omissions[reason]??0)+extra;}}
  return { workspaceRoot: root, projects, researchFiles, bounds, omissions, warnings, discoveredProjects: projects.length, discoveredFiles: discoveredFiles.size };
}

type Citation = { url: string; title: string; path: string; occurrences: Array<{ path: string; line: number; quote: string }> };
function recordedUrls(path: string) {
  const links: Array<{ url: string; title: string; line: number; quote: string }> = [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/); let fence = "";
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (marker[1][0] === fence) fence = ""; continue; }
    if (fence) continue;
    for (const match of lines[i].matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+["'][^)]*["'])?\)|<(https?:\/\/[^>\s]+)>|^\s*\[[^\]]+\]:\s*(https?:\/\/\S+)/g)) {
      try {
        const url = new URL(match[2] ?? match[3] ?? match[4]);
        if (url.username || url.password) continue;
        links.push({ url: url.href, title: match[1] ?? url.hostname, line: i + 1, quote: lines[i].slice(0, 300) });
      } catch { /* Invalid destinations are omitted, never fetched. */ }
    }
  }
  return links;
}

export async function buildWorkspaceSample(options: { workspaceRoot: string; projectRoot: string; output: string; html?: boolean; bounds?: Partial<Bounds> }) {
  const output = resolve(options.output), database = join(output, "workspace.sqlite"), records = join(output, "records");
  if (existsSync(database) || existsSync(records)) throw new TomeowlError("Sample output already exists; choose a new --out directory", "OUTPUT_EXISTS");
  const scan = scanWorkspace(options.workspaceRoot, options.projectRoot, options.bounds);
  mkdirSync(records, { recursive: true });
  const generated = new Map<string, { project: Project; overview: string }>();
  for (const project of scan.projects) {
    const overview = join(records, `project-${hash(key(project.path)).slice(0, 16)}.md`);
    const lines = [`# ${project.title}`, "", `Project directory: ${project.path}`, "", "This project anchor records directory membership; it makes no claim about project status or dependency direction.", `Selected documents and manifests: ${project.files.length}.`, "", ...project.files.map(file => `- ${file.layer}: [${forward(relative(project.path, file.path)).replace(/[\[\]]/g, "")}](${`<${encodeURI(forward(relative(records, file.path))).replace(/#/g,"%23").replace(/\?/g,"%3F")}>`})`), "", "## Scan coverage", `Discovered candidate files: ${project.discoveredFiles}.`, ...Object.entries(project.omissions).map(([reason,count])=>`- ${reason}: ${count}`)];
    writeFileSync(overview, lines.join("\n") + "\n"); generated.set(key(project.path), { project, overview });
  }
  const byUrl = new Map<string, Citation>();
  for (const file of scan.researchFiles) for (const link of recordedUrls(file.path)) {
    const record = byUrl.get(link.url) ?? { url: link.url, title: link.title, path: "", occurrences: [] };
    record.occurrences.push({ path: file.path, line: link.line, quote: link.quote }); byUrl.set(link.url, record);
  }
  const citations = [...byUrl.values()].sort((a, b) => b.occurrences.length - a.occurrences.length || a.url.localeCompare(b.url)).slice(0, scan.bounds.maxCitationRecords);
  if (byUrl.size > citations.length) scan.omissions.citationRecordBudgetReached = byUrl.size - citations.length;
  for (const citation of citations) {
    citation.path = join(records, `citation-${hash(citation.url).slice(0, 16)}.md`);
    writeFileSync(citation.path, `# Citation record: ${citation.title.replace(/[\r\n]/g, " ").slice(0, 160)}\n\nURL-only citation metadata extracted from local research Markdown.\nThe linked publication's content has not been fetched, ingested, or verified by this sample.\n\nRecorded URL: ${citation.url}\nRecorded mentions: ${citation.occurrences.length}\n`);
  }
  const selected = scan.projects.flatMap(project => project.files);
  const roots = [...selected.map(file => file.path), ...[...generated.values()].map(record => record.overview), ...citations.map(record => record.path)];
  const db = openStore(database);
  let snapshot: SampleSnapshot;
  try {
    ingest(roots, { db, limit: 10000 });
    const catalog = makeSnapshot(db), sourceByPath = new Map(catalog.sources.map(source => [key(source.path), source]));
    const sources: SampleSnapshot["sources"] = catalog.sources;
    const projects: SampleMetadata["projects"] = [];
    for (const { project, overview } of generated.values()) {
      const anchor = sourceByPath.get(key(overview))!;
      Object.assign(anchor, { title: project.title, collection: project.title, projectId: anchor.id, layer: "project", corpus: "workspace" });
      const sourceIds = [anchor.id];
      for (const file of project.files) {
        const source = sourceByPath.get(key(file.path)); if (!source) continue;
        const detail = sourceDetails(db, source.id, 1);
        const heading = detail.chunks[0]?.text.match(/^#\s+(.+)$/m)?.[1]?.trim();
        Object.assign(source, { title: heading?.slice(0, 160) ?? `${basename(source.path)} · ${project.title}`, collection: file.layer === "research" ? "Research literature" : project.title, projectId: anchor.id, layer: file.layer, corpus: file.layer === "research" ? "literature" : "workspace" });
        sourceIds.push(source.id);
      }
      // Membership is evidenced by the generated inventory line, not inferred from document text.
      db.query("UPDATE relations SET kind='contains' WHERE source_id=? AND kind='references'").run(anchor.id);
      projects.push({ id: anchor.id, title: project.title, path: project.path, sourceIds, coverage:{discoveredFiles:project.discoveredFiles,selectedFiles:project.files.length,omissions:project.omissions} });
    }
    const relations: Relation[] = [];
    for (const citation of citations) {
      const target = sourceByPath.get(key(citation.path))!;
      Object.assign(target, { title: `Citation record: ${citation.title.slice(0, 100)}`, url: citation.url, collection: "Research literature", layer: "citation", corpus: "literature" });
      for (const occurrence of citation.occurrences) {
        const source = sourceByPath.get(key(occurrence.path)); if (!source) continue;
        const chunk = sourceDetails(db, source.id, 2000).chunks.find(chunk => chunk.locator.lineStart! <= occurrence.line && chunk.locator.lineEnd! >= occurrence.line);
        if (!chunk) continue;
        relations.push({ id: hash(`${source.id}\0${target.id}\0${occurrence.line}`).slice(0, 32), source: source.id, target: target.id, kind: "references", basis: "structural", evidence: [{ sourceId: source.id, revision: source.revision, chunkId: chunk.id, quote: occurrence.quote, locator: { lineStart: occurrence.line, lineEnd: occurrence.line } }] });
      }
    }
    addRelations(db, relations);
    // Retain useful labels in the SQLite sample while view-only grouping stays in the snapshot.
    const update = db.query("UPDATE sources SET title=?,collection=?,url=? WHERE id=?");
    db.transaction(() => { for (const source of sources) update.run(source.title, source.collection, source.url ?? null, source.id); })();
    const final = makeSnapshot(db);
    snapshot = { ...final, sources, sample: { name: "Local workspace + research", workspaceRoot: scan.workspaceRoot, projects, scan: { discoveredProjects: scan.discoveredProjects, discoveredFiles: scan.discoveredFiles, projectCount: projects.length, selectedFiles: selected.length, researchFiles: scan.researchFiles.length, citationRecords: citations.length, omissions: scan.omissions, warnings: scan.warnings, bounds: scan.bounds } } };
  } finally { db.close(); }
  const path = join(output, "workspace.snapshot.json");
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
  writeFileSync(join(output, "workspace.scan.json"), JSON.stringify(snapshot.sample, null, 2) + "\n");
  if (options.html !== false) {
    const { renderSnapshot } = await import("../src/viewer/export");
    writeFileSync(join(output, "workspace.html"), await renderSnapshot(snapshot));
  }
  return { database, path, snapshot };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2), values = new Map<string, string>();
  try {
    for (let i = 0; i < args.length; i += 2) {
      if (!["--dev-root", "--project-root", "--out", "--html"].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new TomeowlError("Use --dev-root PATH --project-root PATH --out DIRECTORY [--html false]", "INVALID_ARGUMENT");
      values.set(args[i], args[i + 1]);
    }
    const result = await buildWorkspaceSample({ workspaceRoot: values.get("--dev-root") ?? "D:/Dev", projectRoot: values.get("--project-root") ?? resolve(import.meta.dir, ".."), output: values.get("--out") ?? "data/design-workspace", html: values.get("--html") !== "false" });
    process.stdout.write(JSON.stringify({ ok: true, database: result.database, snapshot: result.path, stats: result.snapshot.stats, scan: result.snapshot.sample.scan }) + "\n");
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: { code: error instanceof TomeowlError ? error.code : "SAMPLE_ERROR", message: error instanceof Error ? error.message : String(error) } }) + "\n"); process.exitCode = 1;
  }
}
