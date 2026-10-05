import { resolve, sep } from "node:path";
import { TomeowlError } from "./domain";

export type QueryScope = { collection?: string; path?: string };
export type SearchOptions = QueryScope & { match?: "any" | "all" | "phrase"; quoteChars?: number };

/** Collection names match exactly; paths select an exact source or its directory subtree. */
export function scopePredicate(scope: QueryScope = {}): { sql: string; params: string[] } {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw new TomeowlError("Query scope must be an object", "INVALID_SCOPE");
  }
  const clauses: string[] = [];
  const params: string[] = [];
  if (scope.collection !== undefined) {
    if (typeof scope.collection !== "string" || !scope.collection.trim() || scope.collection.includes("\0")) {
      throw new TomeowlError("collection must be a nonempty name without NUL characters", "INVALID_SCOPE");
    }
    clauses.push("s.collection = ?");
    params.push(scope.collection);
  }
  if (scope.path !== undefined) {
    if (typeof scope.path !== "string" || !scope.path.trim() || scope.path.includes("\0")) {
      throw new TomeowlError("path must be a nonempty path without NUL characters", "INVALID_SCOPE");
    }
    // Resolve lexically: indexed sources remain queryable after their files are moved or removed.
    const windows = process.platform === "win32";
    const path = resolve(scope.path).split(sep).join("/");
    // SQLite lower() folds ASCII only; preserve non-ASCII spelling so an exact Unicode path matches.
    // Case variants outside ASCII remain distinct until a Unicode-aware path comparison is introduced.
    const normalized = windows ? path.replace(/[A-Z]/g, letter => letter.toLowerCase()) : path;
    const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
    const column = windows ? "lower(replace(s.path, char(92), '/'))" : "s.path";
    clauses.push(`(${column} = ? OR substr(${column}, 1, length(?)) = ?)`);
    params.push(normalized, prefix, prefix);
  }
  return { sql: clauses.length ? clauses.join(" AND ") : "1=1", params };
}
