import assert from "node:assert/strict";
import test from "node:test";
import { buildNeed, canBuild, canTrain, resolveBuilding, resolveUnit, spareFaction } from "./data.ts";
import { shareCode } from "./custom.ts";
import { offersNavy } from "./editor.ts";
import {
  FACTIONS,
  aiCount,
  alliances,
  assignStarts,
  buildingOffered,
  clampSetup,
  chooseOpponents,
  DEFAULT_SETUP,
  listMyMaps,
  lobbyBlock,
  LOBBY_MAPS,
  maxOpponents,
  navyHidden,
  netRulesFromSetup,
  orderCorners,
  loadSetup,
  normalBotDefaults,
  parseSetup,
  randomSetup,
  RULES_KEY,
  resolveMyMap,
  seatCap,
  toNewGame,
  unitOffered,
  trainOffered,
  withNewBotSkill,
  type SkirmishSetup,
} from "./lobby.ts";
import { NORMAL_PUSH_AT, Sim, firstPushAt } from "./sim.ts";

test("a texted room keeps the skirmish the host already set", () => {
  const packed = netRulesFromSetup({
    ...DEFAULT_SETUP,
    mapId: "river",
    size: "large",
    opponents: 2,
    player: "prism",
    enemy: "steel",
    credits: 10000,
    fog: false,
    walls: false,
  });
  assert.equal(packed.rules.mapId, "river");
  assert.equal(packed.rules.size, "large");
  assert.equal(packed.rules.player, "prism");
  assert.equal(packed.rules.enemy, "steel");
  assert.equal(packed.rules.credits, 10000);
  assert.equal(packed.rules.fog, false);
  assert.equal(packed.rules.walls, false);
  assert.equal(packed.rules.teams, "ffa");
  assert.equal(packed.commanders, 3);
  assert.equal(packed.chart, "");
  const coop = netRulesFromSetup({ ...DEFAULT_SETUP, teams: "tvt", size: "large", opponents: 2 });
  assert.equal(coop.rules.teams, "tvt");
  assert.equal(coop.commanders, 4);
});

test("dry basin hides dock and naval units", () => {
  assert.equal(navyHidden("dry"), true);
  assert.equal(buildingOffered("dry", "concord", "dock"), false);
  assert.equal(buildingOffered("dry", "syndicate", "power"), true);
  for (const id of ["gunboat", "frigate", "missile", "transport"] as const) {
    assert.equal(unitOffered("dry", "concord", id), false, id);
  }
  assert.equal(unitOffered("dry", "concord", "rifle"), true);
  assert.equal(unitOffered("dry", "concord", "tank"), true);
});

test("island chain keeps the dock and blocks a side that cannot build one", () => {
  assert.equal(buildingOffered("isles", "concord", "dock"), true);
  assert.equal(buildingOffered("isles", "syndicate", "dock"), true);
  assert.equal(lobbyBlock({ mapId: "isles", player: "concord", enemy: "syndicate" }), null);
  assert.equal(canBuild("dock", "concord"), true);
  const blocked = lobbyBlock({ mapId: "isles", player: "concord", enemy: "syndicate" }, () => false);
  assert.match(blocked ?? "", /Island Chain needs a Dock/);
  assert.equal(lobbyBlock({ mapId: "dry", player: "concord", enemy: "concord" }, () => false), null);
  assert.equal(lobbyBlock({ mapId: "coast", player: "concord", enemy: "syndicate" }, () => false), null);
});

test("randomize only returns a legal lobby", () => {
  for (let i = 0; i < 40; i++) {
    const setup = randomSetup(() => ((i * 17 + 3) % 97) / 97);
    assert.equal(lobbyBlock(setup), null);
    assert.ok(LOBBY_MAPS.some((m) => m.id === setup.mapId));
  }
});

