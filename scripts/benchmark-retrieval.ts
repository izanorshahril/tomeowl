import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { cpus, release, homedir } from "node:os";
import { Database } from "bun:sqlite";
import { TomeowlError, type SearchResult } from "../src/domain";
import { citationIsAuthentic, evaluate, parseCases, type EvaluationCase } from "./evaluate-retrieval";

const projectRoot = resolve(import.meta.dir, "..");
const defaultQmd = Bun.which("qmd") ?? resolve(homedir(), ".bun/bin", process.platform === "win32" ? "qmd.exe" : "qmd");
const maxOutputBytes = 4 * 1024 * 1024;
const maxCorpusBytes = 8 * 1024 * 1024;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fail = (message: string, code = "BENCHMARK_FAILED"): never => { throw new TomeowlError(message, code); };
const portable = (path: string) => path.replaceAll("\\", "/");
const mean = (values: Array<number | null>) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
};

export type CorpusFile = { path: string; frozenPath: string; sha256: string; bytes: number };
export type RankedHit = { path: string; quote: string; score: number; authentic: boolean };
type ProcessResult = { argv: string[]; pid: number; exitCode: number; elapsedMs: number; stdoutBytes: number; stderrBytes: number; stdout: string; stderr: string };

/** Avoid inheriting credentials, local configuration, proxies, or an existing user index. */
export function isolatedEnvironment(directory: string, executableDirectories: string[], inherited: NodeJS.ProcessEnv = process.env) {
  const env: Record<string, string> = {};
  for (const key of ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT"]) if (inherited[key]) env[key] = inherited[key]!;
  const home = resolve(directory, "home"), temp = resolve(directory, "tmp");
  const config = resolve(directory, "config"), cache = resolve(directory, "cache");
  for (const path of [home, temp, config, cache]) mkdirSync(path, { recursive: true });
  return { ...env, PATH: [...new Set(executableDirectories)].join(sep === "\\" ? ";" : ":"), HOME: home, USERPROFILE: home,
    APPDATA: config, LOCALAPPDATA: cache, TMP: temp, TEMP: temp, TMPDIR: temp, PWD: directory,
    XDG_CONFIG_HOME: config, XDG_CACHE_HOME: cache, XDG_DATA_HOME: resolve(directory, "local-data"),
    QMD_CONFIG_DIR: resolve(config, "qmd"), INDEX_PATH: resolve(directory, "qmd.sqlite"), QMD_SOURCE_MODE: "0",
    QMD_FORCE_CPU: "1", QMD_EMBED_MODEL: resolve(directory, "models-disabled", "embed.gguf"),
    QMD_GENERATE_MODEL: resolve(directory, "models-disabled", "generate.gguf"), QMD_RERANK_MODEL: resolve(directory, "models-disabled", "rerank.gguf"),
    HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", NO_COLOR: "1", CI: "1" };
}

/** Shell-free argv, no stdin, bounded streaming output and a wall-clock deadline. */
export async function runProcess(argv: string[], cwd: string, env: Record<string, string>, timeoutMs = 30000, capBytes = maxOutputBytes): Promise<ProcessResult> {
  const start = performance.now();
  const child = Bun.spawn(argv, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(), buffers: Buffer[] = []; let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > capBytes) { child.kill(); fail("Child output exceeded benchmark ceiling", "OUTPUT_LIMIT"); }
        buffers.push(Buffer.from(part.value));
      }
      return { bytes, text: Buffer.concat(buffers).toString("utf8") };
    } finally { reader.releaseLock(); }
  };
  try {
    const results = await Promise.allSettled([read(child.stdout), read(child.stderr), child.exited]);
    if (timedOut) fail("Child process exceeded benchmark deadline", "PROCESS_TIMEOUT");
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejected) throw rejected.reason;
    const [stdout, stderr, exitCode] = results.map(result => (result as PromiseFulfilledResult<any>).value);
    return { argv, pid: child.pid, exitCode, elapsedMs: performance.now() - start, stdoutBytes: stdout.bytes, stderrBytes: stderr.bytes, stdout: stdout.text, stderr: stderr.text };
  } finally { clearTimeout(deadline); }
}

