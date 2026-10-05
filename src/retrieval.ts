import { Database } from "bun:sqlite";
import { SearchResult } from "./domain";
import { SearchOptions } from "./query-scope";
import { searchStore } from "./store";

export function retrieve(db: Database, query: string, limit = 20, options: SearchOptions = {}): SearchResult[] {
  return searchStore(db, query, limit, options);
}
