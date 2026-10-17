import assert from "node:assert/strict";
import test from "node:test";
import { BUILDINGS, HARVEST_PER_SEC, MAP_W, TILE_BRIDGE, TILE_CLEAR, TILE_CLIFF, TILE_DEEP, TILE_RAMP, TILE_SCRUB, TILE_SHALLOW, TILE_SHORE, TILE_STUMP, TILE_WRECK, resolveBuilding } from "./data.ts";
import { Sim, shortPlaceReason, type Building } from "./sim.ts";
import { buildFeatured } from "./featured.ts";
import { pack } from "./custom.ts";

function deployPlayer(sim: Sim) {
  const mcv = sim.units.find((u) => u.team === 0 && u.kind === "mcv");
  assert.ok(mcv, "player mcv");
  const spot = sim.deploySpot(mcv);
  assert.equal(spot.ok, true, spot.reason);
  sim.issueDeploy([mcv.id]);
  for (let i = 0; i < 25; i++) sim.tick(0.1);
  const yard = sim.buildings.find((b) => b.team === 0 && b.kind === "yard" && b.complete);
  assert.ok(yard, "yard online");
  return yard;
}

let stubId = 9000;
function stubBuilding(sim: Sim, partial: Partial<Building> & Pick<Building, "kind" | "team" | "tx" | "ty">): Building {
  const def = BUILDINGS[partial.kind];
  const b: Building = {
    id: partial.id ?? stubId++,
    kind: partial.kind,
    team: partial.team,
    name: def.name,
    tx: partial.tx,
    ty: partial.ty,
    w: partial.w ?? def.w,
    h: partial.h ?? def.h,
    hp: partial.hp ?? def.hp,
    maxHp: partial.maxHp ?? def.hp,
    complete: partial.complete ?? true,
    buildLeft: 0,
    buildTotal: Math.max(0.1, def.time),
    queue: [],
    prod: 0,
    rallyX: partial.rallyX ?? partial.tx + 1,
    rallyY: partial.rallyY ?? partial.ty + 1,
    cooldown: 0,
    powerUse: def.powerUse,
    powerOut: def.powerOut,
    sight: def.sight,
    damage: def.damage,
    range: def.range,
    rof: def.rof,
    vsInf: def.vsInf,
    vsVeh: def.vsVeh,
    vsBld: def.vsBld,
    storage: def.storage,
    neutral: partial.neutral ?? false,
    special: def.special ?? null,
    vsAir: def.vsAir ?? 0,
    open: partial.open ?? partial.kind === "gate",
    rubble: partial.rubble ?? 0,
    hit: 0,
    mending: partial.mending ?? false,
  };
  sim.buildings.push(b);
  return b;
}

test("a ghost snaps onto the yard radius and names a miss", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const yard = deployPlayer(sim);
  sim.credits[0] = 8000;
  const snapped = sim.snapFootprint(0, "power", yard!.tx, yard!.ty, 4);
  assert.equal(sim.canPlace(0, "power", snapped.tx, snapped.ty).ok, true);
  assert.ok(Math.abs(snapped.tx - yard!.tx) <= 4 && Math.abs(snapped.ty - yard!.ty) <= 4);
  const far = sim.canPlace(0, "power", 1, 1);
  if (!far.ok) {
    assert.match(shortPlaceReason(far.reason), /Too far|Blocked|On ore|On unit|No power|Insufficient funds/);
  }
  assert.equal(shortPlaceReason("Can't build on crystal"), "On ore");
  assert.equal(shortPlaceReason("Unit in the way"), "On unit");
  assert.equal(shortPlaceReason("Needs more power"), "No power");
  assert.equal(shortPlaceReason("Not enough credits"), "Insufficient funds");
  assert.equal(shortPlaceReason("Too far from your buildings"), "Too far");
  assert.equal(shortPlaceReason("Blocked"), "Blocked");
});

test("deploy MCV into a construction yard", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy" });
  deployPlayer(sim);
  assert.equal(
    sim.units.some((u) => u.team === 0 && u.kind === "mcv"),
    false,
  );
});

