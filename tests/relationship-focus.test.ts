import { describe, expect, test } from "bun:test";
import { createRelationshipFocus } from "../src/viewer/relationship-focus";
import type { ViewerRelation } from "../src/viewer/types";

const link = (source: string, target: string, id = `${source}-${target}`): Pick<ViewerRelation, "id" | "source" | "target"> => ({ id, source, target });

describe("recorded relationship focus", () => {
  test("progressively fades actual shortest hops and distinguishes disconnected sources", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "unrelated"];
    const relations = ids.slice(0, 6).map((id, index) => link(id, ids[index + 1]!));
    const focus = createRelationshipFocus(ids, relations, { selectedSourceId: "a" });
    expect(focus.active).toBe(true);
    expect([...focus.distances]).toEqual(ids.slice(0, 7).map((id, distance) => [id, distance]));
    expect(ids.map(focus.opacity)).toEqual([1, .9, .42, .16, .055, .025, .025, .012]);
    expect(focus.edgeOpacity("a", "b")).toBe(.9);
    expect(focus.edgeOpacity("b", "c")).toBe(.42);
    expect(focus.edgeOpacity("g", "unrelated")).toBe(.012);
  });

  test("traverses reversed links and cycles without geometric or grouping assumptions", () => {
    const ids = ["a", "b", "c", "d", "separate"];
    const relations = [link("b", "a"), link("c", "b"), link("d", "c"), link("a", "d"),
      link("a", "a"), link("b", "a", "parallel")];
    const before = structuredClone(relations);
    const focus = createRelationshipFocus(ids, relations, { selectedSourceId: "a" });
    expect(focus.distances.get("a")).toBe(0);
    expect(focus.distances.get("b")).toBe(1);
    expect(focus.distances.get("d")).toBe(1);
    expect(focus.distances.get("c")).toBe(2);
    expect(focus.distances.has("separate")).toBe(false);
    const reversed = createRelationshipFocus([...ids].reverse(), [...relations].reverse(), { selectedSourceId: "a" });
    expect(ids.map(reversed.opacity)).toEqual(ids.map(focus.opacity));
    expect(relations).toEqual(before);
  });

  test("ignores out-of-scope and dangling links instead of traversing through hidden sources", () => {
    const focus = createRelationshipFocus(["a", "b", "c"], [link("a", "outside"), link("outside", "b"),
      link("b", "c"), link("missing", "absent")], { selectedSourceId: "a" });
    expect([...focus.distances]).toEqual([["a", 0]]);
    expect(focus.opacity("b")).toBe(.012);
    expect(focus.distances.has("outside")).toBe(false);
  });

  test("selected relationships seed both endpoints and take precedence over a source selection", () => {
    const ids = ["a", "b", "c", "d", "e", "isolated"];
    const relations = [link("a", "b"), link("b", "c", "selected"), link("c", "d"), link("d", "e")];
    const focus = createRelationshipFocus(ids, relations, { selectedSourceId: "isolated", selectedRelationId: "selected" });
    expect(ids.map(id => focus.distances.get(id))).toEqual([1, 0, 0, 1, 2, undefined]);
    expect(focus.edgeOpacity("b", "c")).toBe(1);
    expect(focus.opacity("isolated")).toBe(.012);
    const self = createRelationshipFocus(ids, [link("b", "b", "self")], { selectedRelationId: "self" });
    expect([...self.distances]).toEqual([["b", 0]]);
  });

  test("invalid selections are normal and an invalid relation can fall back to a valid source", () => {
    const ids = ["a", "b"], relations = [link("a", "b"), link("a", "missing", "dangling")];
    for (const selection of [{}, { selectedSourceId: "missing" }, { selectedRelationId: "missing" },
      { selectedRelationId: "dangling" }, { selectedSourceId: "a", enabled: false }]) {
      const focus = createRelationshipFocus(ids, relations, selection);
      expect(focus.active).toBe(false);
      expect(focus.distances.size).toBe(0);
      expect(focus.opacity("a")).toBe(1);
      expect(focus.opacity("b")).toBe(1);
      expect(focus.edgeOpacity("a", "b")).toBe(1);
    }
    const fallback = createRelationshipFocus(ids, relations, { selectedSourceId: "b", selectedRelationId: "dangling" });
    expect(fallback.active).toBe(true);
    expect(fallback.distances.get("b")).toBe(0);
    expect(fallback.distances.get("a")).toBe(1);
    expect(createRelationshipFocus([], relations, { selectedSourceId: "a" }).active).toBe(false);
  });

  test("uses the complete scope for relevance even when rendered nodes omit an intermediate hop", () => {
    const relations = [link("a", "b"), link("b", "c")];
    const complete = createRelationshipFocus(["a", "b", "c"], relations, { selectedSourceId: "a" });
    const renderedIds = ["a", "c"];
    expect(renderedIds.map(complete.opacity)).toEqual([1, .42]);
    const restricted = createRelationshipFocus(renderedIds, relations, { selectedSourceId: "a" });
    expect(restricted.opacity("c")).toBe(.012);
  });

  test("traverses a long chain iteratively while bounding the rendered opacity tiers", () => {
    const ids = Array.from({ length: 10_000 }, (_, index) => `source-${index}`);
    const relations = ids.slice(1).map((id, index) => link(ids[index]!, id));
    const focus = createRelationshipFocus(ids, relations, { selectedSourceId: ids[0] });
    expect(focus.distances.size).toBe(ids.length);
    expect(focus.distances.get(ids.at(-1)!)).toBe(9_999);
    expect(focus.opacity(ids.at(-1)!)).toBe(.025);
  });
});
