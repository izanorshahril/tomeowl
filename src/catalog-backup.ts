import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync, openSync, readSync, closeSync, fstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import type { Database } from "bun:sqlite";
import { TomeowlError } from "./domain";
import { assertEmptyDirectory } from "./cli-guards";
import { openExistingStore } from "./store";
import { readCollectionManifest, type CollectionManifest } from "./collection-manifest";

const MAX_DATABASE_BYTES = 256 * 1024 * 1024;
function checksum(file: string) {
  const fd = openSync(file, "r");
  try {
    if (!fstatSync(fd).isFile()) throw new TomeowlError("Checksum input must be a regular file", "INVALID_BACKUP");
    const digest = createHash("sha256"), buffer = Buffer.alloc(65536);
    let total = 0;
    while (true) {
      const read = readSync(fd, buffer, 0, Math.min(buffer.length, MAX_DATABASE_BYTES + 1 - total), null);
      if (!read) return digest.digest("hex");
      total += read;
      if (total > MAX_DATABASE_BYTES) throw new TomeowlError("Checksum input exceeds backup limit", "BACKUP_LIMIT");
      digest.update(buffer.subarray(0, read));
    }
  } finally { closeSync(fd); }
}
function present(file: string) {
  try { lstatSync(file); return true; }
  catch (error) { if ((error as {code?:string}).code === "ENOENT") return false; throw error; }
}
function regular(file: string, max: number) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new TomeowlError("Backup input must be a bounded regular file", "INVALID_BACKUP");
}
function integrity(db: Database) {
  const checks = db.query("PRAGMA quick_check").all() as Array<Record<string, string>>;
  if (checks.length !== 1 || Object.values(checks[0])[0] !== "ok") throw new TomeowlError("Catalog integrity check failed", "INVALID_BACKUP");
}

/** Snapshot all catalog tables into a fresh bundle; original documents are outside its scope. */
export function backupCatalog(db: Database, out: string, collections?: CollectionManifest) {
  const pages = db.query("PRAGMA page_count").get() as { page_count: number };
  const size = db.query("PRAGMA page_size").get() as { page_size: number };
  if (pages.page_count * size.page_size > MAX_DATABASE_BYTES) throw new TomeowlError("Backup exceeds 256 MiB catalog limit", "BACKUP_LIMIT");
  const directory = resolve(out);
  assertEmptyDirectory(directory);
  integrity(db);
  mkdirSync(directory, { recursive: true });
  const catalog = join(directory, "catalog.sqlite");
  // SQLite creates a consistent snapshot through its engine, including committed WAL data.
  db.query("VACUUM INTO ?").run(catalog);
  regular(catalog, MAX_DATABASE_BYTES);
  const saved = openExistingStore(catalog);
  try { integrity(saved); } finally { saved.close(); }
  if (collections) writeFileSync(join(directory, "collections.json"), JSON.stringify(collections, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  const manifest = {
    schemaVersion: 1, createdAt: new Date().toISOString(), catalogSha256: checksum(catalog),
    catalogBytes: lstatSync(catalog).size,
    collectionsSha256: collections ? checksum(join(directory, "collections.json")) : null,
    scope: "catalog-and-captured-evidence", originalsIncluded: false,
  };
  writeFileSync(join(directory, "backup.json"), JSON.stringify(manifest, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return { directory, ...manifest };
}

/** Restore into a new file only, preserving any existing catalog. */
export function restoreCatalog(from: string, target: string) {
  const directory = resolve(from), destination = resolve(target);
  const catalog = join(directory, "catalog.sqlite"), metadata = join(directory, "backup.json");
  regular(metadata, 16384); regular(catalog, MAX_DATABASE_BYTES);
  let record: Record<string, unknown>;
  try { record = JSON.parse(readFileSync(metadata, "utf8")); } catch { throw new TomeowlError("Malformed backup metadata", "INVALID_BACKUP"); }
  if (!record || record.schemaVersion !== 1 || typeof record.catalogSha256 !== "string" || checksum(catalog) !== record.catalogSha256) {
    throw new TomeowlError("Backup checksum or version does not match", "INVALID_BACKUP");
  }
  let collections: CollectionManifest | undefined;
  if (record.collectionsSha256 !== null) {
    const manifestFile = join(directory, "collections.json"); regular(manifestFile, 1024 * 1024);
    if (typeof record.collectionsSha256 !== "string" || checksum(manifestFile) !== record.collectionsSha256) throw new TomeowlError("Collection manifest checksum differs", "INVALID_BACKUP");
    collections = readCollectionManifest(manifestFile);
  }
  const restoredManifest = destination + ".collections.json";
  const occupied = [destination, destination+"-wal", destination+"-shm", destination+"-journal", ...(collections ? [restoredManifest] : [])];
  if (occupied.some(present)) throw new TomeowlError("Restore requires a new database destination without existing sidecars or manifest", "RESTORE_TARGET_EXISTS");
  const source = openExistingStore(catalog);
  try { integrity(source); } finally { source.close(); }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(catalog, destination, constants.COPYFILE_EXCL);
  if (collections) writeFileSync(restoredManifest, JSON.stringify(collections, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return { database: destination, catalogSha256: record.catalogSha256, collections: collections ? restoredManifest : null, originalsIncluded: false };
}

export function catalogStatus(db: Database) {
  const count = (table: string) => (db.query(`SELECT COUNT(*) count FROM ${table}`).get() as { count: number }).count;
  const hasMemory = !!db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tomeowl_memories'").get();
  const collections = db.query("SELECT collection,scope,COUNT(*) sources FROM sources GROUP BY collection,scope ORDER BY collection,scope LIMIT 101").all();
  const packet = {
    schemaVersion: 1, freshness: "indexed-revisions", counts: { sources: count("sources"), chunks: count("chunks"), relations: count("relations") },
    collections: collections.slice(0,100), truncated: collections.length > 100,
    memoryAvailable: hasMemory, originalFreshnessVerified: false,
  };
  while (Buffer.byteLength(JSON.stringify({ok:true,...packet})+"\n") > 65536 && packet.collections.length) {
    packet.collections.pop(); packet.truncated = true;
  }
  return packet;
}
