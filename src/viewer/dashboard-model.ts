import { corpusOf, groupName, groupOf, layerNames, layerOf, layerOrder, sourceName } from "./projection";
import type { Snapshot, ViewerSource } from "./types";

const compare = (a: string, b: string) => a.localeCompare(b, "en");

function manifestPath(snapshot: Snapshot, source: ViewerSource) {
  const project = snapshot.sample?.projects.find(project => project.id === source.projectId);
  const path = source.path.replace(/\\/g, "/");
  const prefix = project?.path.replace(/\\/g, "/").replace(/\/$/, "");
  return prefix && path.toLowerCase().startsWith(`${prefix.toLowerCase()}/`)
    ? path.slice(prefix.length + 1) : path.split("/").slice(-2).join("/");
}

// Inventory belongs to the whole immutable snapshot, independently of map filters.
// Shared URL counts describe recorded citations, never semantic agreement.
export function createDashboardModel(snapshot: Snapshot) {
  const byId = new Map(snapshot.sources.map(source => [source.id, source]));
  const relations = snapshot.relations.filter(relation => byId.has(relation.source) && byId.has(relation.target));
  const workspace = snapshot.sources.filter(source => corpusOf(source) === "workspace");
  const notes = snapshot.sources.filter(source => corpusOf(source) === "literature" && layerOf(source) === "research");
  const citations = snapshot.sources.filter(source => corpusOf(source) === "literature" && layerOf(source) === "citation");
  const citationIds = new Set(citations.map(source => source.id));
  const noteCitations = new Map(notes.map(source => [source.id, new Set<string>()]));
  for (const relation of relations) {
    if (relation.kind === "references" && citationIds.has(relation.target)) {
      noteCitations.get(relation.source)?.add(relation.target);
    }
  }
  const citationReaders = new Map<string, number>();
  for (const targets of noteCitations.values()) {
    for (const id of targets) citationReaders.set(id, (citationReaders.get(id) ?? 0) + 1);
  }
  const research = notes.map(source => {
    const targets = [...noteCitations.get(source.id)!];
    return { source, name: sourceName(source), referenceCount: targets.length,
      sharedCount: targets.filter(id => (citationReaders.get(id) ?? 0) > 1).length };
  }).sort((a, b) => b.referenceCount - a.referenceCount || compare(a.name, b.name) || compare(a.source.path, b.source.path));
  const allManifests = workspace.filter(source => layerOf(source) === "app").map(source => ({
    source, project: groupOf(source), name: groupName(snapshot, groupOf(source)), path: manifestPath(snapshot, source),
  })).sort((a, b) => compare(a.name, b.name) || a.path.split("/").length - b.path.split("/").length || compare(a.path, b.path));
  const seenProjects = new Set<string>();
  const manifests = allManifests.filter(item => {
    if (seenProjects.has(item.project)) return false;
    seenProjects.add(item.project); return true;
  });
  const skills = workspace.filter(source => layerOf(source) === "skill").map(source => ({
    source, name: sourceName(source), projectName: groupName(snapshot, groupOf(source)),
  })).sort((a, b) => compare(a.name, b.name) || compare(a.source.path, b.source.path));
  const layers = layerOrder.map(layer => ({ layer, name: layerNames[layer],
    count: snapshot.sources.filter(source => layerOf(source) === layer).length,
    corpora: [...new Set(snapshot.sources.filter(source => layerOf(source) === layer).map(corpusOf))],
  }));
  const scan = snapshot.sample?.scan;
  const selectedFiles = scan && Number.isFinite(scan.selectedFiles) ? scan.selectedFiles : null;
  const discoveredFiles = scan && Number.isFinite(scan.discoveredFiles) ? scan.discoveredFiles! : null;
  const parsedDate = new Date(snapshot.generatedAt);
  return {
    totals: { projects: snapshot.sample?.projects.length ?? new Set(workspace.map(groupOf)).size,
      sources: snapshot.sources.length, chunks: snapshot.sources.reduce((total, source) => total + source.chunkCount, 0),
      relations: relations.length },
    projectLabel: snapshot.sample ? "Projects" : "Source groups",
    layers, manifests, manifestCount: allManifests.length, skills, research,
    researchCount: notes.length, citationCount: citations.length,
    generatedAt: Number.isFinite(parsedDate.valueOf()) ? parsedDate.toISOString() : null,
    workspaceRoot: snapshot.sample?.workspaceRoot ?? null,
    coverage: scan ? { selectedFiles, discoveredFiles,
      fraction: selectedFiles !== null && discoveredFiles !== null && discoveredFiles > 0
        ? Math.min(1, Math.max(0, selectedFiles / discoveredFiles)) : null,
      projectCount: scan.projectCount, discoveredProjects: scan.discoveredProjects ?? null,
      maxDepth: scan.bounds.maxDepth, warnings: [...scan.warnings],
    } : null,
  };
}
