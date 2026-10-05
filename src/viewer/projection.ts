import type { Snapshot, SourceLayer, ViewerSource, ViewerState } from "./types";

export const layerNames: Record<SourceLayer, string> = {
  project: "Projects", guidance: "Main docs", skill: "Skills", app: "App manifests", document: "Documents", research: "Research", citation: "Citations",
  channel: "Channels", video: "Videos", description: "Descriptions", transcript: "Transcripts",
};
export const palette = ["#9ec9ba", "#c1ade5", "#88bdd8", "#dfbf8d", "#d8a6b6", "#a7c4e0", "#c0cb92"];
export const layerOrder: SourceLayer[] = ["project", "guidance", "skill", "app", "document", "research", "citation", "channel", "video", "description", "transcript"];
export const layerOf = (source: ViewerSource): SourceLayer => source.layer ?? (source.kind === "transcript" ? "research" : "document");
export const corpusOf = (source: ViewerSource) => source.corpus ?? "workspace";
export function corpusForLayer(snapshot: Snapshot, current: ViewerState["corpus"], layer: SourceLayer | "all") {
  const candidates=snapshot.sources.filter(source=>layer==="all"||layerOf(source)===layer);
  return candidates.some(source=>corpusOf(source)===current)?current:candidates[0]?corpusOf(candidates[0]):current;
}
export const groupOf = (source: ViewerSource) => corpusOf(source) === "literature" ? layerOf(source) === "citation" ? "citations" : "research" : source.projectId ?? (source.collection || "Unfiled");
export function groupName(snapshot: Snapshot, id: string) {
  if (id === "research") return "Research library";
  if (id === "citations") return "Cited sources";
  const channel = snapshot.media && snapshot.sources.find(source => source.layer === "channel" && groupOf(source) === id);
  if (channel) return sourceName(channel);
  return snapshot.sample?.projects.find(p => p.id === id)?.title ?? id;
}
export function sourceName(source: ViewerSource) {
  return source.title.replace(/^Citation record:\s*/i, "").replace(/\s*\(auto-generated captions\)$/, "");
}
export function readableExcerpt(quote: string) {
  return quote.replace(/<[^>]*>/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

// The same scoped projection drives 2D, 3D, the list and displayed counts.
// Category membership is presentation data, never a semantic relation.
export function projectView(snapshot: Snapshot, state: Pick<ViewerState, "corpus" | "groupId" | "layer" | "query">) {
  const query = state.query.trim().toLocaleLowerCase();
  const scoped = snapshot.sources.filter(s => corpusOf(s) === state.corpus);
  const sources = scoped.filter(s => (!state.groupId || groupOf(s) === state.groupId) &&
    (state.layer === "all" || layerOf(s) === state.layer) &&
    (!query || `${s.title}\n${s.path}\n${s.excerpt?.quote ?? ""}`.toLocaleLowerCase().includes(query)));
  const ids = new Set(sources.map(s => s.id));
  const relations = snapshot.relations.filter(r => ids.has(r.source) && ids.has(r.target));
  const allIds = [...new Set(scoped.map(groupOf))].sort();
  const groups = [...new Set(sources.map(groupOf))].sort((a, b) => groupName(snapshot, a).localeCompare(groupName(snapshot, b))).map(id => {
    const members = sources.filter(s => groupOf(s) === id);
    return { id, title: groupName(snapshot, id), sources: members, color: palette[allIds.indexOf(id) % palette.length]!,
      layers: [...new Set(members.map(layerOf))], count: members.length };
  });
  return { sources, relations, groups, scopedCount: scoped.length, chunks: sources.reduce((sum, s) => sum + s.chunkCount, 0) };
}

export type SpacePoint = { x: number; y: number; z: number };
export function perspective(point: SpacePoint, yaw: number, pitch: number, distance = 1100) {
  const x = point.x * Math.cos(yaw) - point.z * Math.sin(yaw);
  const z = point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  const y = point.y * Math.cos(pitch) - z * Math.sin(pitch);
  const depth = point.y * Math.sin(pitch) + z * Math.cos(pitch);
  const scale = distance / Math.max(distance * 0.25, distance + depth);
  return { x: x * scale, y: y * scale, depth, scale };
}
