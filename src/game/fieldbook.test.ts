import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARMOR_MULT,
  BUILDINGS,
  BUILD_ORDER,
  SILO_DRIP,
  UNITS,
  counterMul,
  resolveBuilding,
  resolveUnit,
  type BuildingId,
  type UnitId,
} from "./data.ts";
import { buildingOffered } from "./lobby.ts";
import { Sim } from "./sim.ts";
import {
  MCV_NOTE,
  YARD_NOTE,
  cardLine,
  bookBuildingIds,
  bookHalls,
  bookUnitIds,
  bookUnits,
  boundsOfAlpha,
  buildingPortrait,
  buildingStatLines,
  fitSheet,
  openGroundHits,
  siloBlurb,
  spanBlurb,
  structureAccess,
  structureBlurb,
  unitBlurb,
  unitPortrait,
  unitStatLines,
} from "./fieldbook.ts";

const isoDir = fileURLToPath(new URL("../../public/art/iso/", import.meta.url));
const isoFiles = new Set(
  readdirSync(isoDir)
    .filter((name) => name.endsWith(".png"))
    .map((name) => name.slice(0, -4)),
);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

test("the book lists every canonical record once, including silo and span", () => {
  const units = bookUnitIds();
  const halls = bookBuildingIds();
  assert.deepEqual(new Set(units), new Set(Object.keys(UNITS)));
  assert.equal(units.length, new Set(units).size);
  assert.deepEqual(new Set(halls), new Set(Object.keys(BUILDINGS)));
  assert.equal(halls.length, new Set(halls).size);
  assert.ok(halls.includes("silo"));
  assert.ok(halls.includes("span"));
  assert.equal(structureAccess("yard"), "deploy");
  assert.equal(structureAccess("power"), "menu");
  assert.equal(structureAccess("silo"), "reference");
  assert.equal(structureAccess("span"), "reference");
  for (const id of BUILD_ORDER) assert.equal(structureAccess(id), "menu");
  const reference = halls.filter((id) => structureAccess(id) === "reference");
  assert.deepEqual(reference.sort(), ["silo", "span"]);
});

test("faction locks follow canTrain and canBuild, and reference structures are not faction unlocks", () => {
  const concord = bookUnits("concord");
  const syndicate = bookUnits("syndicate");
  assert.equal(concord.find((row) => row.id === "vanguard")?.locked, false);
  assert.equal(concord.find((row) => row.id === "razor")?.locked, true);
  assert.equal(syndicate.find((row) => row.id === "vanguard")?.locked, true);
  assert.equal(syndicate.find((row) => row.id === "razor")?.locked, false);
  assert.deepEqual(
    bookUnits("steel").find((row) => row.id === "vanguard")?.home.sort(),
    ["concord", "steel"],
  );
  assert.deepEqual(
    bookUnits("prism").find((row) => row.id === "razor")?.home.sort(),
    ["prism", "syndicate"],
  );

  const halls = bookHalls("concord");
  assert.equal(halls.find((row) => row.id === "aa")?.locked, false);
  assert.equal(halls.find((row) => row.id === "radar")?.locked, true);
  assert.equal(halls.find((row) => row.id === "stealth")?.locked, true);
  assert.equal(bookHalls("prism").find((row) => row.id === "radar")?.locked, false);
  assert.equal(bookHalls("prism").find((row) => row.id === "aa")?.locked, true);
  const reference = halls.filter((row) => row.access === "reference").map((row) => row.id);
  assert.deepEqual(reference.sort(), ["silo", "span"]);
  for (const id of reference) assert.equal(halls.find((row) => row.id === id)?.locked, false);
});

