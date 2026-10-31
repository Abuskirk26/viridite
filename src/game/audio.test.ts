import assert from "node:assert/strict";
import test from "node:test";
import { BARKS, EVA_LINE, SCORE_IDS, barkClass, combatTrack, nearestStep, scoreHasBody, type Cue } from "./audio.ts";
import { Sim } from "./sim.ts";

test("advisor lines and both combat beds exist", () => {
  for (const line of Object.values(EVA_LINE)) assert.ok(line.endsWith("."));
  assert.match(EVA_LINE.constructDone, /Construction complete/);
  assert.match(EVA_LINE.unitReady, /Unit ready/);
  assert.match(EVA_LINE.lowPower, /Low power/);
  assert.match(EVA_LINE.baseAttack, /Our base is under attack/);
  assert.match(EVA_LINE.funds, /Insufficient funds/);
  assert.match(EVA_LINE.win, /Mission accomplished/);
  assert.match(EVA_LINE.lose, /Mission failed/);
  for (const id of SCORE_IDS) assert.equal(scoreHasBody(id), true, id);
  assert.equal(combatTrack("syndicate"), "combatB");
  assert.equal(combatTrack("concord"), "combatA");
  assert.equal(nearestStep(0.78), "on");
  assert.equal(nearestStep(0), "off");
});

test("barks cycle per class without repeating the same line twice in a row", () => {
  for (const cls of ["infantry", "vehicle", "harvester", "air", "naval"] as const) {
    for (const act of ["select", "move", "attack"] as const) {
      assert.ok(BARKS[cls][act].length >= 3);
      assert.ok(BARKS[cls][act].length <= 4);
    }
  }
  assert.equal(barkClass("rifle"), "infantry");
  assert.equal(barkClass("tank"), "vehicle");
  assert.equal(barkClass("harvester"), "harvester");
  assert.equal(barkClass("attackheli"), "air");
  assert.equal(barkClass("gunboat"), "naval");
  assert.equal(barkClass("mcv"), "vehicle");
});

test("deploy, low power, and a finished structure cue the listener", () => {
  const sim = new Sim({
    mapId: "dry",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    fog: false,
    crates: false,
    seed: 3,
    credits: 5000,
  });
  const heard: Cue[] = [];
  sim.onCue = (c) => heard.push(c);
  const mcv = sim.units.find((u) => u.team === 0 && u.kind === "mcv");
  assert.ok(mcv);
  sim.issueDeploy([mcv.id]);
  for (let i = 0; i < 30; i++) sim.tick(0.1);
  assert.ok(heard.some((c) => c.t === "sfx" && c.id === "deploy"));
  assert.ok(heard.some((c) => c.t === "voice" && c.id === "constructDone"));
  assert.equal(heard.some((c) => c.t === "voice" && c.id === "lowPower"), false);

  const yard = sim.buildings.find((b) => b.team === 0 && b.kind === "yard");
  assert.ok(yard);
  const before = heard.length;
  const placed = sim.tryPlace(0, "power", yard.tx + 3, yard.ty);
  assert.equal(placed.ok, true, placed.reason);
  assert.ok(heard.slice(before).some((c) => c.t === "sfx" && c.id === "place"));
  assert.ok(heard.slice(before).some((c) => c.t === "voice" && c.id === "building"));
  for (let i = 0; i < 5; i++) sim.tick(0.1);
  assert.ok(heard.some((c) => c.t === "bed" && c.id === "construct" && c.on));

  const plant = sim.buildings.find((b) => b.team === 0 && b.kind === "power");
  assert.ok(plant);
  plant.complete = true;
  plant.powerOut = 10;
  yard.powerUse = 40;
  sim.tick(0.1);
  assert.ok(heard.some((c) => c.t === "voice" && c.id === "lowPower"));
  assert.ok(heard.some((c) => c.t === "bed" && c.id === "brownout" && c.on));

  const rifle = sim.units.find((u) => u.team === 0 && u.kind === "mcv");
  assert.equal(rifle, undefined);
  const ids = sim.units.filter((u) => u.team === 0).map((u) => u.id);
  if (ids.length) {
    sim.issueMove(ids, sim.starts.player.x + 3, sim.starts.player.y, false);
    assert.ok(heard.some((c) => c.t === "bark" && c.act === "move"));
  }
});
