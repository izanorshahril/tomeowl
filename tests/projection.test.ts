import { describe, expect, test } from "bun:test";
import { corpusOf, corpusForLayer, layerOf, perspective, projectView, readableExcerpt } from "../src/viewer/projection";
import type { Snapshot } from "../src/viewer/types";
import { restoreView, savedView } from "../src/viewer/state";

const fixture: Snapshot = {
  schemaVersion: 1, generatedAt: "2026-10-03T00:00:00Z", stats: { sources: 4, chunks: 7, relations: 2 },
  sources: [
    { id:"project", title:"Local project", path:"project.md", collection:"Demo", kind:"document", revision:"a", chunkCount:1, corpus:"workspace", projectId:"demo", layer:"project" },
    { id:"skill", title:"Evidence skill", path:"skills/evidence/SKILL.md", collection:"Demo", kind:"document", revision:"b", chunkCount:2, corpus:"workspace", projectId:"demo", layer:"skill" },
    { id:"note", title:"Research note", path:"research/note.md", collection:"Research", kind:"document", revision:"c", chunkCount:3, corpus:"literature", layer:"research", excerpt:{quote:"Shared publication about evidence"} },
    { id:"citation", title:"Citation record", path:"citation.md", collection:"References", kind:"document", revision:"d", chunkCount:1, corpus:"literature", layer:"citation" },
  ],
  relations: [
    { id:"inventory", source:"project", target:"skill", kind:"contains", basis:"structural", evidence:[] },
    { id:"reference", source:"note", target:"citation", kind:"references", basis:"structural", evidence:[{sourceId:"note",revision:"c",chunkId:"chunk",quote:"[Publication](https://example.org)",locator:{lineStart:8}}] },
  ],
};

