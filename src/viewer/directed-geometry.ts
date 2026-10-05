import { groupOf, layerOf, type SpacePoint } from "./projection";
import type { ViewerRelation, ViewerSource, ViewerState } from "./types";

export const mediaLayers = ["channel", "video", "description", "transcript"] as const;
export const directedNodeLimit = 400;
const bandX = { channel: -540, video: -210, description: 120, transcript: 470 };
const bandZ = { channel: -40, video: 0, description: -65, transcript: 65 };
const compare = (a: ViewerSource, b: ViewerSource) => groupOf(a).localeCompare(groupOf(b)) ||
  (a.media?.ordinal ?? 0) - (b.media?.ordinal ?? 0) || a.path.localeCompare(b.path) || a.id.localeCompare(b.id);
const mediaSource = (source: ViewerSource) => mediaLayers.includes(layerOf(source) as typeof mediaLayers[number]);

/** Select actual sources, retaining selected endpoints and parents before bounded branch sampling. */
export function directedSources(sources: ViewerSource[], relations: ViewerRelation[], state: Pick<ViewerState, "selectedSourceId" | "selectedRelationId">, limit = directedNodeLimit) {
  const byId = new Map(sources.filter(mediaSource).map(source => [source.id, source])), selected: ViewerSource[] = [], seen = new Set<string>();
  const parents = new Map(relations.filter(relation => relation.kind === "contains").map(relation => [relation.target, relation.source]));
  const add = (id?: string | null) => {
    const chain = new Set<string>();
    while (id && !chain.has(id)) {
      chain.add(id); const source = byId.get(id); if (!source) break;
      if (!seen.has(id) && selected.length < limit) { selected.push(source); seen.add(id); }
      id = source.media?.parentId ?? parents.get(id);
    }
  };
  add(state.selectedSourceId);
  const relation = relations.find(relation => relation.id === state.selectedRelationId);
  if (relation) { add(relation.source); add(relation.target); }
  for (const source of [...byId.values()].filter(source => source.layer === "channel" || source.layer === "video").sort(compare)) add(source.id);
  const buckets = new Map<string, ViewerSource[]>();
  for (const source of [...byId.values()].filter(source => !seen.has(source.id)).sort(compare)) {
    const key = `${source.media?.parentId ?? source.media?.videoId ?? groupOf(source)}:${layerOf(source)}`;
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(source);
  }
  const branches = [...buckets.values()];
  for (let ordinal = 0; selected.length < limit && branches.some(branch => ordinal < branch.length); ordinal++) {
    for (const branch of branches) { if (selected.length >= limit) break; if (branch[ordinal]) add(branch[ordinal]!.id); }
  }
  return selected;
}

/** Four role bands, with descriptions and transcripts attached independently to the same video. */
export function directedLayout(sources: ViewerSource[]) {
  const ordered = sources.filter(mediaSource).sort(compare), videos = ordered.filter(source => source.layer === "video");
  const positions = new Map<string, SpacePoint>(), rowGap = 106;
  videos.forEach((video, index) => positions.set(video.id, { x: bandX.video, y: (index - (videos.length - 1) / 2) * rowGap, z: bandZ.video }));
  for (const channel of ordered.filter(source => source.layer === "channel")) {
    const children = videos.filter(video => groupOf(video) === groupOf(channel));
    const y = children.length ? children.reduce((sum, child) => sum + positions.get(child.id)!.y, 0) / children.length : 0;
    positions.set(channel.id, { x: bandX.channel, y, z: bandZ.channel });
  }
  for (const layer of ["description", "transcript"] as const) {
    const buckets = new Map<string, ViewerSource[]>();
    for (const source of ordered.filter(source => source.layer === layer)) {
      const video = videos.find(video => video.id === source.media?.parentId || video.media?.videoId && video.media.videoId === source.media?.videoId);
      const key = video?.id ?? "unassigned";
      if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(source);
    }
    for (const [videoId, siblings] of buckets) {
      const center = (positions.get(videoId)?.y ?? 0) + (layer === "description" ? -20 : 20), rows = Math.max(1, Math.min(7, Math.ceil(Math.sqrt(siblings.length))));
      const columns = Math.ceil(siblings.length / rows), gap = Math.min(32, 200 / Math.max(1, columns - 1));
      siblings.forEach((source, index) => positions.set(source.id, { x: bandX[layer] + (Math.floor(index / rows) - (columns - 1) / 2) * gap,
        y: center + (index % rows - (rows - 1) / 2) * 32, z: bandZ[layer] + (index % 3 - 1) * 8 }));
    }
  }
  const top = -Math.max(1, videos.length) * rowGap / 2 - 100;
  return { positions, bands: mediaLayers.map(layer => ({ layer, point: { x: bandX[layer], y: top, z: bandZ[layer] }, count: ordered.filter(source => source.layer === layer).length })) };
}

export function directedEdgePath(from: { x: number; y: number }, to: { x: number; y: number }, contains: boolean, gap = 12) {
  const endX = contains ? to.x - gap : to.x, startX = contains ? from.x + gap : from.x, middle = (startX + endX) / 2;
  return `M ${startX} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${endX} ${to.y}`;
}
