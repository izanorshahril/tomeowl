import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { ingest, search, map } from './core';
import viewer from './viewer.html' with { type: 'text' };
import { importGraphify, projectForQmd } from './adapters';

const usage = `Tomeowl prototype - local evidence maps
Commands:
  demo     Import RoboNuggets transcripts + 3 project READMEs and export a map
  ingest   --transcripts PATH [--limit 40] [--project PATH repeated]
  search   --query TEXT [--limit 10]
  export   [--out prototype-data/map.html] [--json prototype-data/map.json]
           [--graphfile PATH --root PROJECT_ROOT] (unverified imported snapshot)
  project  --out DIRECTORY (write a derived Markdown evidence corpus for qmd)
  serve    [--port 4317] (loopback only; foreground)
  doctor   Inspect optional external adapters without starting them
  adapter  --tool qmd|gbrain|graphify --query TEXT (explicit external execution)
Common: --db PATH (default prototype-data/prototype.sqlite), --help
All commands return JSON; diagnostics go to stderr. External tools are optional.
`;

function options(args: string[]) {
  const parsed: Record<string, string[]> = {};
  const allowed = new Set(['db', 'transcripts', 'limit', 'project', 'out', 'json', 'query', 'port', 'tool', 'graphfile', 'root']);
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--') || !allowed.has(args[i].slice(2))) throw Error(`Unknown argument: ${args[i]}`);
    const key = args[i].slice(2), value = args[++i];
    if (value === undefined || value.startsWith('--')) throw Error(`Missing value for --${key}`);
    if (parsed[key] && key !== 'project') throw Error(`Repeated --${key}`);
    (parsed[key] ??= []).push(value);
  }
  return parsed;
}
function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error(`Expected integer ${min}..${max}, received ${value}`);
  return n;
}
export function renderHtml(graph: unknown) {
  return viewer.replace('__TOMEOWL_DATA__', JSON.stringify(graph).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));
}
async function save(path: string, text: string) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text); }
const output = (result: unknown) => console.log(JSON.stringify(result, null, 2));
async function boundedText(stream: ReadableStream<Uint8Array>, maxBytes: number, stop: () => void) {
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size=0,truncated=false;
  for (;;) { const {done,value}=await reader.read();if(done)break;const remaining=maxBytes-size;if(value.length>remaining){chunks.push(value.slice(0,remaining));size=maxBytes;truncated=true;stop();break}chunks.push(value);size+=value.length; }
  if(truncated)await reader.cancel().catch(()=>{});
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return {text:new TextDecoder().decode(bytes),truncated};
}

