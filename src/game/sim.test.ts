import assert from "node:assert/strict";
import test from "node:test";
import { BUILDINGS, HARVEST_PER_SEC, MAP_W, TILE_BRIDGE, TILE_CLEAR, TILE_CLIFF, TILE_DEEP, TILE_HIGH, TILE_RAMP, TILE_ROAD, TILE_SAND, TILE_SCRUB, TILE_SHALLOW, TILE_SHORE, TILE_STUMP, TILE_WRECK, resolveBuilding } from "./data.ts";
import { DEPLOY_SECS, NORMAL_PUSH_AT, Sim, shortPlaceReason, type Building } from "./sim.ts";
import { hallPictureLift, screenToWorld, setViewPitch, tacticalHome, viewPitch, worldToScreen } from "./view.ts";
import { aiHeat, aiPace, aiThink } from "./ai.ts";
import { buildFeatured } from "./featured.ts";
import { pack } from "./custom.ts";
import { audit } from "./editor.ts";
import { buildTemplate } from "./templates.ts";

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
    block: 0,
    hit: 0,
    collapse: partial.collapse ?? 0,
    shown: 0,
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
  sim.time = 40;
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
  sim.time = 40;
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

test("phone pacing: easy scouts, normal harasses at four minutes, hard stays fast", () => {
  const easy = aiPace("easy");
  const mid = aiPace("normal");
  const hard = aiPace("hard");
  assert.ok(easy.scout >= 120 && easy.scout <= 200, "easy scout");
  assert.ok(easy.assault >= 480, "easy push");
  assert.ok(easy.armor >= 480, "easy tanks");
  assert.equal(aiHeat("easy", 700), "easy");
  assert.ok(mid.scout < 180 && mid.harass >= 230 && mid.harass <= 270, "normal harass");
  assert.ok(mid.assault >= 360 && mid.assault <= 430, "normal push");
  assert.equal(aiHeat("normal", 60), "easy");
  assert.equal(aiHeat("normal", 200), "normal");
  assert.equal(aiHeat("hard", 40), "easy");
  assert.equal(aiHeat("hard", 240), "normal");
  assert.equal(aiHeat("hard", 420), "hard");
  assert.ok(hard.harass >= 180 && hard.assault >= 180 && hard.assault >= hard.harass, "hard clocks");
});

test("deployment window blocks shots and hostile starts", () => {
  const sim = new Sim({
    mapId: "dry",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    ai: "passive",
    difficulty: "easy",
    fog: false,
    crates: false,
    walls: false,
    seed: 4,
  });
  const camp = sim.starts.enemy;
  const home = sim.starts.player;
  const rifle = sim.spawnUnit(0, "rifle", camp.x + 10, camp.y);
  const foe = sim.spawnUnit(1, "rifle", camp.x + 11.4, camp.y);
  assert.ok(rifle && foe);
  const hp = foe.hp;
  sim.issueAttack([rifle.id], foe.id);
  sim.issueMove([foe.id], home.x, home.y, true);
  for (let i = 0; i < 25; i++) sim.tick(0.2);
  assert.ok(sim.time < 40);
  assert.equal(foe.hp, hp, "rifle fired during deployment");
  assert.ok(Math.hypot(rifle.x - camp.x, rifle.y - camp.y) >= 7.4, `entered enemy start ${rifle.x.toFixed(1)},${rifle.y.toFixed(1)}`);
  assert.ok(Math.hypot(foe.x - home.x, foe.y - home.y) >= 7.4, `entered player start ${foe.x.toFixed(1)},${foe.y.toFixed(1)}`);
  sim.time = 40;
  rifle.x = home.x + 6;
  rifle.y = home.y;
  foe.x = home.x + 7.3;
  foe.y = home.y;
  foe.hp = foe.maxHp;
  sim.issueAttack([rifle.id], foe.id);
  for (let i = 0; i < 20; i++) sim.tick(0.2);
  assert.ok(foe.hp < hp, "combat did not resume after deployment");
});

