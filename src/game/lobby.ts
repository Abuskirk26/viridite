/** Skirmish lobby rules. Invalid setups are refused here, never by a thrown error. */

import {
  FACTION_NAME,
  UNITS,
  canBuild,
  canTrain,
  isFactionId,
  normalizeDifficulty,
  normalizeSize,
  normalizeStart,
  normalizeTeams,
  otherFaction,
  spareFaction,
  BUILD_ORDER,
  type AiDifficulty,
  type AiProfile,
  type BuildingId,
  type CornerId,
  type FactionId,
  type MapId,
  type MapSizeId,
  type ModeId,
  type StartPos,
  type TeamMode,
  type UnitId,
} from "./data.ts";
import { listMaps, loadMap, pack, shareCode } from "./custom.ts";
import { cloneDoc, lobbySize, offersNavy, type EditorDoc } from "./editor.ts";
import { FEATURED, buildFeatured, type FeaturedCard } from "./featured.ts";
import { DEFAULT_YEAR, buildingInYear, clampYear, unitInYear } from "./eras.ts";
import type { NetRules } from "./relay-room.ts";
import { TEMPLATES, buildTemplate } from "./templates.ts";

export const RULES_KEY = "viridite-skirmish-rules";
const PLACE_GRID_KEY = "viridite-place-grid";

