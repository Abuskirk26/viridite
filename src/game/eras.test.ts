import assert from "node:assert/strict";
import test from "node:test";
import { BUILDINGS, UNITS, unitRequires, type BuildingId, type UnitId } from "./data.ts";
import {
  DEFAULT_YEAR,
  EARLIEST_YEAR,
  ERAS,
  buildingInYear,
  buildingUnlocks,
  clampYear,
  eraForYear,
  startingArmy,
  unitInYear,
  unitUnlocks,
} from "./eras.ts";
import { DEFAULT_SETUP, buildingOffered, parseSetup, toNewGame, unitOffered } from "./lobby.ts";
import { Sim, shortPlaceReason } from "./sim.ts";

test("every unit and building has an era year, and a unit is not earlier than its hall", () => {
  for (const id of Object.keys(UNITS) as UnitId[]) {
    const y = unitUnlocks()[id];
    assert.equal(typeof y, "number", id);
    assert.ok(y! >= EARLIEST_YEAR, id);
    const need = unitRequires(id);
    if (need) assert.ok(y! >= buildingUnlocks()[need]!, `${id} before ${need}`);
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const y = buildingUnlocks()[id];
    assert.equal(typeof y, "number", id);
    assert.ok(y! >= EARLIEST_YEAR, id);
  }
  assert.equal(ERAS[0]?.year, 1914);
  assert.equal(DEFAULT_YEAR, ERAS[ERAS.length - 1]?.year);
  assert.deepEqual(startingArmy(1914), ["mcv"]);
  assert.deepEqual(startingArmy(DEFAULT_YEAR), ["mcv"]);
});

test("WW1 hides later pieces and the latest year keeps the roster", () => {
  assert.equal(unitInYear("rifle", 1914), true);
  assert.equal(unitInYear("tank", 1914), true);
  assert.equal(unitInYear("attackheli", 1914), false);
  assert.equal(unitInYear("bomber", 1947), false);
  assert.equal(unitInYear("bomber", DEFAULT_YEAR), true);
  assert.equal(buildingInYear("helipad", 1914), false);
  assert.equal(buildingInYear("advpower", 1936), true);
  assert.equal(buildingOffered("coast", "concord", "helipad", true, 1914), false);
  assert.equal(buildingOffered("coast", "concord", "barracks", true, 1914), true);
  assert.equal(buildingOffered("coast", "concord", "helipad", true), true);
  assert.equal(unitOffered("coast", "concord", "attackheli", 1914), false);
  assert.equal(unitOffered("dry", "concord", "gunboat", 1914), false);
  assert.equal(eraForYear(1950).id, "cold");
  assert.equal(clampYear(undefined), DEFAULT_YEAR);
  assert.equal(clampYear(1900), 1914);
});

test("the match year is the tech ceiling and the opening army is still an MCV", () => {
  assert.equal(DEFAULT_SETUP.year, DEFAULT_YEAR);
  assert.equal(toNewGame(DEFAULT_SETUP).year, DEFAULT_YEAR);
  assert.equal(toNewGame({ ...DEFAULT_SETUP, year: 1914 }).year, 1914);
  const parsed = parseSetup({ ...DEFAULT_SETUP, year: 1936 });
  assert.equal(parsed?.year, 1936);
  const omitted = parseSetup({ ...DEFAULT_SETUP, year: undefined });
  assert.equal(omitted?.year, DEFAULT_YEAR);

  const early = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, year: 1914, cpu: [false, false, false, false] });
  assert.equal(early.year, 1914);
  assert.equal(early.units.filter((u) => u.kind === "mcv").length, 2);
  const yard = early.buildings.find((b) => b.team === 0 && b.kind === "yard");
  assert.equal(yard, undefined);
  early.credits[0] = 20000;
  const mcv = early.units.find((u) => u.team === 0 && u.kind === "mcv");
  assert.ok(mcv);
  const spot = early.deploySpot(mcv!);
  assert.equal(spot.ok, true, spot.reason);
  early.issueDeploy([mcv!.id]);
  for (let i = 0; i < 25; i++) early.tick(0.1);
  const placed = early.canPlace(0, "helipad", 4, 4);
  assert.equal(placed.ok, false);
  assert.equal(shortPlaceReason(placed.reason), "Later era");
  const yardNow = early.buildings.find((b) => b.team === 0 && b.kind === "yard" && b.complete);
  assert.ok(yardNow);
  early.credits[0] = 5000;
  assert.equal(early.queueUnit(yardNow!.id, "attackheli").reason, "Later era");
  assert.equal(early.queueUnit(yardNow!.id, "rifle").reason, "Wrong building");

  const late = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, year: 1914, seed: 4, cpu: [false, false, false, false] });
  const twin = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, year: 1914, seed: 4, cpu: [false, false, false, false] });
  for (let i = 0; i < 8; i++) {
    late.tick(0.25);
    twin.tick(0.25);
  }
  assert.equal(late.units.length, twin.units.length);
  assert.equal(late.buildings.length, twin.buildings.length);
});
