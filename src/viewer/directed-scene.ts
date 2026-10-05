import { directedEdgePath, directedLayout, directedSources } from "./directed-geometry";
import { atlasMotionPoint } from "./motion";
import { layerNames, layerOf, projectView, sourceName, type SpacePoint } from "./projection";
import { referencePalette } from "./reference-geometry";
import { compactMapLabel } from "./state";
import type { Snapshot, SourceLayer, ViewerState } from "./types";

const ns = "http://www.w3.org/2000/svg";
const shape = (tag: string, attributes: Record<string, string | number> = {}, text?: string) => {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
};
type Projection = (point: SpacePoint) => { x: number; y: number; depth: number; scale: number };
type Actions = { source: (id: string) => void; relation: (id: string) => void; layer: (id: SourceLayer) => void };

export function drawDirectedScene(snapshot: Snapshot, state: ViewerState, parent: SVGElement, project: Projection, actions: Actions, elapsed = 0) {
  const view = projectView(snapshot, state), placement = projectView(snapshot, { ...state, query: "", layer: "all" }).sources;
  const layout = directedLayout(placement), shown = directedSources(view.sources, view.relations, state);
  const nodes = shown.map((source, index) => ({ source, index, point: layout.positions.get(source.id)!, screen: project(layout.positions.get(source.id)!), element: null as SVGElement | null, bloom: null as SVGElement | null }));
  const positions = new Map(nodes.map(node => [node.source.id, node.screen]));
  const defs = shape("defs"), arrow = shape("marker", { id: "tomeowl-directed-arrow", viewBox: "0 -5 10 10", refX: 8, refY: 0, markerWidth: 10, markerHeight: 10, markerUnits: "userSpaceOnUse", orient: "auto" });
  arrow.append(shape("path", { d: "M0-4 8 0 0 4Z", fill: "#d9b781" })); defs.append(arrow);
  const filter = shape("filter", { id: "tomeowl-directed-bloom", filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" }), blur = shape("feGaussianBlur", { stdDeviation: 2.4 });
  filter.append(blur); defs.append(filter); parent.append(defs);
  const guides = shape("g", { class: "reference-guides directed-guides", "aria-hidden": "true" });
  const bands = layout.bands.filter(band => view.sources.some(source => layerOf(source) === band.layer)).map(band => {
    const screen = project(band.point), group = shape("g", { class: "directed-band", transform: `translate(${screen.x} ${screen.y})`, style: `--role-color:${referencePalette[band.layer]}` });
    group.append(shape("text", { "text-anchor": "middle", class: "directed-role-label" }, layerNames[band.layer]),
      shape("text", { y: 20, "text-anchor": "middle", class: "directed-role-count" }, `${view.sources.filter(source => layerOf(source) === band.layer).length} sources`));
    guides.append(group); return { ...band, element: group };
  }); parent.append(guides);
  const bounds = [...nodes.map(node => node.screen), ...bands.map(band => project(band.point))];
  const links = shape("g", { class: "directed-links" }); parent.append(links);
  const edges: Array<{ element: SVGElement; from: string; to: string; contains: boolean; label: SVGElement | null }> = [];
  for (const relation of view.relations) {
    const from = positions.get(relation.source), to = positions.get(relation.target); if (!from || !to) continue;
    const contains = relation.kind === "contains", lexical = relation.kind === "similar" && relation.basis === "lexical";
    const active = relation.id === state.selectedRelationId || relation.source === state.selectedSourceId || relation.target === state.selectedSourceId;
    const label = contains ? "Contains" : lexical ? "Text overlap" : "Recorded link";
    const source = view.sources.find(source => source.id === relation.source)!, target = view.sources.find(source => source.id === relation.target)!;
    const edge = shape("path", { d: directedEdgePath(from, to, contains), class: `edge directed-edge${contains ? " directed-contains" : lexical ? " directed-lexical" : ""}${active ? " highlighted" : ""}`,
      "data-relation-id": relation.id, role: "button", tabindex: 0, "aria-label": `${label}: ${sourceName(source)} to ${sourceName(target)}; ${relation.evidence.length} evidence citations` });
    if (contains) edge.setAttribute("marker-end", "url(#tomeowl-directed-arrow)");
    edge.append(shape("title", {}, `${label}${lexical ? " - lexical terms, not embedding similarity" : ""}: ${relation.evidence.length} evidence citations`));
    const activate = () => actions.relation(relation.id); edge.addEventListener("click", activate);
    edge.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    links.append(edge);
    const text = lexical && active ? shape("text", { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 7, class: "directed-edge-label", "text-anchor": "middle", "aria-hidden": "true" }, "Text overlap") : null;
    if (text) links.append(text); edges.push({ element: edge, from: relation.source, to: relation.target, contains, label: text });
  }
  const bloom = shape("g", { class: "reference-bloom", filter: "url(#tomeowl-directed-bloom)", "aria-hidden": "true" }); parent.append(bloom);
  const particles = shape("g", { class: "directed-particles" }); parent.append(particles);
  for (const node of nodes.sort((a, b) => b.screen.depth - a.screen.depth)) {
    const layer = layerOf(node.source), selected = node.source.id === state.selectedSourceId;
    const group = shape("g", { class: `source-node reference-node directed-node role-${layer}${selected ? " selected" : ""}`, transform: `translate(${node.screen.x} ${node.screen.y})`, role: "button", tabindex: 0,
      "aria-label": `Inspect ${layerNames[layer]}: ${sourceName(node.source)}`, "aria-pressed": String(selected), "data-source-id": node.source.id, style: `--node-color:${referencePalette[layer]}` });
    group.append(shape("title", {}, `${sourceName(node.source)}\n${node.source.path}`), shape("circle", { r: 13, class: "hit-target" }));
    const glyph = layer === "channel" ? shape("rect", { x: -11, y: -8, width: 22, height: 16, rx: 3, class: "reference-glyph" }) :
      layer === "video" ? shape("path", { d: "M-7-9 10 0-7 9Z", class: "reference-glyph" }) : shape("circle", { r: selected ? 6 : 3.8, class: "reference-glyph" });
    group.append(glyph, shape("text", { x: 17, y: 4, class: "source-label directed-source-label" }, compactMapLabel(sourceName(node.source), 32)));
    const light = shape("g", { class: "node-bloom", "data-focus-source": node.source.id, transform: `translate(${node.screen.x} ${node.screen.y})`, style: `--node-color:${referencePalette[layer]}` });
    const copy = glyph.cloneNode(true) as SVGElement; copy.setAttribute("class", "bloom-glyph"); light.append(copy); bloom.append(light);
    node.element = group; node.bloom = light;
    const activate = () => actions.source(node.source.id); group.addEventListener("click", activate);
    group.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    particles.append(group);
  }
  function refreshLabels(width: number) {
    const zoom = state.zoom, height = parent.ownerSVGElement?.viewBox.baseVal.height ?? width;
    filter.setAttribute("x", String((-state.pan.x - 12) / zoom)); filter.setAttribute("y", String((-state.pan.y - 12) / zoom));
    filter.setAttribute("width", String((width + 24) / zoom)); filter.setAttribute("height", String((height + 24) / zoom)); blur.setAttribute("stdDeviation", String(2.4 / zoom));
    parent.querySelectorAll<SVGElement>(".directed-role-label,.directed-edge-label").forEach(label => label.style.fontSize = `${12 / zoom}px`);
    parent.querySelectorAll<SVGElement>(".directed-role-count").forEach(label => { label.style.fontSize = `${10 / zoom}px`; label.setAttribute("y", String(18 / zoom)); });
    for (const node of nodes) {
      const label = node.element!.querySelector<SVGElement>(".source-label")!, layer = layerOf(node.source);
      node.element!.querySelector('.hit-target')!.setAttribute('r',String(9/zoom));
      node.element!.querySelector('.reference-glyph')!.setAttribute('transform',`scale(${1/zoom})`);
      node.bloom!.querySelector('.bloom-glyph')!.setAttribute('transform',`scale(${1/zoom})`);
      label.style.fontSize = `${12 / zoom}px`; label.setAttribute("x", String(15 / zoom)); label.setAttribute("y", String(4 / zoom));
      const nextBand = bands.filter(band => band.point.x > node.point.x).map(band => project(band.point).x - node.screen.x);
      const available = Math.max(40, Math.min(width - state.pan.x - node.screen.x * zoom - 28, ...nextBand.map(distance=>distance*zoom-30)));
      label.textContent = compactMapLabel(sourceName(node.source), Math.max(10, Math.min(layer === "channel" || layer === "video" ? 27 : 36, Math.floor(available / 6.3))));
      if(layer==="channel"||layer==="video"){label.setAttribute('x',String(0));label.setAttribute('y',String(-16/zoom));}
      label.classList.toggle("label-hidden", !(node.source.id === state.selectedSourceId || state.labels && (layer === "channel" || layer === "video" || zoom >= 1.15 || nodes.length <= 24)));
    }
    for(const edge of edges)edge.element.setAttribute('d',directedEdgePath(positions.get(edge.from)!,positions.get(edge.to)!,edge.contains,13/zoom));
  }
  function updateMotion(nextElapsed: number) {
    for (const node of nodes) {
      node.screen = project(atlasMotionPoint(node.point, nextElapsed, node.index * 1.7)); positions.set(node.source.id, node.screen);
      const transform = `translate(${node.screen.x} ${node.screen.y})`; node.element!.setAttribute("transform", transform); node.bloom!.setAttribute("transform", transform);
    }
    for (const edge of edges) {
      const from = positions.get(edge.from)!, to = positions.get(edge.to)!; edge.element.setAttribute("d", directedEdgePath(from, to, edge.contains,13/state.zoom));
      if (edge.label) { edge.label.setAttribute("x", String((from.x + to.x) / 2)); edge.label.setAttribute("y", String((from.y + to.y) / 2 - 7)); }
    }
    for (const band of bands) { const screen = project(band.point); band.element.setAttribute("transform", `translate(${screen.x} ${screen.y})`); }
    if (state.dimension === "3d") particles.append(...[...nodes].sort((a, b) => b.screen.depth - a.screen.depth).map(node => node.element!));
  }
  if (elapsed) updateMotion(elapsed);
  return { bounds, shownCount: shown.length, totalCount: view.sources.length, linkCount: edges.length, totalLinks: view.relations.length, refreshLabels, updateMotion };
}