test("a hard match called at twenty minutes is decided by score", () => {
  const hard = new Sim({
    mapId: "basin",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    difficulty: "hard",
    fog: false,
    crates: false,
    ai: "passive",
    seed: 1,
  });
  hard.time = 1199;
  hard.tick(1.2);
  assert.notEqual(hard.outcome, "playing");
  assert.match(hard.reason, /score|Twenty minutes/);

  const easy = new Sim({
    mapId: "basin",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    difficulty: "easy",
    fog: false,
    crates: false,
    ai: "passive",
    seed: 1,
  });
  easy.time = 1199;
  easy.tick(2);
  assert.equal(easy.outcome, "playing");

  const survive = new Sim({
    mapId: "basin",
    faction: "concord",
    enemy: "syndicate",
    mode: "survive",
    difficulty: "hard",
    fog: false,
    crates: false,
    ai: "passive",
    seed: 1,
  });
  survive.time = 500;
  survive.tick(0.2);
  assert.equal(survive.outcome, "playing", "survive must not use the hard clock");
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
  let earlyContact = -1;
  let earlyVehicle = -1;
  while (sim.time < 460 && sim.outcome === "playing") {
    sim.tick(0.25);
    for (const b of sim.buildings) if (b.team === 0 && b.hp > 0) b.hp = b.maxHp;
    for (const u of sim.units) if (u.team === 0 && u.hp > 0) u.hp = u.maxHp;
    if (yardAt < 0 && sim.buildings.some((b) => b.team === 1 && b.kind === "yard" && b.complete)) yardAt = sim.time;
    const foe = sim.units.filter((u) => u.team === 1 && u.hp > 0 && u.damage > 0);
    if (scoutLeft < 0 && foe.some((u) => Math.hypot(u.x - camp.x, u.y - camp.y) > 12)) scoutLeft = sim.time;
    if (earlyContact < 0 && sim.time < 230 && foe.some((u) => Math.hypot(u.x - home.x, u.y - home.y) < 8)) {
      earlyContact = sim.time;
    }
    if (earlyVehicle < 0 && sim.time < 340 && foe.some((u) => (u.kind === "tank" || u.kind === "medium") && Math.hypot(u.x - home.x, u.y - home.y) < 16)) {
      earlyVehicle = sim.time;
    }
    if (pokeAt < 0 && sim.aiPoked[1]) pokeAt = sim.time;
    if (waveAt < 0 && sim.aiPushed[1]) waveAt = sim.time;
  }
  const bld = sim.buildings.filter((b) => b.team === 1 && b.hp > 0).map((b) => b.kind);
  const detail = `yard ${yardAt.toFixed(0)} left ${scoutLeft.toFixed(0)} poke ${pokeAt.toFixed(0)} wave ${waveAt.toFixed(0)} contact ${earlyContact} tank ${earlyVehicle} intent ${sim.aiIntent[1]} bld ${bld.join(",")}`;
  assert.ok(yardAt >= 0 && yardAt <= 12, detail);
  assert.ok(bld.includes("power") && bld.includes("refinery") && bld.includes("barracks"), detail);
  assert.equal(earlyContact, -1, detail);
  assert.equal(earlyVehicle, -1, detail);
  assert.ok(scoutLeft < 0 || scoutLeft >= 120, detail);
  assert.ok(pokeAt >= 230 && pokeAt <= 280, detail);
  assert.ok(waveAt >= 380 && waveAt <= 460, detail);
});

test("easy raider does not touch the base before the late push", () => {
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
  while (sim.time < 200 && sim.outcome === "playing") {
    sim.tick(0.25);
    const near = sim.units.filter(
      (u) => u.team === 1 && u.hp > 0 && u.damage > 0 && Math.hypot(u.x - home.x, u.y - home.y) < 7.5,
    );
    if (contact < 0 && near.length) contact = sim.time;
    guns = Math.max(
      guns,
      sim.units.filter((u) => u.team === 1 && u.hp > 0 && (u.kind === "tank" || u.kind === "medium")).length,
    );
  }
  assert.equal(contact, -1, `easy contact at ${contact}`);
  assert.equal(guns, 0, "easy built a tank before the push");
  assert.equal(sim.aiPushed[1], false);
  assert.notEqual(sim.aiIntent[1], "attack");
});

test("easy push stays a small army against a smaller force", () => {
  const sim = new Sim({
    mapId: "dry",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    ai: "raider",
    difficulty: "easy",
    fog: false,
    crates: false,
    walls: false,
    seed: 2,
  });
  while (sim.time < 16 && !sim.buildings.some((b) => b.team === 1 && b.kind === "yard" && b.complete)) sim.tick(0.25);
  const home = sim.starts.enemy;
  const player = sim.starts.player;
  for (let i = 0; i < 2; i++) sim.spawnUnit(0, "rifle", player.x + 4 + i, player.y);
  for (let i = 0; i < 12; i++) sim.spawnUnit(1, "rifle", home.x + (i % 4) * 0.8, home.y + 3 + Math.floor(i / 4));
  sim.time = 500;
  sim.credits[1] = 0;
  sim.aiScouted[1] = true;
  aiThink(sim, 1);
  const marching = sim.units.filter(
    (u) => u.team === 1 && u.kind === "rifle" && u.hp > 0 && (u.order.t === "attack" || (u.order.t === "move" && u.order.attackMove)),
  );
  assert.equal(marching.length, 3, `sent ${marching.length}`);

  const rich = new Sim({
    mapId: "dry",
    faction: "concord",
    enemy: "syndicate",
    mode: "destroy",
    credits: 5000,
    ai: "raider",
    difficulty: "easy",
    fog: false,
    crates: false,
    walls: false,
    seed: 3,
  });
  while (rich.time < 16 && !rich.buildings.some((b) => b.team === 1 && b.kind === "yard" && b.complete)) rich.tick(0.25);
  const camp = rich.starts.enemy;
  const base = rich.starts.player;
  for (let i = 0; i < 8; i++) rich.spawnUnit(0, "rifle", base.x + 3 + (i % 4), base.y + Math.floor(i / 4));
  for (let i = 0; i < 12; i++) rich.spawnUnit(1, "rifle", camp.x + (i % 4) * 0.8, camp.y + 3 + Math.floor(i / 4));
  rich.time = 520;
  rich.credits[1] = 0;
  rich.aiScouted[1] = true;
  aiThink(rich, 1);
  const wave = rich.units.filter(
    (u) => u.team === 1 && u.kind === "rifle" && u.hp > 0 && (u.order.t === "attack" || (u.order.t === "move" && u.order.attackMove)),
  );
  assert.ok(wave.length >= 4 && wave.length <= 6, `big push sent ${wave.length}`);
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
  const plant = stubBuilding(sim, { kind: "power", team: 0, tx: 4, ty: 8 });
  plant.powerOut = 0;
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
  sim.time = 40;
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
  sim.cpu[1] = false;
  sim.time = 40;
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
  sim.time = 40;
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
  sim.time = 40;
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
  sim.time = 40;
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
  sim.time = 40;
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
  assert.ok(hurt || plant.hp < plant.maxHp, "sealed camp was never reached");
  assert.equal(tank.order.t, "attack");
  if (tank.order.t === "attack") assert.equal(tank.order.id, plant.id);
});