test("power, refinery, and harvester loop", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy" });
  const yard = deployPlayer(sim);
  let powered = false;
  for (let dy = -6; dy <= 6 && !powered; dy++) {
    for (let dx = -6; dx <= 8 && !powered; dx++) {
      if (sim.tryPlace(0, "power", yard.tx + dx, yard.ty + dy).ok) powered = true;
    }
  }
  assert.equal(powered, true, "found a power pad");
  for (let i = 0; i < 90; i++) sim.tick(0.1);
  assert.ok(sim.powerOf(0).supply >= 100, "dynamo online");
  assert.equal(sim.powerOf(0).low, false);

  sim.credits[0] = 8000;
  let refined = false;
  for (let dy = -8; dy <= 8 && !refined; dy++) {
    for (let dx = -8; dx <= 8 && !refined; dx++) {
      if (sim.tryPlace(0, "refinery", yard.tx + dx, yard.ty + dy).ok) refined = true;
    }
  }
  assert.equal(refined, true, "found a refinery pad");
  for (let i = 0; i < 160; i++) sim.tick(0.1);
  assert.ok(
    sim.units.some((u) => u.team === 0 && u.kind === "harvester"),
    "harvester spawned",
  );
  const before = sim.credits[0];
  for (let i = 0; i < 500; i++) sim.tick(0.1);
  const cargo = sim.units.filter((u) => u.team === 0 && u.kind === "harvester").reduce((n, u) => n + u.cargo, 0);
  assert.ok(sim.credits[0] > before || cargo > 50, `credits ${sim.credits[0]} cargo ${cargo}`);
});

test("rifles trade shots", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy" });
  const a = sim.spawnUnit(0, "rifle", 20.5, 20.5);
  const b = sim.spawnUnit(1, "rifle", 22.5, 20.5);
  assert.ok(a && b);
  sim.issueAttack([a.id], b.id);
  const hp = b.hp;
  for (let i = 0; i < 100; i++) sim.tick(0.1);
  const still = sim.unitById(b.id);
  assert.ok(!still || still.hp < hp);
});

test("the scoreboard counts a kill, a lost rifle, and time the power stayed on", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false });
  const a = sim.spawnUnit(0, "rifle", 20.5, 20.5);
  const b = sim.spawnUnit(1, "rifle", 22.2, 20.5);
  assert.ok(a && b);
  b.hp = 1;
  sim.issueAttack([a.id], b.id);
  for (let i = 0; i < 40 && sim.unitById(b.id); i++) sim.tick(0.1);
  assert.equal(sim.unitById(b.id), undefined);
  assert.equal(sim.scorecard(0).kills, 1);
  assert.equal(sim.scorecard(1).lost, 1);
  assert.equal(sim.scorecard(0).lost, 0);
  stubBuilding(sim, { kind: "power", team: 0, tx: 8, ty: 8, complete: true });
  const before = sim.scorecard(0).power;
  for (let i = 0; i < 30; i++) sim.tick(0.1);
  assert.ok(sim.scorecard(0).power >= before, `power ${sim.scorecard(0).power}`);
  assert.ok(sim.scorecard(0).power > 0);
});

test("a sealed sandbag ring stops a rifle instead of walking through", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false });
  const rifle = sim.spawnUnit(0, "rifle", 24.5, 24.5);
  assert.ok(rifle);
  const ring: [number, number][] = [
    [23, 23],
    [24, 23],
    [25, 23],
    [23, 24],
    [25, 24],
    [23, 25],
    [24, 25],
    [25, 25],
  ];
  for (const [tx, ty] of ring) {
    const b = stubBuilding(sim, {
      kind: "sandbag",
      team: 1,
      tx,
      ty,
      w: 1,
      h: 1,
      hp: 70,
      maxHp: 70,
      complete: true,
    });
    sim.occ[ty * MAP_W + tx] = b.id;
  }
  const x0 = rifle.x;
  sim.issueMove([rifle.id], 40.5, 24.5, false);
  assert.equal(rifle.order.t, "idle");
  assert.ok(rifle.blocked > 0.5);
  for (let i = 0; i < 25; i++) sim.tick(0.1);
  const foot = sim.unitById(rifle.id);
  assert.ok(foot && Math.abs(foot.x - x0) < 0.25, `rifle walked through x=${foot?.x}`);
});

