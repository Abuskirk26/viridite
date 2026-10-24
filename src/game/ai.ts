/**
 * Skirmish brain. Same credits and build timers as a player — no free units,
 * and Easy or Normal never get a hidden income or build-speed bonus.
 *
 * Attack times are the in-game clock (sim.time). Speed does not move them,
 * and no personality may attack before the difficulty mark:
 * Easy scouts only before 6:00 and pushes after 8:00.
 * Normal harasses from 4:00 and pushes at 6:30.
 * Hard's first attack is 3:00.
 *
 * Bots still start easy and climb. The climb is spread across the first 8 minutes.
 * Easy never climbs. Builder techs before it walks. Passive only counterattacks.
 */

import {
  TILE_SHORE,
  resolveBuilding,
  resolveUnit,
  rosterOf,
  unitRequires,
  type AiDifficulty,
  type AiProfile,
  type BuildingId,
  type Team,
  type UnitId,
} from "./data.ts";
import {
  EASY_PUSH_AT,
  EASY_SCOUT_UNTIL,
  HARD_PUSH_AT,
  NORMAL_HARASS_AT,
  NORMAL_PUSH_AT,
  firstPushAt,
  type Building,
  type Sim,
  type Unit,
} from "./sim.ts";

interface Pace {
  /** One light unit leaves home. It does not enter the enemy base. */
  scout: number;
  /** Small poke. Infantry, plus a single buggy if one is already built. */
  harass: number;
  /** First real wave leaves the base. */
  assault: number;
  /** Tanks may join a wave at this time. Not before. */
  armor: number;
  wave: number;
  jitter: number;
  /** Builder push. Raiders do not use this. */
  push: number;
  /** Units required before a wave walks. */
  group: number;
  cap: number;
}

export function aiPace(diff: AiDifficulty): Pace {
  if (diff === "easy") {
    // Scouts only before 6:00. First real push after 8:00. No harass.
    return {
      scout: 150,
      harass: EASY_PUSH_AT + 1,
      assault: EASY_PUSH_AT,
      armor: EASY_PUSH_AT,
      wave: 150,
      jitter: 20,
      push: EASY_PUSH_AT,
      group: 4,
      cap: 6,
    };
  }
  if (diff === "hard") {
    // First attack at 3:00. A scout may look before that, without shooting its way in.
    return {
      scout: 70,
      harass: HARD_PUSH_AT,
      assault: HARD_PUSH_AT,
      armor: HARD_PUSH_AT,
      wave: 75,
      jitter: 12,
      push: HARD_PUSH_AT,
      group: 3,
      cap: 12,
    };
  }
  // Harass from 4:00. First push at 6:30. The wave after that still waits for 8:00.
  return {
    scout: 130,
    harass: NORMAL_HARASS_AT,
    assault: NORMAL_PUSH_AT,
    armor: NORMAL_PUSH_AT - 30,
    wave: 110,
    jitter: 16,
    push: NORMAL_PUSH_AT,
    group: 5,
    cap: 10,
  };
}

/**
 * What they fight like right now. The chosen skill is only the ceiling.
 * Easy stays easy. Normal and Hard climb from easy across the first 8 minutes.
 */
export function aiHeat(ceil: AiDifficulty, time: number): AiDifficulty {
  if (ceil === "easy") return "easy";
  const u = Math.max(0, Math.min(1, time / 480));
  if (ceil === "normal") return u < 0.375 ? "easy" : "normal";
  if (u < 0.34) return "easy";
  if (u < 0.84) return "normal";
  return "hard";
}

function heatOf(sim: Sim, team: Team): AiDifficulty {
  const skill = sim.difficultyOf(team);
  return aiHeat(skill, sim.time);
}

const LIGHT: ReadonlySet<UnitId> = new Set(["rifle", "rocket", "scout", "vanguard", "razor"]);

export function aiThink(sim: Sim, team: Team = 1) {
  if (sim.practice) {
    sim.aiIntent[team] = "idle";
    return;
  }
  if (sim.eliminated[team]) {
    sim.aiIntent[team] = "idle";
    return;
  }
  const mcv = sim.units.find((u) => u.team === team && u.kind === "mcv" && u.hp > 0);
  const yard = sim.buildings.find((b) => b.team === team && b.kind === "yard" && b.hp > 0);
  if (!yard && mcv && mcv.order.t !== "deploy") {
    sim.issueDeploy([mcv.id]);
    sim.aiIntent[team] = "expand";
    return;
  }
  // A yard that is still going up holds the opening. A yard that already fell does not.
  const yardLost = !yard && sim.hadYard[team] && !mcv;
  if (!yard?.complete && !yardLost) {
    sim.aiIntent[team] = "expand";
    return;
  }

  for (const u of sim.units) {
    if (u.team === team && u.kind === "harvester" && u.hp > 0 && u.order.t === "idle") {
      sim.issueHarvest([u.id]);
    }
  }

  const stance = sim.stanceOf(team);
  const pace = aiPace(sim.difficultyOf(team));
  repair(sim, team, stance);
  // Train the rifle before the factory spends the last credits.
  train(sim, team, stance, pace, true);
  placeBase(sim, team, stance);
  if (stance === "builder") fortify(sim, team);
  train(sim, team, stance, pace, false);
  seekCaches(sim, team);
  fight(sim, team, stance, pace);
}

