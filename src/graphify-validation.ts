import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { Database } from "bun:sqlite";
import { TomeowlError } from "./domain";
import { parseGraphify } from "./adapters/graphify";
import { makeSnapshot, sourceDetails } from "./store";

const MAX_BYTES=5_000_000;
const MAX_NODES=20_000;
const MAX_EDGES=50_000;
const MAX_CATALOG_BYTES=64*1024*1024;
const MAX_WARNINGS=100;

function readBoundedFile(path:string):string {
  let fd:number;
  try { fd=openSync(path,"r"); } catch(e) { throw new TomeowlError(`Cannot open Graphify file: ${String(e)}`,"INPUT_READ"); }
  try {
    const stat=fstatSync(fd);
    if(!stat.isFile())throw new TomeowlError("Graphify input must be a regular file","INVALID_GRAPHIFY_FILE");
    if(stat.size>MAX_BYTES)throw new TomeowlError(`Graphify input exceeds ${MAX_BYTES} bytes`,"INPUT_TOO_LARGE");
    const buffer=Buffer.alloc(MAX_BYTES+1);let bytes=0;
    while(bytes<buffer.length) { const count=readSync(fd,buffer,bytes,buffer.length-bytes,null);if(!count)break;bytes+=count; }
    if(bytes>MAX_BYTES)throw new TomeowlError(`Graphify input exceeds ${MAX_BYTES} bytes`,"INPUT_TOO_LARGE");
    return buffer.subarray(0,bytes).toString("utf8");
  } finally { closeSync(fd); }
}

export function validateGraphifyFile(db:Database,path:string,options:{maxCatalogBytes?:number}={}) {
  const maxCatalogBytes=options.maxCatalogBytes??MAX_CATALOG_BYTES;
  if(!Number.isSafeInteger(maxCatalogBytes)||maxCatalogBytes<1)throw new TomeowlError("Catalog byte limit must be a positive safe integer","INVALID_CATALOG_LIMIT");
  const input=readBoundedFile(path);
  const catalog=new Map<string,{source:ReturnType<typeof sourceDetails>["source"];chunks:ReturnType<typeof sourceDetails>["chunks"]}>();
  const warnings:string[]=[];
  let warningCount=0,omittedWarningCount=0,catalogBytes=0;
  const warn=(message:string)=>{warningCount++;if(warnings.length<MAX_WARNINGS)warnings.push(message);else omittedWarningCount++;};
  for(const source of makeSnapshot(db).sources) {
    const detail=sourceDetails(db,source.id,2000);
    if(detail.stale){warn(`Skipped stale indexed source: ${source.path}`);continue;}
    if(detail.truncated){warn(`Skipped source with an incomplete chunk catalog: ${source.path}`);continue;}
    const sourceBytes=detail.chunks.reduce((sum,chunk)=>sum+Buffer.byteLength(chunk.text,"utf8"),0);
    if(catalogBytes+sourceBytes>maxCatalogBytes)throw new TomeowlError(`Graphify catalog exceeds ${maxCatalogBytes} UTF-8 bytes`,"CATALOG_LIMIT");
    catalog.set(source.path,{source:detail.source,chunks:detail.chunks});
    catalogBytes+=sourceBytes;
  }
  const parsed=parseGraphify(input,catalog,{maxBytes:MAX_BYTES,maxNodes:MAX_NODES,maxEdges:MAX_EDGES});
  const omitted=parsed.warnings.map(x=>x.match(/^Omitted (\d+) additional Graphify warnings\.$/)).find(Boolean);
  const graphifyOmitted=omitted?Number(omitted[1]):0;
  for(const message of parsed.warnings)if(!/^Omitted \d+ additional Graphify warnings\.$/.test(message))warn(message);
  warningCount+=graphifyOmitted;omittedWarningCount+=graphifyOmitted;
  return {counts:{catalogSources:catalog.size,validatedRelations:parsed.relations.length,warnings:warningCount},warnings,omittedWarningCount,relations:parsed.relations};
}