test("portraits use the unit's own sheet or an honest label, never another entity", () => {
  assert.equal(isoFiles.size, 35);
  for (const id of Object.keys(UNITS) as UnitId[]) {
    const spec = unitPortrait(id);
    if (isoFiles.has(id)) {
      assert.equal(spec.kind, "sheet");
      if (spec.kind === "sheet") {
        assert.equal(spec.file, id);
        assert.equal(spec.src, `/art/iso/${id}.png`);
      }
    } else {
      assert.equal(spec.kind, "label");
      if (spec.kind === "label") assert.equal(spec.caption, "No picture");
    }
    if (spec.kind === "sheet") assert.notEqual(spec.file, "heli");
  }
  assert.equal(unitPortrait("marksman").kind === "sheet" && unitPortrait("marksman").kind === "sheet" ? (unitPortrait("marksman") as { file: string }).file : "", "marksman");
  const mark = unitPortrait("marksman");
  const wader = unitPortrait("wader");
  const tank = unitPortrait("tank");
  assert.equal(mark.kind, "sheet");
  assert.equal(wader.kind, "sheet");
  assert.equal(tank.kind, "sheet");
  if (mark.kind === "sheet" && wader.kind === "sheet" && tank.kind === "sheet") {
    assert.equal(mark.file, "marksman");
    assert.equal(wader.file, "wader");
    assert.notEqual(mark.file, tank.file);
    assert.notEqual(wader.file, tank.file);
  }
  for (const id of ["mcv", "gunboat", "frigate", "missile", "transport"] as UnitId[]) {
    assert.equal(isoFiles.has(id), false);
    assert.equal(unitPortrait(id).kind, "label");
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const spec = buildingPortrait(id);
    if (id !== "span") {
      assert.equal(isoFiles.has(id), true, id);
      assert.equal(spec.kind, "sheet");
      if (spec.kind === "sheet") assert.equal(spec.file, id);
    } else {
      assert.equal(isoFiles.has("span"), false);
      assert.equal(spec.kind, "label");
    }
  }
  assert.equal(buildingPortrait("supply").kind, "sheet");
  assert.equal(buildingPortrait("silo").kind, "sheet");
});

test("sheet fit keeps aspect and sits the picture on the bottom", () => {
  const wide = fitSheet(200, 100, 100, 80);
  assert.equal(wide.dw / wide.dh, 2);
  assert.equal(wide.dy, 80 - wide.dh);
  assert.ok(Math.abs(wide.dx - (100 - wide.dw) / 2) < 0.001);
  const tall = fitSheet(50, 200, 100, 80);
  assert.equal(tall.dh, 80);
  assert.equal(tall.dw, 20);
  assert.equal(tall.dy, 0);
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  pixels[4 * (1 * 4 + 2) + 3] = 255;
  const box = boundsOfAlpha(pixels, 4, 4);
  assert.deepEqual(box, { sx: 2, sy: 1, sw: 1, sh: 1 });
  assert.equal(boundsOfAlpha(new Uint8ClampedArray(16), 2, 2), null);
});

