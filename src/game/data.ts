/** Single source of truth for VIRIDITE unit and building stats. */

export type FactionId = "concord" | "syndicate" | "steel" | "prism";
export type Team = 0 | 1 | 2 | 3;
export type MapSizeId = "skirmish" | "large" | "warzone" | "continent";
export type TeamMode = "ffa" | "tvt";
export type CornerId = "nw" | "ne" | "sw" | "se";
export type StartPos = CornerId | "random";
export type MapId =
  | "coast"
  | "river"
  | "isles"
  | "dry"
  | "namib"
  | "atacama"
  | "whitesands"
  | "lencois"
  | "iceland"
  | "pilbara"
  | "basin"
  | "ridge"
  | "oasis"
  | "michigan"
  | "plates"
  | "links"
  | "palm";
export type ModeId = "destroy" | "survive";
export type AiProfile = "passive" | "raider" | "builder";
export type AiDifficulty = "easy" | "normal" | "hard";
/** What the skirmish brain is doing. Shown only when the host turns on AI intent. */
export type AiIntent = "idle" | "scout" | "attack" | "expand" | "defend";
export type Loco = "land" | "sea" | "air" | "amphib";
export type TrainAt = "barracks" | "factory" | "dock" | "helipad";

export type UnitId =
  | "rifle"
  | "rocket"
  | "scout"
  | "tank"
  | "harvester"
  | "vanguard"
  | "razor"
  | "mcv"
  | "engineer"
  | "medium"
  | "artillery"
  | "apc"
  | "gunboat"
  | "frigate"
  | "missile"
  | "transport"
  | "chinook"
  | "attackheli"
  | "bomber"
  | "marksman"
  | "wader"
  | "scatter";

export type BuildingId =
  | "yard"
  | "power"
  | "refinery"
  | "barracks"
  | "factory"
  | "tower"
  | "silo"
  | "supply"
  | "dock"
  | "helipad"
  | "aa"
  | "radar"
  | "sandbag"
  | "wall"
  | "gate"
  | "advpower"
  | "stealth"
  | "span";

export type Armor = "infantry" | "vehicle" | "light" | "heavy" | "building";
export type ShotKind = "hit" | "shell" | "rocket";
/** What a weapon cares about. Infantry and buggies are light. A light tank is medium. A medium tank is heavy. */
export type Plate = "light" | "medium" | "heavy" | "building";

export function plateOf(kind: string, armor: Armor): Plate {
  if (armor === "infantry") return "light";
  if (armor === "heavy") return "heavy";
  if (armor === "light") return "light";
  if (kind === "scout" || kind === "razor") return "light";
  if (kind === "tank" || kind === "scatter" || kind === "harvester" || kind === "mcv") return "medium";
  if (armor === "vehicle") return "medium";
  return "medium";
}

/**
 * Extra multiplier on top of vsInf / vsVeh / vsBld.
 * Rifles chew light armor and bounce off heavy. Rockets want vehicles and buildings.
 * Artillery and bombers are the building breakers.
 */
export function counterMul(kind: string, plate: Plate): number {
  const rifle =
    kind === "rifle" ||
    kind === "marksman" ||
    kind === "wader" ||
    kind === "vanguard" ||
    kind === "scout" ||
    kind === "apc" ||
    kind === "gunboat";
  const rocket = kind === "rocket" || kind === "missile" || kind === "attackheli";
  const siege = kind === "artillery" || kind === "bomber";
  if (plate === "building") {
    if (siege) return 1.7;
    if (rocket) return 1.45;
    if (rifle) return 0.42;
    return 1;
  }
  if (rifle) {
    if (plate === "light") return 1.22;
    if (plate === "medium") return 0.58;
    return 0.28;
  }
  if (rocket) {
    if (plate === "light") return 0.78;
    if (plate === "medium") return 1.38;
    return 1.55;
  }
  if (siege) {
    if (plate === "heavy") return 0.7;
    if (plate === "medium") return 0.88;
    return 1.05;
  }
  if (plate === "heavy") return 1.18;
  if (plate === "medium") return 1.06;
  return 1;
}