async function main() {
  const [command = 'help', ...args] = Bun.argv.slice(2);
  if (command === 'help' || command === '--help' || args.includes('--help')) { console.log(usage); return; }
  const opts = options(args), get = (key: string) => opts[key]?.[0];
  const dbPath = resolve(get('db') || 'prototype-data/prototype.sqlite');
  if (command === 'doctor') {
    output({ core: { bun: Bun.version, sqlite: 'embedded', networkRequired: false }, adapters: ['qmd', 'gbrain', 'graphify'].map(name => ({ name, executable: Bun.which(name), required: false })), deployment: 'Compiled core and viewer work alone. External adapters retain their own dependencies.' }); return;
  }
  if (command === 'adapter') {
    const tool = get('tool'), query = get('query');
    if (!tool || !['qmd', 'gbrain', 'graphify'].includes(tool) || !query) throw Error('adapter requires --tool qmd|gbrain|graphify and --query TEXT');
    const exe = Bun.which(tool); if (!exe) throw Error(`${tool} does not resolve in PATH. Core search still works; configure the optional tool separately.`);
    const toolArgs = tool === 'qmd' ? ['search', query, '--format', 'json', '-n', '10'] : tool === 'gbrain' ? ['search', query] : ['query', query];
    const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|HOME|LANG|TERM|QMD_[A-Z_]+)$/i.test(key))) as Record<string,string>;
    const qmdEntry = join(dirname(exe),'..','install','global','node_modules','@tobilu','qmd','dist','cli','qmd.js');
    const bunExe = Bun.which('bun');
    const invocation = process.platform==='win32' && tool==='qmd' && bunExe && existsSync(qmdEntry) ? [bunExe,qmdEntry,...toolArgs] : [exe,...toolArgs];
    const proc = Bun.spawn(invocation, { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', env: safeEnv });
    const timer = setTimeout(() => proc.kill(), 30000);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([boundedText(proc.stdout,100000,()=>proc.kill()), boundedText(proc.stderr,10000,()=>proc.kill()), proc.exited]);
      output({ tool, args: toolArgs, exitCode, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated||stderr.truncated });
      if (exitCode !== 0) process.exitCode = 1;
    } finally { clearTimeout(timer); }
    return;
  }
  if (command === 'ingest' || command === 'demo') {
    const transcriptRoot = get('transcripts') || (command === 'demo' ? 'D:\\Dev\\viberaven\\transcripts\\RoboNuggets' : null);
    if (!transcriptRoot) throw Error('ingest requires --transcripts PATH');
    await mkdir(dirname(dbPath), { recursive: true });
    const projects = opts.project || (command === 'demo' ? ['D:\\Dev\\viberaven', 'D:\\Dev\\tokenmill', 'D:\\Dev\\firstmate'] : []);
    const result = await ingest({ dbPath, transcriptRoot: resolve(transcriptRoot), limit: integer(get('limit'), command === 'demo' ? 24 : 40, 1, 40), projectRoots: projects.map(p => resolve(p)) });
    const { graph: _graph, ...summary } = result;
    if (command === 'ingest') { output({ ...summary, stats: result.graph.stats }); return; }
    const graph = await map(dbPath), htmlPath = resolve(get('out') || 'prototype-data/map.html'), jsonPath = resolve(get('json') || 'prototype-data/map.json');
    await save(htmlPath, renderHtml(graph)); await save(jsonPath, JSON.stringify(graph, null, 2));
    output({ ...summary, stats: graph.stats, htmlPath, jsonPath }); return;
  }
  if (command === 'search') {
    const query = get('query'); if (!query) throw Error('search requires --query TEXT');
    output(await search(dbPath, query, integer(get('limit'),10,1,100))); return;
  }
  if (command === 'export') {
    let graph = await map(dbPath);
    if (get('graphfile')) { if (!get('root')) throw Error('--graphfile requires --root PROJECT_ROOT'); graph = await importGraphify(graph,resolve(get('graphfile')!),resolve(get('root')!)); }
    const htmlPath = resolve(get('out') || 'prototype-data/map.html'), jsonPath = resolve(get('json') || 'prototype-data/map.json');
    await save(htmlPath, renderHtml(graph)); await save(jsonPath, JSON.stringify(graph, null, 2));
    output({ htmlPath, jsonPath, stats: graph.stats }); return;
  }
  if (command === 'project') {
    if (!get('out')) throw Error('project requires --out DIRECTORY');
    output(await projectForQmd(await map(dbPath),resolve(get('out')!))); return;
  }
  if (command === 'serve') {
    const port = integer(get('port'),4317,1024,65535), graph = await map(dbPath), html = renderHtml(graph);
    const server = Bun.serve({ hostname: '127.0.0.1', port, async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== 'GET') return new Response('Read-only prototype endpoint', { status: 405 });
      if (url.pathname === '/') return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
      if (url.pathname === '/api/map') return Response.json(graph);
      if (url.pathname === '/api/search') {
        const query = url.searchParams.get('q'); if (!query || query.length > 2000) return Response.json({ error: 'Expected q with 1..2000 characters' }, { status: 400 });
        try { return Response.json(await search(dbPath, query,10)); } catch(e) { return Response.json({ error: String(e) }, { status: 400 }); }
      }
      return new Response('Not found', { status: 404 });
    } });
    output({ url: `http://127.0.0.1:${server.port}`, pid: process.pid, snapshot: true });
    return;
  }
  throw Error(`Unknown command: ${command}`);
}

if (import.meta.main) {
  main().catch(error => { console.error(JSON.stringify({ error: error.message || String(error) })); process.exitCode = 1; });
}