test("raider normal lets a Coastline opener stand up", () => {
  const sim = new Sim({
    mapId: "coast",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    ai: "raider",
    difficulty: "normal",
    fog: true,
    crates: false,
    mapSize: "skirmish",
    opponents: 1,
    teams: "ffa",
    start: "sw",
    walls: true,
    seed: 1,
  });
  const home = sim.starts.player;
  const camp = sim.starts.enemy;
  let yardAt = -1;
  let scoutLeft = -1;
  let pokeAt = -1;
  let waveAt = -1;
  let earlyVehicle = -1;
  let vehicleRush = -1;
  while (sim.time < 210 && sim.outcome === "playing") {
    sim.tick(0.1);
    if (yardAt < 0 && sim.buildings.some((b) => b.team === 1 && b.kind === "yard" && b.complete)) yardAt = sim.time;
    const foe = sim.units.filter((u) => u.team === 1 && u.hp > 0 && u.damage > 0);
    if (scoutLeft < 0 && foe.some((u) => Math.hypot(u.x - camp.x, u.y - camp.y) > 12)) scoutLeft = sim.time;
    const near = foe.filter((u) => Math.hypot(u.x - home.x, u.y - home.y) < 14);
    const nearVeh = near.filter((u) => u.armor === "vehicle");
    if (earlyVehicle < 0 && nearVeh.length > 0 && sim.time < 100) earlyVehicle = sim.time;
    if (vehicleRush < 0 && nearVeh.length >= 2 && sim.time < 165) vehicleRush = sim.time;
    if (pokeAt < 0 && sim.aiPoked[1]) pokeAt = sim.time;
    if (waveAt < 0 && sim.aiPushed[1]) waveAt = sim.time;
  }
  const bld = sim.buildings.filter((b) => b.team === 1 && b.hp > 0).map((b) => b.kind);
  const detail = `yard ${yardAt.toFixed(0)} left ${scoutLeft.toFixed(0)} poke ${pokeAt.toFixed(0)} wave ${waveAt.toFixed(0)} earlyVeh ${earlyVehicle} rush ${vehicleRush} intent ${sim.aiIntent[1]} bld ${bld.join(",")}`;
  assert.ok(yardAt >= 0 && yardAt <= 10, detail);
  assert.ok(bld.includes("power") && bld.includes("refinery") && bld.includes("barracks"), detail);
  assert.ok(scoutLeft < 0 || scoutLeft >= 140, detail);
  assert.equal(earlyVehicle, -1, detail);
  assert.equal(vehicleRush, -1, detail);
  assert.ok(pokeAt >= 145 && pokeAt <= 195, detail);
  assert.ok(waveAt >= 165 && waveAt <= 230, detail);
  assert.ok(sim.aiIntent[1] === "attack" || sim.aiIntent[1] === "scout", detail);
});

test("easy raider does not touch the base before three minutes", () => {
  const sim = new Sim({
    mapId: "coast",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    ai: "raider",
    difficulty: "easy",
    fog: true,
    crates: false,
    mapSize: "skirmish",
    opponents: 1,
    teams: "ffa",
    start: "sw",
    walls: false,
    seed: 1,
  });
  const home = sim.starts.player;
  let contact = -1;
  let guns = 0;
  while (sim.time < 180 && sim.outcome === "playing") {
    sim.tick(0.1);
    const near = sim.units.filter(
      (u) => u.team === 1 && u.hp > 0 && u.damage > 0 && Math.hypot(u.x - home.x, u.y - home.y) < 14,
    );
    if (contact < 0 && near.length) contact = sim.time;
    guns = Math.max(
      guns,
      sim.units.filter((u) => u.team === 1 && u.hp > 0 && (u.kind === "tank" || u.kind === "razor" || u.kind === "medium")).length,
    );
  }
  assert.equal(contact, -1, `easy contact at ${contact}`);
  assert.equal(guns, 0, "easy built a tank before four minutes");
  assert.notEqual(sim.aiIntent[1], "attack");
});

test("attack order aims at the enemy camp when nothing is built", () => {
  const sim = new Sim({
    mapId: "coast",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    fog: false,
    crates: false,
    mapSize: "skirmish",
    opponents: 1,
    teams: "ffa",
    seed: 1,
  });
  const at = sim.pushTarget(0);
  const camp = sim.starts.slots[1] ?? sim.starts.enemy;
  assert.ok(Math.hypot(at.x - camp.x, at.y - camp.y) < 1.5, `${at.x},${at.y} vs ${camp.x},${camp.y}`);
});

