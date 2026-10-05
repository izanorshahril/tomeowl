import { fixture, renderers, summary, workload, type Control, type RendererName } from "./shared";

const stage = document.querySelector<HTMLElement>("#stage")!;
const output = document.querySelector<HTMLElement>("#output")!;
const status = document.querySelector<HTMLElement>("#status")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
const params = new URLSearchParams(location.search);
const duration = Math.max(1000,Math.min(5000,Number(params.get("duration"))||1800));
const repetitions = Math.floor(Math.max(1,Math.min(5,Number(params.get("repetitions"))||3)));
const sizes = params.get("sizes")?.split(",").map(Number) ?? [100,400,1000];
if (!sizes.length || sizes.length>3 || new Set(sizes).size!==sizes.length || sizes.some(size=>![100,400,1000].includes(size))) throw new Error("Unsupported benchmark sizes");
const glow = params.get("glow") === "true";
const rows: unknown[] = [];
let stopped = false;

function heap() {
  const memory = (performance as Performance & {memory?: {usedJSHeapSize:number;totalJSHeapSize:number;jsHeapSizeLimit:number}}).memory;
  return memory ? {usedBytes:memory.usedJSHeapSize,totalBytes:memory.totalJSHeapSize,limitBytes:memory.jsHeapSizeLimit,scope:"Approximate browser page JS heap; includes loaded libraries, fixture, report and retained allocations. Excludes DOM native memory and GPU memory. No forced GC."} : {usedBytes:null,totalBytes:null,limitBytes:null,scope:"performance.memory is unavailable; browser JS heap not measured."};
}
function visible() {if(document.hidden || stopped) throw new Error("Benchmark interrupted or page hidden; keep this tab visible");}
function frame(): Promise<number> {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cancelAnimationFrame(id);reject(new Error("RAF timeout"));},5000);
    const id=requestAnimationFrame(now=>{clearTimeout(timer);try{visible();resolve(now);}catch(error){reject(error);}});
  });
}
async function opportunity() {await frame();await frame();}
async function motion(control: Control, work: ReturnType<typeof workload>, milliseconds: number, renderer: RendererName) {
  const start=performance.now(), raf: number[]=[], updates: number[]=[], cpu: number[]=[], poseCpu: number[]=[];
  let previous=0,lastUpdate=0;
  while(performance.now()-start<milliseconds){
    const now=await frame();
    if(previous)raf.push(now-previous);previous=now;
    if(!lastUpdate || now-lastUpdate>=40){
      if(lastUpdate)updates.push(now-lastUpdate);lastUpdate=now;
      let points: ReturnType<ReturnType<typeof workload>["pose"]> = [];
      if(renderer!=="tomeowl-svg"){
        const poseStart=performance.now();points=work.pose((now-start)/1000);poseCpu.push(performance.now()-poseStart);
      }
      const updateStart=performance.now();control.update(points,(now-start)/1000);cpu.push(performance.now()-updateStart);
    }
  }
  return {rafFrameIntervalsMs:summary(raf),motionUpdateIntervalsMs:summary(updates),adapterMutationSubmissionMs:summary(cpu),commonPoseComputationMs:renderer==="tomeowl-svg"?null:summary(poseCpu),poseComputationScope:renderer==="tomeowl-svg"?"Actual scene computes node poses and role guides inside the timed adapter call; no duplicate fixture pose is computed.":"Common node pose computation is timed separately; adapter call mutates renderer state and queues Canvas work or submits WebGL work.",rafFramesOver50ms:raf.filter(value=>value>50).length,elapsedMs:performance.now()-start};
}
async function action(invoke:()=>void) {
  const start=performance.now();invoke();const synchronousMs=performance.now()-start;
  await opportunity();
  return {synchronousMs,nextPresentationOpportunityMs:performance.now()-start};
}
async function runCase(renderer: RendererName,size: number,repetition: number) {
  visible();status.textContent=`${renderer} - ${size} requested sources - repetition ${repetition+1}/${repetitions}`;
  const snapshot=fixture(size),cap=renderer==="tomeowl-svg"?400:size,work=workload(snapshot,cap);
  const before=heap(),loadStart=performance.now();
  const module=renderer==="tomeowl-svg" ? await import("./tomeowl") : renderer==="three-webgl" ? await import("./three") : await import("./cytoscape");
  const moduleLoadMs=performance.now()-loadStart,start=performance.now();
  let control: Control | undefined;
  try {
    control=renderer==="tomeowl-svg" ? module.mount(stage,snapshot,work,glow) : module.mount(stage,work);
    const synchronousMountMs=performance.now()-start;await opportunity();
    const firstPresentationOpportunityMs=performance.now()-start;
    const counts=control.counts();
    if(counts.renderedNodes!==work.nodes.length || counts.renderedEdges!==work.edges.length) throw new Error("Renderer count did not match workload");
    await motion(control,work,500,renderer);
    const continuousMotion=await motion(control,work,duration,renderer);
    const pan=await action(()=>control!.pan()),focus=await action(()=>control!.focus()),zoom=await action(()=>control!.camera());
    const after=heap();
    return {status:"measured",renderer,size,repetition,dimension:"2d",requestedNodes:size,renderedNodes:work.nodes.length,requestedEdges:snapshot.relations.length,renderedEdges:work.edges.length,
      renderCap:renderer==="tomeowl-svg"?400:null,capped:work.nodes.length<size,countComparable:size<=400,featureParity:false,
      featureProfile:renderer==="tomeowl-svg" ? `Actual drawReferenceScene with role frames, hidden labels, glyphs, bloom DOM and accessibility targets; glow ${glow?"on":"off"}` : renderer==="three-webgl" ? "THREE WebGL points and line segments; no labels, guides, glow or hit targets; selection only changes global material opacity" : "Cytoscape default Canvas renderer with preset positions, circular nodes, straight edges and built-in hit targets; no labels, role guides or glow",
      coordinates:"Shared deterministic referenceLayout Constellation; XY only, same source IDs and visible links at 100/400",
      moduleLoadMs,synchronousMountMs,firstPresentationOpportunityMs,continuousMotion,actions:{pan,focus,zoom},counts,heap:{before,after,usedDeltaBytes:before.usedBytes===null||after.usedBytes===null?null:after.usedBytes-before.usedBytes}};
  } finally {control?.dispose();stage.replaceChildren();}
}
function report() {
  return {schemaVersion:1,createdAt:new Date().toISOString(),benchmark:"tomeowl-visual-v1",environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:(navigator as Navigator & {deviceMemory?:number}).deviceMemory??null,devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},scene:{width:960,height:640},visibility:document.visibilityState,reducedMotion:matchMedia("(prefers-reduced-motion: reduce)").matches},
    versions:{three:"0.186.1",cytoscape:"3.34.3",tomeowl:"Authored source imported directly; hash supplied by CLI metadata"},
    method:{repetitions,durationMs:duration,warmupMs:500,motionTargetHz:25,glow,order:"Renderer order rotated between repetitions; sizes ascending",setup:"Module load measured separately; fixture generation and layout excluded from mount timing. Same page, libraries remain cached between trials.",presentation:"Two requestAnimationFrame opportunities after mount or action; proxy only, not actual paint, compositor, GPU or screen presentation latency.",adapterTiming:"Synchronous adapter mutation/submission only. SVG includes actual-scene pose and guide computation; alternatives compute the common node pose separately, then queue Canvas work or submit WebGL work. This is not total renderer CPU or GPU time and cannot establish render superiority.",memory:"performance.memory only when exposed. Approximate page-wide JS heap without forced GC; neither renderer retained memory nor process RSS. Do not rank renderer memory from this figure.",features:"Actual Tomeowl scene is richer than bare controls. All featureParity flags are false. Fixed-position 2D renderer trial, not layout algorithm, 3D feature equivalence or production UI comparison.",caps:"100/400 nodes have comparable node and edge counts. At1000 Tomeowl displays400, controls display1000; countComparable is false and stress rows must not be ranked together.",actions:"Programmatic pan/focus/zoom mutations. Focus visuals differ; no pointer hit-test, drag or end-to-end UI latency claim."},rows};
}
async function persist() {const result=report();output.textContent=JSON.stringify(result,null,2);await fetch("/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(result)}).then(response=>{if(!response.ok)throw new Error(`Report save failed: ${response.status}`);});}
async function run() {
  button.disabled=true;stopped=false;rows.length=0;
  try {
    for(let repetition=0;repetition<repetitions;repetition++)for(const size of sizes)for(let index=0;index<renderers.length;index++){
      const renderer=renderers[(index+repetition)%renderers.length]!;
      try {rows.push(await runCase(renderer,size,repetition));}catch(error){rows.push({status:"failed",renderer,size,repetition,error:String(error)});if(document.hidden || stopped)throw error;}
      await persist();await opportunity();
    }
    status.textContent=`Complete - ${rows.length} trials saved to local JSON report`;
  }catch(error){status.textContent=`Stopped - ${String(error)}`;await persist();}
  finally {button.disabled=false;}
}
button.addEventListener("click",run);
document.querySelector("#stop")!.addEventListener("click",()=>{stopped=true;});
if(params.get("autorun")==="1")run();
