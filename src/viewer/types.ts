export type Locator = {
  lineStart?: number;
  lineEnd?: number;
  startSeconds?: number;
  endSeconds?: number;
};

export type Evidence = {
  sourceId: string;
  revision: string;
  chunkId: string;
  quote: string;
  locator: Locator;
};

export type ViewerSource = {
  id: string;
  title: string;
  path: string;
  collection: string;
  kind: "document" | "transcript";
  revision: string;
  chunkCount: number;
  url?: string;
  excerpt?: { quote: string; locator?: Locator; chunkId?: string };
  projectId?: string;
  layer?: SourceLayer;
  corpus?: "workspace" | "literature";
  media?: {
    channelId: string; videoId?: string; ordinal?: number; parentId?: string;
    originalPath?: string; rawSha256?: string; descriptionSha256?: string;
    language?: string; isGenerated?: boolean; cueStart?: number; cueEnd?: number;
    originalField?: "description"; charStart?: number; charEnd?: number; originalLineStart?: number; originalLineEnd?: number;
  };
};

export type SourceLayer = "project" | "guidance" | "skill" | "app" | "document" | "research" | "citation" | "channel" | "video" | "description" | "transcript";

export type ViewerRelation = {
  id: string;
  source: string;
  target: string;
  kind: "contains" | "mentions" | "similar" | "references";
  basis: "structural" | "lexical" | "imported";
  evidence: Evidence[];
  score?: number;
  sharedTerms?: string[];
  directed?: boolean;
};

export type Snapshot = {
  schemaVersion: 1;
  generatedAt: string;
  stats: { sources: number; chunks: number; relations: number };
  sources: ViewerSource[];
  relations: ViewerRelation[];
  media?: {
    name: string; channelCount: number; videoCount: number; descriptionChunks: number;
    transcriptChunks: number; lexicalLinks: number; totalVideos: number; totalChannels?: number; warnings: string[];
  };
  sample?: {
    name: string; workspaceRoot: string;
    projects: Array<{ id: string; title: string; path: string; sourceIds: string[]; coverage?: { discoveredFiles:number; selectedFiles:number; omissions:Record<string,number> } }>;
    scan: {
      projectCount: number; selectedFiles: number; researchFiles: number; citationRecords: number; discoveredProjects?:number; discoveredFiles?:number;
      omissions: Record<string, number>; warnings: string[];
      bounds: { maxDepth: number; filesPerProject: number; maxFileBytes: number; maxTotalBytes: number; maxResearchFiles: number; maxCitationRecords: number };
    };
  };
};

export type Point = { x: number; y: number };

export type ViewerState = {
  mode: "cluster" | "rings" | "constellation" | "orbital" | "directed";
  query: string;
  selectedSourceId: string | null;
  selectedRelationId: string | null;
  orbitSpeed: number;
  glow: boolean;
  motion: boolean;
  sound: boolean;
  zoom: number;
  pan: Point;
  fitRequested: boolean;
  corpus: "workspace" | "literature";
  dimension: "2d" | "3d";
  surface: "center" | "map";
  mapExpanded: boolean;
  layer: SourceLayer | "all";
  groupId: string | null;
  labels: boolean;
  profile: "engineer" | "presentation" | "contrast";
  camera: { yaw: number; pitch: number };
};
