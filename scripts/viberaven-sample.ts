import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { hash, TomeowlError, type Chunk, type Relation, type Source } from "../src/domain";
import { makeSnapshot, openStore, replaceScope, type Staged } from "../src/store";
import { projectMarkdown } from "../src/adapters/qmd";
import { descriptionPassages, lexicalPassageLinks, parseArchivedVideo, transcriptPassages, type ArchivedVideo, type LexicalPassage, type MediaPassage } from "../src/adapters/viberaven";
import type { Snapshot, ViewerSource } from "../src/viewer/types";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 50000;
type ChannelFiles = { folder: string; files: Array<{ id: string; path: string }> };

/** Only the explicit two-level caption archive is read; manifests, code and credentials are excluded. */
export function scanVideoArchive(input: string) {
  const requested = resolve(input);
  if (lstatSync(requested).isSymbolicLink() || !statSync(requested).isDirectory()) throw new TomeowlError("Archive root must be a regular directory", "INVALID_ROOT");
  const root = realpathSync(requested), channels: ChannelFiles[] = [];
  const omissions: Record<string, number> = {};
  const omit = (reason: string) => omissions[reason] = (omissions[reason] ?? 0) + 1;
  let entries = 0, totalVideos = 0;
  const list = (directory: string) => {
    const handle = opendirSync(directory), found = [];
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
        if (++entries > MAX_ENTRIES) throw new TomeowlError("Archive exceeds the directory entry bound", "INPUT_TOO_LARGE");
        found.push(entry);
      }
    } finally { handle.closeSync(); }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  };
  for (const channel of list(root)) {
    if (channel.isSymbolicLink()) { omit("symlinks"); continue; }
    if (!channel.isDirectory() || channel.name.startsWith(".")) continue;
    const selected: ChannelFiles = { folder: channel.name, files: [] };
    const directory = join(root, channel.name);
    for (const video of list(directory)) {
      if (video.isSymbolicLink()) { omit("symlinks"); continue; }
      if (!video.isDirectory() || !/^[\w-]{11}$/.test(video.name)) continue;
      const path = join(directory, video.name, "transcript.json");
      if (!existsSync(path)) { omit("missingJson"); continue; }
      const info = lstatSync(path);
      if (info.isSymbolicLink()) { omit("symlinks"); continue; }
      if (!info.isFile()) { omit("notRegularFile"); continue; }
      totalVideos++;
      if (info.size > MAX_FILE_BYTES) { omit("oversizedJson"); continue; }
      selected.files.push({ id: video.name, path });
    }
    if (selected.files.length) channels.push(selected);
  }
  channels.sort((a, b) => b.files.length - a.files.length || a.folder.localeCompare(b.folder));
  return { root, channels, totalVideos, omissions };
}

function boundedArtifact(path: string) {
  const link = lstatSync(path);
  if (link.isSymbolicLink() || !link.isFile()) throw new TomeowlError("Caption path must be a regular file", "INVALID_TRANSCRIPT");
  const file = openSync(path, "r");
  try {
    const before = fstatSync(file);
    if (!before.isFile() || before.size > MAX_FILE_BYTES || before.ino !== link.ino || before.dev !== link.dev) throw new TomeowlError("Caption exceeds byte limit or changed identity", "SOURCE_CHANGED");
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(file, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    const after = fstatSync(file), finalPath = lstatSync(path);
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || finalPath.isSymbolicLink()
      || finalPath.ino !== before.ino || finalPath.dev !== before.dev) throw new TomeowlError("Caption changed during read; retry when archive is idle", "SOURCE_CHANGED");
    return buffer.subarray(0, length);
  } finally { closeSync(file); }
}

