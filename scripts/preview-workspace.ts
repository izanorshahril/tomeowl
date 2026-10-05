import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { TomeowlError } from "../src/domain";
import { renderSnapshot } from "../src/viewer/export";
import type { Snapshot } from "../src/viewer/types";

const MAX_PREVIEW_BYTES = 16 * 1024 * 1024;
function readBounded(path: string) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new TomeowlError("Preview artifact does not exist", "PREVIEW_NOT_FOUND");
  if (statSync(path).size > MAX_PREVIEW_BYTES) throw new TomeowlError("Preview artifact exceeds 16 MiB", "PREVIEW_TOO_LARGE");
  return readFileSync(path, "utf8");
}

export function createPreviewServer(options: { snapshot: string; html?: string; port?: number }) {
  const snapshotPath = resolve(options.snapshot), htmlPath = resolve(options.html ?? join(dirname(snapshotPath), "workspace.html"));
  const port = options.port ?? 4318;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TomeowlError("port must be an integer from 0 to 65535", "INVALID_PORT");
  return Bun.serve({ hostname: "127.0.0.1", port, async fetch(request) {
    const path = new URL(request.url).pathname;
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET") return Response.json({ error: { code: "METHOD_NOT_ALLOWED", message: "GET only" } }, { status: 405, headers });
    try {
      if (path === "/saved") return new Response(readBounded(htmlPath), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
      if (path === "/prototype") return new Response(readBounded(join(dirname(snapshotPath), "ui-prototype.html")), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
      if (path === "/" || path === "/map" || path === "/api/map") {
        const snapshot = JSON.parse(readBounded(snapshotPath)) as Snapshot;
        if (path === "/api/map") return Response.json(snapshot, { headers });
        return new Response(await renderSnapshot(snapshot), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
      }
      return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404, headers });
    } catch (error) {
      return Response.json({ error: { code: error instanceof TomeowlError ? error.code : "PREVIEW_ERROR", message: error instanceof Error ? error.message : String(error) } }, { status: error instanceof TomeowlError && error.code === "PREVIEW_NOT_FOUND" ? 404 : 500, headers });
    }
  } });
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2), flags = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      if (!["--snapshot", "--html", "--port"].includes(args[i]) || !args[i + 1] || flags.has(args[i])) throw new TomeowlError("Use --snapshot PATH [--html PATH] [--port 4318]", "INVALID_ARGUMENT");
      flags.set(args[i], args[i + 1]);
    }
    const rawPort = flags.get("--port");
    if (rawPort !== undefined && !/^\d+$/.test(rawPort)) throw new TomeowlError("--port must be an integer", "INVALID_ARGUMENT");
    const server = createPreviewServer({ snapshot: flags.get("--snapshot") ?? "data/design-workspace/workspace.snapshot.json", html: flags.get("--html"), port: rawPort === undefined ? 4318 : Number(rawPort) });
    process.stdout.write(JSON.stringify({ ok: true, url: `http://127.0.0.1:${server.port}`, host: "127.0.0.1", port: server.port }) + "\n");
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: { code: error instanceof TomeowlError ? error.code : "PREVIEW_ERROR", message: error instanceof Error ? error.message : String(error) } }) + "\n"); process.exitCode = 1;
  }
}