function seekCaches(sim: Sim, team: Team) {
  if (!sim.cratesOn || !sim.crates.length || sim.deploying()) return;
  const home = sim.starts.slots[team] ?? sim.starts.player;
  let best: { x: number; y: number } | null = null;
  let bestD = 14;
  for (const c of sim.crates) {
    if (c.x < 0) continue;
    const d = Math.hypot(c.x - home.x, c.y - home.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return;
  const idle = sim.units.filter(
    (u) =>
      u.team === team &&
      u.hp > 0 &&
      u.armor === "infantry" &&
      u.order.t === "idle" &&
      Math.hypot(u.x - home.x, u.y - home.y) < 18,
  );
  if (!idle.length) return;
  sim.issueMove(
    idle.slice(0, 3).map((u) => u.id),
    best.x,
    best.y,
    false,
  );
}

function repair(sim: Sim, team: Team, stance: AiProfile) {
  if (stance === "raider" || sim.credits[team] < 420) return;
  const hurt = sim.buildings.find(
    (b) => b.team === team && !b.neutral && b.complete && b.hp > 0 && b.hp < b.maxHp * 0.82 && b.kind !== "span",
  );
  if (!hurt) return;
  const spend = Math.min(22, sim.credits[team] - 380);
  if (spend <= 0) return;
  sim.credits[team] -= spend;
  hurt.hp = Math.min(hurt.maxHp, hurt.hp + spend * 0.85);
}

function mine(sim: Sim, team: Team): Building[] {
  return sim.buildings.filter((b) => b.team === team && b.hp > 0 && !b.neutral);
}

function placeBase(sim: Sim, team: Team, stance: AiProfile) {
  const have = mine(sim, team);
  const constructing = have.some((b) => !b.complete && !isPower(b.kind));
  const count = (k: BuildingId) => have.filter((b) => b.kind === k).length;
  const done = (k: BuildingId) => have.some((b) => b.kind === k && b.complete);
  const want = nextBuild(sim, team, stance, count, done);
  if (!want) return;
  if (constructing && want !== "power") return;
  if (sim.credits[team] < resolveBuilding(want, sim.factionOf(team)).cost) return;
  const spot = findAiSpot(sim, team, want);
  if (spot) sim.tryPlace(team, want, spot.tx, spot.ty);
}

function nextBuild(
  sim: Sim,
  team: Team,
  stance: AiProfile,
  count: (k: BuildingId) => number,
  done: (k: BuildingId) => boolean,
): BuildingId | null {
  const faction = sim.factionOf(team);
  const book = rosterOf(faction);
  const forecast = powerForecast(sim, team);
  const fac = resolveBuilding("factory", faction);
  const refCost = resolveBuilding("refinery", faction).cost;
  const powCost = resolveBuilding("power", faction).cost;
  const credits = sim.credits[team];
  const holdRifle = stance === "raider" && !hasLight(sim, team) ? resolveUnit("rifle", faction).cost : 0;

  if (count("power") + count("advpower") === 0) {
    if (count("refinery") === 0 && credits >= refCost && credits < powCost + refCost) return "refinery";
    return "power";
  }
  if (count("refinery") === 0) return "refinery";
  if (count("supply") < 1) return "supply";
  if (forecast.supply < forecast.use + 12 && count("power") < 4) return "power";
  if (count("barracks") === 0) return "barracks";
  if (
    stance === "raider" &&
    heatOf(sim, team) !== "hard" &&
    done("barracks") &&
    sim.time > 75 &&
    count("tower") < 1 &&
    (heatOf(sim, team) === "easy" || count("factory") > 0)
  ) {
    return "tower";
  }
  if (count("factory") === 0) {
    if (forecast.supply < forecast.use + fac.powerUse && count("power") < 4) return "power";
    if (!done("refinery")) return null;
    if (credits < fac.cost + holdRifle) return null;
    return "factory";
  }

  if (stance === "builder") {
    if (count("refinery") < 2) return "refinery";
    if (count("supply") < 2 && done("factory")) return "supply";
    if (count("tower") < 2 && done("barracks")) return "tower";
    if (forecast.supply < forecast.use + 20 && count("power") < 3) return "power";
    if (book === "concord" && count("aa") < 2 && done("barracks") && sim.time > 80) {
      const need = resolveBuilding("aa", faction).powerUse;
      if (forecast.supply >= forecast.use + need && findAiSpot(sim, team, "aa")) return "aa";
    }
    if (count("helipad") === 0 && done("factory") && sim.time > 110 && findAiSpot(sim, team, "helipad")) return "helipad";
    if (book === "syndicate" && count("radar") < 1 && done("power") && sim.time > 120 && findAiSpot(sim, team, "radar")) {
      return "radar";
    }
    if (shoreNear(sim, team) && sim.navy && count("dock") === 0 && sim.time > 150 && findAiSpot(sim, team, "dock")) {
      return "dock";
    }
    return null;
  }

  if (stance === "passive") {
    if (count("tower") < 2 && done("barracks")) return "tower";
    if (forecast.supply < forecast.use + 15 && count("power") < 3) return "power";
    if (count("refinery") < 2 && credits > refCost + 600) return "refinery";
    if (book === "concord" && count("aa") < 1 && done("barracks")) return "aa";
    return null;
  }

  // Raider: army first. A harbor flank waits until that push is out.
  if (count("supply") < 2 && done("factory")) {
    const need = resolveBuilding("supply", faction).powerUse;
    if (forecast.supply >= forecast.use + need) return "supply";
  }
  if (forecast.supply < forecast.use + 10 && count("power") < 3) return "power";
  if (heatOf(sim, team) === "easy" && count("tower") < 2 && done("barracks") && sim.time > 110) return "tower";
  if (sim.time > 200 && count("tower") < 1 && done("barracks")) return "tower";
  if (sim.aiPushed[team] && sim.time > 200 && count("helipad") === 0 && done("barracks") && findAiSpot(sim, team, "helipad")) {
    return "helipad";
  }
  if (
    sim.aiPushed[team] &&
    sim.time > 210 &&
    shoreNear(sim, team) &&
    sim.navy &&
    count("dock") === 0 &&
    findAiSpot(sim, team, "dock")
  ) {
    return "dock";
  }
  return null;
}

function powerForecast(sim: Sim, team: Team): { supply: number; use: number } {
  let supply = 0;
  let use = 0;
  const faction = sim.factionOf(team);
  for (const b of sim.buildings) {
    if (b.team !== team || b.hp <= 0 || b.neutral) continue;
    const def = resolveBuilding(b.kind, faction);
    if (isPower(b.kind)) supply += def.powerOut;
    else use += def.powerUse;
  }
  return { supply, use };
}

function isPower(kind: BuildingId): boolean {
  return kind === "power" || kind === "advpower";
}

function train(sim: Sim, team: Team, stance: AiProfile, pace: Pace, coreOnly: boolean) {
  const have = mine(sim, team);
  const barracks = have.find((b) => b.kind === "barracks" && b.complete);
  const factory = have.find((b) => b.kind === "factory" && b.complete);
  const faction = sim.factionOf(team);
  const book = rosterOf(faction);
  const credits = sim.credits[team];
  const padCash = heatOf(sim, team) === "easy" ? 480 : heatOf(sim, team) === "hard" ? 80 : 180;
  const combat = countCombat(sim, team);
  const queued = queuedCombat(sim, team);

  if (coreOnly) {
    if (!barracks || stance === "passive") return;
    if (hasLight(sim, team)) return;
    if (heatOf(sim, team) === "easy" && sim.time < 40) return;
    if (barracks.queue.length > 0) return;
    if (credits >= resolveUnit("rifle", faction).cost) sim.queueUnit(barracks.id, "rifle");
    return;
  }

  const uncapped = stance === "builder" && sim.difficultyOf(team) === "hard";
  if (!uncapped && combat + queued >= paceCap(sim, team, pace)) {
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }

  const tankComing =
    !!factory &&
    (factory.queue.includes("tank") || sim.units.some((u) => u.team === team && u.hp > 0 && u.kind === "tank"));
  // Hold the rifle line once the factory is up so the first tank is not spent away.
  const saveForTank = stance === "raider" && !!factory && !tankComing;

  if (barracks && !saveForTank && barracks.queue.length < (heatOf(sim, team) === "hard" ? 2 : 1)) {
    const wantInf =
      stance === "passive"
        ? combat < 4
        : stance === "builder"
          ? combat < 4 || sim.time > pace.push - 40
          : sim.time >= pace.scout - 8 || hasLight(sim, team);
    const inf = infantryPick(sim, team, book, stance);
    if (wantInf && credits >= resolveUnit(inf, faction).cost + padCash) sim.queueUnit(barracks.id, inf);
  }

  if (!factory) {
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }
  const harvesters = sim.units.filter((u) => u.team === team && u.kind === "harvester" && u.hp > 0).length;
  const queuedH = factory.queue.filter((q) => q === "harvester").length;
  const armored =
    sim.units.some((u) => u.team === team && u.hp > 0 && (u.kind === "tank" || u.kind === "razor" || u.kind === "medium")) ||
    sim.buildings.some(
      (b) => b.team === team && (b.queue.includes("tank") || b.queue.includes("razor") || b.queue.includes("medium")),
    );
  const refs = have.filter((b) => b.kind === "refinery" && b.complete && b.hp > 0).length;
  const trucks = Math.min(3, Math.max(1, refs));
  // One truck per refinery. A second waits until a gun is already coming, so the opener is not a convoy.
  const wantHarvester =
    harvesters + queuedH < 1 ||
    (harvesters + queuedH < trucks &&
      ((stance === "builder" && credits > 1400) || (armored && credits > 2000)));
  if (wantHarvester && factory.queue.length < 3 && credits >= resolveUnit("harvester", faction).cost + padCash) {
    sim.queueUnit(factory.id, "harvester");
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }
  if (factory.queue.length >= (heatOf(sim, team) === "hard" ? 2 : 1)) {
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }
  if (stance === "passive" && combat >= 3) {
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }
  // Easy and Normal hold tanks until the push. One scout buggy may leave earlier.
  if (stance === "raider" && sim.difficultyOf(team) !== "hard" && sim.time < pace.armor) {
    const scoutId: UnitId = book === "syndicate" ? "razor" : "scout";
    const scoutReady =
      sim.units.some((u) => u.team === team && u.hp > 0 && (u.kind === "scout" || u.kind === "razor")) ||
      factory.queue.includes("scout") ||
      factory.queue.includes("razor");
    if (
      !scoutReady &&
      sim.time >= Math.max(45, pace.scout - 12) &&
      sim.time < 360 &&
      factory.queue.length < 1 &&
      credits >= resolveUnit(scoutId, faction).cost
    ) {
      sim.queueUnit(factory.id, scoutId);
    }
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }
  const veh = vehiclePick(sim, team, book, stance);
  if (stance === "raider" && heatOf(sim, team) === "easy" && sim.time < pace.armor) {
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }
  // The first gun is a scout buggy. Tanks wait so they arrive with the wave, not the opener.
  if (stance === "raider" && sim.time < pace.assault - 28) {
    const scoutReady =
      sim.units.some((u) => u.team === team && u.hp > 0 && (u.kind === "scout" || u.kind === "razor")) ||
      factory.queue.includes("scout") ||
      factory.queue.includes("razor");
    if (heatOf(sim, team) !== "easy" && !scoutReady && credits >= resolveUnit("scout", faction).cost) {
      sim.queueUnit(factory.id, book === "syndicate" ? "razor" : "scout");
    }
    trainSupport(sim, team, stance, have, credits, faction);
    return;
  }
  const openingGun = stance === "raider" && (veh === "scout" || veh === "tank" || veh === "razor");
  const reserve = openingGun ? 0 : padCash;
  if (credits >= resolveUnit(veh, faction).cost + reserve) sim.queueUnit(factory.id, veh);

  trainSupport(sim, team, stance, have, credits, faction);
}

/** Dock and helipad only. Land training above is unchanged so the opening push still happens. */
function trainSupport(
  sim: Sim,
  team: Team,
  stance: AiProfile,
  have: Building[],
  credits: number,
  faction: ReturnType<Sim["factionOf"]>,
) {
  if (stance === "passive") return;
  const late = sim.aiPushed[team] || (stance === "builder" && sim.time > 160);
  if (!late) return;
  const spare = stance === "builder" ? 700 : 350;
  const dock = have.find((b) => b.kind === "dock" && b.complete && b.hp > 0);
  if (dock && sim.navy && dock.queue.length === 0) {
    const boats = sim.units.filter((u) => u.team === team && u.hp > 0 && u.loco === "sea").length;
    const want = boats < 1 ? "gunboat" : boats < 2 ? "missile" : boats < 3 ? "frigate" : null;
    const boat = want && techReady(sim, team, want) ? want : boats < 1 ? "gunboat" : null;
    if (boat && credits >= resolveUnit(boat, faction).cost + spare) sim.queueUnit(dock.id, boat);
  }
  const pad = have.find((b) => b.kind === "helipad" && b.complete && b.hp > 0);
  if (!pad || pad.queue.length > 0) return;
  const airN = sim.units.filter((u) => u.team === team && u.hp > 0 && u.loco === "air").length;
  const cap = stance === "builder" ? 2 : 1;
  if (airN >= cap) return;
  const air = airN === 0 || !techReady(sim, team, "bomber") ? "attackheli" : "bomber";
  if (credits >= resolveUnit(air, faction).cost + spare) sim.queueUnit(pad.id, air);
}

/** A short concrete line with an open gate, facing the enemy. Not a sealed ring. */
function fortify(sim: Sim, team: Team) {
  if (!sim.wallsOn || sim.time < 70) return;
  const yard = sim.buildings.find((b) => b.team === team && b.kind === "yard" && b.complete && b.hp > 0);
  if (!yard) return;
  const have = mine(sim, team);
  if (!have.some((b) => b.kind === "barracks" && b.complete)) return;
  const fences = have.filter((b) => (b.kind === "sandbag" || b.kind === "wall" || b.kind === "gate") && b.hp > 0);
  if (fences.length >= 7) return;
  if (sim.credits[team] < 500) return;
  const enemy = enemyCamp(sim, team);
  const cx = yard.tx + yard.w / 2;
  const cy = yard.ty + yard.h / 2;
  let dx = enemy.x - cx;
  let dy = enemy.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const px = -dy;
  const py = dx;
  const concrete = have.some((b) => b.kind === "factory" && b.complete) && sim.credits[team] > 900;
  const kind: BuildingId = concrete ? "wall" : "sandbag";
  const faction = sim.factionOf(team);
  let placed = 0;
  for (const dist of [5, 4, 6, 7]) {
    const ox = cx + dx * dist;
    const oy = cy + dy * dist;
    for (const side of [-2, -1, 1, 2, 0]) {
      const tx = Math.round(ox + px * side - 0.5);
      const ty = Math.round(oy + py * side - 0.5);
      if (coversDoor(sim, team, tx, ty, 1, 1)) continue;
      const host = sim.buildings.find(
        (b) =>
          b.hp > 0 &&
          b.tx === tx &&
          b.ty === ty &&
          b.w === 1 &&
          b.h === 1 &&
          (b.kind === "sandbag" || b.kind === "wall" || b.kind === "gate"),
      );
      if (side === 0 && host && host.team === team && host.complete && host.kind !== "gate" && host.rubble <= 0) {
        if (sim.credits[team] >= resolveBuilding("gate", faction).cost) sim.tryPlace(team, "gate", tx, ty);
        continue;
      }
      if (host || fences.length + placed >= 6) continue;
      if (sim.credits[team] < resolveBuilding(kind, faction).cost + 400) return;
      if (sim.tryPlace(team, kind, tx, ty).ok) placed++;
      if (placed >= 2) return;
    }
    if (placed > 0) return;
  }
}

/** Boats sail the water. Gunships fly the camp. A bridge in the channel gets shot until it falls. */
function flank(sim: Sim, team: Team, stance: AiProfile) {
  if (stance === "passive") return;
  if (sim.time < firstPushAt(sim.difficultyOf(team))) return;
  if (stance === "raider" && !sim.aiPushed[team]) return;
  const dest = strikePoint(sim, team);
  const boats = sim.units.filter(
    (u) => u.team === team && u.hp > 0 && u.loco === "sea" && u.damage > 0 && !u.aboard && idleish(u),
  );
  if (boats.length && sim.navy) {
    const lead = boats[0]!;
    const water = sim.waterNear(lead, dest.x, dest.y) ?? dest;
    const span = sim.bridgeBlocking(lead, water.x, water.y);
    const ids = boats.map((u) => u.id);
    if (span) sim.issueAttack(ids, span);
    else sim.issueMove(ids, water.x, water.y, true);
  }
  const air = sim.units.filter(
    (u) =>
      u.team === team &&
      u.hp > 0 &&
      u.loco === "air" &&
      u.damage > 0 &&
      u.rearm <= 0 &&
      (u.ammoMax === 0 || u.ammo > 0) &&
      idleish(u),
  );
  if (air.length) {
    sim.issueMove(
      air.map((u) => u.id),
      dest.x,
      dest.y,
      true,
    );
  }
}

function techReady(sim: Sim, team: Team, id: UnitId): boolean {
  const need = unitRequires(id);
  if (!need) return true;
  return sim.buildings.some((b) => b.team === team && b.kind === need && b.complete && b.hp > 0 && b.rubble <= 0);
}

function infantryPick(sim: Sim, team: Team, book: "concord" | "syndicate", stance: AiProfile): UnitId {
  if (stance === "raider" && (heatOf(sim, team) === "easy" || sim.time < 140)) return "rifle";
  if (stance === "builder" && book === "syndicate" && (sim.time | 0) % 2 === 0) return techReady(sim, team, "rocket") ? "rocket" : "rifle";
  const n = Math.floor(sim.time / 11);
  if (book === "concord") {
    const pick = (["rifle", "marksman", "rocket", "wader"] as const)[n % 4]!;
    return techReady(sim, team, pick) ? pick : "rifle";
  }
  const pick = (["rifle", "rocket", "wader"] as const)[n % 3]!;
  return techReady(sim, team, pick) ? pick : "rifle";
}

function vehiclePick(sim: Sim, team: Team, book: "concord" | "syndicate", stance: AiProfile): UnitId {
  const has = (k: UnitId) =>
    sim.units.some((u) => u.team === team && u.hp > 0 && u.kind === k) ||
    sim.buildings.some((b) => b.team === team && b.queue.includes(k));
  if (stance === "raider" && heatOf(sim, team) === "easy" && sim.time < 240) return "scout";
  if (stance === "raider" && !has("scout") && !has("razor")) return book === "syndicate" ? "razor" : "scout";
  // Artillery must not steal the first gun. A tank (or the Razor, after) is the fight.
  if (stance === "raider" && !has("tank")) return "tank";
  if (stance === "builder" && sim.time > 150 && !has("artillery") && techReady(sim, team, "artillery")) return "artillery";
  if (stance === "raider" && sim.time > 160 && !has("scatter") && techReady(sim, team, "scatter") && (sim.time | 0) % 5 === 0) return "scatter";
  if (book === "syndicate" && !has("razor")) return "razor";
  if (book === "syndicate") return (sim.time | 0) % 2 === 0 ? "razor" : "tank";
  const pick: UnitId = (sim.time | 0) % 3 === 0 ? "artillery" : "tank";
  return techReady(sim, team, pick) ? pick : "tank";
}

/** Hostile on the doorstep. The squad turns around before it walks off to attack. */
function nearbyThreat(sim: Sim, team: Team): { x: number; y: number } | null {
  const heat = heatOf(sim, team);
  const radius = heat === "hard" ? 18 : heat === "normal" ? 14 : 11;
  const camps: { x: number; y: number }[] = [];
  const home = sim.starts.slots[team];
  if (home) camps.push(home);
  for (const b of sim.buildings) {
    if (b.team !== team || b.hp <= 0 || b.neutral) continue;
    if (b.kind === "sandbag" || b.kind === "wall" || b.kind === "gate" || b.kind === "span") continue;
    camps.push({ x: b.tx + b.w / 2, y: b.ty + b.h / 2 });
  }
  let best: { x: number; y: number } | null = null;
  let bestD = radius;
  for (const u of sim.units) {
    if (u.hp <= 0 || u.aboard || u.damage <= 0 || sim.allied(team, u.team)) continue;
    if (u.loco === "air") continue;
    for (const c of camps) {
      const d = Math.hypot(u.x - c.x, u.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = { x: u.x, y: u.y };
      }
    }
  }
  return best;
}

function paceCap(sim: Sim, team: Team, pace: Pace): number {
  const ceil = sim.difficultyOf(team);
  let cap = pace.cap;
  if (ceil === "normal") {
    // Smooth step from Easy's handful to a Normal army across the first 8 minutes.
    const u = Math.max(0, Math.min(1, sim.time / 480));
    const s = u * u * (3 - 2 * u);
    cap = Math.round(6 + (pace.cap - 6) * s);
  }
  if (sim.time < 900) return cap;
  return cap + (ceil === "easy" ? 2 : 4);
}

/** Normal's wave size grows with the same 8-minute climb. Hard stays at its own number. */
function liveGroup(sim: Sim, team: Team, pace: Pace): number {
  if (sim.difficultyOf(team) !== "normal") return pace.group;
  const u = Math.max(0, Math.min(1, sim.time / 480));
  const s = u * u * (3 - 2 * u);
  return Math.max(3, Math.round(3 + (pace.group - 3) * s));
}

function unitCost(sim: Sim, u: Unit): number {
  return resolveUnit(u.kind, sim.factionOf(u.team)).cost;
}

/** Combat units only. Harvesters and the MCV are the economy, not the army. */
function opposingValue(sim: Sim, team: Team): number {
  let n = 0;
  for (const u of sim.units) {
    if (u.hp <= 0 || u.aboard || u.damage <= 0 || sim.allied(team, u.team)) continue;
    if (u.kind === "harvester" || u.kind === "mcv") continue;
    n += unitCost(sim, u) * (u.hp / Math.max(1, u.maxHp));
  }
  return n;
}

/**
 * Easy never walks in with more than about 1.5× the enemy army, and the first
 * push stays a handful of units. Normal's first push is the small group; the
 * wave after 8:00 can be larger. Hard is uncapped.
 */
function capParty(sim: Sim, team: Team, ready: Unit[], pace: Pace): Unit[] {
  const ceil = sim.difficultyOf(team);
  if (ceil === "hard") return ready;
  if (ceil === "normal") {
    const group = liveGroup(sim, team, pace);
    const n = sim.time >= 480 ? Math.min(ready.length, Math.max(pace.group + 3, 8)) : Math.min(ready.length, group);
    return ready.slice(0, n);
  }
  const rifle = resolveUnit("rifle", sim.factionOf(team)).cost;
  const enemy = opposingValue(sim, team);
  // Never more than about 1.5× the player's army. One cheap trooper is the floor
  // so an empty field still gets a scout, not a free base wipe.
  const maxValue = Math.max(rifle, enemy * 1.5);
  const maxN = sim.time < 480 ? 2 : sim.time < 600 ? 6 : 10;
  const ranked = [...ready].sort((a, b) => unitCost(sim, a) - unitCost(sim, b));
  const out: Unit[] = [];
  let v = 0;
  for (const u of ranked) {
    if (out.length >= maxN) break;
    const c = unitCost(sim, u);
    if (c > maxValue) continue;
    if (out.length >= 1 && v + c > maxValue + rifle * 0.05) break;
    out.push(u);
    v += c;
  }
  return out;
}

function retreating(u: Unit, home: { x: number; y: number }): boolean {
  if (u.hp >= u.maxHp * 0.62) return false;
  if (u.order.t !== "move" || u.order.attackMove) return false;
  return Math.hypot(u.order.x - home.x, u.order.y - home.y) < 7;
}

/** Badly damaged troops walk home. A scratch is not enough to leave the fight. */
function pullDamaged(sim: Sim, team: Team, army: Unit[]) {
  const ceil = sim.difficultyOf(team);
  const line = ceil === "hard" ? 0.25 : ceil === "easy" ? 0.45 : 0.38;
  const home = sim.starts.slots[team] ?? sim.starts.enemy;
  const hurt = army.filter((u) => {
    if (u.hp >= u.maxHp * line) return false;
    if (Math.hypot(u.x - home.x, u.y - home.y) < 7) return false;
    if (retreating(u, home)) return false;
    return true;
  });
  if (!hurt.length) return;
  sim.issueMove(
    hurt.map((u) => u.id),
    home.x,
    home.y,
    false,
  );
}

function fight(sim: Sim, team: Team, stance: AiProfile, pace: Pace) {
  if (sim.deploying()) {
    sim.aiIntent[team] = "expand";
    return;
  }
  flank(sim, team, stance);
  const army = combatUnits(sim, team);
  pullDamaged(sim, team, army);
  const home = sim.starts.slots[team] ?? sim.starts.enemy;
  if (recallBroken(sim, team, army, home)) {
    sim.aiAt[team] = Math.max(sim.aiAt[team] || 0, sim.time + 24);
    sim.aiIntent[team] = "defend";
    return;
  }
  const away = army.some(
    (u) => u.order.t === "move" && u.order.attackMove && Math.hypot(u.x - home.x, u.y - home.y) > 10,
  );

  if (stance === "passive") {
    const alert = sim.aiAlert[team];
    const ready = army.filter((u) => idleish(u) && u.hp >= u.maxHp * 0.55);
    if (sim.aiHurt[team] && alert && sim.time <= alert.until && ready.length >= 1) {
      if (launch(sim, team, ready, { x: alert.x, y: alert.y }, pace, false, null, true, true)) {
        sim.aiIntent[team] = "attack";
        return;
      }
    }
    sim.aiIntent[team] = "defend";
    return;
  }

  if (seesEnemy(sim, team)) sim.aiContact[team] = true;

  const threat = nearbyThreat(sim, team);
  const answer = heatOf(sim, team) !== "easy" || sim.time > 100;
  const floor = firstPushAt(sim.difficultyOf(team));
  if (threat && answer) {
    const hard = heatOf(sim, team) === "hard";
    const early = sim.time < floor;
    const leash = early ? 8 : hard ? 18 : 12;
    const ready = army.filter((u) => {
      if (u.hp < u.maxHp * 0.55) return false;
      if (Math.hypot(u.x - home.x, u.y - home.y) > leash + 6) return false;
      if (u.order.t === "attack") return false;
      if (idleish(u)) return true;
      return !early && hard && Math.hypot(u.x - home.x, u.y - home.y) < 22;
    });
    if (ready.length >= 1) {
      const dest = early
        ? {
            x: clamp(home.x + Math.max(-4, Math.min(4, threat.x - home.x)), 2, sim.gw - 2),
            y: clamp(home.y + Math.max(-4, Math.min(4, threat.y - home.y)), 2, sim.gh - 2),
          }
        : threat;
      if (launch(sim, team, ready, dest, pace, false, null, !early, true)) {
        sim.aiIntent[team] = "defend";
        return;
      }
    }
  }

  // Before the scheduled push, a wanderer comes home instead of living on their yard.
  if (sim.difficultyOf(team) !== "hard" && !sim.aiPushed[team] && sim.time < pace.assault) {
    const camp = enemyCamp(sim, team);
    const deep = army.filter((u) => {
      if (retreating(u, home)) return false;
      if (Math.hypot(u.x - camp.x, u.y - camp.y) >= 9.5) return false;
      if (Math.hypot(u.x - home.x, u.y - home.y) <= 8) return false;
      return u.order.t === "attack" || (u.order.t === "move" && u.order.attackMove);
    });
    if (deep.length) {
      sim.issueMove(
        deep.map((u) => u.id),
        home.x,
        home.y,
        false,
      );
    }
  }

  if (stance === "builder") {
    if (sim.time >= pace.push && army.filter((u) => idleish(u) && !retreating(u, home) && u.hp >= u.maxHp * 0.55).length >= Math.max(3, Math.min(4, liveGroup(sim, team, pace)))) {
      let ready = army.filter((u) => (idleish(u) || (u.order.t === "move" && !u.order.attackMove)) && !retreating(u, home) && u.hp >= u.maxHp * 0.55);
      ready = capParty(sim, team, ready, pace);
      if (ready.length >= 3) {
        if (launch(sim, team, ready, strikePoint(sim, team), pace, true)) {
          sim.aiPushed[team] = true;
          sim.aiIntent[team] = "attack";
          return;
        }
      }
    }
    if (away && sim.aiPushed[team]) {
      nudge(sim, team, army);
      sim.aiIntent[team] = "attack";
      return;
    }
    sim.aiIntent[team] = "expand";
    return;
  }

  // Raider. Scout, then a short harass that does not camp their yard, then a real wave.
  const scoutClose = sim.difficultyOf(team) === "easy" ? Math.min(pace.harass, EASY_SCOUT_UNTIL) : pace.harass;
  if (!sim.aiScouted[team] && sim.time >= pace.scout && sim.time < scoutClose) {
    const idle = army.filter((u) => LIGHT.has(u.kind) && idleish(u) && !isArmor(u) && u.hp >= u.maxHp * 0.55);
    const light = idle.find((u) => u.armor === "infantry") ?? idle.find((u) => u.kind === "scout" || u.kind === "razor");
    if (light) {
      if (launch(sim, team, [light], standoff(sim, team), pace, false, null, false)) {
        sim.aiScouted[team] = true;
        sim.aiIntent[team] = "scout";
        return;
      }
    }
  }

  const pokeDue =
    sim.difficultyOf(team) !== "easy" &&
    sim.time >= pace.harass &&
    sim.time + 1 < pace.assault &&
    !sim.aiPoked[team];
  const assaultDue = sim.time >= pace.assault && !sim.aiPushed[team];
  const waveDue = sim.aiPushed[team] && sim.time >= (sim.aiAt[team] || 0);
  if (pokeDue) {
    const foot = army.filter((u) => idleish(u) && !retreating(u, home) && u.armor === "infantry" && u.hp >= u.maxHp * 0.55).slice(0, 2);
    const buggy = army.filter((u) => idleish(u) && !retreating(u, home) && (u.kind === "scout" || u.kind === "razor") && u.hp >= u.maxHp * 0.55).slice(0, 1);
    const party = [...foot, ...buggy];
    if (party.length >= 1) {
      const prey = openHarvester(sim, team);
      if (launch(sim, team, party, prey ?? standoff(sim, team), pace, false, null, !!prey)) {
        sim.aiPoked[team] = true;
        sim.aiIntent[team] = "attack";
        return;
      }
    }
  }
  if (sim.aiPoked[team] && !sim.aiPushed[team] && sim.time >= pace.harass + 26 && sim.time < pace.assault) {
    const camp = enemyCamp(sim, team);
    const lingering = army.filter((u) => {
      if (Math.hypot(u.x - home.x, u.y - home.y) <= 8) return false;
      if (Math.hypot(u.x - camp.x, u.y - camp.y) >= 12) return false;
      return u.order.t === "attack" || (u.order.t === "move" && u.order.attackMove);
    });
    if (lingering.length) {
      sim.issueMove(
        lingering.map((u) => u.id),
        home.x,
        home.y,
        false,
      );
      sim.aiIntent[team] = "scout";
      return;
    }
  }
  if (assaultDue || waveDue) {
    let ready = army.filter((u) => idleish(u) && !retreating(u, home) && u.hp >= u.maxHp * 0.55);
    if (sim.time < pace.armor) {
      const guns = ready.filter(isArmor);
      const rest = ready.filter((u) => !isArmor(u));
      const allow = sim.difficultyOf(team) === "hard" ? 1 : 0;
      ready = [...rest, ...guns.slice(0, allow)];
    }
    ready = capParty(sim, team, ready, pace);
    const group = liveGroup(sim, team, pace);
    const need = waveDue ? group : Math.max(3, group - 1);
    const late = sim.time > (assaultDue ? pace.assault + 30 : (sim.aiAt[team] || 0) + 25);
    const easy = sim.difficultyOf(team) === "easy";
    const easyGo = easy && ready.length >= 3 && sim.time >= pace.assault;
    const normalGo =
      !easy &&
      (ready.length >= need || (late && ready.length >= 2) || (sim.difficultyOf(team) === "hard" && ready.length >= 2 && assaultDue));
    if (easyGo || normalGo) {
      const striking = !easy || ready.length >= 3;
      const dest = striking ? strikePoint(sim, team) : standoff(sim, team);
      const focus = sim.difficultyOf(team) === "hard" ? priorityId(sim, team) : null;
      if (launch(sim, team, ready, dest, pace, true, focus, striking)) {
        sim.aiPushed[team] = true;
        sim.aiPoked[team] = true;
        sim.aiIntent[team] = "attack";
        warnArriving(sim, team);
        return;
      }
    }
  }

  warnArriving(sim, team);
  if (sim.aiPushed[team] && away) nudge(sim, team, army);
  if (sim.aiPushed[team] || sim.aiPoked[team]) sim.aiIntent[team] = "attack";
  else if (sim.time >= pace.scout && pace.scout < 900) sim.aiIntent[team] = "scout";
  else sim.aiIntent[team] = "expand";
}

/** Half the squad is hurt. Easy and Normal walk home instead of dying on the yard. */
function recallBroken(sim: Sim, team: Team, army: Unit[], home: { x: number; y: number }): boolean {
  if (sim.difficultyOf(team) === "hard") return false;
  const away = army.filter((u) => Math.hypot(u.x - home.x, u.y - home.y) > 9);
  if (away.length < 3) return false;
  const hurt = away.filter((u) => u.hp < u.maxHp * 0.55).length;
  if (hurt < Math.ceil(away.length * 0.5)) return false;
  sim.issueMove(
    away.map((u) => u.id),
    home.x,
    home.y,
    false,
  );
  return true;
}

/** Keep a marching group from parking in the fog when a hop ends. Fresh troops wait for the next wave. */
function nudge(sim: Sim, team: Team, army: Unit[]) {
  const goal = sim.aiGoal[team];
  if (!goal) return;
  const home = sim.starts.slots[team] ?? sim.starts.enemy;
  const stuck = army.filter((u) => needsHop(u, home));
  if (!stuck.length) return;
  const step = hop(sim, stuck[0]!, goal);
  if (Math.hypot(step.x - stuck[0]!.x, step.y - stuck[0]!.y) < 1.2) return;
  sim.issueMove(
    stuck.map((u) => u.id),
    step.x,
    step.y,
    true,
  );
}

function needsHop(u: Unit, home: { x: number; y: number }): boolean {
  const far = Math.hypot(u.x - home.x, u.y - home.y) > 8;
  if (u.order.t === "move" && u.order.attackMove && Math.hypot(u.x - u.order.x, u.y - u.order.y) < 2.4) return true;
  return far && (u.order.t === "idle" || u.blocked > 0);
}

function launch(
  sim: Sim,
  team: Team,
  units: Unit[],
  dest: { x: number; y: number },
  pace: Pace,
  waveClock: boolean,
  focus: number | null = null,
  attackMove = true,
  defense = false,
): boolean {
  if (!units.length) return false;
  const diff = sim.difficultyOf(team);
  // Personality can wait. It cannot attack before the difficulty mark.
  if (!defense && attackMove && sim.time < firstPushAt(diff)) return false;
  if (!defense && !attackMove && diff === "easy" && sim.time >= EASY_SCOUT_UNTIL) return false;
  const armed = attackMove && (defense || sim.time >= firstPushAt(diff));
  const roles = !defense && armed && (diff === "normal" || diff === "hard") ? baseRoles(sim, team) : [];
  if (roles.length >= 2) {
    sim.aiGoal[team] = roles[0]!;
    const groups = splitGroups(units, roles.length);
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      if (!group.length) continue;
      const step = hop(sim, group[0]!, roles[i]!);
      sim.issueMove(
        group.map((u) => u.id),
        step.x,
        step.y,
        true,
      );
    }
  } else {
    sim.aiGoal[team] = dest;
    if (focus && (defense || sim.time >= firstPushAt(diff))) {
      sim.issueAttack(
        units.map((u) => u.id),
        focus,
      );
    } else {
      const step = hop(sim, units[0]!, dest);
      sim.issueMove(
        units.map((u) => u.id),
        step.x,
        step.y,
        armed,
      );
    }
  }
  if (waveClock) {
    const gap = pace.wave + sim.roll(pace.jitter + 1);
    let at = sim.time + gap;
    // Normal's first walk is the small push. The main wave waits until 8:00.
    if (diff === "normal" && sim.time < 480) at = Math.max(at, 480);
    if (at < firstPushAt(diff)) at = firstPushAt(diff);
    sim.aiAt[team] = at;
    if (team === 1) sim.aiNext = sim.aiAt[team]!;
  }
  return true;
}

function isArmor(u: Unit): boolean {
  return u.kind === "tank" || u.kind === "razor" || u.kind === "medium" || u.kind === "artillery";
}

/** Short of both camps. A scout reveals the gap and does not walk onto the yard. */
function standoff(sim: Sim, team: Team): { x: number; y: number } {
  const home = sim.starts.slots[team] ?? sim.starts.enemy;
  const camp = enemyCamp(sim, team);
  const dx = home.x - camp.x;
  const dy = home.y - camp.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Tight maps cannot be 10 tiles off both yards. Hold on our half of the gap.
  const gap = len < 20 ? Math.min(len - 8.6, Math.max(8.2, len * 0.5)) : Math.min(18, Math.max(11, len * 0.42));
  return {
    x: clamp(camp.x + ux * gap, 3, sim.gw - 3),
    y: clamp(camp.y + uy * gap, 3, sim.gh - 3),
  };
}

/** A harvester out in the ore, not one parked on their Construction Yard. */
function openHarvester(sim: Sim, team: Team): { x: number; y: number } | null {
  const prey = visibleHarvester(sim, team);
  if (!prey) return null;
  const camp = enemyCamp(sim, team);
  if (Math.hypot(prey.x - camp.x, prey.y - camp.y) < 12) return null;
  return prey;
}

function visibleHarvester(sim: Sim, team: Team): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const origin = sim.starts.slots[team] ?? sim.starts.enemy;
  for (const u of sim.units) {
    if (u.hp <= 0 || u.aboard || u.kind !== "harvester" || sim.allied(team, u.team)) continue;
    if (!sim.visibleUnit(team, u)) continue;
    const d = Math.hypot(u.x - origin.x, u.y - origin.y);
    if (d < bestD) {
      bestD = d;
      best = { x: u.x, y: u.y };
    }
  }
  return best;
}