export interface UnitDef {
  id: UnitId;
  name: string;
  short: string;
  /** Where it is trained. null = not trainable (should not happen). */
  trainedAt: TrainAt;
  factions: "both" | FactionId;
  cost: number;
  time: number;
  hp: number;
  speed: number;
  sight: number;
  damage: number;
  range: number;
  /** Closest this weapon can fire. Artillery only. */
  minRange?: number;
  rof: number;
  radius: number;
  armor: Armor;
  cargo: number;
  shot: ShotKind;
  vsInf: number;
  vsVeh: number;
  vsBld: number;
  stealth: boolean;
  /** Defaults to land. */
  loco?: Loco;
  /** Can damage aircraft. */
  hitsAir?: boolean;
  /** Shots before this aircraft must land. Omit for ground weapons. */
  magazine?: number;
  /** Seconds spent on a helipad after returning. */
  rearmFor?: number;
  /** Damage multiplier against aircraft. 0 cannot hurt air. */
  vsAir?: number;
  capInf?: number;
  capLight?: number;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  short: string;
  cost: number;
  time: number;
  hp: number;
  w: number;
  h: number;
  powerUse: number;
  /** Concord output. Other factions — see `resolveBuilding`. */
  powerOut: number;
  sight: number;
  damage: number;
  range: number;
  rof: number;
  vsInf: number;
  vsVeh: number;
  vsBld: number;
  storage: number;
  trains: "infantry" | "vehicle" | "navy" | "air" | null;
  requires?: BuildingId | null;
  /** Must sit entirely on shore. */
  shore?: boolean;
  /** Omit or "both" for shared structures. */
  only?: "both" | FactionId;
  special?: "aa" | "radar" | "stealth" | null;
  /** Damage multiplier against aircraft. AA only. */
  vsAir?: number;
}

export const MAP_W = 64;
export const MAP_H = 64;
/** Authored fields are 64. Larger sizes are resampled from that grid. */
export const MAP_SIZE: Record<MapSizeId, number> = { skirmish: 64, large: 96, warzone: 128, continent: 192 };
/**
 * Path grids are allocated once at this side. 192² is the phone ceiling:
 * fog, forests, and army pathfinding still hold a frame. 256² starts to hitch
 * when a full group paths across the whole field.
 */
export const MAP_MAX = 192;
export const TICK = 0.1;
export const START_CREDITS = 3500;
export const START_STORAGE = 5000;
/** Credits per second from a completed Supply Center while the base has power. */
export const SUPPLY_DRIP = 8;
/** Credits per second from a powered Construction Yard. */
export const YARD_DRIP = 2;
/** Credits per second from a completed Silo. A bonus only — never a storage cap. */
export const SILO_DRIP = 3;
/** Starting command points. Each yard upgrade adds CP_STEP, up to CP_MAX times. */
export const CP_BASE = 22;
export const CP_STEP = 8;
export const CP_MAX = 3;
/** Heavy field haul lands on the center at this match time. */
export const HAUL_AT = 210;
/** Crystal pulled per second while a harvester sits on a field. */
export const HARVEST_PER_SEC = 60;
/** A refinery dock unloads the whole bay at once. Kept so older balance notes still import. */
export const DUMP_PER_SEC = 250;
export const SURVIVE_SECONDS = 600;
export const BUILD_GAP = 3;
export const UNIT_CAP = 60;
export const BUILDING_CAP = 40;
/** One finger-drag lays at most this many fence tiles. */
export const WALL_RUN_MAX = 40;

export const SEAT_NAME = ["You", "North", "East", "South"] as const;

export const TILE_SAND = 0;
export const TILE_ROCK = 1;
export const TILE_CRYSTAL = 2;
export const TILE_SCRUB = 3;
export const TILE_SPENT = 4;
export const TILE_SHALLOW = 5;
export const TILE_DEEP = 6;
export const TILE_CLIFF = 7;
export const TILE_SHORE = 8;
export const TILE_BRIDGE = 9;
/** Dirt. Land units move a little faster. */
export const TILE_ROAD = 10;
/** Low ground between ridges. Land units cross slowly. */
export const TILE_VALLEY = 11;
/** Shallow ford. Land crosses slowly. Boats can use it. */
export const TILE_FORD = 12;
/** Open ground. Grass, dirt, or snow, depending on the theater. */
export const TILE_CLEAR = 13;
/** Broken ground. Vehicles slow down. Infantry do not. */
export const TILE_ROUGH = 14;
/** The only walkable cut through a cliff. */
export const TILE_RAMP = 15;
/** A tree a vehicle has already pushed over. Open ground. */
export const TILE_STUMP = 16;
/** Civilian shells. A crater mark on the tile steps them intact → damaged → rubble. */
export const TILE_HUT = 17;
export const TILE_BARN = 18;
export const TILE_PUMP = 19;
/** A span that fell. Boats cross it until an engineer repairs the bridge. */
export const TILE_WRECK = 20;
/** Walkable high ground. The rim stays cliff; ramps are the way up. */
export const TILE_HIGH = 21;

export type Theater = "desert" | "temperate" | "snow";

export const FACTION_NAME: Record<FactionId, string> = {
  concord: "Concord",
  syndicate: "Syndicate",
  steel: "Steel",
  prism: "Prism",
};

export const FACTION_HUE: Record<FactionId, string> = {
  concord: "Olive",
  syndicate: "Ember",
  steel: "Slate",
  prism: "Cyan",
};