test("one power plant cannot carry a war factory", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, credits: 20000 });
  const yard = deployPlayer(sim);
  const place = (kind: "power" | "refinery" | "barracks" | "factory" | "tower") => {
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        if (sim.tryPlace(0, kind, yard.tx + dx, yard.ty + dy).ok) return true;
      }
    }
    return false;
  };
  const finish = (kind: string, seconds: number) => {
    for (let i = 0; i < seconds * 10 + 5; i++) sim.tick(0.1);
    assert.ok(
      sim.buildings.some((b) => b.team === 0 && b.kind === kind && b.complete),
      `${kind} did not finish`,
    );
  };
  assert.equal(place("power"), true);
  finish("power", BUILDINGS.power.time);
  assert.equal(place("refinery"), true);
  finish("refinery", BUILDINGS.refinery.time);
  assert.equal(place("barracks"), true);
  finish("barracks", BUILDINGS.barracks.time);
  const live = sim.powerOf(0);
  const fac = resolveBuilding("factory", "concord");
  assert.ok(live.supply >= 100 && live.use + fac.powerUse > live.supply, `budget ${live.use}/${live.supply}`);
  let blocked = "";
  for (let dy = -10; dy <= 10 && !blocked; dy++) {
    for (let dx = -10; dx <= 10 && !blocked; dx++) {
      const check = sim.canPlace(0, "factory", yard.tx + dx, yard.ty + dy);
      if (check.reason === "Needs more power") blocked = check.reason;
      else if (check.ok) blocked = "placed";
    }
  }
  assert.equal(blocked, "Needs more power");
  const online = () => sim.buildings.filter((b) => b.team === 0 && b.kind === "power" && b.complete && b.hp > 0).length;
  assert.equal(online(), 1);
  assert.equal(place("power"), true, "second plant");
  for (let i = 0; i < BUILDINGS.power.time * 10 + 8 && online() < 2; i++) sim.tick(0.1);
  assert.equal(online(), 2, "second dynamo");
  assert.equal(place("factory"), true, "factory after the second plant");
  assert.ok(HARVEST_PER_SEC <= 80, "harvest stays harassable");
});

test("passive holds until hit, builder techs before the push", () => {
  const passive = new Sim({
    mapId: "coast",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    ai: "passive",
    difficulty: "normal",
    fog: true,
    crates: false,
    walls: false,
    seed: 2,
  });
  const camp = passive.starts.enemy;
  while (passive.time < 150 && passive.outcome === "playing") passive.tick(0.1);
  const wandered = passive.units.some(
    (u) => u.team === 1 && u.hp > 0 && u.damage > 0 && Math.hypot(u.x - camp.x, u.y - camp.y) > 18,
  );
  assert.equal(wandered, false, "passive left home");
  assert.equal(passive.aiIntent[1], "defend");
  const yard = passive.buildings.find((b) => b.team === 1 && b.kind === "yard" && b.hp > 0);
  assert.ok(yard);
  yard.hp = yard.maxHp * 0.4;
  passive.noteThreat(1, passive.starts.player.x, passive.starts.player.y, 0);
  const before = passive.time;
  while (passive.time < before + 20 && passive.outcome === "playing") passive.tick(0.1);
  const counter = passive.units.some(
    (u) =>
      u.team === 1 &&
      u.hp > 0 &&
      u.damage > 0 &&
      (u.order.t === "attack" ||
        (u.order.t === "move" && u.order.attackMove) ||
        Math.hypot(u.x - camp.x, u.y - camp.y) > 12),
  );
  assert.equal(counter, true, "passive did not counter");

  const builder = new Sim({
    mapId: "dry",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    ai: "builder",
    difficulty: "normal",
    fog: true,
    crates: false,
    walls: false,
    seed: 3,
  });
  while (builder.time < 200 && builder.outcome === "playing") builder.tick(0.1);
  const refs = builder.buildings.filter((b) => b.team === 1 && b.kind === "refinery").length;
  const towers = builder.buildings.filter(
    (b) => b.team === 1 && (b.kind === "tower" || b.kind === "aa" || b.kind === "helipad"),
  ).length;
  const arty = builder.units.some((u) => u.team === 1 && (u.kind === "artillery" || u.kind === "attackheli" || u.kind === "bomber"));
  const queued = builder.buildings.some((b) => b.team === 1 && b.queue.some((q) => q === "artillery" || q === "attackheli"));
  assert.ok(refs >= 2 || towers >= 1 || arty || queued, `builder stalled refs ${refs} towers ${towers}`);
  const pushHome = builder.starts.player;
  const early = builder.units.some(
    (u) => u.team === 1 && u.hp > 0 && u.damage > 0 && Math.hypot(u.x - pushHome.x, u.y - pushHome.y) < 16,
  );
  assert.equal(early, false, "builder pushed before minute four");
});

