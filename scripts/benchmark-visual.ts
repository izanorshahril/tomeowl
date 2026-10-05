import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assertNewReport, configuration } from "./benchmarks/visual/config";

const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),directory=resolve(root,"scripts/benchmarks/visual");
let settings: ReturnType<typeof configuration>;
try {settings=configuration(process.argv.slice(2),root);}catch(error){console.error((error as Error).message);process.exit(2);}
const {port,output}=settings;
try {await assertNewReport(output);}catch(error){console.error((error as Error).message);process.exit(1);}
const built=await Bun.build({entrypoints:[resolve(directory,"browser.ts")],target:"browser",outdir:resolve(directory,"build"),naming:{entry:"[name].js",chunk:"[name]-[hash].js"},splitting:true,minify:true,sourcemap:"none"});
if(!built.success){console.error("Benchmark build failed. Install isolated pins with bun install --ignore-scripts in scripts/benchmarks/visual.");for(const log of built.logs)console.error(log);process.exit(1);}
const hashes=Object.fromEntries(await Promise.all(["reference-scene.ts","reference-geometry.ts","motion.ts","relationship-focus.ts","state.ts","projection.ts","types.ts","viewer.css"].map(async file=>[file,createHash("sha256").update(await readFile(resolve(root,"src/viewer",file))).digest("hex")])));
const harnessPaths=["scripts/benchmark-visual.ts",...["browser.ts","shared.ts","config.ts","tomeowl.ts","three.ts","cytoscape.ts","index.html","package.json","bun.lock"].map(file=>`scripts/benchmarks/visual/${file}`)];
const harnessHashes=Object.fromEntries(await Promise.all(harnessPaths.map(async file=>[file,createHash("sha256").update(await readFile(resolve(root,file))).digest("hex")])));
await mkdir(dirname(output),{recursive:true});
const files=new Map(built.outputs.map(file=>[`/${file.path.split(/[\\/]/).at(-1)}`,file]));
const bundles=await Promise.all(built.outputs.map(async file=>({file:file.path.split(/[\\/]/).at(-1)!,bytes:file.size,sha256:createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex")})));
const bundleBytes=bundles.reduce((sum,file)=>sum+file.bytes,0);
const origin=`http://127.0.0.1:${port}`;
let claimedReport=false;
const server=Bun.serve({hostname:"127.0.0.1",port,maxRequestBodySize:8*1024*1024,async fetch(request){
  const url=new URL(request.url);
  if(request.method==="POST"&&url.pathname==="/report"){
    if(request.headers.get("origin")!==origin)return new Response("Same-origin request required",{status:403});
    let body:any;try{body=await request.json();}catch{return new Response("Invalid JSON",{status:400});}
    if(body?.benchmark!=="tomeowl-visual-v1"||!Array.isArray(body.rows)||body.rows.length>45)return new Response("Invalid bounded report",{status:400});
    const content=JSON.stringify({...body,cli:{bun:Bun.version,sourceSha256:hashes,harnessSha256:harnessHashes,bundleBytes,bundles,bundleScope:"Built JS chunks for the benchmark page, excluding CSS. Per-chunk bytes are transfer artifacts, not standalone renderer deployment or memory footprints."}},null,2)+"\n";
    try {await writeFile(output,content,{flag:claimedReport?"w":"wx"});claimedReport=true;}catch(error){console.error((error as Error).message);return new Response("Report could not be written without overwriting an existing file",{status:409});}
    return Response.json({saved:true,rows:body.rows.length});
  }
  if(request.method!=="GET")return new Response("Method not allowed",{status:405});
  if(url.pathname==="/")return new Response(Bun.file(resolve(directory,"index.html")),{headers:{"content-type":"text/html"}});
  if(url.pathname==="/viewer.css")return new Response(Bun.file(resolve(root,"src/viewer/viewer.css")),{headers:{"content-type":"text/css"}});
  if(url.pathname==="/report")return new Response(Bun.file(output),{headers:{"content-type":"application/json"}});
  const file=files.get(url.pathname);return file?new Response(file,{headers:{"content-type":"text/javascript"}}):new Response("Not found",{status:404});
}});
console.error(JSON.stringify({url:origin,autorun:`${origin}/?autorun=1`,report:output,sourceSha256:hashes,harnessSha256:harnessHashes,bundleBytes,bundles}));
process.on("SIGINT",()=>{server.stop(true);process.exit(0);});