/** Red pulse + advisor once a raider is close enough to shoot the base. */
function warnArriving(sim: Sim, team: Team) {
  if (!sim.aiPoked[team] && !sim.aiPushed[team]) return;
  for (const u of combatUnits(sim, team)) {
    for (const b of sim.buildings) {
      if (b.hp <= 0 || b.neutral || sim.allied(team, b.team)) continue;
      if (b.kind === "sandbag" || b.kind === "wall" || b.kind === "gate" || b.kind === "span") continue;
      const x = b.tx + b.w / 2;
      const y = b.ty + b.h / 2;
      if (Math.hypot(u.x - x, u.y - y) > 12) continue;
      sim.warnBase(b.team as Team, x, y);
      return;
    }
  }
}

/**
 * Short hop toward the camp. A full-map search blows the path budget on
 * water and then the unit gives up. Fog does not block the hop.
 */
function hop(sim: Sim, u: Unit, dest: { x: number; y: number }): { x: number; y: number } {
  const dx = dest.x - u.x;
  const dy = dest.y - u.y;
  const len = Math.hypot(dx, dy) || 1;
  if (len < 14 && sim.reach(u, dest.x, dest.y)) return dest;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const tries: [number, number][] = [
    [12, 0],
    [8, 0],
    [16, 0],
    [10, 7],
    [10, -7],
  ];
  for (const [forward, side] of tries) {
    const dist = Math.min(forward, Math.max(4, len - 1));
    const x = clamp(u.x + ux * dist + px * side, 2, sim.gw - 2);
    const y = clamp(u.y + uy * dist + py * side, 2, sim.gh - 2);
    if (sim.reach(u, x, y)) return { x, y };
  }
  if (sim.reach(u, dest.x, dest.y)) return dest;
  return { x: clamp(u.x + ux * 6, 2, sim.gw - 2), y: clamp(u.y + uy * 6, 2, sim.gh - 2) };
}