export const FACTION_BLURB: Record<FactionId, string> = {
  concord: "Olive. Tougher infantry, harder towers, steady dynamos.",
  syndicate: "Ember. Faster vehicles and a stealth scout. Thinner power.",
  steel: "Slate. Concord machines with thicker hulls and slower treads. Walls last longer.",
  prism: "Cyan. Syndicate machines that hit harder and see farther, with thinner hulls.",
};

export const FACTION_COLOR: Record<FactionId, string> = {
  concord: "#d2f04a",
  syndicate: "#ff5c2e",
  steel: "#2b8bff",
  prism: "#12e6ff",
};

/** Battlefield sides. The local player is always blue. Not the faction chip colors. */
export const SIDE_BLUE = "#2F7DF6";
export const SIDE_RED = "#E5483B";
export const SIDE_GREEN = "#3FBF5A";
export const SIDE_YELLOW = "#F2C230";

/** Olive plates in the unit art. Spin is how far a seat sits from that green. */
const PLATE_HUE = 78;

/** Troops stay lighter and hotter. Halls stay a step darker so a base is not the same paint as a tank. */
export function unitInk(hex: string): string {
  return shiftInk(hex, 0, 1.45, 1.12, true);
}

export function hallInk(hex: string): string {
  return shiftInk(hex, -8, 1.35, 0.82, true);
}

/** Degrees to swing olive art toward this seat. Gray eliminated seats do not spin. */
export function plateSpin(hex: string): number {
  const hsl = hslOf(hex);
  if (!hsl || hsl.s < 0.18) return 0;
  return ((hsl.h - PLATE_HUE + 540) % 360) - 180;
}

