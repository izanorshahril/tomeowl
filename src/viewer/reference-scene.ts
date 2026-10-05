import { referenceLayout, referencePalette } from "./reference-geometry";
import { groupName, layerOf, projectView, sourceName, type SpacePoint } from "./projection";
import { compactMapLabel } from "./state";
import { motionPoint } from "./motion";
import type { Snapshot, SourceLayer, ViewerState } from "./types";

const ns = "http://www.w3.org/2000/svg";
const nodeLimit = 400;
function shape(tag: string, attributes: Record<string, string | number> = {}, text?: string) {
  const element = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
type Projection = (point: SpacePoint) => { x: number; y: number; depth: number; scale: number };
type Actions = { source: (id: string) => void; relation: (id: string) => void; layer: (id: SourceLayer) => void };

// A visual scene over the existing source projection. Role frames never create relations.
export function drawReferenceScene(snapshot: Snapshot, state: ViewerState, parent: SVGElement, project: Projection, actions: Actions, elapsed = 0) {
  const view = projectView(snapshot, state);
  const placement = projectView(snapshot, { ...state, layer: "all", query: "" }).sources;
  const degrees = new Map<string, number>();
  for (const relation of snapshot.relations) {
    degrees.set(relation.source, (degrees.get(relation.source) ?? 0) + 1);
    degrees.set(relation.target, (degrees.get(relation.target) ?? 0) + 1);
  }
  const form = state.mode === "orbital" ? "orbital" : "constellation";
  const layout = referenceLayout(placement, form, { literature: state.corpus === "literature", degrees });
  const anchors = new Map(layout.anchors.map(anchor => [anchor.layer, anchor.point]));
  const shown = [...view.sources].sort((a, b) => Number(b.id === state.selectedSourceId) - Number(a.id === state.selectedSourceId) || a.path.localeCompare(b.path) || a.id.localeCompare(b.id)).slice(0, nodeLimit);
  const nodes = shown.map(source => {
    const point = layout.positions.get(source.id)!;
    return { source, point, screen: project(motionPoint(point, anchors.get(layerOf(source))!, layerOf(source), form, elapsed)), element: null as SVGElement | null, bloom: null as SVGElement | null };
  });
  const positions = new Map(nodes.map(node => [node.source.id, node.screen]));
  const paths: Array<{ element: SVGElement; points: SpacePoint[]; layer?: SourceLayer }> = [];
  const edges: Array<{ element: SVGElement; from: string; to: string }> = [];
  const labels: Array<{ element: SVGElement; point: SpacePoint }> = [];
  const guides = shape("g", { class: "reference-guides", "aria-hidden": "true" });
  const core = project(layout.core);
  const bounds = nodes.map(node => node.screen);
  const visibleLayers = new Set(shown.map(source => layerOf(source)));

  // One glyph-only bloom surface keeps labels, evidence paths and hit targets crisp.
  const defs=shape("defs"), filter=shape("filter",{id:"tomeowl-source-bloom",filterUnits:"userSpaceOnUse","color-interpolation-filters":"sRGB"});
  const blur=shape("feGaussianBlur",{stdDeviation:2.4,result:"light"});
  const merge=shape("feMerge");merge.append(shape("feMergeNode",{in:"light"}),shape("feMergeNode",{in:"light"}));filter.append(blur,merge);defs.append(filter);
  function auraGradient(id:string,color:string){
    const gradient=shape("radialGradient",{id});
    gradient.append(shape("stop",{offset:0,"stop-color":color,"stop-opacity":.22}),shape("stop",{offset:"45%","stop-color":color,"stop-opacity":.07}),shape("stop",{offset:"100%","stop-color":color,"stop-opacity":0}));defs.append(gradient);
  }
  const illumination=shape("g",{class:"reference-illumination","aria-hidden":"true"});
  const auras:Array<{element:SVGElement;point:SpacePoint;radius:number}>=[];
  function aura(point:SpacePoint,radius:number,gradient:string){
    const screen=project(point),element=shape("circle",{cx:screen.x,cy:screen.y,r:radius*screen.scale,fill:`url(#${gradient})`});
    illumination.append(element);auras.push({element,point,radius});
  }
  auraGradient("tomeowl-hub-light",referencePalette.skill);
  if(form==="orbital"){
    auraGradient("tomeowl-band-light",referencePalette.document);aura(layout.core,320,"tomeowl-band-light");
  }else for(const anchor of layout.anchors){
    if(!visibleLayers.has(anchor.layer)||anchor.layer==="project")continue;
    const id=`tomeowl-aura-${anchor.layer}`;auraGradient(id,anchor.color);aura(anchor.point,anchor.radius+50,id);
  }
  aura(layout.core,140,"tomeowl-hub-light");
  parent.append(defs,illumination);

  function pathFor(points: SpacePoint[], layer?: SourceLayer) {
    const projected = points.map(point => project(layer ? motionPoint(point, layout.core, layer, form, elapsed) : point));
    bounds.push(...projected);
    return projected.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  }
  function guide(points: SpacePoint[], attributes: Record<string, string | number>, layer?: SourceLayer) {
    const element = shape("path", { ...attributes, d: pathFor(points, layer) });
    paths.push({ element, points, layer });
    return element;
  }
  function circle(center: SpacePoint, radius: number, plane: "xy" | "xz" | "yz" = "xy") {
    return Array.from({ length: 81 }, (_, i) => {
      const angle = i / 80 * Math.PI * 2, a = Math.cos(angle) * radius, b = Math.sin(angle) * radius;
      return { x: center.x + (plane === "yz" ? 0 : a), y: center.y + (plane === "xz" ? 0 : plane === "yz" ? a : b), z: center.z + (plane === "xy" ? 0 : b) };
    });
  }

  if (form === "orbital") {
    for (const ring of layout.rings) {
      if (!visibleLayers.has(ring.layer)) continue;
      const depth=layout.anchors.find(anchor=>anchor.layer===ring.layer)?.point.z??0;
      const arc=(radius:number)=>Array.from({length:81},(_,i)=>{
        const angle=ring.startAngle+(ring.endAngle-ring.startAngle)*i/80;
        return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,z:depth};
      });
      guides.append(guide(arc(ring.radius), { class: "role-orbit", style: `--role-color:${ring.color}` }, ring.layer));
      // Multi-track arcs expose the concentric organization used by the reference.
      for (const radius of [ring.innerRadius, ring.outerRadius]) {
        guides.append(guide(arc(radius), { class: "role-track", style: `--role-color:${ring.color}` }, ring.layer));
      }
    }
  } else {
    for (const anchor of layout.anchors) {
      if (!visibleLayers.has(anchor.layer) || anchor.layer === "project") continue;
      guides.append(guide([layout.core, anchor.point], { class: "role-spoke" }));
      guides.append(guide(circle(anchor.point, anchor.radius + 14), { class: "role-cloud", style: `--role-color:${anchor.color}` }));
      if (state.dimension === "3d") for (const plane of ["xz", "yz"] as const) {
        guides.append(guide(circle(anchor.point, anchor.radius + 14, plane), { class: "role-cloud wire-depth", style: `--role-color:${anchor.color}` }));
      }
    }
  }
  parent.append(guides);

  for (const relation of view.relations) {
    const from = positions.get(relation.source), to = positions.get(relation.target);
    if (!from || !to) continue;
    const active = relation.id === state.selectedRelationId || relation.source === state.selectedSourceId || relation.target === state.selectedSourceId;
    const edge = shape("path", { d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, class: `edge reference-edge ${relation.kind === "contains" ? "membership" : "recorded"}${active ? " highlighted" : ""}`, "data-relation-id": relation.id });
    edge.append(shape("title", {}, `${relation.kind}: ${relation.evidence.length} citations`));
    edge.addEventListener("click", () => actions.relation(relation.id));
    edges.push({ element: edge, from: relation.source, to: relation.target });
    parent.append(edge);
  }

  const bloom=shape("g",{class:"reference-bloom",filter:"url(#tomeowl-source-bloom)","aria-hidden":"true"});parent.append(bloom);
  const hub = shape("g", { class: "reference-hub", transform: `translate(${core.x} ${core.y})`, "aria-label": "Scope anchor, visual organization" });
  hub.append(shape("circle", { r: 24, class: "hub-ring" }), shape("path", { d: "M-8-8h6v6h-6zM2-8h6v6H2zM-8 2h6v6h-6zM2 2h6v6H2z", class: "hub-symbol" }));
  const scopeTitle = state.groupId ? groupName(snapshot, state.groupId) : state.corpus === "literature" ? "Research library" : snapshot.sample?.workspaceRoot ?? "Workspace";
  hub.append(shape("title", {}, `${scopeTitle} - organizational anchor, not a source`));
  hub.append(shape("text", { y: 44, "text-anchor": "middle", class: "hub-label" }, compactMapLabel(scopeTitle, 23)));
  parent.append(hub);
  const particles = shape("g", { class: "reference-particles" });
  parent.append(particles);

  for (const node of nodes.sort((a, b) => b.screen.depth - a.screen.depth)) {
    const source = node.source, layer = layerOf(source), selected = source.id === state.selectedSourceId;
    const color = referencePalette[layer];
    const radius = layer === "app" || layer === "skill" ? 8 : Math.max(3.5, Math.min(8, 3 + Math.log2(1 + source.chunkCount + (degrees.get(source.id) ?? 0)) * .85));
    const group = shape("g", { class: `source-node reference-node role-${layer}${selected ? " selected" : ""}`, transform: `translate(${node.screen.x} ${node.screen.y})`, role: "button", tabindex: 0,
      "aria-label": `Inspect ${sourceName(source)}`, "aria-pressed": String(selected), "data-source-id": source.id, style: `--node-color:${color}` });
    node.element = group;
    group.append(shape("title", {}, `${sourceName(source)}\n${source.path}`));
    group.append(shape("circle", { r: radius + 5, class: "hit-target" }));
    if (layer === "app") group.append(shape("polygon", { points: "0,-10 8.7,-5 8.7,5 0,10 -8.7,5 -8.7,-5", class: "reference-glyph app-hex" }));
    else if (layer === "skill") group.append(shape("path", { d: "M0-10 7 0 0 10-7 0Z", class: "reference-glyph skill-diamond" }));
    else group.append(shape("circle", { r: radius, class: "reference-glyph" }));
    const light=shape("g",{class:"node-bloom","data-focus-source":source.id,transform:`translate(${node.screen.x} ${node.screen.y})`,style:`--node-color:${color}`});
    const glyph=group.querySelector(".reference-glyph")!.cloneNode(true) as SVGElement;glyph.setAttribute("class","bloom-glyph");light.append(glyph);bloom.append(light);node.bloom=light;
    const label = shape("text", { x: radius + 8, y: 4, class: "source-label reference-source-label" }, compactMapLabel(sourceName(source), 32));
    group.append(label);
    const activate = (event?: Event) => {
      let id = source.id;
      // Expanded hit areas can overlap a neighboring glyph in dense role bands.
      // Resolve that pointer hit against actual projected centers, retaining keyboard identity.
      if (event instanceof MouseEvent && (event.target as Element).classList.contains("hit-target")) {
        const matrix = parent.getScreenCTM();
        if (matrix) {
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
          let nearest = Infinity;
          for (const candidate of nodes) {
            const distance = (candidate.screen.x-point.x)**2 + (candidate.screen.y-point.y)**2;
            if (distance <= nearest) { nearest=distance;id=candidate.source.id; }
          }
        }
      }
      actions.source(id);
    };
    group.addEventListener("click", activate);
    group.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    particles.append(group);
  }

  for (const anchor of layout.anchors) {
    const count = shown.filter(source => layerOf(source) === anchor.layer).length;
    if (!count) continue;
    let point = form === "constellation" ? anchor.layer==="project"?{x:-145,y:-95,z:0}:{ ...anchor.point, y: anchor.point.y + anchor.radius + 28 } : anchor.point;
    if(form==="constellation"&&anchor.layer==="project"){
      parent.append(guide([{...layout.core,x:layout.core.x-28,y:layout.core.y-20}, point], {class:"role-spoke role-leader","aria-hidden":"true"}));
    }
    if(form==="orbital"&&(anchor.layer==="project"||anchor.layer==="guidance"||anchor.layer==="skill")){
      const angle=anchor.layer==="project"?-Math.PI*.78:anchor.layer==="guidance"?-Math.PI*.27:Math.PI*.2;
      const radius=Math.max(...layout.rings.map(ring=>ring.outerRadius))+72;
      point={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,z:anchor.point.z};
      const ring=layout.rings.find(ring=>ring.layer===anchor.layer)!;
      parent.append(guide([{x:Math.cos(angle)*ring.radius,y:Math.sin(angle)*ring.radius,z:anchor.point.z}, point], {class:"role-spoke role-leader","aria-hidden":"true"}));
    }
    const screen = project(point); bounds.push(screen);
    const button = shape("g", { class: "role-anchor", transform: `translate(${screen.x} ${screen.y})`, role: "button", tabindex: 0,
      "aria-label": `Filter ${anchor.title}, ${count} sources`, "data-role-anchor": anchor.layer, "aria-pressed": String(state.layer === anchor.layer), style: `--role-color:${anchor.color}` });
    button.append(shape("rect", { x: -80, y: -15, width: 160, height: 44, rx: 6, class: "role-label-back" }));
    button.append(shape("text", { "text-anchor": "middle", class: "role-label" }, anchor.title.toLocaleUpperCase()));
    button.append(shape("text", { y: 20, "text-anchor": "middle", class: "role-count" }, `${count} sources`));
    const activate = () => actions.layer(anchor.layer);
    button.addEventListener("click", activate);
    button.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    labels.push({ element: button, point });
    parent.append(button);
  }

  // Labels reveal at inspection scale, keeping the full overview's particle silhouette.
  function refreshLabels(width: number) {
    const zoom = state.zoom;
    blur.setAttribute("stdDeviation",String(2.4/zoom));
    // Limit the bloom surface to the visible viewport, even at inspection zoom.
    const height=parent.ownerSVGElement?.viewBox.baseVal.height??width;
    filter.setAttribute("x",String((-state.pan.x-12)/zoom));filter.setAttribute("y",String((-state.pan.y-12)/zoom));
    filter.setAttribute("width",String((width+24)/zoom));filter.setAttribute("height",String((height+24)/zoom));
    parent.querySelectorAll<SVGElement>(".role-label,.hub-label").forEach(label => { label.style.fontSize = `${11 / zoom}px`; });
    parent.querySelectorAll<SVGElement>(".role-count").forEach(label => { label.style.fontSize = `${10 / zoom}px`; label.setAttribute("y", String(17 / zoom)); });
    parent.querySelectorAll<SVGElement>(".role-label-back").forEach(back => { const width=Math.max(72,(back.parentElement?.querySelector(".role-label")?.textContent?.length??10)*7+12);back.setAttribute("x", String(-width/2 / zoom)); back.setAttribute("y", String(-15 / zoom)); back.setAttribute("width", String(width / zoom)); back.setAttribute("height", String(42 / zoom)); });
    parent.querySelectorAll<SVGElement>(".reference-source-label").forEach(label => {
      const node = nodes.find(node => node.source.id === label.parentElement?.getAttribute("data-source-id"));
      if (!node) return;
      label.style.fontSize = `${12 / zoom}px`; label.setAttribute("x", String(13 / zoom)); label.setAttribute("y", String(4 / zoom));
      const available = Math.max(70, width - (state.pan.x + node.screen.x * zoom) - 30);
      label.textContent = compactMapLabel(sourceName(node.source), Math.max(10, Math.min(32, Math.floor(available / 6.3))));
      label.classList.toggle("label-hidden", !(node.source.id === state.selectedSourceId || state.labels && (nodes.length <= 12 || zoom >= 1.35)));
    });
  }
  // Ambient ticks preserve DOM identity, focus, handlers and original source membership.
  function updateMotion(nextElapsed: number) {
    elapsed = nextElapsed;
    for (const node of nodes) {
      node.screen = project(motionPoint(node.point, anchors.get(layerOf(node.source))!, layerOf(node.source), form, elapsed));
      node.element!.setAttribute("transform", `translate(${node.screen.x} ${node.screen.y})`);
      node.bloom!.setAttribute("transform", `translate(${node.screen.x} ${node.screen.y})`);
      positions.set(node.source.id, node.screen);
    }
    if (state.dimension === "3d") {
      const ordered = [...nodes].sort((a, b) => b.screen.depth - a.screen.depth);
      if (ordered.some((node, index) => node !== nodes[index])) {
        nodes.splice(0, nodes.length, ...ordered);
        particles.append(...nodes.map(node => node.element!));
      }
    }
    for (const path of paths) {
      const points = path.points.map(point => project(path.layer ? motionPoint(point, layout.core, path.layer, form, elapsed) : point));
      path.element.setAttribute("d", points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "));
    }
    for (const edge of edges) {
      const from = positions.get(edge.from)!, to = positions.get(edge.to)!;
      edge.element.setAttribute("d", `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
    }
    for (const label of labels) {
      const point = project(label.point);
      label.element.setAttribute("transform", `translate(${point.x} ${point.y})`);
    }
    const center = project(layout.core);
    hub.setAttribute("transform", `translate(${center.x} ${center.y})`);
    for(const aura of auras){const screen=project(aura.point);aura.element.setAttribute("cx",String(screen.x));aura.element.setAttribute("cy",String(screen.y));aura.element.setAttribute("r",String(aura.radius*screen.scale));}
  }
  return { bounds, shownCount: shown.length, totalCount: view.sources.length, refreshLabels, updateMotion };
}