test("a new bot slot is Normal, and Normal does not push before 6:00", () => {
  assert.equal(DEFAULT_SETUP.difficulty, "normal");
  assert.deepEqual(DEFAULT_SETUP.skills, ["normal", "normal", "normal"]);
  const stale: SkirmishSetup = {
    ...DEFAULT_SETUP,
    difficulty: "easy",
    skills: ["normal", "easy", "easy"],
  };
  const added = { ...stale, ...chooseOpponents(stale, 2), ...withNewBotSkill(stale, 2) };
  assert.equal(added.skills[0], "normal");
  assert.equal(added.skills[1], "normal");
  assert.equal(added.difficulty, "normal");
  const game = toNewGame(added);
  assert.equal(game.difficulty, "normal");
  assert.deepEqual(game.skills, ["normal", "normal", "easy"]);
  assert.equal(firstPushAt("normal"), NORMAL_PUSH_AT);
  assert.ok(NORMAL_PUSH_AT >= 6 * 60);
  const fresh = parseSetup({ mapId: "coast", player: "concord", enemy: "syndicate", difficulty: "easy" });
  assert.equal(fresh?.difficulty, "easy");
  assert.deepEqual(fresh?.skills, ["easy", "normal", "normal"]);
  const memory = new Map<string, string>();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  localStorage.setItem(
    RULES_KEY,
    JSON.stringify({ mapId: "coast", player: "concord", enemy: "syndicate", difficulty: "easy", skills: ["easy", "easy", "hard"] }),
  );
  const restored = loadSetup();
  assert.equal(restored?.difficulty, "normal");
  assert.deepEqual(restored?.skills, ["normal", "normal", "normal"]);
  assert.deepEqual(normalBotDefaults().skills, ["normal", "normal", "normal"]);
});

test("a war factory card says it needs a refinery before you tap", () => {
  const need = buildNeed("factory", "concord", (kind) => kind === "yard" || kind === "power");
  assert.equal(need, "Needs Refinery");
  assert.equal(buildNeed("factory", "concord", (kind) => kind === "yard" || kind === "power" || kind === "refinery"), "");
  assert.equal(buildNeed("power", "concord", () => false), "Needs Yard");
  assert.equal(buildNeed("gate", "concord", (kind) => kind === "yard"), "Needs wall");
});

test("saved setup remembers both factions", () => {
  const setup = parseSetup({
    mapId: "isles",
    faction: "syndicate",
    enemy: "syndicate",
    credits: 2000,
    ai: "raider",
    fog: false,
    crates: true,
    speed: 1.5,
    mode: "survive",
  });
  assert.ok(setup);
  assert.equal(setup.player, "syndicate");
  assert.equal(setup.enemy, "syndicate");
  assert.equal(setup.fog, false);
  assert.equal(setup.speed, 1.5);
  assert.equal(setup.mode, "survive");
  assert.equal(setup.size, "skirmish");
  assert.equal(setup.opponents, 1);
  assert.equal(setup.teams, "ffa");
  assert.equal(setup.start, "sw");
  assert.equal(setup.shared, true);
  assert.equal(setup.stanceMode, "global");
  assert.equal(setup.walls, true);
  assert.equal(setup.difficulty, "normal");
  assert.equal(setup.showAi, false);
  assert.equal(parseSetup({ mapId: "basin", faction: "concord" }), null);
});

test("saved setup remembers size, opponents, teams, start, and walls", () => {
  const setup = parseSetup({
    mapId: "coast",
    player: "concord",
    enemy: "syndicate",
    size: "large",
    opponents: 3,
    teams: "ffa",
    start: "random",
    walls: false,
    shared: false,
    stanceMode: "seat",
    stances: ["raider", "passive", "builder"],
  });
  assert.ok(setup);
  assert.equal(setup.size, "large");
  assert.equal(setup.opponents, 2);
  assert.equal(setup.teams, "ffa");
  assert.equal(setup.start, "random");
  assert.equal(setup.walls, false);
  assert.equal(setup.shared, false);
  assert.equal(setup.stanceMode, "seat");
  assert.deepEqual(setup.stances, ["raider", "passive", "builder"]);
  assert.equal(buildingOffered("coast", "concord", "sandbag", false), false);
  assert.equal(buildingOffered("coast", "concord", "wall", false), false);
  assert.equal(buildingOffered("coast", "concord", "gate", false), false);
  assert.equal(buildingOffered("coast", "concord", "sandbag", true), true);
  assert.equal(buildingOffered("coast", "syndicate", "tower", false), true);
});

