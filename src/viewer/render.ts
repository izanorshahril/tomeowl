import { bindKeyboardShortcuts } from "./interaction";
import { initialState, restoreView, savedView } from "./state";
import { createSelectionSound } from "./sound";
import { mountGraph } from "./graph";
import { mountDashboard } from "./dashboard";
import { CURRENT_MOTION_SPEED } from "./motion";
import { corpusOf, corpusForLayer, groupOf, groupName, layerNames, layerOf, projectView, readableExcerpt, sourceName } from "./projection";
import { icon } from "./layout";
import type { Snapshot, SourceLayer, ViewerRelation, ViewerSource, ViewerState } from "./types";

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, content?: string) => {
  const node = document.createElement(tag); if(className)node.className=className; if(content!==undefined)node.textContent=content; return node;
};
const safeUrl = (url?: string) => { try { const value=new URL(url!);return ["http:","https:"].includes(value.protocol)?value.href:null;}catch{return null;} };
const locatorText = (loc: {lineStart?:number;lineEnd?:number;startSeconds?:number;endSeconds?:number} = {}, preferTime=false) => {
  const time=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  if(preferTime&&loc.startSeconds!==undefined)return `${time(loc.startSeconds)}${loc.endSeconds!==undefined?`–${time(loc.endSeconds)}`:""}`;
  return loc.lineStart ? `Lines ${loc.lineStart}${loc.lineEnd&&loc.lineEnd!==loc.lineStart?`–${loc.lineEnd}`:""}` : loc.startSeconds!==undefined ? `${time(loc.startSeconds)}${loc.endSeconds!==undefined?`–${time(loc.endSeconds)}`:""}` : "Locator not available";
};

