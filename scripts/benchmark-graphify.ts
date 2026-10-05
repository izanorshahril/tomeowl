import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import os from "node:os";
import { hash } from "../src/domain";

const root = resolve(import.meta.dir, "..");
const project = resolve(root, "scripts/benchmarks/graphify");
const uv = process.platform === "win32" ? "uv.exe" : "uv";
const graphifyVersion = "0.9.75";

export function isolatedEnvironment(directory: string, offline: boolean) {
  const env: Record<string, string> = {};
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG"])
    if (process.env[name]) env[name] = process.env[name]!;
  // Setup uses an explicitly authorized registry download; application runs use the proxy guard below.
  // Do not inherit proxy credentials or the sandbox's disabled proxy into the isolated installer.
  for (const name of ["home", "temp", "cache", "config"]) mkdirSync(join(directory, name), { recursive: true });
  Object.assign(env, {
    HOME: join(directory, "home"), USERPROFILE: join(directory, "home"), TEMP: join(directory, "temp"), TMP: join(directory, "temp"),
    APPDATA: join(directory, "config"), LOCALAPPDATA: join(directory, "cache"), XDG_CONFIG_HOME: join(directory, "config"),
    XDG_CACHE_HOME: join(directory, "cache"), UV_CACHE_DIR: join(directory, "cache/uv"), UV_KEYRING_PROVIDER: "disabled",
    UV_PYTHON_DOWNLOADS: "never", GRAPHIFY_NO_AUTO_REFRESH: "1", GRAPHIFY_QUERY_LOG_DISABLE: "1", GRAPHIFY_QUERY_LOG_ENABLE: "0",
    PYTHONUTF8: "1", PYTHONNOUSERSITE: "1", NO_COLOR: "1",
  });
  if (offline) Object.assign(env, { HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" });
  return env;
}

async function boundedText(stream: ReadableStream<Uint8Array>, limit = 4 * 1024 * 1024) {
  const reader = stream.getReader(); let length = 0; const parts: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > limit) throw new Error("Subprocess output exceeds 4 MiB");
      parts.push(next.value);
    }
    return Buffer.concat(parts).toString("utf8");
  } finally { reader.releaseLock(); }
}

async function run(argv: string[], env: Record<string, string>, timeout = 120000) {
  const started = performance.now();
  const child = Bun.spawn(argv, { cwd: root, env, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const terminate = () => {
    if (process.platform === "win32") {
      try { Bun.spawn([join(env.SystemRoot ?? "C:/Windows", "System32/taskkill.exe"), "/PID", String(child.pid), "/T", "/F"], { env, stdout: "ignore", stderr: "ignore" }); }
      catch { child.kill(); }
    } else child.kill();
  };
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { terminate(); reject(new Error(`Command timed out after ${timeout} ms`)); }, timeout); });
  try {
    const [stdout, stderr, code] = await Promise.race([Promise.all([boundedText(child.stdout), boundedText(child.stderr), child.exited]), deadline]);
    if (code !== 0) throw new Error(`Command failed (${code}): ${argv[0]} ${argv[1]}: ${stderr.slice(-3000)}`);
    return { elapsedMs: performance.now() - started, stdout, stderr, argv };
  } catch (error) { terminate(); throw error; }
  finally { clearTimeout(timer!); }
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(directory, entry.name)) : entry.isFile() ? [join(directory, entry.name)] : []);
}
const diskBytes = (directory: string) => files(directory).reduce((sum, path) => sum + statSync(path).size, 0);
export function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, rawMs: values };
}