test("stat lines keep sight, weapon range, base damage, and target hits apart", () => {
  const rifle = resolveUnit("rifle", "concord");
  const lines = unitStatLines(rifle);
  const by = (label: string) => lines.find((line) => line.label === label);
  assert.equal(by("Sight")?.value, `${rifle.sight}`);
  assert.equal(by("Weapon range")?.value, `${rifle.range}`);
  assert.notEqual(by("Sight")?.value, by("Weapon range")?.value);
  assert.equal(by("Base damage")?.value, `${rifle.damage}`);
  assert.equal(by("Base damage / s")?.value, (rifle.damage / rifle.rof).toFixed(1));
  assert.match(by("Base damage / s")?.hint ?? "", /Not the damage a target takes/);
  assert.equal(by("Min range"), undefined);
  assert.equal(by("Cost")?.value, rifle.cost.toLocaleString("en-US"));
  assert.equal(by("Hit points")?.value, `${rifle.hp}`);

  const artillery = resolveUnit("artillery", "concord");
  assert.equal(unitStatLines(artillery).find((line) => line.label === "Min range")?.value, `${artillery.minRange}`);
  assert.equal(unitStatLines(artillery).find((line) => line.label === "Train gate")?.value, "Advanced Power");
  const bomber = unitStatLines(resolveUnit("bomber", "concord"));
  assert.equal(bomber.find((line) => line.label === "HQ tier")?.value, "4");
  assert.equal(bomber.find((line) => line.label === "Train gate")?.value, "Advanced Power");
  const apc = unitStatLines(resolveUnit("apc", "concord"));
  assert.equal(apc.find((line) => line.label === "Infantry seats")?.value, "5");
  assert.match(apc.find((line) => line.label === "Infantry seats")?.hint ?? "", /Not a capture score/);

  const hits = openGroundHits(rifle);
  const light = hits.find((line) => line.label === "Light infantry");
  assert.equal(light?.value, `${Math.round(rifle.damage * rifle.vsInf * counterMul("rifle", "light"))}`);
  assert.equal(ARMOR_MULT.rifle.light, counterMul("rifle", "light"));
  assert.match(hits.find((line) => line.label === "Aircraft") ? "air" : "no-air", /no-air/);

  const prism = resolveUnit("marksman", "prism");
  const concord = resolveUnit("marksman", "concord");
  assert.notEqual(prism.damage, concord.damage);
  assert.equal(unitStatLines(prism).find((line) => line.label === "Base damage")?.value, `${prism.damage}`);
  assert.notEqual(unitStatLines(prism).find((line) => line.label === "Still sight")?.value, unitStatLines(concord).find((line) => line.label === "Still sight")?.value);

  const steelWall = bookHalls("steel").find((row) => row.id === "wall")!;
  const concordWall = bookHalls("concord").find((row) => row.id === "wall")!;
  assert.ok(steelWall.b.hp > concordWall.b.hp);
  assert.equal(buildingStatLines(steelWall.b).find((line) => line.label === "Hit points")?.value, `${steelWall.b.hp}`);
  assert.notEqual(steelWall.b.hp, BUILDINGS.wall.hp);

  const power = buildingStatLines(resolveBuilding("power", "concord"));
  assert.equal(power.find((line) => line.label === "Cost")?.value, BUILDINGS.power.cost.toLocaleString("en-US"));
  assert.equal(power.find((line) => line.label === "Power out")?.value, "+100");
  assert.equal(buildingStatLines(resolveBuilding("power", "steel")).find((line) => line.label === "Power out")?.value, "+115");

  const silo = buildingStatLines(resolveBuilding("silo", "concord"));
  assert.equal(silo.find((line) => line.label === "Cost"), undefined);
  assert.equal(silo.find((line) => line.label === "Build time"), undefined);
  assert.equal(silo.find((line) => line.label === "Requires"), undefined);
  assert.equal(silo.find((line) => line.label === "Storage"), undefined);
  assert.equal(silo.find((line) => line.label === "Powered income")?.value, `+${SILO_DRIP}/s`);
  const span = buildingStatLines(resolveBuilding("span", "concord"));
  assert.equal(span.find((line) => line.label === "Cost"), undefined);
  assert.equal(span.find((line) => line.label === "Build time"), undefined);
  const yard = buildingStatLines(resolveBuilding("yard", "concord"));
  assert.equal(yard.find((line) => line.label === "Cost"), undefined);
  assert.equal(yard.find((line) => line.label === "Build time"), undefined);
});

test("silo and span copy comes from the record and does not offer a purchase", () => {
  const silo = resolveBuilding("silo", "concord");
  const span = resolveBuilding("span", "concord");
  assert.ok(silo.storage > 0);
  assert.equal(span.cost, 0);
  assert.equal(span.time, 0);
  assert.equal(structureBlurb("silo", silo), siloBlurb());
  assert.equal(structureBlurb("span", span), spanBlurb());
  assert.match(siloBlurb(), /Not on the build list/);
  assert.match(siloBlurb(), new RegExp(`${SILO_DRIP}`));
  assert.match(siloBlurb(), /not a credit cap/i);
  assert.doesNotMatch(siloBlurb(), /150/);
  assert.doesNotMatch(siloBlurb(), /Requires/);
  assert.match(spanBlurb(), /not built/i);
  assert.doesNotMatch(spanBlurb(), /Buy|purchase|Requires/i);
  for (const faction of ["concord", "syndicate", "steel", "prism"] as const) {
    assert.equal(buildingOffered("coast", faction, "silo"), false);
    assert.equal(buildingOffered("coast", faction, "span"), false);
    assert.equal(buildingOffered("river", faction, "span"), false);
  }
});

