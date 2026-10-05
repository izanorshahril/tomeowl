import { layerOf, layerOrder, type SpacePoint } from "./projection";
import type { SourceLayer, ViewerSource } from "./types";

export type ReferenceMode = "constellation" | "orbital";
export type ReferenceAnchor = {
  id: string; layer: SourceLayer; title: string; point: SpacePoint;
  radius: number; count: number; color: string;
};
export type ReferenceRing = {
  id: string; layer: SourceLayer; title: string; radius: number; color: string;
  innerRadius: number; outerRadius: number; startAngle: number; endAngle: number;
};
export type ReferenceLayout = {
  positions: Map<string, SpacePoint>; anchors: ReferenceAnchor[];
  rings: ReferenceRing[]; core: SpacePoint; extent: number;
};

export const referencePalette: Record<SourceLayer, string> = {
  project: "#d9b781", guidance: "#eaaa70", skill: "#f38b4c", app: "#79b9ed",
  document: "#b4a0ed", research: "#c185e8", citation: "#77cbd3",
  channel: "#eaaa70", video: "#79b9ed", description: "#d9b781", transcript: "#9ec9ba",
};

const titles: Record<SourceLayer, string> = {
  project: "Projects", guidance: "Main docs", skill: "Skills", app: "App manifests",
  document: "Documents", research: "Research", citation: "Citations",
  channel: "Channels", video: "Videos", description: "Descriptions", transcript: "Transcripts",
};
const cloudCenters: Record<SourceLayer, SpacePoint> = {
  project: { x: 0, y: 0, z: 0 }, guidance: { x: 0, y: 0, z: -28 },
  skill: { x: 320, y: 80, z: 78 }, app: { x: 290, y: -260, z: -60 },
  document: { x: -320, y: 110, z: 35 }, research: { x: -150, y: -270, z: -85 },
  citation: { x: 90, y: 285, z: 60 },
  channel: { x: -320, y: -130, z: -90 }, video: { x: 0, y: -210, z: 0 },
  description: { x: -190, y: 190, z: -65 }, transcript: { x: 210, y: 170, z: 65 },
};
const bandRadius: Record<SourceLayer, number> = {
  project: 48, guidance: 78, skill: 140, document: 244, research: 244, citation: 244, app: 400,
  channel: 70, video: 140, description: 260, transcript: 390,
};
const bandDepth: Record<SourceLayer, number> = {
  project: 0, guidance: -28, skill: 26, document: -36, research: 38, citation: 74, app: -52,
  channel: -90, video: 0, description: -65, transcript: 65,
};
const tau = Math.PI * 2;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function cloudRadius(layer: SourceLayer, count: number) {
  if (layer === "project") return Math.min(62, 58 + Math.sqrt(count) * 0.4);
  if (layer === "guidance") return Math.min(88, 78 + Math.sqrt(count) * 1.5);
  return Math.min(150, 42 + Math.sqrt(count) * 9);
}

// This seed changes only the visual orientation, never source membership or evidence.
function seed(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967296;
}

function cloudPoint(layer: SourceLayer, index: number, count: number, radius: number, rotation: number) {
  if (layer === "project" || layer === "guidance") {
    if (count === 1 && layer === "project") return { x: 0, y: 0, z: 0 };
    const angle = rotation + index * tau / count;
    const ringRadius = layer === "guidance" ? radius * (0.8 + (index % 3) * 0.06) : radius * 0.8;
    return { x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius,
      z: Math.sin(angle * 2) * (layer === "project" ? 8 : 15) };
  }
  if (count === 1) return { x: 0, y: 0, z: 0 };
  // Fibonacci sphere projects to a filled cloud while retaining genuine volume in 3D.
  const height = 1 - 2 * (index + 0.5) / count;
  const diskRadius = radius * Math.sqrt(1 - height * height);
  const angle = rotation + index * goldenAngle;
  return { x: Math.cos(angle) * diskRadius, y: Math.sin(angle) * diskRadius * 0.9,
    z: height * radius * 0.65 };
}

/**
 * Reference forms arrange actual sources by their recorded role, without adding nodes or links.
 * Pass the complete unfiltered scope so filtering and selection retain source positions.
 */