function hslOf(hex: string): { h: number; s: number; l: number } | null {
  const raw = hex.replace("#", "");
  const n = parseInt(raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw, 16);
  if (!Number.isFinite(n)) return null;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 0.0001) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function shiftInk(hex: string, hue: number, sat: number, light: number, punch = false): string {
  const hsl = hslOf(hex);
  if (!hsl) return hex;
  let { h, s, l } = hsl;
  h = (h + hue + 360) % 360;
  s = Math.max(0, Math.min(1, s * sat));
  if (punch && hsl.s > 0.2) s = Math.max(0.78, s);
  const nl = Math.max(punch ? 0.42 : 0.34, Math.min(punch ? 0.66 : 0.78, l * light));
  const c = (1 - Math.abs(2 * nl - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rr = 0;
  let gg = 0;
  let bb = 0;
  if (hp < 1) [rr, gg, bb] = [c, x, 0];
  else if (hp < 2) [rr, gg, bb] = [x, c, 0];
  else if (hp < 3) [rr, gg, bb] = [0, c, x];
  else if (hp < 4) [rr, gg, bb] = [0, x, c];
  else if (hp < 5) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  const m = nl - c / 2;
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, "0");
  return `#${byte(rr)}${byte(gg)}${byte(bb)}`;
}

export const FACTION_IDS: FactionId[] = ["concord", "syndicate", "steel", "prism"];

export function isFactionId(v: unknown): v is FactionId {
  return v === "concord" || v === "syndicate" || v === "steel" || v === "prism";
}

/** Steel fights with Concord's roster. Prism fights with Syndicate's. */
export function rosterOf(f: FactionId): "concord" | "syndicate" {
  return f === "syndicate" || f === "prism" ? "syndicate" : "concord";
}

/** Extra seats take colors the two picked commanders are not already using. */
export function spareFaction(player: FactionId, enemy: FactionId, nth: 0 | 1): FactionId {
  const rest = FACTION_IDS.filter((f) => f !== player && f !== enemy);
  return rest[nth] ?? rest[0] ?? "steel";
}

export function normalizeDifficulty(v: unknown): AiDifficulty {
  if (v === "easy" || v === "hard" || v === "normal") return v;
  return "normal";
}

export function normalizeSize(v: unknown): MapSizeId {
  if (v === "large" || v === "warzone" || v === "skirmish" || v === "continent") return v;
  return "skirmish";
}

export function wideField(size: MapSizeId): boolean {
  return size === "warzone" || size === "continent";
}

/** Generated coasts grow forest. Named deserts stay sand. Iceland stays snow. */
export function theaterOf(mapId: MapId): Theater {
  if (mapId === "iceland") return "snow";
  if (
    mapId === "dry" ||
    mapId === "namib" ||
    mapId === "atacama" ||
    mapId === "whitesands" ||
    mapId === "lencois" ||
    mapId === "pilbara" ||
    mapId === "basin" ||
    mapId === "oasis"
  ) {
    return "desert";
  }
  return "temperate";
}

export function normalizeTeams(v: unknown): TeamMode {
  if (v === "tvt" || v === "split") return "tvt";
  return "ffa";
}

export function normalizeStart(v: unknown): StartPos {
  if (v === "nw" || v === "ne" || v === "sw" || v === "se" || v === "random") return v;
  if (v === "swap") return "ne";
  return "sw";
}

export const UNITS: Record<UnitId, UnitDef> = {
  rifle: {
    id: "rifle",
    name: "Rifle Infantry",
    short: "Rifle",
    trainedAt: "barracks",
    factions: "both",
    cost: 100,
    time: 4,
    hp: 100,
    speed: 2.35,
    sight: 5.6,
    damage: 12,
    range: 4.4,
    rof: 0.65,
    radius: 0.28,
    armor: "infantry",
    cargo: 0,
    shot: "hit",
    vsInf: 1.3,
    vsVeh: 0.42,
    vsBld: 0.32,
    stealth: false,
  },
  rocket: {
    id: "rocket",
    name: "Rocket Infantry",
    short: "Rocket",
    trainedAt: "barracks",
    factions: "both",
    cost: 250,
    time: 6,
    hp: 80,
    speed: 2.05,
    sight: 6,
    damage: 26,
    range: 5.6,
    rof: 1.55,
    radius: 0.3,
    armor: "infantry",
    cargo: 0,
    shot: "rocket",
    vsInf: 0.55,
    vsVeh: 1.45,
    vsBld: 1.25,
    stealth: false,
    hitsAir: true,
    vsAir: 1.2,
  },
  marksman: {
    id: "marksman",
    name: "Marksman",
    short: "Mark",
    trainedAt: "barracks",
    factions: "both",
    cost: 280,
    time: 7,
    hp: 70,
    speed: 1.85,
    sight: 8,
    damage: 24,
    range: 7.4,
    rof: 1.45,
    radius: 0.26,
    armor: "infantry",
    cargo: 0,
    shot: "hit",
    vsInf: 1.85,
    vsVeh: 0.32,
    vsBld: 0.18,
    stealth: false,
  },
  wader: {
    id: "wader",
    name: "Wader",
    short: "Wader",
    trainedAt: "barracks",
    factions: "both",
    cost: 220,
    time: 6,
    hp: 130,
    speed: 2,
    sight: 5.4,
    damage: 14,
    range: 4.2,
    rof: 0.8,
    radius: 0.3,
    armor: "infantry",
    cargo: 0,
    shot: "hit",
    vsInf: 1.1,
    vsVeh: 0.55,
    vsBld: 0.4,
    stealth: false,
    loco: "amphib",
  },
  scatter: {
    id: "scatter",
    name: "Scatter",
    short: "Scatter",
    trainedAt: "factory",
    factions: "both",
    cost: 650,
    time: 11,
    hp: 230,
    speed: 2.7,
    sight: 6.4,
    damage: 14,
    range: 5.2,
    rof: 0.42,
    radius: 0.48,
    armor: "vehicle",
    cargo: 0,
    shot: "shell",
    vsInf: 1.75,
    vsVeh: 0.42,
    vsBld: 0.35,
    stealth: false,
    hitsAir: true,
    vsAir: 1.05,
  },
  scout: {
    id: "scout",
    name: "Scout Buggy",
    short: "Scout",
    trainedAt: "factory",
    factions: "both",
    cost: 250,
    time: 5,
    hp: 110,
    speed: 4.5,
    sight: 9,
    damage: 8,
    range: 4.2,
    rof: 0.4,
    radius: 0.42,
    armor: "vehicle",
    cargo: 0,
    shot: "hit",
    vsInf: 1,
    vsVeh: 0.48,
    vsBld: 0.28,
    stealth: false,
  },
  tank: {
    id: "tank",
    name: "Light Tank",
    short: "Tank",
    trainedAt: "factory",
    factions: "both",
    cost: 700,
    time: 12,
    hp: 340,
    speed: 2.55,
    sight: 6.2,
    damage: 34,
    range: 5.2,
    rof: 1.25,
    radius: 0.52,
    armor: "vehicle",
    cargo: 0,
    shot: "shell",
    vsInf: 0.75,
    vsVeh: 1.15,
    vsBld: 1,
    stealth: false,
  },
  harvester: {
    id: "harvester",
    name: "Harvester",
    short: "Harvester",
    trainedAt: "factory",
    factions: "both",
    cost: 1100,
    time: 14,
    hp: 420,
    speed: 2.15,
    sight: 5.2,
    damage: 0,
    range: 0,
    rof: 99,
    radius: 0.55,
    armor: "vehicle",
    cargo: 500,
    shot: "hit",
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    stealth: false,
  },
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    short: "Vanguard",
    trainedAt: "barracks",
    factions: "concord",
    cost: 300,
    time: 7,
    hp: 170,
    speed: 2.05,
    sight: 5.5,
    damage: 16,
    range: 4.3,
    rof: 0.6,
    radius: 0.32,
    armor: "infantry",
    cargo: 0,
    shot: "hit",
    vsInf: 1.4,
    vsVeh: 0.65,
    vsBld: 0.45,
    stealth: false,
  },
  razor: {
    id: "razor",
    name: "Razor",
    short: "Razor",
    trainedAt: "factory",
    factions: "syndicate",
    cost: 700,
    time: 9,
    hp: 150,
    speed: 4.7,
    sight: 6.4,
    damage: 20,
    range: 5,
    rof: 0.75,
    radius: 0.42,
    armor: "vehicle",
    cargo: 0,
    shot: "shell",
    vsInf: 0.7,
    vsVeh: 1.2,
    vsBld: 0.55,
    stealth: false,
  },
  mcv: {
    id: "mcv",
    name: "MCV",
    short: "MCV",
    trainedAt: "factory",
    factions: "both",
    cost: 2800,
    time: 22,
    hp: 700,
    speed: 1.9,
    sight: 6.5,
    damage: 0,
    range: 0,
    rof: 99,
    radius: 0.62,
    armor: "vehicle",
    cargo: 0,
    shot: "hit",
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    stealth: false,
  },
  engineer: {
    id: "engineer",
    name: "Engineer",
    short: "Engineer",
    trainedAt: "barracks",
    factions: "both",
    cost: 500,
    time: 8,
    hp: 70,
    speed: 2.1,
    sight: 5,
    damage: 0,
    range: 1.15,
    rof: 99,
    radius: 0.26,
    armor: "infantry",
    cargo: 0,
    shot: "hit",
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    stealth: false,
  },
  medium: {
    id: "medium",
    name: "Medium Tank",
    short: "Medium",
    trainedAt: "factory",
    factions: "both",
    cost: 1150,
    time: 14,
    hp: 520,
    speed: 2.15,
    sight: 6,
    damage: 46,
    range: 5.4,
    rof: 1.45,
    radius: 0.58,
    armor: "heavy",
    cargo: 0,
    shot: "shell",
    vsInf: 0.7,
    vsVeh: 1.25,
    vsBld: 1.15,
    stealth: false,
  },
  artillery: {
    id: "artillery",
    name: "Artillery",
    short: "Artillery",
    trainedAt: "factory",
    factions: "both",
    cost: 900,
    time: 12,
    hp: 180,
    speed: 1.7,
    sight: 7,
    damage: 52,
    range: 8.4,
    minRange: 3.15,
    rof: 2.4,
    radius: 0.5,
    armor: "light",
    cargo: 0,
    shot: "shell",
    vsInf: 0.85,
    vsVeh: 0.7,
    vsBld: 1.45,
    stealth: false,
  },
  apc: {
    id: "apc",
    name: "APC",
    short: "APC",
    trainedAt: "factory",
    factions: "both",
    cost: 700,
    time: 10,
    hp: 260,
    speed: 3.1,
    sight: 6,
    damage: 10,
    range: 4,
    rof: 0.7,
    radius: 0.5,
    armor: "light",
    cargo: 0,
    shot: "hit",
    vsInf: 1,
    vsVeh: 0.4,
    vsBld: 0.25,
    stealth: false,
    loco: "amphib",
    capInf: 5,
  },
  gunboat: {
    id: "gunboat",
    name: "Scout Boat",
    short: "Skiff",
    trainedAt: "dock",
    factions: "both",
    cost: 450,
    time: 8,
    hp: 160,
    speed: 3.8,
    sight: 8.8,
    damage: 10,
    range: 4.6,
    rof: 0.55,
    radius: 0.46,
    armor: "light",
    cargo: 0,
    shot: "shell",
    vsInf: 0.45,
    vsVeh: 0.5,
    vsBld: 0.22,
    stealth: false,
    loco: "sea",
  },
  frigate: {
    id: "frigate",
    name: "Assault Ship",
    short: "Assault",
    trainedAt: "dock",
    factions: "both",
    cost: 1100,
    time: 14,
    hp: 480,
    speed: 2.2,
    sight: 7.2,
    damage: 44,
    range: 6.8,
    rof: 1.25,
    radius: 0.62,
    armor: "heavy",
    cargo: 0,
    shot: "shell",
    vsInf: 0.4,
    vsVeh: 0.85,
    vsBld: 1.3,
    stealth: false,
    loco: "sea",
  },
  missile: {
    id: "missile",
    name: "Ship Hunter",
    short: "Hunter",
    trainedAt: "dock",
    factions: "both",
    cost: 950,
    time: 12,
    hp: 200,
    speed: 3.05,
    sight: 7.4,
    damage: 34,
    range: 6.6,
    rof: 1.55,
    radius: 0.46,
    armor: "light",
    cargo: 0,
    shot: "rocket",
    vsInf: 0.3,
    vsVeh: 1.55,
    vsBld: 0.4,
    stealth: false,
    loco: "sea",
    hitsAir: true,
    vsAir: 1.6,
  },
  transport: {
    id: "transport",
    name: "Transport",
    short: "Transport",
    trainedAt: "dock",
    factions: "both",
    cost: 700,
    time: 11,
    hp: 320,
    speed: 2.6,
    sight: 6,
    damage: 0,
    range: 0,
    rof: 99,
    radius: 0.6,
    armor: "light",
    cargo: 0,
    shot: "hit",
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    stealth: false,
    loco: "sea",
    capInf: 6,
    capLight: 2,
  },
  chinook: {
    id: "chinook",
    name: "Transport Heli",
    short: "Heli",
    trainedAt: "helipad",
    factions: "both",
    cost: 900,
    time: 12,
    hp: 120,
    speed: 3.8,
    sight: 6,
    damage: 0,
    range: 0,
    rof: 99,
    radius: 0.46,
    armor: "light",
    cargo: 0,
    shot: "hit",
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    stealth: false,
    loco: "air",
    capInf: 6,
  },
  attackheli: {
    id: "attackheli",
    name: "Attack Heli",
    short: "Gunship",
    trainedAt: "helipad",
    factions: "both",
    cost: 1400,
    time: 15,
    hp: 150,
    speed: 3.5,
    sight: 7,
    damage: 28,
    range: 5.2,
    rof: 0.5,
    radius: 0.46,
    armor: "light",
    cargo: 0,
    shot: "rocket",
    vsInf: 1.1,
    vsVeh: 1.25,
    vsBld: 0.55,
    stealth: false,
    loco: "air",
    magazine: 8,
    rearmFor: 6,
  },
  bomber: {
    id: "bomber",
    name: "Fighter-Bomber",
    short: "Bomber",
    trainedAt: "helipad",
    factions: "both",
    cost: 1600,
    time: 16,
    hp: 210,
    speed: 4.4,
    sight: 8,
    damage: 70,
    range: 2.6,
    rof: 0.4,
    radius: 0.48,
    armor: "light",
    cargo: 0,
    shot: "shell",
    vsInf: 0.9,
    vsVeh: 1,
    vsBld: 1.35,
    stealth: false,
    loco: "air",
    magazine: 1,
    rearmFor: 12,
  },
};

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  yard: {
    id: "yard",
    name: "Construction Yard",
    short: "Yard",
    cost: 0,
    time: 2,
    hp: 2800,
    w: 3,
    h: 3,
    powerUse: 20,
    powerOut: 0,
    sight: 8,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
  },
  power: {
    id: "power",
    name: "Power Plant",
    short: "Power",
    cost: 300,
    time: 6,
    hp: 700,
    w: 2,
    h: 2,
    powerUse: 0,
    powerOut: 100,
    sight: 4,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
  },
  refinery: {
    id: "refinery",
    name: "Refinery",
    short: "Refinery",
    cost: 1400,
    time: 12,
    hp: 1100,
    w: 3,
    h: 2,
    powerUse: 30,
    powerOut: 0,
    sight: 5,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
  },
  barracks: {
    id: "barracks",
    name: "Barracks",
    short: "Barracks",
    cost: 300,
    time: 7,
    hp: 800,
    w: 2,
    h: 2,
    powerUse: 20,
    powerOut: 0,
    sight: 5,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: "infantry",
  },
  factory: {
    id: "factory",
    name: "War Factory",
    short: "Factory",
    cost: 1000,
    time: 12,
    hp: 1200,
    w: 3,
    h: 3,
    powerUse: 55,
    powerOut: 0,
    sight: 5,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: "vehicle",
  },
  tower: {
    id: "tower",
    name: "Guard Tower",
    short: "Tower",
    cost: 500,
    time: 7,
    hp: 460,
    w: 1,
    h: 1,
    powerUse: 15,
    powerOut: 0,
    sight: 7,
    damage: 16,
    range: 5.8,
    rof: 0.55,
    vsInf: 1.15,
    vsVeh: 1,
    vsBld: 0.35,
    storage: 0,
    trains: null,
  },
  silo: {
    id: "silo",
    name: "Silo",
    short: "Silo",
    cost: 150,
    time: 5,
    hp: 400,
    w: 1,
    h: 1,
    powerUse: 10,
    powerOut: 0,
    sight: 3,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 2000,
    trains: null,
  },
  supply: {
    id: "supply",
    name: "Supply Center",
    short: "Supply",
    cost: 350,
    time: 8,
    hp: 720,
    w: 2,
    h: 2,
    powerUse: 10,
    powerOut: 0,
    sight: 4,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
  },
  dock: {
    id: "dock",
    name: "Dock",
    short: "Dock",
    cost: 1000,
    time: 12,
    hp: 900,
    w: 2,
    h: 2,
    powerUse: 30,
    powerOut: 0,
    sight: 6,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: "navy",
    shore: true,
    requires: "factory",
  },
  helipad: {
    id: "helipad",
    name: "Helipad",
    short: "Helipad",
    cost: 800,
    time: 10,
    hp: 700,
    w: 2,
    h: 2,
    powerUse: 35,
    powerOut: 0,
    sight: 6,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: "air",
    requires: "barracks",
  },
  aa: {
    id: "aa",
    name: "AA Battery",
    short: "AA",
    cost: 600,
    time: 8,
    hp: 420,
    w: 1,
    h: 1,
    powerUse: 25,
    powerOut: 0,
    sight: 7,
    damage: 22,
    range: 6.4,
    rof: 0.45,
    vsInf: 0.2,
    vsVeh: 0.35,
    vsBld: 0.1,
    storage: 0,
    trains: null,
    requires: "barracks",
    only: "concord",
    special: "aa",
    vsAir: 3.2,
  },
  radar: {
    id: "radar",
    name: "Radar Mast",
    short: "Radar",
    cost: 800,
    time: 10,
    hp: 400,
    w: 1,
    h: 1,
    powerUse: 40,
    powerOut: 0,
    sight: 10,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
    requires: "power",
    only: "syndicate",
    special: "radar",
  },
  wall: {
    id: "wall",
    name: "Concrete Wall",
    short: "Concrete",
    cost: 100,
    time: 0.4,
    hp: 760,
    w: 1,
    h: 1,
    powerUse: 0,
    powerOut: 0,
    sight: 2,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
    requires: "factory",
  },
  sandbag: {
    id: "sandbag",
    name: "Sandbag",
    short: "Sandbag",
    cost: 25,
    time: 0.4,
    hp: 70,
    w: 1,
    h: 1,
    powerUse: 0,
    powerOut: 0,
    sight: 2,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
  },
  gate: {
    id: "gate",
    name: "Gate",
    short: "Gate",
    cost: 75,
    time: 0.4,
    hp: 640,
    w: 1,
    h: 1,
    powerUse: 0,
    powerOut: 0,
    sight: 2,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
  },
  advpower: {
    id: "advpower",
    name: "Advanced Power",
    short: "Adv Power",
    cost: 800,
    time: 12,
    hp: 900,
    w: 2,
    h: 2,
    powerUse: 0,
    powerOut: 200,
    sight: 4,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
    requires: "power",
  },
  stealth: {
    id: "stealth",
    name: "Stealth Generator",
    short: "Stealth",
    cost: 1000,
    time: 14,
    hp: 500,
    w: 2,
    h: 2,
    powerUse: 50,
    powerOut: 0,
    sight: 5,
    damage: 0,
    range: 6,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
    requires: "barracks",
    only: "syndicate",
    special: "stealth",
  },
  span: {
    id: "span",
    name: "Bridge",
    short: "Bridge",
    cost: 0,
    time: 0,
    hp: 900,
    w: 3,
    h: 1,
    powerUse: 0,
    powerOut: 0,
    sight: 1,
    damage: 0,
    range: 0,
    rof: 99,
    vsInf: 0,
    vsVeh: 0,
    vsBld: 0,
    storage: 0,
    trains: null,
  },
};

