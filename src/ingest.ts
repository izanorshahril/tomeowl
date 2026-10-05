import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { Chunk, Evidence, Locator, Relation, Source, TomeowlError, hash } from "./domain";
import { addRelations, indexedPaths, replaceScope, Staged } from "./store";

export type CollectionInput = { id: string; name: string; root: string };
export type IngestBounds = { db: Database; limit?: number; collections?: CollectionInput[] };
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_CHUNK_CHARS = 1600;
const EXTENSIONS = new Set([".md",".markdown",".mdown",".txt",".rst",".adoc",".ts",".tsx",".js",".jsx",".mjs",".cjs",".py",".rs",".go",".java",".c",".h",".cpp",".hpp",".cs",".html",".css",".json",".yaml",".yml",".toml",".sql",".sh",".ps1"]);
const SKIP_DIRS = new Set(["node_modules","vendor","dist","build","out","target","coverage",".git",".hg",".svn",".cache",".venv","venv","__pycache__","generated","artifacts"]);

type Candidate = { file: string; scope: string; rel: string; collection: string; abs: string };
type Parsed = { chunks: Array<{text:string;locator:Locator}>; links: Array<{target:string;line:number;quote:string}>; kind:"document"|"transcript"; title?:string; url?:string };
type WalkResult = { files: Candidate[]; scope: string; fileRoot: boolean; truncated: boolean; skipped: Record<string,number> };

function safeName(name: string): boolean {
  const low = name.toLowerCase();
  if (name.startsWith(".")) return false;
  if (low.startsWith(".env") || low.endsWith(".pem") || low.endsWith(".key") || low.endsWith(".p12") || low.endsWith(".pfx")) return false;
  if (["id_rsa","id_ed25519","credentials","secrets","secret","private_key"].some(x => low === x || low.startsWith(`${x}.`))) return false;
  return true;
}
function walk(root: string, limit: number): WalkResult {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink()) throw new TomeowlError(`Symbolic link roots are not followed: ${root}`, "INVALID_ROOT");
  const real = realpathSync(root);
  const fileRoot = stat.isFile();
  if (!fileRoot && !stat.isDirectory()) throw new TomeowlError(`Root is not a file or directory: ${root}`, "INVALID_ROOT");
  const scope = fileRoot ? dirname(real) : real;
  const collection = basename(fileRoot ? dirname(real) : real) || "collection";
  const candidates: Candidate[] = [];
  const skipped={hidden:0,symlinks:0,excludedDirectories:0,unsupportedTypes:0,secretNames:0,oversizedFiles:0,redundantTranscriptFiles:0};
  const visit = (file: string) => {
    if (candidates.length >= limit) return;
    const name = basename(file);
    if(["transcript.txt","transcript_timestamped.txt","transcript.srt"].includes(name.toLowerCase())) {
      const canonical=join(dirname(file),"transcript.json");
      try { if(existsSync(canonical)&&lstatSync(canonical).isFile()){skipped.redundantTranscriptFiles++;return;} } catch {}
    }
    const s = lstatSync(file);
    if(s.isSymbolicLink()){skipped.symlinks++;return;}
    if(name.startsWith(".")){skipped.hidden++;return;}
    if(!safeName(name)){skipped.secretNames++;return;}
    if(!EXTENSIONS.has(extname(name).toLowerCase())){skipped.unsupportedTypes++;return;}
    if(!s.isFile())return;
    if(s.size>MAX_FILE_BYTES){skipped.oversizedFiles++;return;}
    const rel = relative(scope,file).split(sep).join("/");
    candidates.push({file,scope,rel,collection,abs:realpathSync(file)});
  };
  if (fileRoot) visit(real);
  else {
    const dirs = [real];
    while (dirs.length && candidates.length < limit) {
      const dir = dirs.pop()!;
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)); }
      catch (e) { throw new TomeowlError(`Cannot read input directory ${dir}: ${String(e)}`, "INPUT_READ"); }
      for (const entry of entries) {
        const path = resolve(dir,entry.name);
        if (entry.isSymbolicLink()){skipped.symlinks++;continue;}
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")){skipped.hidden++;continue;}
          if (SKIP_DIRS.has(entry.name.toLowerCase())){skipped.excludedDirectories++;continue;}
          dirs.push(path);
        } else if (entry.isFile()) visit(path);
        if (candidates.length >= limit) break;
      }
    }
  }
  const files=candidates.sort((a,b) => a.rel.localeCompare(b.rel));
  return {files,scope,fileRoot,truncated:candidates.length>=limit,skipped};
}

function timestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value / 1000 : value;
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return timestamp(Number(s));
  const match = s.match(/^(?:(\d+):)?([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/);
  if (match) return Number(match[1] ?? 0)*3600 + Number(match[2])*60 + Number(match[3]);
  const date = Date.parse(s);
  return Number.isFinite(date) ? date / 1000 : undefined;
}
function parseTranscript(value: unknown): Array<{text:string;time?:number;end?:number}> {
  let rows: unknown[] | undefined;
  if (Array.isArray(value)) rows=value;
  else if (value && typeof value === "object") {
    const obj=value as Record<string,unknown>;
    for (const key of ["messages","transcript","utterances","segments","snippets","items","events","data"]) if (Array.isArray(obj[key])) { rows=obj[key] as unknown[]; break; }
  }
  if (!rows) throw new TomeowlError("transcript.json has no messages, transcript, utterances, segments, snippets, items, events, or data array", "INVALID_TRANSCRIPT");
  const out: Array<{text:string;time?:number}> = [];
  for (const row of rows) {
    if (typeof row === "string") { const text=row.trim(); if(text) out.push({text}); continue; }
    if (!row || typeof row !== "object") continue;
    const r=row as Record<string,unknown>;
    const body=[r.text,r.message,r.body,r.content,r.transcript].find(x => typeof x === "string") as string|undefined;
    if (!body?.trim()) continue;
    const speaker=[r.speaker,r.sender,r.author,r.from,r.name].find(x => typeof x === "string") as string|undefined;
    const text=speaker ? `${speaker}: ${body.trim()}` : body.trim();
    const time=timestamp(r.startSeconds ?? r.start_seconds ?? r.start ?? r.timestamp ?? r.time ?? r.createdAt);
    const end=timestamp(r.endSeconds ?? r.end_seconds ?? r.end) ?? (time !== undefined && typeof r.duration === "number" ? time+r.duration : undefined);
    out.push({text,...(time === undefined ? {} : {time}),...(end === undefined ? {} : {end})});
  }
  if (!out.length) throw new TomeowlError("transcript.json contains no readable message text", "INVALID_TRANSCRIPT");
  return out;
}
function chunkLines(text: string): Parsed {
  const lines=text.split(/\r?\n/); while(lines.length&&lines.at(-1)==="")lines.pop(); const chunks:Parsed["chunks"]=[];
  let piece:string[]=[], start=1, chars=0;
  const flush=(end:number) => { if(piece.length) chunks.push({text:piece.join("\n"),locator:{lineStart:start,lineEnd:end}}); piece=[]; chars=0; };
  for(let i=0;i<lines.length;i++) {
    let line=lines[i];
    while(line.length>MAX_CHUNK_CHARS) {
      if(chars===0) start=i+1;
      const take=MAX_CHUNK_CHARS-chars;
      piece.push(line.slice(0,take)); line=line.slice(take); chars+=take;
      flush(i+1); start=i+1;
    }
    if(chars+line.length+1>MAX_CHUNK_CHARS) flush(i);
    if(chars===0) start=i+1;
    piece.push(line); chars+=line.length+1;
  }
  flush(lines.length);
  const links:Array<{target:string;line:number;quote:string}> = [];
  for(let i=0;i<lines.length;i++) for(const m of lines[i].matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\)/g)) {
    let target=m[1].trim().replace(/^<|>$/g,"").split(/[?#]/,1)[0];
    try { target=decodeURIComponent(target); } catch { continue; }
    const windowsPath=/^[a-z]:[\\/]/i.test(target);
    if(target && (windowsPath || !/^(?:[a-z]+:|\/\/|#)/i.test(target))) links.push({target,line:i+1,quote:lines[i].slice(0,300)});
  }
  return {chunks,links,kind:"document"};
}
function parseFile(file: string, content: string): Parsed {
  if(basename(file).toLowerCase()==="transcript.json") {
    let value:unknown;
    try { value=JSON.parse(content); } catch { throw new TomeowlError("transcript.json is not valid JSON", "INVALID_TRANSCRIPT"); }
    const records=parseTranscript(value); const chunks:Parsed["chunks"]=[];
    let items:typeof records=[]; let chars=0;
    const flush=()=>{ if(!items.length)return; const starts=items.map(x=>x.time).filter((x):x is number=>x!==undefined); const ends=items.map(x=>x.end).filter((x):x is number=>x!==undefined); chunks.push({text:items.map(x=>x.text).join("\n"),locator:starts.length?{startSeconds:starts[0],endSeconds:ends.at(-1)??starts.at(-1)}:{}}); items=[];chars=0; };
    for(const item of records) { if(chars+item.text.length>MAX_CHUNK_CHARS)flush(); items.push(item);chars+=item.text.length+1; } flush();
    const metadata=value&&typeof value==="object"?value as Record<string,unknown>:{ };
    const title=typeof metadata.title==="string"?metadata.title.trim().slice(0,250):"";
    let url:string|undefined;
    if(typeof metadata.url==="string")try{const parsed=new URL(metadata.url);if(parsed.protocol==="https:"||parsed.protocol==="http:")url=parsed.href;}catch{}
    return {chunks,links:[],kind:"transcript",...(title?{title:`${title}${metadata.is_generated===true?" (auto-generated captions)":""}`} :{}),...(url?{url}:{})};
  }
  return chunkLines(content);
}

export function ingest(root: string | string[], bounds: IngestBounds): {
  scopes:number;files:number;chunks:number;added:number;updated:number;unchanged:number;removed:number;
  skipped:Record<string,number>;
  coverage:{completeScopes:number;partialScopes:number;fileSelections:number;unvisitedRoots:number};
} {
  const roots=Array.isArray(root)?root:[root];
  if(bounds.collections!==undefined&&roots.length)throw new TomeowlError("Collection manifests cannot be combined with explicit roots", "COLLECTION_CONFLICT");
  const collectionIds=new Set<string>();
  if(bounds.collections!==undefined) {
    if(!Array.isArray(bounds.collections)||!bounds.collections.length||bounds.collections.length>64)throw new TomeowlError("Supply between 1 and 64 collections", "INVALID_COLLECTION");
    for(const collection of bounds.collections) {
      if(!collection||typeof collection.id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(collection.id))throw new TomeowlError("Collection id must contain 1 to 200 ASCII letters, digits, dots, underscores or hyphens", "INVALID_COLLECTION");
      if(typeof collection.name!=="string"||!collection.name.trim()||collection.name.length>200||collection.name.includes("\0"))throw new TomeowlError("Collection name must contain 1 to 200 characters", "INVALID_COLLECTION");
      if(typeof collection.root!=="string"||!collection.root.trim()||collection.root.includes("\0"))throw new TomeowlError("Collection root must be a directory path", "INVALID_COLLECTION");
      if(collectionIds.has(collection.id))throw new TomeowlError(`Duplicate collection id: ${collection.id}`, "COLLECTION_CONFLICT");
      collectionIds.add(collection.id);
    }
  }
  const inputs: Array<{input:string;collection?:CollectionInput}>=bounds.collections
    ? bounds.collections.map(collection=>({input:collection.root,collection}))
    : roots.map(input=>({input}));
  if(!inputs.length)throw new TomeowlError("At least one --root is required", "INVALID_ROOT");
  const limit=bounds.limit??500;
  if(!Number.isInteger(limit)||limit<1||limit>10000)throw new TomeowlError("limit must be an integer from 1 to 10000", "INVALID_LIMIT");
  let total=0, byteCount=0,fileSelections=0,unvisitedRoots=0;
  const diagnostics={hidden:0,symlinks:0,excludedDirectories:0,unsupportedTypes:0,secretNames:0,oversizedFiles:0,redundantTranscriptFiles:0};
  const seenAbs=new Map<string,string>();
  const seenLogical=new Map<string,string>();
  const grouped=new Map<string,Array<{staged:Staged;candidate:Candidate;links:Parsed["links"]}>>();
  const pruneScope=new Map<string,boolean>();
  const pathKey=(path:string)=>process.platform==="win32"?path.toLowerCase():path;
  const allPaths=new Map([...indexedPaths(bounds.db)].map(([path,id])=>[pathKey(path),id]));
  for(const {input,collection} of inputs) {
    const slots=Math.max(0,limit-total);
    if(!slots) {unvisitedRoots++;continue;}
    const walked=walk(resolve(input),slots);const files=walked.files;
    if(collection&&walked.fileRoot)throw new TomeowlError(`Collection root must be a directory: ${input}`, "INVALID_COLLECTION");
    const ownerScope=collection?`collection:${collection.id}`:walked.scope;
    if(walked.fileRoot)fileSelections++;
    for(const key of Object.keys(diagnostics) as Array<keyof typeof diagnostics>)diagnostics[key]+=walked.skipped[key];
    // Only a completely observed directory authorizes removal of unseen sources.
    // A selected file has no authority over siblings, even when they share a scope.
    if(!walked.fileRoot) {
      if(!grouped.has(ownerScope))grouped.set(ownerScope,[]);
      const complete=!walked.truncated && Object.values(walked.skipped).every(count=>count===0);
      pruneScope.set(ownerScope,(pruneScope.get(ownerScope)??true)&&complete);
    }
    for(const candidate of files) {
      if(collection) {candidate.scope=ownerScope;candidate.collection=collection.name;}
      const identity=process.platform==="win32"?candidate.abs.toLowerCase():candidate.abs;
      const logical=candidate.rel.replace(/[A-Z]/g,character=>character.toLowerCase());
      const physicalId=allPaths.get(pathKey(candidate.abs));
      const id=collection
        ? hash(`collection\0${collection.id}\0${logical}`).slice(0,32)
        : walked.fileRoot&&physicalId?physicalId:hash(identity).slice(0,32);
      if(physicalId&&physicalId!==id)throw new TomeowlError(`Physical path is already indexed under a different collection identity: ${candidate.abs}`, "COLLECTION_CONFLICT");
      const previousLogical=seenLogical.get(id);
      if(previousLogical&&pathKey(previousLogical)!==pathKey(candidate.abs))throw new TomeowlError(`Portable logical paths collide after ASCII case normalization: ${candidate.rel}`, "COLLECTION_CONFLICT");
      seenLogical.set(id,candidate.abs);
      const prior=bounds.db.query("SELECT scope,collection FROM sources WHERE id=?").get(id) as {scope:string;collection:string}|null;
      // Selection through a narrower file root keeps its existing directory owner.
      if(walked.fileRoot&&prior) {candidate.scope=prior.scope;candidate.collection=prior.collection;}
      const previousScope=seenAbs.get(pathKey(candidate.abs));
      if(previousScope&&previousScope!==candidate.scope)throw new TomeowlError(`Overlapping roots assign ${candidate.abs} to different scopes`,"SCOPE_CONFLICT");
      if(previousScope)continue;seenAbs.set(pathKey(candidate.abs),candidate.scope);
      const stat=statSync(candidate.file); total++;byteCount+=stat.size;
      if(byteCount>MAX_TOTAL_BYTES)throw new TomeowlError("Input exceeds 64 MiB per ingest", "INPUT_TOO_LARGE");
      const content=readFileSync(candidate.file,"utf8");
      const parsed=parseFile(candidate.file,content);const revision=hash(content);
      const source:Source={id,title:parsed.title??basename(candidate.file),path:candidate.abs,collection:candidate.collection,kind:parsed.kind,revision,chunkCount:parsed.chunks.length,scope:candidate.scope,...(parsed.url?{url:parsed.url}:{})};
      const chunks:Chunk[]=parsed.chunks.map((part,ordinal)=>({id:hash(`${id}\0${revision}\0${ordinal}`).slice(0,32),sourceId:id,revision,text:part.text,locator:part.locator,ordinal}));
      const row={staged:{source,chunks},candidate,links:parsed.links};
      const list=grouped.get(candidate.scope)??[];list.push(row);grouped.set(candidate.scope,list);
    }
  }
  const owners=new Map<string,string>();
  for(const rows of grouped.values())for(const row of rows) {
    const scope=owners.get(row.staged.source.id);
    if(scope&&scope!==row.candidate.scope)throw new TomeowlError(`Indexed source belongs to a different root scope: ${row.candidate.abs}`,"SCOPE_CONFLICT");
    owners.set(row.staged.source.id,row.candidate.scope);
    const prior=bounds.db.query("SELECT scope FROM sources WHERE id=?").get(row.staged.source.id) as {scope:string}|null;
    if(prior&&prior.scope!==row.candidate.scope)throw new TomeowlError(`Indexed source belongs to a different root scope: ${row.candidate.abs}`,"SCOPE_CONFLICT");
  }
  const fileIds=new Map<string,string>();
  for(const rows of grouped.values())for(const row of rows)fileIds.set(pathKey(row.candidate.abs),row.staged.source.id);
  const relations:Relation[]=[];
  for(const rows of grouped.values())for(const row of rows)for(const link of row.links) {
    const targetPath=resolve(dirname(row.candidate.abs),link.target);
    const targetId=fileIds.get(pathKey(targetPath))??allPaths.get(pathKey(targetPath));
    if(!targetId||targetId===row.staged.source.id)continue;
    const chunk=row.staged.chunks.find(c=>c.locator.lineStart!==undefined&&c.locator.lineStart<=link.line&&c.locator.lineEnd! >= link.line);
    if(!chunk)continue;
    const evidence:Evidence={sourceId:row.staged.source.id,revision:row.staged.source.revision,chunkId:chunk.id,quote:link.quote,locator:{lineStart:link.line,lineEnd:link.line}};
    relations.push({id:hash(`${row.staged.source.id}\0${targetId}\0${chunk.id}\0${link.target}`).slice(0,32),source:row.staged.source.id,target:targetId,kind:"references",basis:"structural",evidence:[evidence]});
  }
  let added=0,updated=0,unchanged=0,removed=0;
  bounds.db.transaction(()=>{
    for(const [scope,rows] of grouped) {
      const result=replaceScope(bounds.db,scope,rows.map(x=>x.staged),[],pruneScope.get(scope)??false);
      added+=result.added;updated+=result.updated;unchanged+=result.unchanged;removed+=result.removed;
    }
    addRelations(bounds.db,relations);
  })();
  const completeScopes=[...pruneScope.values()].filter(Boolean).length;
  return {scopes:grouped.size,files:total,chunks:[...grouped.values()].flat().reduce((n,x)=>n+x.staged.chunks.length,0),added,updated,unchanged,removed,skipped:diagnostics,
    coverage:{completeScopes,partialScopes:pruneScope.size-completeScopes,fileSelections,unvisitedRoots}};
}
