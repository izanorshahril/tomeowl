import { drawReferenceScene } from "../../../src/viewer/reference-scene";
import { initialState } from "../../../src/viewer/state";
import { createRelationshipFocus } from "../../../src/viewer/relationship-focus";
import type { Snapshot } from "../../../src/viewer/types";
import type { Control, Workload } from "./shared";

export function mount(container: HTMLElement, snapshot: Snapshot, work: Workload, glow: boolean): Control {
  container.className = `reference-form ${glow ? "" : "no-glow"}`;
  container.innerHTML = '<svg id="graph" viewBox="0 0 960 640"><g></g></svg>';
  const svg = container.querySelector("svg")!, parent = svg.querySelector("g")!;
  const state = initialState(snapshot);
  Object.assign(state,{labels: false, glow, motion: false, zoom: .7, pan: {x: 480,y: 320},fitRequested: false,corpus: "literature"});
  let elapsed = 0, scene: ReturnType<typeof drawReferenceScene>;
  const transform = () => parent.setAttribute("transform",`translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`);
  function draw() {
    parent.replaceChildren();
    scene = drawReferenceScene(snapshot,state,parent,point=>({...point,depth: 0,scale: 1}),{source:()=>{},relation:()=>{},layer:()=>{}},elapsed);
    transform();scene.refreshLabels(960);
    const focus = createRelationshipFocus(work.nodes.map(node=>node.id),work.edges,state);
    parent.querySelectorAll<SVGElement>(".source-node,.node-bloom").forEach(node=>{
      node.style.setProperty("--connection-opacity",String(focus.opacity(node.getAttribute("data-source-id") ?? node.getAttribute("data-focus-source")!)));
    });
    parent.querySelectorAll<SVGElement>(".edge[data-relation-id]").forEach(node=>{
      const edge = work.edges.find(edge=>edge.id===node.getAttribute("data-relation-id"))!;
      node.style.setProperty("--connection-opacity",String(focus.edgeOpacity(edge.source,edge.target)));
    });
  }
  draw();
  return {
    update(_points,nextElapsed){elapsed=nextElapsed;scene.updateMotion(elapsed);},
    pan(){state.pan.x+=35;transform();scene.refreshLabels(960);},
    focus(){state.selectedSourceId=work.nodes[0]!.id;draw();},
    // The benchmark is 2D: this is zoom, not a comparison of 3D cameras.
    camera(){state.zoom*=1.1;transform();scene.refreshLabels(960);},
    clearFocus(){state.selectedSourceId=null;draw();},
    counts(){return {renderedNodes:parent.querySelectorAll(".source-node").length,renderedEdges:parent.querySelectorAll(".edge[data-relation-id]").length,domElements:container.querySelectorAll("*").length,drawCalls:null,primitiveCount:parent.querySelectorAll("circle,path,polygon,text,rect").length};},
    dispose(){container.replaceChildren();},
  };
}