const PROD_KINDS = new Set(["yard", "barracks", "factory", "refinery", "dock", "helipad", "stealth"]);
const POWER_KINDS = new Set(["power", "advpower"]);
const DEF_KINDS = new Set(["tower", "aa"]);

/** Visible power, production, and defense nearest the enemy camp. One point per role. */
function baseRoles(sim: Sim, team: Team): { x: number; y: number }[] {
  const camp = enemyCamp(sim, team);
  const best = new Map<string, { x: number; y: number; d: number }>();
  for (const b of sim.buildings) {
    if (b.hp <= 0 || b.neutral || sim.allied(team, b.team) || b.rubble > 0) continue;
    if (!sim.buildingVisible(team, b)) continue;
    const role = POWER_KINDS.has(b.kind) ? "power" : PROD_KINDS.has(b.kind) ? "prod" : DEF_KINDS.has(b.kind) ? "def" : "";
    if (!role) continue;
    const x = b.tx + b.w / 2;
    const y = b.ty + b.h / 2;
    const d = Math.hypot(x - camp.x, y - camp.y);
    const prev = best.get(role);
    if (!prev || d < prev.d) best.set(role, { x, y, d });
  }
  return [...best.values()].map(({ x, y }) => ({ x, y }));
}

function splitGroups(units: Unit[], n: number): Unit[][] {
  const out = Array.from({ length: n }, () => [] as Unit[]);
  units.forEach((u, i) => out[i % n]!.push(u));
  return out;
}

