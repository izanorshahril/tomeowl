import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hash } from "../src/domain";
import { ingest } from "../src/ingest";
import { retrieve } from "../src/retrieval";
import { makeSnapshot, openExistingStore, openStore, sourceDetails } from "../src/store";
import { validateGraphifyFile } from "../src/graphify-validation";
import { assertEmptyDirectory } from "../src/cli-guards";

const tempDirs:string[]=[];
const databases:ReturnType<typeof openStore>[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();for(const path of tempDirs.splice(0))rmSync(path,{recursive:true,force:true});});
function fixture() {
  const dir=mkdtempSync(join(tmpdir(),"tomeowl-core-"));tempDirs.push(dir);
  const root=join(dir,"docs");mkdirSync(root);
  const db=openStore(join(dir,"index.sqlite"));databases.push(db);
  return {dir,root,db};
}

describe("core indexing",()=>{
  test("reingest is idempotent, update replaces old chunks and literal search stays safe",()=>{
    const {root,db}=fixture();const file=join(root,"a.md");
    writeFileSync(file,"alpha needle\nsecond line\n","utf8");
    const first=ingest(root,{db,limit:10});expect(first.added).toBe(1);
    const source=makeSnapshot(db).sources[0];expect(source.path).toBe(file);
    expect(source.id).toBe(hash(process.platform==="win32"?resolve(file).toLowerCase():resolve(file)).slice(0,32));
    const before=retrieve(db,"needle",10);expect(before).toHaveLength(1);expect(before[0].locator).toEqual({lineStart:1,lineEnd:2});
    expect(ingest(root,{db,limit:10}).unchanged).toBe(1);
    writeFileSync(file,"replacement TMEASURE_42\n","utf8");
    expect(ingest(root,{db,limit:10}).updated).toBe(1);
    expect(retrieve(db,"needle",10)).toHaveLength(0);
    expect(retrieve(db,'TMEASURE_42" OR *',10)).toHaveLength(1);
    const details=sourceDetails(db,source.id);expect(details.stale).toBe(false);expect(details.chunks).toHaveLength(1);
    expect(details.chunks[0].text).toContain("replacement");expect(details.returnedChunks).toBe(1);expect(details.truncated).toBe(false);
    expect((db.query("SELECT COUNT(*) n FROM chunk_fts").get() as {n:number}).n).toBe(1);
  });

  test("bad transcript input leaves indexed data unchanged",()=>{
    const {root,db}=fixture();const doc=join(root,"stable.md");writeFileSync(doc,"before token","utf8");
    ingest(root,{db,limit:10});const before=makeSnapshot(db);
    writeFileSync(doc,"after token","utf8");writeFileSync(join(root,"transcript.json"),"{broken","utf8");
    expect(()=>ingest(root,{db,limit:10})).toThrow();
    expect(makeSnapshot(db).sources[0].revision).toBe(before.sources[0].revision);
    expect(retrieve(db,"before",10)).toHaveLength(1);
  });

  test("source IDs stay stable when selected through a narrower explicit root",()=>{
    const {root,dir,db}=fixture();const nested=join(root,"nested");mkdirSync(nested);
    const file=join(nested,"note.md");writeFileSync(file,"stable path identity","utf8");
    ingest(root,{db,limit:10});const first=makeSnapshot(db).sources[0].id;
    const secondDb=openStore(join(dir,"second.sqlite"));databases.push(secondDb);
    ingest(file,{db:secondDb,limit:10});const second=makeSnapshot(secondDb).sources[0].id;
    expect(second).toBe(first);
  });

  test("Viberaven snippets preserve seconds and explicit links cite the source chunk",()=>{
    const {root,db}=fixture();
    writeFileSync(join(root,"transcript.json"),JSON.stringify({title:"Demo",snippets:[{start:5,duration:2,end:7,text:"caption TMEASURE_42"}],is_generated:true}),"utf8");
    writeFileSync(join(root,"guide.md"),"See [caption](transcript.json)\nTMEASURE_42 appears here\n","utf8");
    ingest(root,{db,limit:10});const snapshot=makeSnapshot(db);
    expect(snapshot.sources).toHaveLength(2);
    const result=retrieve(db,"caption",10)[0];expect(result.locator).toEqual({startSeconds:5,endSeconds:7});
    expect(snapshot.relations).toHaveLength(1);expect(snapshot.relations[0].kind).toBe("references");
    expect(snapshot.relations[0].evidence[0].locator).toEqual({lineStart:1,lineEnd:1});
  });

  test("file limit counts canonical transcripts after skipping sibling exports",()=>{
    const {root,db}=fixture();
    for(const name of ["a","b"]) {
      const folder=join(root,name);mkdirSync(folder);
      writeFileSync(join(folder,"transcript.json"),JSON.stringify({snippets:[{start:1,text:`caption ${name}`}]}),"utf8");
      writeFileSync(join(folder,"transcript.txt"),"duplicate","utf8");
      writeFileSync(join(folder,"transcript_timestamped.txt"),"duplicate","utf8");
    }
    const result=ingest(root,{db,limit:2});
    expect(result.files).toBe(2);expect(result.skipped.redundantTranscriptFiles).toBeGreaterThan(0);
    expect(makeSnapshot(db).sources).toHaveLength(2);
  });

  test("read-only database open refuses missing files and blocks writes",()=>{
    const {dir,db}=fixture();db.close();databases.splice(databases.indexOf(db),1);
    const missing=join(dir,"missing.sqlite");expect(()=>openExistingStore(missing)).toThrow("does not exist");
    expect(existsSync(missing)).toBe(false);
    const readOnly=openExistingStore(join(dir,"index.sqlite"));
    expect(()=>readOnly.query("DELETE FROM sources").run()).toThrow();readOnly.close();
  });

  test("project destination guard rejects nonempty output without modifying it",()=>{
    const {dir}=fixture();const output=join(dir,"projection");mkdirSync(output);const sentinel=join(output,"keep.txt");writeFileSync(sentinel,"keep","utf8");
    expect(()=>assertEmptyDirectory(output)).toThrow("must be empty");
    expect(readFileSync(sentinel,"utf8")).toBe("keep");
  });

  test("Graphify validation uses only current catalog sources and never mutates the index",()=>{
    const {root,dir,db}=fixture();
    const a=join(root,"a.md"),b=join(root,"b.md");writeFileSync(a,"first\nsecond\nthird\n","utf8");writeFileSync(b,"target","utf8");
    ingest(root,{db,limit:10});const snapshot=makeSnapshot(db);const [sourceA,sourceB]=snapshot.sources;
    const graphFile=join(dir,"graph.json");
    writeFileSync(graphFile,JSON.stringify({nodes:[{id:"a",source_file:sourceA.path,source_revision:sourceA.revision},{id:"b",source_file:sourceB.path,source_revision:sourceB.revision}],edges:[{id:"e",source:"a",target:"b",relation:"calls",confidence:"EXTRACTED",source_file:sourceA.path,source_revision:sourceA.revision,source_location:"L2"}]}),"utf8");
    const validated=validateGraphifyFile(db,graphFile);expect(validated.counts.validatedRelations).toBe(1);
    let catalogError:unknown;try{validateGraphifyFile(db,graphFile,{maxCatalogBytes:1});}catch(error){catalogError=error;}
    expect(catalogError).toMatchObject({code:"CATALOG_LIMIT"});
    const before=makeSnapshot(db).relations.length;writeFileSync(a,"changed current source","utf8");
    const stale=validateGraphifyFile(db,graphFile);expect(stale.counts.validatedRelations).toBe(0);
    expect(stale.warnings.some(x=>x.includes("stale indexed source"))).toBe(true);
    expect(makeSnapshot(db).relations.length).toBe(before);
  });

  test("Graphify file size is bounded before reading",()=>{
    const {dir,db}=fixture();const graph=join(dir,"large.graph.json");writeFileSync(graph,"");truncateSync(graph,5_000_001);
    expect(()=>validateGraphifyFile(db,graph)).toThrow("exceeds 5000000 bytes");
  });

  test("Graphify validation caps combined warnings and reports omitted count",()=>{
    const {root,dir,db}=fixture();
    for(let i=0;i<102;i++)writeFileSync(join(root,`source-${i}.md`),"indexed text","utf8");
    ingest(root,{db,limit:200});
    for(let i=0;i<102;i++)writeFileSync(join(root,`source-${i}.md`),"changed text","utf8");
    const graph=join(dir,"empty.graph.json");writeFileSync(graph,JSON.stringify({nodes:[],edges:[]}),"utf8");
    const result=validateGraphifyFile(db,graph);
    expect(result.warnings).toHaveLength(100);expect(result.counts.warnings).toBe(102);expect(result.omittedWarningCount).toBe(2);
  });

  test("chunk size is bounded and citations retain input line numbers",()=>{
    const {root,db}=fixture();
    writeFileSync(join(root,"long.txt"),`${"x".repeat(5000)}\nlast line\n`,"utf8");
    ingest(root,{db,limit:10});
    const source=makeSnapshot(db).sources[0];const details=sourceDetails(db,source.id,100);
    expect(details.chunks.every(c=>c.text.length<=1600)).toBe(true);
    expect(details.chunks.at(-1)?.locator.lineEnd).toBe(2);
  });
});