test("a trained rifle spawns at the exit and walks to the rally", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const yard = deployPlayer(sim);
  const placeNear = (kind: "power" | "barracks") => {
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        if (sim.tryPlace(0, kind, yard.tx + dx, yard.ty + dy).ok) return true;
      }
    }
    return false;
  };
  assert.equal(placeNear("power"), true, "power pad");
  for (let i = 0; i < 80; i++) sim.tick(0.1);
  assert.equal(placeNear("barracks"), true, "barracks pad");
  for (let i = 0; i < 90; i++) sim.tick(0.1);
  const hall = sim.buildings.find((b) => b.team === 0 && b.kind === "barracks" && b.complete);
  assert.ok(hall, "barracks finished");
  hall!.rallyX = hall!.tx + hall!.w / 2;
  hall!.rallyY = hall!.ty - 3.2;
  assert.equal(sim.queueUnit(hall!.id, "rifle").ok, true);
  for (let i = 0; i < 50; i++) sim.tick(0.1);
  const rifle = sim.units.find((u) => u.team === 0 && u.kind === "rifle" && u.hp > 0);
  assert.ok(rifle, "unit ready produced a rifle");
  const inside =
    rifle!.x >= hall!.tx && rifle!.x < hall!.tx + hall!.w && rifle!.y >= hall!.ty && rifle!.y < hall!.ty + hall!.h;
  assert.equal(inside, false, "rifle spawned inside the barracks");
  assert.ok(sim.logs.some((line) => line.includes("ready")), "announced when the unit exists");
  assert.ok(rifle!.order.t === "move" || rifle!.order.t === "idle");
});

test("a rifle standing on the door does not swallow the next trainee", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const yard = deployPlayer(sim);
  const placeNear = (kind: "power" | "barracks") => {
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        if (sim.tryPlace(0, kind, yard.tx + dx, yard.ty + dy).ok) return true;
      }
    }
    return false;
  };
  assert.equal(placeNear("power"), true);
  for (let i = 0; i < 80; i++) sim.tick(0.1);
  assert.equal(placeNear("barracks"), true);
  for (let i = 0; i < 90; i++) sim.tick(0.1);
  const hall = sim.buildings.find((b) => b.team === 0 && b.kind === "barracks" && b.complete);
  assert.ok(hall);
  const door = sim.doorOf(hall!);
  const parked = sim.spawnUnit(0, "rifle", door.x, door.y);
  assert.ok(parked);
  parked!.x = door.x;
  parked!.y = door.y;
  sim.credits[0] = 5000;
  assert.equal(sim.queueUnit(hall!.id, "rifle").ok, true);
  for (let i = 0; i < 60; i++) sim.tick(0.1);
  const rifles = sim.units.filter((u) => u.team === 0 && u.kind === "rifle" && u.hp > 0);
  assert.ok(rifles.length >= 2, `expected a second rifle, saw ${rifles.length}`);
  const pad = hall!;
  for (const r of rifles) {
    const buried: boolean =
      r.x >= pad.tx && r.x < pad.tx + pad.w && r.y >= pad.ty && r.y < pad.ty + pad.h;
    assert.equal(buried, false, `rifle buried at ${r.x},${r.y}`);
  }
});

test("low power halves training and shuts the tower", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const hall = stubBuilding(sim, { kind: "barracks", team: 0, tx: 8, ty: 8 });
  sim.credits[0] = 5000;
  assert.equal(sim.powerOf(0).low, true);
  assert.equal(sim.queueUnit(hall.id, "rifle").ok, true);
  for (let i = 0; i < 10; i++) sim.tick(0.1);
  assert.ok(hall.prod > 0.4 && hall.prod < 0.7, `prod ${hall.prod} should be about half a second`);
  const tower = stubBuilding(sim, { kind: "tower", team: 0, tx: 12, ty: 8, complete: true });
  const foe = sim.spawnUnit(1, "rifle", 14, 9);
  assert.ok(foe);
  const hp = foe!.hp;
  for (let i = 0; i < 20; i++) sim.tick(0.1);
  assert.equal(foe!.hp, hp, "tower fired while brown");
  assert.equal(tower.cooldown, 0);
});