test("teams and start slots stay inside the seat count", () => {
  assert.deepEqual(alliances(1, "ffa"), [0, 1, 2, 3]);
  assert.deepEqual(alliances(3, "ffa"), [0, 1, 2, 3]);
  assert.deepEqual(alliances(3, "tvt"), [0, 1, 0, 1]);
  assert.deepEqual(alliances(2, "tvt"), [0, 1, 2, 3]);
  const corners = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 10, y: 50 },
    { x: 50, y: 50 },
  ];
  const fromSw = orderCorners(corners, "sw", 4, () => 0);
  assert.deepEqual(fromSw[0], { x: 10, y: 50 });
  assert.deepEqual(fromSw[1], { x: 50, y: 10 });
  assert.equal(new Set(fromSw.map((p) => `${p.x},${p.y}`)).size, 4);
  const d1 = (fromSw[1].x - fromSw[0].x) ** 2 + (fromSw[1].y - fromSw[0].y) ** 2;
  const d2 = (fromSw[2].x - fromSw[0].x) ** 2 + (fromSw[2].y - fromSw[0].y) ** 2;
  assert.ok(d1 >= d2);
  const fixed = assignStarts(corners, 2, "nw", () => 0.9);
  assert.deepEqual(fixed[0], { x: 10, y: 10 });
});

test("map size hides opponents it cannot host, and 2v2 seats an ally", () => {
  assert.equal(maxOpponents("skirmish"), 1);
  assert.equal(maxOpponents("large"), 2);
  assert.equal(maxOpponents("warzone"), 3);
  assert.equal(maxOpponents("continent"), 3);
  const skirmish = clampSetup({
    ...parseSetup({ mapId: "coast", player: "concord", enemy: "syndicate", size: "skirmish", opponents: 3, teams: "tvt" })!,
  });
  assert.equal(skirmish.opponents, 1);
  assert.equal(skirmish.teams, "ffa");
  assert.equal(aiCount(skirmish), 1);
  const large = clampSetup({
    ...parseSetup({ mapId: "coast", player: "concord", enemy: "syndicate", size: "large", opponents: 3, teams: "ffa" })!,
  });
  assert.equal(large.opponents, 2);
  assert.equal(aiCount(large), 2);
  const tvt = clampSetup({
    ...parseSetup({ mapId: "river", player: "concord", enemy: "syndicate", size: "large", opponents: 2, teams: "tvt" })!,
  });
  assert.equal(tvt.teams, "tvt");
  assert.equal(aiCount(tvt), 3);
  const zone = clampSetup({
    ...parseSetup({ mapId: "coast", player: "concord", enemy: "syndicate", size: "warzone", opponents: 3, teams: "ffa" })!,
  });
  assert.equal(zone.opponents, 3);
  assert.equal(aiCount(zone), 3);
});