test("a building tap is 44 px and an engineer captures it", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, credits: 20000, cpu: [false, false, false, false] });
  sim.time = 40;
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 20, ty: 16 });
  occupy(sim, plant);
  const zoom = 48;
  const pad = 44 / zoom;
  const hit = sim.pickBuilding(plant.tx - pad + 0.05, plant.ty + 0.2, zoom, 0);
  assert.equal(hit?.id, plant.id);
  const rifle = sim.spawnUnit(0, "rifle", 12.5, 16.5);
  assert.ok(rifle);
  sim.issueAttack([rifle.id], plant.id);
  assert.equal(rifle.order.t, "attack");
  if (rifle.order.t === "attack") assert.equal(rifle.order.id, plant.id);
  for (let i = 0; i < 80; i++) sim.tick(0.1);
  assert.ok(plant.hp < plant.maxHp, "rifle never damaged the plant");
  assert.equal(rifle.order.t, "attack");
  const eng = sim.spawnUnit(0, "engineer", plant.tx - 0.2, plant.ty + 0.5);
  assert.ok(eng);
  sim.issueAttack([eng.id], plant.id);
  assert.equal(eng.order.t, "capture");
  for (let i = 0; i < 80 && plant.team !== 0; i++) sim.tick(0.1);
  assert.equal(plant.team, 0);
  assert.ok(sim.logs.some((line) => line === "Building captured"));
});

test("a tap on the roof of a power plant still picks the building", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 20, ty: 16 });
  const zoom = 46;
  const roof = plant.ty + plant.h - hallPictureLift("power", plant.w, plant.h) + 0.2;
  const hit = sim.pickBuilding(plant.tx + plant.w / 2, roof, zoom, 0);
  assert.equal(hit?.id, plant.id);
  const padY = 44 / zoom / viewPitch();
  const above = roof - padY - 0.35;
  assert.equal(sim.pickBuilding(plant.tx + plant.w / 2, above, zoom, 0), null);
});

test("an attack order survives deployment and then damages the building", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  sim.time = 4;
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 30, ty: 30 });
  occupy(sim, plant);
  const rifle = sim.spawnUnit(0, "rifle", 24.5, 31);
  assert.ok(rifle);
  sim.issueAttack([rifle.id], plant.id);
  for (let i = 0; i < 15; i++) sim.tick(0.2);
  assert.ok(sim.time < 40);
  assert.equal(rifle.order.t, "attack");
  if (rifle.order.t === "attack") assert.equal(rifle.order.id, plant.id);
  assert.equal(plant.hp, plant.maxHp, "rifle fired during deployment");
  sim.time = 40;
  for (let i = 0; i < 80; i++) sim.tick(0.2);
  assert.ok(plant.hp < plant.maxHp, "rifle never damaged the plant after deployment");
  assert.equal(rifle.order.t, "attack");
});

