import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directories:string[]=[];
afterEach(()=>{for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
const cli=resolve("src/cli.ts");
const digest=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),"tomeowl-capability-cli-"));directories.push(directory);
  const root=join(directory,"docs");mkdirSync(root);
  const db=join(directory,"catalog.sqlite"),manifest=join(directory,"collections.json");
  writeFileSync(join(root,"note.md"),"CLI decision evidence [module](module.ts)\n");
  writeFileSync(join(root,"module.ts"),"export const CLI_CAPABILITY = 1;\n");
  writeFileSync(manifest,JSON.stringify({schemaVersion:1,collections:[{id:"workspace",name:"Workspace",root:"docs"}]}));
  const call=(args:string[],database=db)=>{
    const result=Bun.spawnSync([process.execPath,cli,...args,"--db",database],{stdout:"pipe",stderr:"pipe"});
    const stdout=result.stdout.toString(),stderr=result.stderr.toString();
    return {exitCode:result.exitCode,stdout,stderr,body:JSON.parse(result.exitCode===0?stdout:stderr)};
  };
  const success=(args:string[])=>{const result=call(args);expect(result.exitCode).toBe(0);expect(result.stderr).toBe("");return result.body;};
  return {directory,root,db,manifest,call,success};
}

describe("capability CLI",()=>{
  test("manifest ingestion and explicit memory admission, correction, retraction and forgetting use grouped commands",()=>{
    const {manifest,success,call}=fixture();
    expect(success(["ingest","--manifest",manifest]).files).toBe(2);
    const result=success(["search","--query","decision"]);const chunk=result.results[0].chunkId;
    const admit=["memory","add","--namespace","project","--id","first","--kind","decision","--text","Use the recorded choice","--author","Tester","--evidence-chunk",chunk,"--evidence-quote","CLI decision evidence"];
    const first=success(admit).memory;expect(first.basis).toBe("cited");
    expect(success(admit).memory).toEqual(first);
    expect(success(["memory","recall","--namespace","project"]).memories.map((memory:any)=>memory.id)).toEqual(["first"]);
    const corrected=success(["memory","correct","--namespace","project","--id","first","--replacement-id","second","--kind","decision","--text","Use the revised choice","--author","Tester"]).memory;
    expect(corrected.supersedes).toBe("first");
    expect(success(["memory","show","--namespace","project","--id","first"]).memory.status).toBe("superseded");
    expect(success(["memory","recall","--namespace","project"]).memories.map((memory:any)=>memory.id)).toEqual(["second"]);
    expect(success(["memory","retract","--namespace","project","--id","second"]).memory.status).toBe("retracted");
    expect(success(["memory","recall","--namespace","project"]).memories).toEqual([]);
    const forgotten=success(["memory","forget","--namespace","project","--id","second"]);
    expect(forgotten.deletedRecords).toBe(2);expect(forgotten.capturedEvidenceCopies).toBe(1);expect(forgotten.scope).toBe("memory-records-only");
    expect(call(["memory","show","--namespace","project","--id","first"]).body.error.code).toBe("NOT_FOUND");
    expect(success(["search","--query","decision"]).results).toHaveLength(1);
  });

  test("expired memory is excluded by default and only included through an explicit option",()=>{
    const {success}=fixture();success(["init"]);
    success(["memory","add","--namespace","project","--id","expired","--kind","preference","--text","Historical preference","--author","Tester","--expires-at","2010-01-01T00:00:00Z"]);
    expect(success(["memory","recall","--namespace","project"]).memories).toEqual([]);
    expect(success(["memory","recall","--namespace","project","--include-expired","true"]).memories[0].expired).toBe(true);
  });

  test("read commands including catalog backup preserve the source database hash",()=>{
    const {directory,manifest,db,success}=fixture();success(["ingest","--manifest",manifest]);
    const search=success(["search","--query","decision"]);const id=search.results[0].sourceId;
    success(["memory","add","--namespace","project","--id","memory","--kind","fact","--text","A deliberately accepted fact","--author","Tester"]);
    const before=digest(db);
    const reads=[
      ["status"],["search","--query","decision"],["context","--query","decision"],
      ["repomap","--query","CLI_CAPABILITY"],["show","--id",id],
      ["neighbors","--id",id],["path","--from",id,"--to",id],
      ["memory","show","--namespace","project","--id","memory"],["memory","recall","--namespace","project"],
      ["backup","--out",join(directory,"bundle"),"--manifest",manifest],
    ];
    for(const args of reads){success(args);expect(digest(db)).toBe(before);}
    const restored=join(directory,"restored.sqlite");
    const command=Bun.spawnSync([process.execPath,cli,"restore","--from",join(directory,"bundle"),"--db",restored],{stdout:"pipe",stderr:"pipe"});
    expect(command.exitCode).toBe(0);expect(existsSync(restored)).toBe(true);
    expect(existsSync(restored+".collections.json")).toBe(true);
    expect(digest(db)).toBe(before);
  });

  test("invalid flags, bounds and mixed ingest modes fail with JSON errors before creating a catalog",()=>{
    const {directory,root,manifest,call}=fixture();const missing=join(directory,"never-created.sqlite");
    const invalids=[
      ["ingest","--root",root,"--manifest",manifest],["ingest"],
      ["repomap","--limit","0"],["repomap","--max-bytes","511"],
      ["context","--query","decision","--max-chars","0"],
      ["memory","recall","--namespace","project","--include-expired","yes"],
      ["memory","recall","--namespace","project","--max-bytes","2047"],
      ["memory","forget","--namespace","project","--id","memory","--history","yes"],
      ["memory","add","--namespace","project","--kind","fact","--text","Text","--author","Tester","--evidence-chunk","missing"],
      ["status","--unknown","value"],["status","--db","repeated"],
    ];
    for(const args of invalids){const result=call(args,missing);expect(result.exitCode).toBe(1);expect(result.stdout).toBe("");expect(result.body.error.code).toBe("INVALID_ARGUMENT");expect(existsSync(missing)).toBe(false);}
  });
});
