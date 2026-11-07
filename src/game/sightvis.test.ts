import assert from "node:assert/strict";
import test from "node:test";
import { TILE_CLEAR, TILE_CLIFF, TILE_HIGH, TILE_ROCK, TILE_SCRUB } from "./data.ts";
import { marksmanAiming, marksmanEyePx, sightRadius, sightRingSamples, sightTileBlocks } from "./sightvis.ts";

test("high ground grows the sight ring by the same bonus the sim uses", () => {
  const gw = 8;
  const gh = 8;
  const terrain = new Uint8Array(gw * gh);
  terrain.fill(TILE_CLEAR);
  assert.equal(sightRadius(terrain, gw, gh, 3.2, 3.4, 8), 8);
  terrain[3 * gw + 3] = TILE_HIGH;
  assert.equal(sightRadius(terrain, gw, gh, 3.2, 3.4, 8), 9.6);
});

test("forests, cliffs, and rocks clip the ring and open ground does not", () => {
  assert.equal(sightTileBlocks(TILE_SCRUB), true);
  assert.equal(sightTileBlocks(TILE_CLIFF), true);
  assert.equal(sightTileBlocks(TILE_ROCK), true);
  assert.equal(sightTileBlocks(TILE_CLEAR), false);
  const gw = 16;
  const gh = 16;
  const terrain = new Uint8Array(gw * gh);
  terrain.fill(TILE_CLEAR);
  for (let y = 0; y < gh; y++) terrain[y * gw + 12] = TILE_SCRUB;
  const samples = sightRingSamples(terrain, gw, gh, 8.5, 8.5, 4, 48);
  const hidden = samples.filter((s) => !s.draw);
  const shown = samples.filter((s) => s.draw);
  assert.ok(hidden.length > 0, "the forest did not clip the ring");
  assert.ok(shown.length > hidden.length, "the open ground lost the ring");
  assert.ok(hidden.every((s) => (s.x | 0) === 12 || s.x < 0 || s.y < 0));
});

test("the marksman eye stays at least 14 px and only appears after standing still", () => {
  for (const zoom of [20, 48, 54, 91.5]) {
    assert.ok(marksmanEyePx(zoom) >= 14, `eye ${marksmanEyePx(zoom)} at zoom ${zoom}`);
  }
  assert.equal(marksmanAiming("marksman", 1.9), false);
  assert.equal(marksmanAiming("marksman", 2), true);
  assert.equal(marksmanAiming("rifle", 4), false);
});
