import assert from "node:assert/strict";
import test from "node:test";
import { BUILD_ORDER } from "./data.ts";
import { buildingOffered } from "./lobby.ts";
import { gestureMoved, reduceBuildList, type BuildListState } from "./buildlist.ts";

test("open, drag 100px, a building-complete, then the fifth card places", () => {
  const offered = BUILD_ORDER.filter((id) => buildingOffered("coast", "concord", id, true));
  const fifth = offered[4];
  assert.ok(fifth, `coast offers ${offered.join(",")}`);
  assert.equal(gestureMoved(0, -100), true);
  assert.equal(gestureMoved(0, 9), false);

  let state: BuildListState = { open: false, scroll: 40, placing: null };
  state = reduceBuildList(state, { t: "toggle" });
  assert.equal(state.open, true);
  assert.equal(state.scroll, 40);

  state = reduceBuildList(state, { t: "drag", dy: -100 });
  assert.equal(state.open, true);
  assert.equal(state.placing, null);
  assert.equal(state.scroll, 140);

  state = reduceBuildList(state, { t: "complete" });
  state = reduceBuildList(state, { t: "clock" });
  assert.equal(state.open, true);
  assert.equal(state.scroll, 140);
  assert.equal(state.placing, null);

  state = reduceBuildList(state, { t: "tap-card", id: fifth, blocked: false });
  assert.equal(state.open, false);
  assert.equal(state.placing, fifth);
  assert.equal(state.scroll, 140);
});

test("a 100px vertical drag scrolls the list and is not a field tap", () => {
  assert.equal(gestureMoved(0, -100), true);
  assert.equal(gestureMoved(6, 6), false);
  const scrolled = reduceBuildList({ open: true, scroll: 20, placing: null }, { t: "drag", dy: -100 });
  assert.equal(scrolled.open, true);
  assert.equal(scrolled.placing, null);
  assert.equal(scrolled.scroll, 120);
  const outside = reduceBuildList({ open: true, scroll: 20, placing: null }, { t: "tap-field" });
  assert.equal(outside.open, false);
});

test("a blocked card and a toast do not dismiss the build list", () => {
  const state: BuildListState = { open: true, scroll: 80, placing: null };
  const blocked = reduceBuildList(state, { t: "tap-card", id: "factory", blocked: true });
  assert.deepEqual(blocked, state);
  const done = reduceBuildList(state, { t: "complete" });
  assert.deepEqual(done, state);
});