/** Build-range squares. Off unless the player turns the guide on. */
export function placeGridOn(): boolean {
  try {
    return localStorage.getItem(PLACE_GRID_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPlaceGrid(on: boolean) {
  try {
    localStorage.setItem(PLACE_GRID_KEY, on ? "1" : "0");
  } catch {
    /* private mode still plays */
  }
}

export const LOBBY_MAPS: { id: MapId; short: string }[] = [
  { id: "palm", short: "Palm" },
  { id: "michigan", short: "Michigan" },
  { id: "plates", short: "Plates" },
  { id: "links", short: "Links" },
  { id: "coast", short: "Coast" },
  { id: "river", short: "River" },
  { id: "isles", short: "Isles" },
  { id: "dry", short: "Dry" },
];

export const FACTIONS: FactionId[] = ["concord", "syndicate", "steel", "prism"];
export const CREDIT_CHOICES = [2000, 5000, 10000] as const;
export const SPEED_CHOICES = [0.75, 1, 1.5, 2] as const;
export const AI_CHOICES: AiProfile[] = ["passive", "raider", "builder"];
export const DIFFICULTY_CHOICES: AiDifficulty[] = ["easy", "normal", "hard"];
export const SIZE_CHOICES: MapSizeId[] = ["skirmish", "large", "warzone", "continent"];
export const OPPONENT_CHOICES = [1, 2, 3] as const;
export const TEAM_CHOICES: TeamMode[] = ["ffa", "tvt"];
export const START_CHOICES: StartPos[] = ["nw", "ne", "sw", "se", "random"];
export const CORNER_ORDER: CornerId[] = ["nw", "ne", "sw", "se"];

export type CreditChoice = (typeof CREDIT_CHOICES)[number];
export type SpeedChoice = (typeof SPEED_CHOICES)[number];
export type OpponentCount = (typeof OPPONENT_CHOICES)[number];
export type StanceMode = "global" | "seat";

export const SIZE_LABEL: Record<MapSizeId, string> = {
  skirmish: "Skirmish",
  large: "Large",
  warzone: "Warzone",
  continent: "Continent",
};
export const TEAM_LABEL: Record<TeamMode, string> = {
  ffa: "Versus",
  tvt: "Co-op",
};
export const START_LABEL: Record<StartPos, string> = {
  nw: "NW",
  ne: "NE",
  sw: "SW",
  se: "SE",
  random: "Random",
};

/** Hostile commanders the size can host. 2v2 on Large still adds an ally on top of two enemies. */
export function maxOpponents(size: MapSizeId): OpponentCount {
  if (size === "warzone" || size === "continent") return 3;
  if (size === "large") return 2;
  return 1;
}

const templateDocs = new Map<string, EditorDoc>();
const featuredDocs = new Map<string, EditorDoc>();

/** Templates use `tpl:` and the teaching pack uses `feat:`. The doc is cached and must not be stamped. */
export function resolveMyMap(id: string): EditorDoc | null {
  if (!id) return null;
  if (id.startsWith("feat:")) {
    const key = id.slice(5);
    if (!FEATURED.some((card) => card.id === key)) return null;
    let doc = featuredDocs.get(key);
    if (!doc) {
      doc = buildFeatured(key);
      doc.id = id;
      featuredDocs.set(key, doc);
    }
    return doc;
  }
  if (id.startsWith("tpl:")) {
    const key = id.slice(4);
    if (!TEMPLATES.some((card) => card.id === key)) return null;
    let doc = templateDocs.get(key);
    if (!doc) {
      doc = buildTemplate(key);
      doc.id = id;
      templateDocs.set(key, doc);
    }
    return doc;
  }
  return loadMap(id);
}

export interface MyMapRow {
  id: string;
  name: string;
  w: number;
  h: number;
  starts: number;
  size: MapSizeId;
  deep: boolean;
  group: "featured" | "classic" | "saved";
  line?: string;
  credits?: CreditChoice;
  fog?: boolean;
  walls?: boolean;
}

function rowFrom(doc: EditorDoc, id: string, group: MyMapRow["group"], card?: FeaturedCard): MyMapRow {
  return {
    id,
    name: doc.name,
    w: doc.w,
    h: doc.h,
    starts: doc.starts.length,
    size: lobbySize(doc),
    deep: offersNavy(doc),
    group,
    line: card?.line,
    credits: card?.credits,
    fog: card?.fog,
    walls: card?.walls,
  };
}

/** Teaching pack first, then classic layouts, then maps saved on this device. */
export function listMyMaps(): MyMapRow[] {
  const rows: MyMapRow[] = [];
  for (const card of FEATURED) {
    const doc = resolveMyMap(`feat:${card.id}`);
    if (doc) rows.push(rowFrom(doc, `feat:${card.id}`, "featured", card));
  }
  for (const card of TEMPLATES) {
    const doc = resolveMyMap(`tpl:${card.id}`);
    if (doc) rows.push(rowFrom(doc, `tpl:${card.id}`, "classic"));
  }
  for (const map of listMaps()) {
    const doc = loadMap(map.id);
    if (doc) rows.push(rowFrom(doc, map.id, "saved"));
  }
  return rows;
}

/** A featured map opened for paint. Id is cleared so Save stores a new map. */
export function duplicateMap(id: string): EditorDoc | null {
  const src = resolveMyMap(id);
  if (!src) return null;
  const next = cloneDoc(src);
  next.id = "";
  return next;
}

/** Opponents the setup can actually seat. A two-start map caps at one. Extra starts beat the size bucket. */
export function seatCap(setup: Pick<SkirmishSetup, "size" | "customId">): OpponentCount {
  const doc = setup.customId ? resolveMyMap(setup.customId) : null;
  if (doc && doc.starts.length >= 2) return Math.min(3, doc.starts.length - 1) as OpponentCount;
  return maxOpponents(setup.size);
}

export interface SkirmishSetup {
  mapId: MapId;
  player: FactionId;
  enemy: FactionId;
  credits: CreditChoice;
  ai: AiProfile;
  /** Easy is slower and smaller. Hard scouts sooner and focus-fires. */
  difficulty: AiDifficulty;
  /** Host-only debug labels. Does not change the sim. */
  showAi: boolean;
  fog: boolean;
  crates: boolean;
  speed: SpeedChoice;
  mode: ModeId;
  size: MapSizeId;
  /** Hostile count. 2v2 ignores this and fields two enemies plus one ally. */
  opponents: OpponentCount;
  teams: TeamMode;
  start: StartPos;
  /** Allies see what you see. Free-for-all has no allies. */
  shared: boolean;
  stanceMode: StanceMode;
  /** North, East, South. Used when stanceMode is "seat". */
  stances: [AiProfile, AiProfile, AiProfile];
  /** On: sandbags and concrete are buildable. Off: both leave the bar for every seat. */
  walls: boolean;
  /** Saved editor map. Empty means a built-in field. */
  customId: string;
  /** North, East, South. Seat color and faction. Index 0 is the enemy. */
  bots: [FactionId, FactionId, FactionId];
  /** Easy, normal, or hard for each bot. Index 0 is the first enemy. */
  skills: [AiDifficulty, AiDifficulty, AiDifficulty];
  /** Match clock in minutes. 0 is unlimited. */
  limit: LimitChoice;
  /** Era stop. The bar offers pieces from this year and earlier. */
  year: number;
}

/** Minutes on the match clock. 0 means unlimited: the fight ends only when a side is gone. */
export const LIMIT_CHOICES = [20, 40, 60, 0] as const;
export type LimitChoice = (typeof LIMIT_CHOICES)[number];

export function isLimit(n: unknown): n is LimitChoice {
  return n === 20 || n === 40 || n === 60 || n === 0;
}

/** Seconds the sim should run. 0 is no clock. */
export function limitSeconds(min: number): number {
  if (!isLimit(min) || min <= 0) return 0;
  return min * 60;
}

export const DEFAULT_SETUP: SkirmishSetup = {
  mapId: "coast",
  player: "concord",
  enemy: "syndicate",
  credits: 5000,
  ai: "builder",
  difficulty: "normal",
  showAi: false,
  fog: true,
  crates: true,
  speed: 1,
  mode: "destroy",
  size: "skirmish",
  opponents: 1,
  teams: "ffa",
  start: "sw",
  shared: true,
  stanceMode: "global",
  stances: ["builder", "builder", "builder"],
  walls: true,
  customId: "",
  bots: ["syndicate", "steel", "prism"],
  skills: ["normal", "normal", "normal"],
  limit: 60,
  year: DEFAULT_YEAR,
};

/** The friends room should open on the skirmish the host already set. */
export function netRulesFromSetup(setup: SkirmishSetup): { rules: Partial<NetRules>; chart: string; commanders: 2 | 3 | 4 } {
  const doc = setup.customId ? resolveMyMap(setup.customId) : null;
  const teams = setup.teams === "tvt" && (!doc || doc.starts.length >= 4) ? "tvt" : "ffa";
  let commanders = teams === "tvt" ? 4 : Math.min(4, setup.opponents + 1);
  if (doc && doc.starts.length >= 2) commanders = Math.min(commanders, doc.starts.length);
  if (commanders < 2) commanders = 2;
  return {
    rules: {
      mapId: setup.mapId,
      size: setup.size,
      credits: setup.credits,
      fog: setup.fog,
      walls: setup.walls,
      teams,
      player: setup.player,
      enemy: setup.enemy,
      difficulty: setup.difficulty,
      limit: setup.limit,
      year: clampYear(setup.year),
      customId: doc ? setup.customId : "",
      customName: doc ? doc.name.slice(0, 32) : "",
      customStarts: doc ? doc.starts.length : 0,
    },
    chart: doc ? shareCode(doc) : "",
    commanders: commanders as 2 | 3 | 4,
  };
}

/** AI commanders actually seated. 2v2 is always you + ally vs two. A map's starts win over its size label. */
export function aiCount(setup: Pick<SkirmishSetup, "teams" | "opponents" | "size"> & { customId?: string }): OpponentCount {
  const doc = setup.customId ? resolveMyMap(setup.customId) : null;
  if (setup.teams === "tvt" && (doc ? doc.starts.length >= 4 : setup.size !== "skirmish")) return 3;
  if (doc && doc.starts.length >= 2) {
    const startCap = Math.min(3, doc.starts.length - 1) as OpponentCount;
    return (setup.opponents > startCap ? startCap : setup.opponents) as OpponentCount;
  }
  const cap = maxOpponents(setup.size);
  return (setup.opponents > cap ? cap : setup.opponents) as OpponentCount;
}

/** Dry Basin is a land fight. Dock and boats are not offered. */
export function navyHidden(mapId: MapId): boolean {
  return mapId === "dry";
}

/** Island Chain is unwinnable without a harbor. Both sides must be able to build a Dock. */
export function dockRequired(mapId: MapId): boolean {
  return mapId === "isles";
}

export function factionCanDock(faction: FactionId): boolean {
  return canBuild("dock", faction);
}

export function lobbyBlock(
  setup: Pick<SkirmishSetup, "mapId" | "player" | "enemy"> & Partial<Pick<SkirmishSetup, "customId" | "teams" | "opponents">>,
  canDock: (faction: FactionId) => boolean = factionCanDock,
): string | null {
  if (setup.customId) {
    const doc = resolveMyMap(setup.customId);
    if (!doc) return "That saved map is not on this device.";
    const seats = setup.teams === "tvt" ? 4 : (setup.opponents === 2 || setup.opponents === 3 ? setup.opponents : 1) + 1;
    if (seats > doc.starts.length) return `This map has ${doc.starts.length} starts.`;
    return null;
  }
  if (!dockRequired(setup.mapId)) return null;
  const stuck: string[] = [];
  if (!canDock(setup.player)) stuck.push(`You (${FACTION_NAME[setup.player]})`);
  if (!canDock(setup.enemy)) stuck.push(`Enemy (${FACTION_NAME[setup.enemy]})`);
  if (!stuck.length) return null;
  return `Island Chain needs a Dock. ${stuck.join(" and ")} can't build one.`;
}

export function buildingOffered(mapId: MapId, faction: FactionId, id: BuildingId, walls = true, year = DEFAULT_YEAR): boolean {
  if (id === "span" || id === "silo") return false;
  if (!buildingInYear(id, year)) return false;
  if (!walls && (id === "sandbag" || id === "wall" || id === "gate")) return false;
  if (!canBuild(id, faction)) return false;
  if (id === "dock" && navyHidden(mapId)) return false;
  return true;
}

export function unitOffered(mapId: MapId, faction: FactionId, id: UnitId, year = DEFAULT_YEAR): boolean {
  if (!unitInYear(id, year)) return false;
  if (!canTrain(id, faction)) return false;
  const def = UNITS[id];
  if (navyHidden(mapId) && (def.loco === "sea" || def.trainedAt === "dock")) return false;
  return true;
}

/** Boat buttons exist only once a Dock is finished. */
export function trainOffered(mapId: MapId, faction: FactionId, id: UnitId, hasDock: boolean, year = DEFAULT_YEAR): boolean {
  if (!unitOffered(mapId, faction, id, year)) return false;
  if (UNITS[id].trainedAt === "dock" && !hasDock) return false;
  return true;
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

/** Seat 0 is the player. 2v2: you and East versus North and South. FFA: nobody shares a side. */
export function alliances(opponents: OpponentCount, mode: TeamMode): number[] {
  const a = [0, 1, 2, 3];
  if (mode === "tvt" && opponents >= 3) return [0, 1, 0, 1];
  return a;
}

/** Player takes the chosen corner. Remaining corners fill farthest-first. `corners` is NW, NE, SW, SE. */
export function orderCorners<T extends { x: number; y: number }>(
  corners: T[],
  pick: StartPos,
  seats: number,
  rng: () => number,
): T[] {
  const list = corners.slice(0, 4);
  while (list.length < 4) list.push(list[list.length - 1] ?? corners[0]!);
  let playerIndex = CORNER_ORDER.indexOf(pick as CornerId);
  if (playerIndex < 0) playerIndex = Math.min(3, Math.floor(rng() * 4));
  const player = list[playerIndex]!;
  const rest = list.filter((_, i) => i !== playerIndex);
  rest.sort((a, b) => {
    const da = (a.x - player.x) ** 2 + (a.y - player.y) ** 2;
    const db = (b.x - player.x) ** 2 + (b.y - player.y) ** 2;
    return db - da;
  });
  return [player, ...rest].slice(0, Math.max(1, Math.min(4, seats)));
}

export function assignStarts<T extends { x: number; y: number }>(
  sites: T[],
  seats: number,
  mode: StartPos,
  rng: () => number,
): T[] {
  return orderCorners(sites, mode, seats, rng);
}

function stanceOf(v: unknown, fallback: AiProfile): AiProfile {
  return v === "passive" || v === "raider" || v === "builder" ? v : fallback;
}

/** Newly opened bot slots are Normal. Slots already on screen keep the skill the player set. */
export function withNewBotSkill(setup: SkirmishSetup, next: OpponentCount): Pick<SkirmishSetup, "skills" | "difficulty"> {
  const prev = aiCount(setup);
  const skills = setup.skills.slice() as SkirmishSetup["skills"];
  if (prev < 1 && next >= 1) skills[0] = "normal";
  if (prev < 2 && next >= 2) skills[1] = "normal";
  if (prev < 3 && next >= 3) skills[2] = "normal";
  return { skills, difficulty: skills[0] };
}

/** Every bot slot opens on Normal. The last pick is not the next default. */
export function normalBotDefaults(): Pick<SkirmishSetup, "difficulty" | "skills"> {
  return { difficulty: "normal", skills: ["normal", "normal", "normal"] };
}

/** Loud if the three skirmish defaults drift. Lives next to DEFAULT_SETUP and BUILD_ORDER. */
export function warnSkirmishDefaults(): void {
  if (DEFAULT_SETUP.difficulty !== "normal" || DEFAULT_SETUP.skills.some((s) => s !== "normal")) {
    console.warn("VIRIDITE: bot default is not Normal. It lives in lobby.ts DEFAULT_SETUP.skills.");
  }
  if ((BUILD_ORDER as readonly string[]).includes("silo")) {
    console.warn("VIRIDITE: Silo is on the build list (data.ts BUILD_ORDER). Skirmish credits are not capped in sim.ts haul().");
  }
}
export function applyDifficulty(setup: SkirmishSetup, difficulty: AiDifficulty): Partial<SkirmishSetup> {
  const skills: SkirmishSetup["skills"] = [difficulty, difficulty, difficulty];
  if (difficulty === "hard") return { difficulty, skills };
  const ai: AiProfile = setup.ai === "raider" ? "builder" : setup.ai;
  const stances: SkirmishSetup["stances"] = [
    setup.stances[0] === "raider" ? "builder" : setup.stances[0],
    setup.stances[1] === "raider" ? "builder" : setup.stances[1],
    setup.stances[2] === "raider" ? "builder" : setup.stances[2],
  ];
  return { difficulty, skills, ai, stances };
}

/** Drops opponent counts the map cannot host, and keeps 2v2 as you + ally vs two. */
export function clampSetup(setup: SkirmishSetup): SkirmishSetup {
  const doc = setup.customId ? resolveMyMap(setup.customId) : null;
  const size = setup.size;
  const cap = seatCap(setup);
  let teams: TeamMode = (doc ? doc.starts.length < 4 : size === "skirmish") ? "ffa" : setup.teams;
  let opponents = setup.opponents > cap ? cap : setup.opponents;
  if (teams === "tvt") opponents = 2;
  if (opponents > cap) opponents = cap;
  if (opponents < 2) teams = "ffa";
  return { ...setup, size, opponents, teams };
}

const SIZE_RANK: Record<MapSizeId, number> = {
  skirmish: 0,
  large: 1,
  warzone: 2,
  continent: 3,
};

/** Smallest generated field that can seat this many hostile commanders. */
export function growSize(size: MapSizeId, opponents: OpponentCount): MapSizeId {
  const need: MapSizeId = opponents >= 3 ? "warzone" : opponents >= 2 ? "large" : size;
  return SIZE_RANK[size] < SIZE_RANK[need] ? need : size;
}

/**
 * Opponent buttons always offer 1, 2, and 3. A Skirmish cannot hold the extra
 * commanders, so the field grows instead of ignoring the tap. A saved map with
 * too few starts steps aside for a generated field that can.
 */
export function chooseOpponents(
  setup: SkirmishSetup,
  n: OpponentCount,
): Pick<SkirmishSetup, "opponents" | "teams" | "size" | "customId"> {
  const teams: TeamMode = n === 2 && setup.teams === "tvt" ? "tvt" : "ffa";
  const seats = teams === "tvt" ? 4 : n + 1;
  const doc = setup.customId ? resolveMyMap(setup.customId) : null;
  const fits = !!doc && doc.starts.length >= seats;
  const size = fits ? setup.size : growSize(setup.size, teams === "tvt" ? 2 : n);
  return { opponents: teams === "tvt" ? 2 : n, teams, size, customId: fits ? setup.customId : "" };
}

/** Rolls until the combo is legal. Falls back to the default coast match. */
export function randomSetup(rng: () => number = Math.random): SkirmishSetup {
  for (let i = 0; i < 24; i++) {
    const enemy = pick(rng, FACTIONS);
    const difficulty = pick(rng, DIFFICULTY_CHOICES);
    const ai: AiProfile = difficulty === "hard" ? pick(rng, AI_CHOICES) : "builder";
    const setup: SkirmishSetup = {
      mapId: pick(rng, LOBBY_MAPS).id,
      player: pick(rng, FACTIONS),
      enemy,
      credits: pick(rng, CREDIT_CHOICES),
      ai,
      difficulty,
      showAi: false,
      fog: rng() > 0.3,
      crates: rng() > 0.45,
      speed: pick(rng, SPEED_CHOICES),
      mode: rng() > 0.5 ? "survive" : "destroy",
      size: pick(rng, SIZE_CHOICES),
      opponents: pick(rng, OPPONENT_CHOICES),
      teams: pick(rng, TEAM_CHOICES),
      start: pick(rng, START_CHOICES),
      shared: rng() > 0.35,
      stanceMode: rng() > 0.5 ? "seat" : "global",
      stances: difficulty === "hard" ? [pick(rng, AI_CHOICES), pick(rng, AI_CHOICES), pick(rng, AI_CHOICES)] : ["builder", "builder", "builder"],
      walls: rng() > 0.25,
      customId: "",
      bots: [enemy, pick(rng, FACTIONS), pick(rng, FACTIONS)],
      skills: [difficulty, difficulty, difficulty],
      limit: 60,
      year: DEFAULT_YEAR,
    };
    if (!lobbyBlock(setup)) return clampSetup(setup);
  }
  return { ...DEFAULT_SETUP };
}

function botTriple(raw: unknown, player: FactionId, enemy: FactionId): [FactionId, FactionId, FactionId] {
  if (Array.isArray(raw) && raw.length >= 3 && isFaction(raw[0]) && isFaction(raw[1]) && isFaction(raw[2])) {
    return [raw[0], raw[1], raw[2]];
  }
  return [enemy, spareFaction(player, enemy, 0), spareFaction(player, enemy, 1)];
}

function isCredit(n: unknown): n is CreditChoice {
  return n === 2000 || n === 5000 || n === 10000;
}

function isSpeed(n: unknown): n is SpeedChoice {
  return n === 0.75 || n === 1 || n === 1.5 || n === 2;
}

function isFaction(v: unknown): v is FactionId {
  return isFactionId(v);
}

function isLobbyMap(v: unknown): v is MapId {
  return typeof v === "string" && LOBBY_MAPS.some((m) => m.id === v);
}

export function parseSetup(raw: unknown): SkirmishSetup | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as {
    mapId?: unknown;
    player?: unknown;
    faction?: unknown;
    enemy?: unknown;
    credits?: unknown;
    ai?: unknown;
    difficulty?: unknown;
    showAi?: unknown;
    fog?: unknown;
    crates?: unknown;
    speed?: unknown;
    mode?: unknown;
    size?: unknown;
    opponents?: unknown;
    teams?: unknown;
    start?: unknown;
    shared?: unknown;
    stanceMode?: unknown;
    stances?: unknown;
    walls?: unknown;
    customId?: unknown;
    bots?: unknown;
    skills?: unknown;
    limit?: unknown;
    year?: unknown;
  };
  if (!isLobbyMap(data.mapId)) return null;
  const player = isFaction(data.player) ? data.player : isFaction(data.faction) ? data.faction : null;
  if (!player) return null;
  const enemy = isFaction(data.enemy) ? data.enemy : otherFaction(player);
  const ai: AiProfile = data.ai === "passive" || data.ai === "raider" ? data.ai : "builder";
  const size = normalizeSize(data.size);
  const opponents: OpponentCount = data.opponents === 2 || data.opponents === 3 ? data.opponents : 1;
  const teams = normalizeTeams(data.teams);
  const start = normalizeStart(data.start);
  const rawStances = Array.isArray(data.stances) ? data.stances : [];
  const stances: [AiProfile, AiProfile, AiProfile] = [
    stanceOf(rawStances[0], ai),
    stanceOf(rawStances[1], ai),
    stanceOf(rawStances[2], ai),
  ];
  const rawSkills = Array.isArray(data.skills) ? data.skills : [];
  const named = rawSkills.length > 0;
  const base = named ? normalizeDifficulty(rawSkills[0] ?? "normal") : normalizeDifficulty(data.difficulty);
  const skills: [AiDifficulty, AiDifficulty, AiDifficulty] = [
    base,
    named ? normalizeDifficulty(rawSkills[1] ?? "normal") : "normal",
    named ? normalizeDifficulty(rawSkills[2] ?? "normal") : "normal",
  ];
  return clampSetup({
    mapId: data.mapId,
    player,
    enemy,
    credits: isCredit(data.credits) ? data.credits : 5000,
    ai,
    difficulty: base,
    showAi: data.showAi === true,
    fog: data.fog !== false,
    crates: !!data.crates,
    speed: isSpeed(data.speed) ? data.speed : 1,
    mode: data.mode === "survive" ? "survive" : "destroy",
    size,
    opponents,
    teams,
    start,
    shared: data.shared !== false,
    stanceMode: data.stanceMode === "seat" ? "seat" : "global",
    stances,
    walls: data.walls !== false,
    customId: typeof data.customId === "string" ? data.customId : "",
    bots: botTriple(data.bots, player, enemy),
    skills,
    limit: isLimit(data.limit) ? data.limit : 60,
    year: clampYear(data.year),
  });
}

export function loadSetup(): SkirmishSetup | null {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return null;
    const parsed = parseSetup(JSON.parse(raw));
    if (!parsed) return null;
    warnSkirmishDefaults();
    return { ...parsed, ...normalBotDefaults() };
  } catch {
    return null;
  }
}

export function saveSetup(setup: SkirmishSetup) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify({ ...setup, faction: setup.player, ...normalBotDefaults() }));
  } catch {
    /* private mode — the next match still starts */
  }
}

