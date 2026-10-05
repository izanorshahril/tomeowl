import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "../src/ingest";
import { repositoryMap } from "../src/repomap";
import { openStore } from "../src/store";

const directories:string[]=[];
const databases:ReturnType<typeof openStore>[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),"tomeowl-repomap-"));directories.push(directory);
  const root=join(directory,"project");mkdirSync(root);
  const db=openStore(join(directory,"catalog.sqlite"));databases.push(db);
  return {directory,root,db};
}

describe("native module map",()=>{
  test("actual Bun scanner records JS/TS import and export syntax with honest missing type coverage",()=>{
    const {root,db}=fixture();
    writeFileSync(join(root,"main.ts"),"import { value } from './dependency.js';\nimport type { Shape } from './types';\nexport { value };\nexport const main = () => import('./lazy');\n");
    writeFileSync(join(root,"dependency.ts"),"export const value = 1;\n");
    writeFileSync(join(root,"lazy.js"),"export default 42;\n");
    writeFileSync(join(root,"types.ts"),"export type Shape = { value: number };\n");
    ingest(root,{db});const packet=repositoryMap(db);const main=packet.modules.find(module=>module.path.endsWith("main.ts"))!;
    expect(main.status).toBe("scanned");expect(main.exports).toEqual(["main","value"]);
    expect(main.imports.map(item=>item.specifier)).toEqual(["./dependency.js","./lazy"]);
    expect(main.imports.every(item=>item.resolution==="indexed-relative"&&!!item.targetId)).toBe(true);
    expect(packet.omissions).toContain("type-only-imports-and-exports");
    expect(packet.modules.find(module=>module.path.endsWith("types.ts"))!.exports).toEqual([]);
    expect(packet.omissions).toContain("runtime-call-resolution");
    expect(repositoryMap(db)).toEqual(packet);
  });

  test("query relevance ranks scanned export names and input inventory deterministically",()=>{
    const {root,db}=fixture();
    writeFileSync(join(root,"a.ts"),"export const unrelated = 1;\n");
    writeFileSync(join(root,"z.ts"),"export function SelectedCapability() { return 2; }\n");
    ingest(root,{db});
    const packet=repositoryMap(db,{query:"SelectedCapability"});
    expect(packet.modules[0].path).toBe(join(root,"z.ts"));expect(packet.modules[0].relevance).toBeGreaterThan(0);
    expect(repositoryMap(db,{query:"SelectedCapability"})).toEqual(packet);
    const capped=repositoryMap(db,{query:"SelectedCapability",limit:1});
    expect(capped.modules).toHaveLength(1);expect(capped.modules[0].path).toBe(join(root,"z.ts"));
    expect(capped.truncated).toBe(true);expect(capped.omissions).toContain("file-limit");
  });

  test("relative import resolution cannot expose targets outside the requested path scope",()=>{
    const {root,db}=fixture();const inside=join(root,"inside");mkdirSync(inside);
    writeFileSync(join(inside,"main.ts"),"import { local } from './local';\nimport { external } from '../outside';\nimport packageName from 'package-name';\nexport { local, external, packageName };\n");
    writeFileSync(join(inside,"local.ts"),"export const local = 1;\n");
    writeFileSync(join(root,"outside.ts"),"export const external = 2;\n");
    ingest(root,{db});const packet=repositoryMap(db,{path:inside});
    expect(packet.modules).toHaveLength(2);expect(packet.modules.every(module=>module.path.startsWith(inside))).toBe(true);
    const imports=packet.modules.find(module=>module.path.endsWith("main.ts"))!.imports;
    expect(imports.find(item=>item.specifier==="./local")?.resolution).toBe("indexed-relative");
    expect(imports.find(item=>item.specifier==="../outside")).toEqual({specifier:"../outside",kind:"import-statement",resolution:"unresolved-relative"});
    expect(imports.find(item=>item.specifier==="package-name")?.resolution).toBe("external-or-alias");
  });

  test("split long lines and malformed indexed syntax are reported without inventing a structure",()=>{
    const {root,db}=fixture();
    writeFileSync(join(root,"long.ts"),`export const longValue = '${"x".repeat(4000)}';\n`);
    writeFileSync(join(root,"broken.ts"),"export const = ;\n");
    ingest(root,{db});const packet=repositoryMap(db);
    expect(packet.modules.find(module=>module.path.endsWith("long.ts"))?.status).toBe("unsupported-chunks");
    expect(packet.modules.find(module=>module.path.endsWith("broken.ts"))?.status).toBe("parse-error");
    expect(packet.truncated).toBe(true);expect(packet.omissions).toContain("unsupported-chunks");
  });

  test("serialized byte limits include the success envelope and final newline",()=>{
    const {root,db}=fixture();for(let i=0;i<12;i++)writeFileSync(join(root,`module-${i}.ts`),`export const value${i} = ${i};\n`);
    ingest(root,{db});const packet=repositoryMap(db,{maxBytes:1024});
    const actual=Buffer.byteLength(JSON.stringify({ok:true,...packet})+"\n");
    expect(actual).toBe(packet.used.bytes);expect(actual).toBeLessThanOrEqual(1024);
    expect(packet.truncated).toBe(true);expect(packet.omissions).toContain("byte-limit");
    expect(()=>repositoryMap(db,{maxBytes:511})).toThrow();
    expect(()=>repositoryMap(db,{limit:0})).toThrow();
  });
});