export function referenceLayout(
  sources: readonly ViewerSource[], mode: ReferenceMode,
  { literature = false, degrees = new Map<string, number>() }: {
    literature?: boolean; degrees?: ReadonlyMap<string, number>;
  } = {},
): ReferenceLayout {
  const grouped = new Map<SourceLayer, ViewerSource[]>();
  for (const source of sources) {
    const layer = layerOf(source);
    if (!grouped.has(layer)) grouped.set(layer, []);
    grouped.get(layer)!.push(source);
  }
  const occupied = layerOrder.filter(layer => grouped.has(layer));
  const positions = new Map<string, SpacePoint>();
  const anchors: ReferenceAnchor[] = [];
  const rings: ReferenceRing[] = [];
  const core = { x: 0, y: 0, z: 0 };
  let extent = 0;
  const knowledge = occupied.filter(layer => layer === "document" || layer === "research" || layer === "citation");
  const weights = knowledge.map(layer => Math.sqrt(grouped.get(layer)!.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const knowledgeSectors = new Map<SourceLayer, { start: number; end: number }>();
  let cursor = -Math.PI * 1.06;
  knowledge.forEach((layer, index) => {
    const span = tau * weights[index]! / totalWeight;
    const gap = Math.min(0.08, span * 0.12);
    knowledgeSectors.set(layer, { start: cursor + gap / 2, end: cursor + span - gap / 2 });
    cursor += span;
  });

  for (const layer of occupied) {
    const siblings = [...grouped.get(layer)!];
    const degree = (id: string) => Number.isFinite(degrees.get(id)) ? degrees.get(id)! : 0;
    siblings.sort((a, b) => (layer === "citation" ? degree(b.id) - degree(a.id) : 0) ||
      compare(a.path, b.path) || compare(a.id, b.id));
    const title = literature && layer === "research" ? "Research notes" :
      literature && layer === "citation" ? "Cited sources" : titles[layer];
    const rotation = seed(layer) * tau;
    const count = siblings.length;

    if (mode === "constellation") {
      const point = { ...cloudCenters[layer] };
      const radius = cloudRadius(layer, count);
      siblings.forEach((source, index) => {
        const local = cloudPoint(layer, index, count, radius, rotation);
        positions.set(source.id, { x: point.x + local.x, y: point.y + local.y, z: point.z + local.z });
      });
      anchors.push({ id: `role-${layer}`, layer, title, point, radius, count, color: referencePalette[layer] });
      extent = Math.max(extent, Math.hypot(point.x, point.y) + radius + 24);
      continue;
    }

    const radius = bandRadius[layer];
    const sector = knowledgeSectors.get(layer) ?? { start: -Math.PI / 2, end: Math.PI * 1.5 };
    const tracks = layer === "app" || layer === "project" ? 1 :
      Math.min(layer === "guidance" ? 2 : 6, Math.max(1, Math.ceil(Math.sqrt(count) / 2)));
    const trackGap = layer === "guidance" ? 10 : layer === "skill" ? 10 : 12;
    const innerRadius = radius - (tracks - 1) * trackGap / 2;
    const outerRadius = radius + (tracks - 1) * trackGap / 2;
    const fullCircle = !knowledgeSectors.has(layer);
    siblings.forEach((source, index) => {
      const track = index % tracks;
      const slot = Math.floor(index / tracks);
      const slots = Math.ceil((count - track) / tracks);
      // Stagger neighboring tracks into the gaps instead of making radial ladders.
      const stagger = (track * goldenAngle / tau) % 1;
      const fraction = fullCircle ? (slot + stagger) / slots :
        (slot + 0.5 + (stagger - 0.5) * 0.7) / slots;
      const angle = sector.start + (sector.end - sector.start) * fraction + (fullCircle ? rotation : 0);
      const sourceRadius = innerRadius + track * trackGap;
      positions.set(source.id, { x: Math.cos(angle) * sourceRadius, y: Math.sin(angle) * sourceRadius,
        z: bandDepth[layer] + Math.sin(angle * 2 + track) * 12 });
    });
    const middle = layer === "project" ? -Math.PI * 0.75 : layer === "guidance" ? -Math.PI / 4 :
      layer === "skill" ? Math.PI / 4 : layer === "app" ? Math.PI / 2 : (sector.start + sector.end) / 2;
    const labelRadius = layer === "project" ? 64 : layer === "guidance" ? 100 :
      outerRadius + (knowledgeSectors.has(layer) ? 45 : layer === "app" ? 36 : 20);
    const point = { x: Math.cos(middle) * labelRadius, y: Math.sin(middle) * labelRadius, z: bandDepth[layer] };
    anchors.push({ id: `role-${layer}`, layer, title, point, radius: outerRadius - innerRadius + 20,
      count, color: referencePalette[layer] });
    rings.push({ id: `ring-${layer}`, layer, title, radius, color: referencePalette[layer],
      innerRadius, outerRadius, startAngle: sector.start, endAngle: sector.end });
    extent = Math.max(extent, outerRadius + 40);
  }

  return { positions, anchors, rings, core, extent };
}
