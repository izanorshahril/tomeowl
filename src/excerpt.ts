import type { Locator, SearchResult } from "./domain";

const normalize = (word: string) => word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
type Match = "any" | "all" | "phrase";
/** Internal relevance data; never part of a public search/context citation. */
export type MatchSpan = { start: number; end: number; groups: number[] };
export type MatchedHit = SearchResult & { matchSpans?: MatchSpan[] };
const words = (text: string) => [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)]
  .map(word => ({ value: normalize(word[0]), start: word.index!, end: word.index! + word[0].length }));

function queryGroups(query: string, match: Match) {
  const literal = (query.match(/[\p{L}\p{N}_]+/gu) ?? []).map(term => words(term).map(word => word.value)).filter(group => group.length);
  const groups = match === "phrase" ? [literal.flat()] : literal;
  return [...new Map(groups.map(group => [JSON.stringify(group), group])).values()];
}

/** Approximation is used for window scoring and the rare marker-collision fallback. */
function lexicalSpans(text: string, groups: string[][], offset = 0): MatchSpan[] {
  const tokens = words(text), first = new Map<string, number[]>(), spans = new Map<string, MatchSpan>();
  groups.forEach((group, index) => first.set(group[0], [...(first.get(group[0]) ?? []), index]));
  for (let index = 0; index < tokens.length; index++) for (const groupId of first.get(tokens[index].value) ?? []) {
    const group = groups[groupId];
    if (!group.every((value, part) => tokens[index + part]?.value === value)) continue;
    const start = offset + tokens[index].start, end = offset + tokens[index + group.length - 1].end, key = `${start}:${end}`;
    const prior = spans.get(key);
    if (prior) prior.groups.push(groupId);
    else spans.set(key, { start, end, groups: [groupId] });
  }
  return [...spans.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function highlightedSpans(text: string, marked: string): Array<{ start: number; end: number }> | undefined {
  // Original control characters would be indistinguishable from inserted markers.
  if (text.includes("\u0001") || text.includes("\u0002")) return;
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0, offset = 0;
  while (cursor < marked.length) {
    const open = marked.indexOf("\u0001", cursor);
    if (open < 0) break;
    const prefix = marked.slice(cursor, open), close = marked.indexOf("\u0002", open + 1);
    if (prefix.includes("\u0002") || close < 0 || text.slice(offset, offset + prefix.length) !== prefix) return;
    offset += prefix.length;
    const value = marked.slice(open + 1, close);
    if (value.includes("\u0001") || text.slice(offset, offset + value.length) !== value) return;
    spans.push({ start: offset, end: offset + value.length });
    offset += value.length; cursor = close + 1;
  }
  const tail = marked.slice(cursor);
  if (tail.includes("\u0002") || text.slice(offset) !== tail) return;
  return spans;
}

/** Native FTS5 spans select anchors; the original indexed body supplies every quote. */
export function nativeMatchSpans(text: string, marked: string, query: string, match: Match = "any"): MatchSpan[] {
  const groups = queryGroups(query, match), native = highlightedSpans(text, marked);
  if (!native) return lexicalSpans(text, groups);
  if (match === "phrase") return native.map(span => ({ ...span, groups: [0] }));
  return native.flatMap(span => {
    const found = lexicalSpans(text.slice(span.start, span.end), groups, span.start);
    // Unicode61 and JavaScript Unicode folding can differ; retain the verified native anchor.
    return found.length ? found : [{ ...span, groups: [groups.length] }];
  }).sort((a, b) => a.start - b.start || a.end - b.end);
}

function bestSpan(spans: MatchSpan[], maxChars: number, match: Match) {
  if (!spans.length) return { start: 0, end: 0 };
  const firstFitting = spans.find(span => span.end - span.start <= maxChars);
  if (match === "phrase" || new Set(spans.flatMap(span => span.groups)).size <= 1) return firstFitting ?? spans[0];
  let best = spans[0], bestCoverage = best.end - best.start <= maxChars ? best.groups.length : 0;
  const counts = new Map<number, number>();
  const endOrder: number[] = [];
  let left = 0, endHead = 0;
  for (let right = 0; right < spans.length; right++) {
    for (const group of spans[right].groups) counts.set(group, (counts.get(group) ?? 0) + 1);
    // Literal groups can overlap, so a later start need not have the furthest end.
    while (endOrder.length > endHead && spans[endOrder.at(-1)!].end <= spans[right].end) endOrder.pop();
    endOrder.push(right);
    while (left <= right && spans[endOrder[endHead]].end - spans[left].start > maxChars) {
      for (const group of spans[left].groups) {
        const count = counts.get(group)! - 1;
        if (count) counts.set(group, count); else counts.delete(group);
      }
      if (endOrder[endHead] === left) endHead++;
      left++;
    }
    const candidate = left <= right ? { start: spans[left].start, end: spans[endOrder[endHead]].end, groups: [] } : spans[right];
    const coverage = left <= right ? counts.size : 0;
    if (coverage > bestCoverage || coverage === bestCoverage && (candidate.start < best.start || candidate.start === best.start && candidate.end < best.end)) {
      best = candidate; bestCoverage = coverage;
    }
  }
  return best;
}

/** Query-centered, surrogate-safe window with exact offsets in the indexed chunk. */
export function excerpt(text: string, locator: Locator, query: string, maxChars: number, offset = 0, match: Match = "any", spans?: MatchSpan[]) {
  const selected = bestSpan(spans ?? lexicalSpans(text, queryGroups(query, match)), maxChars, match);
  const anchor = selected.start, anchorLength = selected.end - selected.start;
  let start = Math.max(0, anchor - Math.floor(Math.max(0, maxChars - anchorLength) / 2));
  start = Math.min(start, Math.max(0, text.length - maxChars));
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) start++;
  let end = Math.min(text.length, start + maxChars);
  if (end < text.length && end > start && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  const quote = text.slice(start, end);
  const span = { start: offset + start, end: offset + end };
  const located = { ...locator };
  if (locator.lineStart !== undefined && (start || end < text.length)) {
    located.lineStart = locator.lineStart + (text.slice(0, start).match(/\n/g)?.length ?? 0);
    located.lineEnd = located.lineStart + (quote.replace(/\n$/, "").match(/\n/g)?.length ?? 0);
  }
  return { quote, locator: located, shortened: start > 0 || end < text.length, span };
}

export function excerptHit(hit: MatchedHit, query: string, maxChars: number, match: Match = "any"): SearchResult {
  const { matchSpans, ...citation } = hit;
  const window = excerpt(hit.quote, hit.locator, query, maxChars, hit.excerpt?.start ?? 0, match, matchSpans);
  return { ...citation, quote: window.quote, locator: window.locator,
    ...(window.shortened || hit.quoteTruncated ? { quoteTruncated: true, excerpt: window.span } : {}) };
}