test("focus fire keeps the attack order and a shell is in the air", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const a = sim.spawnUnit(0, "tank", 10, 10);
  const b = sim.spawnUnit(0, "tank", 11, 10);
  const foe = sim.spawnUnit(1, "tank", 16, 10);
  assert.ok(a && b && foe);
  sim.issueAttack([a!.id, b!.id], foe!.id);
  for (let i = 0; i < 30; i++) sim.tick(0.1);
  assert.equal(a!.order.t, "attack");
  assert.equal(b!.order.t, "attack");
  if (a!.order.t === "attack") assert.equal(a!.order.id, foe!.id);
  assert.ok(sim.shots.length > 0 || foe!.hp < foe!.maxHp, "no shell and no damage");
});

test("attack-move stops for a foe instead of walking past", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const rifle = sim.spawnUnit(0, "rifle", 8, 12);
  const foe = sim.spawnUnit(1, "rifle", 14, 12);
  assert.ok(rifle && foe);
  sim.issueMove([rifle!.id], 28, 12, true);
  for (let i = 0; i < 80; i++) sim.tick(0.1);
  assert.ok(foe!.hp < foe!.maxHp, "attack-move never fired");
  assert.ok(rifle!.x < 20, `rifle walked past to ${rifle!.x}`);
});

test("return order hauls a partial load home", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const yard = deployPlayer(sim);
  let placed = false;
  for (let dy = -6; dy <= 6 && !placed; dy++) {
    for (let dx = -8; dx <= 8 && !placed; dx++) {
      if (sim.tryPlace(0, "power", yard.tx + dx, yard.ty + dy).ok) placed = true;
    }
  }
  for (let i = 0; i < 80; i++) sim.tick(0.1);
  placed = false;
  for (let dy = -8; dy <= 8 && !placed; dy++) {
    for (let dx = -8; dx <= 8 && !placed; dx++) {
      if (sim.tryPlace(0, "refinery", yard.tx + dx, yard.ty + dy).ok) placed = true;
    }
  }
  assert.equal(placed, true);
  for (let i = 0; i < 160; i++) sim.tick(0.1);
  const harvester = sim.units.find((u) => u.team === 0 && u.kind === "harvester" && u.hp > 0);
  assert.ok(harvester, "refinery harvester");
  harvester!.cargo = 120;
  harvester!.order = { t: "idle" };
  const before = sim.credits[0];
  sim.issueReturn([harvester!.id]);
  assert.equal(harvester!.order.t, "return");
  for (let i = 0; i < 200; i++) sim.tick(0.1);
  assert.ok(sim.credits[0] > before || harvester!.cargo < 120, "partial load never came home");
});

test("a shot from the fog leaves a last-known mark", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: true });
  const foe = sim.spawnUnit(1, "rifle", 20, 20);
  const mine = sim.spawnUnit(0, "rifle", 30, 20);
  assert.ok(foe && mine);
  sim.issueAttack([foe!.id], mine!.id);
  for (let i = 0; i < 40; i++) sim.tick(0.1);
  const seen = sim.ghosts.some((g) => g.viewer === 0 && g.id === foe!.id) || sim.spots.some((s) => s.team === 0);
  assert.equal(seen || mine!.hp < mine!.maxHp, true);
});

function occupy(sim: Sim, b: Building) {
  for (let y = b.ty; y < b.ty + b.h; y++) {
    for (let x = b.tx; x < b.tx + b.w; x++) sim.occ[y * sim.gw + x] = b.id;
  }
}

test("a harvester dumps its whole bay at the refinery", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false });
  const ref = stubBuilding(sim, { kind: "refinery", team: 0, tx: 20, ty: 20 });
  const harvester = sim.spawnUnit(0, "harvester", 21, 18);
  assert.ok(harvester);
  const dock = sim.doorOf(ref);
  harvester.x = dock.x;
  harvester.y = dock.y;
  harvester.cargo = harvester.cargoMax;
  harvester.order = { t: "return" };
  const before = sim.credits[0];
  sim.tick(0.1);
  assert.equal(harvester.cargo, 0, "bay still held ore");
  assert.ok(sim.credits[0] >= before + harvester.cargoMax - 0.01, `credits ${sim.credits[0]} from ${before}`);
});

test("a shell aimed at a plant flies over the wall in front", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false });
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 16, ty: 12 });
  occupy(sim, plant);
  const wall = stubBuilding(sim, { kind: "wall", team: 1, tx: 14, ty: 12 });
  occupy(sim, wall);
  const tank = sim.spawnUnit(0, "tank", 11.5, 12.5);
  assert.ok(tank);
  sim.issueAttack([tank.id], plant.id);
  const wallHp = wall.hp;
  for (let i = 0; i < 30; i++) sim.tick(0.1);
  assert.ok(plant.hp < plant.maxHp, "plant was never hit");
  assert.equal(wall.hp, wallHp, "the shot stopped on the wall");
  assert.equal(tank.order.t, "attack");
});

