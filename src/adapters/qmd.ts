import { Chunk, Source, TomeowlError, hash } from "../domain";

export type MarkdownProjection = { relativePath: string; markdown: string };

function fence(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  return "`".repeat(Math.max(3, ...runs.map(run => run.length + 1)));
}

export function projectMarkdown(source: Omit<Source, "scope">, chunks: Chunk[]): MarkdownProjection {
  if (chunks.some(chunk => chunk.sourceId !== source.id || chunk.revision !== source.revision)) {
    throw new TomeowlError("QMD projection requires chunks from the current source revision", "STALE_CHUNKS");
  }

  const lines = [
    `# ${JSON.stringify(source.title)}`,
    "",
    `Source ID: ${JSON.stringify(source.id)}`,
    `Source: ${JSON.stringify(source.path)}`,
    `Collection: ${JSON.stringify(source.collection)}`,
    `Revision: ${JSON.stringify(source.revision)}`,
  ];
  for (const chunk of chunks) {
    const locator = chunk.locator.lineStart === undefined
      ? chunk.locator.startSeconds === undefined ? "unknown" : `${chunk.locator.startSeconds}-${chunk.locator.endSeconds ?? chunk.locator.startSeconds}s`
      : `${chunk.locator.lineStart}-${chunk.locator.lineEnd ?? chunk.locator.lineStart}`;
    const marker = fence(chunk.text);
    lines.push("", `## Evidence ${JSON.stringify(chunk.id)} (${locator})`, "", marker, chunk.text, marker);
  }

  return { relativePath: `sources/${hash(source.path).slice(0, 24)}.md`, markdown: `${lines.join("\n")}\n` };
}