test("picking two or three opponents grows a one-opponent field", () => {
  const two = clampSetup({ ...DEFAULT_SETUP, ...chooseOpponents(DEFAULT_SETUP, 2) });
  assert.equal(two.opponents, 2);
  assert.equal(two.size, "large");
  assert.equal(two.teams, "ffa");
  const three = clampSetup({ ...DEFAULT_SETUP, ...chooseOpponents(DEFAULT_SETUP, 3) });
  assert.equal(three.opponents, 3);
  assert.equal(three.size, "warzone");
  const kept = chooseOpponents({ ...DEFAULT_SETUP, size: "continent" }, 2);
  assert.equal(kept.size, "continent");
  assert.equal(kept.opponents, 2);
  const grass = chooseOpponents({ ...DEFAULT_SETUP, customId: "tpl:grass", size: "warzone" }, 2);
  assert.equal(grass.customId, "");
  assert.equal(grass.opponents, 2);
  const stay = chooseOpponents({ ...DEFAULT_SETUP, size: "warzone", opponents: 3 }, 1);
  assert.equal(stay.opponents, 1);
  assert.equal(stay.size, "warzone");
  assert.equal(stay.teams, "ffa");
  const coop = clampSetup({ ...DEFAULT_SETUP, ...chooseOpponents({ ...DEFAULT_SETUP, teams: "tvt" }, 2) });
  assert.equal(coop.teams, "tvt");
  assert.equal(coop.size, "large");
  assert.equal(coop.opponents, 2);
  assert.equal(aiCount(coop), 3);
  const hop = chooseOpponents({ ...DEFAULT_SETUP, customId: "tpl:hoppers", size: "large" }, 3);
  assert.equal(hop.customId, "tpl:hoppers");
  const held = clampSetup({ ...DEFAULT_SETUP, ...hop });
  assert.equal(held.opponents, 3);
  assert.equal(held.size, "large");
  assert.equal(aiCount(held), 3);
});

test("navy buttons need a finished dock and stay off dry basin", () => {
  for (const id of ["gunboat", "frigate", "missile", "transport"] as const) {
    assert.equal(trainOffered("coast", "concord", id, false), false, id);
    assert.equal(trainOffered("river", "syndicate", id, true), true, id);
    assert.equal(trainOffered("dry", "concord", id, true), false, id);
  }
  assert.equal(trainOffered("coast", "concord", "rifle", false), true);
  assert.equal(trainOffered("isles", "concord", "tank", false), true);
});

test("my maps seat only as many commanders as the template has starts", () => {
  const rows = listMyMaps();
  assert.equal(rows[0]?.id, "feat:twin");
  assert.equal(rows.filter((row) => row.group === "featured").length, 6);
  assert.ok(rows.some((row) => row.id === "tpl:hoppers"));
  assert.ok(rows.length >= 30);
  const hoppers = resolveMyMap("tpl:hoppers");
  const grass = resolveMyMap("tpl:grass");
  const path = resolveMyMap("tpl:path");
  assert.ok(hoppers && grass && path);
  assert.equal(offersNavy(hoppers), true);
  assert.equal(offersNavy(grass), false);
  assert.equal(offersNavy(path), false);
  assert.equal(grass.starts.length, 2);
  assert.equal(shareCode(hoppers).length < 20_000, true);
  const tight = clampSetup({
    ...DEFAULT_SETUP,
    customId: "tpl:grass",
    size: "warzone",
    opponents: 3,
    teams: "tvt",
    mapId: "coast",
  });
  assert.equal(tight.opponents, 1);
  assert.equal(tight.teams, "ffa");
  assert.equal(seatCap(tight), 1);
  assert.equal(aiCount(tight), 1);
  assert.match(lobbyBlock({ ...tight, opponents: 2, teams: "ffa" }) ?? "", /2 starts/);
  const dry = new Sim(toNewGame(tight));
  assert.equal(dry.navy, false);
  assert.equal(dry.mapId, "dry");
  assert.equal(buildingOffered(dry.mapId, "concord", "dock"), false);
  const open = clampSetup({
    ...DEFAULT_SETUP,
    customId: "tpl:hoppers",
    size: "warzone",
    opponents: 3,
    teams: "ffa",
    mapId: "coast",
  });
  assert.equal(open.opponents, 3);
  assert.equal(seatCap(open), 3);
  const naval = new Sim(toNewGame(open));
  assert.equal(naval.navy, true);
  assert.equal(naval.gw, 96);
  assert.equal(buildingOffered(naval.mapId, "concord", "dock"), true);
  assert.equal(resolveMyMap("tpl:nope"), null);
  assert.match(lobbyBlock({ ...DEFAULT_SETUP, customId: "tpl:nope" }) ?? "", /not on this device/);
});

