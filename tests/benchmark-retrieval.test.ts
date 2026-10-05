import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { benchmark, freezeCorpus, isolatedEnvironment, normalizeSourcePath, qmdLiteralQuery, runProcess, scoreSources, type CorpusFile, type RankedHit } from "../scripts/benchmark-retrieval";
import type { EvaluationCase } from "../scripts/evaluate-retrieval";

const directories: string[] = [];
const temporary = () => { const path = mkdtempSync(resolve(tmpdir(), "tomeowl-benchmark-")); directories.push(path); return path; };
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
const item: EvaluationCase = { id: "benchmark", query: "exact match", match: "all", kind: "literal", notes: "Partial manually labeled evidence",
  expected: [{ path: "docs/research/a.md", quote: "exact supporting passage" }, { path: "docs/research/b.md", quote: "second support" }] };
const hit = (path: string, quote = "unjudged", authentic = true): RankedHit => ({ path: `docs/research/${path}.md`, quote, score: .8, authentic });

test("common relevance metrics rank sources once and leave anchor coverage separate", () => {
  const hits = [hit("a", "exact supporting passage"), ...Array.from({ length: 6 }, () => hit("a")), hit("x"), hit("y"), hit("z"), hit("b", "second support")];
  const result = scoreSources(item, hits);
  expect(result.rankedSources).toEqual(["docs/research/a.md", "docs/research/x.md", "docs/research/y.md", "docs/research/z.md", "docs/research/b.md"]);
  expect(result.sourceRecallAt5).toBe(1);
  expect(result.sourceReciprocalRank).toBe(1);
  expect(result.returnedAnchorCoverage).toBe(1);
  expect(result.nativeRanked).toHaveLength(11);
  expect(scoreSources(item, [hit("x"), hit("b", "wrong passage")]).sourceReciprocalRank).toBe(.5);
  expect(scoreSources(item, [hit("a", "exact supporting passage", false)]).returnedAnchorCoverage).toBe(0);
});

test("no-label cases do not become perfect recall or inferred answer abstention", () => {
  const result = scoreSources({ ...item, expected: [] }, []);
  expect(result.sourceRecallAt5).toBeNull(); expect(result.sourceReciprocalRank).toBeNull(); expect(result.returnedAnchorCoverage).toBeNull();
  expect(result.emptySearch).toBe(true);
});

test("QMD common profile uses exact quoted terms and explicitly excludes any-mode", () => {
  expect(qmdLiteralQuery(item)).toBe('"exact" "match"');
  expect(qmdLiteralQuery({ ...item, query: "multilingual-e5-small prefixes" })).toBe('"multilingual" "e5" "small" "prefixes"');
  expect(qmdLiteralQuery({ ...item, query: "VACUUM INTO", match: "phrase" })).toBe('"VACUUM INTO"');
  expect(qmdLiteralQuery({ ...item, match: "any" })).toBeNull();
});

test("source identities resolve to frozen originals and reject traversal or other collections", () => {
  const files: CorpusFile[] = [{ path: "docs/research/a.md", frozenPath: resolve("data/frozen/docs/research/a.md"), sha256: "hash", bytes: 100 }];
  expect(normalizeSourcePath(files[0].frozenPath, files, "tomeowl")).toBe("docs/research/a.md");
  expect(normalizeSourcePath("qmd://benchmark/%61.md", files, "qmd")).toBe("docs/research/a.md");
  expect(normalizeSourcePath("qmd://benchmark/a.md?index=benchmark", files, "qmd")).toBe("docs/research/a.md");
  for (const path of ["qmd://other/a.md", "qmd://benchmark/../a.md", "qmd://benchmark/%2e%2e/a.md", "qmd://benchmark/unknown.md", "qmd://benchmark/%XX.md", "qmd://benchmark/a.md?index=other", "qmd://benchmark/a.md?index=benchmark&x=y"]) {
    expect(() => normalizeSourcePath(path, files, "qmd")).toThrow();
  }
  expect(() => normalizeSourcePath(resolve("docs/research/a.md"), files, "tomeowl")).toThrow();
});

test("isolated child environment drops credentials and redirects all QMD writable state", () => {
  const path = temporary(), env = isolatedEnvironment(path, ["C:/runtime"], { SystemRoot: "C:/Windows", OPENAI_API_KEY: "secret", HOME: "C:/private", INDEX_PATH: "C:/private.sqlite", PATH: "C:/private", NODE_OPTIONS: "--import secret" });
  expect(env.OPENAI_API_KEY).toBeUndefined(); expect(env.NODE_OPTIONS).toBeUndefined();
  expect(env.HOME).toBe(resolve(path, "home")); expect(env.USERPROFILE).toBe(env.HOME);
  expect(env.INDEX_PATH).toBe(resolve(path, "qmd.sqlite")); expect(env.QMD_CONFIG_DIR).toBe(resolve(path, "config/qmd"));
  expect(env.PATH).toBe("C:/runtime"); expect(env.QMD_EMBED_MODEL).toBe(resolve(path, "models-disabled/embed.gguf"));
});

test("frozen corpus preserves bytes and refuses existing destinations or hidden admitted sources", () => {
  const root = temporary(), output = resolve(root, "run"); mkdirSync(resolve(root, "docs/research"), { recursive: true });
  const raw = Buffer.from("# Raw document\r\n\r\nNo synthetic metadata.\r\n");
  writeFileSync(resolve(root, "docs/research/a.md"), raw);
  const files = freezeCorpus(root, output);
  expect(files).toHaveLength(1); expect(readFileSync(files[0].frozenPath)).toEqual(raw); expect(files[0].bytes).toBe(raw.length);
  expect(() => freezeCorpus(root, output)).toThrow("already exists");
  writeFileSync(resolve(root, "docs/research/.hidden.md"), "hidden");
  expect(() => freezeCorpus(root, resolve(root, "other"))).toThrow("admission bounds");
});

test("benchmark refuses an existing output before probing tools or modifying files", async () => {
  const path = temporary(); writeFileSync(resolve(path, "sentinel"), "keep");
  await expect(benchmark(path)).rejects.toThrow("fresh");
  expect(readFileSync(resolve(path, "sentinel"), "utf8")).toBe("keep"); expect(existsSync(resolve(path, "corpus"))).toBe(false);
});

test("child runner bounds stdout, stderr and elapsed execution with explicit failures", async () => {
  const path = temporary(), env = isolatedEnvironment(path, [resolve(process.execPath, "..")]);
  const success = await runProcess([process.execPath, "-e", 'process.stdout.write("{\\\"ok\\\":true}")'], path, env, 5000, 100);
  expect(success.exitCode).toBe(0); expect(success.stdout).toBe('{"ok":true}'); expect(success.stdoutBytes).toBe(11);
  await expect(runProcess([process.execPath, "-e", 'process.stdout.write("x".repeat(200))'], path, env, 5000, 100)).rejects.toThrow("output");
  await expect(runProcess([process.execPath, "-e", 'process.stderr.write("x".repeat(200))'], path, env, 5000, 100)).rejects.toThrow("output");
  await expect(runProcess([process.execPath, "-e", "await Bun.sleep(2000)"], path, env, 30, 100)).rejects.toThrow("deadline");
});