export const BUILD_ORDER: BuildingId[] = [
  "power",
  "supply",
  "advpower",
  "refinery",
  "barracks",
  "factory",
  "dock",
  "helipad",
  "tower",
  "aa",
  "radar",
  "stealth",
  "sandbag",
  "wall",
  "gate",
];

export const UNIT_ORDER: UnitId[] = [
  "rifle",
  "rocket",
  "marksman",
  "wader",
  "engineer",
  "vanguard",
  "scout",
  "tank",
  "scatter",
  "medium",
  "artillery",
  "apc",
  "razor",
  "harvester",
  "mcv",
  "gunboat",
  "frigate",
  "missile",
  "transport",
  "chinook",
  "attackheli",
  "bomber",
];

export interface ResolvedUnit extends UnitDef {}

export function otherFaction(f: FactionId): FactionId {
  if (f === "concord") return "syndicate";
  if (f === "syndicate") return "concord";
  if (f === "steel") return "prism";
  return "concord";
}

export function resolveUnit(id: UnitId, faction: FactionId): ResolvedUnit {
  const src = UNITS[id];
  const u: ResolvedUnit = { ...src };
  const roster = rosterOf(faction);
  if (roster === "concord" && u.armor === "infantry") {
    u.hp = Math.round(u.hp * 1.18);
  }
  const landVehicle = (u.loco ?? "land") === "land" || u.loco === "amphib";
  if (roster === "syndicate" && landVehicle && u.armor !== "infantry") {
    const bonus = id === "harvester" ? 1.08 : id === "mcv" ? 1.05 : 1.18;
    u.speed = Math.round(u.speed * bonus * 100) / 100;
  }
  if (faction === "syndicate" && id === "scout") {
    u.stealth = true;
    u.name = "Shade Buggy";
    u.short = "Shade";
  }
  if (faction === "steel" && u.armor !== "infantry") {
    u.hp = Math.round(u.hp * 1.22);
    if (landVehicle) u.speed = Math.round(u.speed * 0.86 * 100) / 100;
  }
  if (faction === "prism") {
    if (u.damage > 0) u.damage = Math.round(u.damage * 1.12);
    u.hp = Math.max(1, Math.round(u.hp * 0.88));
    u.sight = Math.round(u.sight * 1.12 * 10) / 10;
  }
  return u;
}