async function main() {
  const args = Bun.argv.slice(2), flags = new Map<string, string>(); let setup = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--setup" && !setup) { setup = true; continue; }
    if (!["--out", "--iterations"].includes(args[i]) || flags.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error("Use --out FRESH_DIRECTORY [--iterations 1..10] [--setup]");
    flags.set(args[i], args[++i]);
  }
  if (!flags.get("--out")) throw new Error("--out is required");
  const iterations = Number(flags.get("--iterations") ?? 5);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) throw new Error("iterations must be 1..10");
  const out = resolve(flags.get("--out")!);
  mkdirSync(dirname(out), { recursive: true }); mkdirSync(out);
  const env = isolatedEnvironment(join(out, "environment"), true);
  const report: Record<string, unknown> = { schemaVersion: 1, generatedAt: new Date().toISOString(),
    cohort: "local code graph construction and keyword graph query; not ranked document retrieval or model inference",
    versions: { bun: Bun.version, graphify: graphifyVersion }, iterations,
    runtime: { platform: process.platform, architecture: process.arch, osRelease: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
    memory: { peakRssBytes: null, reason: "No validated per-process RSS sampler for this Windows runner" },
    deferred: ["Graphify semantic document extraction", "Generated answers and model inference"],
  };
  try {
    if (setup) {
      const installed = await run([uv, "sync", "--project", project, "--no-build", "--no-install-project", "--no-python-downloads", "--no-managed-python", "--keyring-provider", "disabled"],
        isolatedEnvironment(join(out, "setup-environment"), false), 180000);
      writeFileSync(join(out, "setup.log"), installed.stderr + installed.stdout, { flag: "wx" });
    }
    if (!existsSync(join(project, "uv.lock"))) throw new Error("Graphify benchmark environment is absent; use --setup once, then locked offline runs");
    const invoke = (args: string[]) => [uv, "run", "--project", project, "--frozen", "--offline", "--no-sync", ...args];
    await run([uv, "sync", "--project", project, "--frozen", "--offline", "--check", "--no-build", "--no-install-project"], env);
    const version = await run(invoke(["python", "-c", "import importlib.metadata; print(importlib.metadata.version('graphifyy'))"]), env);
    if (version.stdout.trim() !== graphifyVersion) throw new Error("Installed Graphify version differs from exact benchmark pin");
    report.environment = { uv: (await run([uv, "--version"], env)).stdout.trim(),
      python: JSON.parse((await run(invoke(["python", "-c", "import sys,importlib.metadata,json; print(json.dumps({'version':sys.version,'packages':sorted([{'name':d.metadata['Name'],'version':d.version} for d in importlib.metadata.distributions()],key=lambda d:d['name'])}))"]), env)).stdout),
      lockSha256: hash(readFileSync(join(project, "uv.lock"), "utf8")),
      networkPolicy: "uv offline and application proxy guard; no model backend invoked; not an OS air-gap claim" };
    const help = await run(invoke(["graphify", "extract", "--help"]), env);
    writeFileSync(join(out, "graphify-extract-help.txt"), help.stdout + help.stderr, { flag: "wx" });
    const staged = join(out, "corpus/src"); mkdirSync(staged, { recursive: true });
    const paths = files(join(root, "src")).filter(path => path.endsWith(".ts")).sort();
    if (paths.length > 128) throw new Error("Code corpus exceeds 128-source benchmark bound");
    const corpus: Array<{ path: string; sha256: string; bytes: number }> = []; let total = 0;
    for (const path of paths) {
      const bytes = readFileSync(path); total += bytes.length;
      if (total > 8 * 1024 * 1024) throw new Error("Code corpus exceeds 8 MiB benchmark bound");
      const local = relative(join(root, "src"), path).replaceAll("\\", "/"), target = join(staged, local);
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: "wx" });
      corpus.push({ path: `src/${local}`, sha256: hash(bytes.toString("utf8")), bytes: bytes.length });
    }
    report.corpus = { files: corpus, sha256: hash(JSON.stringify(corpus)), bytes: total };
    const cli = join(root, "src/cli.ts"), db = join(out, "tomeowl.sqlite");
    const nativeIndex = await run([process.execPath, cli, "ingest", "--db", db, "--root", staged], env);
    const nativeIngest = JSON.parse(nativeIndex.stdout);
    if (nativeIngest.files !== corpus.length || nativeIngest.coverage.partialScopes || nativeIngest.coverage.unvisitedRoots)
      throw new Error("Tomeowl did not ingest the entire staged code corpus");
    const graphDirectory = join(out, "graphify");
    const extract = await run(invoke(["graphify", "extract", staged, "--code-only", "--no-cluster", "--max-workers", "1", "--out", graphDirectory]), env);
    writeFileSync(join(out, "graphify-extract.log"), extract.stdout + extract.stderr, { flag: "wx" });
    const graphPath = join(graphDirectory, "graphify-out/graph.json");
    if (!existsSync(graphPath)) throw new Error("Graphify did not emit graphify-out/graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges ?? graph.links)) throw new Error("Graphify graph shape is invalid");
    const nativeMap = JSON.parse((await run([process.execPath, cli, "repomap", "--db", db, "--limit", "128", "--max-bytes", "1048576"], env)).stdout);
    const queries = ["searchStore", "contextPacket", "repositoryMap", "drawReferenceScene"];
    const cases = [];
    for (const query of queries) {
      const profiles = [];
      for (const [tool, argv] of [
        ["tomeowl", [process.execPath, cli, "repomap", "--db", db, "--query", query, "--limit", "20", "--max-bytes", "65536"]],
        ["graphify", invoke(["graphify", "query", query, "--graph", graphPath, "--budget", "2000"])],
      ] as const) {
        const first = await run([...argv], env); const warmed = [];
        writeFileSync(join(out, `${query}-${tool}.txt`), first.stdout, { flag: "wx" });
        for (let i = 0; i < iterations; i++) warmed.push((await run([...argv], env)).elapsedMs);
        profiles.push({ tool, argv, firstAfterIndexMs: first.elapsedMs, warmedCli: distribution(warmed), responseBytes: Buffer.byteLength(first.stdout),
          output: `${query}-${tool}.txt`, responseContract: tool === "tomeowl" ? "bounded structured module map" : "text symbol neighborhood, token budget" });
      }
      cases.push({ query, profiles });
    }
    for (const source of corpus) if (hash(readFileSync(join(out, "corpus", source.path), "utf8")) !== source.sha256) throw new Error("Staged code corpus changed");
    report.status = "measured";
    report.setup = { tomeowlIngestMs: nativeIndex.elapsedMs, graphifyExtractMs: extract.elapsedMs,
      comparable: false, reason: "Tomeowl builds a text catalog and reparses imports for each module-map query; Graphify precomputes a richer symbol graph" };
    report.disk = { tomeowlCatalogBytes: statSync(db).size, graphifyArtifactsBytes: diskBytes(graphDirectory),
      graphifyEnvironmentBytes: diskBytes(join(project, ".venv")), lockSha256: hash(readFileSync(join(project, "uv.lock"), "utf8")) };
    report.outputs = { tomeowlModules: nativeMap.modules.length, tomeowlTruncated: nativeMap.truncated,
      tomeowlIngest: nativeIngest, tomeowlModuleStatuses: nativeMap.modules.map((item: {path:string;status:string}) => ({ path: relative(staged,item.path).replaceAll("\\", "/"), status: item.status })),
      tomeowlOmissions: nativeMap.omissions, graphifySourceFiles: [...new Set(graph.nodes.map((node: {source_file?:string}) => node.source_file).filter(Boolean))].sort(),
      graphifyNodes: graph.nodes.length, graphifyEdges: (graph.edges ?? graph.links).length,
      sameOutputContract: false, rankingQualityComparison: null };
    report.cases = cases;
    report.timingPolicy = "Wall time includes fresh CLI/uv/Python startup, graph load and serialization; warmed means OS caches warmed, not a persistent inference process; no disk cold-cache claim";
    report.implementation = ["scripts/benchmark-graphify.ts", "src/repomap.ts", "src/ingest.ts", "src/store.ts"].map(path => ({ path, sha256: hash(readFileSync(join(root, path), "utf8")) }));
  } catch (error) { report.status = "failed"; report.error = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ok: report.status === "measured", report: join(out, "report.json"), status: report.status, error: report.error }));
}

if (import.meta.main) main().catch(error => { console.error(JSON.stringify({ ok: false, error: String(error) })); process.exitCode = 1; });