/** Both engines receive identical bytes; reject partial, linked, or oversized corpora. */
export function freezeCorpus(root: string, output: string): CorpusFile[] {
  const sourceRoot = resolve(root, "docs/research"), targetRoot = resolve(output, "corpus/docs/research");
  if (existsSync(targetRoot)) fail("Frozen corpus destination already exists", "OUTPUT_EXISTS");
  mkdirSync(targetRoot, { recursive: true });
  const files: CorpusFile[] = []; let total = 0;
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name), info = lstatSync(path);
      if (info.isSymbolicLink()) fail("Research corpus contains a symbolic link", "INCOMPLETE_CORPUS");
      if (info.isDirectory()) { if (name.startsWith(".")) fail("Research corpus contains a hidden directory", "INCOMPLETE_CORPUS"); walk(path); continue; }
      if (!/\.(?:md|txt)$/i.test(name)) continue;
      if (!info.isFile() || name.startsWith(".") || info.size > 2 * 1024 * 1024 || files.length >= 500) fail("Research corpus exceeds admission bounds", "INCOMPLETE_CORPUS");
      const content = readFileSync(path); total += content.length;
      if (content.length > 2 * 1024 * 1024 || total > maxCorpusBytes || !content.toString("utf8").trim()) fail("Research corpus exceeds byte ceiling or contains empty documents", "INCOMPLETE_CORPUS");
      const local = portable(relative(root, path)), destination = resolve(output, "corpus", local);
      mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, content, { flag: "wx" });
      files.push({ path: local, frozenPath: destination, sha256: sha256(content), bytes: content.length });
    }
  };
  walk(sourceRoot);
  if (!files.length) fail("Research corpus is empty", "INCOMPLETE_CORPUS");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Resolve only known corpus identities, rather than accepting an invented source path. */
export function normalizeSourcePath(value: string, files: CorpusFile[], kind: "tomeowl" | "qmd", collection = "benchmark"): string {
  if (typeof value !== "string" || value.includes("\0")) return fail("Invalid search source path", "INVALID_RESULT");
  let path = portable(value);
  if (kind === "qmd") {
    const prefix = `qmd://${collection}/`;
    if (!path.startsWith(prefix)) return fail("QMD result is outside the benchmark collection", "INVALID_RESULT");
    const tail = path.slice(prefix.length), [identity, query, extra] = tail.split("?");
    if (extra !== undefined || tail.includes("#") || (query !== undefined && query !== "index=benchmark")) return fail("Invalid QMD index identity", "INVALID_RESULT");
    try { path = decodeURIComponent(identity); } catch { return fail("Invalid QMD URI encoding", "INVALID_RESULT"); }
    if (path.split("/").some(part => !part || part === "." || part === "..")) return fail("Invalid QMD source identity", "INVALID_RESULT");
    path = `docs/research/${path}`;
  }
  const fold = (text: string) => process.platform === "win32" ? text.replace(/[A-Z]/g, letter => letter.toLowerCase()) : text;
  const match = files.find(file => fold(kind === "tomeowl" ? portable(file.frozenPath) : file.path) === fold(path));
  return match?.path ?? fail("Search result does not resolve to the frozen corpus", "INVALID_RESULT");
}

/** QMD 2.8.3 ANDs positive terms; quoted terms avoid its implicit prefix matching. */
export function qmdLiteralQuery(item: EvaluationCase): string | null {
  if (item.match === "any") return null;
  const terms = item.query.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (!terms.length) return fail("Query contains no literal terms", "INVALID_QUERY");
  return item.match === "phrase" ? `"${terms.join(" ")}"` : terms.map(term => `"${term}"`).join(" ");
}

