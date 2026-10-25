import assert from "node:assert/strict";
import test from "node:test";
import { projectGround, projectWorld } from "./camera.ts";

test("the 3D ground ray hits the tile under that pixel", () => {
  const cam = { x: 32, y: 40, zoom: 54 };
  const view = { w: 915, h: 316 };
  const center = projectWorld(cam, view, 32, 40);
  assert.ok(Math.abs(center.x - 457.5) < 1.5, `center x ${center.x}`);
  assert.ok(Math.abs(center.y - 158) < 1.5, `center y ${center.y}`);
  const back = projectGround(cam, view, center.x, center.y);
  assert.ok(back);
  assert.ok(Math.abs(back.x - 32) < 0.05 && Math.abs(back.y - 40) < 0.05, `${back.x},${back.y}`);
  const spot = projectWorld(cam, view, 38.5, 33.25);
  const again = projectGround(cam, view, spot.x, spot.y);
  assert.ok(again);
  assert.ok(Math.abs(again.x - 38.5) < 0.08, `x ${again.x}`);
  assert.ok(Math.abs(again.y - 33.25) < 0.08, `y ${again.y}`);
});