describe("shared evidence projection",()=>{
  test("scope preserves citations and counts without introducing edges",()=>{
    const literature=projectView(fixture,{corpus:"literature",groupId:null,layer:"all",query:""});
    expect(literature.sources.map(s=>s.id)).toEqual(["note","citation"]);
    expect(literature.chunks).toBe(4);
    expect(literature.relations).toEqual([fixture.relations[1]!]);
    expect(literature.relations[0]!.evidence[0]!.locator.lineStart).toBe(8);
    const notes=projectView(fixture,{corpus:"literature",groupId:null,layer:"research",query:"publication"});
    expect(notes.sources.map(s=>s.id)).toEqual(["note"]);
    expect(notes.relations).toEqual([]);
    expect(fixture.relations.length).toBe(2);
  });
  test("project layers, empty results and unassigned legacy sources remain reachable",()=>{
    const skills=projectView(fixture,{corpus:"workspace",groupId:"demo",layer:"skill",query:""});
    expect(skills.sources.map(s=>s.id)).toEqual(["skill"]);
    expect(skills.groups[0]!.count).toBe(1);
    expect(skills.groups[0]!.layers).toEqual(["skill"]);
    expect(projectView(fixture,{corpus:"workspace",groupId:null,layer:"all",query:"missing"}).sources).toEqual([]);
    const legacy={...fixture.sources[0]!,corpus:undefined,layer:undefined,projectId:undefined,collection:""};
    expect(corpusOf(legacy)).toBe("workspace");expect(layerOf(legacy)).toBe("document");
    expect(projectView({...fixture,sources:[legacy],relations:[]},{corpus:"workspace",groupId:null,layer:"all",query:""}).groups[0]!.title).toBe("Unfiled");
  });
  test("3D depth changes perspective and rotation while keeping finite camera output",()=>{
    const front=perspective({x:100,y:50,z:-200},0,0),back=perspective({x:100,y:50,z:200},0,0);
    expect(front.scale).toBeGreaterThan(back.scale);expect(front.x).toBeGreaterThan(back.x);
    const turned=perspective({x:100,y:0,z:0},Math.PI/2,0);
    expect(Math.abs(turned.x)).toBeLessThan(.0001);expect(turned.depth).toBeCloseTo(100);
    for(const z of [-10000,0,10000])expect(Object.values(perspective({x:10,y:20,z},.3,.4)).every(Number.isFinite)).toBe(true);
  });
  test("readable presentation keeps the original quote unchanged",()=>{
    const original='<h1>Evidence</h1>\n\n[Publication](https://example.org) supports a claim.\n![badge](image.png)';
    expect(readableExcerpt(original)).toBe("Evidence\n\nPublication supports a claim.");
    expect(original).toContain("<h1>");
  });
  test("saved views recover valid scope and camera while rejecting damaged preferences",()=>{
    const base=restoreView(fixture,null);
    const view=restoreView(fixture,{...savedView(base),corpus:"literature",dimension:"3d",layer:"research",query:"publication",camera:{yaw:.8,pitch:.3},pan:{x:20,y:30},zoom:.8,motion:true,orbitSpeed:70});
    expect(view.corpus).toBe("literature");expect(view.dimension).toBe("3d");expect(view.query).toBe("publication");expect(view.camera).toEqual({yaw:.8,pitch:.3});expect(view.pan).toEqual({x:20,y:30});expect(view.fitRequested).toBe(false);
    expect(restoreView(fixture,savedView(view),true).motion).toBe(false);expect(view.sound).toBe(false);
    const invalid=restoreView(fixture,{profile:"bad",groupId:"missing",camera:{yaw:NaN,pitch:Infinity},zoom:0,pan:{x:1,y:2},labels:"yes",orbitSpeed:Infinity});
    expect(invalid.camera).toEqual(base.camera);expect(invalid.groupId).toBe(null);expect(invalid.zoom).toBe(1);expect(invalid.profile).toBe("engineer");expect(invalid.labels).toBe(true);
  });
  test("reference forms become the default and each form survives a saved-view round trip",()=>{
    const base=restoreView(fixture,null);
    expect(base.mode).toBe("constellation");
    expect(base.mapExpanded).toBe(true);
    for(const mode of ["constellation","orbital","cluster","rings"] as const){
      const view={...base,mode,mapExpanded:false,dimension:"3d" as const,groupId:"demo",selectedSourceId:"skill"};
      const restored=restoreView(fixture,savedView(view));
      expect(restored.mode).toBe(mode);expect(restored.dimension).toBe("3d");
      expect(restored.mapExpanded).toBe(false);
      expect(restored.groupId).toBe("demo");expect(restored.selectedSourceId).toBe("skill");
    }
    expect(restoreView(fixture,{mode:"unknown"}).mode).toBe("constellation");
  });
  test("command center and explicit motion preferences survive restoration safely",()=>{
    const base=restoreView(fixture,null);
    expect(base.surface).toBe("center");expect(base.motion).toBe(true);
    const restored=restoreView(fixture,savedView({...base,surface:"map",motion:false,orbitSpeed:0}));
    expect(restored.surface).toBe("map");expect(restored.motion).toBe(false);expect(restored.orbitSpeed).toBe(0);
    expect(restoreView(fixture,{surface:"unsupported"}).surface).toBe("center");
    for(const invalid of [null,undefined,[],"broken",42])expect(restoreView(fixture,invalid,true).motion).toBe(false);
    expect(restoreView(fixture,{profile:"contrast",motion:true}).motion).toBe(false);
    expect(restoreView(fixture,{motion:true},true).motion).toBe(false);
  });
  test("whole-snapshot layer actions choose a corpus containing actual sources",()=>{
    const mixed={...fixture,sources:[{...fixture.sources[2]!,layer:"document" as const},{...fixture.sources[1]!,corpus:"literature" as const}]};
    expect(corpusForLayer(mixed,"workspace","document")).toBe("literature");
    expect(projectView(mixed,{corpus:corpusForLayer(mixed,"workspace","document"),layer:"document",groupId:null,query:""}).sources.map(s=>s.id)).toEqual(["note"]);
    expect(corpusForLayer(mixed,"workspace","skill")).toBe("literature");
    expect(corpusForLayer(fixture,"literature","skill")).toBe("workspace");
    expect(corpusForLayer(fixture,"literature","all")).toBe("literature");
    expect(corpusForLayer(fixture,"literature","app")).toBe("literature");
  });
  test("speed preferences retain fractional slow motion and clamp legacy faster values",()=>{
    for(const speed of [0,6.25,12.5,25]){
      const view=restoreView(fixture,{orbitSpeed:speed,motion:false});
      expect(restoreView(fixture,savedView(view)).orbitSpeed).toBe(speed);expect(view.motion).toBe(false);
    }
    expect(restoreView(fixture,{orbitSpeed:70}).orbitSpeed).toBe(25);
    expect(restoreView(fixture,{orbitSpeed:-5}).orbitSpeed).toBe(0);
  });
});