test("attack-move ignores a wall it can walk past", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false });
  const wall = stubBuilding(sim, { kind: "wall", team: 1, tx: 12, ty: 14 });
  occupy(sim, wall);
  const rifle = sim.spawnUnit(1, "rifle", 18.5, 12.5);
  const tank = sim.spawnUnit(0, "tank", 8.5, 12.5);
  assert.ok(rifle && tank);
  sim.issueMove([tank.id], 22, 12.5, true);
  const wallHp = wall.hp;
  for (let i = 0; i < 50; i++) sim.tick(0.1);
  assert.ok(rifle.hp < rifle.maxHp, "attack-move never fired on the rifle");
  assert.equal(wall.hp, wallHp, "attack-move chewed a wall it could walk past");
});

test("a sealed plant is reached by breaking the wall, not by standing there", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false });
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 26, ty: 23 });
  occupy(sim, plant);
  const walls: Building[] = [];
  for (let y = 22; y <= 25; y++) {
    for (let x = 25; x <= 28; x++) {
      const inside = x >= 26 && x <= 27 && y >= 23 && y <= 24;
      if (inside) continue;
      const wall = stubBuilding(sim, { kind: "wall", team: 1, tx: x, ty: y });
      occupy(sim, wall);
      walls.push(wall);
    }
  }
  const tank = sim.spawnUnit(0, "tank", 18.5, 23.5);
  assert.ok(tank);
  sim.issueAttack([tank.id], plant.id);
  for (let i = 0; i < 60; i++) sim.tick(0.1);
  const hurt = walls.some((w) => w.hp < w.maxHp);
  assert.equal(hurt, true, "sealed camp was never breached");
  assert.equal(tank.order.t, "attack");
  if (tank.order.t === "attack") assert.equal(tank.order.id, plant.id);
});

test("a tap on the wall in front of a plant orders the plant", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false });
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 12, ty: 12 });
  const wall = stubBuilding(sim, { kind: "wall", team: 1, tx: 12, ty: 14 });
  const lone = stubBuilding(sim, { kind: "wall", team: 1, tx: 40, ty: 40 });
  assert.equal(sim.strikeTarget(0, wall.id, 12.5, 14.5), plant.id);
  assert.equal(sim.strikeTarget(0, lone.id, 40.5, 40.5), lone.id);
  assert.equal(sim.strikeTarget(0, plant.id, 13, 13), plant.id);
});