test("four factions keep their colors, rosters, and spare seats", () => {
  assert.deepEqual(FACTIONS, ["concord", "syndicate", "steel", "prism"]);
  const rifle = resolveUnit("rifle", "concord");
  assert.equal(rifle.hp, 118);
  assert.equal(resolveUnit("rifle", "syndicate").hp, 100);
  assert.equal(resolveUnit("rifle", "steel").hp, 118);
  const prismRifle = resolveUnit("rifle", "prism");
  assert.equal(prismRifle.hp, 88);
  assert.equal(prismRifle.damage, 13);
  const concordTank = resolveUnit("tank", "concord");
  const steelTank = resolveUnit("tank", "steel");
  const syndicateTank = resolveUnit("tank", "syndicate");
  const prismTank = resolveUnit("tank", "prism");
  assert.ok(steelTank.hp > concordTank.hp);
  assert.ok(steelTank.speed < concordTank.speed);
  assert.ok(syndicateTank.speed > concordTank.speed);
  assert.ok(prismTank.damage > syndicateTank.damage);
  assert.ok(prismTank.hp < syndicateTank.hp);
  assert.equal(resolveUnit("scout", "syndicate").stealth, true);
  assert.equal(resolveUnit("scout", "syndicate").name, "Shade Buggy");
  assert.equal(resolveUnit("scout", "prism").stealth, false);
  assert.equal(resolveUnit("scout", "prism").name, "Scout Buggy");
  assert.equal(canTrain("vanguard", "steel"), true);
  assert.equal(canTrain("vanguard", "prism"), false);
  assert.equal(canTrain("razor", "prism"), true);
  assert.equal(canTrain("razor", "concord"), false);
  assert.equal(canBuild("aa", "steel"), true);
  assert.equal(canBuild("aa", "prism"), false);
  assert.equal(canBuild("radar", "prism"), true);
  assert.equal(canBuild("stealth", "concord"), false);
  assert.equal(resolveBuilding("power", "concord").powerOut, 100);
  assert.equal(resolveBuilding("power", "syndicate").powerOut, 85);
  assert.equal(resolveBuilding("power", "steel").powerOut, 115);
  assert.equal(resolveBuilding("power", "prism").powerOut, 80);
  assert.ok(resolveBuilding("wall", "steel").hp > resolveBuilding("wall", "concord").hp);
  assert.equal(spareFaction("concord", "syndicate", 0), "steel");
  assert.equal(spareFaction("concord", "syndicate", 1), "prism");
  assert.equal(spareFaction("steel", "prism", 0), "concord");
  assert.equal(spareFaction("concord", "concord", 0), "syndicate");
  const parsed = parseSetup({ ...DEFAULT_SETUP, player: "prism", enemy: "steel" });
  assert.equal(parsed?.player, "prism");
  assert.equal(parsed?.enemy, "steel");
  const sim = new Sim({ mapId: "basin", faction: "concord", enemy: "syndicate", mode: "destroy", fog: false });
  assert.equal(sim.factionOf(0), "concord");
  assert.equal(sim.factionOf(1), "syndicate");
  assert.equal(sim.factionOf(2), "steel");
  assert.equal(sim.factionOf(3), "prism");
  assert.equal(sim.seatColor(0), "#2F7DF6");
  assert.equal(sim.seatColor(1), "#E5483B");
  assert.equal(sim.seatColor(2), "#F27A30");
  assert.equal(sim.seatColor(3), "#3FBF5A");
  const teams = new Sim({ mapId: "basin", faction: "concord", enemy: "syndicate", opponents: 3, teams: "tvt", mode: "destroy", fog: false });
  assert.equal(teams.seatColor(0), "#2F7DF6");
  assert.equal(teams.seatColor(2), "#3FBF5A");
  assert.equal(teams.seatColor(1), "#E5483B");
  assert.equal(teams.seatColor(3), "#F27A30");
});
