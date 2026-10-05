import type { ViewerRelation } from "./types";

type FocusRelation = Pick<ViewerRelation, "id" | "source" | "target">;
type FocusSelection = {
  selectedSourceId?: string | null;
  selectedRelationId?: string | null;
  enabled?: boolean;
};

const hopOpacity = [1, .9, .42, .16, .055, .025] as const;
export type RelationshipFocus = {
  active: boolean;
  distances: ReadonlyMap<string, number>;
  opacity(id: string): number;
  edgeOpacity(sourceId: string, targetId: string): number;
};

/** Recorded, undirected link distance inside the supplied complete source scope. */
export function createRelationshipFocus(
  sourceIds: Iterable<string>, relations: readonly FocusRelation[], selection: FocusSelection = {},
): RelationshipFocus {
  const scope = new Set(sourceIds);
  const distances = new Map<string, number>();
  const valid = (relation: FocusRelation) => scope.has(relation.source) && scope.has(relation.target);
  const selectedRelation = selection.enabled === false ? undefined :
    relations.find(relation => relation.id === selection.selectedRelationId && valid(relation));
  const roots = selectedRelation ? [...new Set([selectedRelation.source, selectedRelation.target])] :
    selection.enabled !== false && typeof selection.selectedSourceId === "string" && scope.has(selection.selectedSourceId)
      ? [selection.selectedSourceId] : [];
  const active = roots.length > 0;

  if (active) {
    const neighbors = new Map<string, Set<string>>();
    for (const relation of relations) {
      if (!valid(relation)) continue;
      if (!neighbors.has(relation.source)) neighbors.set(relation.source, new Set());
      if (!neighbors.has(relation.target)) neighbors.set(relation.target, new Set());
      neighbors.get(relation.source)!.add(relation.target);
      neighbors.get(relation.target)!.add(relation.source);
    }
    const queue = [...roots];
    roots.forEach(id => distances.set(id, 0));
    // An index avoids recursive traversal and repeated Array.shift on large scopes.
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!;
      const nextDistance = distances.get(current)! + 1;
      for (const neighbor of neighbors.get(current) ?? []) {
        if (distances.has(neighbor)) continue;
        distances.set(neighbor, nextDistance); queue.push(neighbor);
      }
    }
  }

  const opacity = (id: string) => {
    if (!active) return 1;
    const distance = distances.get(id);
    return distance === undefined ? .012 : hopOpacity[Math.min(distance, hopOpacity.length - 1)]!;
  };
  return { active, distances: distances as ReadonlyMap<string, number>, opacity,
    edgeOpacity: (sourceId: string, targetId: string) => Math.min(opacity(sourceId), opacity(targetId)) };
}