export async function buildVideoSample(options: { root: string; output: string; channels?: number; videosPerChannel?: number; html?: boolean }) {
  const channelLimit = options.channels ?? 4, perChannel = options.videosPerChannel ?? 2;
  if (!Number.isInteger(channelLimit) || channelLimit < 1 || channelLimit > 8 || !Number.isInteger(perChannel) || perChannel < 1 || perChannel > 3) {
    throw new TomeowlError("Use 1–8 channels and 1–3 videos per channel (24 videos maximum)", "INVALID_LIMIT");
  }
  const scan = scanVideoArchive(options.root), output = resolve(options.output);
  const samePath = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;
  let ancestor = output;
  const missing: string[] = [];
  while (!existsSync(ancestor)) { missing.unshift(basename(ancestor)); ancestor = dirname(ancestor); }
  const canonicalOutput = join(realpathSync(ancestor), ...missing);
  if (samePath(canonicalOutput) === samePath(scan.root) || samePath(canonicalOutput).startsWith(samePath(scan.root) + sep)) {
    throw new TomeowlError("Output must be outside the source archive", "INVALID_OUTPUT");
  }
  if (existsSync(output)) throw new TomeowlError("Choose a new output directory; existing samples are not overwritten", "OUTPUT_EXISTS");
  if (!scan.channels.length) throw new TomeowlError("No <channel>/<video-id>/transcript.json artifacts found", "EMPTY_ARCHIVE");
  const selected = scan.channels.slice(0, channelLimit).flatMap(channel => channel.files.slice(0, perChannel));
  const inputs: ArchivedVideo[] = [];
  let totalBytes = 0;
  for (const input of selected) {
    const bytes = boundedArtifact(input.path);
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) throw new TomeowlError("Selected archive exceeds the read byte limit", "INPUT_TOO_LARGE");
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) throw new TomeowlError("Caption JSON must be valid UTF-8", "INVALID_TRANSCRIPT");
    const video = parseArchivedVideo(text, input.id, input.path);
    inputs.push(video);
  }
  const videos = new Map<string, ArchivedVideo>();
  for (const video of inputs) {
    if (videos.has(video.id)) throw new TomeowlError(`Duplicate video identity: ${video.id}`, "INVALID_TRANSCRIPT");
    videos.set(video.id, video);
  }
  const records = join(output, "records"), scope = records;
  const staged: Staged[] = [], metadata = new Map<string, Partial<ViewerSource>>(), relations: Relation[] = [];
  const lexical: LexicalPassage[] = [];
  const lexicalExtras = new Map<string, { score: number; sharedTerms: string[] }>();
  const channelIds = new Map<string, string>();
  const passages = new Map<string, MediaPassage[]>();
  let descriptionChunks = 0, transcriptChunks = 0;
  // Validate the complete selection before writing any output.
  for (const video of inputs) {
    const desc = descriptionPassages(video.description), transcript = transcriptPassages(video.cues);
    descriptionChunks += desc.length; transcriptChunks += transcript.length;
    if (descriptionChunks + transcriptChunks > 2048) throw new TomeowlError("Selection exceeds 2048 passages; reduce videos per channel", "INPUT_TOO_LARGE");
    passages.set(`${video.id}:description`, desc); passages.set(`${video.id}:transcript`, transcript);
  }
  mkdirSync(dirname(output), { recursive: true }); mkdirSync(output); mkdirSync(records);
  const addRecord = (id: string, title: string, text: string, locator: Chunk["locator"], layer: "channel" | "video" | "description" | "transcript", video: ArchivedVideo, extra: Record<string, unknown> = {}) => {
    const path = join(records, `${id}.txt`), revision = hash(text);
    const source: Source = { id, title, path, collection: video.channel, kind: layer === "transcript" ? "transcript" : "document", revision,
      chunkCount: 1, scope, url: layer === "channel" ? video.channelUrl : `${video.url}${locator.startSeconds === undefined ? "" : `&t=${Math.floor(locator.startSeconds)}`}` };
    const chunk: Chunk = { id: hash(`${id}\0${revision}\0${0}`).slice(0, 32), sourceId: id, revision, text, locator, ordinal: 0 };
    writeFileSync(path, text, { flag: "wx" }); staged.push({ source, chunks: [chunk] });
    const channelId = channelIds.get(video.channelUrl)!;
    metadata.set(id, { layer, corpus: "workspace", projectId: channelId, media: {
      channelId, ...(layer === "channel" ? {} : { videoId: video.id, originalPath: video.originalPath, rawSha256: video.rawSha256,
        language: video.language, isGenerated: video.isGenerated }), ...extra,
    } });
    return { source, chunk };
  };
  const contains = (parent: string, target: ReturnType<typeof addRecord>) => {
    const parentRecord = staged.find(row => row.source.id === parent)!, parentChunk = parentRecord.chunks[0]!;
    relations.push({ id: hash(`contains\0${parent}\0${target.source.id}`).slice(0, 32), source: parent, target: target.source.id, kind: "contains", basis: "structural",
      evidence: [
        { sourceId: parent, revision: parentRecord.source.revision, chunkId: parentChunk.id, quote: parentChunk.text, locator: parentChunk.locator },
        { sourceId: target.source.id, revision: target.source.revision, chunkId: target.chunk.id, quote: target.chunk.text, locator: target.chunk.locator },
      ] });
  };
  for (const video of inputs) {
    let channelId = channelIds.get(video.channelUrl);
    if (!channelId) {
      channelId = hash(`viberaven\0channel\0${video.channelUrl}`).slice(0, 32); channelIds.set(video.channelUrl, channelId);
      const body = `Channel: ${video.channel}\nChannel URL: ${video.channelUrl}\n`;
      addRecord(channelId, video.channel, body, { lineStart: 1, lineEnd: body.trimEnd().split("\n").length }, "channel", video);
    }
    const videoId = hash(`viberaven\0video\0${video.id}`).slice(0, 32);
    const body = `Title: ${video.title}\nVideo ID: ${video.id}\nChannel: ${video.channel}\nChannel URL: ${video.channelUrl}\nVideo URL: ${video.url}\nPublished (supplied): ${video.publishedAt ?? "unknown"}\nCaption language: ${video.language}\nGenerated captions: ${video.isGenerated}\nRaw artifact: ${video.originalPath}\nRaw SHA-256: ${video.rawSha256}\nDescription chunks: ${passages.get(`${video.id}:description`)!.length}\nTranscript chunks: ${passages.get(`${video.id}:transcript`)!.length}\n`;
    const record = addRecord(videoId, video.title, body, { lineStart: 1, lineEnd: body.trimEnd().split("\n").length }, "video", video, { parentId: channelId });
    contains(channelId, record);
    for (const layer of ["description", "transcript"] as const) {
      passages.get(`${video.id}:${layer}`)!.forEach((passage, ordinal) => {
        const id = hash(`viberaven\0${video.id}\0${layer}\0${ordinal}`).slice(0, 32);
        const locator = layer === "description" ? { lineStart: 1, lineEnd: passage.text.split("\n").length } : passage.locator;
        const chunk = addRecord(id, `${video.title} · ${layer === "description" ? "Description" : "Transcript"} ${ordinal + 1}`, passage.text, locator, layer, video,
          { parentId: videoId, ordinal, ...(layer === "description" ? { descriptionSha256: hash(video.description), originalField: "description", charStart: passage.charStart,
            charEnd: passage.charEnd, originalLineStart: passage.locator.lineStart, originalLineEnd: passage.locator.lineEnd } : { cueStart: passage.cueStart, cueEnd: passage.cueEnd }) });
        contains(videoId, chunk);
        lexical.push({ id, videoId: video.id, layer, text: passage.text });
      });
    }
  }
  const byId = new Map(staged.map(row => [row.source.id, row]));
  for (const link of lexicalPassageLinks(lexical)) {
    const evidence = [link.source, link.target].map(id => {
      const row = byId.get(id)!, chunk = row.chunks[0]!;
      return { sourceId: id, revision: row.source.revision, chunkId: chunk.id, quote: chunk.text, locator: chunk.locator };
    });
    relations.push({ ...link, evidence }); lexicalExtras.set(link.id, { score: link.score, sharedTerms: link.sharedTerms });
  }
  const db = openStore(join(output, "videos.sqlite"));
  let snapshot: Snapshot;
  try {
    replaceScope(db, scope, staged, relations);
    const base = makeSnapshot(db);
    if (base.relations.length !== relations.length) throw new TomeowlError("Indexed relation evidence failed validation", "INVALID_EVIDENCE");
    const warnings = ["Representative sample: largest channel folders, then stable video IDs; relative publication labels are not treated as dates.",
      "Ownership is directed. Dashed text-overlap links are symmetric lexical heuristics, not semantic or causal assertions.",
      "Raw JSON is preferred because description enrichment can leave the SQLite transcript BLOB at an older revision.",
      ...(Object.keys(scan.omissions).length ? [`Discovery omissions: ${JSON.stringify(scan.omissions)}`] : [])];
    snapshot = { ...base, sources: base.sources.map(source => ({ ...source, ...metadata.get(source.id), excerpt: {
      quote: byId.get(source.id)!.chunks[0]!.text, chunkId: byId.get(source.id)!.chunks[0]!.id, locator: byId.get(source.id)!.chunks[0]!.locator,
    } })), relations: base.relations.map(relation => ({ ...relation, ...lexicalExtras.get(relation.id), directed: relation.kind === "contains" })),
    media: { name: "Viberaven video archive", channelCount: channelIds.size, totalChannels: scan.channels.length, videoCount: inputs.length,
      totalVideos: scan.totalVideos, descriptionChunks, transcriptChunks, lexicalLinks: lexicalExtras.size, warnings } };
  } finally { db.close(); }
  const qmd = join(output, "qmd"); mkdirSync(qmd);
  for (const row of staged) {
    const projected = projectMarkdown(row.source, row.chunks);
    writeFileSync(join(qmd, `${row.source.id}.md`), projected.markdown, { flag: "wx" });
  }
  const snapshotPath = join(output, "videos.snapshot.json"); writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), { flag: "wx" });
  const sourceManifest = { schemaVersion: 1, capturedAt: snapshot.generatedAt, archiveRoot: scan.root, source: "raw-json", totalBytes,
    selection: { channels: channelLimit, videosPerChannel: perChannel, method: "largest-folders-then-video-id" }, omissions: scan.omissions,
    chunks: { maxChars: 3600, descriptionOverlapChars: 540, transcriptOverlap: "whole cues up to 540 characters" },
    lexical: { method: "TF-IDF cosine token overlap", minimumScore: .28, minimumSharedTerms: 3, maximumDegree: 2, maximumPassages: 2048 },
    artifacts: inputs.map(video => ({ videoId: video.id, channelUrl: video.channelUrl, originalPath: video.originalPath, rawSha256: video.rawSha256,
      descriptionSha256: hash(video.description), cues: video.cues.length, publishedAt: video.publishedAt })),
    recordMetadata: Object.fromEntries(metadata), models: [], tools: { qmd: "optional Markdown projection only", graphify: "evidence-style graph; extraction not run" } };
  writeFileSync(join(output, "provenance.json"), JSON.stringify(sourceManifest, null, 2), { flag: "wx" });
  if (options.html !== false) {
    const { renderSnapshot } = await import("../src/viewer/export");
    writeFileSync(join(output, "videos.html"), await renderSnapshot(snapshot), { flag: "wx" });
  }
  return { snapshot, snapshotPath, output, totalBytes };
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2), flags = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      if (!["--root", "--out", "--channels", "--videos-per-channel"].includes(args[i]!) || !args[i + 1] || flags.has(args[i]!)) throw new TomeowlError("Use --root ARCHIVE --out NEW_DIRECTORY [--channels 4] [--videos-per-channel 2]", "INVALID_ARGUMENT");
      flags.set(args[i]!, args[i + 1]!);
    }
    const number = (flag: string, fallback: number) => {
      const value = flags.get(flag); if (value !== undefined && !/^\d+$/.test(value)) throw new TomeowlError(`${flag} must be an integer`, "INVALID_ARGUMENT");
      return value === undefined ? fallback : Number(value);
    };
    const result = await buildVideoSample({ root: flags.get("--root") ?? "D:/Dev/viberaven/transcripts", output: flags.get("--out") ?? "data/viberaven-2026-10-05",
      channels: number("--channels", 4), videosPerChannel: number("--videos-per-channel", 2) });
    process.stdout.write(JSON.stringify({ ok: true, snapshot: result.snapshotPath, html: join(result.output, "videos.html"), stats: result.snapshot.stats, media: result.snapshot.media }) + "\n");
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: { code: error instanceof TomeowlError ? error.code : "VIDEO_SAMPLE_ERROR", message: error instanceof Error ? error.message : String(error) } }) + "\n"); process.exitCode = 1;
  }
}
