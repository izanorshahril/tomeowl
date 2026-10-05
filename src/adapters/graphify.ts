import { win32, posix } from "node:path";
import { Chunk, Evidence, Relation, Source, TomeowlError, hash } from "../domain";

export type CatalogEntry = { source: Omit<Source, "scope">; chunks: Chunk[] };
export type GraphifyBounds = { maxBytes?: number; maxNodes?: number; maxEdges?: number };
export type GraphifyImport = { relations: Relation[]; warnings: string[] };

const DEFAULT_BOUNDS = { maxBytes: 5_000_000, maxNodes: 20_000, maxEdges: 50_000 };
const MAX_WARNINGS = 100;

function absoluteKey(path: unknown): string | undefined {
  if (typeof path !== "string" || !path || /[\0\r\n]/.test(path)) return undefined;
  if (win32.isAbsolute(path)) return win32.normalize(path).replaceAll("\\", "/").toLowerCase();
  if (posix.isAbsolute(path)) return posix.normalize(path);
  return undefined;
}

function lineRange(value: unknown): [number, number] | undefined {
  const match = typeof value === "number" ? ["", String(value), undefined] : typeof value === "string" ? value.match(/\bL?(\d+)(?:\s*[-:]\s*L?(\d+))?\b/i) : null;
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start ? [start, end] : undefined;
}

function contains(locator: Chunk["locator"], [start, end]: [number, number]): boolean {
  return locator.lineStart !== undefined && locator.lineEnd !== undefined && locator.lineStart <= start && locator.lineEnd >= end;
}

function relationKind(value: string): Relation["kind"] {
  const kind = value.toLowerCase();
  if (kind === "contains") return "contains";
  if (kind === "mentions") return "mentions";
  if (kind.includes("similar") || kind.includes("related")) return "similar";
  return "references";
}

