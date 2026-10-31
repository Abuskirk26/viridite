import assert from "node:assert/strict";
import test from "node:test";
import { placeChrome } from "./render.ts";
import type { Camera, View } from "./view.ts";

test("confirm and cancel stay fully on a 915 by 412 screen", () => {
  const view: View = { w: 915, h: 412 };
  const cam: Camera = { x: 20, y: 30, zoom: 36 };
  const spots = [
    [4, 4],
    [30, 18],
    [58, 8],
    [58, 40],
    [8, 48],
  ];
  for (const [tx, ty] of spots) {
    const box = placeChrome(cam, view, tx, ty, 3, 3);
    for (const name of ["confirm", "cancel"] as const) {
      const r = box[name];
      assert.ok(r.h >= 48, `${name} height ${r.h}`);
      assert.ok(r.w >= 48, `${name} width ${r.w}`);
      assert.ok(r.x >= 0 && r.y >= 0, `${name} origin ${r.x},${r.y}`);
      assert.ok(r.x + r.w <= view.w + 0.5, `${name} right ${r.x + r.w}`);
      assert.ok(r.y + r.h <= view.h + 0.5, `${name} bottom ${r.y + r.h}`);
    }
  }
});
