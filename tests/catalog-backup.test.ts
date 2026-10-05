import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupCatalog, restoreCatalog, catalogStatus } from "../src/catalog-backup";
import { ingest } from "../src/ingest";
import { addMemory, getMemory } from "../src/memory";
import { retrieve } from "../src/retrieval";
import { makeSnapshot, openExistingStore, openStore } from "../src/store";

const directories:string[]=[];
const databases:ReturnType<typeof openStore>[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
const digest=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),"tomeowl-backup-"));directories.push(directory);
  const root=join(directory,"docs");mkdirSync(root);
  const path=join(directory,"catalog.sqlite");const db=openStore(path);databases.push(db);
  writeFileSync(join(root,"decision.md"),"capturedneedle verified decision\n");
  const manifest={schemaVersion:1 as const,collections:[{id:"workspace",name:"Decisions",root}]};
  ingest([],{db,collections:manifest.collections});
  return {directory,root,path,db,manifest};
}

describe("consistent catalog backup",()=>{
  test("a read-only VACUUM snapshot captures committed WAL content and retained memory evidence",()=>{
    const {directory,root,path,db,manifest}=fixture();db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    const chunk=makeSnapshot(db).sources[0].excerpt!.chunkId;
    addMemory(db,{namespace:"project",id:"accepted",kind:"decision",text:"Use the recorded decision",author:"test",origin:"authored",evidence:[{chunkId:chunk,quote:"capturedneedle verified decision"}]});
    writeFileSync(join(root,"decision.md"),"latestneedle changed decision\n");ingest([],{db,collections:manifest.collections});
    expect(existsSync(path+"-wal")).toBe(true);
    const before=digest(path),reader=openExistingStore(path);databases.push(reader);
    const bundle=join(directory,"bundle");const backup=backupCatalog(reader,bundle,manifest);
    expect(digest(path)).toBe(before);expect(backup.originalsIncluded).toBe(false);
    const target=join(directory,"restored.sqlite");const restored=restoreCatalog(bundle,target);
    const saved=openExistingStore(target);databases.push(saved);
    expect(retrieve(saved,"latestneedle",10)).toHaveLength(1);
    expect(getMemory(saved,"project","accepted").evidence[0]).toMatchObject({chunkId:chunk,quote:"capturedneedle verified decision"});
    expect(catalogStatus(saved).memoryAvailable).toBe(true);
    expect(restored.collections).toBe(target+".collections.json");
    expect(JSON.parse(readFileSync(restored.collections!,"utf8"))).toEqual(manifest);
    expect(makeSnapshot(saved).sources.map(source=>source.id)).toEqual(makeSnapshot(db).sources.map(source=>source.id));
  });

  test("tampered database or collection bytes cannot be restored into a new target",()=>{
    const {directory,db,manifest}=fixture();const bundle=join(directory,"bundle");backupCatalog(db,bundle,manifest);
    const target=join(directory,"restored.sqlite");const collections=join(bundle,"collections.json");
    appendFileSync(collections," ");expect(()=>restoreCatalog(bundle,target)).toThrow("checksum");expect(existsSync(target)).toBe(false);
    writeFileSync(collections,JSON.stringify(manifest,null,2)+"\n");
    appendFileSync(join(bundle,"catalog.sqlite"),"tampered");
    expect(()=>restoreCatalog(bundle,target)).toThrow("checksum");expect(existsSync(target)).toBe(false);
  });

  test("backup and restore refuse nonempty or existing destinations without modifying them",()=>{
    const {directory,db,manifest}=fixture();const bundle=join(directory,"bundle");backupCatalog(db,bundle,manifest);
    const manifestBefore=readFileSync(join(bundle,"backup.json"),"utf8");
    expect(()=>backupCatalog(db,bundle,manifest)).toThrow("empty");expect(readFileSync(join(bundle,"backup.json"),"utf8")).toBe(manifestBefore);
    const target=join(directory,"existing.sqlite");writeFileSync(target,"sentinel catalog");
    expect(()=>restoreCatalog(bundle,target)).toThrow("new database");expect(readFileSync(target,"utf8")).toBe("sentinel catalog");
    const fresh=join(directory,"fresh.sqlite");writeFileSync(fresh+".collections.json","sentinel manifest");
    expect(()=>restoreCatalog(bundle,fresh)).toThrow("new database");expect(existsSync(fresh)).toBe(false);
    expect(readFileSync(fresh+".collections.json","utf8")).toBe("sentinel manifest");
  });

  test("restored evidence remains available after original documents disappear",()=>{
    const {directory,root,db}=fixture();const bundle=join(directory,"bundle");backupCatalog(db,bundle);
    rmSync(root,{recursive:true,force:true});
    const target=join(directory,"restored.sqlite");expect(restoreCatalog(bundle,target).collections).toBeNull();
    const restored=openExistingStore(target);databases.push(restored);
    expect(retrieve(restored,"capturedneedle",10)[0].quote).toContain("verified decision");
    expect(catalogStatus(restored).originalFreshnessVerified).toBe(false);
  });

  test("stale journal sidecars prevent restore without changing their bytes or creating a database",()=>{
    const {directory,db}=fixture();const bundle=join(directory,"bundle");backupCatalog(db,bundle);
    for(const suffix of ["-wal","-shm","-journal"]) {
      const target=join(directory,`restore${suffix}.sqlite`),sidecar=target+suffix;
      writeFileSync(sidecar,`existing ${suffix} sentinel`);const before=digest(sidecar);
      expect(()=>restoreCatalog(bundle,target)).toThrow("sidecars");
      expect(digest(sidecar)).toBe(before);expect(existsSync(target)).toBe(false);
    }
  });

  test("a real WAL from another catalog is refused instead of overriding restored memories",()=>{
    const {directory,db}=fixture();const bundle=join(directory,"bundle");backupCatalog(db,bundle);
    const donorPath=join(directory,"donor.sqlite"),donor=openStore(donorPath);databases.push(donor);
    donor.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    addMemory(donor,{namespace:"project",id:"unrelated",kind:"fact",text:"This belongs to another catalog",author:"test",origin:"authored"});
    const target=join(directory,"restored.sqlite"),sidecar=target+"-wal";
    copyFileSync(donorPath+"-wal",sidecar);const before=digest(sidecar);
    expect(()=>restoreCatalog(bundle,target)).toThrow("sidecars");
    expect(digest(sidecar)).toBe(before);expect(existsSync(target)).toBe(false);
    expect(getMemory(donor,"project","unrelated").text).toContain("another catalog");
  });
});
