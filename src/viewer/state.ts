import type { Snapshot, ViewerState } from "./types";
import { corpusOf, groupOf, layerOrder } from "./projection";
import { CURRENT_MOTION_SPEED } from "./motion";

export const initialState = (snapshot: Snapshot): ViewerState => ({
  mode: snapshot.media ? "directed" : "constellation", query: "", selectedSourceId: null, selectedRelationId: null,
  orbitSpeed: CURRENT_MOTION_SPEED, glow: true, motion: true,
  sound: false, zoom: 1, pan: { x: 0, y: 0 }, fitRequested: true,
  corpus: snapshot.sources.some(s => s.corpus === "workspace") || !snapshot.sources.some(s => s.corpus === "literature") ? "workspace" : "literature",
  dimension: "2d", surface: snapshot.media ? "map" : "center", mapExpanded: true, layer: "all", groupId: null, labels: true, profile: "engineer", camera: { yaw: -0.25, pitch: 0.32 },
});

export function restoreView(snapshot: Snapshot, value: unknown, reducedMotion = false): ViewerState {
  const state = initialState(snapshot);
  if (!value || typeof value !== "object" || Array.isArray(value)) { state.motion = !reducedMotion; return state; }
  const saved = value as Partial<ViewerState>;
  if (["engineer", "presentation", "contrast"].includes(saved.profile!)) state.profile = saved.profile!;
  if (["cluster", "rings", "constellation", "orbital"].includes(saved.mode!)) state.mode = saved.mode!;
  if (snapshot.media && saved.mode === "directed") state.mode = "directed";
  if (["2d", "3d"].includes(saved.dimension!)) state.dimension = saved.dimension!;
  if (["center", "map"].includes(saved.surface!)) state.surface = saved.surface!;
  if (["workspace", "literature"].includes(saved.corpus!) && snapshot.sources.some(s => corpusOf(s) === saved.corpus)) state.corpus = saved.corpus!;
  if (typeof saved.groupId === "string" && snapshot.sources.some(s => corpusOf(s) === state.corpus && groupOf(s) === saved.groupId)) state.groupId = saved.groupId;
  if (saved.layer === "all" || layerOrder.includes(saved.layer!)) state.layer = saved.layer!;
  if (typeof saved.query === "string") state.query = saved.query.slice(0, 500);
  if (typeof saved.selectedSourceId === "string" && snapshot.sources.some(s => s.id === saved.selectedSourceId)) state.selectedSourceId = saved.selectedSourceId;
  for (const key of ["glow", "labels", "motion", "mapExpanded"] as const) if (typeof saved[key] === "boolean") state[key] = saved[key]!;
  if (typeof saved.orbitSpeed === "number" && Number.isFinite(saved.orbitSpeed)) state.orbitSpeed = Math.max(0, Math.min(CURRENT_MOTION_SPEED, saved.orbitSpeed));
  if (saved.camera && Number.isFinite(saved.camera.yaw) && Number.isFinite(saved.camera.pitch)) state.camera = {yaw: saved.camera.yaw % (Math.PI * 2), pitch: Math.max(-1.1, Math.min(1.1, saved.camera.pitch))};
  if (typeof saved.zoom === "number" && Number.isFinite(saved.zoom) && saved.zoom >= .08 && saved.zoom <= 3 && saved.pan && Number.isFinite(saved.pan.x) && Number.isFinite(saved.pan.y) && Math.abs(saved.pan.x) < 1e6 && Math.abs(saved.pan.y) < 1e6) {
    state.zoom = saved.zoom; state.pan = {...saved.pan}; state.fitRequested = false;
  }
  if (reducedMotion || state.profile === "contrast") state.motion = false;
  state.sound = false;
  return state;
}

export function savedView(state: ViewerState) {
  const { profile, mode, glow, labels, corpus, groupId, layer, query, dimension, surface, mapExpanded, camera, motion, orbitSpeed, zoom, pan, selectedSourceId } = state;
  return { profile, mode, glow, labels, corpus, groupId, layer, query, dimension, surface, mapExpanded, camera, motion, orbitSpeed, zoom, pan, selectedSourceId };
}

export function compactMapLabel(title: string, limit = 44) {
  const chars = Array.from(title);
  return chars.length <= limit ? title : `${chars.slice(0, limit - 1).join("")}…`;
}
