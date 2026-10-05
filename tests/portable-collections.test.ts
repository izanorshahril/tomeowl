import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest, CollectionInput } from "../src/ingest";
import { retrieve } from "../src/retrieval";
import { makeSnapshot, openStore, sourceDetails } from "../src/store";
import { graphNeighborhood } from "../src/graph-query";
import { projectMarkdown } from "../src/adapters/qmd";

const directories:string[]=[];
const databases:ReturnType<typeof openStore>[]=[];
afterEach(()=>{
  for(const db of databases.splice(0))db.close();
  for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});
});
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),"tomeowl-portable-"));directories.push(directory);
  const original=join(directory,"original"),moved=join(directory,"moved");mkdirSync(original);mkdirSync(moved);
  const db=openStore(join(directory,"catalog.sqlite"));databases.push(db);
  const collection=(root:string,id="workspace",name="Research"):CollectionInput=>({id,name,root});
  return {directory,original,moved,db,collection};
}
function comparable(db:ReturnType<typeof openStore>) {
  const {generatedAt,...snapshot}=makeSnapshot(db);return snapshot;
}
function copyPair(root:string) {
  writeFileSync(join(root,"Guide.md"),"portableneedle [reference](reference.md)\n");
  writeFileSync(join(root,"reference.md"),"referenceneedle\n");
}

