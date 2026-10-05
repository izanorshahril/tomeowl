import { hash, TomeowlError, type Locator, type Relation } from "../domain";

export const MEDIA_CHUNK_CHARS = 3600;
export const MEDIA_OVERLAP_CHARS = 540;
export type MediaPassage = { text: string; locator: Locator; cueStart?: number; cueEnd?: number; cueSpans?: Array<{ ordinal: number; start: number; end: number; charStart: number; charEnd: number }>; charStart?: number; charEnd?: number };
export type CaptionCue = { text: string; start: number; end: number; ordinal: number };
export type ArchivedVideo = {
  id: string; title: string; channel: string; channelUrl: string; url: string;
  description: string; cues: CaptionCue[]; language: string; isGenerated?: boolean;
  descriptionPresent: boolean;
  publishedAt?: string; originalPath: string; rawSha256: string;
};

/** Validate supplied local artifacts; never repair or fetch caption text. */
export function parseArchivedVideo(text: string, expectedId: string, originalPath: string, maxCues = 20_000): ArchivedVideo {
  let value: any;
  try { value = JSON.parse(text); } catch { throw new TomeowlError("Invalid transcript JSON", "INVALID_TRANSCRIPT"); }
  if (!value || value.video_id !== expectedId || !/^[\w-]{11}$/.test(expectedId)
    || typeof value.title !== "string" || !value.title.trim()
    || typeof value.author_name !== "string" || !value.author_name.trim()
    || typeof value.author_url !== "string" || !Array.isArray(value.snippets)
    || !value.snippets.length || value.snippets.length > maxCues) {
    throw new TomeowlError(`Invalid video identity/metadata: ${expectedId}`, "INVALID_TRANSCRIPT");
  }
  let channelUrl: URL;
  try { channelUrl = new URL(value.author_url); } catch { throw new TomeowlError("Invalid channel URL", "INVALID_TRANSCRIPT"); }
  if (channelUrl.protocol !== "https:" || !["youtube.com", "www.youtube.com"].includes(channelUrl.hostname)
    || channelUrl.username || channelUrl.password || channelUrl.port || channelUrl.search || channelUrl.hash
    || !/^\/(?:@[\w.-]+|(?:channel|c|user)\/[\w.-]+)\/?$/.test(channelUrl.pathname)) throw new TomeowlError("Invalid channel URL", "INVALID_TRANSCRIPT");
  channelUrl.hostname = "www.youtube.com"; channelUrl.pathname = channelUrl.pathname.replace(/\/$/, "");
  let previous = -1;
  const cues: CaptionCue[] = value.snippets.map((row: any, ordinal: number) => {
    const start = row?.start, end = row?.end ?? (typeof row?.duration === "number" ? start + row.duration : undefined);
    if (typeof row?.text !== "string" || !row.text.trim() || typeof start !== "number" || typeof end !== "number"
      || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start < previous) {
      throw new TomeowlError(`Invalid caption cue ${ordinal}: ${expectedId}`, "INVALID_TRANSCRIPT");
    }
    previous = start;
    return { text: row.text, start, end, ordinal };
  });
  if (value.total_snippets !== undefined && value.total_snippets !== cues.length) throw new TomeowlError("Caption count mismatch", "INVALID_TRANSCRIPT");
  return {
    id: expectedId, title: value.title.trim(), channel: value.author_name.trim(), channelUrl: channelUrl.href,
    url: `https://www.youtube.com/watch?v=${expectedId}`, description: typeof value.description === "string" ? value.description : "", descriptionPresent: typeof value.description === "string",
    cues, language: typeof value.language_code === "string" ? value.language_code : "unknown", isGenerated: typeof value.is_generated === "boolean" ? value.is_generated : undefined,
    ...(typeof value.published_at === "string" ? { publishedAt: value.published_at } : {}), originalPath, rawSha256: hash(text),
  };
}

/** QMD-inspired character approximation, not its embedding tokenizer or inference path. */
function safeBoundary(text: string, offset: number) {
  return offset > 0 && offset < text.length && /[\uDC00-\uDFFF]/.test(text[offset]!) && /[\uD800-\uDBFF]/.test(text[offset - 1]!) ? offset - 1 : offset;
}
export function descriptionPassages(text: string): MediaPassage[] {
  const out: MediaPassage[] = [];
  for (let start = 0; start < text.length;) {
    let end = safeBoundary(text, Math.min(text.length, start + MEDIA_CHUNK_CHARS));
    if (end < text.length) {
      const tail = text.slice(start + Math.floor(MEDIA_CHUNK_CHARS * .8), end);
      const boundaries = [...tail.matchAll(/\n|[.!?]\s/gu)];
      if (boundaries.length) end = start + Math.floor(MEDIA_CHUNK_CHARS * .8) + boundaries.at(-1)!.index! + 1;
    }
    const body = text.slice(start, end);
    if (body.trim()) out.push({ text: body, charStart: start, charEnd: end, locator: {
      lineStart: text.slice(0, start).split("\n").length,
      lineEnd: text.slice(0, end).split("\n").length,
    } });
    if (end === text.length) break;
    start = safeBoundary(text, Math.max(start + 1, end - MEDIA_OVERLAP_CHARS));
  }
  return out;
}

