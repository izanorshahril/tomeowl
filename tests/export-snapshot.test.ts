import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, openSync, closeSync, ftruncateSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportSnapshot, parseExportArgs } from "../scripts/export-snapshot";
import type { Snapshot } from "../src/viewer/types";

const tempDirs: string[] = [];
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() { const dir = mkdtempSync(join(tmpdir(), "tomeowl-export-snapshot-")); tempDirs.push(dir); return dir; }

function sample(): Snapshot {
  return {
    schemaVersion: 1, generatedAt: "2026-10-04T00:00:00Z", stats: { sources: 1, chunks: 1, relations: 0 },
    sources: [{ id: "note", title: "Research </script><script>bad()</script>&", path: "docs/research/note.md", collection: "Research", kind: "document", revision: "r1", chunkCount: 1, layer: "research", corpus: "literature", projectId: "project", excerpt: { quote: "Located evidence", locator: { lineStart: 3, lineEnd: 4 }, chunkId: "chunk" } }],
    relations: [],
    sample: {
      name: "Enriched workspace", workspaceRoot: "D:/Example",
      projects: [{ id: "project", title: "Example", path: "D:/Example/project", sourceIds: ["note"], coverage: { discoveredFiles: 7, selectedFiles: 1, omissions: { fileBudgetReached: 6 } } }],
      scan: { projectCount: 1, selectedFiles: 1, researchFiles: 1, citationRecords: 0, omissions: {}, warnings: [], bounds: { maxDepth: 4, filesPerProject: 10, maxFileBytes: 262144, maxTotalBytes: 8388608, maxResearchFiles: 32, maxCitationRecords: 96 } },
    },
  };
}

test("exports enriched metadata and safe inline JSON without changing the input", async () => {
  const dir = fixture(), input = join(dir, "snapshot.json"), output = join(dir, "export", "map.html"), data = sample();
  const original = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(input, original);
  const result = await exportSnapshot({ snapshot: input, out: output });
  const html = readFileSync(output, "utf8");
  const embedded = html.match(/window\.__TOMEOWL_SNAPSHOT__=(.*?);<\/script>/s)?.[1];
  expect(JSON.parse(embedded!)).toEqual(data);
  expect(html).not.toContain("</script><script>bad()</script>");
  expect(html).toContain("\\u003c/script\\u003e");
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  expect(readFileSync(input, "utf8")).toBe(original);
  expect(result).toEqual({ ok: true, path: output, bytes: Buffer.byteLength(html) });
});

test("refuses input overwrite including Windows case variants", async () => {
  const dir = fixture(), input = join(dir, "snapshot.json"), original = JSON.stringify(sample());
  writeFileSync(input, original);
  const output = process.platform === "win32" ? input.toUpperCase() : input;
  await expect(exportSnapshot({ snapshot: input, out: output })).rejects.toMatchObject({ code: "SNAPSHOT_OUTPUT_OVERWRITE" });
  expect(readFileSync(input, "utf8")).toBe(original);
});

test("rejects oversized snapshot before creating an HTML output", async () => {
  const dir = fixture(), input = join(dir, "oversized.json"), output = join(dir, "map.html"), file = openSync(input, "w");
  try { ftruncateSync(file, 16 * 1024 * 1024 + 1); } finally { closeSync(file); }
  await expect(exportSnapshot({ snapshot: input, out: output })).rejects.toMatchObject({ code: "SNAPSHOT_TOO_LARGE" });
  expect(existsSync(output)).toBe(false);
});

test("CLI arguments require exactly one snapshot path and one output path", () => {
  expect(parseExportArgs(["--snapshot", "snapshot.json", "--out", "map.html"])).toEqual({ snapshot: "snapshot.json", out: "map.html" });
  expect(parseExportArgs(["--out", "map.html", "--snapshot", "snapshot.json"])).toEqual({ snapshot: "snapshot.json", out: "map.html" });
  for (const args of [[], ["--snapshot", "snapshot.json"], ["--snapshot", "--out", "map.html"], ["--snapshot", "snapshot.json", "--out"], ["--snapshot", "snapshot.json", "--out", "map.html", "--out", "other.html"], ["--snapshot", "snapshot.json", "--out", "map.html", "--extra", "value"]]) {
    let error: unknown;
    try { parseExportArgs(args); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: "INVALID_ARGUMENT" });
  }
});