function strikePoint(sim: Sim, team: Team): { x: number; y: number } {
  const origin = sim.starts.slots[team] ?? sim.starts.enemy;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const u of sim.units) {
    if (u.hp <= 0 || u.aboard || sim.allied(team, u.team)) continue;
    if (!sim.visibleUnit(team, u)) continue;
    const harass = u.kind === "harvester" ? 0 : 8;
    const d = Math.hypot(u.x - origin.x, u.y - origin.y) + harass;
    if (d < bestScore) {
      bestScore = d;
      best = { x: u.x, y: u.y };
    }
  }
  for (const b of sim.buildings) {
    if (b.hp <= 0 || b.neutral || sim.allied(team, b.team)) continue;
    if (!sim.buildingVisible(team, b)) continue;
    if (b.kind === "sandbag" || b.kind === "wall" || b.kind === "gate" || b.kind === "span") continue;
    const x = b.tx + b.w / 2;
    const y = b.ty + b.h / 2;
    const forward = b.kind === "power" || b.kind === "refinery" ? 0 : 4;
    const d = Math.hypot(x - origin.x, y - origin.y) + forward;
    if (d < bestScore) {
      bestScore = d;
      best = { x, y };
    }
  }
  return best ?? enemyCamp(sim, team);
}

/** Hard difficulty focus-fires a visible harvester, then a power plant. */
function priorityId(sim: Sim, team: Team): number | null {
  let plant: number | null = null;
  for (const u of sim.units) {
    if (u.hp <= 0 || u.aboard || u.kind !== "harvester" || sim.allied(team, u.team)) continue;
    if (sim.visibleUnit(team, u)) return u.id;
  }
  for (const b of sim.buildings) {
    if (b.hp <= 0 || b.neutral || sim.allied(team, b.team) || !sim.buildingVisible(team, b)) continue;
    if (b.kind === "power" || b.kind === "advpower") return b.id;
    if (!plant && b.kind !== "span" && b.kind !== "sandbag") plant = b.id;
  }
  return plant;
}