test("settings, pause settings, the ready screen, and friends all open this book", () => {
  const settings = readSrc("../components/SettingsSheet.tsx");
  const game = readSrc("../components/GameScreen.tsx");
  const ready = readSrc("../components/ReadyUp.tsx");
  const net = readSrc("../components/NetLobby.tsx");
  const arsenal = readSrc("../components/Arsenal.tsx");
  assert.match(settings, /data-testid="settings-troop-book"/);
  assert.match(settings, /h-12 min-h-12/);
  assert.match(game, /onOpenBook=\{\(\) => setMenuBook\(true\)\}/);
  assert.match(game, /onOpenBook=\{\(\) => setPauseBook\(true\)\}/);
  assert.match(game, /data-testid="pause-troop-book"/);
  assert.match(ready, /data-testid="ready-troop-book"/);
  assert.match(ready, /h-12 min-h-12/);
  assert.match(ready, /<Arsenal/);
  assert.match(net, /data-testid="open-arsenal"/);
  assert.match(net, /if \(book\) return <Arsenal/);
  assert.match(net, /h-12 min-h-12/);
  assert.match(arsenal, /data-testid="arsenal-tab-troops"/);
  assert.match(arsenal, /data-testid="arsenal-tab-buildings"/);
  assert.match(arsenal, /data-testid="arsenal-reference"/);
  assert.doesNotMatch(arsenal, /\/art\/hull\.png|\/art\/infantry\.png|hue-rotate/);
});

/** The freeze rule, in the same words, on the card and in both long notes. */
const ON_FIELD = /An MCV on the field—not loaded in a transport—freezes the remaining countdown/;

function assertRebuildCopyAgrees() {
  const mcvCard = cardLine(bookUnits("concord").find((row) => row.id === "mcv")!);
  const yardCard = cardLine(bookHalls("concord").find((row) => row.id === "yard")!);
  assert.match(MCV_NOTE, ON_FIELD);
  assert.match(YARD_NOTE, ON_FIELD);
  assert.match(mcvCard, ON_FIELD);
  assert.match(mcvCard, /deploying restores the Yard and clears it/);
  assert.match(MCV_NOTE, /Deploying the MCV restores the yard and clears the clock/);
  assert.match(YARD_NOTE, /Deploying it restores the yard and clears the clock/);
  assert.match(MCV_NOTE, /does not clear the clock/);
  assert.match(MCV_NOTE, /does not start it over/);
  assert.match(YARD_NOTE, /does not clear the clock/);
  assert.match(YARD_NOTE, /does not start it over/);
  assert.match(YARD_NOTE, /including one gained during the countdown/);
  assert.match(MCV_NOTE, /2 seconds/);
  assert.match(YARD_NOTE, /60 second/);
  const eliminated = "At 0, with no standing Yard and no MCV on the field outside a transport, that side is eliminated.";
  assert.ok(MCV_NOTE.includes(eliminated));
  assert.ok(YARD_NOTE.includes(eliminated));
  assert.doesNotMatch(YARD_NOTE, /At 0, with no yard and no MCV, that side is eliminated/);
  assert.doesNotMatch(MCV_NOTE, /At 0, with no yard and no MCV, that side is eliminated/);
  assert.match(mcvCard, /60s clock/);
  assert.match(yardCard, /60s rebuild clock/);
  assert.doesNotMatch(mcvCard, /Owning an MCV only freezes/);
  assert.doesNotMatch(YARD_NOTE, /undeployed MCV is alive/);
  assert.doesNotMatch(`${MCV_NOTE} ${YARD_NOTE} ${mcvCard}`, /Owning an MCV only freezes|undeployed MCV is alive/);
}

test("yard and MCV copy name the transport exception with the freeze", () => {
  assertRebuildCopyAgrees();
  assert.equal(unitBlurb(resolveUnit("mcv", "concord")), MCV_NOTE);
  assert.equal(structureBlurb("yard", resolveBuilding("yard", "concord")), YARD_NOTE);
});