test("practice starts rich, quiet, and next to an undefended base", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: true, crates: false, difficulty: "normal" });
  sim.startPractice();
  assert.equal(sim.practice, true);
  assert.equal(sim.credits[0], 20000);
  assert.ok(sim.time >= 40, "practice still waiting on deployment");
  assert.equal(sim.units.some((u) => u.team !== 0 && u.hp > 0), false);
  const foe = sim.buildings.filter((b) => b.team === 1 && b.hp > 0 && b.kind !== "span");
  assert.ok(foe.length >= 3 && foe.length <= 4, `practice base size ${foe.length}`);
  assert.equal(foe.some((b) => b.kind === "tower" || b.kind === "aa"), false);
  const home = sim.starts.player;
  assert.ok(foe.every((b) => Math.hypot(b.tx - home.x, b.ty - home.y) < 24));
  for (let i = 0; i < 30; i++) sim.tick(0.5);
  assert.equal(sim.units.some((u) => u.team === 1 && u.hp > 0 && u.damage > 0), false);
  assert.equal(sim.buildings.some((b) => b.team === 1 && (b.kind === "tower" || b.kind === "aa") && b.hp > 0), false);
});

test("a finger under a pitched hall still picks it on basin and coast", () => {
  for (const mapId of ["basin", "coast"] as const) {
    setViewPitch(0.68);
    const sim = new Sim({ mapId, faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
    sim.time = 50;
    const foe = sim.units.find((u) => u.team === 1 && u.kind === "mcv");
    assert.ok(foe);
    sim.issueDeploy([foe.id]);
    for (let i = 0; i < 30; i++) sim.tick(0.1);
    const yard = sim.buildings.find((b) => b.team === 1 && b.kind === "yard" && b.hp > 0);
    assert.ok(yard);
    const view = { w: 915, h: 412 };
    const zoom = tacticalHome(view);
    const cam = { x: yard.tx + yard.w / 2, y: yard.ty + yard.h / 2, zoom };
    const foot = worldToScreen(cam, yard.tx + yard.w / 2, yard.ty + yard.h - 0.02, view);
    const under = screenToWorld(cam, foot.x, foot.y + 40, view);
    assert.equal(sim.pickBuilding(under.x, under.y, zoom, 0)?.id, yard.id);
    const ids: number[] = [];
    for (let n = 0; n < 12; n++) {
      const u = sim.spawnUnit(0, "rifle", yard.tx - 8 + (n % 4), yard.ty + yard.h + 2 + ((n / 4) | 0));
      assert.ok(u);
      ids.push(u.id);
    }
    sim.issueAttack(ids, yard.id);
    assert.equal(sim.pings.some((p) => p.kind === "attack"), true);
    const before = yard.hp;
    for (let i = 0; i < 80; i++) sim.tick(0.2);
    assert.ok(yard.hp < before, `${mapId} rifles never damaged the yard`);
    assert.equal(ids.every((id) => sim.unitById(id)?.order.t === "attack"), true);
  }
  setViewPitch(0.68);
});

test("a destroyed hall leaves a rubble footprint", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  sim.time = 50;
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 20, ty: 16 });
  occupy(sim, plant);
  plant.hp = 8;
  const rifle = sim.spawnUnit(0, "rifle", plant.tx - 1.4, plant.ty + 0.6);
  assert.ok(rifle);
  sim.issueAttack([rifle.id], plant.id);
  for (let i = 0; i < 40 && plant.collapse <= 0; i++) sim.tick(0.1);
  assert.ok(plant.collapse > 0, "hall never started to collapse");
  for (let i = 0; i < 20; i++) sim.tick(0.1);
  const still = sim.buildings.find((b) => b.id === plant.id);
  assert.ok(still, "rubble footprint was deleted");
  assert.equal(still.hp, 0);
  assert.ok(still.rubble > 100);
});

test("a burning hall trains slower, and its rubble blocks then opens", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  sim.time = 50;
  const hall = stubBuilding(sim, { kind: "barracks", team: 0, tx: 12, ty: 12 });
  occupy(sim, hall);
  hall.queue = ["rifle"];
  hall.hp = hall.maxHp * 0.2;
  sim.tick(0.4);
  const burned = hall.prod;
  hall.hp = hall.maxHp;
  sim.tick(0.4);
  const healthy = hall.prod - burned;
  assert.ok(burned > 0 && healthy > burned * 1.4, `burned ${burned} healthy ${healthy}`);
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 24, ty: 16 });
  occupy(sim, plant);
  plant.hp = 8;
  const rifle = sim.spawnUnit(0, "rifle", plant.tx - 1.4, plant.ty + 0.6);
  assert.ok(rifle);
  sim.issueAttack([rifle.id], plant.id);
  for (let i = 0; i < 80 && plant.collapse <= 0; i++) sim.tick(0.1);
  assert.ok(plant.collapse > 0);
  for (let i = 0; i < 20; i++) sim.tick(0.1);
  assert.equal(plant.hp, 0);
  assert.ok(plant.block > 0);
  const walker = sim.spawnUnit(0, "tank", 8.5, 8.5);
  assert.ok(walker);
  assert.equal(sim.passable(walker, plant.tx + 0.5, plant.ty + 0.5), false);
  for (let i = 0; i < 70; i++) sim.tick(0.1);
  assert.equal(plant.block, 0);
  assert.equal(sim.passable(walker, plant.tx + 0.5, plant.ty + 0.5), true);
  assert.ok(plant.rubble > 100);
});

