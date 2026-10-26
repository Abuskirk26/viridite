import assert from "node:assert/strict";
import test from "node:test";
import { TILE_CLEAR, TILE_CLIFF, TILE_SAND, TILE_SHALLOW } from "../data.ts";
import { sampleCorner, tintOf } from "./ground.ts";

test("a sand tile and a grass tile share one blended corner", () => {
  const at = (x: number, y: number) => {
    if (x === 0 && y === 0) return TILE_SAND;
    if (x === 1 && y === 0) return TILE_CLEAR;
    return -1;
  };
  const corner = sampleCorner(at, 1, 0);
  const again = sampleCorner(at, 1, 0);
  assert.equal(corner.cliff, false);
  assert.deepEqual(corner.rgb, again.rgb);
  const sand = tintOf(TILE_SAND);
  const grass = tintOf(TILE_CLEAR);
  assert.ok(corner.rgb[0] < sand[0] && corner.rgb[0] > grass[0], `red ${corner.rgb[0]}`);
  assert.ok(corner.rgb[1] < sand[1] && corner.rgb[1] > grass[1] - 0.05, `green ${corner.rgb[1]}`);
});

test("a cliff stays a face instead of a smoothed ramp", () => {
  const at = (x: number, y: number) => {
    if (x === 0 && y === 0) return TILE_CLIFF;
    if (x === 1 && y === 0) return TILE_SAND;
    return -1;
  };
  const corner = sampleCorner(at, 1, 0);
  assert.equal(corner.cliff, true);
  assert.ok(corner.low < 0.2, `low ${corner.low}`);
  assert.ok(corner.high > 1.4, `high ${corner.high}`);
});

test("a shore corner leaves the grid so the coast is not a square", () => {
  const at = (x: number, y: number) => {
    if (x === 0 && y === 0) return TILE_SAND;
    if (x === 1 && y === 0) return TILE_SHALLOW;
    return -1;
  };
  const corner = sampleCorner(at, 1, 0);
  assert.equal(corner.cliff, false);
  assert.ok(Math.hypot(corner.x - 1, corner.z - 0) > 0.05, `${corner.x},${corner.z}`);
});