function enemyCamp(sim: Sim, team: Team): { x: number; y: number } {
  const origin = sim.starts.slots[team] ?? sim.starts.enemy;
  let best = sim.starts.player;
  let far = Infinity;
  for (let t = 0; t <= sim.opponents; t++) {
    if (sim.allied(team, t)) continue;
    const slot = sim.starts.slots[t];
    if (!slot) continue;
    const d = Math.hypot(slot.x - origin.x, slot.y - origin.y);
    if (d < far) {
      far = d;
      best = slot;
    }
  }
  return { x: best.x, y: best.y };
}

function seesEnemy(sim: Sim, team: Team): boolean {
  for (const u of sim.units) {
    if (u.hp <= 0 || u.aboard || sim.allied(team, u.team)) continue;
    if (sim.visibleUnit(team, u)) return true;
  }
  for (const b of sim.buildings) {
    if (b.hp <= 0 || b.neutral || sim.allied(team, b.team)) continue;
    if (sim.buildingVisible(team, b)) return true;
  }
  return false;
}

function combatUnits(sim: Sim, team: Team): Unit[] {
  return sim.units.filter(
    (u) => u.team === team && u.hp > 0 && u.damage > 0 && !u.aboard && u.loco !== "air" && u.loco !== "sea",
  );
}

