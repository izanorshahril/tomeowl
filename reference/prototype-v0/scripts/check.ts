import { map, search } from '../src/core';
import { renderHtml } from '../src/cli';
import { resolve } from 'node:path';

const graph = await map(resolve('prototype-data/prototype.sqlite'));
function check(ok: unknown, message: string) { if (!ok) throw Error(message); }
check(graph.schemaVersion === 1,'Versioned graph missing');
check(graph.nodes.some(n => n.id.includes('VoKiKvgpk78')),'Reference video absent');
const ids = new Set(graph.nodes.map(n=>n.id));
check(ids.size === graph.nodes.length,'Duplicate graph IDs');
check(graph.edges.every(e=>ids.has(e.source)&&ids.has(e.target)),'Dangling relationship');
check(graph.edges.every(e=>e.evidence?.length),'Relationship missing evidence');
check(graph.nodes.filter(n=>n.kind==='project').length>=3,'Expected three project sources');
const hits = await search(resolve('prototype-data/prototype.sqlite'),'qmd',10);
check((Array.isArray(hits)?hits:(hits as any).results)?.length>0,'SQLite exact-topic search returned no evidence');
const html=renderHtml({schemaVersion:1,nodes:[{id:'x',label:'</script><script>alert(1)</script>',kind:'video'}],edges:[],warnings:[]});
check(!html.includes('"label":"</script>'),'HTML script terminator injection');
console.log(JSON.stringify({status:'passed',nodes:graph.nodes.length,edges:graph.edges.length,checks:['reference video','graph integrity','source evidence','three projects','SQLite retrieval','HTML escaping']}));