export function parseGraphify(text: string, catalog: ReadonlyMap<string, CatalogEntry>, bounds: GraphifyBounds = {}): GraphifyImport {
  const limit = { ...DEFAULT_BOUNDS, ...bounds };
  if (!Number.isSafeInteger(limit.maxBytes) || limit.maxBytes < 1 || !Number.isSafeInteger(limit.maxNodes) || limit.maxNodes < 1 || !Number.isSafeInteger(limit.maxEdges) || limit.maxEdges < 1) {
    throw new TomeowlError("Graphify bounds must be positive safe integers", "INVALID_BOUNDS");
  }
  if (new TextEncoder().encode(text).byteLength > limit.maxBytes) throw new TomeowlError("Graphify input exceeds the byte limit", "INPUT_TOO_LARGE");

  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new TomeowlError("Graphify input is not valid JSON", "INVALID_GRAPHIFY_JSON"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TomeowlError("Graphify input must be an object", "INVALID_GRAPHIFY_SHAPE");
  const graph = payload as { nodes?: unknown; edges?: unknown; links?: unknown };
  if (!Array.isArray(graph.nodes) || (graph.edges === undefined && graph.links === undefined)) {
    throw new TomeowlError("Graphify input must contain nodes and an edges or links array", "INVALID_GRAPHIFY_SHAPE");
  }
  if ((graph.edges !== undefined && !Array.isArray(graph.edges)) || (graph.links !== undefined && !Array.isArray(graph.links))) {
    throw new TomeowlError("Graphify edges and links must be arrays", "INVALID_GRAPHIFY_SHAPE");
  }
  if (Array.isArray(graph.edges) && Array.isArray(graph.links) && JSON.stringify(graph.edges) !== JSON.stringify(graph.links)) {
    throw new TomeowlError("Graphify input has conflicting edges and links arrays", "AMBIGUOUS_GRAPHIFY_SHAPE");
  }
  const edges = (graph.links ?? graph.edges) as unknown[];
  if (graph.nodes.length > limit.maxNodes || edges.length > limit.maxEdges) throw new TomeowlError("Graphify record count exceeds its limit", "TOO_MANY_RECORDS");

  const byPath = new Map<string, CatalogEntry>();
  const ambiguous = new Set<string>();
  for (const [path, entry] of catalog) {
    const key = absoluteKey(path);
    if (!key) continue;
    if (byPath.has(key) && byPath.get(key)?.source.id !== entry.source.id) ambiguous.add(key);
    else byPath.set(key, entry);
  }

  const warnings: string[] = [];
  let omittedWarnings = 0;
  const warn = (message: string) => warnings.length < MAX_WARNINGS ? warnings.push(message) : omittedWarnings++;
  const nodes = new Map<string, { entry: CatalogEntry; key: string }>();
  const invalidNodes = new Set<string>();
  for (const value of graph.nodes) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { warn("Skipped null or malformed node record."); continue; }
    const node = value as Record<string, unknown>;
    const id = typeof node.id === "string" ? node.id : "";
    if (!id) { warn("Skipped node without a string id."); continue; }
    const key = absoluteKey(node.source_file);
    if (!key) { invalidNodes.add(id); warn(`Skipped node ${id}: source_file is missing or not absolute.`); continue; }
    const entry = byPath.get(key);
    if (!entry || ambiguous.has(key)) { invalidNodes.add(id); warn(`Skipped node ${id}: source path is not uniquely indexed (${String(node.source_file)}).`); continue; }
    if (node.source_revision !== entry.source.revision) { invalidNodes.add(id); warn(`Skipped node ${id}: source revision is missing or stale for ${entry.source.path}.`); continue; }
    if (nodes.has(id)) { invalidNodes.add(id); nodes.delete(id); warn(`Skipped duplicate node id ${id}.`); continue; }
    if (!invalidNodes.has(id)) nodes.set(id, { entry, key });
  }

  const relations: Relation[] = [];
  for (const value of edges) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { warn("Skipped null or malformed edge record."); continue; }
    const edge = value as Record<string, unknown>;
    const sourceId = typeof edge.source === "string" ? edge.source : "";
    const targetId = typeof edge.target === "string" ? edge.target : "";
    const sourceNode = nodes.get(sourceId);
    const targetNode = nodes.get(targetId);
    if (!sourceNode || !targetNode) { warn(`Skipped dangling or unvalidated edge ${String(edge.id ?? "(no id)")}.`); continue; }
    if (sourceNode.entry.source.id === targetNode.entry.source.id) { warn(`Skipped same-source edge ${String(edge.id ?? "(no id)")}.`); continue; }

    const evidencePath = absoluteKey(edge.source_file);
    if (!evidencePath || evidencePath !== sourceNode.key) { warn(`Skipped edge ${String(edge.id ?? "(no id)")}: evidence path does not match its source node.`); continue; }
    const evidenceEntry = byPath.get(evidencePath);
    if (!evidenceEntry || ambiguous.has(evidencePath) || edge.source_revision !== evidenceEntry.source.revision) {
      warn(`Skipped edge ${String(edge.id ?? "(no id)")}: source revision is missing or stale.`); continue;
    }
    if (typeof edge.relation !== "string" || !edge.relation.trim() || String(edge.confidence).toUpperCase() !== "EXTRACTED") {
      warn(`Skipped edge ${String(edge.id ?? "(no id)")}: relation is missing or confidence is not EXTRACTED.`); continue;
    }
    const lines = lineRange(edge.source_location);
    if (!lines) { warn(`Skipped edge ${String(edge.id ?? "(no id)")}: source location is not a line citation.`); continue; }
    const chunk = evidenceEntry.chunks.find(item => item.sourceId === evidenceEntry.source.id && item.revision === evidenceEntry.source.revision && contains(item.locator, lines));
    if (!chunk) { warn(`Skipped edge ${String(edge.id ?? "(no id)")}: no current indexed chunk covers its source location.`); continue; }

    const evidence: Evidence = {
      sourceId: evidenceEntry.source.id,
      revision: evidenceEntry.source.revision,
      chunkId: chunk.id,
      quote: chunk.text,
      locator: { lineStart: lines[0], lineEnd: lines[1] },
    };
    const kind = relationKind(edge.relation);
    relations.push({
      id: `graphify:${hash(`${sourceNode.entry.source.id}\0${targetNode.entry.source.id}\0${String(edge.id ?? "")}\0${kind}`).slice(0, 24)}`,
      source: sourceNode.entry.source.id,
      target: targetNode.entry.source.id,
      kind,
      basis: "imported",
      evidence: [evidence],
    });
  }
  if (omittedWarnings) warnings.push(`Omitted ${omittedWarnings} additional Graphify warnings.`);
  return { relations, warnings };
}