function idleish(u: Unit): boolean {
  if (u.order.t === "idle" || u.order.t === "guard") return true;
  if (u.order.t === "move" && !u.order.attackMove) return true;
  if (u.order.t === "move" && u.order.attackMove && Math.hypot(u.x - u.order.x, u.y - u.order.y) < 2.4) return true;
  return false;
}

function countCombat(sim: Sim, team: Team): number {
  return combatUnits(sim, team).length;
}

function queuedCombat(sim: Sim, team: Team): number {
  let n = 0;
  for (const b of sim.buildings) {
    if (b.team !== team || b.hp <= 0) continue;
    for (const q of b.queue) if (q !== "harvester" && q !== "mcv") n++;
  }
  return n;
}

function hasLight(sim: Sim, team: Team): boolean {
  if (sim.units.some((u) => u.team === team && u.hp > 0 && LIGHT.has(u.kind))) return true;
  for (const b of sim.buildings) {
    if (b.team !== team) continue;
    if (b.queue.some((q) => LIGHT.has(q))) return true;
  }
  return false;
}

function shoreNear(sim: Sim, team: Team): boolean {
  const s = sim.starts.slots[team];
  if (!s) return false;
  const r = 9;
  const x0 = Math.max(0, (s.x | 0) - r);
  const y0 = Math.max(0, (s.y | 0) - r);
  const x1 = Math.min(sim.gw - 1, (s.x | 0) + r);
  const y1 = Math.min(sim.gh - 1, (s.y | 0) + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (sim.terrain[y * sim.gw + x] === TILE_SHORE) return true;
    }
  }
  return false;
}

