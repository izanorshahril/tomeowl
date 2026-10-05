import { referenceLayout, referencePalette } from "../../../src/viewer/reference-geometry";
import { motionPoint } from "../../../src/viewer/motion";
import { layerOf, type SpacePoint } from "../../../src/viewer/projection";
import type { Snapshot, SourceLayer } from "../../../src/viewer/types";

export const renderers = ["tomeowl-svg", "three-webgl", "cytoscape-canvas"] as const;
export type RendererName = typeof renderers[number];
export const layers: SourceLayer[] = ["guidance", "skill", "app", "document", "research", "citation"];

export function fixture(count: number): Snapshot {
  if (![100, 400, 1000].includes(count)) throw new Error("Counts are bounded to 100, 400 or 1000");
  const sources = Array.from({length: count}, (_, i) => ({
    id: `node-${String(i).padStart(4, "0")}`, title: `Source ${i}`, path: `benchmark/source-${String(i).padStart(4, "0")}.md`,
    collection: "benchmark", kind: "document" as const, revision: "fixture-v1", chunkCount: 1,
    corpus: "literature" as const, layer: layers[i % layers.length],
  }));
  // Fixed graph degree, with long-range links. These synthetic relations are renderer fixtures.
  const relations = sources.flatMap((source, i) => [1, 7].map(offset => ({
    id: `edge-${i}-${offset}`, source: source.id, target: sources[(i + offset) % count]!.id,
    kind: "references" as const, basis: "imported" as const, evidence: [],
  })));
  return {schemaVersion: 1, generatedAt: "2026-10-04T00:00:00.000Z", stats: {sources: count, chunks: count, relations: relations.length}, sources, relations};
}

export function workload(snapshot: Snapshot, cap: number) {
  const shown = [...snapshot.sources].sort((a,b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id)).slice(0, cap);
  const ids = new Set(shown.map(source => source.id));
  const degrees = new Map<string, number>();
  snapshot.relations.forEach(edge => {degrees.set(edge.source,(degrees.get(edge.source)??0)+1);degrees.set(edge.target,(degrees.get(edge.target)??0)+1);});
  const layout = referenceLayout(snapshot.sources, "constellation", {literature: true, degrees});
  const anchors = new Map(layout.anchors.map(anchor => [anchor.layer,anchor.point]));
  const nodes = shown.map(source => ({id: source.id, layer: layerOf(source), point: layout.positions.get(source.id)!, color: referencePalette[layerOf(source)]}));
  const edges = snapshot.relations.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  return {nodes, edges, layout, pose(elapsed: number) {
    return nodes.map(node => motionPoint(node.point, anchors.get(node.layer)!, node.layer, "constellation", elapsed));
  }};
}
export type Workload = ReturnType<typeof workload>;
export type Control = {
  update(points: SpacePoint[], elapsed: number): void;
  pan(): void;
  focus(): void;
  camera(): void;
  clearFocus(): void;
  counts(): Record<string, number | string | null>;
  dispose(): void;
};
export function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.max(0, Math.min(sorted.length-1, Math.ceil(sorted.length*fraction)-1))]!;
}
export function summary(values: number[]) {
  return {samples: values.length, p50: percentile(values,.5), p95: percentile(values,.95), max: values.length ? Math.max(...values) : null};
}
