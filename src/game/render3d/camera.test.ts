import assert from "node:assert/strict";
import test from "node:test";
import { focusOnGround, placementGhost, projectGround, projectSurface, projectWorld } from "./camera.ts";

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

test("a raised surface pulls the tap toward the camera", () => {
  const cam = { x: 32, y: 40, zoom: 54 };
  const view = { w: 915, h: 316 };
  const flat = projectSurface(cam, view, 457.5, 158, () => 0);
  const raised = projectSurface(cam, view, 457.5, 158, () => 1.2);
  assert.ok(flat && raised);
  assert.ok(Math.abs(flat.x - 32) < 0.2 && Math.abs(flat.y - 40) < 0.2, `${flat.x},${flat.y}`);
  assert.ok(Math.abs(raised.x - 32) < 0.2, `raised x ${raised.x}`);
  assert.ok(raised.y > flat.y + 0.4, `raised should sit closer than the plane (${raised.y} vs ${flat.y})`);
});

test("a 3D ghost centre projects back onto the tap for every footprint", () => {
  const cam = { x: 32, y: 40, zoom: 54 };
  const view = { w: 915, h: 316 };
  const slope = (x: number, y: number) => Math.max(0, Math.min(1.5, (y - 28) * 0.08 + (x - 24) * 0.04));
  const flat = () => 0;
  const taps = [
    [457, 158],
    [180, 90],
    [700, 210],
    [240, 250],
    [620, 70],
  ];
  for (const heightAt of [flat, slope]) {
    for (const [w, h] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [3, 2],
    ] as const) {
      let first: { x: number; y: number } | null = null;
      for (const [sx, sy] of taps) {
        const ghost = placementGhost(cam, view, sx, sy, w, h, heightAt);
        assert.ok(ghost, `miss ${sx},${sy}`);
        if (!first) first = ghost;
        else assert.ok(Math.abs(ghost.x - first.x) + Math.abs(ghost.y - first.y) > 0.2);
        assert.ok(Math.abs(ghost.screen.x - sx) < 4, `x ${ghost.screen.x} vs ${sx} (${w}x${h})`);
        assert.ok(Math.abs(ghost.screen.y - sy) < 4, `y ${ghost.screen.y} vs ${sy} (${w}x${h})`);
      }
    }
  }
  const a = placementGhost(cam, view, 300, 140, 1, 1, slope);
  const b = placementGhost(cam, view, 300, 140, 3, 3, slope);
  assert.ok(a && b);
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, "size must not slide the centre");
});

test("a 3D minimap focus puts the tapped ground point on the center ray", () => {
  const view = { w: 915, h: 412 };
  const flat = () => 0;
  const flatCam = { x: 8, y: 8, zoom: 54 };
  focusOnGround(flatCam, view, 28, 22, flat);
  const flatHit = projectGround(flatCam, view, view.w / 2, view.h / 2);
  assert.ok(flatHit);
  assert.ok(Math.abs(flatHit.x - 28) < 0.05 && Math.abs(flatHit.y - 22) < 0.05, `${flatHit.x},${flatHit.y}`);

  const shore = () => 1.35;
  const naive = { x: 40, y: 36, zoom: 54 };
  const missed = projectSurface(naive, view, view.w / 2, view.h / 2, shore);
  assert.ok(missed);
  assert.ok(Math.abs(missed.y - 36) > 0.4, `naive look-at should miss the hill (${missed.y})`);

  const aimed = { x: 8, y: 8, zoom: 54 };
  focusOnGround(aimed, view, 40, 36, shore);
  const hit = projectSurface(aimed, view, view.w / 2, view.h / 2, shore);
  assert.ok(hit);
  assert.ok(Math.abs(hit.x - 40) < 0.2, `x ${hit.x}`);
  assert.ok(Math.abs(hit.y - 36) < 0.2, `y ${hit.y}`);
  assert.ok(aimed.x >= 0 && aimed.x <= 96 && aimed.y >= -4 && aimed.y <= 96);
});