test("a countdown with only a transported MCV left eliminates that side at 0", () => {
  const { sim } = bootDry();
  const yard = sim.buildings.find((b) => b.team === 0 && b.kind === "yard" && b.hp > 0);
  assert.ok(yard);
  const boat = sim.spawnUnit(0, "transport", yard.tx + 8.5, yard.ty + 6.5);
  const mcv = sim.spawnUnit(0, "mcv", yard.tx + 8.5, yard.ty + 8.5);
  assert.ok(boat);
  assert.ok(mcv);
  mcv.aboard = boat.id;
  boat.riders = [mcv.id];
  for (const u of sim.units) {
    if (u.team === 0 && u !== boat && u !== mcv) u.hp = 0;
  }
  yard.hp = 0;
  sim.tick(0.1);
  const started = sim.rebuildClock(0);
  assert.equal(sim.eliminated[0], false);
  assert.equal(sim.outcome, "playing");
  assert.ok(started != null && started > 59 && started <= 60, `clock ${started}`);
  const ours = sim.units.filter((u) => u.team === 0 && u.hp > 0);
  assert.deepEqual(
    ours.map((u) => u.kind).sort(),
    ["mcv", "transport"],
    `extra units ${ours.map((u) => u.kind).join(",")}`,
  );

  const mark = sim.time;
  let sawResume = false;
  let eliminatedAt = -1;
  for (let i = 0; i < 700 && eliminatedAt < 0; i++) {
    assert.equal(mcv.aboard, boat.id, "the MCV left the transport before the clock ended");
    assert.ok(mcv.hp > 0 && boat.hp > 0);
    const before = sim.rebuildClock(0);
    sim.tick(0.1);
    if (sim.eliminated[0]) {
      eliminatedAt = sim.time;
      break;
    }
    const after = sim.rebuildClock(0);
    if (before != null && after != null && after < before - 0.05) sawResume = true;
    if (sim.time - mark < 30) assert.equal(sim.outcome, "playing");
  }
  assert.equal(sawResume, true, "the transported MCV froze the clock");
  assert.equal(sim.eliminated[0], true);
  assert.ok(eliminatedAt - mark >= 58 && eliminatedAt - mark <= 61, `eliminated after ${eliminatedAt - mark}s`);
  assert.equal(mcv.hp > 0 && mcv.aboard === boat.id, true);
  assert.equal(sim.outcome, "lose");
  assert.equal(sim.reason, "Rebuild or be defeated");
});

function bootDry() {
  const sim = new Sim({
    mapId: "dry",
    faction: "concord",
    mode: "destroy",
    fog: false,
    crates: false,
    cpu: [false, false, false, false],
    seed: 4,
  });
  const mcv = sim.units.find((u) => u.team === 0 && u.kind === "mcv");
  assert.ok(mcv, "opening mcv");
  sim.issueDeploy([mcv.id]);
  let appeared = -1;
  for (let i = 0; i < 40; i++) {
    sim.tick(0.1);
    if (appeared < 0 && sim.buildings.some((b) => b.team === 0 && b.kind === "yard" && b.complete && b.hp > 0)) {
      appeared = sim.time;
    }
  }
  assert.ok(appeared > 0, "yard never deployed");
  return { sim, appeared };
}

function park(sim: Sim, id: number): void {
  const u = sim.unitById(id);
  assert.ok(u);
  for (let ty = 2; ty < sim.gh - 5; ty++) {
    for (let tx = 2; tx < sim.gw - 5; tx++) {
      u.x = tx + 1.5;
      u.y = ty + 1.5;
      const spot = sim.deploySpot(u);
      if (spot.ok) return;
    }
  }
  assert.fail("no pad for the second MCV");
}