test("an engineer walks in and captures a coast plant", () => {
  const sim = new Sim({ mapId: "coast", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  sim.time = 50;
  const plant = stubBuilding(sim, { kind: "power", team: 1, tx: 24, ty: 18 });
  occupy(sim, plant);
  const eng = sim.spawnUnit(0, "engineer", plant.tx - 6, plant.ty + 1);
  assert.ok(eng);
  sim.issueAttack([eng.id], plant.id);
  assert.equal(eng.order.t, "capture");
  for (let i = 0; i < 200 && plant.team !== 0; i++) sim.tick(0.1);
  assert.equal(plant.team, 0);
  assert.ok(sim.logs.some((line) => line === "Building captured"));
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
  assert.equal(sim.crates.length, 0, "crates wait for deployment");
  for (let i = 0; i < 410; i++) sim.tick(0.1);
  assert.ok(sim.crates.length >= 3 && sim.crates.length <= 5, `opening crates ${sim.crates.length}`);
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

test("lanes, plateaus, and forest cover stay readable without moving the crystal", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false], seed: 1 });
  let roads = 0;
  let high = 0;
  let ramp = 0;
  let crystal = 0;
  let scrub = 0;
  for (let i = 0; i < sim.terrain.length; i++) {
    const t = sim.terrain[i];
    if (t === TILE_ROAD) roads++;
    if (t === TILE_HIGH) high++;
    if (t === TILE_RAMP) ramp++;
    if (t === TILE_SCRUB) scrub++;
    crystal += sim.crystal[i] ?? 0;
  }
  assert.ok(roads > 8, `dirt lanes ${roads}`);
  assert.ok(high > 4, `high ground ${high}`);
  assert.ok(ramp >= 2, `ramps ${ramp}`);
  assert.ok(scrub > 8, `forests ${scrub}`);
  assert.ok(crystal > 1000, "crystal fields stay");
  const home = sim.starts.player;
  let sand = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const t = sim.terrain[(Math.floor(home.y) + dy) * sim.gw + Math.floor(home.x) + dx];
      if (t === TILE_CLEAR || t === TILE_SAND || t === TILE_ROAD) sand++;
    }
  }
  assert.ok(sand > 20, "camp pad stays buildable");
});

test("shallow water slows infantry and woods hide them until a ground unit is adjacent", () => {
  const sim = new Sim({ mapId: "dry", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false], seed: 2 });
  sim.terrain.fill(TILE_CLEAR);
  const slow = sim.spawnUnit(0, "rifle", 5.5, 5.5);
  const open = sim.spawnUnit(0, "rifle", 5.5, 8.5);
  assert.ok(slow && open);
  for (let x = 6; x < 20; x++) sim.terrain[5 * sim.gw + x] = TILE_SHALLOW;
  sim.issueMove([slow.id], 18.5, 5.5, false);
  sim.issueMove([open.id], 18.5, 8.5, false);
  for (let i = 0; i < 30; i++) sim.tick(0.1);
  assert.ok(open.x > slow.x + 0.4, `open ${open.x} vs shallow ${slow.x}`);
  const hid = sim.spawnUnit(1, "rifle", 30.5, 30.5);
  assert.ok(hid);
  sim.terrain[30 * sim.gw + 30] = TILE_SCRUB;
  assert.equal(sim.passable(hid, 30.5, 30.5), true);
  const spotter = sim.spawnUnit(0, "tank", 34.5, 30.5);
  assert.ok(spotter);
  assert.equal(sim.visibleUnit(0, hid), false);
  spotter.x = 31.7;
  spotter.y = 30.5;
  assert.equal(sim.visibleUnit(0, hid), true);
});

test("a squad keeps the slowest pace, hold does not chase, and artillery will not fire inside minimum range", () => {
  const sim = new Sim({ mapId: "dry", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false], seed: 4 });
  sim.terrain.fill(TILE_CLEAR);
  const fast = sim.spawnUnit(0, "scout", 8.5, 8.5);
  const slow = sim.spawnUnit(0, "artillery", 8.5, 10.5);
  assert.ok(fast && slow);
  sim.issueMove([fast.id, slow.id], 22.5, 9.5, false);
  assert.equal(fast.pace, slow.speed);
  assert.equal(slow.pace, slow.speed);
  const a = fast.order;
  const b = slow.order;
  assert.equal(a.t, "move");
  assert.equal(b.t, "move");
  if (a.t === "move" && b.t === "move") {
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.7, "squad stacked on one point");
  }

  const rifle = sim.spawnUnit(0, "rifle", 40.5, 40.5);
  const far = sim.spawnUnit(1, "rifle", 46.5, 40.5);
  assert.ok(rifle && far);
  sim.issueGuard([rifle.id]);
  const held = rifle.hp;
  for (let i = 0; i < 20; i++) sim.tick(0.1);
  assert.ok(Math.abs(rifle.x - 40.5) < 0.35, `hold walked to ${rifle.x}`);
  assert.equal(far.hp, far.maxHp);
  assert.equal(rifle.hp, held);

  const arty = sim.spawnUnit(0, "artillery", 30.5, 30.5);
  const bug = sim.spawnUnit(1, "scout", 31.4, 30.5);
  assert.ok(arty && bug);
  const hp = bug.hp;
  sim.time = 40;
  sim.issueAttack([arty.id], bug.id);
  for (let i = 0; i < 10; i++) sim.tick(0.1);
  assert.equal(bug.hp, hp, "artillery fired inside its minimum range");
  assert.ok(Math.hypot(arty.x - bug.x, arty.y - bug.y) > 1.4, "artillery did not back away");
});