export interface ResolvedBuilding extends BuildingDef {}

export function resolveBuilding(id: BuildingId, faction: FactionId): ResolvedBuilding {
  const src = BUILDINGS[id];
  const b: ResolvedBuilding = { ...src };
  const roster = rosterOf(faction);
  const req: Partial<Record<BuildingId, BuildingId>> = {
    refinery: "power",
    supply: "power",
    barracks: "power",
    factory: "refinery",
    silo: "refinery",
    tower: "barracks",
  };
  if (b.requires === undefined && req[id]) b.requires = req[id];
  if (id === "power") {
    b.powerOut = faction === "syndicate" ? 85 : faction === "prism" ? 80 : faction === "steel" ? 115 : 100;
  }
  if (id === "advpower") {
    b.powerOut = faction === "syndicate" ? 160 : faction === "prism" ? 150 : faction === "steel" ? 230 : 200;
  }
  if (id === "tower" && roster === "concord") {
    b.damage = 23;
    b.range = 6.5;
    b.sight = 7.4;
    b.rof = 0.5;
  }
  if (faction === "steel" && (id === "wall" || id === "gate" || id === "sandbag" || id === "tower" || id === "aa")) {
    b.hp = Math.round(b.hp * 1.3);
  }
  if (faction === "prism" && id === "radar") b.sight = 12;
  return b;
}