export function toNewGame(setup: SkirmishSetup) {
  const doc = setup.customId ? resolveMyMap(setup.customId) : null;
  const seated = clampSetup(setup);
  const teams = doc && doc.starts.length < 4 ? "ffa" : seated.teams;
  const startCap = doc ? Math.max(1, doc.starts.length - 1) : aiCount({ ...seated, teams });
  const opponents = Math.min(aiCount({ ...seated, teams }), startCap) as OpponentCount;
  return {
    mapId: setup.mapId,
    faction: setup.player,
    enemy: setup.bots[0],
    mode: setup.mode,
    credits: setup.credits,
    ai: setup.ai,
    difficulty: normalizeDifficulty(setup.skills?.[0] ?? "normal"),
    fog: setup.fog,
    crates: setup.crates,
    mapSize: doc ? lobbySize(doc) : setup.size,
    opponents,
    teams,
    start: setup.start,
    walls: setup.walls,
    shared: setup.shared,
    stanceEach: setup.stanceMode === "seat",
    stances: setup.stances,
    skills: [
      normalizeDifficulty(setup.skills?.[0] ?? "normal"),
      normalizeDifficulty(setup.skills?.[1] ?? "normal"),
      normalizeDifficulty(setup.skills?.[2] ?? "normal"),
    ],
    custom: doc ? pack(doc) : undefined,
    seatFactions: [setup.player, setup.bots[0], setup.bots[1], setup.bots[2]],
    limit: limitSeconds(setup.limit),
    year: clampYear(setup.year),
  };
}
