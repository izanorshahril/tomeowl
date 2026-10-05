import { layerOf, layerOrder, type SpacePoint } from "./projection";
import type { SourceLayer, ViewerSource } from "./types";

export const layerZ: Record<SourceLayer, number> = {
  project: 0, guidance: -100, skill: 100, app: 200, document: 0, research: -90, citation: 160,
  channel: -90, video: 0, description: -65, transcript: 65,
};

export function sourceLayout(
  sources: ViewerSource[],
  mode: "cluster" | "rings",
  { literature = false, columnGap = 320, degrees = new Map<string, number>() }: {
    literature?: boolean; columnGap?: number; degrees?: ReadonlyMap<string, number>;
  } = {},
): { positions: Map<string, SpacePoint>; layers: SourceLayer[]; worldWidth: number; worldHeight: number; columnGap: number } {
  const grouped = new Map<SourceLayer, ViewerSource[]>();
  const globalIndices = new Map<string, number>();
  sources.forEach((source, index) => {
    const layer = layerOf(source);
    if (!grouped.has(layer)) grouped.set(layer, []);
    grouped.get(layer)!.push(source);
    globalIndices.set(source.id, index);
  });
  const layers = layerOrder.filter(layer => grouped.has(layer));
  const positions = new Map<string, SpacePoint>();
  let longest = 0;
  layers.forEach((layer, column) => {
    const siblings = grouped.get(layer)!;
    siblings.sort((a, b) => (layer === "citation" ? (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0) : 0) || a.path.localeCompare(b.path));
    const paged = literature && layer === "citation";
    const rows = Math.min(paged ? 12 : Infinity, siblings.length);
    longest = Math.max(longest, rows);
    siblings.forEach((source, index) => {
      const angle = globalIndices.get(source.id)! * Math.PI * 2 / sources.length - Math.PI / 2;
      const radius = layer === "citation" ? 365 : 240;
      positions.set(source.id, mode === "rings" ?
        { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: layerZ[layer] } :
        { x: (column - (layers.length - 1) / 2) * columnGap + (paged ? Math.floor(index / 12) * columnGap : 0),
          y: ((paged ? index % 12 : index) - (rows - 1) / 2) * 72, z: layerZ[layer] });
    });
  });
  return { positions, layers, worldWidth: mode === "rings" ? 1000 : Math.max(620, layers.length * columnGap),
    worldHeight: mode === "rings" ? 900 : Math.max(380, longest * 72), columnGap };
}
