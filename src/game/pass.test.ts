import assert from "node:assert/strict";
import test from "node:test";
import {
  TILE_BRIDGE,
  TILE_CLEAR,
  TILE_CLIFF,
  TILE_DEEP,
  TILE_FORD,
  TILE_HIGH,
  TILE_RAMP,
  TILE_SCRUB,
  TILE_SHALLOW,
} from "./data.ts";
import { LOBBY_MAPS } from "./lobby.ts";
import { landConnected } from "./pass.ts";
import { DEPLOY_SECS, Sim } from "./sim.ts";

const quiet = { fog: false, crates: false, cpu: [false, false, false, false] as boolean[], seed: 1 };

test("cliffs and steep grades stop ground units; a ramp is the step", () => {
  const sim = new Sim({ mapId: "dry", faction: "concord", mode: "destroy", ...quiet });
  sim.terrain.fill(TILE_CLEAR);
  const rifle = sim.spawnUnit(0, "rifle", 8.5, 8.5);
  const tank = sim.spawnUnit(0, "tank", 8.5, 12.5);
  assert.ok(rifle && tank);
  sim.terrain[8 * sim.gw + 14] = TILE_CLIFF;
  sim.terrain[12 * sim.gw + 14] = TILE_HIGH;
  assert.equal(sim.passable(rifle, 14.5, 8.5), false);
  assert.equal(sim.passable(tank, 14.5, 8.5), false);
  assert.equal(sim.passable(tank, 14.5, 12.5), true);
  for (let y = 0; y < sim.gh; y++) sim.terrain[y * sim.gw + 20] = TILE_HIGH;
  sim.time = DEPLOY_SECS + 1;
  const mover = sim.spawnUnit(0, "tank", 16.5, 30.5);
  assert.ok(mover);
  sim.issueMove([mover.id], 24.5, 30.5, false);
  assert.equal(mover.path.length, 0, "tank crossed a grade-2 wall");
  sim.terrain[30 * sim.gw + 20] = TILE_RAMP;
  sim.issueMove([mover.id], 24.5, 30.5, false);
  assert.ok(mover.path.length > 0, "ramp did not open the mesa");
});

test("forests block vehicles and infantry keep the cover", () => {
  const sim = new Sim({ mapId: "dry", faction: "concord", mode: "destroy", ...quiet });
  sim.terrain.fill(TILE_CLEAR);
  sim.time = DEPLOY_SECS + 1;
  for (let y = 4; y < sim.gh - 4; y++) sim.terrain[y * sim.gw + 20] = TILE_SCRUB;
  const tank = sim.spawnUnit(0, "tank", 16.5, 20.5);
  const rifle = sim.spawnUnit(0, "rifle", 16.5, 24.5);
  assert.ok(tank && rifle);
  assert.equal(sim.passable(tank, 20.5, 20.5), false);
  assert.equal(sim.passable(rifle, 20.5, 24.5), true);
  sim.issueMove([tank.id], 24.5, 20.5, false);
  assert.ok(tank.path.length > 0, "tank has no way around the wood");
  for (const p of tank.path) assert.notEqual(sim.terrain[p.y * sim.gw + p.x], TILE_SCRUB);
  sim.issueMove([rifle.id], 22.5, 24.5, false);
  let entered = false;
  for (let i = 0; i < 50; i++) {
    sim.tick(0.1);
    const tx = rifle.x | 0;
    const ty = rifle.y | 0;
    if (sim.terrain[ty * sim.gw + tx] === TILE_SCRUB) entered = true;
    assert.notEqual(sim.terrain[(tank.y | 0) * sim.gw + (tank.x | 0)], TILE_SCRUB);
  }
  assert.equal(entered, true);
});

test("water is boats-only and bridges and fords still carry ground units", () => {
  const sim = new Sim({ mapId: "dry", faction: "concord", mode: "destroy", ...quiet });
  sim.terrain.fill(TILE_CLEAR);
  for (let y = 0; y < sim.gh; y++) {
    sim.terrain[y * sim.gw + 20] = TILE_DEEP;
    sim.terrain[y * sim.gw + 21] = TILE_SHALLOW;
  }
  sim.terrain[10 * sim.gw + 20] = TILE_BRIDGE;
  sim.terrain[10 * sim.gw + 21] = TILE_BRIDGE;
  sim.terrain[30 * sim.gw + 20] = TILE_FORD;
  sim.terrain[30 * sim.gw + 21] = TILE_FORD;
  const rifle = sim.spawnUnit(0, "rifle", 8.5, 10.5);
  const tank = sim.spawnUnit(0, "tank", 8.5, 30.5);
  const boat = sim.spawnUnit(0, "gunboat", 24.5, 16.5);
  assert.ok(rifle && tank && boat);
  assert.equal(sim.passable(rifle, 20.5, 16.5), false);
  assert.equal(sim.passable(tank, 21.5, 16.5), false);
  assert.equal(sim.passable(boat, 20.5, 16.5), true);
  assert.equal(sim.passable(boat, 21.5, 16.5), true);
  assert.equal(sim.passable(rifle, 20.5, 10.5), true);
  assert.equal(sim.passable(tank, 21.5, 10.5), true);
  assert.equal(sim.passable(boat, 20.5, 10.5), false);
  assert.equal(sim.passable(rifle, 20.5, 30.5), true);
  assert.equal(sim.passable(tank, 21.5, 30.5), true);
  assert.equal(sim.passable(boat, 20.5, 30.5), true);
});

test("every lobby map keeps both starts on land for infantry and tanks", () => {
  for (const map of LOBBY_MAPS) {
    const sim = new Sim({ mapId: map.id, faction: "concord", mode: "destroy", ...quiet });
    const slots = sim.starts.slots;
    for (let i = 1; i < slots.length; i++) {
      const there = slots[i];
      const home = slots[0];
      assert.ok(home && there);
      assert.equal(landConnected(sim.terrain, sim.gw, sim.gh, home, there, "vehicle"), true, `${map.id} tank seat ${i}`);
      assert.equal(landConnected(sim.terrain, sim.gw, sim.gh, home, there, "infantry"), true, `${map.id} infantry seat ${i}`);
    }
  }
});