/** Common metrics rank unique sources. Native chunk/document ranks remain in the report. */
export function scoreSources(item: EvaluationCase, hits: RankedHit[]) {
  const rankedSources = [...new Set(hits.map(hit => hit.path))], expected = new Set(item.expected.map(anchor => anchor.path));
  const first = rankedSources.findIndex(path => expected.has(path)) + 1;
  const sourceRecallAt5 = expected.size ? [...expected].filter(path => rankedSources.slice(0, 5).includes(path)).length / expected.size : null;
  const returnedAnchorCoverage = item.expected.length ? item.expected.filter(anchor => hits.some(hit => hit.authentic && hit.path === anchor.path && hit.quote.includes(anchor.quote))).length / item.expected.length : null;
  return { id: item.id, match: item.match, labeledSources: expected.size, sourceRecallAt5, sourceReciprocalRank: expected.size ? (first ? 1 / first : 0) : null,
    returnedAnchorCoverage, emptySearch: !hits.length, invalidEvidence: hits.filter(hit => !hit.authentic).length, rankedSources,
    nativeRanked: hits.map(hit => ({ path: hit.path, score: hit.score })),
    anchors: item.expected.map(anchor => ({ path: anchor.path, returnedExactQuote: hits.some(hit => hit.authentic && hit.path === anchor.path && hit.quote.includes(anchor.quote)) })) };
}

function timing(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return { samples: values.length, medianMs: ordered.length ? ordered[Math.floor(ordered.length / 2)] : null,
    p95Ms: ordered.length ? ordered[Math.ceil(ordered.length * .95) - 1] : null, minMs: ordered[0] ?? null, maxMs: ordered.at(-1) ?? null };
}
const compactRun = ({ stdout, stderr, ...run }: ProcessResult) => ({ ...run, stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr) });
function parseJson(run: ProcessResult): any {
  if (run.exitCode !== 0) fail(`Child process exited ${run.exitCode}: ${run.stderr.slice(0, 1000)}`, "TOOL_FAILED");
  try { return JSON.parse(run.stdout); } catch { return fail("Child did not return valid JSON", "INVALID_RESULT"); }
}
function parseTomeowl(run: ProcessResult, db: Database, files: CorpusFile[]): RankedHit[] {
  const value = parseJson(run);
  if (!value?.ok || !Array.isArray(value.results) || value.results.length > 1000) return fail("Invalid Tomeowl search response", "INVALID_RESULT");
  return value.results.map((hit: SearchResult) => {
    if (!hit || typeof hit.quote !== "string" || !Number.isFinite(hit.score)) return fail("Invalid Tomeowl hit", "INVALID_RESULT");
    return { path: normalizeSourcePath(hit.path, files, "tomeowl"), quote: hit.quote, score: hit.score, authentic: citationIsAuthentic(db, hit) };
  });
}
function parseQmd(run: ProcessResult, files: CorpusFile[]): RankedHit[] {
  const value = parseJson(run);
  if (!Array.isArray(value) || value.length > 500) return fail("Invalid QMD search response", "INVALID_RESULT");
  return value.map(hit => {
    if (!hit || typeof hit.body !== "string" || !Number.isFinite(hit.score)) return fail("QMD --full response lacks body or score", "INVALID_RESULT");
    const path = normalizeSourcePath(hit.file, files, "qmd"), file = files.find(file => file.path === path)!;
    return { path, quote: hit.body, score: hit.score, authentic: sha256(hit.body) === file.sha256 };
  });
}

function implementation(paths: string[], base = projectRoot) {
  return paths.map(path => ({ path, sha256: sha256(readFileSync(resolve(base, path))) }));
}
const implementationPaths = ["scripts/benchmark-retrieval.ts", "scripts/evaluate-retrieval.ts", "src/cli.ts", "src/domain.ts", "src/store.ts", "src/retrieval.ts",
  "src/ingest.ts", "src/excerpt.ts", "src/evidence-query.ts", "src/query-scope.ts", "src/context-query.ts", "src/graph-query.ts"];
const summarize = (rows: ReturnType<typeof scoreSources>[]) => ({ cases: rows.length, labeledCases: rows.filter(row => row.labeledSources).length,
  macro: { sourceRecallAt5: mean(rows.map(row => row.sourceRecallAt5)), sourceReciprocalRank: mean(rows.map(row => row.sourceReciprocalRank)) },
  invalidEvidence: rows.reduce((sum, row) => sum + row.invalidEvidence, 0),
  noLabelCases: rows.filter(row => !row.labeledSources).map(row => ({ id: row.id, emptySearch: row.emptySearch })) });