function findAiSpot(sim: Sim, team: Team, kind: BuildingId): { tx: number; ty: number } | null {
  const yard = sim.buildings.find((b) => b.team === team && b.kind === "yard" && b.complete && b.hp > 0);
  if (!yard) return null;
  const def = resolveBuilding(kind, sim.factionOf(team));
  const refs = mine(sim, team).filter((b) => b.kind === "refinery").length;
  const origin =
    kind === "refinery" && refs > 0
      ? { x: sim.gw - yard.tx, y: sim.gh - yard.ty }
      : { x: yard.tx + yard.w / 2, y: yard.ty + yard.h / 2 };
  const ore = kind === "refinery" ? sim.oreNear(team, origin.x, origin.y) : null;
  let best: { tx: number; ty: number } | null = null;
  let bestScore = Infinity;
  let fallback: { tx: number; ty: number } | null = null;
  let fallScore = Infinity;
  for (let r = 0; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r && r !== 0) continue;
        const tx = yard.tx + dx;
        const ty = yard.ty + dy;
        if (!sim.canPlace(team, kind, tx, ty).ok) continue;
        const seals = coversDoor(sim, team, tx, ty, def.w, def.h);
        const doorOk = kind !== "refinery" || serviceDoorOpen(sim, team, tx, ty, def.w, def.h);
        const cx = tx + def.w / 2;
        const cy = ty + def.h / 2;
        const score = ore
          ? Math.hypot(cx - ore.x, cy - ore.y) + Math.hypot(dx, dy) * 0.12
          : Math.hypot(cx - sim.gw / 2, cy - sim.gh / 2) * 0.35 + Math.hypot(dx, dy);
        if (!seals && doorOk && score < bestScore) {
          bestScore = score;
          best = { tx, ty };
        } else if (!seals && score < fallScore) {
          fallScore = score;
          fallback = { tx, ty };
        }
      }
    }
    if (best && r > 4) break;
  }
  return best ?? fallback;
}

function serviceDoorOpen(sim: Sim, team: Team, tx: number, ty: number, w: number, h: number): boolean {
  const south = team !== 0;
  const x = tx + w / 2;
  const y = south ? ty + h + 0.55 : ty - 0.55;
  return sim.footOpen(x, y);
}

function coversDoor(sim: Sim, team: Team, tx: number, ty: number, w: number, h: number): boolean {
  for (const b of sim.buildings) {
    if (b.team !== team || b.hp <= 0 || b.neutral) continue;
    if (b.kind !== "refinery" && b.kind !== "yard") continue;
    const door = sim.doorOf(b);
    const dx = door.x | 0;
    const dy = door.y | 0;
    if (dx >= tx && dx < tx + w && dy >= ty && dy < ty + h) return true;
  }
  return false;
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}
