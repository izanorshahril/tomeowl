import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { TomeowlError } from "../src/domain";
import { renderSnapshot } from "../src/viewer/export";
import type { Snapshot } from "../src/viewer/types";

const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const pathKey = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;

function readSnapshot(path: string): Snapshot {
  const file = openSync(path, "r");
  try {
    const info = fstatSync(file);
    if (!info.isFile()) throw new TomeowlError("Snapshot input must be a file", "INVALID_SNAPSHOT_FILE");
    if (info.size > MAX_SNAPSHOT_BYTES) throw new TomeowlError("Snapshot exceeds 16 MiB", "SNAPSHOT_TOO_LARGE");
    // One extra byte detects growth without allowing an unbounded file read.
    const data = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < data.length) {
      const count = readSync(file, data, length, data.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > MAX_SNAPSHOT_BYTES) throw new TomeowlError("Snapshot exceeds 16 MiB", "SNAPSHOT_TOO_LARGE");
    if (length > info.size) throw new TomeowlError("Snapshot changed while reading; retry with a stable file", "SNAPSHOT_INPUT_CHANGED");
    try { return JSON.parse(data.toString("utf8", 0, length)) as Snapshot; }
    catch { throw new TomeowlError("Snapshot must contain valid JSON", "INVALID_SNAPSHOT_JSON"); }
  } finally { closeSync(file); }
}

export async function exportSnapshot(options: { snapshot: string; out: string }) {
  const input = resolve(options.snapshot), output = resolve(options.out);
  if (pathKey(input) === pathKey(output) || existsSync(output) && pathKey(realpathSync(input)) === pathKey(realpathSync(output))) {
    throw new TomeowlError("HTML output must differ from the snapshot input", "SNAPSHOT_OUTPUT_OVERWRITE");
  }
  const html = await renderSnapshot(readSnapshot(input));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, html, "utf8");
  return { ok: true, path: output, bytes: Buffer.byteLength(html) };
}

export function parseExportArgs(args: string[]) {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!["--snapshot", "--out"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || flags.has(args[i])) {
      throw new TomeowlError("Use --snapshot PATH --out PATH", "INVALID_ARGUMENT");
    }
    flags.set(args[i], args[i + 1]);
  }
  if (!flags.has("--snapshot") || !flags.has("--out")) throw new TomeowlError("Use --snapshot PATH --out PATH", "INVALID_ARGUMENT");
  return { snapshot: flags.get("--snapshot")!, out: flags.get("--out")! };
}

if (import.meta.main) {
  try {
    const result = await exportSnapshot(parseExportArgs(Bun.argv.slice(2)));
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: {
      code: error instanceof TomeowlError ? error.code : "SNAPSHOT_EXPORT_ERROR",
      message: error instanceof Error ? error.message : String(error),
    } }) + "\n");
    process.exitCode = 1;
  }
}
