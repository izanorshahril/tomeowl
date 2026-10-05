import { join, resolve } from "node:path";
import { TomeowlError } from "../src/domain";
import { exportLibraryView, finalizeLibrary, importLibrary, libraryDefaults } from "../src/adapters/viberaven-library";

function argumentsOf(args: string[], allowed: string[]) {
  const flags=new Map<string,string>();
  for(let i=0;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!allowed.includes(flag!)||!value||value.startsWith("--")||flags.has(flag!))throw new TomeowlError(`Invalid arguments. Supported flags: ${allowed.join(" ")}`,"INVALID_ARGUMENT");
    flags.set(flag!,value);
  }
  return flags;
}
const integer=(flags:Map<string,string>,name:string,fallback:number)=>{
  const raw=flags.get(name);if(raw===undefined)return fallback;
  if(!/^\d+$/.test(raw))throw new TomeowlError(`${name} must be a non-negative integer`,"INVALID_ARGUMENT");
  const value=Number(raw);if(!Number.isSafeInteger(value))throw new TomeowlError(`${name} is outside the safe integer range`,"INVALID_ARGUMENT");return value;
};

if(import.meta.main){
  try{
    const [command,...rest]=Bun.argv.slice(2);
    if(command==="--help"||command==="help"||rest.includes("--help")){
      process.stdout.write(JSON.stringify({ok:true,commands:[
        {name:"import",usage:"import --database PATH [--root PATH] --out NEW_DIR [--max-artifact-bytes N] [--max-cues N] [--lexical-candidates N]"},
        {name:"export",usage:"export --database PATH --out NEW_DIR [--video-id ID | --channel-url URL] [--limit 400] [--offset N]"},
        {name:"finalize",usage:"finalize --database SOURCE_DB --library-db LIBRARY_DB [--root RAW_ARCHIVE] [--max-artifact-bytes N] [--max-cues N] [--lexical-candidates N]"}
      ],defaults:{database:libraryDefaults.database,maxArtifactBytes:libraryDefaults.maxArtifactBytes,maxCues:libraryDefaults.maxCues,viewLimit:libraryDefaults.limit}})+"\n");
      process.exit(0);
    }
    if(command==="import"){
      const flags=argumentsOf(rest,["--database","--root","--out","--max-artifact-bytes","--max-cues","--lexical-candidates"]);
      const result=await importLibrary({database:resolve(flags.get("--database")??libraryDefaults.database),...(flags.has("--root")?{root:resolve(flags.get("--root")!)}:{}),output:resolve(flags.get("--out")??"data/viberaven-library"),maxArtifactBytes:integer(flags,"--max-artifact-bytes",libraryDefaults.maxArtifactBytes),maxCues:integer(flags,"--max-cues",libraryDefaults.maxCues),lexicalCandidates:integer(flags,"--lexical-candidates",40)});
      process.stdout.write(JSON.stringify({ok:true,database:result.database,coverage:result.coverage,provenance:result.provenance})+"\n");
    }else if(command==="export"){
      const flags=argumentsOf(rest,["--database","--out","--video-id","--channel-url","--limit","--offset"]);
      const result=await exportLibraryView({database:resolve(flags.get("--database")??join("data","viberaven-library","videos.sqlite")),output:resolve(flags.get("--out")??"data/viberaven-library-view"),...(flags.has("--video-id")?{videoId:flags.get("--video-id")} : {}),...(flags.has("--channel-url")?{channelUrl:flags.get("--channel-url")} : {}),limit:integer(flags,"--limit",libraryDefaults.limit),offset:integer(flags,"--offset",0)});
      process.stdout.write(JSON.stringify({ok:true,snapshot:result.snapshotPath,html:result.htmlPath,view:result.view,stats:result.snapshot.stats,links:result.links})+"\n");
    }else if(command==="finalize"){
      const flags=argumentsOf(rest,["--database","--library-db","--root","--max-artifact-bytes","--max-cues","--lexical-candidates"]);
      if(!flags.has("--database")||!flags.has("--library-db"))throw new TomeowlError("finalize requires --database and --library-db","INVALID_ARGUMENT");
      const result=await finalizeLibrary({database:resolve(flags.get("--database")!),libraryDatabase:resolve(flags.get("--library-db")!),...(flags.has("--root")?{root:resolve(flags.get("--root")!)}:{}),maxArtifactBytes:integer(flags,"--max-artifact-bytes",libraryDefaults.maxArtifactBytes),maxCues:integer(flags,"--max-cues",libraryDefaults.maxCues),lexicalCandidates:integer(flags,"--lexical-candidates",40)});
      process.stdout.write(JSON.stringify({ok:true,database:result.database,coverage:result.coverage,provenance:result.provenance})+"\n");
    }else{
      throw new TomeowlError("Use `import --database PATH [--root PATH] --out NEW_DIR`, `export --database PATH --out NEW_DIR [--video-id ID | --channel-url URL]`, or `finalize --database SOURCE_DB --library-db LIBRARY_DB [--root RAW_ARCHIVE]`","INVALID_ARGUMENT");
    }
  }catch(error){
    process.stderr.write(JSON.stringify({error:{code:error instanceof TomeowlError?error.code:"VIBERAVEN_LIBRARY_ERROR",message:error instanceof Error?error.message:String(error)}})+"\n");process.exitCode=1;
  }
}
