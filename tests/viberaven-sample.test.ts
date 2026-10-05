import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { descriptionPassages, lexicalPassageLinks, parseArchivedVideo, transcriptPassages } from "../src/adapters/viberaven";
import { buildVideoSample, scanVideoArchive } from "../scripts/viberaven-sample";
import { openExistingStore, sourceDetails } from "../src/store";
import { retrieve } from "../src/retrieval";

const owned: string[] = [];
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() { const root = mkdtempSync(join(tmpdir(), "tomeowl-video-")); owned.push(root); return root; }
function artifact(root: string, id: string, description = "Graph databases preserve evidence.") {
  const dir = join(root, "Example", id); mkdirSync(dir, { recursive: true });
  const value = { video_id: id, title: `Video ${id}`, author_name: "Example", author_url: "https://www.youtube.com/@example", description,
    total_snippets: 2, language_code: "en", is_generated: true, published_at: "2 months ago",
    snippets: [{ start: 0, end: 4, text: "Graph databases preserve evidence and source citations." }, { start: 4, end: 10, text: "Embeddings support retrieval of knowledge from documents." }] };
  const path = join(dir, "transcript.json"), text = JSON.stringify(value); writeFileSync(path, text); return { path, text, value };
}

test("caption validation rejects mismatched IDs and invalid timestamp order", () => {
  const dir = fixture(), input = artifact(dir, "abcdefghijk");
  expect(parseArchivedVideo(input.text, "abcdefghijk", input.path).cues).toHaveLength(2);
  expect(() => parseArchivedVideo(input.text, "XXXXXXXXXXX", input.path)).toThrow("identity");
  input.value.snippets[1]!.start = -1;
  expect(() => parseArchivedVideo(JSON.stringify(input.value), "abcdefghijk", input.path)).toThrow("cue");
  input.value.snippets[1]!.start = 4; input.value.author_url = "https://www.youtube.com/watch?v=lmnopqrstuv";
  expect(() => parseArchivedVideo(JSON.stringify(input.value), "abcdefghijk", input.path)).toThrow("channel URL");
});

test("bounded overlapping passages retain all text and real cue/timestamp spans", () => {
  const text = Array.from({ length: 80 }, (_, i) => `Line ${i}: ${"evidence ".repeat(12)}`).join("\n");
  const chunks = descriptionPassages(text);
  expect(chunks.length).toBeGreaterThan(2);
  expect(chunks.every(c => c.text.length <= 3600)).toBe(true);
  expect(chunks[1]!.text.startsWith(chunks[0]!.text.slice(-540))).toBe(true);
  expect(chunks.at(-1)!.text.endsWith(text.slice(-80))).toBe(true);
  const cues = [{ text: "a".repeat(8000), start: 0, end: 9, ordinal: 0 }, { text: "second caption", start: 9, end: 11, ordinal: 1 }];
  const transcript = transcriptPassages(cues);
  expect(transcript.every(c => c.text.length <= 3600)).toBe(true);
  expect(transcript.map(c => c.text).join("").replace("second caption", "")).toBe("a".repeat(8000) + "\n");
  expect(transcript.at(-1)!.locator).toEqual({ startSeconds: 0, endSeconds: 11 });
  expect(transcript.at(-1)!.cueEnd).toBe(1);
  const unicode = "a" + "😀".repeat(4000);
  const safe = descriptionPassages(unicode);
  expect(safe.every(passage => Buffer.from(passage.text).toString("utf8") === passage.text)).toBe(true);
  expect(safe.every(passage => unicode.slice(passage.charStart, passage.charEnd) === passage.text)).toBe(true);
  const emojiTranscript = transcriptPassages([{ text: unicode, start: 0, end: 20, ordinal: 0 }]);
  expect(emojiTranscript.every(passage => Buffer.from(passage.text).toString("utf8") === passage.text)).toBe(true);
  expect(emojiTranscript.map(passage => passage.text).join("")).toBe(unicode);
});

