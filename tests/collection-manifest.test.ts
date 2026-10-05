import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCollectionManifest } from "../src/collection-manifest";

const directories:string[]=[];
afterEach(()=>{for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),"tomeowl-manifest-"));directories.push(directory);
  const path=join(directory,"collections.json");
  const write=(collections:unknown,schemaVersion=1)=>writeFileSync(path,JSON.stringify({schemaVersion,collections}));
  return {directory,path,write};
}

describe("collection manifest interface",()=>{
  test("relative roots are bound to the manifest location independently of process cwd",()=>{
    const {directory,path,write}=fixture();write([{id:"portable-workspace",name:"Research notes",root:"notes"}]);
    expect(readCollectionManifest(path)).toEqual({schemaVersion:1,collections:[{id:"portable-workspace",name:"Research notes",root:join(directory,"notes")}]});
  });

  test("unsupported versions, empty collections, invalid fields and more than 64 collections are rejected",()=>{
    const {path,write}=fixture();
    const invalids=[[],[{id:"bad\0id",name:"Notes",root:"notes"}],[{id:"valid",name:" ",root:"notes"}],[{id:"valid",name:"Notes",root:"x".repeat(4097)}],Array.from({length:65},(_,i)=>({id:`c${i}`,name:`C${i}`,root:`d${i}`}))];
    for(const collections of invalids){write(collections);expect(()=>readCollectionManifest(path)).toThrow();}
    write([{id:"valid",name:"Notes",root:"notes"}],2);expect(()=>readCollectionManifest(path)).toThrow("schemaVersion");
  });

  test("duplicate identities and normalized root bindings are rejected",()=>{
    const {path,write}=fixture();
    write([{id:"same",name:"First",root:"first"},{id:"same",name:"Second",root:"second"}]);
    expect(()=>readCollectionManifest(path)).toThrow("unique");
    write([{id:"first",name:"First",root:"notes"},{id:"second",name:"Second",root:"notes/../notes"}]);
    expect(()=>readCollectionManifest(path)).toThrow("unique");
    if(process.platform==="win32") {
      write([{id:"first",name:"First",root:"Notes"},{id:"second",name:"Second",root:"notes"}]);
      expect(()=>readCollectionManifest(path)).toThrow("unique");
    }
  });

  test("oversized and nonregular manifests are refused before JSON parsing",()=>{
    const {directory,path}=fixture();writeFileSync(path,"{}");truncateSync(path,1024*1024+1);
    expect(()=>readCollectionManifest(path)).toThrow("regular file");
    const folder=join(directory,"manifest-folder");mkdirSync(folder);
    expect(()=>readCollectionManifest(folder)).toThrow("regular file");
    writeFileSync(path,"{broken");expect(()=>readCollectionManifest(path)).toThrow("valid JSON");
  });
});