export function mountViewer(snapshot:Snapshot,root:HTMLElement) {
  let state:ViewerState=initialState(snapshot);
  const byId=new Map(snapshot.sources.map(s=>[s.id,s]));
  const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const list=$("#source-list"),inspector=$("#inspector"),workspace=$(".workspace"),search=$<HTMLInputElement>("#search");
  const sound=createSelectionSound();let toastTimer=0;let coverage=false;let initialViewportCheck=true;let savedViewport:{width:number;height:number}|undefined;
  const preferenceKey=snapshot.media?"tomeowl.media.display.v1":"tomeowl.display.v4";
  const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
  const motionAllowed=()=>!reducedMotion.matches&&state.profile!=="contrast";
  const panelsOverlay=()=>state.surface==="center"||state.mapExpanded||matchMedia("(max-width: 1080px)").matches;
  try {
    const current=localStorage.getItem(preferenceKey);
    const saved=JSON.parse(current??(snapshot.media?"null":localStorage.getItem("tomeowl.display.v3")??localStorage.getItem("tomeowl.display.v2")??"null"));
    state=restoreView(snapshot,saved,reducedMotion.matches);
    if(!current){if(!snapshot.media)state.surface="center";state.motion=motionAllowed();state.orbitSpeed ||= CURRENT_MOTION_SPEED;state.fitRequested=true;}
    else if(Number.isFinite(saved?.viewport?.width)&&Number.isFinite(saved?.viewport?.height))savedViewport=saved.viewport;
  }catch{ /* Offline/file browsers can disable local storage. */ }
  if(!motionAllowed())state.motion=false;
  window.__TOMEOWL_STATE__=state;search.value=state.query;
  function persist(){try{const viewport=$(".graph-wrap").getBoundingClientRect();localStorage.setItem(preferenceKey,JSON.stringify({...savedView(state),viewport:{width:viewport.width,height:viewport.height}}));}catch{}}
  const announce=(message:string)=>{$("#toast").textContent=message;$("#toast").classList.add("shown");clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$("#toast").classList.remove("shown"),2400);};
  function showPanel(kind:"sources"|"inspector",open:boolean,focus=true){
    workspace.classList.toggle(`show-${kind}`,open);root.querySelectorAll(`[data-action="${kind}"]`).forEach(b=>b.setAttribute("aria-expanded",String(open)));
    if(open){const other=kind==="sources"?"inspector":"sources";workspace.classList.remove(`show-${other}`);root.querySelectorAll(`[data-action="${other}"]`).forEach(b=>b.setAttribute("aria-expanded","false"));if(focus&&panelsOverlay()){const rail=$(kind==="sources"?".left-rail":".right-rail");rail.querySelector<HTMLElement>("button,input")?.focus();}}
    else if(focus)root.querySelector<HTMLElement>(`[data-action="${kind}"]`)?.focus();
  }
  function openGroup(id:string){state.groupId=id;state.query="";search.value="";state.layer="all";state.selectedSourceId=null;state.selectedRelationId=null;coverage=false;state.fitRequested=true;showPanel("sources",false,false);update();announce(`${groupName(snapshot,id)} neighborhood`);}
  function selectSource(id:string){const source=byId.get(id);if(!source)return;const crossScope=state.corpus!==corpusOf(source)||state.groupId&&state.groupId!==groupOf(source);
    if(crossScope){state.corpus=corpusOf(source);state.groupId=state.corpus==="literature"?null:groupOf(source);state.layer="all";state.query="";search.value="";state.fitRequested=true;}
    if(!projectView(snapshot,state).sources.some(s=>s.id===id)){state.layer="all";state.query="";search.value="";}
    state.selectedSourceId=id;state.selectedRelationId=null;coverage=false;sound.play();showPanel("inspector",true,false);update();if(panelsOverlay())root.querySelector<HTMLElement>('[data-action="close-inspector"]')?.focus();announce(`Selected ${sourceName(source)}`);}
  function selectRelation(id:string){state.selectedRelationId=id;coverage=false;showPanel("inspector",true,false);update();if(panelsOverlay())root.querySelector<HTMLElement>('[data-action="close-inspector"]')?.focus();}
  const graph=mountGraph(snapshot,state,root,{group:openGroup,source:selectSource,relation:selectRelation,layer:layer=>{state.layer=state.layer===layer?"all":layer;state.selectedSourceId=null;state.selectedRelationId=null;update();},cameraChanged:persist});
  function overview(){state.groupId=null;state.selectedSourceId=null;state.selectedRelationId=null;state.query="";state.layer="all";search.value="";coverage=false;state.fitRequested=true;update();}
  function changeCorpus(corpus:ViewerState["corpus"]){state.corpus=corpus;overview();showPanel("sources",false,false);if(matchMedia("(max-width: 740px)").matches){$("#map-title").setAttribute("tabindex","-1");$("#map-title").focus();}}
  const dashboard=mountDashboard(snapshot,root,{
    source:selectSource,group:id=>{state.corpus="workspace";openGroup(id);},corpus:changeCorpus,
    layer:layer=>{state.corpus=corpusForLayer(snapshot,state.corpus,layer);state.groupId=null;state.layer=layer;state.query="";search.value="";state.selectedSourceId=null;state.selectedRelationId=null;state.fitRequested=true;coverage=false;update();},
    coverage:()=>{coverage=true;drawInspector();showPanel("inspector",true);},overview,form:changeForm,
  });
  function groupRow(group:ReturnType<typeof projectView>["groups"][number]){
    const row=element("button","group-row");row.type="button";row.dataset.groupId=group.id;
    const dot=element("span","group-dot");dot.style.background=group.color;const copy=element("span","source-copy");copy.append(element("span","source-title",group.title),element("span","source-path",group.layers.filter(l=>l!=="project").map(l=>layerNames[l]).slice(0,3).join(" · ")||"Project inventory"));
    row.append(dot,copy,element("span","nav-count",String(group.count)));row.onclick=()=>openGroup(group.id);return row;
  }
  function drawList(){
    const view=projectView(snapshot,state);list.replaceChildren();$("#visible-count").textContent=String(state.groupId||state.corpus==="literature"||state.query||state.layer!=="all"?view.sources.length:view.groups.length);
    $("#list-label").textContent=state.groupId?"Sources":snapshot.media?"Channels":state.corpus==="literature"?"Research & citations":"Projects";
    if(state.corpus==="workspace"&&!state.groupId&&!state.query&&state.layer==="all"){
      for(const group of view.groups)list.append(groupRow(group));
    }else{
      let previousLayer="";
      const mediaOrder=["channel","video","description","transcript"];
      const ordered=[...view.sources].sort((a,b)=>snapshot.media?mediaOrder.indexOf(layerOf(a))-mediaOrder.indexOf(layerOf(b))||(a.media?.ordinal??0)-(b.media?.ordinal??0)||a.path.localeCompare(b.path):Number(layerOf(a)==="citation")-Number(layerOf(b)==="citation")||layerOf(a).localeCompare(layerOf(b))||a.path.localeCompare(b.path));
      for(const source of ordered){const layer=layerOf(source);if(previousLayer!==layer){list.append(element("h3","list-group-heading",layerNames[layer]));previousLayer=layer;}
        const row=element("button",`source-row${state.selectedSourceId===source.id?" selected":""}`);row.type="button";row.dataset.sourceId=source.id;row.setAttribute("aria-pressed",String(state.selectedSourceId===source.id));
        const glyph=element("span","row-icon");glyph.innerHTML=icon(layer==="app"?"app":layer==="skill"?"skill":layer==="citation"?"link":"file",16);
        const copy=element("span","source-copy");copy.append(element("span","source-title",sourceName(source)),element("span","source-path",layer==="citation"?"URL record · not fetched":source.path.split(/[\\/]/).slice(-2).join("/")));
        row.append(glyph,copy);row.onclick=()=>selectSource(source.id);list.append(row);}
    }
    if(!view.sources.length)list.append(element("p","empty-list","No sources in this scope. Clear search or choose All layers."));
  }
  function heading(title:string,description:string){inspector.append(element("h3","inspector-title",title),element("p","inspector-description",description));}
  function appendExcerpt(source:ViewerSource){
    const section=element("section","evidence-section");section.append(element("h4",undefined,source.layer==="citation"?"Citation metadata":"Source excerpt"));
    const quote=element("blockquote");quote.textContent=readableExcerpt(source.excerpt?.quote??"")||"No excerpt in this snapshot. Re-ingest this source to capture content.";section.append(quote);
    if(source.excerpt){section.append(element("span","evidence-locator",locatorText(source.excerpt.locator,!!snapshot.media)));const raw=element("details","raw-quote");raw.append(element("summary",undefined,"Original quoted text"),element("pre",undefined,source.excerpt.quote));section.append(raw);}
    inspector.append(section);
  }
  function drawRelation(relation:ViewerRelation){
    const lexical=!!snapshot.media&&relation.kind==="similar"&&relation.basis==="lexical";
    heading(snapshot.media?relation.kind==="contains"?"Recorded containment":lexical?"Text overlap":"Recorded reference":relation.kind==="contains"?"Recorded inventory link":"Recorded reference",
      snapshot.media&&relation.kind==="contains"?"Channel to video, or video to description/transcript. Description and transcript are independent sibling branches.":lexical?"Shared terms in the indexed text. This is lexical overlap, without embedding inference.":relation.kind==="contains"?"The generated inventory declares this file in its project. This is a structural relationship.":`${relation.basis} basis · ${relation.evidence.length} evidence citations`);
    if(lexical){if(Number.isFinite(relation.score))inspector.append(element("p","quiet-note",`Term cosine: ${relation.score!.toFixed(3)} · not a confidence probability`));if(relation.sharedTerms?.length)inspector.append(element("p","quiet-note",`Shared terms: ${relation.sharedTerms.join(", ")}`));}
    const endpoints=element("div","relation-endpoints");
    for(const [id,label] of [[relation.source,"From"],[relation.target,"To"]]){const source=byId.get(id);const row=element("button","endpoint-row");row.type="button";row.append(element("small",undefined,label),element("span",undefined,source?sourceName(source):id));row.onclick=()=>selectSource(id);endpoints.append(row);}inspector.append(endpoints);
    for(const evidence of relation.evidence){const block=element("section","evidence-section");block.append(element("h4",undefined,byId.get(evidence.sourceId)?.title??"Source citation"),element("blockquote",undefined,readableExcerpt(evidence.quote)),element("span","evidence-locator",locatorText(evidence.locator,!!snapshot.media)));const raw=element("details","raw-quote");raw.append(element("summary",undefined,"Original quote & revision"),element("pre",undefined,`${evidence.quote}\n\nRevision: ${evidence.revision}\nChunk: ${evidence.chunkId}`));block.append(raw);inspector.append(block);}
    if(!relation.evidence.length)inspector.append(element("p","quiet-note","No quoted evidence is attached to this recorded relationship."));
    const back=element("button","text-button",state.selectedSourceId?"Back to source":"Back to overview");back.onclick=()=>{state.selectedRelationId=null;update();if(panelsOverlay())root.querySelector<HTMLElement>('[data-action="close-inspector"]')?.focus();};inspector.append(back);
  }
  function drawCoverage(){
    if(snapshot.media){const media=snapshot.media;heading("Media coverage","Selected local video records with description and timestamped transcript chunks.");const stats=element("dl","metadata-list");for(const [label,value] of [["Channels",`${media.channelCount}${media.totalChannels!==undefined?` / ${media.totalChannels}`:""}`],["Videos",`${media.videoCount} / ${media.totalVideos}`],["Description chunks",media.descriptionChunks],["Transcript chunks",media.transcriptChunks],["Lexical links",media.lexicalLinks]])stats.append(element("dt",undefined,String(label)),element("dd",undefined,String(value)));inspector.append(stats,element("p","quiet-note","Directed renders up to 400 sources. Explore retains the complete selected corpus. Arrows show containment; dashed links show shared terms."));for(const warning of media.warnings)inspector.append(element("p","quiet-note",warning));return;}
    heading("Sample coverage","All project folders are represented. File content is a bounded, read-only selection.");
    const scan=snapshot.sample?.scan;if(!scan){inspector.append(element("p","quiet-note","No discovery manifest is attached to this snapshot."));return;}
    const stats=element("dl","metadata-list");for(const [label,value] of [["Projects",scan.projectCount],["Selected files",scan.selectedFiles],["Research notes",scan.researchFiles],["URL records",scan.citationRecords]])stats.append(element("dt",undefined,String(label)),element("dd",undefined,String(value)));inspector.append(stats);
    const section=element("section","evidence-section");section.append(element("h4",undefined,"Omissions and bounds"));for(const [reason,count] of Object.entries(scan.omissions))section.append(element("p","coverage-row",`${reason.replace(/-/g," ")}: ${count}`));section.append(element("p","quiet-note",`Depth ${scan.bounds.maxDepth} · initial budget ${scan.bounds.filesPerProject} files/project, with additional research selection · ${Math.round(scan.bounds.maxFileBytes/1024)} KB/file. Omission counters describe scan passes. Rebuild the sample to refresh revisions.`));inspector.append(section);
    const rules=element("section","evidence-section");rules.append(element("h4",undefined,"Source roles"),element("p","quiet-note","Main docs: root README, AGENTS, CLAUDE and CONTEXT. Skills: SKILL.md or a skills folder. App manifests: package.json, pyproject.toml and Cargo.toml. Other selected Markdown is Documents; project research notes and extracted URL records form Research."));inspector.append(rules);
    const projects=element("details","source-details");projects.append(element("summary",undefined,"Coverage by project"));for(const project of snapshot.sample!.projects){const details=element("details","raw-quote");details.append(element("summary",undefined,project.title));const coverage=project.coverage;details.append(element("p","quiet-note",coverage?`${coverage.selectedFiles} selected / ${coverage.discoveredFiles} discovered candidate files. ${Object.entries(coverage.omissions).map(([reason,count])=>`${reason}: ${count}`).join("; ")||"No recorded omissions."}`:"Rebuild this sample for project-level coverage."));projects.append(details);}inspector.append(projects);
    for(const warning of scan.warnings)inspector.append(element("p","quiet-note",warning));
  }
  function drawInspector(){
    inspector.replaceChildren();$("#inspector-heading").textContent=state.selectedSourceId||state.selectedRelationId?"Evidence":"Workspace brief";
    if(coverage){drawCoverage();return;}
    const relation=snapshot.relations.find(r=>r.id===state.selectedRelationId);if(relation){drawRelation(relation);return;}
    const source=byId.get(state.selectedSourceId??"");
    if(source){
      const tag=element("div","source-type");tag.innerHTML=icon(layerOf(source)==="citation"?"link":"file",16);tag.append(element("span",undefined,layerNames[layerOf(source)]));inspector.append(tag);
      heading(sourceName(source),source.layer==="citation"?"URL-only citation record. The linked page or paper has not been fetched or verified here.":source.layer==="project"?"Generated inventory of selected local project files.":"Indexed local source · revision pinned to this snapshot");
      appendExcerpt(source);
      const relations=snapshot.relations.filter(r=>r.source===source.id||r.target===source.id);
      const section=element("section","relation-section");section.append(element("h4",undefined,`Connections · ${relations.length}`));
      if(!relations.length)section.append(element("p","quiet-note","No recorded links. Nearby sources share a visual grouping only."));
      for(const rel of relations){const other=byId.get(rel.source===source.id?rel.target:rel.source);const row=element("button","relation-row");row.type="button";
        const copy=element("span","source-copy");copy.append(element("span","source-title",other?sourceName(other):"Missing endpoint"),element("span","source-path",`${rel.kind==="contains"?snapshot.media?"Contains":"Inventory membership":snapshot.media&&rel.basis==="lexical"?"Text overlap":rel.kind} · ${rel.evidence.length} citations`));const glyph=element("span","row-icon");glyph.innerHTML=icon("link",15);row.append(glyph,copy);row.onclick=()=>selectRelation(rel.id);section.append(row);}inspector.append(section);
      const details=element("details","source-details");details.append(element("summary",undefined,"Source & revision"));const data=element("dl","metadata-list");for(const [label,value] of [["Path",source.path],["Revision",source.revision],["Chunks",source.chunkCount],["Collection",source.collection]])data.append(element("dt",undefined,String(label)),element("dd",undefined,String(value)));details.append(data);inspector.append(details);
      if(source.media){for(const [label,value] of [["Original path",source.media.originalPath],["Raw SHA-256",source.media.rawSha256],["Description SHA-256",source.media.descriptionSha256],["Language",source.media.language],["Caption source",source.media.isGenerated===undefined?undefined:source.media.isGenerated?"Generated captions":"Caption track marked non-generated"],["Cue range (zero-based)",source.media.cueStart===undefined?undefined:`${source.media.cueStart}–${source.media.cueEnd??source.media.cueStart}`],["Original description span",source.media.charStart===undefined?undefined:`UTF-16 offsets ${source.media.charStart}–${source.media.charEnd} (end exclusive); lines ${source.media.originalLineStart}–${source.media.originalLineEnd}`]])if(value!==undefined)data.append(element("dt",undefined,label!),element("dd",undefined,value));}
      const url=safeUrl(source.url);if(url){const anchor=element("a","open-source",source.layer==="citation"?"Open cited URL":"Open original source");anchor.href=url;anchor.target="_blank";anchor.rel="noopener noreferrer";inspector.append(anchor);}
      const copy=element("button","text-button","Copy citation");copy.onclick=async()=>{const original=source.media?.originalPath?`\nOriginal artifact: ${source.media.originalPath}\nRaw SHA-256: ${source.media.rawSha256}${source.media.charStart===undefined?"":`\nDescription UTF-16 span: ${source.media.charStart}–${source.media.charEnd} (end exclusive)`}${source.media.cueStart===undefined?"":`\nCue ordinals (zero-based): ${source.media.cueStart}–${source.media.cueEnd}`}`:"";const value=`${source.title}\n${source.path}\nRevision: ${source.revision}${original}\n${locatorText(source.excerpt?.locator,!!snapshot.media)}\n${source.excerpt?.quote??""}`;try{await navigator.clipboard.writeText(value);announce("Citation copied");}catch{announce("Clipboard unavailable. Use Original quoted text to select and copy.");}};inspector.append(copy);return;
    }
    const view=projectView(snapshot,state);
    if(state.groupId){heading(groupName(snapshot,state.groupId),`${view.sources.length} sources across ${new Set(view.sources.map(layerOf)).size} layers. Select a source to inspect its evidence.`);
      const summary=element("div","layer-summary");for(const layer of [...new Set(view.sources.map(layerOf))]){const row=element("button","summary-row");row.type="button";row.append(element("span",undefined,layerNames[layer]),element("strong",undefined,String(view.sources.filter(s=>layerOf(s)===layer).length)));row.onclick=()=>{state.layer=layer;update();};summary.append(row);}inspector.append(summary);
    }else if(snapshot.media){
      const media=snapshot.media;heading(media.name,"Follow channels to videos, then inspect description and transcript branches. Dashed links expose shared text terms.");
      const stats=element("dl","brief-stats");for(const [label,value] of [["Channels",media.channelCount],["Videos",`${media.videoCount} / ${media.totalVideos}`],["Description chunks",media.descriptionChunks],["Transcript chunks",media.transcriptChunks]])stats.append(element("dt",undefined,String(label)),element("dd",undefined,String(value)));inspector.append(stats);
      const coverage=element("button","text-button","View media coverage");coverage.onclick=()=>{drawCoverage();};inspector.append(coverage);
    }else if(state.corpus==="literature"){
      heading("Ideas with a paper trail","Explore the research behind this project. Shared citation URLs connect notes without implying agreement or similarity.");
      const stats=element("dl","brief-stats");stats.append(element("dt",undefined,"Research notes"),element("dd",undefined,String(view.sources.filter(s=>layerOf(s)==="research").length)),element("dt",undefined,"Citation records"),element("dd",undefined,String(view.sources.filter(s=>layerOf(s)==="citation").length)));inspector.append(stats);
      const section=element("section","evidence-section");section.append(element("h4",undefined,"Start reading"));for(const item of view.sources.filter(s=>layerOf(s)==="research").slice(0,4)){const row=element("button","reading-row",sourceName(item));row.onclick=()=>selectSource(item.id);section.append(row);}inspector.append(section);
    }else{
      heading("Everything has a place","A map of your local projects, the tools they use, and the documents that hold their context.");
      const stats=element("dl","brief-stats");stats.append(element("dt",undefined,"Projects"),element("dd",undefined,String(view.groups.length)),element("dt",undefined,"Selected sources"),element("dd",undefined,String(view.sources.length)));inspector.append(stats);
      const section=element("section","evidence-section");section.append(element("h4",undefined,"Explore in layers"));for(const [title,desc] of [["Main docs","The starting point and working guidance."],["Skills & apps","Reusable instructions and local tools."],["Documents","The supporting detail behind each project."]]){section.append(element("h5",undefined,title),element("p","quiet-note",desc));}inspector.append(section);
      const research=element("button","research-callout");research.innerHTML=icon("book",20);const copy=element("span","source-copy");copy.append(element("strong",undefined,"Follow the research"),element("span",undefined,"Notes, sources and shared citations"));research.append(copy);research.onclick=()=>changeCorpus("literature");inspector.append(research);
    }
    inspector.append(element("p","trust-note","Positions show organization. Only recorded links carry evidence. This snapshot does not check live file changes."));
  }
  function update(){
    const focused=document.activeElement as HTMLElement|null;
    const focusedSource=focused?.dataset.sourceId, focusedGroup=focused?.dataset.groupId, focusedLayer=focused?.dataset.layer,focusedRole=focused?.dataset.roleAnchor;
    const view=projectView(snapshot,state);drawList();drawInspector();
    root.classList.toggle("command-center",state.surface==="center");root.classList.toggle("map-expanded",state.surface==="map"&&state.mapExpanded);
    root.classList.toggle("center-overview",!state.groupId&&state.layer==="all"&&!state.query);
    root.querySelectorAll<HTMLElement>("[data-surface]").forEach(b=>{const active=b.dataset.surface===state.surface;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    dashboard.update(state);
    const focusButton=$('[data-action="focus-map"]');focusButton.setAttribute("aria-pressed",String(state.mapExpanded));focusButton.querySelector("span")!.textContent=state.mapExpanded?"Restore panels":"Expand map";
    const compactOverview=state.mode==="cluster"&&state.corpus==="workspace"&&!state.groupId&&state.layer==="all"&&!state.query&&state.dimension==="2d";
    root.classList.toggle("mobile-project-mode",compactOverview);$("#mobile-project-overview").replaceChildren(...(compactOverview?view.groups.map(groupRow):[]));
    root.classList.toggle("reference-form",state.mode==="constellation"||state.mode==="orbital"||state.mode==="directed");root.classList.toggle("directed-form",state.mode==="directed");
    $("#clear-relationship-focus").hidden=!state.selectedSourceId&&!state.selectedRelationId;
    root.querySelectorAll<HTMLElement>("[data-form]").forEach(b=>{const active=b.dataset.form===state.mode;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    root.querySelectorAll<HTMLElement>("[data-corpus]").forEach(b=>{const active=b.dataset.corpus===state.corpus;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    root.querySelectorAll<HTMLElement>("[data-dimension]").forEach(b=>{const active=b.dataset.dimension===state.dimension;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    $("#project-total").textContent=String(snapshot.sample?.projects.length??new Set(snapshot.sources.filter(s=>corpusOf(s)==="workspace").map(groupOf)).size);
    $("#research-total").textContent=String(snapshot.sources.filter(s=>corpusOf(s)==="literature"&&layerOf(s)==="research").length);
    $("#workspace-root").textContent=snapshot.media?.name??snapshot.sample?.workspaceRoot??"Local archive";
    $("#scan-summary").textContent=`${snapshot.sources.length} sources · offline snapshot`;
    $("#breadcrumb-scope").textContent=` / ${state.corpus==="workspace"?"Projects":"Research"}${state.groupId?` / ${groupName(snapshot,state.groupId)}`:""}`;
    $("#map-title").textContent=state.groupId?groupName(snapshot,state.groupId):state.query?`Results for “${state.query}”`:state.corpus==="workspace"?"Your connected workspace":"Research, connected";
    $("#map-subtitle").textContent=state.groupId?"Explore the context, tools and evidence in this neighborhood.":state.corpus==="workspace"?"Thirty projects. Many layers. One place to see how your work fits together.":"A literature map built from your research notes and their recorded references.";
    if(state.corpus==="workspace"&&!state.groupId&&!state.query)$("#map-subtitle").textContent=`${view.groups.length} projects. Many layers. One place to see how your work fits together.`;
    if(snapshot.media){$("#breadcrumb-scope").textContent=` / Channels${state.groupId?` / ${groupName(snapshot,state.groupId)}`:""}`;$("#map-title").textContent=state.groupId?groupName(snapshot,state.groupId):state.query?`Results for “${state.query}”`:snapshot.media.name;$("#map-subtitle").textContent=`${snapshot.media.channelCount}${snapshot.media.totalChannels!==undefined?` / ${snapshot.media.totalChannels}`:""} channels · ${snapshot.media.videoCount} / ${snapshot.media.totalVideos} videos · Description and transcript are sibling branches.`;}
    $("#scope-stats").textContent=`${view.sources.length} sources · ${view.chunks} chunks · ${view.relations.length} recorded links`;
    $("#camera-help").textContent=state.dimension==="3d"?"Drag to rotate · Shift-drag to pan":"Drag to pan · Scroll to zoom";
    $("#map-hint").textContent=state.mode==="constellation"||state.mode==="orbital"?"Select a particle · Filter a role · Zoom for names":state.groupId?"Select a source to follow its evidence":state.corpus==="literature"?"Select a note. Follow its recorded references.":"Open a project to explore its layers";
    if(state.mode==="directed")$("#map-hint").textContent="Follow arrows · Select a chunk for quoted evidence · Zoom for names";
    $("#rotate-controls").hidden=state.dimension!=="3d";$("[data-action=back]").hidden=!state.groupId;
    const tabs=$("#layer-tabs");tabs.replaceChildren();const roles=[...new Set(projectView(snapshot,{...state,layer:"all",query:""}).sources.map(layerOf))];
    if(snapshot.media){const order=["channel","video","description","transcript"];roles.sort((a,b)=>order.indexOf(a)-order.indexOf(b));}
    const layers=["all",...roles] as Array<SourceLayer|"all">;
    for(const layer of layers){const button=element("button",state.layer===layer?"active":"",layer==="all"?"All layers":layerNames[layer]);button.type="button";button.dataset.layer=layer;button.setAttribute("aria-pressed",String(state.layer===layer));button.onclick=()=>{state.layer=layer;state.selectedSourceId=null;state.selectedRelationId=null;update();};tabs.append(button);}
    $("#map-empty").hidden=view.sources.length>0;$("#map-empty").textContent=snapshot.sources.length?"No sources in this scope. Clear the search or choose All layers.":"Your workspace is empty. Ingest local sources, then export a snapshot.";
    root.classList.toggle("no-glow",!state.glow);root.classList.toggle("high-contrast",state.profile==="contrast");
    $<HTMLSelectElement>("#profile").value=state.profile;$<HTMLSelectElement>("#layout").value=state.mode;
    refreshMotionControls();
    if(initialViewportCheck){const viewport=$(".graph-wrap").getBoundingClientRect();state.fitRequested ||= !savedViewport||Math.abs(savedViewport.width-viewport.width)>1||Math.abs(savedViewport.height-viewport.height)>1;initialViewportCheck=false;}
    graph.draw();
    if(focusedSource)[...root.querySelectorAll<HTMLElement>(`[data-source-id="${CSS.escape(focusedSource)}"]`)].find(node=>node.getClientRects().length)?.focus();
    else if(focusedGroup){const target=root.querySelector<HTMLElement>(`[data-group-id="${CSS.escape(focusedGroup)}"]`)??root.querySelector<HTMLElement>('[data-action="back"]');target?.focus();}
    else if(focusedLayer)root.querySelector<HTMLElement>(`[data-layer="${CSS.escape(focusedLayer)}"]`)?.focus();
    else if(focusedRole)root.querySelector<HTMLElement>(`[data-role-anchor="${CSS.escape(focusedRole)}"]`)?.focus();
    persist();
  }
  function refreshMotionControls(){
    $("#motion-label").textContent="Ambient motion · 2D / 3D";
    const readingHold=!!(state.selectedSourceId||state.selectedRelationId),running=state.motion&&!readingHold&&state.orbitSpeed>0;
    const motionButton=$<HTMLButtonElement>('[data-action="toggle-motion"]');motionButton.setAttribute("aria-pressed",String(running));motionButton.disabled=!motionAllowed();motionButton.innerHTML=`${icon(running?"pause":"play",14)}<span>${!motionAllowed()?reducedMotion.matches?"Reduced motion":"Still preset":running?"Pause motion":"Resume motion"}</span>`;
    motionButton.title=readingHold?"Resume and clear the selected source or link":state.orbitSpeed===0?"Resume at slow speed":"Ambient motion pauses while you point at or focus a source";
    $<HTMLInputElement>("#motion").disabled=!motionAllowed();
    const glowButton=$<HTMLButtonElement>('[data-action="toggle-glow"]');glowButton.setAttribute("aria-pressed",String(state.glow));glowButton.disabled=state.profile==="contrast";$<HTMLInputElement>("#glow").disabled=state.profile==="contrast";
    for(const key of ["labels","glow","motion","sound"] as const)$<HTMLInputElement>(`#${key}`).checked=state[key];
    const percent=Math.round(state.orbitSpeed/CURRENT_MOTION_SPEED*100),text=percent===0?"Still":`${percent}%`;
    for(const id of ["motion-speed","orbit-speed"]){const range=$<HTMLInputElement>(`#${id}`);range.value=String(percent);range.disabled=!motionAllowed();range.setAttribute("aria-valuetext",percent===0?"Still":`${percent} percent of current pace`);}
    $("#motion-speed-value").textContent=text;$("#speed-value").textContent=text;
  }
  search.addEventListener("input",()=>{state.query=search.value;state.selectedSourceId=null;state.selectedRelationId=null;update();});
  root.querySelectorAll<HTMLElement>("[data-corpus]").forEach(b=>b.onclick=()=>changeCorpus(b.dataset.corpus as ViewerState["corpus"]));
  root.querySelectorAll<HTMLElement>("[data-surface]").forEach(b=>b.onclick=()=>{state.surface=b.dataset.surface as ViewerState["surface"];showPanel("sources",false,false);showPanel("inspector",false,false);state.fitRequested=true;update();});
  root.querySelectorAll<HTMLElement>("[data-dimension]").forEach(b=>b.onclick=()=>{state.dimension=b.dataset.dimension as ViewerState["dimension"];state.fitRequested=true;update();});
  function changeForm(mode:ViewerState["mode"]){if(mode==="directed"&&!snapshot.media)return;state.mode=mode;state.fitRequested=true;update();}
  root.querySelectorAll<HTMLElement>("[data-form]").forEach(b=>b.onclick=()=>changeForm(b.dataset.form as ViewerState["mode"]));
  function resetCamera(){state.camera={yaw:-.25,pitch:.32};state.fitRequested=true;graph.draw();persist();}
  root.querySelectorAll<HTMLElement>("[data-rotate]").forEach(b=>b.onclick=()=>graph.moveCamera(b.dataset.rotate==="left"?-.2:b.dataset.rotate==="right"?.2:0,b.dataset.rotate==="up"?-.12:b.dataset.rotate==="down"?.12:0));
  root.querySelectorAll<HTMLElement>("[data-pan]").forEach(b=>b.onclick=()=>{state.pan.x+=b.dataset.pan==="left"?35:b.dataset.pan==="right"?-35:0;state.pan.y+=b.dataset.pan==="up"?35:b.dataset.pan==="down"?-35:0;graph.applyTransform();persist();});
  root.querySelectorAll<HTMLElement>("[data-action]").forEach(button=>button.addEventListener("click",event=>{
    switch(button.dataset.action){case"home":event.preventDefault();case"overview":case"back":overview();break;case"fit":resetCamera();break;
      case"zoom-in":state.zoom=Math.min(3,state.zoom*1.2);graph.applyTransform();break;case"zoom-out":state.zoom=Math.max(.08,state.zoom/1.2);graph.applyTransform();break;
      case"sources":showPanel("sources",!workspace.classList.contains("show-sources"));break;case"inspector":showPanel("inspector",!workspace.classList.contains("show-inspector"));break;
      case"close-sources":showPanel("sources",false);break;case"close-inspector":showPanel("inspector",false);break;
      case"coverage":coverage=true;drawInspector();showPanel("inspector",true);break;
      case"display":{const settings=$("#display-settings");settings.hidden=!settings.hidden;root.querySelectorAll('[data-action="display"]').forEach(b=>b.setAttribute("aria-expanded",String(!settings.hidden)));if(!settings.hidden)$("#profile").focus();else root.querySelector<HTMLElement>('.view-actions [data-action="display"]')?.focus();break;}
      case"focus-map":state.mapExpanded=!state.mapExpanded;state.fitRequested=true;update();break;
      case"toggle-motion":{const running=state.motion&&state.orbitSpeed>0&&!state.selectedSourceId&&!state.selectedRelationId;state.motion=motionAllowed()&&!running;if(state.motion){state.selectedSourceId=null;state.selectedRelationId=null;state.orbitSpeed ||= CURRENT_MOTION_SPEED;coverage=false;showPanel("inspector",false,false);}update();announce(state.motion?"Motion resumed. Select a source to hold the map still.":"Motion paused");break;}
      case"toggle-glow":state.glow=state.profile!=="contrast"&&!state.glow;update();break;
      case"clear-focus":state.selectedSourceId=null;state.selectedRelationId=null;coverage=false;showPanel("inspector",false,false);update();$("#graph").focus();announce("All nodes visible in this scope");break;
      case"reset-preferences":state.mode=snapshot.media?"directed":"constellation";state.labels=true;state.glow=true;state.profile="engineer";state.motion=motionAllowed();state.orbitSpeed=CURRENT_MOTION_SPEED;state.sound=false;state.fitRequested=true;sound.setEnabled(false);persist();update();announce("Display preferences reset");break;
    }
    persist();
  }));
  $<HTMLSelectElement>("#profile").onchange=event=>{state.profile=(event.target as HTMLSelectElement).value as ViewerState["profile"];state.motion=motionAllowed();state.glow=state.profile!=="contrast";persist();update();};
  $<HTMLSelectElement>("#layout").onchange=event=>changeForm((event.target as HTMLSelectElement).value as ViewerState["mode"]);
  for(const key of ["labels","glow","motion","sound"] as const)$<HTMLInputElement>(`#${key}`).onchange=event=>{state[key]=(event.target as HTMLInputElement).checked;if(key==="motion")state.motion=state.motion&&motionAllowed();if(key==="sound")state.sound=sound.setEnabled(state.sound);persist();update();};
  const onMotionPreference=()=>{if(reducedMotion.matches)state.motion=false;update();};reducedMotion.addEventListener("change",onMotionPreference);
  function changeSpeed(event:Event){state.orbitSpeed=Math.max(0,Math.min(100,Number((event.target as HTMLInputElement).value)))/100*CURRENT_MOTION_SPEED;state.motion=state.orbitSpeed>0&&motionAllowed();refreshMotionControls();graph.syncMotion();persist();}
  $("#motion-speed").oninput=changeSpeed;$("#orbit-speed").oninput=changeSpeed;
  const dialog=$<HTMLDialogElement>("#command-dialog"),commandInput=$<HTMLInputElement>("#command-search"),commands=$("#command-list");
  function showCommands(){commands.replaceChildren();const query=commandInput.value.toLocaleLowerCase();const actions:Array<[string,string,()=>void]>=[[snapshot.media?"Channels overview":"Projects overview",snapshot.media?"Explore selected video channels":"Explore all local projects",()=>changeCorpus("workspace")],...(!snapshot.media?[["Research map","Follow research notes and citations",()=>changeCorpus("literature")] as [string,string,()=>void]]:[]),["Fit map","Reset and center the current map",resetCamera],["Switch 2D / 3D","Change spatial view",()=>{state.dimension=state.dimension==="2d"?"3d":"2d";state.fitRequested=true;update();}]];
    for(const [title,desc,action] of actions.filter(([title])=>title.toLocaleLowerCase().includes(query))){const row=element("button","command-row");row.type="button";row.append(element("strong",undefined,title),element("small",undefined,desc));row.onclick=()=>{dialog.close();action();};commands.append(row);}
    if(query)for(const source of snapshot.sources.filter(s=>`${s.title} ${s.path}`.toLocaleLowerCase().includes(query)).slice(0,30)){const row=element("button","command-row");row.type="button";row.append(element("strong",undefined,sourceName(source)),element("small",undefined,source.path));row.onclick=()=>{dialog.close();selectSource(source.id);};commands.append(row);}
    if(!commands.children.length)commands.append(element("p","quiet-note","No matching sources or commands."));}
  $('[data-action="palette"]').onclick=()=>{commandInput.value="";showCommands();dialog.showModal();commandInput.focus();};$('[data-action="close-palette"]').onclick=()=>dialog.close();commandInput.oninput=showCommands;commandInput.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();commands.querySelector<HTMLButtonElement>("button")?.click();}if(event.key==="ArrowDown"){event.preventDefault();commands.querySelector<HTMLButtonElement>("button")?.focus();}};
  commands.onkeydown=event=>{const rows=[...commands.querySelectorAll<HTMLButtonElement>("button")],index=rows.indexOf(document.activeElement as HTMLButtonElement);if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();rows[(index+(event.key==="ArrowDown"?1:rows.length-1))%rows.length]?.focus();}};
  list.onkeydown=event=>{if(event.key!=="ArrowDown"&&event.key!=="ArrowUp")return;event.preventDefault();const rows=[...list.querySelectorAll<HTMLButtonElement>("button")],index=rows.indexOf(document.activeElement as HTMLButtonElement);rows[Math.max(0,Math.min(rows.length-1,index+(event.key==="ArrowDown"?1:-1)))]?.focus();};
  const escape=(event:KeyboardEvent)=>{if(event.key!=="Escape"||dialog.open)return;if(!$("#display-settings").hidden){$("#display-settings").hidden=true;root.querySelectorAll('[data-action="display"]').forEach(b=>b.setAttribute("aria-expanded","false"));root.querySelector<HTMLElement>('.view-actions [data-action="display"]')?.focus();}else if(workspace.classList.contains("show-inspector"))showPanel("inspector",false);else if(workspace.classList.contains("show-sources"))showPanel("sources",false);};document.addEventListener("keydown",escape);
  const cleanupKeyboard=bindKeyboardShortcuts(root,search,dialog);update();
  return ()=>{graph.dispose();dashboard.dispose();clearTimeout(toastTimer);cleanupKeyboard();reducedMotion.removeEventListener("change",onMotionPreference);document.removeEventListener("keydown",escape);};
}

declare global {interface Window {__TOMEOWL_STATE__?:ViewerState}}