test("lexical links have evidence terms, bounded degree and exclude adjacent same-video captions", () => {
  const passages = [
    { id: "a", videoId: "one", layer: "description" as const, text: "retrieval embedding graph database evidence ranking" },
    { id: "b", videoId: "one", layer: "transcript" as const, text: "retrieval embedding graph database evidence ranking" },
    { id: "c", videoId: "one", layer: "transcript" as const, text: "retrieval embedding graph database evidence ranking" },
    { id: "d", videoId: "two", layer: "transcript" as const, text: "retrieval embedding graph database evidence ranking" },
  ];
  const links = lexicalPassageLinks(passages), degrees = new Map<string, number>();
  expect(links.length).toBeGreaterThan(0);
  expect(links.some(link => link.source === "b" && link.target === "c")).toBe(false);
  for (const link of links) {
    expect(link.basis).toBe("lexical"); expect(link.kind).toBe("similar"); expect(link.sharedTerms.length).toBeGreaterThanOrEqual(3);
    for (const id of [link.source, link.target]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
  }
  expect([...degrees.values()].every(degree => degree <= 2)).toBe(true);
});

test("video sample yields directed siblings, authentic evidence, portable identities and offline retrieval", async () => {
  const dir = fixture(), root = join(dir, "archive"); mkdirSync(root);
  const first = artifact(root, "abcdefghijk"), second = artifact(root, "lmnopqrstuv", "Graph databases preserve evidence and source citations.");
  const output = join(dir, "sample");
  const result = await buildVideoSample({ root, output, html: false });
  expect(result.snapshot.media?.videoCount).toBe(2);
  expect(result.snapshot.media?.channelCount).toBe(1);
  expect(result.snapshot.media?.descriptionChunks).toBe(2);
  expect(result.snapshot.media?.transcriptChunks).toBe(2);
  const byId = new Map(result.snapshot.sources.map(source => [source.id, source]));
  for (const relation of result.snapshot.relations) {
    if (relation.kind === "contains") {
      const parent = byId.get(relation.source)!, child = byId.get(relation.target)!;
      expect([["channel", "video"], ["video", "description"], ["video", "transcript"]]).toContainEqual([parent.layer, child.layer]);
      expect(child.media?.parentId).toBe(parent.id);
      expect(relation.evidence.some(citation => citation.sourceId === parent.id)).toBe(true);
    }
    expect(relation.evidence.length).toBeGreaterThan(0);
    for (const citation of relation.evidence) expect(readFileSync(byId.get(citation.sourceId)!.path, "utf8")).toContain(citation.quote);
  }
  const db = openExistingStore(join(output, "videos.sqlite"));
  try {
    const hits = retrieve(db, "embeddings", 20);
    expect(hits).toHaveLength(2);
    expect(hits.every(hit => hit.locator.startSeconds === 0 && hit.locator.endSeconds === 10)).toBe(true);
    expect(sourceDetails(db, hits[0]!.sourceId).stale).toBe(false);
  } finally { db.close(); }
  expect(readFileSync(first.path, "utf8")).toBe(first.text); expect(readFileSync(second.path, "utf8")).toBe(second.text);
  const moved = await buildVideoSample({ root, output: join(dir, "another"), html: false });
  expect(moved.snapshot.sources.map(source => source.id)).toEqual(result.snapshot.sources.map(source => source.id));
  expect(() => scanVideoArchive(join(dir, "missing"))).toThrow();
  await expect(buildVideoSample({ root, output, html: false })).rejects.toThrow("new output");
  await expect(buildVideoSample({ root, output: join(root, "output"), html: false })).rejects.toThrow("outside");
});

test("description citations use record lines while original UTF-16 spans remain reproducible", async () => {
  const dir = fixture(), root = join(dir, "archive"); mkdirSync(root);
  const description = Array.from({ length: 80 }, (_, i) => `Line ${i}: ${"evidence ".repeat(12)}`).join("\n");
  artifact(root, "abcdefghijk", description);
  const result = await buildVideoSample({ root, output: join(dir, "sample"), html: false });
  for (const source of result.snapshot.sources.filter(s => s.layer === "description")) {
    const text = readFileSync(source.path, "utf8");
    expect(source.excerpt!.locator!.lineStart).toBe(1);
    expect(source.excerpt!.locator!.lineEnd).toBe(text.split("\n").length);
    expect(description.slice(source.media!.charStart, source.media!.charEnd)).toBe(text);
  }
  const alias = join(dir, "alias"); symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
  await expect(buildVideoSample({ root, output: join(alias, "sample"), html: false })).rejects.toThrow("outside");
});
