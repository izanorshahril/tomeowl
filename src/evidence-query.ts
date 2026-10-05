/** Shared SQL guard for literal quote authenticity and locator containment in a current chunk.
 * Arguments are trusted SQL expressions, never user input. IDs/revision joins remain the caller's job.
 * A narrower locator is preserved; the guard verifies its containing chunk, not word-level timestamps.
 */
export function evidencePredicate(chunk: string, evidence: string): string {
  const located = `CASE WHEN json_valid(${chunk}.locator) THEN ${chunk}.locator ELSE '{}' END`;
  const type = (path: string) => `json_type(${evidence},'$.${path}')`;
  const value = (path: string) => `json_extract(${evidence},'$.${path}')`;
  const chunkType = (field: string) => `json_type(${located},'$.${field}')`;
  const chunkValue = (field: string) => `json_extract(${located},'$.${field}')`;
  const numeric = (field: string, line: boolean) => {
    const name = `locator.${field}`, amount = value(name);
    return `(${type(name)} IS NULL OR (${type(name)} ${line ? "='integer'" : "IN ('integer','real')"}
      AND ${amount} BETWEEN ${line ? "1 AND 9007199254740991" : "-1.7976931348623157e308 AND 1.7976931348623157e308"}))`;
  };
  const group = (start: string, end: string, line: boolean) => {
    const first = value(`locator.${start}`), last = value(`locator.${end}`);
    const low = chunkValue(start), high = `COALESCE(${chunkValue(end)},${low})`;
    const types = line ? "='integer'" : "IN ('integer','real')";
    return `(${numeric(start, line)} AND ${numeric(end, line)} AND (
      (${chunkType(start)} ${types} AND ${type(`locator.${start}`)} ${types}
        AND ${first} >= ${low} AND COALESCE(${last},${first}) BETWEEN ${first} AND ${high})
      OR (${chunkType(start)} IS NULL AND ${type(`locator.${start}`)} IS NULL AND ${type(`locator.${end}`)} IS NULL)
    ))`;
  };
  const quote = value("quote");
  return `(json_type(${evidence})='object' AND ${type("quote")}='text' AND length(${quote})>0
    AND instr(${chunk}.body,${quote})>0 AND ${type("locator")}='object'
    AND ${group("lineStart", "lineEnd", true)} AND ${group("startSeconds", "endSeconds", false)})`;
}
