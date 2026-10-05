export type Locator = { lineStart?: number; lineEnd?: number; startSeconds?: number; endSeconds?: number };
export type SourceKind = "document" | "transcript";
export type RelationKind = "contains" | "mentions" | "similar" | "references";
export type Evidence = { sourceId: string; revision: string; chunkId: string; quote: string; locator: Locator };
export type Source = {
  id: string; title: string; path: string; collection: string; kind: SourceKind;
  revision: string; chunkCount: number; scope: string; url?: string;
};
export type Chunk = { id: string; sourceId: string; revision: string; text: string; locator: Locator; ordinal: number };
export type SearchResult = {
  sourceId: string; title: string; path: string; collection: string; revision: string;
  score: number; quote: string; locator: Locator; chunkId: string; quoteTruncated?: boolean;
  /** Exact half-open UTF-16 offsets within the indexed chunk when quote is a subspan. */
  excerpt?: { start: number; end: number };
};
export type Relation = { id: string; source: string; target: string; kind: RelationKind; basis: "structural" | "lexical" | "imported"; evidence: Evidence[] };
export type SourceExcerpt = { quote: string; locator: Locator; chunkId: string };
export type Snapshot = {
  schemaVersion: 1; generatedAt: string;
  stats: { sources: number; chunks: number; relations: number };
  sources: Array<Omit<Source, "scope"> & { excerpt?: SourceExcerpt }>;
  relations: Relation[];
};
export class TomeowlError extends Error {
  constructor(message: string, readonly code = "TOMEOWL_ERROR") { super(message); this.name = "TomeowlError"; }
}

import { createHash } from "node:crypto";
export const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
