import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';

export async function importGraphify(graph: any, artifactPath: string, root: string) {
  if ((await stat(artifactPath)).size > 25 * 1024 * 1024) throw Error('Graphify artifact exceeds 25 MB');
  const raw = JSON.parse(await readFile(artifactPath, 'utf8'));
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.links || raw.edges)) throw Error('Expected Graphify nodes and links arrays');
  const nodes = raw.nodes.slice(0,80), ids = new Set(nodes.map((n: any) => n.id)), base = resolve(root);
  const location = (n: any) => {
    if (typeof n.source_file !== 'string' || isAbsolute(n.source_file)) return null;
    const path = resolve(base,n.source_file), rel = relative(base,path);
    return rel.startsWith('..') || isAbsolute(rel) ? null : path;
  };
  for (const n of nodes) graph.nodes.push({ id: 'graphify:'+n.id, label: String(n.label || n.id), kind: 'document', group: 'Graphify snapshot (revision unverified)', source: location(n), summary: `Imported ${n._origin || 'unknown'} node; source ${n.source_location || 'location unavailable'}. Graph snapshot has not been regenerated.` });
  for (const [i,e] of (raw.links || raw.edges).entries()) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const origin = nodes.find((n: any) => n.id === e.source);
    graph.edges.push({ id: 'graphify:edge:'+i, source: 'graphify:'+e.source, target: 'graphify:'+e.target, kind: 'imported '+String(e.relation || e.type || 'relationship')+' (unverified revision)', evidence: [{ path: location(origin) || artifactPath, line: Number(String(origin?.source_location || '').replace(/^L/,'')) || undefined, text: `Graphify artifact reports this relationship. Confidence: ${e.confidence ?? 'not supplied'}. Verify current source before using it.` }] });
  }
  graph.warnings.push('Graphify snapshot imported with unverified revision; first 80 nodes only. Existing checkout marker is stale.');
  graph.stats = { ...graph.stats, graphifyNodes: nodes.length, nodes: graph.nodes.length, edges: graph.edges.length };
  if (graph.stats.byKind) graph.stats.byKind = { ...graph.stats.byKind, document: (graph.stats.byKind.document || 0) + nodes.length };
  return graph;
}

export async function projectForQmd(graph: any, directory: string) {
  await mkdir(directory,{recursive:true});
  let count=0;
  for (const n of graph.nodes.filter((n:any)=>n.kind==='video'||n.kind==='project'||n.kind==='document')) {
    const evidence = graph.edges.filter((e:any)=>e.source===n.id||e.target===n.id).flatMap((e:any)=>(e.evidence||[]).map((v:any)=>({relation:e.kind,...v})));
    const body = [`# ${String(n.label).replace(/\r?\n/g,' ')}`, `Source: ${typeof n.source==='string'?n.source:''}`, `URL: ${n.url||''}`, '', n.summary||n.excerpt||'', ...evidence.slice(0,50).flatMap((e:any)=>[`\n## ${e.relation} at ${e.start??'unknown'} seconds`,e.text||'',`Citation: ${e.path||''}${e.line?':'+e.line:''}`])].join('\n');
    const filename = String(n.id).replace(/[^a-zA-Z0-9_-]/g,'_')+'.md';
    await writeFile(join(directory,filename),body);count++;
  }
  return { directory,count,note:'Derived evidence projection, not complete transcripts. Raw source JSON remains authoritative.' };
}
