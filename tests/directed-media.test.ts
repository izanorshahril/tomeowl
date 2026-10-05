import { expect, test } from "bun:test";
import { directedEdgePath, directedLayout, directedSources } from "../src/viewer/directed-geometry";
import { initialState, restoreView } from "../src/viewer/state";
import { shellMarkup } from "../src/viewer/layout";
import { createRelationshipFocus } from "../src/viewer/relationship-focus";
import type { Snapshot, ViewerSource } from "../src/viewer/types";

const source = (id: string, layer: ViewerSource["layer"], parentId?: string, ordinal?: number): ViewerSource => ({
  id, layer, title: id, path: `${id}.txt`, collection: "Channel", projectId: "channel", corpus: "workspace", kind: "document", revision: "r1", chunkCount: 1,
  media: { channelId: "channel", ...(id === "channel" ? {} : { videoId: "video", parentId }), ordinal },
});
const sources = [source("channel", "channel"), source("video", "video", "channel"), source("description", "description", "video", 0),
  ...Array.from({ length: 420 }, (_, i) => source(`transcript-${i}`, "transcript", "video", i))];
const relations = sources.filter(s => s.media?.parentId).map(s => ({ id: `link-${s.id}`, source: s.media!.parentId!, target: s.id, kind: "contains" as const, basis: "structural" as const, evidence: [] }));
const snapshot: Snapshot = { schemaVersion: 1, generatedAt: "2026-10-05", sources, relations, stats: { sources: sources.length, chunks: sources.length, relations: relations.length },
  media: { name: "Video archive", channelCount: 1, videoCount: 1, descriptionChunks: 1, transcriptChunks: 420, lexicalLinks: 0, totalVideos: 1, warnings: [] } };

test("directed cap preserves selected evidence endpoints and their channel/video ancestors", () => {
  const selected = directedSources(sources, relations, { selectedSourceId: "transcript-419", selectedRelationId: null });
  expect(selected).toHaveLength(400);
  expect(new Set(selected.map(s => s.id)).size).toBe(400);
  expect(selected.map(s => s.id)).toContain("transcript-419");
  expect(selected.map(s => s.id)).toContain("video"); expect(selected.map(s => s.id)).toContain("channel");
  const focus = createRelationshipFocus(sources.map(s => s.id), relations, { selectedSourceId: "transcript-419" });
  expect(focus.distances.get("video")).toBe(1); expect(focus.distances.get("channel")).toBe(2);
});

test("four role bands are deterministic and show sibling branches without invented chains", () => {
  const layout = directedLayout(sources);
  expect(layout).toEqual(directedLayout([...sources].reverse()));
  expect(layout.positions.size).toBe(sources.length);
  expect(layout.bands.map(b => b.layer)).toEqual(["channel", "video", "description", "transcript"]);
  expect(layout.positions.get("channel")!.x).toBeLessThan(layout.positions.get("video")!.x);
  expect(layout.positions.get("video")!.x).toBeLessThan(layout.positions.get("description")!.x);
  expect(layout.positions.get("video")!.x).toBeLessThan(layout.positions.get("transcript-0")!.x);
  expect([...layout.positions.values()].every(p => Number.isFinite(p.x + p.y + p.z))).toBe(true);
  expect(directedEdgePath({ x: 0, y: 0 }, { x: 100, y: 10 }, true)).not.toBe(directedEdgePath({ x: 0, y: 0 }, { x: 100, y: 10 }, false));
});

test("media defaults and controls are isolated from the frozen workspace preferences", () => {
  expect(initialState(snapshot).mode).toBe("directed"); expect(initialState(snapshot).surface).toBe("map");
  const plain = { ...snapshot, media: undefined };
  expect(initialState(plain).mode).toBe("constellation"); expect(initialState(plain).surface).toBe("center");
  expect(restoreView(plain, { mode: "directed" }).mode).toBe("constellation");
  expect(restoreView(snapshot, { mode: "directed" }, true).motion).toBe(false);
  expect(shellMarkup(snapshot)).toContain('data-form="directed"'); expect(shellMarkup(plain)).not.toContain('data-form="directed"');
});
