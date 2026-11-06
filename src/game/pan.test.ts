import assert from "node:assert/strict";
import test from "node:test";
import { panDelta } from "./input.ts";
import { setViewPitch, worldToScreen, type Camera, type View } from "./view.ts";

test("a 100px finger drag moves the ground 100px at every zoom", () => {
  setViewPitch(0.68);
  const view: View = { w: 915, h: 412 };
  for (const zoom of [20, 48, 54, 91.5]) {
    const before: Camera = { x: 32, y: 40, zoom };
    const finger = { dx: 100, dy: -40 };
    const step = panDelta(zoom, finger.dx, finger.dy);
    const after: Camera = { x: before.x - step.dxw, y: before.y - step.dyw, zoom };
    const a = worldToScreen(before, 30, 36, view);
    const b = worldToScreen(after, 30, 36, view);
    assert.ok(Math.abs(b.x - a.x - finger.dx) < 0.02, `x zoom ${zoom}: ${b.x - a.x}`);
    assert.ok(Math.abs(b.y - a.y - finger.dy) < 0.02, `y zoom ${zoom}: ${b.y - a.y}`);
  }
});
