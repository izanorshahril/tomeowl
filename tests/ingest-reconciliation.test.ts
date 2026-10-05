import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "../src/ingest";
import { retrieve } from "../src/retrieval";
import { makeSnapshot, openStore } from "../src/store";

const directories:string[]=[];
const databases:ReturnType<typeof openStore>[]=[];
afterEach(()=>{
  for(const db of databases.splice(0))db.close();
  for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});
});
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),"tomeowl-reconciliation-"));directories.push(directory);
  const root=join(directory,"docs");mkdirSync(root);
  const db=openStore(join(directory,"catalog.sqlite"));databases.push(db);
  return {directory,root,db};
}
function catalogState(db:ReturnType<typeof openStore>) {
  return {
    sources:db.query("SELECT * FROM sources ORDER BY id").all(),
    chunks:db.query("SELECT * FROM chunks ORDER BY id").all(),
    fts:db.query("SELECT chunk_id,body FROM chunk_fts ORDER BY chunk_id").all(),
    relations:db.query("SELECT * FROM relations ORDER BY id").all(),
  };
}

describe("ingest reconciliation",()=>{
  test("an explicit file updates only itself and preserves sibling citations and search",()=>{
    const {root,db}=fixture();const a=join(root,"a.md"),b=join(root,"b.md");
    writeFileSync(a,"original selected [sibling](b.md)\n");
    writeFileSync(b,"siblingneedle [selected](a.md)\n");
    ingest(root,{db,limit:10});const before=makeSnapshot(db);
    const sibling=before.sources.find(source=>source.path===b)!;
    const incoming=before.relations.find(relation=>relation.source===sibling.id)!;
    writeFileSync(a,"replacement selected [sibling](b.md)\n");
    const result=ingest(a,{db,limit:10});
    expect(result).toMatchObject({files:1,updated:1,removed:0,coverage:{completeScopes:0,partialScopes:0,fileSelections:1,unvisitedRoots:0}});
    expect(makeSnapshot(db).sources).toHaveLength(2);
    expect(retrieve(db,"siblingneedle",10)[0].sourceId).toBe(sibling.id);
    expect(makeSnapshot(db).relations).toHaveLength(2);
    expect(makeSnapshot(db).relations).toContainEqual(incoming);
  });

  test("a nested explicit file keeps its already indexed root ownership",()=>{
    const {root,db}=fixture();const nested=join(root,"nested");mkdirSync(nested);
    const a=join(nested,"a.md"),b=join(root,"b.md");
    writeFileSync(a,"old nested value\n");writeFileSync(b,"siblingneedle\n");
    ingest(root,{db,limit:10});const original=makeSnapshot(db).sources.find(source=>source.path===a)!;
    writeFileSync(a,"new nested value\n");
    expect(ingest(a,{db,limit:10})).toMatchObject({updated:1,removed:0});
    const updated=makeSnapshot(db).sources.find(source=>source.path===a)!;
    expect(updated.id).toBe(original.id);expect(updated.collection).toBe(original.collection);
    expect(db.query("SELECT scope FROM sources WHERE id=?").get(original.id)).toEqual({scope:root});
    expect(retrieve(db,"siblingneedle",10)).toHaveLength(1);
  });

  test("a completely observed empty folder removes the last source, FTS and both edge directions",()=>{
    const {directory,root,db}=fixture();const other=join(directory,"other");mkdirSync(other);
    const deleted=join(root,"last.md"),retained=join(other,"retained.md");
    writeFileSync(deleted,"deletedneedle [other](../other/retained.md)\n");
    writeFileSync(retained,"retainedneedle [last](../docs/last.md)\n");
    ingest([root,other],{db,limit:10});expect(makeSnapshot(db).relations).toHaveLength(2);
    unlinkSync(deleted);
    expect(ingest(root,{db,limit:10})).toMatchObject({scopes:1,files:0,removed:1,coverage:{completeScopes:1,partialScopes:0}});
    expect(makeSnapshot(db).sources.map(source=>source.path)).toEqual([retained]);
    expect(makeSnapshot(db).relations).toHaveLength(0);
    expect(retrieve(db,"deletedneedle",10)).toHaveLength(0);
    expect(retrieve(db,"retainedneedle",10)).toHaveLength(1);
    expect((db.query("SELECT COUNT(*) n FROM chunks").get() as {n:number}).n).toBe(1);
    expect((db.query("SELECT COUNT(*) n FROM chunk_fts").get() as {n:number}).n).toBe(1);
  });

  test("a failure in a later scope rolls back every source, chunk, FTS and relation write",()=>{
    const {directory,root,db}=fixture();const second=join(directory,"second");mkdirSync(second);
    const a=join(root,"a.md"),b=join(second,"b.md");
    writeFileSync(a,"originalalpha [second](../second/b.md)\n");writeFileSync(b,"originalbeta\n");
    ingest([root,second],{db,limit:10});const before=catalogState(db);
    const blocked=makeSnapshot(db).sources.find(source=>source.path===b)!.id;
    db.exec(`CREATE TRIGGER fail_second_scope BEFORE UPDATE ON sources WHEN NEW.id='${blocked}' BEGIN SELECT RAISE(ABORT,'injected scope failure'); END`);
    writeFileSync(a,"changedalpha [second](../second/b.md)\n");writeFileSync(b,"changedbeta\n");
    expect(()=>ingest([root,second],{db,limit:10})).toThrow("injected scope failure");
    expect(catalogState(db)).toEqual(before);
    expect(retrieve(db,"originalalpha",10)).toHaveLength(1);
    expect(retrieve(db,"changedalpha",10)).toHaveLength(0);
  });

  test("a relation insertion failure rolls back replacements and pruning",()=>{
    const {root,db}=fixture();const a=join(root,"a.md"),b=join(root,"b.md"),c=join(root,"c.md");
    writeFileSync(a,"originalalpha [target](b.md)\n");writeFileSync(b,"targetneedle\n");writeFileSync(c,"keptbeforefailure\n");
    ingest(root,{db,limit:10});const before=catalogState(db);
    db.exec("CREATE TRIGGER fail_relations BEFORE INSERT ON relations BEGIN SELECT RAISE(ABORT,'injected relation failure'); END");
    writeFileSync(a,"changedalpha [target](b.md)\n");unlinkSync(c);
    expect(()=>ingest(root,{db,limit:10})).toThrow("injected relation failure");
    expect(catalogState(db)).toEqual(before);
    expect(retrieve(db,"keptbeforefailure",10)).toHaveLength(1);
  });

  test("a limited directory scan preserves unseen indexed sources",()=>{
    const {root,db}=fixture();const a=join(root,"a.md"),b=join(root,"b.md");
    writeFileSync(a,"oldalpha\n");writeFileSync(b,"siblingneedle\n");ingest(root,{db,limit:10});
    writeFileSync(a,"newalpha\n");
    expect(ingest(root,{db,limit:1})).toMatchObject({files:1,updated:1,removed:0,coverage:{completeScopes:0,partialScopes:1}});
    expect(makeSnapshot(db).sources).toHaveLength(2);
    expect(retrieve(db,"siblingneedle",10)).toHaveLength(1);
  });

  test("an oversized skipped source remains captured when other sources update",()=>{
    const {root,db}=fixture();const a=join(root,"a.md"),b=join(root,"b.md");
    writeFileSync(a,"oldalpha\n");writeFileSync(b,"capturedoversizedneedle\n");ingest(root,{db,limit:10});
    const prior=makeSnapshot(db).sources.find(source=>source.path===b)!;
    writeFileSync(a,"newalpha\n");truncateSync(b,2*1024*1024+1);
    const result=ingest(root,{db,limit:10});
    expect(result).toMatchObject({files:1,updated:1,removed:0,skipped:{oversizedFiles:1},coverage:{completeScopes:0,partialScopes:1}});
    expect(makeSnapshot(db).sources.find(source=>source.path===b)?.revision).toBe(prior.revision);
    expect(retrieve(db,"capturedoversizedneedle",10)).toHaveLength(1);
  });

  test("a folder containing only skipped oversized sources is not treated as observed empty",()=>{
    const {root,db}=fixture();const a=join(root,"a.md");
    writeFileSync(a,"capturedoversizedneedle\n");ingest(root,{db,limit:10});
    const before=catalogState(db);truncateSync(a,2*1024*1024+1);
    expect(ingest(root,{db,limit:10})).toMatchObject({scopes:1,files:0,removed:0,skipped:{oversizedFiles:1}});
    expect(catalogState(db)).toEqual(before);
  });

  test("overlapping directory ownership is rejected before changing the catalog",()=>{
    const {root,db}=fixture();const nested=join(root,"nested");mkdirSync(nested);
    const a=join(nested,"a.md");writeFileSync(a,"originalalpha\n");ingest(root,{db,limit:10});
    const before=catalogState(db);writeFileSync(a,"changedalpha\n");
    expect(()=>ingest([root,nested],{db,limit:10})).toThrow("Overlapping roots");
    expect(catalogState(db)).toEqual(before);
  });

  test("coverage reports roots not visited because the shared file budget is exhausted",()=>{
    const {directory,root,db}=fixture();const second=join(directory,"second");mkdirSync(second);
    writeFileSync(join(root,"a.md"),"firstrootneedle\n");writeFileSync(join(second,"b.md"),"secondrootneedle\n");
    expect(ingest([root,second],{db,limit:1})).toMatchObject({files:1,coverage:{completeScopes:0,partialScopes:1,fileSelections:0,unvisitedRoots:1}});
    expect(retrieve(db,"secondrootneedle",10)).toHaveLength(0);
  });
});