export function isFence(id: BuildingId): boolean {
  return id === "sandbag" || id === "wall" || id === "gate";
}

/**
 * Unmet requirement for a build card, before the player taps.
 * Tech comes first ("Needs Refinery"), then a gate's wall, then the yard.
 */
export function buildNeed(id: BuildingId, faction: FactionId, have: (kind: BuildingId) => boolean): string {
  const def = resolveBuilding(id, faction);
  if (def.requires && !have(def.requires)) return `Needs ${BUILDINGS[def.requires].short}`;
  if (id === "gate" && !have("wall") && !have("sandbag")) return "Needs wall";
  if (id !== "yard" && !have("yard")) return "Needs Yard";
  return "";
}

export function canBuild(id: BuildingId, faction: FactionId): boolean {
  const only = BUILDINGS[id].only;
  if (!only || only === "both") return true;
  return only === faction || only === rosterOf(faction);
}

export function canTrain(id: UnitId, faction: FactionId): boolean {
  const f = UNITS[id].factions;
  if (f === "both") return true;
  return f === faction || f === rosterOf(faction);
}

/** Rifle and the barracks squad are free once the hall stands. Vehicles step up with advanced power. */
export function unitRequires(id: UnitId): BuildingId | null {
  switch (id) {
    case "medium":
    case "artillery":
    case "apc":
    case "scatter":
      return "advpower";
    case "frigate":
    case "missile":
    case "transport":
      return "advpower";
    case "bomber":
    case "chinook":
      return "advpower";
    default:
      return null;
  }
}

export function trainedList(at: TrainAt, faction: FactionId): UnitId[] {
  const slice: Partial<Record<TrainAt, UnitId[]>> = {
    dock: ["gunboat", "frigate", "missile"],
    helipad: ["attackheli", "bomber"],
  };
  const order = slice[at] ?? UNIT_ORDER;
  return order.filter((id) => UNITS[id].trainedAt === at && canTrain(id, faction));
}

export function locoOf(u: { loco?: Loco }): Loco {
  return u.loco ?? "land";
}

/** Command points a unit occupies. Infantry are cheap. Armor and air are not. */
export function commandCost(u: { kind?: UnitId; id?: UnitId | number; armor: Armor; loco?: Loco }): number {
  const id = u.kind ?? (typeof u.id === "string" ? u.id : undefined);
  if (id === "harvester" || id === "mcv") return 2;
  const loco = u.loco ?? "land";
  if (loco === "air" || loco === "sea") return 3;
  if (u.armor === "infantry") return 1;
  if (u.armor === "heavy") return 3;
  return 2;
}
