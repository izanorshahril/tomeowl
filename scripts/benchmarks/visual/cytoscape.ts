import cytoscape from "cytoscape";
import type { Control, Workload } from "./shared";

export function mount(container: HTMLElement, work: Workload): Control {
  container.className = "";
  const cy = cytoscape({container,layout:{name:"preset",fit:false},pixelRatio:devicePixelRatio,
    zoom:.7,pan:{x:480,y:320},minZoom:.08,maxZoom:3,
    elements:[...work.nodes.map(node=>({data:{id:node.id,color:node.color},position:{x:node.point.x,y:node.point.y}})),
      ...work.edges.map(edge=>({data:{id:edge.id,source:edge.source,target:edge.target}}))],
    style:[{selector:"node",style:{width:8,height:8,"background-color":"data(color)","background-opacity":.85}},
      {selector:"edge",style:{width:.6,"line-color":"#b8acd2",opacity:.14,"curve-style":"straight"}},
      {selector:".dim",style:{opacity:.15}},{selector:".selected",style:{"border-width":2,"border-color":"#ffdaae"}}],
  });
  const nodes = cy.nodes();
  return {
    update(pose){cy.batch(()=>nodes.forEach((node,i)=>node.position({x:pose[i]!.x,y:pose[i]!.y})));},
    pan(){const pan=cy.pan();cy.pan({x:pan.x+35,y:pan.y});},
    focus(){const selected=nodes[0]!;cy.batch(()=>{cy.elements().addClass("dim");selected.closedNeighborhood().removeClass("dim");selected.addClass("selected");});},
    camera(){cy.zoom(cy.zoom()*1.1);},clearFocus(){cy.elements().removeClass("dim selected");},
    counts(){return {renderedNodes:nodes.length,renderedEdges:cy.edges().length,domElements:container.querySelectorAll("*").length,drawCalls:null,primitiveCount:nodes.length+cy.edges().length};},
    dispose(){cy.destroy();container.replaceChildren();},
  };
}