test("four isles keeps height, roads, bridges, and a capturable outpost", () => {
  const doc = buildTemplate("fourisles");
  assert.deepEqual(audit(doc), []);
  let cliff = 0;
  let ramp = 0;
  let road = 0;
  let bridge = 0;
  let high = 0;
  for (const t of doc.terrain) {
    if (t === TILE_CLIFF) cliff++;
    if (t === TILE_RAMP) ramp++;
    if (t === TILE_ROAD) road++;
    if (t === TILE_BRIDGE) bridge++;
    if (t === TILE_HIGH) high++;
  }
  assert.ok(cliff > 8, `cliffs ${cliff}`);
  assert.ok(ramp > 2, `ramps ${ramp}`);
  assert.ok(road > 12, `roads ${road}`);
  assert.ok(bridge >= 4, `bridges ${bridge}`);
  assert.ok(high > 4, `high ${high}`);
  const sim = new Sim({
    mapId: "coast",
    faction: "concord",
    mode: "destroy",
    fog: false,
    crates: true,
    cpu: [false, false, false, false],
    opponents: 3,
    custom: pack(doc),
    seed: 2,
  });
  assert.ok(sim.fieldProps.length >= 4, "props");
  assert.ok(sim.buildings.some((b) => b.neutral && b.kind !== "span" && b.kind !== "dock"), "outpost");
  assert.equal(sim.crates.length, 0);
  sim.time = 40;
  sim.tick(0.1);
  assert.ok(sim.crates.length >= 3 && sim.crates.length <= 5, `crates ${sim.crates.length}`);
});

test("a rifle on high ground reaches past its flat range", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false], seed: 1 });
  sim.time = 50;
  const rifle = sim.spawnUnit(0, "rifle", 30.5, 30.5);
  assert.ok(rifle);
  const tx = 30;
  const ty = 30;
  sim.terrain[ty * sim.gw + tx] = TILE_HIGH;
  const foe = sim.spawnUnit(1, "rifle", 30.5 + rifle.range + 0.28, 30.5);
  assert.ok(foe);
  const hp = foe.hp;
  sim.issueAttack([rifle.id], foe.id);
  sim.tick(0.1);
  assert.ok(foe.hp < hp, "high ground shot");
  assert.ok(Math.abs(rifle.x - 30.5) < 0.05, "did not need to close");
});

test("friendly infantry spread instead of stacking into one blob", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false], seed: 1 });
  sim.time = 50;
  for (let i = 0; i < 5; i++) sim.spawnUnit(0, "rifle", 20.5, 20.5);
  for (let i = 0; i < 40; i++) sim.tick(0.1);
  const rifles = sim.units.filter((u) => u.team === 0 && u.kind === "rifle" && u.hp > 0);
  assert.equal(rifles.length, 5);
  let close = 0;
  for (let i = 0; i < rifles.length; i++) {
    for (let j = i + 1; j < rifles.length; j++) {
      if (Math.hypot(rifles[i]!.x - rifles[j]!.x, rifles[i]!.y - rifles[j]!.y) < 0.55) close++;
    }
  }
  assert.equal(close, 0, "rifles still overlapping");
});

test("an infantry tap target stays at least 44 px on a phone", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false], seed: 1 });
  const zoom = 915 / 17;
  const rifle = sim.spawnUnit(0, "rifle", 12.5, 12.5);
  assert.ok(rifle);
  const hit = sim.pickAt(rifle.x + 20 / zoom, rifle.y, zoom, 0);
  assert.equal(hit?.id, rifle.id);
  const miss = sim.pickAt(rifle.x + 30 / zoom, rifle.y, zoom, 0);
  assert.equal(miss, null);
});

