import { perspective, projectView, sourceName, layerOf, layerNames, type SpacePoint } from "./projection";
import { sourceLayout, layerZ } from "./geometry";
import { compactMapLabel } from "./state";
import { drawReferenceScene } from "./reference-scene";
import { drawDirectedScene } from "./directed-scene";
import { atlasMotionPoint, createMotionClock, motionAllowed } from "./motion";
import { createRelationshipFocus, type RelationshipFocus } from "./relationship-focus";
import type { Snapshot, ViewerState, ViewerSource, SourceLayer } from "./types";

const ns = "http://www.w3.org/2000/svg";
const interactiveTargets = ".source-node,.project-node,.role-anchor,.edge";
function shape(tag: string, attributes: Record<string, string | number> = {}, content?: string) {
  const element = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (content !== undefined) element.textContent = content;
  return element;
}

type GraphActions = { group: (id: string) => void; source: (id: string) => void; relation: (id: string) => void; layer: (id: SourceLayer) => void; cameraChanged: () => void };
export function mountGraph(snapshot: Snapshot, state: ViewerState, root: HTMLElement, actions: GraphActions) {
  const map = root.querySelector<SVGSVGElement>("#graph")!;
  const wrap = root.querySelector<HTMLElement>(".graph-wrap")!;
  let transform = shape("g"), width = 1, height = 1, worldHeight = 1;
  let drag: { x: number; y: number; pan: { x: number; y: number }; yaw: number; pitch: number } | null = null;
  let frame = 0, lastFrame = 0, hoveringTarget = false, settleTimer: ReturnType<typeof setTimeout> | null = null;
  const clock = createMotionClock(), reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let transition: Animation | null = null, lastSceneKey = "";
  let relationshipFocus: RelationshipFocus, lastFocusKey = "";
  let previousOpacities = new Map<string, number>();
  const relationsById = new Map(snapshot.relations.map(relation => [relation.id, relation]));
  let referenceScene: ReturnType<typeof drawReferenceScene> | ReturnType<typeof drawDirectedScene> | null = null;
  let atlasNodes: Array<{ id: string; point: SpacePoint; screen: ReturnType<typeof perspective>; element: SVGElement; index: number }> = [];
  let atlasEdges: Array<{ from: string; to: string; element: SVGElement }> = [];
  let atlasGuides: Array<{ element: SVGElement; points: SpacePoint[] }> = [];
  let showingOverview=false,labelNodes:Array<{id:string;title:string;point:SpacePoint;screen:{x:number;y:number}}>=[];
  const outgoingIds = new Set(snapshot.relations.map(r=>r.source));
  const terminalIds = new Set(snapshot.sources.filter(s => !outgoingIds.has(s.id)).map(s => s.id));
  const degrees = new Map<string,number>();
  snapshot.relations.forEach(r=>{degrees.set(r.source,(degrees.get(r.source)??0)+1);degrees.set(r.target,(degrees.get(r.target)??0)+1);});
  const applyTransform = () => {
    transform.setAttribute("transform", `translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`);
    root.querySelector("#zoom-readout")!.textContent = `${Math.round(state.zoom * 100)}%`;
    refreshLabels();
  };
  function refreshLabels(){
    if(referenceScene){referenceScene.refreshLabels(width);return;}
    if(showingOverview){
      transform.querySelectorAll(".project-name").forEach(n=>{(n as SVGElement).style.fontSize=`${12/state.zoom}px`;n.textContent=compactMapLabel(n.parentElement?.querySelector("title")?.textContent??"Project",Math.max(7,Math.min(14,Math.floor(230*state.zoom/6.3)-1)));});
      transform.querySelectorAll(".project-count").forEach(n=>(n as SVGElement).style.fontSize=`${12/state.zoom}px`);
      transform.querySelectorAll(".project-layers").forEach(n=>(n as SVGElement).style.display=state.zoom<.65?"none":"");
    }else{
      transform.querySelectorAll(".source-label").forEach(n=>{
        (n as SVGElement).style.fontSize=`${12/state.zoom}px`;n.setAttribute("x",String(14/state.zoom));n.setAttribute("y",String(4/state.zoom));
        const node=labelNodes.find(p=>p.id===n.parentElement?.getAttribute("data-source-id"));if(!node)return;
        const next=labelNodes.filter(p=>p.id!==node.id&&Math.abs(p.point.x-node.point.x)>100&&p.screen.x>node.screen.x&&Math.abs((p.screen.y-node.screen.y)*state.zoom)<20);
        const available=Math.min(width-(state.pan.x+node.screen.x*state.zoom)-28,...next.map(p=>(p.screen.x-node.screen.x)*state.zoom-28));
        n.textContent=compactMapLabel(node.title,Math.max(7,Math.min(21,Math.floor(available/6.3))));
      });
      transform.querySelectorAll(".source-glyph").forEach(n=>n.setAttribute("r",String((n.parentElement?.classList.contains("selected")?7:4)/state.zoom)));
      transform.querySelectorAll(".hit-target").forEach(n=>n.setAttribute("r",String(17/state.zoom)));
      transform.querySelectorAll(".layer-title").forEach(n=>{(n as SVGElement).style.fontSize=`${11/state.zoom}px`;n.setAttribute("x",String(Number(n.getAttribute("data-anchor-x"))+14/state.zoom));});
    }
  }
  function draw() {
    previousOpacities = new Map([...map.querySelectorAll<SVGElement>('.source-node[data-source-id]')].map(node => [node.getAttribute('data-source-id')!, Number(getComputedStyle(node).opacity)]));
    const fullScope = projectView(snapshot, {...state, layer:"all", query:""});
    relationshipFocus = createRelationshipFocus(fullScope.sources.map(source => source.id), fullScope.relations, state);
    const sceneKey = [state.mode, state.corpus, state.groupId, state.dimension, state.layer].join(":");
    const changedScene = !!lastSceneKey && sceneKey !== lastSceneKey;
    lastSceneKey = sceneKey;
    transition?.cancel(); transition = null;
    const rect = wrap.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    map.setAttribute("viewBox", `0 0 ${width} ${height}`);
    map.replaceChildren(); transform = shape("g"); map.append(transform);
    if(state.mode==="constellation"||state.mode==="orbital"||state.mode==="directed"&&snapshot.media){
      referenceScene=state.mode==="directed"?drawDirectedScene(snapshot,state,transform,project,actions,clock.elapsed):drawReferenceScene(snapshot,state,transform,project,actions,clock.elapsed);
      const note=root.querySelector<HTMLElement>("#map-note")!;note.hidden=false;
      note.textContent="linkCount" in referenceScene?`${referenceScene.shownCount} of ${referenceScene.totalCount} sources · ${referenceScene.linkCount} of ${referenceScene.totalLinks} links · Full source list in Explore`:
        `${referenceScene.shownCount} of ${referenceScene.totalCount} sources · ${state.mode==="orbital"?"Concentric source layers":"Source clouds by role"} · Each particle opens a source`;
      if(state.fitRequested){
        const xs=referenceScene.bounds.map(point=>point.x),ys=referenceScene.bounds.map(point=>point.y);
        const minX=Math.min(0,...xs)-70,maxX=Math.max(0,...xs)+70,minY=Math.min(0,...ys)-20,maxY=Math.max(0,...ys)+42;
        const top=30,bottom=width<=740?116:60;
        state.zoom=Math.max(.08,Math.min(1.15,(width-32)/(maxX-minX),(height-top-bottom)/(maxY-minY)));
        state.pan={x:width/2-(minX+maxX)/2*state.zoom,y:top+(height-top-bottom)/2-(minY+maxY)/2*state.zoom};state.fitRequested=false;
      }
      applyTransform();finishDraw(changedScene);return;
    }
    referenceScene=null;
    atlasNodes=[];atlasEdges=[];atlasGuides=[];
    const view = projectView(snapshot, state);
    const overview = state.corpus === "workspace" && !state.groupId && state.layer === "all" && !state.query;
    if (overview) relationshipFocus = createRelationshipFocus([], [], {enabled:false});
    const nodes: Array<{ id: string; point: SpacePoint; source?: ViewerSource; title: string; count?: number; color: string; layers?: string[] }> = [];
    if (overview) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(view.groups.length * Math.max(1, width / height))));
      const rows = Math.ceil(view.groups.length / cols);
      worldHeight = Math.max(350, rows * 185);
      view.groups.forEach((group, i) => nodes.push({id: group.id, title: group.title, count: group.count, color: group.color, layers: group.layers,
        point: {x: (i % cols - (cols - 1) / 2) * 230, y: (Math.floor(i / cols) - (rows - 1) / 2) * 185, z: ((i % 3) - 1) * 95} }));
    } else {
      const selectedNeighbors = new Set<string>([state.selectedSourceId ?? ""]);
      view.relations.filter(r => r.source === state.selectedSourceId || r.target === state.selectedSourceId).forEach(r => { selectedNeighbors.add(r.source); selectedNeighbors.add(r.target); });
      // ponytail: SVG is bounded to 120 readable nodes; the list covers the full scope.
      const ordered = [...view.sources].sort((a, b) => Number(selectedNeighbors.has(b.id)) - Number(selectedNeighbors.has(a.id)) || Number(layerOf(a) === "citation") - Number(layerOf(b) === "citation") || (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0) || a.path.localeCompare(b.path));
      const literature = state.corpus === "literature" && !state.query;
      const sharedCitations=[...view.sources].filter(s=>layerOf(s)==="citation").sort((a,b)=>(degrees.get(b.id)??0)-(degrees.get(a.id)??0)||a.path.localeCompare(b.path)).slice(0,12);
      const candidates = literature ? [...ordered.filter(s => layerOf(s) !== "citation"), ...sharedCitations] : ordered;
      const shown = candidates.slice(0, 120).sort((a, b) => a.path.localeCompare(b.path));
      const placement = projectView(snapshot, {...state, layer:"all", query:""}).sources;
      const columnGap = state.corpus === "literature" && width <= 740 ? 800 : 320;
      const layout=sourceLayout(placement,state.mode==="rings"?"rings":"cluster",{literature:state.corpus==="literature",columnGap,degrees});
      const layers=layout.layers,cols=layers.length;worldHeight=layout.worldHeight;
      shown.forEach(source => {
        const point={...layout.positions.get(source.id)!};
        nodes.push({id: source.id, source, point, title: sourceName(source), color: view.groups.find(g => g.sources.some(s => s.id === source.id))?.color ?? "#9ec9ba"});
      });
      const note = root.querySelector<HTMLElement>("#map-note")!;
      note.hidden = false;
      note.textContent = literature ? `${shown.length} of ${view.sources.length} sources · Shared citations. All sources are in Explore.` : `${shown.length} of ${view.sources.length} sources on the map. Full titles and evidence are in Explore.`;
      if (state.mode !== "rings") layers.forEach((layer, i) => {
        const x = (i - (cols - 1) / 2) * columnGap;
        const anchor = {x, y: -worldHeight / 2 + 10, z: layerZ[layer]}, a = project(anchor);
        const label = shape("text", {x: a.x, y: a.y, class: "layer-title", "text-anchor": "start", "data-anchor-x":a.x}, layerNames[layer]);
        transform.append(label);atlasGuides.push({element:label,points:[anchor]});
        if (state.dimension === "3d") {
          const points = [{x:x-115,y:-worldHeight/2+30,z:layerZ[layer]},{x:x+115,y:-worldHeight/2+30,z:layerZ[layer]},{x:x+115,y:worldHeight/2-15,z:layerZ[layer]},{x:x-115,y:worldHeight/2-15,z:layerZ[layer]}];
          const plane = shape("polygon", {points: points.map(project).map(p=>`${p.x},${p.y}`).join(" "), class:"depth-plane"});
          transform.append(plane);atlasGuides.push({element:plane,points});
        }
      });
    }
    if (overview) {const note=root.querySelector<HTMLElement>("#map-note")!;note.hidden=false;note.textContent=`${view.groups.length} project groups · Selected local documentation · Read-only snapshot`;}
    const projected = nodes.map(node => ({...node, screen: project(node.point)}));
    showingOverview=overview;labelNodes=projected;
    const positions = new Map(projected.map(node => [node.id, node.screen]));
    const edgeKeys = new Set<string>();
    for (const relation of view.relations) {
      const fromNode = overview ? view.sources.find(s=>s.id===relation.source) : null;
      const toNode = overview ? view.sources.find(s=>s.id===relation.target) : null;
      const fromId = overview ? view.groups.find(g=>g.sources.includes(fromNode!))?.id : relation.source;
      const toId = overview ? view.groups.find(g=>g.sources.includes(toNode!))?.id : relation.target;
      if (!fromId || !toId || fromId === toId) continue;
      const key = `${fromId}:${toId}`; if (overview && edgeKeys.has(key)) continue; edgeKeys.add(key);
      const from = positions.get(fromId), to = positions.get(toId); if (!from || !to) continue;
      const related = relation.source === state.selectedSourceId || relation.target === state.selectedSourceId || relation.id === state.selectedRelationId;
      const path = shape("path", {d:`M ${from.x} ${from.y} C ${from.x+(to.x-from.x)*.5} ${from.y}, ${to.x-(to.x-from.x)*.5} ${to.y}, ${to.x} ${to.y}`, class:`edge ${relation.kind === "contains" ? "membership" : "recorded"}${related ? " highlighted" : ""}`, "data-relation-id":relation.id});
      path.append(shape("title", {}, `${relation.kind}: ${relation.evidence.length} citations`));
      path.addEventListener("click", ()=>actions.relation(relation.id)); transform.append(path);
      atlasEdges.push({from:fromId,to:toId,element:path});
    }
    for (const node of projected.sort((a,b)=>b.screen.depth-a.screen.depth)) {
      const selected = node.id === state.selectedSourceId;
      const group = shape("g", {class: `${overview ? "project-node" : "source-node"}${selected ? " selected" : ""}`, transform:`translate(${node.screen.x} ${node.screen.y})`, role:"button", tabindex:0,
        "aria-label":overview ? `Open project ${node.title}, ${node.count} sources` : `Inspect ${node.title}`, "aria-pressed":String(selected), [overview ? "data-group-id" : "data-source-id"]:node.id, style:`--node-color:${node.color}`});
      group.append(shape("title", {}, node.title));
      atlasNodes.push({id:node.id,point:node.point,screen:node.screen,element:group,index:nodes.findIndex(item=>item.id===node.id)});
      if (overview) {
        const scale = state.dimension === "3d" ? Math.max(.7,Math.min(1.25,node.screen.scale)) : 1;
        group.append(shape("ellipse", {rx:66*scale,ry:48*scale,class:"project-hull"}));
        group.append(shape("circle",{r:22*scale,class:"project-center"}));
        group.append(shape("text",{y:5,"text-anchor":"middle",class:"project-count"},String(node.count)));
        node.layers?.filter(l=>l!=="project").slice(0,6).forEach((layer,i,all)=>{
          const angle = (i/all.length)*Math.PI*2 - Math.PI/2;
          group.append(shape("circle",{cx:Math.cos(angle)*52*scale,cy:Math.sin(angle)*37*scale,r:4,class:`layer-satellite layer-${layer}`}));
        });
        group.append(shape("text",{y:72*scale,"text-anchor":"middle",class:"project-name"},compactMapLabel(node.title,14)));
        group.append(shape("text",{y:91*scale,"text-anchor":"middle",class:"project-layers"},node.layers?.filter(l=>l!=="project").map(l=>layerNames[l as keyof typeof layerNames]).slice(0,3).join(" · ") || "Inventory"));
      } else {
        group.append(shape("circle",{r:18,class:"hit-target"}));
        group.append(shape("circle",{r:selected ? 11 : 7,class:"source-glyph"}));
        if (layerOf(node.source!) === "app" || layerOf(node.source!) === "skill") group.append(shape("path",{d:layerOf(node.source!) === "app" ? "M-3-3h6v6h-6z" : "m1-5-4 6h3l-1 4 4-6H0z",class:"source-shape"}));
        group.append(shape("text",{x:20,y:4,class:`source-label${state.labels || selected ? "" : " label-hidden"}`},compactMapLabel(node.title,21)));
      }
      const activate = () => overview ? actions.group(node.id) : actions.source(node.id);
      group.addEventListener("click", activate); group.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();activate();}});
      transform.append(group);
    }
    if (state.fitRequested) {
      const xs = projected.map(n=>n.screen.x), ys = projected.map(n=>n.screen.y);
      const minX = Math.min(0,...xs)-140, maxX = Math.max(0,...xs)+180, minY = Math.min(0,...ys)-85, maxY = Math.max(0,...ys)+60;
      const top=32,bottom=width<=740?126:width<=1250?80:60;
      state.zoom = Math.max(.08,Math.min(1.15,(width-40)/(maxX-minX),(height-top-bottom)/(maxY-minY)));
      state.pan = {x:width/2-(minX+maxX)/2*state.zoom-(overview?0:Math.max(0,120-180*state.zoom)/2),y:top+(height-top-bottom)/2-(minY+maxY)/2*state.zoom}; state.fitRequested=false;
    }
    applyTransform();
    if(clock.elapsed)updateAtlasMotion();
    finishDraw(changedScene);
  }
  function finishDraw(changedScene: boolean) {
    const focusKey = relationshipFocus.active ? `${state.selectedSourceId}:${state.selectedRelationId}` : "";
    const changedFocus = focusKey !== lastFocusKey;
    lastFocusKey = focusKey;
    root.classList.toggle("relationship-focus", relationshipFocus.active);
    const sourceNodes = [...transform.querySelectorAll<SVGElement>('.source-node[data-source-id]')];
    for (const node of transform.querySelectorAll<SVGElement>('.source-node[data-source-id],.node-bloom')) {
      const id = node.getAttribute('data-source-id') ?? node.getAttribute('data-focus-source')!;
      const opacity = relationshipFocus.opacity(id);
      node.style.setProperty('--connection-opacity', String(opacity));
      node.setAttribute('data-focus-distance', relationshipFocus.active ? String(relationshipFocus.distances.get(id) ?? 'disconnected') : 'all');
      const previous = previousOpacities.get(id);
      if (changedFocus && previous !== undefined && previous !== opacity && !reducedMotion.matches && node.animate) {
        node.animate([{opacity:previous},{opacity}],{duration:220,easing:"cubic-bezier(0.16, 1, 0.3, 1)"});
      }
    }
    for (const edge of transform.querySelectorAll<SVGElement>('.edge[data-relation-id]')) {
      const relation = relationsById.get(edge.getAttribute('data-relation-id')!);
      if (relation) edge.style.setProperty('--connection-opacity', String(relationshipFocus.edgeOpacity(relation.source, relation.target)));
    }
    if (relationshipFocus.active) {
      const direct = sourceNodes.filter(node => relationshipFocus.distances.get(node.getAttribute('data-source-id')!) === 1).length;
      const indirect = sourceNodes.filter(node => (relationshipFocus.distances.get(node.getAttribute('data-source-id')!) ?? 0) >= 2).length;
      const scopeHasLinks = [...relationshipFocus.distances.values()].some(distance => distance > 0);
      const selectedLink = relationsById.get(state.selectedRelationId ?? '');
      const linkFocus = selectedLink && relationshipFocus.distances.get(selectedLink.source) === 0 && relationshipFocus.distances.get(selectedLink.target) === 0;
      root.querySelector('#map-note')!.textContent = linkFocus ? 'Selected link · Other connections fade by distance' : !scopeHasLinks ? 'No links in this scope · Other nodes fade' : `Connections · ${direct} direct · ${indirect} indirect · Distant nodes fade`;
      if(state.mode==="directed"&&referenceScene)root.querySelector('#map-note')!.textContent+=` · ${referenceScene.shownCount}/${referenceScene.totalCount} sources shown`;
    }
    if(changedScene && !reducedMotion.matches && transform.animate){
      transition=transform.animate([{opacity:.25,filter:"blur(2px)"},{opacity:1,filter:"blur(0px)"}],{duration:250,easing:"cubic-bezier(0.16, 1, 0.3, 1)"});
    }
    syncMotion();
  }
  function updateAtlasMotion(){
    const positions=new Map<string,ReturnType<typeof perspective>>();
    for(const node of atlasNodes){
      const point=state.dimension==="2d"&&(showingOverview||terminalIds.has(node.id))?atlasMotionPoint(node.point,clock.elapsed,node.index*1.7):node.point;
      node.screen=project(point);positions.set(node.id,node.screen);
      node.element.setAttribute("transform",`translate(${node.screen.x} ${node.screen.y})`);
      const label=labelNodes.find(label=>label.id===node.id);if(label)label.screen=node.screen;
    }
    if(state.dimension==="3d"){
      const ordered=[...atlasNodes].sort((a,b)=>b.screen.depth-a.screen.depth);
      if(ordered.some((node,index)=>node!==atlasNodes[index])){atlasNodes=ordered;transform.append(...atlasNodes.map(node=>node.element));}
    }
    for(const edge of atlasEdges){const from=positions.get(edge.from)!,to=positions.get(edge.to)!;
      edge.element.setAttribute("d",`M ${from.x} ${from.y} C ${from.x+(to.x-from.x)*.5} ${from.y}, ${to.x-(to.x-from.x)*.5} ${to.y}, ${to.x} ${to.y}`);
    }
    for(const guide of atlasGuides){
      const points=guide.points.map(project);
      if(points.length===1){guide.element.setAttribute("x",String(points[0]!.x+14/state.zoom));guide.element.setAttribute("y",String(points[0]!.y));guide.element.setAttribute("data-anchor-x",String(points[0]!.x));}
      else guide.element.setAttribute("points",points.map(point=>`${point.x},${point.y}`).join(" "));
    }
  }
  function project(point: SpacePoint) {
    return state.dimension === "3d" ? perspective(point,state.camera.yaw,state.camera.pitch) : {...point,depth:0,scale:1};
  }
  function moveCamera(dx: number, dy: number) {
    state.camera.yaw += dx; state.camera.pitch = Math.max(-1.1, Math.min(1.1,state.camera.pitch+dy)); draw(); actions.cameraChanged();
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest(interactiveTargets)) return;
    if(settleTimer){clearTimeout(settleTimer);settleTimer=null;}
    wrap.classList.remove("is-settling");wrap.classList.add("is-dragging");
    setDragFeedback(event,0);
    drag={x:event.clientX,y:event.clientY,pan:{...state.pan},yaw:state.camera.yaw,pitch:state.camera.pitch}; map.setPointerCapture(event.pointerId);
    syncMotion();
  };
  let lastDragPoint={x:0,y:0};
  function setDragFeedback(event:PointerEvent,speed:number){
    const rect=wrap.getBoundingClientRect();
    wrap.style.setProperty("--drag-x",`${Math.max(0,Math.min(width,event.clientX-rect.left))}px`);
    wrap.style.setProperty("--drag-y",`${Math.max(0,Math.min(height,event.clientY-rect.top))}px`);
    wrap.style.setProperty("--drag-speed",String(Math.min(1,speed/35)));
    lastDragPoint={x:event.clientX,y:event.clientY};
  }
  const move = (event: PointerEvent) => {
    if(!drag)return;
    setDragFeedback(event,Math.hypot(event.clientX-lastDragPoint.x,event.clientY-lastDragPoint.y));
    if(state.dimension==="3d"&&!event.shiftKey){state.camera.yaw=drag.yaw+(event.clientX-drag.x)*.005;state.camera.pitch=Math.max(-1.1,Math.min(1.1,drag.pitch+(event.clientY-drag.y)*.005));draw();}
    else {state.pan={x:drag.pan.x+event.clientX-drag.x,y:drag.pan.y+event.clientY-drag.y};applyTransform();}
  };
  const up=()=>{
    if(!drag)return;
    actions.cameraChanged();drag=null;
    wrap.classList.remove("is-dragging");
    if(!reducedMotion.matches){wrap.classList.add("is-settling");settleTimer=setTimeout(()=>{wrap.classList.remove("is-settling");settleTimer=null;},180);}
    syncMotion();
  };
  const wheel=(event:WheelEvent)=>{event.preventDefault();state.zoom=Math.max(.08,Math.min(3,state.zoom*(event.deltaY<0?1.1:.91)));applyTransform();actions.cameraChanged();};
  const key=(event:KeyboardEvent)=>{if(event.target!==map||!event.key.startsWith("Arrow"))return;event.preventDefault();if(state.dimension==="3d"&&!event.shiftKey)moveCamera(event.key==="ArrowLeft"?-.15:event.key==="ArrowRight"?.15:0,event.key==="ArrowUp"?-.1:event.key==="ArrowDown"?.1:0);else{state.pan.x+=event.key==="ArrowLeft"?35:event.key==="ArrowRight"?-35:0;state.pan.y+=event.key==="ArrowUp"?35:event.key==="ArrowDown"?-35:0;applyTransform();actions.cameraChanged();}};
  map.addEventListener("pointerdown",down);map.addEventListener("pointermove",move);map.addEventListener("pointerup",up);map.addEventListener("pointercancel",up);map.addEventListener("wheel",wheel,{passive:false});map.addEventListener("keydown",key);
  const observer=new ResizeObserver(()=>{const rect=wrap.getBoundingClientRect();if(Math.abs(width-rect.width)>1||Math.abs(height-rect.height)>1){state.fitRequested=true;draw();actions.cameraChanged();}});observer.observe(wrap);
  function syncMotion(){
    const allowed=motionAllowed({enabled:state.motion,speed:state.orbitSpeed,reduced:reducedMotion.matches,hidden:document.hidden,
      selected:!!(state.selectedSourceId||state.selectedRelationId),focused:!!document.activeElement?.closest(interactiveTargets),hovered:hoveringTarget,dragging:!!drag});
    wrap.classList.toggle("is-ambient",allowed);
    if(!allowed){cancelAnimationFrame(frame);frame=0;lastFrame=0;clock.pause();return;}
    if(!frame)frame=requestAnimationFrame(tick);
  }
  function tick(now:number){
    frame=0;
    if(!lastFrame||now-lastFrame>=40){
      const {elapsed,delta}=clock.step(now,state.orbitSpeed);lastFrame=now;
      if(state.dimension==="3d")state.camera.yaw+=.045*delta;
      if(referenceScene)referenceScene.updateMotion(elapsed);else updateAtlasMotion();
    }
    syncMotion();
  }
  const over=(event:PointerEvent)=>{if(event.pointerType==="mouse"&&(event.target as Element).closest(interactiveTargets)){hoveringTarget=true;syncMotion();}};
  const out=(event:PointerEvent)=>{if(event.pointerType==="mouse"){hoveringTarget=!!(event.relatedTarget instanceof Element&&event.relatedTarget.closest(interactiveTargets));syncMotion();}};
  const preferenceChanged=()=>{transition?.cancel();wrap.classList.remove("is-settling");syncMotion();};
  const focusOut=()=>queueMicrotask(syncMotion);
  document.addEventListener("visibilitychange",syncMotion);
  map.addEventListener("focusin",syncMotion);map.addEventListener("focusout",focusOut);
  map.addEventListener("pointerover",over);map.addEventListener("pointerout",out);reducedMotion.addEventListener("change",preferenceChanged);
  return {draw,applyTransform,moveCamera,syncMotion,dispose(){cancelAnimationFrame(frame);transition?.cancel();if(settleTimer)clearTimeout(settleTimer);observer.disconnect();document.removeEventListener("visibilitychange",syncMotion);reducedMotion.removeEventListener("change",preferenceChanged);map.removeEventListener("pointerover",over);map.removeEventListener("pointerout",out);map.removeEventListener("focusin",syncMotion);map.removeEventListener("focusout",focusOut);map.removeEventListener("pointerdown",down);map.removeEventListener("pointermove",move);map.removeEventListener("pointerup",up);map.removeEventListener("pointercancel",up);map.removeEventListener("wheel",wheel);map.removeEventListener("keydown",key);}};
}
