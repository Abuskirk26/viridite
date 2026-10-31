import assert from "node:assert/strict";
import test from "node:test";
import { allowEdgeScroll, phonePlaceHud, placeChrome, PLACE_BTN_H, PLACE_BTN_W, type ScreenRect } from "./placeui.ts";

function hits(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test("confirm and cancel stay off the A-move stack and inside the phone", () => {
  const view = { w: 915, h: 360 };
  const avoid = phonePlaceHud(view);
  const project = (x: number, y: number) => ({ x: 840 + x, y: 200 + y });
  const box = placeChrome({ x: 0, y: 0, zoom: 48 }, view, 0, 0, 2, 2, project, avoid);
  for (const button of [box.confirm, box.cancel]) {
    assert.ok(button.w >= 44 && button.h >= 44, `${button.w}x${button.h}`);
    assert.equal(button.w, PLACE_BTN_W);
    assert.equal(button.h, PLACE_BTN_H);
    assert.ok(button.x >= 4 && button.y >= 4, `${button.x},${button.y}`);
    assert.ok(button.x + button.w <= view.w - 4 && button.y + button.h <= view.h - 4);
    for (const block of avoid) assert.equal(hits(button, block), false, `${button.x},${button.y} vs ${block.x},${block.y}`);
  }
});

test("a finger never edge-scrolls, a mouse still can", () => {
  assert.equal(allowEdgeScroll("touch", false, false, false), false);
  assert.equal(allowEdgeScroll("touch", true, false, false), false);
  assert.equal(allowEdgeScroll("mouse", true, false, false), false);
  assert.equal(allowEdgeScroll("mouse", false, true, false), false);
  assert.equal(allowEdgeScroll("mouse", false, false, true), false);
  assert.equal(allowEdgeScroll("mouse", false, false, false), true);
});
