# 04: Inspect the same evidence in 3D

**What to build:** A presenter changes the current atlas to an optional perspective view, rotates and resets the camera, and inspects the same source evidence before returning to 2D.

**Blocked by:** 01: Recognize and explore a grouped atlas.

**Status:** complete, 2026-10-03

- [x] Coordinates are noncoplanar and perspective depth/yaw/pitch change the projection; a CSS tilt alone is rejected.
- [x] View changes preserve current corpus, filter, selected source, and relationship meaning.
- [x] Drag rotation has click and keyboard alternatives, and zoom/fit/reset recover a usable pose.
- [x] Labels face the screen and list navigation reaches occluded sources.
- [x] Still/reduced-motion paths remain complete and the offline viewer needs no WebGL or remote assets.
- [x] Camera geometry and the 2D-to-3D-to-evidence journey are checked with focused evidence.

## Completion evidence

See [release checks](../../../docs/STATUS.md), [UI confirmation](../../../docs/UI-REVIEW.md), and [Standards/Spec review](../../../docs/CODE-REVIEW.md).
The independent UI score is 9/10; live coordinator checks and manual reviewer limits are disclosed in those records.