test("World Plates and River Split cross by bridge, with roads and high ground", () => {
  for (const mapId of ["plates", "river"] as const) {
    const sim = new Sim({ mapId, faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false], seed: 1 });
    let bridge = 0;
    let road = 0;
    let high = 0;
    let ramp = 0;
    let cliff = 0;
    let roadTouch = 0;
    for (let y = 0; y < sim.gh; y++) {
      for (let x = 0; x < sim.gw; x++) {
        const t = sim.terrain[y * sim.gw + x];
        if (t === TILE_BRIDGE) bridge++;
        if (t === TILE_ROAD) road++;
        if (t === TILE_HIGH) high++;
        if (t === TILE_RAMP) ramp++;
        if (t === TILE_CLIFF) cliff++;
        if (t !== TILE_BRIDGE) continue;
        const nearRoad =
          sim.terrain[y * sim.gw + x - 1] === TILE_ROAD ||
          sim.terrain[y * sim.gw + x + 1] === TILE_ROAD ||
          sim.terrain[(y - 1) * sim.gw + x] === TILE_ROAD ||
          sim.terrain[(y + 1) * sim.gw + x] === TILE_ROAD;
        if (nearRoad) roadTouch++;
      }
    }
    assert.ok(bridge > 8, `${mapId} bridges ${bridge}`);
    assert.ok(road > 8, `${mapId} roads ${road}`);
    assert.ok(high > 4, `${mapId} high ${high}`);
    assert.ok(cliff > 4, `${mapId} cliffs ${cliff}`);
    assert.ok(ramp >= 2, `${mapId} ramps ${ramp}`);
    assert.ok(roadTouch > 0, `${mapId} road never meets a bridge`);
    assert.ok(sim.craters.some((c) => c > 0), `${mapId} scars`);
    sim.time = 40;
    const home = sim.starts.player;
    const far = sim.starts.enemy;
    const tank = sim.spawnUnit(0, "tank", home.x, home.y);
    assert.ok(tank, mapId);
    sim.issueMove([tank.id], far.x, far.y, true);
    assert.ok(tank.path.length >= 2, `${mapId} no path`);
    const pts = [{ x: tank.x | 0, y: tank.y | 0 }, ...tank.path];
    let crossed = false;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      let x = a.x;
      let y = a.y;
      const dx = Math.abs(b.x - a.x);
      const sx = a.x < b.x ? 1 : -1;
      const dy = -Math.abs(b.y - a.y);
      const sy = a.y < b.y ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < sim.gw + sim.gh; guard++) {
        const t = sim.terrain[y * sim.gw + x];
        assert.notEqual(t, TILE_DEEP, `${mapId} stepped in deep water`);
        assert.notEqual(t, TILE_SHALLOW, `${mapId} stepped in shallow water`);
        if (t === TILE_BRIDGE) crossed = true;
        if (x === b.x && y === b.y) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
    }
    assert.equal(crossed, true, `${mapId} path missed the bridge`);
  }
});

test("dropping one span wrecks its deck and moving units leave that route", () => {
  const sim = new Sim({
    mapId: "plates",
    faction: "concord",
    mode: "destroy",
    fog: false,
    crates: false,
    cpu: [false, false, false, false],
    seed: 1,
    opponents: 1,
  });
  sim.time = DEPLOY_SECS;
  const home = sim.starts.player;
  const far = sim.starts.enemy;
  const tank = sim.spawnUnit(0, "tank", home.x, home.y);
  assert.ok(tank);
  sim.issueMove([tank.id], far.x, far.y, false);
  assert.ok(tank.path.length >= 2, "path");
  const onBridge = tank.path.filter((p) => sim.terrain[p.y * sim.gw + p.x] === TILE_BRIDGE);
  assert.ok(onBridge.length > 0, "route uses a bridge");
  const spans = sim.buildings.filter((b) => b.kind === "span" && b.hp > 0 && b.rubble <= 0);
  assert.ok(spans.length >= 2, "two spans");
  let span = spans[0]!;
  let best = Infinity;
  for (const s of spans) {
    for (const p of onBridge) {
      const d = Math.hypot(p.x + 0.5 - (s.tx + s.w / 2), p.y + 0.5 - (s.ty + s.h / 2));
      if (d < best) {
        best = d;
        span = s;
      }
    }
  }
  const other = spans.find((s) => s.id !== span.id);
  assert.ok(other);
  const otherTile = other.ty * sim.gw + other.tx;
  assert.equal(sim.terrain[otherTile], TILE_BRIDGE);
  let gx = span.tx;
  let gy = span.ty + 2;
  let found = false;
  for (let r = 1; r < 8 && !found; r++) {
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = span.tx + dx;
        const y = span.ty + dy;
        if (x < 1 || y < 1 || x >= sim.gw - 1 || y >= sim.gh - 1) continue;
        const t = sim.terrain[y * sim.gw + x];
        if (t !== TILE_ROAD && t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_HIGH && t !== TILE_RAMP) continue;
        gx = x;
        gy = y;
        found = true;
        break;
      }
    }
  }
  const gun = sim.spawnUnit(0, "tank", gx + 0.5, gy + 0.5);
  assert.ok(gun);
  span.hp = 20;
  sim.issueAttack([gun.id], span.id);
  assert.equal(gun.order.t, "attack");
  for (let i = 0; i < 40; i++) sim.tick(0.25);
  assert.equal(sim.terrain[span.ty * sim.gw + span.tx], TILE_WRECK, "span deck is down");
  assert.equal(sim.terrain[otherTile], TILE_BRIDGE, "the other span stays up");
  for (let i = 0; i < 8; i++) sim.tick(0.2);
  for (const p of tank.path) assert.notEqual(sim.terrain[p.y * sim.gw + p.x], TILE_WRECK, "path still crosses the wreck");
});