test("deploy restores the yard, and an MCV gained during the countdown only freezes it", () => {
  const { sim, appeared } = bootDry();
  assert.ok(appeared >= 1.9 && appeared <= 2.15, `unpack at ${appeared}`);
  assert.match(MCV_NOTE, new RegExp(`${Math.round(appeared)} seconds`));
  assert.equal(sim.units.some((u) => u.team === 0 && u.kind === "mcv" && u.hp > 0), false);
  assert.equal(sim.rebuildClock(0), null);
  assert.match(YARD_NOTE, /standing yard starts a 60 second/);
  assertRebuildCopyAgrees();
  assert.doesNotMatch(`${YARD_NOTE} ${MCV_NOTE}`, /match ends if the yard is gone/i);
  assert.doesNotMatch(`${YARD_NOTE} ${MCV_NOTE}`, /no MCV is left/i);

  const yard = sim.buildings.find((b) => b.team === 0 && b.kind === "yard");
  assert.ok(yard);
  const rifle = sim.spawnUnit(0, "rifle", yard.tx + yard.w + 3.5, yard.ty + 1.5);
  assert.ok(rifle);
  yard.hp = 0;
  sim.tick(0.1);
  const started = sim.rebuildClock(0);
  assert.equal(sim.outcome, "playing");
  assert.ok(started != null && started > 59 && started <= 60, `clock ${started}`);
  assert.match(YARD_NOTE, new RegExp(`${Math.round(started)} second`));
  sim.tick(1);
  const fallen = sim.rebuildClock(0);
  assert.ok(fallen != null && fallen < started - 0.5, `clock kept running at ${fallen}`);

  const gained = sim.spawnUnit(0, "mcv", yard.tx + 8.5, yard.ty + 8.5);
  assert.ok(gained);
  const frozen = sim.rebuildClock(0);
  assert.ok(frozen != null && frozen < 60 && frozen > 50, `freeze point ${frozen}`);
  sim.tick(2);
  assert.ok(Math.abs((sim.rebuildClock(0) ?? 0) - frozen) < 0.02, "owning the MCV cleared or restarted the clock");
  assert.equal(sim.outcome, "playing");

  const boat = sim.spawnUnit(0, "transport", gained.x + 3, gained.y);
  assert.ok(boat);
  gained.aboard = boat.id;
  const before = sim.rebuildClock(0) ?? 0;
  sim.tick(1);
  const resumed = sim.rebuildClock(0) ?? 0;
  assert.ok(resumed < before - 0.5, `loaded MCV still froze the clock (${before} -> ${resumed})`);
  gained.aboard = 0;

  park(sim, gained.id);
  sim.issueDeploy([gained.id]);
  let cleared = false;
  for (let i = 0; i < 30 && !cleared; i++) {
    sim.tick(0.1);
    cleared = sim.rebuildClock(0) == null && sim.buildings.some((b) => b.team === 0 && b.kind === "yard" && b.complete && b.hp > 0);
  }
  assert.equal(cleared, true, "deploy did not restore the yard");
  assert.equal(sim.outcome, "playing");
  assert.notEqual(sim.reason, "No buildings or units remain");
  assert.equal(unitBlurb(resolveUnit("mcv", "concord")), MCV_NOTE);
  assert.equal(structureBlurb("yard", resolveBuilding("yard", "concord")), YARD_NOTE);
});

test("a neutral silo pays nothing until captured, and credits are not capped by its storage", () => {
  const { sim } = bootDry();
  const silo = sim.buildings.find((b) => b.kind === "silo" && b.neutral);
  assert.ok(silo, "the map plants a neutral silo");
  sim.credits[0] = 20000;
  const yard = sim.buildings.find((b) => b.team === 0 && b.kind === "yard" && b.hp > 0);
  assert.ok(yard);
  let placed = false;
  for (let dy = -8; dy <= 8 && !placed; dy++) {
    for (let dx = -8; dx <= 8 && !placed; dx++) {
      if (sim.tryPlace(0, "power", yard.tx + dx, yard.ty + dy).ok) placed = true;
    }
  }
  assert.equal(placed, true);
  for (let i = 0; i < BUILDINGS.power.time * 12; i++) sim.tick(0.1);
  assert.equal(sim.powerOf(0).low, false);
  const before = sim.supplyPerSec(0);
  assert.ok(before > 0, "yard drip");
  silo.team = 0;
  silo.neutral = false;
  const after = sim.supplyPerSec(0);
  assert.ok(Math.abs(after - before - SILO_DRIP) < 0.001, `silo drip ${after} vs ${before}`);
  silo.neutral = true;
  assert.ok(Math.abs(sim.supplyPerSec(0) - before) < 0.001, "a neutral silo still paid");
  silo.neutral = false;
  sim.credits[0] = sim.storageOf(0) + 4000;
  const purse = sim.credits[0];
  sim.tick(1);
  assert.ok(sim.credits[0] > purse, "income stopped at the storage field");
  assert.ok(sim.credits[0] > sim.storageOf(0));
});

test("a span is already on the map and cannot be bought", () => {
  const sim = new Sim({
    mapId: "river",
    faction: "concord",
    mode: "destroy",
    fog: false,
    crates: false,
    cpu: [false, false, false, false],
    seed: 2,
  });
  const span = sim.buildings.find((b) => b.kind === "span");
  assert.ok(span);
  assert.equal(span.neutral, true);
  const mcv = sim.units.find((u) => u.team === 0 && u.kind === "mcv");
  assert.ok(mcv);
  sim.issueDeploy([mcv.id]);
  for (let i = 0; i < 25; i++) sim.tick(0.1);
  const pad = sim.nearestBuildPad(0, "power");
  assert.ok(pad);
  assert.match(sim.canPlace(0, "span", pad.tx, pad.ty).reason, /already placed/);
});