export async function benchmark(output: string, iterations = 3, qmdPath = defaultQmd, root = projectRoot) {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) fail("iterations must be 1..10", "INVALID_LIMIT");
  output = resolve(output);
  if (existsSync(output)) fail("Benchmark output directory must be fresh", "OUTPUT_EXISTS");
  mkdirSync(output, { recursive: true });
  const files = freezeCorpus(root, output), frozenRoot = resolve(output, "corpus");
  const suitePath = resolve(root, "tests/fixtures/retrieval-eval/research-cases.json"), suite = readFileSync(suitePath);
  if (suite.length > 1024 * 1024) fail("Evaluation suite exceeds 1 MiB", "INVALID_LIMIT");
  const cases = parseCases(JSON.parse(suite.toString("utf8"))), frozenSuite = resolve(output, "cases.json");
  writeFileSync(frozenSuite, suite, { flag: "wx" });
  for (const item of cases) for (const anchor of item.expected) {
    const file = files.find(file => file.path === anchor.path);
    if (!file || !readFileSync(file.frozenPath, "utf8").includes(anchor.quote)) fail(`Frozen corpus lacks anchor for ${item.id}`, "INVALID_ANCHOR");
  }
  const fingerprints = implementation(implementationPaths);
  const env = isolatedEnvironment(resolve(output, "isolation"), [dirname(process.execPath), "C:/Program Files/nodejs"]);
  const cli = resolve(projectRoot, "src/cli.ts"), tomeowlDb = resolve(output, "tomeowl.sqlite");
  const run = (argv: string[], timeout = 30000) => runProcess(argv, output, env, timeout);
  const ingestion = await run([process.execPath, cli, "ingest", "--root", resolve(frozenRoot, "docs/research"), "--db", tomeowlDb]);
  const ingestionResult = parseJson(ingestion);
  if (ingestionResult.coverage?.partialScopes || ingestionResult.coverage?.unvisitedRoots) fail("Tomeowl benchmark ingest is incomplete", "INCOMPLETE_CORPUS");
  if (ingestionResult.chunks > 1000) fail("Corpus exceeds the complete ranked chunk candidate profile", "INCOMPLETE_CORPUS");
  writeFileSync(resolve(output, "tomeowl-ingest.json"), ingestion.stdout, { flag: "wx" });
  const db = new Database(tomeowlDb, { readonly: true });
  const rows: Array<{ id: string; tomeowl: ReturnType<typeof scoreSources>; qmd: ReturnType<typeof scoreSources> | null;
    qmdStatus: string; query: string; qmdQuery: string | null; runs: { tomeowl: ReturnType<typeof compactRun>[]; qmd: ReturnType<typeof compactRun>[] } }> = [];
  const qmdPackage = resolve(dirname(qmdPath), "../install/global/node_modules/@tobilu/qmd");
  let qmd: any = { status: "unavailable", reason: "QMD executable not found", inference: "not run; user deferred models" };
  let qmdFingerprint: ReturnType<typeof implementation> = [];
  let qmdReady = false;
  // The installed launcher uses shell:true on Windows. Its package dist CLI is the same implementation,
  // run directly with the installed Bun runtime to preserve literal argv and measure a single CLI process.
  const qmdCommand = (...argv: string[]) => [process.execPath, resolve(qmdPackage, "dist/cli/qmd.js"), "--index", "benchmark", ...argv];
  try {
    const tomeowlSources = db.query("SELECT path,revision FROM sources ORDER BY path").all() as Array<{ path: string; revision: string }>;
    if (tomeowlSources.length !== files.length || tomeowlSources.some(source => {
      const path = normalizeSourcePath(source.path, files, "tomeowl");
      return source.revision !== files.find(file => file.path === path)!.sha256;
    })) fail("Tomeowl did not index identical complete source bytes", "INCOMPLETE_CORPUS");
    if (existsSync(qmdPath)) {
      try {
        // Inspect before indexing; executable and installed package remain read-only.
        const version = await run([qmdPath, "--index", "benchmark", "--version"]), help = await run([qmdPath, "--index", "benchmark", "--help"]);
        writeFileSync(resolve(output, "qmd-probe.json"), JSON.stringify({ version, help }), { flag: "wx" });
        if (version.exitCode || help.exitCode) fail("QMD help/version probe failed", "TOOL_FAILED");
        const pkg = JSON.parse(readFileSync(resolve(qmdPackage, "package.json"), "utf8"));
        if (pkg.version !== "2.8.3" || !version.stdout.startsWith("qmd 2.8.3")) fail("QMD version is not the audited 2.8.3 profile", "UNSUPPORTED_TOOL_VERSION");
        if (!help.stdout.includes("--index") || !help.stdout.includes("--full")) fail("QMD help lacks the audited CLI profile", "UNSUPPORTED_TOOL_VERSION");
        qmdFingerprint = implementation(["package.json", "bin/qmd", "dist/cli/qmd.js", "dist/store.js", "dist/db.js", "dist/collections.js", "dist/paths.js", "dist/llm.js"], qmdPackage);
        const indexing = await run(qmdCommand("collection", "add", resolve(frozenRoot, "docs/research"), "--name", "benchmark", "--mask", "**/*.{md,txt}"), 60000);
        writeFileSync(resolve(output, "qmd-index.json"), JSON.stringify(indexing), { flag: "wx" });
        if (indexing.exitCode) fail(`QMD indexing failed: ${indexing.stderr.slice(0, 1000)}`, "TOOL_FAILED");
        const qmdDb = new Database(env.INDEX_PATH, { readonly: true });
        try {
          const indexed = qmdDb.query("SELECT d.path,c.doc FROM documents d JOIN content c ON c.hash=d.hash WHERE d.active=1 AND d.collection=? ORDER BY d.path").all("benchmark") as Array<{ path: string; doc: string }>;
          if (indexed.length !== files.length || indexed.some(row => {
            const file = files.find(file => file.path === `docs/research/${portable(row.path)}`);
            return !file || sha256(row.doc) !== file.sha256;
          })) fail("QMD did not index identical complete source bytes", "INCOMPLETE_CORPUS");
          const vectors = qmdDb.query("SELECT COUNT(*) n FROM content_vectors").get() as { n: number };
          if (vectors.n) fail("Unexpected model vectors in isolated QMD index", "MODELS_DISABLED");
          qmd = { status: "measured", version: version.stdout.trim(), executableSha256: sha256(readFileSync(qmdPath)), packageVersion: pkg.version,
            invocation: "Audited package dist CLI under installed Bun; Windows shell-based wrapper inspected but excluded from query measurements",
            implementation: qmdFingerprint, indexedSources: indexed.length, index: compactRun(indexing), vectors: vectors.n,
            indexBytes: statSync(env.INDEX_PATH).size,
            inference: "not run; only collection add and keyword search", isolation: { config: env.QMD_CONFIG_DIR, index: env.INDEX_PATH, home: env.HOME, cache: env.XDG_CACHE_HOME } };
          qmdReady = true;
        } finally { qmdDb.close(); }
      } catch (error) { qmd = { status: "failed", reason: error instanceof Error ? error.message : String(error), inference: "not run; model paths disabled" }; }
    }
    for (const item of cases) {
      const tq = [process.execPath, cli, "search", "--db", tomeowlDb, "--query", item.query, "--match", item.match, "--limit", "1000"];
      const qq = qmdLiteralQuery(item), truns: ProcessResult[] = [], qruns: ProcessResult[] = [];
      let firstTomeowl: RankedHit[] | undefined, firstQmd: RankedHit[] | undefined;
      let caseStatus = !qmdReady ? qmd.status : qq === null ? "unsupported-match-any" : "measured";
      for (let index = 0; index <= iterations; index++) {
        const order = index % 2 ? ["qmd", "tomeowl"] : ["tomeowl", "qmd"];
        for (const tool of order) {
          if (tool === "tomeowl") {
            const result = await run(tq), hits = parseTomeowl(result, db, files); truns.push(result);
            if (!firstTomeowl) { firstTomeowl = hits; writeFileSync(resolve(output, `${item.id}.tomeowl.json`), result.stdout, { flag: "wx" }); }
            else if (JSON.stringify(firstTomeowl) !== JSON.stringify(hits)) fail("Tomeowl search changed between repeated runs", "UNSTABLE_RESULT");
          } else if (caseStatus === "measured") {
            try {
              const result = await run(qmdCommand("search", qq!, "--collection", "benchmark", "--format", "json", "--full", "-n", "500"));
              const hits = parseQmd(result, files); qruns.push(result);
              if (!firstQmd) { firstQmd = hits; writeFileSync(resolve(output, `${item.id}.qmd.json`), result.stdout, { flag: "wx" }); }
              else if (JSON.stringify(firstQmd) !== JSON.stringify(hits)) fail("QMD search changed between repeated runs", "UNSTABLE_RESULT");
            } catch (error) { caseStatus = `failed: ${error instanceof Error ? error.message : String(error)}`; firstQmd = undefined; }
          }
        }
      }
      rows.push({ id: item.id, query: item.query, qmdQuery: qq, tomeowl: scoreSources(item, firstTomeowl!), qmd: firstQmd ? scoreSources(item, firstQmd) : null,
        qmdStatus: caseStatus, runs: { tomeowl: truns.map(compactRun), qmd: qruns.map(compactRun) } });
    }
    // The existing in-process evaluation retains authentic anchors/context budgets, on the same frozen input.
    const inProcess = evaluate(frozenRoot, frozenSuite, iterations);
    writeFileSync(resolve(output, "tomeowl-in-process-evaluation.json"), JSON.stringify(inProcess), { flag: "wx" });
    if (inProcess.summary.invalidCitations || inProcess.summary.invalidSources || inProcess.summary.invalidBudgets) fail("Existing evidence evaluation failed integrity checks", "INVALID_EVIDENCE");
    for (const file of files) if (sha256(readFileSync(file.frozenPath)) !== file.sha256) fail("Frozen corpus changed during benchmark", "CORPUS_CHANGED");
    for (const file of fingerprints) if (sha256(readFileSync(resolve(projectRoot, file.path))) !== file.sha256) fail("Implementation changed during benchmark", "IMPLEMENTATION_CHANGED");
    for (const file of qmdFingerprint) if (sha256(readFileSync(resolve(qmdPackage, file.path))) !== file.sha256) fail("QMD implementation changed during benchmark", "IMPLEMENTATION_CHANGED");
    const modelFiles: string[] = [];
    const inspectFiles = (directory: string) => { for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name); if (entry.isDirectory()) inspectFiles(path); else if (/\.(?:gguf|onnx|safetensors|bin)$/i.test(entry.name)) modelFiles.push(path);
    } };
    inspectFiles(resolve(output, "isolation"));
    if (modelFiles.length) fail("Unexpected model artifact in benchmark isolation directory", "MODELS_DISABLED");
    const common = rows.filter(row => row.qmdStatus === "measured" && row.qmd);
    const latencies = (tool: "tomeowl" | "qmd", selected = rows) => timing(selected.flatMap(row => row.runs[tool].slice(1).map(run => run.elapsedMs)));
    const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: qmdReady && rows.every(row => !row.qmdStatus.startsWith("failed")) ? "complete-keyword-profile" : "partial",
      runtime: { platform: process.platform, architecture: process.arch, osRelease: release(), cpu: cpus()[0]?.model ?? null, logicalCpus: cpus().length, bun: Bun.version },
      corpus: { sources: files.map(({ frozenPath, ...file }) => file), sourceCount: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0),
        sha256: sha256(JSON.stringify(files.map(({ frozenPath, ...file }) => file))), frozenRoot, sourcePolicy: "Raw Markdown/text bytes frozen once before indexing; no Tomeowl projection or metadata added" },
      suite: { sha256: sha256(suite), cases: cases.length, labels: "Existing partial manual exact anchors; unlisted hits are unjudged; no answer generation" },
      implementation: fingerprints, iterations,
      profile: { retrieval: "Keyword BM25 only; no embeddings, expansion, reranking, or inference", rankPolicy: "Unique original sources deduplicated in first returned native rank; complete matching corpus candidates requested",
        timing: "Fresh CLI process per query, including startup, catalog open, search and full JSON emission; index/corpus OS cache warmed; no persistent process, no cold-cache claim",
        order: "Tools alternate order per repetition; first per-case process separated from warmed repetitions", timeLimitMs: 30000, outputCeilingBytes: maxOutputBytes,
        tomeowl: "unicode61; body-only BM25; chunks ranked; native any/all/phrase literal matching; candidate limit 1000",
        qmd: "2.8.3 audited CLI; Porter unicode61/CJK normalization; document BM25 including weighted title/path/body; quoted exact terms/phrases; candidate limit 500",
        commonCases: "phrase/all only; match:any excluded because QMD keyword parser lacks OR parity; stemming, document scope and weighting still differ",
        evidence: "Tomeowl authentic revision/chunk/locator/quote guard; QMD full returned body hash must equal frozen original source; full-document and bounded chunk anchor coverage are not comparable passage metrics",
        memory: { status: "unavailable", reason: "No portable child-process peak RSS sampler implemented; parent Bun RSS would misattribute child memory" } },
      tools: { tomeowl: { status: "measured", ingestion: compactRun(ingestion), indexed: { sources: tomeowlSources.length, chunks: ingestionResult.chunks },
        indexBytes: statSync(tomeowlDb).size, summaryAllCases: summarize(rows.map(row => row.tomeowl)), warmProcessLatencyAllCases: latencies("tomeowl") },
        qmd, graphify: { status: "pending", reason: "Graph construction/extraction is a different task from ranked keyword retrieval; no shared scored query adapter or model-free corpus extraction has been validated", inference: "not run" } },
      comparison: { cases: common.length, labeledCases: common.filter(row => row.tomeowl.labeledSources).length,
        tomeowl: { summary: summarize(common.map(row => row.tomeowl)), warmProcessLatency: latencies("tomeowl", common) },
        qmd: { summary: summarize(common.map(row => row.qmd!)), warmProcessLatency: latencies("qmd", common) },
        excluded: rows.filter(row => row.qmdStatus !== "measured").map(row => ({ id: row.id, reason: row.qmdStatus })) },
      inProcessEvaluation: { file: "tomeowl-in-process-evaluation.json", summary: inProcess.summary, timingPolicy: inProcess.timingPolicy },
      modelArtifacts: modelFiles, cases: rows };
    if (rows.some(row => row.tomeowl.invalidEvidence || row.qmd?.invalidEvidence)) fail("Benchmark returned unauthentic evidence", "INVALID_EVIDENCE");
    writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    return report;
  } finally { db.close(); }
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2), flags: Record<string, string> = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index];
      if (!["--out", "--iterations", "--qmd"].includes(key) || flags[key] || !args[index + 1] || args[index + 1].startsWith("--")) fail("Usage: bun scripts/benchmark-retrieval.ts --out NEW_DIRECTORY [--iterations 1..10] [--qmd EXE_PATH]", "INVALID_ARGUMENT");
      flags[key] = args[index + 1];
    }
    if (!flags["--out"]) fail("--out fresh benchmark directory is required", "INVALID_ARGUMENT");
    const report = await benchmark(flags["--out"], Number(flags["--iterations"] ?? 3), flags["--qmd"] ?? defaultQmd);
    process.stdout.write(JSON.stringify({ ok: true, output: resolve(flags["--out"], "report.json"), status: report.status, comparison: report.comparison, memory: report.profile.memory }) + "\n");
    if (report.status === "partial") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, error: { code: error instanceof TomeowlError ? error.code : "BENCHMARK_FAILED", message: error instanceof Error ? error.message : String(error) } }) + "\n");
    process.exitCode = 1;
  }
}
