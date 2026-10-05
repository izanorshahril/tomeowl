import type { SpacePoint } from "./projection";
import type { ReferenceMode } from "./reference-geometry";
import type { SourceLayer } from "./types";

type MotionConditions = {
  enabled: boolean; speed: number; reduced: boolean; hidden: boolean;
  selected: boolean; focused: boolean; hovered: boolean; dragging: boolean;
};

// The visible range ends at the existing pace; slower values keep fractional precision.
export const CURRENT_MOTION_SPEED = 25;

export function motionAllowed(conditions: MotionConditions) {
  return conditions.enabled && Number.isFinite(conditions.speed) && conditions.speed > 0 &&
    !conditions.reduced && !conditions.hidden && !conditions.selected &&
    !conditions.focused && !conditions.hovered && !conditions.dragging;
}

// Time advances only while running; a hidden tab or a paused reader never catches up.
export function createMotionClock() {
  let elapsed = 0, previous: number | null = null;
  return {
    get elapsed() { return elapsed; },
    pause() { previous = null; },
    step(now: number, speed: number) {
      if (!Number.isFinite(now) || !Number.isFinite(speed) || speed <= 0) {
        previous = null;
        return { elapsed, delta: 0 };
      }
      const delta = previous === null ? 0 : Math.max(0, Math.min(80, now - previous)) / 1000 * Math.min(CURRENT_MOTION_SPEED, speed) / CURRENT_MOTION_SPEED;
      previous = now;
      elapsed += delta;
      return { elapsed, delta };
    },
  };
}

const cloudRate: Record<SourceLayer, number> = {
  project: 0, guidance: .045, skill: -.095, app: .075,
  document: .06, research: -.07, citation: .05,
  channel: 0, video: .035, description: -.04, transcript: .04,
};

export function roleAngle(layer: SourceLayer, form: ReferenceMode, elapsed: number) {
  if (layer === "project") return 0;
  if (form === "constellation") return elapsed * cloudRate[layer];
  if (layer === "document" || layer === "research" || layer === "citation") {
    // The knowledge sectors move together, retaining the gaps and anchored role captions.
    return Math.sin(elapsed * .35) * .06;
  }
  return elapsed * (layer === "skill" ? .065 : layer === "app" ? -.035 : .03);
}

/** A reversible pose over a deterministic layout, preserving each role's bounded volume. */
export function motionPoint(point: SpacePoint, anchor: SpacePoint, layer: SourceLayer, form: ReferenceMode, elapsed: number): SpacePoint {
  const center = form === "orbital" ? { x: 0, y: 0, z: 0 } : anchor;
  const angle = roleAngle(layer, form, elapsed), cosine = Math.cos(angle), sine = Math.sin(angle);
  let x = point.x - center.x, y = point.y - center.y, z = point.z - center.z;
  if (form === "constellation" && layer !== "project" && layer !== "guidance") {
    const tilt = Math.sin(angle * .45) * .18, tiltCosine = Math.cos(tilt), tiltSine = Math.sin(tilt);
    const nextY = y * tiltCosine - z * tiltSine;
    z = y * tiltSine + z * tiltCosine;
    y = nextY;
  }
  return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine, z: center.z + z };
}

export function atlasMotionPoint(point: SpacePoint, elapsed: number, seed: number): SpacePoint {
  const angle = elapsed * .75 + seed;
  return { ...point, x: point.x + (Math.sin(angle) - Math.sin(seed)) * 3,
    y: point.y + (Math.cos(angle) - Math.cos(seed)) * 1.5 };
}
