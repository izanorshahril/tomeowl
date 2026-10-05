import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { TomeowlError } from "./domain";
import type { CollectionInput } from "./ingest";

export type CollectionManifest = { schemaVersion: 1; collections: CollectionInput[] };

/** Root bindings are relative to the manifest, while collection IDs remain portable. */
export function readCollectionManifest(file: string): CollectionManifest {
  const path = resolve(file);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
    throw new TomeowlError("Collection manifest must be a regular file of at most 1 MiB", "INVALID_MANIFEST");
  }
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new TomeowlError("Collection manifest must contain valid JSON", "INVALID_MANIFEST"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TomeowlError("Invalid collection manifest", "INVALID_MANIFEST");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || !Array.isArray(input.collections) || !input.collections.length || input.collections.length > 64) {
    throw new TomeowlError("Manifest requires schemaVersion 1 and 1-64 collections", "INVALID_MANIFEST");
  }
  const ids = new Set<string>(), roots = new Set<string>();
  const collections = input.collections.map((entry: unknown): CollectionInput => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TomeowlError("Invalid collection binding", "INVALID_MANIFEST");
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(row.id) ||
      typeof row.name !== "string" || !row.name.trim() || row.name.length > 200 || row.name.includes("\0") ||
      typeof row.root !== "string" || !row.root.trim() || row.root.includes("\0") || row.root.length > 4096) {
      throw new TomeowlError("Collection requires a valid stable id, name and directory root", "INVALID_MANIFEST");
    }
    const root = resolve(dirname(path), row.root);
    const rootKey = process.platform === "win32" ? root.replace(/[A-Z]/g, c => c.toLowerCase()) : root;
    if (ids.has(row.id) || roots.has(rootKey)) throw new TomeowlError("Collection IDs and roots must be unique", "INVALID_MANIFEST");
    ids.add(row.id); roots.add(rootKey);
    return { id: row.id, name: row.name, root };
  });
  return { schemaVersion: 1, collections };
}
