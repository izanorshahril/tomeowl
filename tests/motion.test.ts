import { describe, expect, test } from "bun:test";
import { atlasMotionPoint, createMotionClock, motionAllowed, motionPoint, roleAngle } from "../src/viewer/motion";
import type { SourceLayer } from "../src/viewer/types";

describe("graph motion", () => {
  test("pauses for reading, focus, hover, drag, hidden pages and reduced motion", () => {
    const running = { enabled: true, speed: 25, reduced: false, hidden: false, selected: false, focused: false, hovered: false, dragging: false };
    expect(motionAllowed(running)).toBe(true);
    for (const key of ["reduced", "hidden", "selected", "focused", "hovered", "dragging"] as const) {
      expect(motionAllowed({ ...running, [key]: true })).toBe(false);
    }
    expect(motionAllowed({ ...running, enabled: false })).toBe(false);
    for (const speed of [0, -1, NaN, Infinity]) expect(motionAllowed({ ...running, speed })).toBe(false);
  });

  test("pause and speed-zero resume do not catch up elapsed wall time", () => {
    const clock = createMotionClock();
    expect(clock.step(100, 25).delta).toBe(0);
    expect(clock.step(140, 25).elapsed).toBeCloseTo(.04);
    clock.pause();
    expect(clock.step(600_000, 25)).toEqual({ elapsed: .04, delta: 0 });
    expect(clock.step(600_040, 25).elapsed).toBeCloseTo(.08);
    expect(clock.step(600_080, 0).delta).toBe(0);
    expect(clock.step(900_000, 25).elapsed).toBeCloseTo(.08);
    expect(clock.step(900_040, 50).elapsed).toBeCloseTo(.12);
  });

  test("a stalled frame and backward timestamp stay bounded", () => {
    const clock = createMotionClock();
    clock.step(0, 25);
    expect(clock.step(60_000, 25).delta).toBeCloseTo(.08);
    expect(clock.step(59_000, 25).delta).toBe(0);
    expect(clock.step(59_040, 10_000).delta).toBeCloseTo(.04);
    expect(clock.step(NaN, 25).delta).toBe(0);
    expect(clock.step(100_000, 25).delta).toBe(0);
  });

  test("fractional speeds slow proportionally and never exceed the current pace",()=>{
    for(const speed of [25,50,10_000]){
      const clock=createMotionClock();clock.step(100,speed);expect(clock.step(140,speed).delta).toBeCloseTo(.04);
    }
    const slow=createMotionClock();slow.step(100,6.25);expect(slow.step(140,6.25).delta).toBeCloseTo(.01);
    expect(slow.step(180,0).elapsed).toBeCloseTo(.01);expect(slow.step(600_000,12.5).delta).toBe(0);
    expect(slow.step(600_040,12.5).elapsed).toBeCloseTo(.03);
  });

  test("orbital motion retains each source's radius and the shared knowledge-sector gaps", () => {
    const point = { x: 173, y: -82, z: 23 }, origin = { x: 0, y: 0, z: 0 };
    for (const elapsed of [0, 1, 10, 100, 100_000]) {
      for (const layer of ["project", "guidance", "skill", "app", "document", "research", "citation"] as SourceLayer[]) {
        const moved = motionPoint(point, origin, layer, "orbital", elapsed);
        expect(Math.hypot(moved.x, moved.y)).toBeCloseTo(Math.hypot(point.x, point.y), 9);
        expect(moved.z).toBe(point.z);
      }
      expect(roleAngle("document", "orbital", elapsed)).toBe(roleAngle("research", "orbital", elapsed));
      expect(roleAngle("research", "orbital", elapsed)).toBe(roleAngle("citation", "orbital", elapsed));
      expect(Math.abs(roleAngle("citation", "orbital", elapsed))).toBeLessThanOrEqual(.06);
      expect(motionPoint(point, origin, "project", "orbital", elapsed)).toEqual(point);
    }
    expect(roleAngle("skill", "orbital", 10)).toBeGreaterThan(0);
    expect(roleAngle("app", "orbital", 10)).toBeLessThan(0);
  });

  test("constellation circulation preserves each cloud's volume and the original layout", () => {
    const point = { x: 392, y: 97, z: 42 }, anchor = { x: 320, y: 80, z: 78 };
    const original = structuredClone(point);
    const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y, point.z - anchor.z);
    for (const elapsed of [0, 5, 25, 1000]) {
      const moved = motionPoint(point, anchor, "skill", "constellation", elapsed);
      expect(Math.hypot(moved.x - anchor.x, moved.y - anchor.y, moved.z - anchor.z)).toBeCloseTo(distance, 9);
      expect(Math.hypot(moved.x - anchor.x, moved.y - anchor.y)).toBeLessThanOrEqual(distance + 1e-9);
    }
    expect(motionPoint(point, anchor, "skill", "constellation", 0)).toEqual(point);
    expect(motionPoint(point, anchor, "skill", "constellation", 5)).not.toEqual(point);
    expect(point).toEqual(original);
  });

  test("Atlas drift starts at the layout and stays within six by three pixels", () => {
    const point = { x: 20, y: -75, z: 30 };
    for (const seed of [0, 1.7, 35]) {
      expect(atlasMotionPoint(point, 0, seed)).toEqual(point);
      for (const elapsed of [1, 5, 100, 1000]) {
        const moved = atlasMotionPoint(point, elapsed, seed);
        expect(Math.abs(moved.x - point.x)).toBeLessThanOrEqual(6);
        expect(Math.abs(moved.y - point.y)).toBeLessThanOrEqual(3);
        expect(moved.z).toBe(point.z);
      }
    }
    expect(point).toEqual({ x: 20, y: -75, z: 30 });
  });
});
