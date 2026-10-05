import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { TomeowlError } from "./domain";
import { ingest } from "./ingest";
import { retrieve } from "./retrieval";
import { contextPacket } from "./context-query";
import { graphNeighborhood, graphPath } from "./graph-query";
import type { SearchOptions } from "./query-scope";
import { makeSnapshot, openExistingStore, openStore, sourceDetails } from "./store";
import { projectMarkdown } from "./adapters/qmd";
import { validateGraphifyFile } from "./graphify-validation";
import { assertEmptyDirectory } from "./cli-guards";
import { renderSnapshot } from "./viewer/export";
import { readCollectionManifest } from "./collection-manifest";
import { backupCatalog, restoreCatalog, catalogStatus } from "./catalog-backup";
import { repositoryMap } from "./repomap";
import { addMemory, getMemory, recallMemory, supersedeMemory, retractMemory, forgetMemory, type MemoryInput, type MemoryStatus } from "./memory";

const HELP = {
  name: "tomeowl", commands: {
    init: "init [--db PATH]",
    ingest: "ingest (--root PATH [--root PATH ...] | --manifest JSON_PATH) [--limit N] [--db PATH]",
    search: "search --query TEXT [--match any|all|phrase] [--collection NAME] [--path PATH] [--limit N] [--db PATH]",
    neighbors: "neighbors --id SOURCE_ID [--depth 1] [--limit 100] [--max-edges 500] [--collection NAME] [--path PATH] [--db PATH]",
    path: "path --from SOURCE_ID --to SOURCE_ID [--depth 6] [--limit 100] [--max-edges 500] [--collection NAME] [--path PATH] [--db PATH]",
    context: "context --query TEXT [--match any|all|phrase] [--limit 20] [--max-sources 8] [--max-chunks 12] [--max-chars 12000] [--max-bytes 65536] [--depth 1] [--collection NAME] [--path PATH] [--db PATH]",
    repomap: "repomap [--query TEXT] [--collection NAME] [--path PATH] [--limit 100] [--max-bytes 65536] [--db PATH] (JS/TS module map; no symbol/call graph)",
    status: "status [--db PATH]",
    backup: "backup --out FRESH_DIRECTORY [--manifest JSON_PATH] [--db PATH]",
    restore: "restore --from BACKUP_DIRECTORY --db NEW_DATABASE_PATH",
    memory: {
      add: "memory add --namespace NAME --kind fact|preference|decision|procedure --text TEXT --author NAME [--id ID] [--expires-at ISO] [--evidence-chunk ID --evidence-quote TEXT] [--db PATH]",
      recall: "memory recall --namespace NAME [--query TEXT] [--status active|superseded|retracted|all] [--include-expired true|false] [--limit 20] [--max-bytes 65536] [--db PATH]",
      show: "memory show --namespace NAME --id ID [--db PATH]",
      correct: "memory correct --namespace NAME --id OLD_ID --kind KIND --text TEXT --author NAME [--replacement-id NEW_ID] [--expires-at ISO] [--evidence-chunk ID --evidence-quote TEXT] [--db PATH]",
      retract: "memory retract --namespace NAME --id ID [--db PATH]",
      forget: "memory forget --namespace NAME --id ID [--history true|false] [--db PATH] (owned memory records only)",
    },
    show: "show --id SOURCE_OR_CHUNK_ID [--limit N] [--db PATH]",
    map: "map --out JSON_PATH [--db PATH]",
    export: "export --out HTML_PATH [--db PATH]",
    project: "project --out DIRECTORY [--db PATH]",
    "validate-graphify": "validate-graphify --file PATH [--db PATH] (read-only, 5 MB / 20k nodes / 50k edges)",
    serve: "serve [--port 4317] [--db PATH]"
  }, flags: "Use --help for this JSON command reference."
};
type Args = { flags: Map<string,string[]> };
function parse(args:string[], command:string):Args {
  const allowed:Record<string,string[]>={
    init:["db"],ingest:["db","root","manifest","limit"],search:["db","query","limit","match","collection","path"],
    neighbors:["db","id","depth","limit","max-edges","collection","path"],
    path:["db","from","to","depth","limit","max-edges","collection","path"],
    context:["db","query","match","collection","path","limit","max-sources","max-chunks","max-chars","max-bytes","depth"],
    repomap:["db","query","collection","path","limit","max-bytes"],status:["db"],backup:["db","out","manifest"],restore:["db","from"],
    "memory-add":["db","namespace","kind","text","author","id","expires-at","evidence-chunk","evidence-quote"],
    "memory-correct":["db","namespace","kind","text","author","id","replacement-id","expires-at","evidence-chunk","evidence-quote"],
    "memory-recall":["db","namespace","query","status","include-expired","limit","max-bytes"],
    "memory-show":["db","namespace","id"],"memory-retract":["db","namespace","id"],"memory-forget":["db","namespace","id","history"],
    show:["db","id","limit"],get:["db","id","limit"],map:["db","out"],export:["db","out"],project:["db","out"],"validate-graphify":["db","file"],serve:["db","port"]
  };
  if(!allowed[command])throw new TomeowlError(`Unknown command: ${command}`,"INVALID_COMMAND");
  const flags=new Map<string,string[]>();
  for(let i=0;i<args.length;i++) {
    const token=args[i];
    if(!token.startsWith("--"))throw new TomeowlError(`Unexpected argument: ${token}`,"INVALID_ARGUMENT");
    const name=token.slice(2);
    if(!allowed[command].includes(name))throw new TomeowlError(`Unknown option for ${command}: ${token}`,"INVALID_ARGUMENT");
    const value=args[++i];
    if(!value||value.startsWith("--"))throw new TomeowlError(`Missing value for ${token}`,"INVALID_ARGUMENT");
    const values=flags.get(name)??[];
    if(name!=="root"&&values.length)throw new TomeowlError(`Option may only be used once: ${token}`,"INVALID_ARGUMENT");
    values.push(value);flags.set(name,values);
  }
  return {flags};
}
const val=(a:Args,k:string,required=false)=>{const v=a.flags.get(k)?.[0];if(required&&!v)throw new TomeowlError(`--${k} is required`,"INVALID_ARGUMENT");return v;};
const int=(value:string|undefined,fallback:number,min:number,max:number,name:string)=>{if(value===undefined)return fallback;if(!/^\d+$/.test(value))throw new TomeowlError(`--${name} must be an integer`,"INVALID_ARGUMENT");const n=Number(value);if(n<min||n>max)throw new TomeowlError(`--${name} must be from ${min} to ${max}`,"INVALID_ARGUMENT");return n;};
const dbPath=(a:Args)=>resolve(val(a,"db")??"data/tomeowl.sqlite");
const out=(value:unknown)=>process.stdout.write(JSON.stringify(value)+"\n");
const searchOptions=(a:Args):SearchOptions=>({match:val(a,"match") as SearchOptions["match"],collection:val(a,"collection"),path:val(a,"path")});
const graphOptions=(a:Args,depth:number)=>({collection:val(a,"collection"),path:val(a,"path"),depth:int(val(a,"depth"),depth,0,8,"depth"),limit:int(val(a,"limit"),100,1,1000,"limit"),maxEdges:int(val(a,"max-edges"),500,1,5000,"max-edges")});
const bool=(a:Args,name:string,fallback:boolean)=>{const v=val(a,name);if(v===undefined)return fallback;if(v!=="true"&&v!=="false")throw new TomeowlError(`--${name} must be true or false`,"INVALID_ARGUMENT");return v==="true";};
function memoryInput(a:Args,correct=false):MemoryInput {
  const chunk=val(a,"evidence-chunk"),quote=val(a,"evidence-quote");
  if((chunk===undefined)!==(quote===undefined))throw new TomeowlError("Provide both --evidence-chunk and --evidence-quote","INVALID_ARGUMENT");
  return {namespace:val(a,"namespace",true)!,kind:val(a,"kind",true)! as MemoryInput["kind"],text:val(a,"text",true)!,author:val(a,"author",true)!,origin:"authored",
    id:val(a,correct?"replacement-id":"id"),expiresAt:val(a,"expires-at"),...(chunk?{evidence:[{chunkId:chunk,quote:quote!}]}:{})};
}