test("passability follows the tile: shallow, cliff, ramp, and a beached transport", () => {
  const sim = new Sim({ mapId: "dry", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  sim.terrain.fill(TILE_CLEAR);
  const rifle = sim.spawnUnit(0, "rifle", 10.5, 10.5);
  const tank = sim.spawnUnit(0, "tank", 12.5, 12.5);
  const boat = sim.spawnUnit(0, "transport", 6.5, 6.5);
  assert.ok(rifle && tank && boat);
  sim.terrain[10 * sim.gw + 14] = TILE_SHALLOW;
  sim.terrain[10 * sim.gw + 16] = TILE_DEEP;
  sim.terrain[12 * sim.gw + 16] = TILE_CLIFF;
  sim.terrain[12 * sim.gw + 18] = TILE_RAMP;
  sim.terrain[8 * sim.gw + 8] = TILE_SHORE;
  assert.equal(sim.passable(rifle, 14.2, 10.2), true);
  assert.equal(sim.passable(tank, 14.2, 10.2), false);
  assert.equal(sim.passable(rifle, 16.2, 10.2), false);
  assert.equal(sim.passable(boat, 16.2, 10.2), true);
  assert.equal(sim.passable(tank, 16.2, 12.2), false);
  assert.equal(sim.passable(tank, 18.2, 12.2), true);
  assert.equal(sim.passable(rifle, 18.2, 12.2), true);
  assert.equal(sim.passable(boat, 8.2, 8.2), true);
  assert.equal(sim.passable(boat, 10.2, 10.2), false);
});

test("a cliff blocks sight and a vehicle crushes a tree into a stump", () => {
  const sim = new Sim({ mapId: "dry", faction: "concord", mode: "destroy", fog: true, crates: false, cpu: [false, false, false, false], seed: 3 });
  sim.terrain.fill(TILE_CLEAR);
  for (let y = 0; y < sim.gh; y++) sim.terrain[y * sim.gw + 20] = TILE_CLIFF;
  const mcv = sim.units.find((u) => u.team === 0 && u.kind === "mcv");
  assert.ok(mcv);
  mcv.x = 17.5;
  mcv.y = 32.5;
  sim.tick(0.1);
  assert.equal(sim.fog[0]![32 * sim.gw + 19], 2);
  assert.equal(sim.fog[0]![32 * sim.gw + 20], 2);
  assert.notEqual(sim.fog[0]![32 * sim.gw + 22], 2);
  const tank = sim.spawnUnit(0, "tank", 8.5, 8.5);
  assert.ok(tank);
  sim.terrain[8 * sim.gw + 11] = TILE_SCRUB;
  sim.issueMove([tank.id], 14.5, 8.5, false);
  for (let i = 0; i < 80; i++) sim.tick(0.1);
  assert.equal(sim.terrain[8 * sim.gw + 11], TILE_STUMP);
});

test("an engineer repairs a wrecked span back into a bridge", () => {
  const doc = buildFeatured("bridgewar");
  const sim = new Sim({
    mapId: "dry",
    faction: "concord",
    mode: "destroy",
    fog: false,
    crates: false,
    cpu: [false, false, false, false],
    custom: pack(doc),
    seed: 4,
  });
  const span = sim.buildings.find((b) => b.kind === "span");
  assert.ok(span);
  for (let i = 0; i < sim.terrain.length; i++) if (sim.terrain[i] === TILE_BRIDGE) sim.terrain[i] = TILE_WRECK;
  span.rubble = 1;
  span.hp = 1;
  const eng = sim.spawnUnit(0, "engineer", span.tx - 2.2, span.ty + 0.5);
  assert.ok(eng);
  sim.issueAttack([eng.id], span.id);
  for (let i = 0; i < 140; i++) sim.tick(0.1);
  assert.equal(sim.terrain[span.ty * sim.gw + span.tx], TILE_BRIDGE);
  assert.equal(span.rubble, 0);
});

test("supply centers drip credits and command points cap the army", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: true, seed: 4, cpu: [false, false, false, false] });
  assert.ok(sim.crates.length >= 4, "field caches");
  const yard = deployPlayer(sim);
  assert.equal(sim.supplyPerSec(0), 0, "no drip before power");
  const place = (kind: "power" | "supply" | "barracks") => {
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        if (sim.tryPlace(0, kind, yard.tx + dx, yard.ty + dy).ok) return true;
      }
    }
    return false;
  };
  assert.equal(place("power"), true);
  for (let i = 0; i < BUILDINGS.power.time * 10 + 8; i++) sim.tick(0.1);
  assert.ok(sim.supplyPerSec(0) >= 2, "yard drip");
  const before = sim.credits[0];
  for (let i = 0; i < 20; i++) sim.tick(0.1);
  assert.ok(sim.credits[0] > before + 2, "credits rose");
  assert.equal(place("supply"), true);
  assert.equal(place("barracks"), true);
  const barracks = sim.buildings.find((b) => b.team === 0 && b.kind === "barracks");
  assert.ok(barracks);
  for (let i = 0; i < 200 && !barracks.complete; i++) sim.tick(0.1);
  assert.equal(barracks.complete, true);
  sim.credits[0] = 50000;
  for (let i = 0; i < sim.commandCap(0); i++) sim.spawnUnit(0, "rifle", yard.tx + 5, yard.ty + 6);
  assert.equal(sim.queueUnit(barracks.id, "rifle").reason, "Command points full");
  sim.useBoost(0, "works");
  assert.ok(sim.worksLeft[0]! > 0);
  sim.useBoost(0, "works");
  assert.ok(sim.worksCd[0]! > sim.worksLeft[0]!);
});

test("repair spends credits and restores a damaged building", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false });
  const yard = deployPlayer(sim);
  assert.ok(yard);
  yard.hp = Math.max(1, yard.maxHp - 40);
  const before = sim.credits[0];
  sim.issueRepair(yard.id, 0);
  assert.equal(yard.mending, true);
  sim.tick(0.5);
  assert.ok(yard.hp > yard.maxHp - 40, "hp rose");
  assert.ok(sim.credits[0] < before, "credits spent");
  sim.issueRepair(yard.id, 0);
  assert.equal(yard.mending, false);
});