/** Cue boundaries win over exact overlap; oversized cues keep their original timestamp and ordinal. */
export function transcriptPassages(cues: readonly CaptionCue[]): MediaPassage[] {
  const pieces = cues.flatMap(cue => {
    const result: Array<CaptionCue & { charStart: number; charEnd: number }> = [];
    for (let offset = 0; offset < cue.text.length;) {
      const end = safeBoundary(cue.text, Math.min(cue.text.length, offset + MEDIA_CHUNK_CHARS));
      result.push({ ...cue, text: cue.text.slice(offset, end), charStart: offset, charEnd: end }); offset = end;
    }
    return result;
  });
  const out: MediaPassage[] = [];
  for (let start = 0; start < pieces.length;) {
    let end = start, chars = 0;
    while (end < pieces.length && chars + pieces[end]!.text.length + (end > start ? 1 : 0) <= MEDIA_CHUNK_CHARS) {
      chars += pieces[end]!.text.length + (end > start ? 1 : 0); end++;
    }
    const selected = pieces.slice(start, end);
    out.push({ text: selected.map(cue => cue.text).join("\n"),
      locator: { startSeconds: selected[0]!.start, endSeconds: Math.max(...selected.map(cue => cue.end)) },
      cueStart: selected[0]!.ordinal, cueEnd: selected.at(-1)!.ordinal,
      cueSpans: selected.map(cue => ({ ordinal: cue.ordinal, start: cue.start, end: cue.end, charStart: cue.charStart, charEnd: cue.charEnd })) });
    if (end === pieces.length) break;
    let next = end, overlap = 0;
    while (next > start + 1 && overlap + pieces[next - 1]!.text.length + 1 <= MEDIA_OVERLAP_CHARS) {
      next--; overlap += pieces[next]!.text.length + 1;
    }
    start = next;
  }
  return out;
}

export type LexicalPassage = { id: string; videoId: string; layer: "description" | "transcript"; text: string };
export type LexicalLink = Pick<Relation, "id" | "source" | "target" | "kind" | "basis"> & { score: number; sharedTerms: string[] };
export const MEDIA_STOP_WORDS = new Set("the and that this with from you your for are was were have has had not but can will would could should what when where which how who they their them our about into more also just like then than there here been being some all any get got make know want one two use using used video channel subscribe subscription link links youtube com https www http follow thank thanks watch description transcript click hello yeah really please today okay right don't it's i'm we're that's let's".split(" "));

/** Bounded TF-IDF token overlap; scores are lexical heuristics, never embedding similarity. */
export function lexicalPassageLinks(passages: readonly LexicalPassage[]): LexicalLink[] {
  if (passages.length > 2048) throw new TomeowlError("Lexical graph exceeds 2048 passages", "INPUT_TOO_LARGE");
  const vectors = passages.map(p => {
    const terms = new Map<string, number>();
    for (const token of p.text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
      if (token.length < 3 || token.length > 48 || MEDIA_STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
      terms.set(token, (terms.get(token) ?? 0) + 1);
    }
    return new Map([...terms].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 256));
  });
  const postings = new Map<string, number[]>();
  vectors.forEach((terms, i) => terms.forEach((_, token) => { const ids = postings.get(token) ?? []; ids.push(i); postings.set(token, ids); }));
  const norms = vectors.map(terms => {
    let sum = 0;
    for (const [token, count] of terms) {
      const df = postings.get(token)!.length;
      if (df > 64 || (passages.length >= 8 && df > passages.length * .5)) { terms.delete(token); continue; }
      const weight = (1 + Math.log(count)) * Math.log(1 + passages.length / (1 + df));
      terms.set(token, weight); sum += weight * weight;
    }
    return Math.sqrt(sum);
  });
  const candidates: Array<LexicalLink> = [];
  vectors.forEach((terms, i) => {
    const overlaps = new Map<number, number>();
    terms.forEach((_, token) => (postings.get(token) ?? []).forEach(j => { if (j > i && vectors[j]!.has(token)) overlaps.set(j, (overlaps.get(j) ?? 0) + 1); }));
    for (const [j, shared] of [...overlaps].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 200)) {
      const a = passages[i]!, b = passages[j]!;
      if (shared < 3 || (a.videoId === b.videoId && a.layer === b.layer) || !norms[i] || !norms[j]) continue;
      let dot = 0;
      const sharedTerms: string[] = [];
      for (const [token, weight] of terms) if (vectors[j]!.has(token)) { dot += weight * vectors[j]!.get(token)!; sharedTerms.push(token); }
      const score = dot / (norms[i]! * norms[j]!);
      if (score < .28) continue;
      const [source, target] = [a.id, b.id].sort();
      candidates.push({ id: hash(`lexical\0${source}\0${target}`).slice(0, 32), source, target, kind: "similar", basis: "lexical", score,
        sharedTerms: sharedTerms.sort((x, y) => terms.get(y)! * vectors[j]!.get(y)! - terms.get(x)! * vectors[j]!.get(x)!).slice(0, 8) });
    }
  });
  const degree = new Map<string, number>();
  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).filter(link => {
    if ((degree.get(link.source) ?? 0) >= 2 || (degree.get(link.target) ?? 0) >= 2) return false;
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1); degree.set(link.target, (degree.get(link.target) ?? 0) + 1); return true;
  });
}