test("skirmish credits keep rising past storage, with no vault message", () => {
  const sim = new Sim({ mapId: "coast", faction: "concord", mode: "destroy", credits: 10000, fog: false, difficulty: "normal" });
  assert.equal(sim.credits[0], 10000);
  assert.ok(sim.credits[0] > sim.storageOf(0));
  const ref = stubBuilding(sim, { kind: "refinery", team: 0, tx: 8, ty: 8 });
  const door = sim.doorOf(ref);
  const harvester = sim.spawnUnit(0, "harvester", door.x, door.y);
  assert.ok(harvester);
  harvester.cargo = 700;
  harvester.order = { t: "return" };
  const before = sim.credits[0];
  sim.tick(0.1);
  assert.equal(sim.credits[0], before + 700);
  assert.equal(sim.logs.some((line) => line.includes("Vaults")), false);
  sim.credits[0] = 20000;
  for (let i = 0; i < 10; i++) sim.tick(0.1);
  assert.ok(sim.credits[0] >= 20000);
});

test("losing the yard does not end the match while buildings or units remain", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  sim.time = 50;
  for (const u of sim.units) if (u.team === 0 && u.kind === "mcv") u.hp = 0;
  const yard = stubBuilding(sim, { kind: "yard", team: 0, tx: 8, ty: 8 });
  const power = stubBuilding(sim, { kind: "power", team: 0, tx: 14, ty: 8 });
  const barracks = stubBuilding(sim, { kind: "barracks", team: 0, tx: 14, ty: 12 });
  const rifle = sim.spawnUnit(0, "rifle", 10.5, 16.5);
  assert.ok(rifle);
  yard.hp = 0;
  sim.tick(0.2);
  assert.equal(sim.outcome, "playing");
  assert.equal(sim.queueUnit(barracks.id, "rifle").ok, true);
  assert.equal(sim.tryPlace(0, "factory", 18, 8).reason, "Needs a yard");
  barracks.hp = 0;
  sim.tick(0.2);
  assert.equal(sim.outcome, "playing");
  assert.equal(sim.logs.some((line) => line.includes("Last building")), true);
  power.hp = 0;
  rifle.hp = 0;
  const wall = stubBuilding(sim, { kind: "wall", team: 0, tx: 6, ty: 6, hp: 1 });
  wall.rubble = 5;
  const span = stubBuilding(sim, { kind: "span", team: 0, tx: 4, ty: 4, hp: 1 });
  span.rubble = 1;
  sim.tick(0.2);
  assert.equal(sim.outcome, "lose");
  assert.equal(sim.reason.includes("Construction Yard"), false);
  assert.equal(sim.reason, "No buildings or units remain");
});

test("wiping the bot's buildings and units is a win", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, cpu: [false, false, false, false] });
  sim.time = 50;
  stubBuilding(sim, { kind: "yard", team: 0, tx: 8, ty: 8 });
  for (const u of sim.units) if (u.team !== 0) u.hp = 0;
  for (const b of sim.buildings) {
    if (b.team === 0 || b.neutral || b.kind === "span") continue;
    b.hp = 0;
  }
  sim.tick(0.2);
  assert.equal(sim.outcome, "win");
  assert.equal(sim.reason, "Enemy forces destroyed");
});

test("the bot keeps attacking after its construction yard falls", () => {
  const sim = new Sim({ mapId: "basin", faction: "concord", mode: "destroy", fog: false, crates: false, difficulty: "normal", cpu: [false, true, false, false] });
  sim.time = NORMAL_PUSH_AT + 5;
  sim.hadYard[1] = true;
  for (const u of sim.units) if (u.team === 1) u.hp = 0;
  const home = sim.starts.slots[1] ?? sim.starts.enemy;
  for (let i = 0; i < 6; i++) sim.spawnUnit(1, "rifle", home.x + 0.8 + (i % 3), home.y + 0.8 + ((i / 3) | 0));
  stubBuilding(sim, { kind: "power", team: 0, tx: Math.min(sim.gw - 4, Math.round(home.x) + 6), ty: Math.min(sim.gh - 4, Math.round(home.y)) });
  const before = NORMAL_PUSH_AT;
  aiThink(sim, 1);
  assert.equal(NORMAL_PUSH_AT, before);
  const pushed = sim.units.some(
    (u) => u.team === 1 && u.hp > 0 && (u.order.t === "attack" || (u.order.t === "move" && u.order.attackMove)),
  );
  assert.equal(pushed || sim.aiIntent[1] === "attack", true);
});






