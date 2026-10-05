import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

export function configuration(args: string[], root: string) {
  const options = new Map<string,string>();
  for(let index=0;index<args.length;index+=2){
    const key=args[index]!,value=args[index+1];
    if(!["--port","--out"].includes(key)||!value||value.startsWith("--")||options.has(key)) throw new Error("Usage: bun scripts/benchmark-visual.ts [--port 4320] [--out data/visual-benchmark.json]");
    options.set(key,value);
  }
  const port=Number(options.get("--port")??4320);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error("Port must be an integer from1024 through65535");
  return {port,output:resolve(root,options.get("--out")??"data/visual-benchmark.json")};
}

export async function assertNewReport(path: string) {
  try {await lstat(path);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}
  throw new Error(`Report already exists; choose a new --out path: ${path}`);
}
