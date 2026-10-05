import * as THREE from "three";
import type { SpacePoint } from "../../../src/viewer/projection";
import type { Control, Workload } from "./shared";

export function mount(container: HTMLElement, work: Workload): Control {
  container.className = "";
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(devicePixelRatio);renderer.setSize(960,640);container.append(renderer.domElement);
  const scene = new THREE.Scene(), group = new THREE.Group();scene.add(group);
  const camera = new THREE.OrthographicCamera(-480/.7,480/.7,320/.7,-320/.7,.1,2000);camera.position.z=1000;
  const positions = new Float32Array(work.nodes.length*3), colors = new Float32Array(work.nodes.length*3);
  work.nodes.forEach((node,i)=>{new THREE.Color(node.color).toArray(colors,i*3);});
  const geometry = new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
  const material = new THREE.PointsMaterial({size:6,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.85});
  const points = new THREE.Points(geometry,material);group.add(points);
  const edges = new Float32Array(work.edges.length*6), edgeGeometry = new THREE.BufferGeometry();edgeGeometry.setAttribute("position",new THREE.BufferAttribute(edges,3));
  const edgeMaterial = new THREE.LineBasicMaterial({color:"#b8acd2",transparent:true,opacity:.14});
  const lines = new THREE.LineSegments(edgeGeometry,edgeMaterial);group.add(lines);
  const index = new Map(work.nodes.map((node,i)=>[node.id,i]));
  const draw=()=>renderer.render(scene,camera);
  function update(pose: SpacePoint[]) {
    pose.forEach((point,i)=>{positions[i*3]=point.x;positions[i*3+1]=-point.y;positions[i*3+2]=0;});
    work.edges.forEach((edge,i)=>{const from=pose[index.get(edge.source)!]!,to=pose[index.get(edge.target)!]!;edges.set([from.x,-from.y,0,to.x,-to.y,0],i*6);});
    geometry.attributes.position.needsUpdate=true;edgeGeometry.attributes.position.needsUpdate=true;draw();
  }
  update(work.pose(0));
  return {
    update(pose){update(pose);},pan(){group.position.x+=50;draw();},
    focus(){material.opacity=.35;edgeMaterial.opacity=.3;draw();},
    camera(){camera.zoom*=1.1;camera.updateProjectionMatrix();draw();},
    clearFocus(){material.opacity=.85;edgeMaterial.opacity=.14;draw();},
    counts(){return {renderedNodes:work.nodes.length,renderedEdges:work.edges.length,domElements:container.querySelectorAll("*").length,drawCalls:renderer.info.render.calls,primitiveCount:renderer.info.render.points+renderer.info.render.lines,estimatedTypedArrayBytes:positions.byteLength+colors.byteLength+edges.byteLength};},
    dispose(){geometry.dispose();edgeGeometry.dispose();material.dispose();edgeMaterial.dispose();renderer.dispose();renderer.forceContextLoss();container.replaceChildren();},
  };
}