describe("portable collection identity",()=>{
  test("the same collection rebuilt on another root retains source, chunk and relation identities",()=>{
    const {directory,original,moved,db,collection}=fixture();copyPair(original);
    writeFileSync(join(moved,"guide.md"),"portableneedle [reference](reference.md)\n");
    writeFileSync(join(moved,"reference.md"),"referenceneedle\n");
    ingest([],{db,collections:[collection(original)]});const first=makeSnapshot(db);
    const secondDb=openStore(join(directory,"second.sqlite"));databases.push(secondDb);
    ingest([],{db:secondDb,collections:[collection(moved)]});const second=makeSnapshot(secondDb);
    expect(second.sources.map(source=>source.id)).toEqual(first.sources.map(source=>source.id));
    expect(second.sources.map(source=>source.revision)).toEqual(first.sources.map(source=>source.revision));
    expect(second.sources.map(source=>source.excerpt?.chunkId)).toEqual(first.sources.map(source=>source.excerpt?.chunkId));
    expect(second.relations).toEqual(first.relations);
    expect(second.sources.every(source=>source.path.startsWith(moved))).toBe(true);
  });

  test("rebinding a complete collection keeps citations and removes documents missing from its new root",()=>{
    const {original,moved,db,collection}=fixture();copyPair(original);copyPair(moved);
    writeFileSync(join(original,"removed.md"),"missingafterrebind\n");
    ingest([],{db,collections:[collection(original)]});const before=makeSnapshot(db);
    const guide=before.sources.find(source=>source.title==="Guide.md")!;
    const oldChunk=guide.excerpt!.chunkId;const relation=before.relations[0];
    const result=ingest([],{db,collections:[collection(moved,"workspace","Moved research")]});
    expect(result).toMatchObject({files:2,unchanged:2,removed:1});
    expect(makeSnapshot(db).sources.every(source=>source.path.startsWith(moved))).toBe(true);
    expect(sourceDetails(db,oldChunk).chunks[0].id).toBe(oldChunk);
    expect(sourceDetails(db,oldChunk).source.collection).toBe("Moved research");
    expect(makeSnapshot(db).relations).toContainEqual(relation);
    expect(retrieve(db,"missingafterrebind",10)).toHaveLength(0);
    expect(graphNeighborhood(db,[guide.id]).relations).toHaveLength(1);
    const projected=sourceDetails(db,guide.id);
    expect(projected.stale).toBe(false);
    expect(projectMarkdown(projected.source,projected.chunks).markdown).toContain(join(moved,"Guide.md").replaceAll("\\","\\\\"));
  });

  test("a partial rebind preserves unobserved captured sources while updating observed bindings",()=>{
    const {original,moved,db,collection}=fixture();copyPair(original);copyPair(moved);
    ingest([],{db,collections:[collection(original)]});
    const result=ingest([],{db,limit:1,collections:[collection(moved)]});
    expect(result).toMatchObject({files:1,removed:0});
    const sources=makeSnapshot(db).sources;
    expect(sources).toHaveLength(2);
    expect(sources.find(source=>source.title==="Guide.md")?.path).toBe(join(moved,"Guide.md"));
    expect(sources.find(source=>source.title==="reference.md")?.path).toBe(join(original,"reference.md"));
    expect(retrieve(db,"referenceneedle",10)).toHaveLength(1);
    expect(ingest([],{db,collections:[collection(moved)]})).toMatchObject({files:2,removed:0});
    expect(makeSnapshot(db).sources.every(source=>source.path.startsWith(moved))).toBe(true);
  });

  test("an oversized omission during rebinding preserves the previous captured revision",()=>{
    const {original,moved,db,collection}=fixture();copyPair(original);copyPair(moved);
    ingest([],{db,collections:[collection(original)]});
    truncateSync(join(moved,"reference.md"),2*1024*1024+1);
    expect(ingest([],{db,collections:[collection(moved)]})).toMatchObject({files:1,removed:0,skipped:{oversizedFiles:1}});
    const reference=retrieve(db,"referenceneedle",10)[0];
    expect(reference.path).toBe(join(original,"reference.md"));
    expect(makeSnapshot(db).sources).toHaveLength(2);
  });

  test("rebinding to a completely observed empty directory reconciles the collection",()=>{
    const {original,moved,db,collection}=fixture();copyPair(original);
    ingest([],{db,collections:[collection(original)]});
    expect(ingest([],{db,collections:[collection(moved)]})).toMatchObject({scopes:1,files:0,removed:2});
    expect(makeSnapshot(db).stats).toEqual({sources:0,chunks:0,relations:0});
    expect(retrieve(db,"portableneedle",10)).toHaveLength(0);
  });

  test("separate collection IDs distinguish identical relative paths and content",()=>{
    const {original,moved,db,collection}=fixture();copyPair(original);copyPair(moved);
    ingest([],{db,collections:[collection(original,"first"),collection(moved,"second")]});
    const guides=makeSnapshot(db).sources.filter(source=>source.title==="Guide.md");
    expect(guides).toHaveLength(2);expect(guides[0].id).not.toBe(guides[1].id);
    expect(guides[0].revision).toBe(guides[1].revision);
  });

  test("a legacy file selection preserves an existing portable identity and sibling sources",()=>{
    const {original,db,collection}=fixture();copyPair(original);
    ingest([],{db,collections:[collection(original)]});const before=makeSnapshot(db);
    const guide=before.sources.find(source=>source.title==="Guide.md")!;
    writeFileSync(join(original,"Guide.md"),"updatedportableneedle [reference](reference.md)\n");
    expect(ingest(join(original,"Guide.md"),{db})).toMatchObject({updated:1,removed:0});
    expect(retrieve(db,"updatedportableneedle",10)[0].sourceId).toBe(guide.id);
    expect(makeSnapshot(db).sources).toHaveLength(2);
    expect(makeSnapshot(db).relations).toHaveLength(1);
  });

  test("a collection cannot silently take over a legacy catalog path",()=>{
    const {original,db,collection}=fixture();copyPair(original);ingest(original,{db});
    const before=comparable(db);
    expect(()=>ingest([],{db,collections:[collection(original)]})).toThrow("different collection identity");
    expect(comparable(db)).toEqual(before);
  });

  test("changing collection identity or using a legacy directory root cannot duplicate portable sources",()=>{
    const {original,db,collection}=fixture();copyPair(original);
    ingest([],{db,collections:[collection(original)]});const before=comparable(db);
    expect(()=>ingest([],{db,collections:[collection(original,"different")]})).toThrow("different collection identity");
    expect(()=>ingest(original,{db})).toThrow("different collection identity");
    expect(comparable(db)).toEqual(before);
  });

  test("duplicate identities, invalid metadata, file roots and mixed selection modes reject before writes",()=>{
    const {original,moved,db,collection}=fixture();copyPair(original);
    const invalids:CollectionInput[][]=[
      [collection(original),collection(moved)],
      [collection(original,"bad\0id")],
      [collection(original,"valid","")],
      [collection(original,"valid","x".repeat(201))],
      [collection(join(original,"Guide.md"))],
    ];
    for(const collections of invalids)expect(()=>ingest([],{db,collections})).toThrow();
    expect(()=>ingest(original,{db,collections:[collection(original)]})).toThrow("cannot be combined");
    expect(makeSnapshot(db).stats).toEqual({sources:0,chunks:0,relations:0});
  });
});