async function main(argv:string[]):Promise<void> {
  if(!argv.length||argv.includes("--help")||argv.includes("-h")){out(HELP);return;}
  const groupedMemory=argv[0]==="memory";
  const command=groupedMemory?`memory-${argv[1]??""}`:argv[0];const args=parse(argv.slice(groupedMemory?2:1),command);
  if(command==="search"||command==="context")val(args,"query",true);
  if(command==="show"||command==="get"||command==="neighbors")val(args,"id",true);
  if(command==="path"){val(args,"from",true);val(args,"to",true);}
  if(command==="map"||command==="export"||command==="project"||command==="backup")val(args,"out",true);
  if(command==="validate-graphify")val(args,"file",true);
  if(command==="ingest"&&!!args.flags.get("root")===!!val(args,"manifest"))throw new TomeowlError("Supply either --root or --manifest","INVALID_ARGUMENT");
  if(command==="ingest")int(val(args,"limit"),500,1,10000,"limit");
  if(command==="search")int(val(args,"limit"),20,1,1000,"limit");
  if(command==="neighbors"||command==="path")graphOptions(args,command==="path"?6:1);
  if(command==="context"){
    int(val(args,"limit"),20,1,100,"limit");int(val(args,"max-sources"),8,1,64,"max-sources");
    int(val(args,"max-chunks"),12,1,128,"max-chunks");int(val(args,"max-chars"),12000,1,64000,"max-chars");int(val(args,"max-bytes"),65536,512,1048576,"max-bytes");int(val(args,"depth"),1,0,3,"depth");
  }
  if(command==="repomap"){int(val(args,"limit"),100,1,500,"limit");int(val(args,"max-bytes"),65536,512,1048576,"max-bytes");}
  if(command.startsWith("memory-"))val(args,"namespace",true);
  if(["memory-show","memory-correct","memory-retract","memory-forget"].includes(command))val(args,"id",true);
  if(command==="memory-add"||command==="memory-correct")memoryInput(args,command==="memory-correct");
  if(command==="memory-recall"){int(val(args,"limit"),20,1,100,"limit");int(val(args,"max-bytes"),65536,2048,1048576,"max-bytes");bool(args,"include-expired",false);}
  if(command==="memory-forget")bool(args,"history",true);
  if(command==="show"||command==="get")int(val(args,"limit"),20,1,100,"limit");
  const path=dbPath(args);
  if(command==="restore"){val(args,"db",true);out({ok:true,...restoreCatalog(val(args,"from",true)!,path)});return;}
  const manifest=val(args,"manifest")?readCollectionManifest(val(args,"manifest")!):undefined;
  const writable=["init","ingest","memory-add","memory-correct","memory-retract","memory-forget"].includes(command);
  const db:Database=writable?openStore(path):openExistingStore(path);
  try {
    switch(command) {
      case "init": out({ok:true,database:path,schemaVersion:1});return;
      case "ingest": {
        const roots=args.flags.get("root")??[];
        out({ok:true,...ingest(roots,{db,limit:int(val(args,"limit"),500,1,10000,"limit"),...(manifest?{collections:manifest.collections}:{})})});return;
      }
      case "search": out({ok:true,results:retrieve(db,val(args,"query",true)!,int(val(args,"limit"),20,1,1000,"limit"),searchOptions(args))});return;
      case "neighbors":out({ok:true,...graphNeighborhood(db,[val(args,"id",true)!],graphOptions(args,1))});return;
      case "path":out({ok:true,...graphPath(db,val(args,"from",true)!,val(args,"to",true)!,graphOptions(args,6))});return;
      case "context":out({ok:true,...contextPacket(db,val(args,"query",true)!,{
        ...searchOptions(args),limit:int(val(args,"limit"),20,1,100,"limit"),maxSources:int(val(args,"max-sources"),8,1,64,"max-sources"),
        maxChunks:int(val(args,"max-chunks"),12,1,128,"max-chunks"),maxChars:int(val(args,"max-chars"),12000,1,64000,"max-chars"),maxBytes:int(val(args,"max-bytes"),65536,512,1048576,"max-bytes"),depth:int(val(args,"depth"),1,0,3,"depth")
      })});return;
      case "repomap":out({ok:true,...repositoryMap(db,{...searchOptions(args),query:val(args,"query"),limit:int(val(args,"limit"),100,1,500,"limit"),maxBytes:int(val(args,"max-bytes"),65536,512,1048576,"max-bytes")})});return;
      case "status":out({ok:true,...catalogStatus(db)});return;
      case "backup":out({ok:true,...backupCatalog(db,val(args,"out",true)!,manifest)});return;
      case "memory-add":out({ok:true,memory:addMemory(db,memoryInput(args))});return;
      case "memory-correct":out({ok:true,memory:supersedeMemory(db,val(args,"namespace",true)!,val(args,"id",true)!,memoryInput(args,true))});return;
      case "memory-show":out({ok:true,memory:getMemory(db,val(args,"namespace",true)!,val(args,"id",true)!)});return;
      case "memory-retract":out({ok:true,memory:retractMemory(db,val(args,"namespace",true)!,val(args,"id",true)!)});return;
      case "memory-forget":out({ok:true,...forgetMemory(db,val(args,"namespace",true)!,val(args,"id",true)!,{history:bool(args,"history",true)})});return;
      case "memory-recall":out({ok:true,...recallMemory(db,{namespace:val(args,"namespace",true)!,query:val(args,"query"),status:val(args,"status") as MemoryStatus|"all"|undefined,
        includeExpired:bool(args,"include-expired",false),limit:int(val(args,"limit"),20,1,100,"limit"),maxBytes:int(val(args,"max-bytes"),65536,2048,1048576,"max-bytes")})});return;
      case "show":case "get": out({ok:true,...sourceDetails(db,val(args,"id",true)!,int(val(args,"limit"),20,1,100,"limit"))});return;
      case "map": {
        const output=resolve(val(args,"out",true)!);const snapshot=makeSnapshot(db);mkdirSync(dirname(output),{recursive:true});
        writeFileSync(output,JSON.stringify(snapshot,null,2)+"\n","utf8");out({ok:true,path:output,stats:snapshot.stats});return;
      }
      case "export": {
        const output=resolve(val(args,"out",true)!);const html=await renderSnapshot(makeSnapshot(db));mkdirSync(dirname(output),{recursive:true});
        writeFileSync(output,html,"utf8");out({ok:true,path:output,bytes:Buffer.byteLength(html)});return;
      }
      case "project": {
        const directory=resolve(val(args,"out",true)!);
        assertEmptyDirectory(directory);
        mkdirSync(directory,{recursive:true});
        const snapshot=makeSnapshot(db);let written=0;
        for(const source of snapshot.sources) {
          const detail=sourceDetails(db,source.id,2000);
          if(detail.truncated)throw new TomeowlError(`Projection would omit chunks for ${source.path}`,"PROJECTION_LIMIT");
          const projection=projectMarkdown(detail.source,detail.chunks);
          const output=resolve(directory,projection.relativePath);
          if(!output.startsWith(directory+"\\")&&!output.startsWith(directory+"/"))throw new TomeowlError("Projection path escaped output directory","INVALID_PROJECTION_PATH");
          mkdirSync(dirname(output),{recursive:true});writeFileSync(output,projection.markdown,"utf8");written++;
        }
        out({ok:true,directory,files:written});return;
      }
      case "validate-graphify": out({ok:true,file:resolve(val(args,"file",true)!),...validateGraphifyFile(db,resolve(val(args,"file",true)!))});return;
      case "serve": {
        const port=int(val(args,"port"),4317,1024,65535,"port");
        const server=Bun.serve({hostname:"127.0.0.1",port,fetch:async(req)=>{
          const url=new URL(req.url);
          if(req.method!=="GET")return Response.json({error:{code:"METHOD_NOT_ALLOWED",message:"GET only"}},{status:405});
          if(url.pathname==="/api/map")return Response.json(makeSnapshot(db));
          if(url.pathname==="/api/search")try{return Response.json({results:retrieve(db,url.searchParams.get("q")??"",int(url.searchParams.get("limit")??undefined,20,1,1000,"limit"),{
            match:(url.searchParams.get("match")??undefined) as SearchOptions["match"],collection:url.searchParams.get("collection")??undefined,path:url.searchParams.get("path")??undefined
          })});}catch(e){return Response.json(errorBody(e),{status:400});}
          if(url.pathname.startsWith("/api/source/"))try{return Response.json(sourceDetails(db,decodeURIComponent(url.pathname.slice(12))));}catch(e){return Response.json(errorBody(e),{status:404});}
          if(url.pathname==="/"||url.pathname==="/map")return new Response(await renderSnapshot(makeSnapshot(db)),{headers:{"content-type":"text/html; charset=utf-8"}});
          return Response.json({error:{code:"NOT_FOUND",message:"Not found"}},{status:404});
        }});
        out({ok:true,host:"127.0.0.1",port:server.port,url:`http://127.0.0.1:${server.port}`});return;
      }
    }
  } finally {
    if(command!=="serve")db.close();
  }
}
function errorBody(error:unknown) {
  if(error instanceof TomeowlError)return {error:{code:error.code,message:error.message}};
  return {error:{code:"TOMEOWL_ERROR",message:error instanceof Error?error.message:String(error)}};
}
main(Bun.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify(errorBody(error))+"\n");process.exitCode=1;});
