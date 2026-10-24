import { spawnTrail, spawnTracer, spawnSparks, spawnDirt, spawnWreck, spawnFall, spawnRuin } from "./combat-fx.ts";
import { hallPictureLift, viewPitch } from "./view.ts";
import { allows, blocksSight, boatBeaches, isShell, isWater } from "./tileset.ts";
import { barkClass, type Cue, type SfxName } from "./audio.ts";
import { Rng } from "./rng.ts";
import {
  HARVEST_PER_SEC,
  BUILDING_CAP,
  BUILDINGS,
  BUILD_GAP,
  BUILD_ORDER,
  CP_MAX,
  HQ_COST,
  HQ_CP,
  HQ_TIME,
  HIGH_AIM,
  HIGH_RANGE,
  HIGH_SIGHT,
  DETECT_RADAR,
  DETECT_SCOUT,
  airTier,
  HAUL_AT,
  MAP_SIZE,
  SEAT_NAME,
  START_CREDITS,
  START_STORAGE,
  SUPPLY_DRIP,
  SILO_DRIP,
  supplyShare,
  SURVIVE_SECONDS,
  TILE_FORD,
  TILE_HIGH,
  TILE_RAMP,
  TILE_ROAD,
  TILE_VALLEY,
  TILE_WRECK,
  TILE_BRIDGE,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_ROCK,
  TILE_SAND,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_CLEAR,
  TILE_ROUGH,
  TILE_SCRUB,
  TILE_SPENT,
  TILE_STUMP,
  UNIT_CAP,
  WALL_RUN_MAX,
  YARD_DRIP,
  canBuild,
  canTrain,
  commandCost,
  isFence,
  locoOf,
  normalizeDifficulty,
  normalizeSize,
  normalizeStart,
  normalizeTeams,
  teamStyle,
  otherFaction,
  resolveBuilding,
  resolveUnit,
  spareFaction,
  theaterOf,
  unitRequires,
  wideField,
  counterMul,
  plateOf,
  type AiDifficulty,
  type AiIntent,
  type AiProfile,
  type Armor,
  type BuildingId,
  type FactionId,
  type Loco,
  type MapId,
  type MapSizeId,
  type ModeId,
  type ShotKind,
  type StartPos,
  type Team,
  type TeamMode,
  type Theater,
  type UnitId,
} from "./data.ts";
import { unpack, type CustomMap } from "./custom.ts";
import { lobbySize, offersNavy } from "./editor.ts";
import { dressBattlefield, dressProps, evenMichiganFields, fairExpansionOre, fairNearbyOre, generateMap, matchNorthwestOre, openBuildPads, paveMichigan, plantCorners, plantMichiganHeart, resampleMap, seedScars, shelveNorthwest, snapLand, stampCamp, waterKind, widenNorthwest, type FieldProp } from "./maps.ts";
import { aiCount, alliances, navyHidden, orderCorners, type OpponentCount } from "./lobby.ts";
import { findPath, nearestOpen } from "./path.ts";
import { unitPickRadius } from "./view.ts";
import { aiThink } from "./ai.ts";

/** Nobody shoots or steps into a hostile start until this many seconds have passed. */
export const DEPLOY_SECS = 40;
/**
 * First-attack marks on the in-game clock (sim.time), in seconds.
 * Game speed only changes how fast that clock advances, so these do not move.
 * No personality may attack before its mark.
 */
export const EASY_SCOUT_UNTIL = 6 * 60;
export const EASY_PUSH_AT = 8 * 60;
export const NORMAL_HARASS_AT = 4 * 60;
export const NORMAL_PUSH_AT = 6 * 60 + 30;
export const HARD_PUSH_AT = 3 * 60;

export function firstPushAt(diff: AiDifficulty): number {
  if (diff === "easy") return EASY_PUSH_AT;
  if (diff === "hard") return HARD_PUSH_AT;
  return NORMAL_PUSH_AT;
}
/** Tiles around a start the other side cannot enter during deployment. */
const START_BUBBLE = 8;
/** Hard matches end here if both yards are still standing. Score picks the winner. */
const HARD_CAP_SECS = 1200;

export type Order =
  | { t: "idle" }
  | { t: "move"; x: number; y: number; attackMove: boolean }
  | { t: "attack"; id: number }
  | { t: "harvest" }
  | { t: "return" }
  | { t: "guard"; x: number; y: number }
  | { t: "deploy" }
  | { t: "rearm" }
  | { t: "capture"; id: number };

export interface Unit {
  id: number;
  kind: UnitId;
  team: Team;
  name: string;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  facing: number;
  cooldown: number;
  cargo: number;
  cargoMax: number;
  order: Order;
  path: { x: number; y: number }[];
  repath: number;
  harvestTx: number;
  harvestTy: number;
  deploy: number;
  reveal: number;
  stuck: number;
  speed: number;
  sight: number;
  damage: number;
  range: number;
  rof: number;
  radius: number;
  armor: Armor;
  shot: ShotKind;
  vsInf: number;
  vsVeh: number;
  vsBld: number;
  stealth: boolean;
  loco: Loco;
  hitsAir: boolean;
  capInf: number;
  capLight: number;
  riders: number[];
  aboard: number;
  home: number;
  baseStealth: boolean;
  rearm: number;
  capture: number;
  /** Shots left before this aircraft must land. ammoMax 0 means it is not on a magazine. */
  ammo: number;
  ammoMax: number;
  rearmFor: number;
  /** Attack target to resume after the pad timer. 0 = stay idle. */
  sortie: number;
  vsAir: number;
  /** Seconds left on the red blocked flash. */
  blocked: number;
  /** Seconds left on the red damage flash. Visual only. */
  hit: number;
  /** Unit that last shot this one. 0 means nobody. Not saved. */
  aggro: number;
  /** In-game clock time until return fire may chase that shooter. */
  aggroUntil: number;
  /** Kills this unit has scored. Stars are cosmetic until a later balance pass. */
  kills: number;
  /** Seconds of the harvest scoop animation. */
  gather: number;
  /**
   * Enemy fence to break because it is the only route to the ordered target.
   * 0 means the way is open. Not saved — the next path search fills it again.
   */
  breach: number;
  /** Artillery cannot shoot closer than this. */
  minRange: number;
  /** Where an idle squad walks back to after a short chase. */
  postX: number;
  postY: number;
  /** Cap for a group march. 0 uses this unit's own speed. */
  pace: number;
  /** Angle of this unit's slot around a focus-fire target. Negative means unset. */
  ring: number;
}

export interface Building {
  id: number;
  kind: BuildingId;
  team: Team;
  name: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  complete: boolean;
  buildLeft: number;
  buildTotal: number;
  queue: UnitId[];
  prod: number;
  rallyX: number;
  rallyY: number;
  cooldown: number;
  powerUse: number;
  powerOut: number;
  sight: number;
  damage: number;
  range: number;
  rof: number;
  vsInf: number;
  vsVeh: number;
  vsBld: number;
  storage: number;
  neutral: boolean;
  special: "aa" | "radar" | "stealth" | null;
  vsAir: number;
  /** Friendly gate passage. Enemies never use it. Locked gates stop your own troops too. */
  open: boolean;
  /** Rubble still blocks until this counts down to 0. Walls use a short count. A fallen hall keeps a high value so the pile stays. */
  rubble: number;
  /** Seconds a fallen hall's footprint still blocks movement. */
  block: number;
  /** Seconds left on the red damage flash. */
  hit: number;
  /** Sim time until the attack bar hides. Visual only. */
  shown: number;
  /** Spending credits to restore hit points. */
  mending: boolean;
  /** Seconds left on the collapse. 0 means not collapsing. */
  collapse: number;
  /** Neutral objective infantry take by standing beside it. */
  prize: boolean;
  /** Seconds a side has held the prize. Not saved. */
  cap: number;
  /** Team filling the capture bar. -1 is contested, -2 is empty. */
  capTeam: number;
}

export interface Shot {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  team: Team;
  dmg: number;
  vsInf: number;
  vsVeh: number;
  vsBld: number;
  targetId: number;
  ttl: number;
  kind: ShotKind;
  splash: number;
  hitsAir: boolean;
  vsAir: number;
  /** Unit that fired. 0 if the shot has no owner. */
  owner: number;
  /** 0 flies flat. Artillery and bombers loft. */
  arc: number;
  age: number;
  /** Weapon owner kind, so a dead firer still applies the right counter. */
  who: string;
}

export interface Fx {
  kind: "boom" | "beam" | "debris" | "muzzle" | "flash" | "num";
  x: number;
  y: number;
  x2: number;
  y2: number;
  ttl: number;
  max: number;
  color: string;
  r: number;
  /** Rounded damage for a floating number. */
  n?: number;
}

/** A move or attack the player just issued. Drawn, not simulated. */
export interface OrderPing {
  kind: "move" | "attack" | "amove";
  x: number;
  y: number;
  life: number;
  /** Squad center when the order was an attack-move. */
  fx?: number;
  fy?: number;
}

/** A muzzle flash the victim can see through the fog for a short time. */
export interface Spot {
  team: Team;
  x: number;
  y: number;
  ttl: number;
}

/** Last place a foe was seen, or where a shot came from. */
export interface Ghost {
  viewer: Team;
  id: number;
  team: Team;
  x: number;
  y: number;
  kind: string;
  ttl: number;
}

/** A building last seen under fog. Stays until the player looks again and it is gone. */
export interface SeenHall {
  viewer: Team;
  id: number;
  team: Team;
  kind: BuildingId;
  tx: number;
  ty: number;
  w: number;
  h: number;
  hp: number;
  complete: boolean;
}

type Target = { kind: "unit"; u: Unit } | { kind: "building"; b: Building };

export interface PlaceResult {
  ok: boolean;
  reason: string;
}

export interface SimSave {
  v: 1;
  mapId: MapId;
  faction: FactionId;
  enemy?: FactionId;
  mode: ModeId;
  time: number;
  outcome: "playing" | "win" | "lose";
  reason: string;
  credits: number[];
  startCredits?: number;
  ai?: AiProfile;
  difficulty?: AiDifficulty;
  fog?: boolean;
  crates?: boolean;
  mapSize?: MapSizeId;
  opponents?: number;
  teams?: TeamMode;
  start?: StartPos;
  walls?: boolean;
  shared?: boolean;
  stanceEach?: boolean;
  stances?: AiProfile[];
  skills?: AiDifficulty[];
  eliminated?: boolean[];
  /** Units destroyed, units lost, buildings razed, buildings lost, seconds powered, time eliminated. */
  score?: { kills: number[]; lost: number[]; razed: number[]; plants: number[]; power: number[]; out: number[] };
  slots?: { x: number; y: number }[];
  nextId: number;
  aiNext: number;
  hadYard: boolean[];
  crystal: number[];
  fog0: string;
  fog1: string;
  fog2?: string;
  fog3?: string;
  commandLv?: number[];
  caches?: { x: number; y: number; kind: "cash" | "squad" | "haul" | "mend" }[];
  haulLanded?: boolean;
  units: {
    id: number;
    kind: UnitId;
    team: Team;
    x: number;
    y: number;
    hp: number;
    facing: number;
    cargo: number;
    order: Order;
    harvestTx: number;
    harvestTy: number;
    deploy: number;
    reveal: number;
    ammo?: number;
    rearm?: number;
    sortie?: number;
  }[];
  buildings: {
    id: number;
    kind: BuildingId;
    team: Team;
    tx: number;
    ty: number;
    hp: number;
    complete: boolean;
    buildLeft: number;
    queue: UnitId[];
    prod: number;
    rallyX: number;
    rallyY: number;
    open?: boolean;
    rubble?: number;
    neutral?: boolean;
    mending?: boolean;
    prize?: boolean;
  }[];
}

export interface MapMark {
  x: number;
  y: number;
  seat: number;
  mark: string;
  life: number;
}

export interface Crate {
  x: number;
  y: number;
  kind: "cash" | "squad" | "haul" | "mend";
}

export interface NewGame {
  mapId: MapId;
  faction: FactionId;
  mode: ModeId;
  empty?: boolean;
  credits?: number;
  ai?: AiProfile;
  difficulty?: AiDifficulty;
  fog?: boolean;
  crates?: boolean;
  enemy?: FactionId;
  mapSize?: MapSizeId;
  opponents?: OpponentCount;
  teams?: TeamMode;
  start?: StartPos;
  walls?: boolean;
  shared?: boolean;
  stanceEach?: boolean;
  stances?: AiProfile[];
  skills?: AiDifficulty[];
  rng?: () => number;
  /** Shared lockstep seed. Crates and attack gaps use this instead of Math.random. */
  seed?: number;
  /** A map made in the editor. Sent once by the room host. */
  custom?: CustomMap;
  /** True when that seat is an AI raider. Seat 0 stays human in a local skirmish. */
  cpu?: boolean[];
  /**
   * Lockstep camps. When the room has already agreed on start positions,
   * every client uses these instead of rolling corners again.
   */
  slots?: { x: number; y: number }[];
  /** You, enemy, then the two extra bots. */
  seatFactions?: FactionId[];
}
export function footprintOrigin(kind: BuildingId, wx: number, wy: number): { tx: number; ty: number } {
  const d = BUILDINGS[kind];
  // Center the footprint on the world point under the finger. screenToWorld already
  // folds in pitch and the camera; the finger is in CSS pixels, the same space as the view.
  return {
    tx: Math.round(wx - d.w / 2),
    ty: Math.round(wy - d.h / 2),
  };
}

/** Ghost copy. The sim keeps the precise reason; the phone shows one of these. */
export function shortPlaceReason(reason: string): string {
  if (!reason) return "";
  const r = reason.toLowerCase();
  if (r.includes("unit")) return "On unit";
  if (r.includes("credit") || r.includes("fund")) return "Insufficient funds";
  if (r.includes("power")) return "No power";
  if (r.includes("crystal")) return "On ore";
  if (r.includes("too far")) return "Too far";
  if (r.startsWith("needs ")) return reason;
  return "Blocked";
}

/** Phrase drawn on the footprint. Keeps the real cause instead of collapsing it. */
export function ghostPlaceReason(reason: string): string {
  if (!reason) return "";
  const r = reason.toLowerCase();
  if (r.includes("off the map")) return "Off map";
  if (r.includes("crystal")) return "On crystal";
  if (r.includes("overlap") || r.includes("unit")) return "Overlapping";
  if (r.includes("too far")) return "Out of build radius";
  if (r.includes("water")) return "That's water";
  if (r.includes("rock")) return "Blocked by rock";
  if (r.includes("shore")) return "Shore only";
  if (r.includes("credit") || r.includes("fund")) return "Insufficient funds";
  if (r.includes("power")) return "No power";
  return reason;
}

function hypot(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Bresenham polyline. Screen drags become a tile run; consecutive repeats drop out. */
export function traceTiles(points: { x: number; y: number }[]): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  const push = (tx: number, ty: number) => {
    const last = out[out.length - 1];
    if (last && last.tx === tx && last.ty === ty) return;
    out.push({ tx, ty });
  };
  if (!points.length) return out;
  let x0 = Math.floor(points[0].x);
  let y0 = Math.floor(points[0].y);
  push(x0, y0);
  for (let i = 1; i < points.length; i++) {
    const x1 = Math.floor(points[i].x);
    const y1 = Math.floor(points[i].y);
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x);
    const sx = x < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y);
    const sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 128; guard++) {
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
      push(x, y);
    }
    x0 = x1;
    y0 = y1;
  }
  return out;
}

export class Sim {
  readonly mapId: MapId;
  readonly mapName: string;
  readonly playerFaction: FactionId;
  readonly enemyFaction: FactionId;
  readonly seatChart: [FactionId, FactionId, FactionId, FactionId];
  readonly navy: boolean;
  readonly mode: ModeId;
  readonly ai: AiProfile;
  readonly difficulty: AiDifficulty;
  readonly skills: [AiDifficulty, AiDifficulty, AiDifficulty];
  readonly fogOn: boolean;
  readonly cratesOn: boolean;
  /** Practice skirmish. The bot does not attack or build. */
  practice = false;
  readonly mapSize: MapSizeId;
  readonly opponents: OpponentCount;
  readonly teamMode: TeamMode;
  readonly startPos: StartPos;
  readonly wallsOn: boolean;
  readonly sharedVision: boolean;
  readonly stanceEach: boolean;
  readonly stances: [AiProfile, AiProfile, AiProfile];
  readonly alliance: number[];
  theater: Theater = "desert";
  readonly gw: number;
  readonly gh: number;
  readonly surviveFor = SURVIVE_SECONDS;
  readonly starts: {
    player: { x: number; y: number };
    enemy: { x: number; y: number };
    slots: { x: number; y: number }[];
    corners: { id: string; x: number; y: number }[];
  };

  terrain: Uint8Array;
  crystal: Uint16Array;
  /** Shell holes and civilian damage. 0 clean, 1 scar, 2 rubble. Not a ground type. */
  craters: Uint8Array = new Uint8Array();
  /** Bumps when a tile id changes so the sheet can rebake. */
  groundRev = 0;
  /** -1 is free. A living refinery claims nearby crystal until that commander falls. */
  crystalOwner: Int8Array;
  readonly occ: Int32Array;
  fog: Uint8Array[];

  units: Unit[] = [];
  buildings: Building[] = [];
  shots: Shot[] = [];
  fx: Fx[] = [];
  logs: string[] = [];
  credits: number[] = [START_CREDITS, START_CREDITS, 0, 0];
  startCredits = START_CREDITS;
  income: number[] = [0, 0, 0, 0];
  crates: Crate[] = [];
  /** Opening crates wait until deployment ends, then drop once. */
  private cratesOpened = false;
  /** Short repair aura from a mend crate. Game clock, per seat. */
  private mendUntil = [0, 0, 0, 0];
  /** Heavy center haul has already dropped. */
  haulLanded = false;
  /** Seconds of Emergency Works still running, per seat. */
  worksLeft: number[] = [0, 0, 0, 0];
  worksCd: number[] = [0, 0, 0, 0];
  /** Seconds of Recon March still running. Infantry only. */
  marchLeft: number[] = [0, 0, 0, 0];
  marchCd: number[] = [0, 0, 0, 0];
  /** Headquarters upgrades. Each step raises the command-point cap. */
  commandLv: number[] = [0, 0, 0, 0];
  commandLeft: number[] = [0, 0, 0, 0];
  lead = 0;
  time = 0;
  outcome: "playing" | "win" | "lose" = "playing";
  reason = "";
  hadYard: boolean[] = [false, false, false, false];
  /** True after "Last building!" so a rebuild can warn again. */
  private lastOne = [false, false, false, false];
  eliminated: boolean[] = [false, false, false, false];
  /** Units this seat destroyed. */
  statKills: number[] = [0, 0, 0, 0];
  /** Units this seat lost. */
  statLost: number[] = [0, 0, 0, 0];
  /** Buildings this seat destroyed. Walls and bridges do not count. */
  statRazed: number[] = [0, 0, 0, 0];
  /** Buildings this seat lost. */
  statPlants: number[] = [0, 0, 0, 0];
  /** Seconds this seat had enough power. */
  statPower: number[] = [0, 0, 0, 0];
  /** Match time when the seat was eliminated. 0 while they are still in. */
  statOut: number[] = [0, 0, 0, 0];
  aiNext = 70;
  /** Per-seat attack clock so extra opponents don't share one wave. */
  aiAt: number[] = [0, 70, 78, 86];
  /** Host debug readout. Idle, scout, attack, expand, or defend. */
  aiIntent: AiIntent[] = ["idle", "idle", "idle", "idle"];
  aiHurt: boolean[] = [false, false, false, false];
  aiContact: boolean[] = [false, false, false, false];
  aiScouted: boolean[] = [false, false, false, false];
  aiPoked: boolean[] = [false, false, false, false];
  aiPushed: boolean[] = [false, false, false, false];
  aiAlert: ({ x: number; y: number; until: number } | null)[] = [null, null, null, null];
  aiGoal: ({ x: number; y: number } | null)[] = [null, null, null, null];
  impulse = 0;
  onSfx?: (name: SfxName) => void;
  /** Structured audio. Side effect only — not part of the checksum. */
  onCue?: (c: Cue) => void;
  /** Seat this client listens to. Does not change orders or combat. */
  ear: Team = 0;

  private nextId = 1;
  private aiAcc = 1;
  private rateAcc = 0;
  private sfxAt = new Map<string, number>();
  private constructBed = false;
  private brownBed = false;
  private lowNag = 0;
  /** True after this team has finished a power plant. Opening yards are not a brownout. */
  private gridOn: boolean[] = [false, false, false, false];
  private incomeAt: number[] = [0, 0, 0, 0];
  rate: number[] = [0, 0, 0, 0];
  private logLock = new Map<string, number>();
  private fenceFail = "";
  private readonly blockFn = (x: number, y: number) => this.blockedTile(x, y);
  /** Lockstep pause bits, one per seat. The sim keeps ticking so phones stay aligned. */
  pauseBits = 0;
  frozen = false;
  cpu: boolean[] = [false, true, true, true];
  marks: MapMark[] = [];
  /** Green move pings and red attack pings. Client-local drawing. */
  pings: OrderPing[] = [];
  /** Muzzle flashes that punch a hole in the fog. Deterministic. */
  spots: Spot[] = [];
  /** Last-known enemy marks. Drawing only; both clients update them the same way. */
  ghosts: Ghost[] = [];
  /** Enemy halls remembered after they leave line of sight. */
  seenHalls: SeenHall[] = [];
  /** Wrecks, fences, and crates drawn on top of the paint. Not blocking. */
  fieldProps: FieldProp[] = [];
  /** Where each seat was last shot. The phone recenters on the viewer's alarm. */
  alarm: ({ x: number; y: number; until: number } | null)[] = [null, null, null, null];
  rng: Rng | null = null;
  seed = 0;

  constructor(opts: NewGame) {
    const custom = opts.custom ? unpack(opts.custom) : null;
    const mapSize = custom ? lobbySize(custom) : normalizeSize(opts.mapSize);
    const gw = custom ? custom.w : MAP_SIZE[mapSize];
    const gh = custom ? custom.h : MAP_SIZE[mapSize];
    this.mapSize = mapSize;
    this.gw = gw;
    this.gh = gh;
    const base = custom ? null : generateMap(opts.mapId);
    const map = base && base.terrain.length === gw * gh ? base : base ? resampleMap(base, gw) : null;
    const deep = custom ? offersNavy(custom) : false;
    this.mapId = custom ? (deep ? "coast" : "dry") : map!.id;
    this.mapName = custom ? custom.name : map!.name;
    this.theater = custom?.theater ?? theaterOf(this.mapId);
    this.playerFaction = opts.faction;
    this.enemyFaction = opts.seatFactions?.[1] ?? opts.enemy ?? otherFaction(opts.faction);
    this.seatChart = opts.seatFactions?.length === 4
      ? [opts.seatFactions[0]!, opts.seatFactions[1]!, opts.seatFactions[2]!, opts.seatFactions[3]!]
      : [
          this.playerFaction,
          this.enemyFaction,
          spareFaction(this.playerFaction, this.enemyFaction, 0),
          spareFaction(this.playerFaction, this.enemyFaction, 1),
        ];
    this.navy = custom ? deep : !navyHidden(opts.mapId);
    this.mode = opts.mode;
    this.ai = opts.ai ?? "builder";
    this.difficulty = normalizeDifficulty(opts.difficulty);
    const skillAt = (n: number) => normalizeDifficulty(opts.skills?.[n] ?? opts.difficulty);
    this.skills = [skillAt(0), skillAt(1), skillAt(2)];
    this.fogOn = opts.fog !== false;
    this.cratesOn = !!opts.crates;
    this.opponents = opts.opponents === 2 || opts.opponents === 3 ? opts.opponents : 1;
    this.teamMode = normalizeTeams(opts.teams);
    this.startPos = normalizeStart(opts.start);
    this.wallsOn = opts.walls !== false;
    this.sharedVision = opts.shared !== false;
    this.stanceEach = opts.stanceEach === true;
    const stance = (n: number): AiProfile => {
      const v = opts.stances?.[n];
      return v === "passive" || v === "raider" || v === "builder" ? v : this.ai;
    };
    this.stances = [stance(0), stance(1), stance(2)];
    this.seed = opts.seed != null ? opts.seed >>> 0 : 0;
    this.rng = opts.seed != null ? new Rng(this.seed) : null;
    if (opts.cpu) {
      this.cpu = [false, false, false, false];
      for (let i = 0; i < 4; i++) this.cpu[i] = !!opts.cpu[i];
    }
    this.alliance = alliances(this.opponents, this.teamMode);
    this.aiNext = firstPushAt(this.difficulty);
    this.aiAt = [0, this.aiNext, this.aiNext + 8, this.aiNext + 16];
    const purse = opts.credits ?? START_CREDITS;
    this.startCredits = purse;
    this.credits = [0, 0, 0, 0];
    for (let t = 0; t <= this.opponents; t++) this.credits[t] = purse;
    if ((BUILD_ORDER as readonly string[]).includes("silo")) {
      console.warn("VIRIDITE: Silo is on the build list (data.ts BUILD_ORDER). Do not cap haul() with storageOf.");
    }
    if (this.credits[0] < purse) throw new Error("skirmish credit cap: sim.ts haul() must not clamp with storageOf");
    this.terrain = custom ? custom.terrain : map!.terrain;
    this.craters = new Uint8Array(gw * gh);
    this.crystal = custom ? custom.crystal : map!.crystal;
    this.crystalOwner = new Int8Array(gw * gh);
    this.crystalOwner.fill(-1);
    const seatCount = Math.max(2, Math.min(4, (opts.opponents === 2 || opts.opponents === 3 ? opts.opponents : 1) + 1));
    const corners = custom ? [] : plantCorners(this.terrain, this.crystal, gw, waterKind(map!.id));
    const fixed =
      opts.slots && opts.slots.length >= seatCount
        ? opts.slots.slice(0, seatCount).map((s) => ({ x: s.x, y: s.y }))
        : null;
    const slots = fixed
      ? fixed
      : custom
        ? custom.starts.slice(0, seatCount).map((s) => ({ x: s.x, y: s.y }))
        : orderCorners(corners, this.startPos, seatCount, this.rng ? () => (this.rng!.nextU32() + 0.5) / 4294967296 : (opts.rng ?? Math.random)).map((s) =>
            snapLand(this.terrain, gw, s.x, s.y),
          );
    while (slots.length < seatCount && slots[0]) slots.push(slots[slots.length - 1]!);
    this.starts = { player: slots[0]!, enemy: slots[1] ?? slots[0]!, slots, corners };
    this.fieldProps = custom
      ? dressProps(this.terrain, gw, gh, slots)
      : dressBattlefield(this.terrain, this.crystal, gw, gh, slots, this.mapId);
    if (!custom) seedScars(this.craters, this.terrain, this.crystal, gw, gh, slots, this.mapId);
    this.occ = new Int32Array(gw * gh);
    this.fog = [0, 1, 2, 3].map(() => new Uint8Array(gw * gh));
    if (!opts.empty) {
      for (const s of slots) stampCamp(this.terrain, this.crystal, s.x, s.y, gw, gh);
      if (!custom) {
        fairNearbyOre(this.terrain, this.crystal, gw, gh, slots);
        fairExpansionOre(this.terrain, this.crystal, gw, gh, slots);
      }
      this.seedPods();
      if (!custom && this.mapId === "michigan") {
        evenMichiganFields(this.terrain, this.crystal, gw, gh, slots);
        fairExpansionOre(this.terrain, this.crystal, gw, gh, slots);
        evenMichiganFields(this.terrain, this.crystal, gw, gh, slots);
      }
      openBuildPads(this.terrain, this.crystal, gw, gh, slots);
      if (!custom && this.mapId === "michigan") {
        widenNorthwest(this.terrain, this.crystal, gw, gh, slots);
        paveMichigan(this.terrain, this.crystal, gw, gh, slots);
        plantMichiganHeart(this.terrain, this.crystal, gw, gh, slots);
        matchNorthwestOre(this.terrain, this.crystal, gw, gh, slots);
        shelveNorthwest(this.terrain, this.crystal, gw, gh, slots);
      }
      this.clearStartClutter(slots);
      for (let t = 0; t <= this.opponents; t++) {
        const at = slots[t] ?? slots[0]!;
        this.spawnUnit(t as Team, "mcv", at.x, at.y);
      }
      const spans = custom ? custom.spans : (map?.spans ?? []);
      for (const span of spans) this.addBuilding(0, "span", span.tx, span.ty, true, true);
      if (custom) for (const dock of custom.docks) this.addBuilding(0, "dock", dock.tx, dock.ty, true, true);
      this.plantOutposts();
      this.updateFog();
    }
  }

  /** 0 .. n-1. Seeded in a net match; Math.random only for local skirmish. */
  roll(n: number): number {
    if (n <= 1) return 0;
    if (this.rng) return this.rng.int(n);
    return Math.floor(Math.random() * n);
  }

  setPause(seat: number, on: boolean) {
    if (seat < 0 || seat > 3) return;
    if (on) this.pauseBits |= 1 << seat;
    else this.pauseBits &= ~(1 << seat);
    this.frozen = this.pauseBits !== 0;
  }

  addMark(seat: number, x: number, y: number, mark: string) {
    this.marks.push({ x, y, seat, mark, life: 8 });
    if (this.marks.length > 12) this.marks.shift();
  }

  cancelTrain(buildingId: number, team: Team) {
    const b = this.buildingById(buildingId);
    if (!b || b.team !== team || b.hp <= 0 || !b.queue.length) return;
    const kind = b.queue.pop();
    if (!kind) return;
    if (!b.queue.length) b.prod = 0;
    const refund = resolveUnit(kind, this.factionOf(team)).cost;
    this.credits[team] += refund;
  }

  /** Refund one queued unit of this type. The in-progress item, if removed, starts the next from zero. */
  cancelQueued(buildingId: number, team: Team, unitId: UnitId) {
    const b = this.buildingById(buildingId);
    if (!b || b.team !== team || b.hp <= 0 || !b.queue.length) return;
    let idx = -1;
    for (let i = b.queue.length - 1; i >= 0; i--) {
      if (b.queue[i] === unitId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    b.queue.splice(idx, 1);
    if (idx === 0) b.prod = 0;
    this.credits[team] += resolveUnit(unitId, this.factionOf(team)).cost;
  }

  /** Integer fingerprint of the match. Two lockstep clients must print the same number. */
  checksum(): number {
    let h = Math.round(this.time * 10) | 0;
    for (let t = 0; t < 4; t++) h = Math.imul(h ^ (this.credits[t] | 0), 16777619);
    const units = this.units.filter((u) => u.hp > 0).sort((a, b) => a.id - b.id);
    for (const u of units) {
      h = Math.imul(h ^ u.id, 16777619);
      h = Math.imul(h ^ (u.hp | 0), 16777619);
      h = Math.imul(h ^ Math.round(u.x * 16), 16777619);
      h = Math.imul(h ^ Math.round(u.y * 16), 16777619);
      h = Math.imul(h ^ u.order.t.charCodeAt(0), 16777619);
    }
    const buildings = this.buildings.filter((b) => b.hp > 0).sort((a, b) => a.id - b.id);
    for (const b of buildings) {
      h = Math.imul(h ^ b.id, 16777619);
      h = Math.imul(h ^ (b.hp | 0), 16777619);
      h = Math.imul(h ^ (b.mending ? 1 : 0), 16777619);
      h = Math.imul(h ^ b.tx, 16777619);
      h = Math.imul(h ^ b.ty, 16777619);
      h = Math.imul(h ^ b.team, 16777619);
    }
    h = Math.imul(h ^ this.crates.length, 16777619);
    h = Math.imul(h ^ (this.haulLanded ? 1 : 0), 16777619);
    for (let t = 0; t < 4; t++) {
      h = Math.imul(h ^ this.commandLv[t]!, 16777619);
      h = Math.imul(h ^ Math.round(this.worksLeft[t]! * 10), 16777619);
      h = Math.imul(h ^ Math.round(this.marchLeft[t]! * 10), 16777619);
      h = Math.imul(h ^ this.statKills[t]!, 16777619);
      h = Math.imul(h ^ this.statLost[t]!, 16777619);
      h = Math.imul(h ^ this.statRazed[t]!, 16777619);
      h = Math.imul(h ^ this.statPlants[t]!, 16777619);
    }
    return h >>> 0;
  }

  factionOf(team: Team): FactionId {
    return this.seatChart[team > 3 ? 3 : team] ?? this.playerFaction;
  }

  difficultyOf(team: Team): AiDifficulty {
    if (team <= 0) return this.difficulty;
    return this.skills[team - 1] ?? this.difficulty;
  }

  /** Opening truce. Attacks and hostile starts are closed. */
  deploying(): boolean {
    return this.outcome === "playing" && this.time < DEPLOY_SECS;
  }

  /** True when this point sits in an enemy deployment bubble. */
  hostileStart(team: number, x: number, y: number): boolean {
    if (!this.deploying()) return false;
    for (let t = 0; t <= this.opponents; t++) {
      if (this.allied(team, t)) continue;
      const s = this.starts.slots[t];
      if (s && Math.hypot(x - s.x, y - s.y) < START_BUBBLE) return true;
    }
    return false;
  }

  /** Push a destination back to the rim of any hostile start during deployment. */
  quietPoint(team: number, x: number, y: number): { x: number; y: number } {
    if (!this.deploying()) return { x, y };
    let px = x;
    let py = y;
    for (let n = 0; n < 4; n++) {
      let hit = false;
      for (let t = 0; t <= this.opponents; t++) {
        if (this.allied(team, t)) continue;
        const s = this.starts.slots[t];
        if (!s) continue;
        const dx = px - s.x;
        const dy = py - s.y;
        const d = Math.hypot(dx, dy);
        if (d < START_BUBBLE) {
          const k = (START_BUBBLE + 0.25) / (d || 0.01);
          px = s.x + dx * k;
          py = s.y + dy * k;
          hit = true;
        }
      }
      if (!hit) break;
    }
    return {
      x: Math.max(1.2, Math.min(this.gw - 1.2, px)),
      y: Math.max(1.2, Math.min(this.gh - 1.2, py)),
    };
  }

  stanceOf(team: Team): AiProfile {
    if (!this.stanceEach || team === 0) return this.ai;
    return this.stances[team - 1] ?? this.ai;
  }

  /**
   * Seat paint from TEAM_STYLES. Slot 0 is cyan, then orange, purple, yellow.
   * A fallen commander goes gray. Red and green are health, never a team.
   */
  seatColor(team: number, _viewer = this.ear): string {
    if (this.eliminated[team]) return "#8d8478";
    return teamStyle(team).color;
  }

  seatShape(team: number) {
    return teamStyle(team).shape;
  }

  /** Same alliance. Free-for-all is never friendly across seats. One opponent matches the old 1v1. */
  allied(a: number, b: number): boolean {
    if (a === b) return true;
    return (this.alliance[a] ?? a) === (this.alliance[b] ?? b);
  }

  /** Where an Attack order should walk. Nearest live enemy structure, else their start. */
  pushTarget(team: Team): { x: number; y: number } {
    const home = this.starts.slots[team] ?? (team === 0 ? this.starts.player : this.starts.enemy);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.hp <= 0 || b.neutral || this.allied(team, b.team)) continue;
      const x = b.tx + b.w / 2;
      const y = b.ty + b.h / 2;
      const d = Math.hypot(x - home.x, y - home.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    if (best) return best;
    for (let t = 0; t < this.starts.slots.length; t++) {
      if (this.allied(team, t)) continue;
      const slot = this.starts.slots[t];
      if (slot) return slot;
    }
    return team === 0 ? this.starts.enemy : this.starts.player;
  }

  /** Post-match row. Time is how long they lasted. Power is the share of that time the lights stayed on. */
  scorecard(team: Team): { lasted: number; kills: number; lost: number; razed: number; plants: number; power: number } {
    const lasted = this.statOut[team]! > 0 ? this.statOut[team]! : this.time;
    const power = lasted > 0.5 ? Math.min(100, Math.round((this.statPower[team]! / lasted) * 100)) : 0;
    return {
      lasted,
      kills: this.statKills[team] ?? 0,
      lost: this.statLost[team] ?? 0,
      razed: this.statRazed[team] ?? 0,
      plants: this.statPlants[team] ?? 0,
      power,
    };
  }

  /** Army, base, and kills. Used when a hard match is called at twenty minutes. */
  private matchScore(side: number): number {
    let n = 0;
    for (let t = 0; t <= this.opponents; t++) {
      if ((this.alliance[t] ?? t) !== side) continue;
      const team = t as Team;
      n += (this.statKills[team] ?? 0) * 120;
      n += (this.statRazed[team] ?? 0) * 200;
      n += (this.credits[team] ?? 0) * 0.15;
      const faction = this.factionOf(team);
      for (const u of this.units) {
        if (u.team !== team || u.hp <= 0) continue;
        n += resolveUnit(u.kind, faction).cost * (u.hp / Math.max(1, u.maxHp));
      }
      for (const b of this.buildings) {
        if (b.team !== team || b.hp <= 0 || b.neutral) continue;
        n += resolveBuilding(b.kind, faction).cost * 0.35 * (b.hp / Math.max(1, b.maxHp));
      }
    }
    return n;
  }

  powerOf(team: Team): { supply: number; use: number; low: boolean } {
    let supply = 0;
    let use = 0;
    let plant = false;
    for (const b of this.buildings) {
      if (b.neutral || b.team !== team || b.hp <= 0 || !b.complete) continue;
      supply += b.powerOut;
      use += b.powerUse;
      if (b.kind === "power" || b.kind === "advpower") plant = true;
    }
    if (plant) this.gridOn[team] = true;
    return { supply, use, low: !!this.gridOn[team] && use > supply };
  }

  /**
   * Reserved power. 1 while the grid covers every building, 0 with no supply
   * once a plant has run, otherwise supply / demand. The first plant still
   * builds at full speed because the grid is not on yet.
   */
  powerFactor(team: Team): number {
    const live = this.powerOf(team);
    if (!this.gridOn[team]) return 1;
    if (live.use <= live.supply) return 1;
    if (live.supply <= 0) return 0;
    return live.supply / live.use;
  }

  storageOf(team: Team): number {
    let n = START_STORAGE;
    for (const b of this.buildings) {
      if (b.team === team && b.kind === "silo" && b.complete && b.hp > 0) n += b.storage;
    }
    return n;
  }

  unitById(id: number): Unit | undefined {
    return this.units.find((u) => u.id === id);
  }

  buildingById(id: number): Building | undefined {
    return this.buildings.find((b) => b.id === id);
  }

  tileVisible(team: Team, tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return false;
    if (!this.fogOn) return true;
    const fog = this.fog[team];
    if (!fog) return false;
    return fog[ty * this.gw + tx] === 2;
  }

  visibleUnit(viewer: Team, u: Unit): boolean {
    if (u.hp <= 0 || u.aboard) return false;
    if (this.allied(u.team, viewer)) return true;
    // Aircraft stay invisible until they enter current vision. Radar is minimap-only.
    if (!this.tileVisible(viewer, u.x | 0, u.y | 0)) return false;
    if (this.inCover(u) && u.reveal <= 0 && !this.coverBroken(viewer, u) && !this.sensorNear(viewer, u)) return false;
    if (u.stealth && u.reveal <= 0 && !this.detected(viewer, u)) return false;
    return true;
  }

  /**
   * Minimap blip. A powered Radar Mast draws every enemy aircraft, including
   * those still outside vision. Without it, air shows only while you can see it.
   */
  minimapUnit(viewer: Team, u: Unit): boolean {
    if (u.hp <= 0 || u.aboard) return false;
    if (this.allied(u.team, viewer)) return true;
    if (u.loco === "air" && this.radarOn(viewer)) return true;
    return this.visibleUnit(viewer, u);
  }

  radarOn(team: Team): boolean {
    if (!this.fogOn) return true;
    if (this.powerOf(team).low) return false;
    return this.buildings.some((b) => b.team === team && b.special === "radar" && b.complete && b.hp > 0);
  }

  buildingVisible(viewer: Team, b: Building): boolean {
    if (b.hp <= 0) return false;
    if (b.neutral || this.allied(b.team, viewer)) return true;
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        if (this.tileVisible(viewer, x, y)) return true;
      }
    }
    return false;
  }

  pickAt(wx: number, wy: number, zoom: number, viewer: Team): { kind: "unit" | "building"; id: number } | null {
    const building = this.pickBuilding(wx, wy, zoom, viewer);
    if (building && wx >= building.tx && wx <= building.tx + building.w && wy >= building.ty && wy <= building.ty + building.h) {
      return { kind: "building", id: building.id };
    }
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (!this.visibleUnit(viewer, u)) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      const r = Math.max(u.radius, unitPickRadius(u.kind, zoom));
      if (d <= r && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    if (best) return { kind: "unit", id: best.id };
    if (building) return { kind: "building", id: building.id };
    return null;
  }

  /** Building under a finger. The pad is at least 44 px, and it includes the picture above the footprint. */
  pickBuilding(wx: number, wy: number, zoom: number, viewer: Team): Building | null {
    const z = Math.max(8, zoom);
    const padX = 44 / z;
    // Ground Y is scaled by pitch, so 44 screen pixels is a taller world pad on Dry Basin and Coastline.
    const padY = padX / Math.max(0.5, viewPitch());
    let best: Building | null = null;
    let bestD = Infinity;
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      if (b.hp <= 0 || b.rubble > 0 || !this.buildingVisible(viewer, b)) continue;
      const lift = hallPictureLift(b.kind, b.w, b.h);
      const y0 = Math.min(b.ty, b.ty + b.h - lift) - padY;
      const y1 = b.ty + b.h + padY;
      if (wx < b.tx - padX || wx > b.tx + b.w + padX || wy < y0 || wy > y1) continue;
      const cx = Math.max(b.tx, Math.min(wx, b.tx + b.w));
      const cy = Math.max(b.ty, Math.min(wy, b.ty + b.h));
      const d = Math.hypot(wx - cx, wy - cy);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  unitsInRect(x0: number, y0: number, x1: number, y1: number, team: Team): number[] {
    const minx = Math.min(x0, x1);
    const maxx = Math.max(x0, x1);
    const miny = Math.min(y0, y1);
    const maxy = Math.max(y0, y1);
    const ids: number[] = [];
    for (const u of this.units) {
      if (u.team !== team || u.hp <= 0) continue;
      if (u.x >= minx && u.x <= maxx && u.y >= miny && u.y <= maxy) ids.push(u.id);
    }
    return ids;
  }

  canPlace(team: Team, kind: BuildingId, tx: number, ty: number): PlaceResult {
    if (!this.hasYard(team)) return { ok: false, reason: "Needs a yard" };
    if (isFence(kind)) {
      const step = this.previewFence(team, kind, [{ tx, ty }])[0];
      if (!step || !step.ok) return { ok: false, reason: step?.reason || "Blocked" };
      return { ok: true, reason: "" };
    }
    const def = resolveBuilding(kind, this.factionOf(team));
    if (tx < 1 || ty < 1 || tx + def.w >= this.gw - 1 || ty + def.h >= this.gh - 1) {
      return { ok: false, reason: "Off the map" };
    }
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        const i = y * this.gw + x;
        if (this.terrain[i] === TILE_ROCK || this.terrain[i] === TILE_CLIFF) return { ok: false, reason: "Blocked by rock" };
        if (this.terrain[i] === TILE_DEEP || this.terrain[i] === TILE_SHALLOW || this.terrain[i] === TILE_WRECK) {
          return { ok: false, reason: "That's water" };
        }
        if (this.terrain[i] === TILE_SCRUB) return { ok: false, reason: "Blocked" };
        if (isShell(this.terrain[i] ?? 0) && (this.craters[i] ?? 0) < 2) return { ok: false, reason: "Blocked" };
        if (def.shore && this.terrain[i] !== TILE_SHORE) return { ok: false, reason: "Shore only" };
        if (!def.shore && this.terrain[i] === TILE_SHORE && kind !== "wall") {
          /* shore is legal for a land pad that isn't a dock */
        }
        if (this.crystal[i] > 0) return { ok: false, reason: "Can't build on crystal" };
        if (this.occ[i] !== 0) return { ok: false, reason: "Overlapping" };
        if (this.unitBlocksTile(x, y, 0)) return { ok: false, reason: "Unit in the way" };
      }
    }
    if (kind === "span") return { ok: false, reason: "Bridges are already placed" };
    if (kind === "dock" && !this.navy) return { ok: false, reason: "No harbor on this map" };
    if (!canBuild(kind, this.factionOf(team))) return { ok: false, reason: "Other faction" };
    if (this.structureCount(team) >= BUILDING_CAP) return { ok: false, reason: "Base full" };
    if (def.requires && !this.buildings.some((b) => b.team === team && b.kind === def.requires && b.complete && b.hp > 0)) {
      return { ok: false, reason: `Needs ${BUILDINGS[def.requires].short}` };
    }
    if (!this.nearFriendly(team, tx, ty, def.w, def.h)) {
      return { ok: false, reason: "Too far from your buildings" };
    }
    if (this.powerOf(team).low && kind !== "power" && kind !== "advpower") return { ok: false, reason: "Low power" };
    const live = this.powerOf(team);
    if (def.powerUse > def.powerOut && live.use + def.powerUse > live.supply + def.powerOut) {
      return { ok: false, reason: "Needs more power" };
    }
    if (this.credits[team] < def.cost) return { ok: false, reason: "Not enough credits" };
    return { ok: true, reason: "" };
  }

  /**
   * Prefer the cell under the finger. If it is illegal, take the nearest legal
   * cell on a small ring so the ghost sticks without hunting the whole map.
   */
  snapFootprint(team: Team, kind: BuildingId, tx: number, ty: number, radius = 3): { tx: number; ty: number } {
    if (radius <= 0 || this.canPlace(team, kind, tx, ty).ok) return { tx, ty };
    for (let r = 1; r <= radius; r++) {
      let pickX = tx;
      let pickY = ty;
      let pickD = 1e9;
      let found = false;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.canPlace(team, kind, tx + dx, ty + dy).ok) continue;
          const d = dx * dx + dy * dy;
          if (!found || d < pickD) {
            found = true;
            pickD = d;
            pickX = tx + dx;
            pickY = ty + dy;
          }
        }
      }
      if (found) return { tx: pickX, ty: pickY };
    }
    return { tx, ty };
  }

  tryPlace(team: Team, kind: BuildingId, tx: number, ty: number): PlaceResult {
    if (isFence(kind)) {
      const n = this.placeFence(team, kind, [{ tx, ty }]);
      return n > 0 ? { ok: true, reason: "" } : { ok: false, reason: this.fenceFail || "Blocked" };
    }
    const check = this.canPlace(team, kind, tx, ty);
    if (!check.ok) {
      if (team === this.ear) {
        const funds = check.reason === "Not enough credits";
        const low = check.reason === "Low power" || check.reason === "Needs more power";
        this.say(funds ? "Insufficient funds" : check.reason, "place", 0.6);
        if (funds) this.cue({ t: "voice", id: "funds" });
        else if (low) this.cue({ t: "voice", id: "lowPower" });
        else this.cue({ t: "sfx", id: "error" });
      }
      return check;
    }
    const def = resolveBuilding(kind, this.factionOf(team));
    this.credits[team] -= def.cost;
    this.addBuilding(team, kind, tx, ty, false);
    if (team === this.ear) {
      this.say(`${def.name} placed`);
      this.cue({ t: "sfx", id: "place" });
      this.cue({ t: "voice", id: "building" });
    } else if (team === 0) this.say(`${def.name} placed`);
    return { ok: true, reason: "" };
  }

  queueUnit(buildingId: number, unitId: UnitId): PlaceResult {
    const b = this.buildingById(buildingId);
    if (!b || b.hp <= 0 || !b.complete) return { ok: false, reason: "Not ready" };
    const faction = this.factionOf(b.team);
    if (!canTrain(unitId, faction)) return { ok: false, reason: "Unavailable" };
    const spec = resolveUnit(unitId, faction);
    if (!this.navy && (spec.loco === "sea" || spec.trainedAt === "dock")) {
      return { ok: false, reason: "No navy on this map" };
    }
    const slot =
      b.kind === "barracks" ? "barracks" : b.kind === "factory" ? "factory" : b.kind === "dock" ? "dock" : b.kind === "helipad" ? "helipad" : null;
    if (spec.trainedAt !== slot) return { ok: false, reason: "Wrong building" };
    const tech = unitRequires(unitId);
    if (tech && !this.buildings.some((h) => h.team === b.team && h.kind === tech && h.complete && h.hp > 0 && h.rubble <= 0)) {
      const need = BUILDINGS[tech].short;
      if (b.team === this.ear || b.team === 0) this.say(`Needs ${need}`, "tech", 0.8);
      return { ok: false, reason: `Needs ${need}` };
    }
    const needTier = airTier(unitId);
    const tier = 1 + (this.commandLv[b.team] ?? 0);
    if (needTier > tier) {
      if (b.team === this.ear || b.team === 0) this.say(`HQ ${needTier}`, "tech", 0.8);
      return { ok: false, reason: `HQ ${needTier}` };
    }
    if (b.kind === "helipad") {
      const parked = this.units.filter((u) => u.hp > 0 && u.home === b.id && u.loco === "air").length;
      if (parked + b.queue.length >= 3) return { ok: false, reason: "Pad holds 3" };
    }
    if (b.queue.length >= 5) return { ok: false, reason: "Queue full" };
    if (this.credits[b.team] < spec.cost) {
      if (b.team === this.ear) {
        this.say("Insufficient funds", "credits", 0.8);
        this.cue({ t: "voice", id: "funds" });
      } else if (b.team === 0) this.say("Not enough credits", "credits", 0.8);
      return { ok: false, reason: "Not enough credits" };
    }
    if (this.countLiving(b.team) + this.queuedCount(b.team) >= UNIT_CAP) {
      return { ok: false, reason: "Unit cap" };
    }
    const load = this.commandLoad(b.team, true);
    if (load + commandCost(spec) > this.commandCap(b.team)) {
      if (b.team === this.ear || b.team === 0) this.say("Command points full", "cp", 1.2);
      return { ok: false, reason: "Command points full" };
    }
    this.credits[b.team] -= spec.cost;
    b.queue.push(unitId);
    return { ok: true, reason: "" };
  }

  setRally(buildingId: number, x: number, y: number, team: Team = 0) {
    const b = this.buildingById(buildingId);
    if (!b || b.team !== team) return;
    b.rallyX = x;
    b.rallyY = y;
    this.say("Rally set", "rally", 0.4);
  }

  /** Command points from the HQ tier. Extra yards do not stack. */
  commandCap(team: Team): number {
    return HQ_CP * (1 + (this.commandLv[team] ?? 0));
  }

  commandLoad(team: Team, includeQueue: boolean): number {
    let n = 0;
    for (const u of this.units) {
      if (u.team !== team || u.hp <= 0) continue;
      n += commandCost(u);
    }
    if (!includeQueue) return n;
    for (const b of this.buildings) {
      if (b.team !== team || b.hp <= 0) continue;
      for (const id of b.queue) n += commandCost(resolveUnit(id, this.factionOf(team)));
    }
    return n;
  }

  commandUsed(team: Team): number {
    return this.commandLoad(team, true);
  }

  /**
   * Credits per second from the yard and supply centers. Zero until a plant is up.
   * Each later supply center pays a smaller share. A short grid still pays, slower.
   * There is no credit storage cap.
   */
  supplyPerSec(team: Team): number {
    if (this.eliminated[team]) return 0;
    const factor = this.powerFactor(team);
    if (!this.gridOn[team] || factor <= 0) return 0;
    let n = 0;
    const supplies: Building[] = [];
    for (const b of this.buildings) {
      if (b.team !== team || !b.complete || b.hp <= 0 || b.neutral) continue;
      if (b.kind === "yard") n += YARD_DRIP;
      else if (b.kind === "supply") supplies.push(b);
      else if (b.kind === "silo") n += SILO_DRIP;
    }
    supplies.sort((a, b) => a.id - b.id);
    for (let i = 0; i < supplies.length; i++) n += SUPPLY_DRIP * supplyShare(i);
    return n * factor;
  }

  /** Spend credits at the yard to raise the command cap. Takes time. */
  raiseCommand(team: Team): PlaceResult {
    if (this.commandLeft[team]! > 0) return { ok: false, reason: "Already raising command" };
    if ((this.commandLv[team] ?? 0) >= CP_MAX) return { ok: false, reason: "Command is maxed" };
    const yard = this.buildings.some((b) => b.team === team && b.kind === "yard" && b.complete && b.hp > 0);
    if (!yard) return { ok: false, reason: "Needs a yard" };
    const lv = this.commandLv[team] ?? 0;
    const cost = HQ_COST[lv] ?? HQ_COST[HQ_COST.length - 1] ?? 0;
    if (this.credits[team] < cost) {
      if (team === this.ear) this.say("Insufficient funds", "credits", 0.8);
      return { ok: false, reason: "Not enough credits" };
    }
    this.credits[team] -= cost;
    this.commandLeft[team] = HQ_TIME[lv] ?? HQ_TIME[HQ_TIME.length - 1] ?? 14;
    if (team === this.ear) this.say("Raising command");
    return { ok: true, reason: "" };
  }

  /** Opening boosts. Works rush construction. March speeds infantry and widens their sight. */
  useBoost(team: Team, which: "works" | "march") {
    const left = which === "works" ? this.worksLeft : this.marchLeft;
    const cd = which === "works" ? this.worksCd : this.marchCd;
    if (left[team]! > 0 || cd[team]! > 0) {
      if (team === this.ear) this.say(which === "works" ? "Works cooling down" : "March cooling down", "boost", 0.8);
      return;
    }
    if (which === "works") {
      this.worksLeft[team] = 18;
      this.worksCd[team] = 80;
      if (team === this.ear) this.say("Emergency works");
    } else {
      this.marchLeft[team] = 14;
      this.marchCd[team] = 70;
      if (team === this.ear) this.say("Recon march");
    }
  }

  issueMove(ids: number[], x: number, y: number, attackMove: boolean) {
    const units = this.idsToUnits(ids).filter((u) => this.groundOrder(u));
    if (!units.length) return;
    let cx = 0;
    let cy = 0;
    let pace = 0;
    let marchers = 0;
    for (const u of units) {
      cx += u.x;
      cy += u.y;
      if (u.loco !== "air") {
        pace = marchers === 0 ? u.speed : Math.min(pace, u.speed);
        marchers++;
      }
    }
    cx /= units.length;
    cy /= units.length;
    if (marchers < 2) pace = 0;
    let fx = x - cx;
    let fy = y - cy;
    const fl = Math.hypot(fx, fy) || 1;
    fx /= fl;
    fy /= fl;
    const rx = -fy;
    const ry = fx;
    const n = units.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const gap = 1.15;
    units.forEach((u, i) => {
      const col = (i % cols) - (cols - 1) / 2;
      const row = Math.floor(i / cols) - (rows - 1) / 2;
      const ox = rx * col * gap - fx * row * gap * 0.85;
      const oy = ry * col * gap - fy * row * gap * 0.85;
      const quiet = this.quietPoint(u.team, x + ox, y + oy);
      const goal = this.domainGoal(u, quiet.x, quiet.y);
      u.order = { t: "move", x: goal.x, y: goal.y, attackMove: attackMove && u.damage > 0 && !this.deploying() };
      u.pace = u.loco === "air" ? 0 : pace;
      u.ring = -1;
      u.path = [];
      u.repath = 0;
      u.deploy = 0;
      u.breach = 0;
      this.requestPath(u, u.order.x, u.order.y, true);
    });
    if (units.some((u) => u.team === this.ear)) {
      const mine = units.find((u) => u.team === this.ear);
      if (mine) this.cue({ t: "bark", cls: barkClass(mine.kind), act: attackMove ? "attack" : "move" });
      this.blip(attackMove ? "attack" : "move", 0.05, x, y);
      this.pings.push(
        attackMove
          ? { kind: "amove", x, y, fx: cx, fy: cy, life: 1.8 }
          : { kind: "move", x, y, life: 1.2 },
      );
      if (this.pings.length > 8) this.pings.shift();
    }
  }

  issueAttack(ids: number[], targetId: number) {
    const target = this.targetById(targetId);
    if (!target) return;
    const team = target.kind === "unit" ? target.u.team : target.b.team;
    const wreckedSpan = target.kind === "building" && target.b.kind === "span" && target.b.rubble > 0 && target.b.hp > 0;
    const liveSpan = target.kind === "building" && target.b.kind === "span" && target.b.hp > 0;
    const neutralBuilding = target.kind === "building" && target.b.neutral && target.b.kind !== "span" && target.b.rubble <= 0;
    let any = false;
    let mine: Unit | null = null;
    const fighters: Unit[] = [];
    for (const u of this.idsToUnits(ids)) {
      if (!liveSpan && !neutralBuilding && this.allied(u.team, team)) continue;
      if (target.kind === "unit" && target.u.loco === "air" && !u.hitsAir) {
        if (u.team === 0) this.say("Can't target aircraft", "noair", 0.7);
        continue;
      }
      if (!this.groundOrder(u)) continue;
      if (target.kind === "building" && target.b.prize && u.armor === "infantry") {
        const tile = this.approachTile(target.b, u, 1.65);
        const p = tile ? { x: tile.x + 0.5, y: tile.y + 0.5 } : this.targetPoint(target);
        u.order = { t: "move", x: p.x, y: p.y, attackMove: false };
        u.path = [];
        u.capture = 0;
        any = true;
        continue;
      }
      if (u.damage <= 0) {
        const wreck = target.kind === "building" && target.b.kind === "span" && target.b.rubble > 0;
        const capture =
          u.kind === "engineer" &&
          target.kind === "building" &&
          (wreck || (target.b.kind !== "span" && (target.b.neutral || !this.allied(u.team, target.b.team))));
        if (capture) {
          u.order = { t: "capture", id: targetId };
          u.path = [];
          u.capture = 0;
          any = true;
          continue;
        }
        const p = this.targetPoint(target);
        u.order = { t: "move", x: p.x, y: p.y, attackMove: false };
        u.path = [];
        this.requestPath(u, p.x, p.y, true);
        continue;
      }
      u.order = { t: "attack", id: targetId };
      u.path = [];
      u.repath = 0;
      u.deploy = 0;
      u.breach = 0;
      u.pace = 0;
      fighters.push(u);
      any = true;
      if (u.team === this.ear) mine = u;
    }
    const n = fighters.length;
    fighters.forEach((u, i) => {
      u.ring = n <= 1 ? Math.atan2(u.y - this.targetPoint(target).y, u.x - this.targetPoint(target).x) : (i / n) * Math.PI * 2;
    });
    if (any) {
      if (mine) this.cue({ t: "bark", cls: barkClass(mine.kind), act: "attack" });
      const p = this.targetPoint(target);
      this.blip("attack", 0.05, p.x, p.y);
      if (mine) {
        this.pings.push({ kind: "attack", x: p.x, y: p.y, life: 1.35 });
        if (this.pings.length > 8) this.pings.shift();
      }
    }
  }

  issueStop(ids: number[]) {
    for (const u of this.idsToUnits(ids)) {
      if (!this.groundOrder(u)) continue;
      u.order = { t: "idle" };
      u.path = [];
      u.deploy = 0;
      u.breach = 0;
      u.pace = 0;
      u.ring = -1;
      u.postX = u.x;
      u.postY = u.y;
    }
  }

  issueGuard(ids: number[]) {
    for (const u of this.idsToUnits(ids)) {
      if (!this.groundOrder(u)) continue;
      u.order = { t: "guard", x: u.x, y: u.y };
      u.path = [];
      u.deploy = 0;
      u.breach = 0;
      u.pace = 0;
      u.ring = -1;
      u.postX = u.x;
      u.postY = u.y;
    }
    this.blip("select");
  }

  /** Spread the selection around its own center. Integer angles, no match seed. */
  issueScatter(ids: number[]) {
    const units = this.idsToUnits(ids).filter((u) => this.groundOrder(u));
    if (!units.length) return;
    let cx = 0;
    let cy = 0;
    for (const u of units) {
      cx += u.x;
      cy += u.y;
    }
    cx /= units.length;
    cy /= units.length;
    const n = units.length;
    units.forEach((u, i) => {
      const a = (i / n) * Math.PI * 2;
      const rad = 1.8 + (i % 3) * 0.35;
      const goal = this.domainGoal(u, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      u.order = { t: "move", x: goal.x, y: goal.y, attackMove: false };
      u.path = [];
      u.repath = 0;
      u.deploy = 0;
      this.requestPath(u, goal.x, goal.y, true);
    });
    this.blip("move", 0.05);
  }

  issueHarvest(ids: number[]) {
    let any = false;
    for (const u of this.idsToUnits(ids)) {
      if (u.kind !== "harvester") continue;
      u.order = { t: "harvest" };
      u.path = [];
      u.repath = 0;
      u.harvestTx = -1;
      any = true;
    }
    if (any) this.blip("move");
    else this.say("Select a harvester", "harvest", 0.8);
  }

  /** Send harvesters home to dump, even if the bay is not full. */
  issueReturn(ids: number[]) {
    let any = false;
    for (const u of this.idsToUnits(ids)) {
      if (u.kind !== "harvester") continue;
      u.order = { t: "return" };
      u.path = [];
      u.repath = 0;
      any = true;
    }
    if (any) {
      this.blip("move");
      if (this.idsToUnits(ids).some((u) => u.team === this.ear)) this.say("Returning to refinery", "return", 0.6);
    }
  }

  /** Toggle paid repairs. One credit restores four hit points, a few times a second. */
  issueRepair(id: number, team: Team) {
    const b = this.buildingById(id);
    if (!b || b.hp <= 0 || b.neutral || b.kind === "span" || b.rubble > 0 || !b.complete) return;
    if (b.team !== team) return;
    if (b.hp >= b.maxHp) {
      b.mending = false;
      if (team === this.ear) this.say("Nothing to repair", "repair", 0.6);
      return;
    }
    b.mending = !b.mending;
    if (team === this.ear) this.say(b.mending ? "Repairing" : "Repair stopped", "repair", 0.5);
  }

  sellBuilding(id: number, team: Team = 0): PlaceResult {
    const b = this.buildingById(id);
    if (!b || b.hp <= 0 || b.neutral || b.kind === "span" || b.rubble > 0) return { ok: false, reason: "Can't sell" };
    if (b.team !== team) return { ok: false, reason: "Not yours" };
    const refund = Math.floor(BUILDINGS[b.kind].cost * 0.5);
    for (const kind of b.queue) {
      this.credits[team] += resolveUnit(kind, this.factionOf(team)).cost;
    }
    b.queue = [];
    this.credits[team] += refund;
    this.clearOcc(b);
    b.hp = 0;
    this.say(`Sold for ${refund}`);
    this.buildings = this.buildings.filter((x) => x.hp > 0);
    return { ok: true, reason: "" };
  }

  issueLoad(ids: number[]) {
    const hosts = this.idsToUnits(ids).filter((u) => u.capInf + u.capLight > 0 && !u.aboard);
    if (!hosts.length) {
      this.say("Select a transport", "load", 0.8);
      return;
    }
    let n = 0;
    for (const host of hosts) {
      for (const u of this.units) {
        if (u.team !== host.team || u.hp <= 0 || u.id === host.id || u.aboard) continue;
        if (Math.hypot(u.x - host.x, u.y - host.y) > 1.35) continue;
        const light = u.armor !== "infantry" && u.loco !== "air" && u.loco !== "sea" && u.kind !== "mcv" && u.kind !== "harvester";
        if (u.armor === "infantry" && host.riders.filter((id) => this.unitById(id)?.armor === "infantry").length < host.capInf) {
          this.embark(host, u);
          n++;
        } else if (light && u.armor !== "heavy" && host.riders.filter((id) => this.unitById(id)?.armor !== "infantry").length < host.capLight) {
          this.embark(host, u);
          n++;
        }
      }
    }
    this.say(n ? `Loaded ${n}` : "Nobody close enough", "load", 0.6);
  }

  issueUnload(ids: number[]) {
    let n = 0;
    for (const host of this.idsToUnits(ids)) {
      if (!host.riders.length) continue;
      if (host.kind === "transport" && !this.onShore(host.x, host.y)) {
        if (host.team === 0) this.say("Beach on the shore", "unload", 0.8);
        continue;
      }
      const riders = host.riders.slice();
      host.riders = [];
      for (const id of riders) {
        const u = this.unitById(id);
        if (!u) continue;
        const spot = this.dropSpot(host, u);
        u.aboard = 0;
        u.x = spot.x;
        u.y = spot.y;
        u.px = spot.x;
        u.py = spot.y;
        u.order = { t: "idle" };
        n++;
      }
    }
    if (n) this.say(`Unloaded ${n}`, "unload", 0.4);
  }

  private embark(host: Unit, u: Unit) {
    u.aboard = host.id;
    u.order = { t: "idle" };
    u.path = [];
    host.riders.push(u.id);
    u.x = host.x;
    u.y = host.y;
  }

  private onShore(x: number, y: number): boolean {
    const tx = x | 0;
    const ty = y | 0;
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return false;
    return this.terrain[ty * this.gw + tx] === TILE_SHORE;
  }

  private dropSpot(host: Unit, rider: Unit): { x: number; y: number } {
    let beach: { x: number; y: number } | null = null;
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = (host.x + dx) | 0;
          const ty = (host.y + dy) | 0;
          if (!this.passable(rider, tx, ty)) continue;
          const t = this.terrain[ty * this.gw + tx];
          if (t !== TILE_SHORE && t !== TILE_BRIDGE) return { x: tx + 0.5, y: ty + 0.5 };
          beach ??= { x: tx + 0.5, y: ty + 0.5 };
        }
      }
      if (beach) return beach;
    }
    return beach ?? { x: host.x, y: host.y };
  }

  issueDeploy(ids: number[]) {
    for (const u of this.idsToUnits(ids)) {
      if (u.kind !== "mcv") continue;
      const spot = this.deploySpot(u);
      if (!spot.ok) {
        if (u.team === this.ear) {
          this.say(spot.reason, "deploy", 0.5);
          this.cue({ t: "sfx", id: "error" });
        }
        continue;
      }
      u.order = { t: "deploy" };
      u.path = [];
      u.deploy = 0;
    }
  }

  spawnUnit(team: Team, kind: UnitId, x: number, y: number): Unit | null {
    if (this.countLiving(team) >= UNIT_CAP) {
      if (team === 0) this.say("Unit cap reached", "cap", 2);
      return null;
    }
    const spec = resolveUnit(kind, this.factionOf(team));
    const flying = locoOf(spec) === "air";
    const open = flying ? null : nearestOpen(x | 0, y | 0, this.blockFn, 4, this.gw, this.gh);
    const px = open ? open.x + (x - Math.floor(x)) : x;
    const py = open ? open.y + (y - Math.floor(y)) : y;
    const u: Unit = {
      id: this.nextId++,
      kind,
      team,
      name: spec.name,
      x: this.clampCoord(open ? open.x + 0.5 : px),
      y: this.clampCoord(open ? open.y + 0.5 : py),
      px: 0,
      py: 0,
      hp: spec.hp,
      maxHp: spec.hp,
      facing: team === 0 ? -Math.PI / 2 : Math.PI / 2,
      cooldown: 0,
      cargo: 0,
      cargoMax: spec.cargo,
      order: kind === "harvester" ? { t: "harvest" } : { t: "idle" },
      path: [],
      repath: 0,
      harvestTx: -1,
      harvestTy: -1,
      deploy: 0,
      reveal: 0,
      stuck: 0,
      speed: spec.speed,
      sight: spec.sight,
      damage: spec.damage,
      range: spec.range,
      rof: spec.rof,
      radius: spec.radius,
      armor: spec.armor,
      shot: spec.shot,
      vsInf: spec.vsInf,
      vsVeh: spec.vsVeh,
      vsBld: spec.vsBld,
      stealth: spec.stealth,
      loco: locoOf(spec),
      hitsAir: !!spec.hitsAir,
      capInf: spec.capInf ?? 0,
      capLight: spec.capLight ?? 0,
      riders: [],
      aboard: 0,
      home: 0,
      baseStealth: spec.stealth,
      rearm: 0,
      capture: 0,
      ammo: spec.magazine ?? 0,
      ammoMax: spec.magazine ?? 0,
      rearmFor: spec.rearmFor ?? 0,
      sortie: 0,
      vsAir: spec.vsAir ?? 0,
      blocked: 0,
      hit: 0,
      aggro: 0,
      aggroUntil: 0,
      kills: 0,
      gather: 0,
      breach: 0,
      minRange: spec.minRange ?? (kind === "artillery" ? 3.15 : 0),
      postX: 0,
      postY: 0,
      pace: 0,
      ring: -1,
    };
    u.px = u.x;
    u.py = u.y;
    u.postX = u.x;
    u.postY = u.y;
    // Aircraft ignore the ground grid — a rock or a yard does not shove them off their flight point.
    if (flying || !this.blockedTile(x | 0, y | 0)) {
      u.x = x;
      u.y = y;
      u.px = x;
      u.py = y;
    }
    this.units.push(u);
    return u;
  }

  /** Practice: bot holds, one small base with no guns, and 20,000 credits. Combat starts immediately. */
  startPractice() {
    this.practice = true;
    (this as { ai: AiProfile }).ai = "passive";
    (this as { stances: [AiProfile, AiProfile, AiProfile] }).stances = ["passive", "passive", "passive"];
    (this as { fogOn: boolean }).fogOn = false;
    this.time = DEPLOY_SECS;
    this.credits[0] = 20000;
    this.startCredits = 20000;
    for (const u of this.units) {
      if (u.team !== 0) u.hp = 0;
    }
    for (const b of this.buildings) {
      if (b.team === 0 || b.neutral || b.kind === "span") continue;
      b.hp = 0;
      b.collapse = 0;
      b.rubble = 0;
      this.clearOcc(b);
    }
    const player = this.starts.player;
    const home = this.starts.slots[1] ?? this.starts.enemy;
    const dx = home.x - player.x;
    const dy = home.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const near = this.findPad(Math.round(player.x + (dx / dist) * 14), Math.round(player.y + (dy / dist) * 14), 3, 3);
    const spot = near ?? { x: Math.round(player.x + 12), y: Math.round(player.y) };
    const yard = this.addBuilding(1, "yard", spot.x, spot.y, true);
    this.addBuilding(1, "power", yard.tx + yard.w + 1, yard.ty, true);
    this.addBuilding(1, "barracks", yard.tx, yard.ty + yard.h + 1, true);
    for (let i = 0; i < 6; i++) this.spawnUnit(0, "rifle", player.x + 1.5 + (i % 3), player.y + 2 + ((i / 3) | 0));
    this.spawnUnit(0, "engineer", player.x + 2.5, player.y + 4);
    this.say("Practice. The bot will not attack.", "practice", 6);
  }

  tick(dt: number) {
    if (this.outcome !== "playing") return;
    if (this.frozen) return;
    this.time += dt;
    for (const u of this.units) {
      u.px = u.x;
      u.py = u.y;
      if (u.hit > 0) u.hit = Math.max(0, u.hit - dt);
    }
    for (const s of this.shots) {
      s.px = s.x;
      s.py = s.y;
    }
    this.tickBuildings(dt);
    this.tickSupply(dt);
    this.tickBoosts(dt);
    for (const u of this.units) {
      if (u.blocked > 0) u.blocked = Math.max(0, u.blocked - dt);
      if (u.hp > 0 && this.liveUnit(u)) this.tickUnit(u, dt);
    }
    this.crushWalls(dt);
    this.tickCollapse(dt);
    this.tickRubble(dt);
    this.separate();
    this.tickPrizes(dt);
    this.tickShots(dt);
    this.tickTowers(dt);
    this.tickCrates(dt);
    this.tickMend(dt);
    this.tickBaseHeal(dt);
    this.tickIncome(dt);
    this.applyCloak();
    this.sweep();
    this.updateFog();
    this.decayFx(dt);
    this.decayContact(dt);
    this.tallyPower(dt);
    if (this.marks.length) {
      for (const m of this.marks) m.life -= dt;
      if (this.marks.some((m) => m.life <= 0)) this.marks = this.marks.filter((m) => m.life > 0);
    }
    if (this.pings.length) {
      for (const p of this.pings) p.life -= dt;
      if (this.pings.some((p) => p.life <= 0)) this.pings = this.pings.filter((p) => p.life > 0);
    }
    this.aiAcc += dt;
    if (this.aiAcc >= 1) {
      this.aiAcc = 0;
      this.runAi();
    }
    this.checkEnd();
    this.syncBeds();
  }

  toSave(): SimSave {
    const crystal: number[] = [];
    for (let i = 0; i < this.crystal.length; i++) {
      if (this.crystal[i] > 0) crystal.push(i, this.crystal[i]);
    }
    return {
      v: 1,
      mapId: this.mapId,
      faction: this.playerFaction,
      enemy: this.enemyFaction,
      mode: this.mode,
      time: this.time,
      outcome: this.outcome,
      reason: this.reason,
      credits: this.credits.slice(0, 4),
      startCredits: this.startCredits,
      ai: this.ai,
      difficulty: this.difficulty,
      fog: this.fogOn,
      crates: this.cratesOn,
      caches: this.crates.map((c) => ({ x: c.x, y: c.y, kind: c.kind })),
      haulLanded: this.haulLanded,
      commandLv: this.commandLv.slice(0, 4),
      mapSize: this.mapSize,
      opponents: this.opponents,
      teams: this.teamMode,
      start: this.startPos,
      walls: this.wallsOn,
      shared: this.sharedVision,
      stanceEach: this.stanceEach,
      stances: this.stances.slice() as AiProfile[],
      skills: this.skills.slice() as AiDifficulty[],
      eliminated: this.eliminated.slice(0, 4),
      slots: this.starts.slots.map((s) => ({ x: s.x, y: s.y })),
      nextId: this.nextId,
      aiNext: this.aiNext,
      hadYard: this.hadYard.slice(0, 4),
      score: {
        kills: this.statKills.slice(0, 4),
        lost: this.statLost.slice(0, 4),
        razed: this.statRazed.slice(0, 4),
        plants: this.statPlants.slice(0, 4),
        power: this.statPower.slice(0, 4),
        out: this.statOut.slice(0, 4),
      },
      crystal,
      fog0: packFog(this.fog[0] ?? new Uint8Array()),
      fog1: packFog(this.fog[1] ?? new Uint8Array()),
      fog2: packFog(this.fog[2] ?? new Uint8Array()),
      fog3: packFog(this.fog[3] ?? new Uint8Array()),
      units: this.units
        .filter((u) => u.hp > 0)
        .map((u) => ({
          id: u.id,
          kind: u.kind,
          team: u.team,
          x: u.x,
          y: u.y,
          hp: u.hp,
          facing: u.facing,
          cargo: u.cargo,
          order: u.order,
          harvestTx: u.harvestTx,
          harvestTy: u.harvestTy,
          deploy: u.deploy,
          reveal: u.reveal,
          ammo: u.ammo,
          rearm: u.rearm,
          sortie: u.sortie,
        })),
      buildings: this.buildings
        .filter((b) => b.hp > 0)
        .map((b) => ({
          id: b.id,
          kind: b.kind,
          team: b.team,
          tx: b.tx,
          ty: b.ty,
          hp: b.hp,
          complete: b.complete,
          buildLeft: b.buildLeft,
          queue: b.queue.slice(),
          prod: b.prod,
          rallyX: b.rallyX,
          rallyY: b.rallyY,
          open: b.open,
          rubble: b.rubble,
          neutral: b.neutral,
          mending: b.mending,
          prize: b.prize || undefined,
        })),
    };
  }

  /** Restore a saved match. Returns null if the payload is unusable. */
  static fromSave(raw: unknown): Sim | null {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as SimSave;
    if (data.v !== 1 || !data.mapId || !data.faction || !Array.isArray(data.units)) return null;
    const opponents = data.opponents === 2 || data.opponents === 3 ? data.opponents : 1;
    const savedSlots = Array.isArray(data.slots)
      ? data.slots.filter((s) => s && typeof s.x === "number" && typeof s.y === "number").map((s) => ({ x: s.x, y: s.y }))
      : [];
    const sim = new Sim({
      mapId: data.mapId,
      faction: data.faction,
      enemy: data.enemy ?? otherFaction(data.faction),
      mode: data.mode ?? "destroy",
      empty: true,
      credits: data.startCredits ?? data.credits?.[0],
      ai: data.ai,
      difficulty: normalizeDifficulty(data.difficulty),
      fog: data.fog,
      crates: data.crates,
      mapSize: normalizeSize(data.mapSize),
      opponents,
      teams: normalizeTeams(data.teams),
      start: normalizeStart(data.start),
      walls: data.walls,
      shared: data.shared,
      stanceEach: data.stanceEach,
      stances: data.stances,
      skills: Array.isArray(data.skills) ? data.skills : undefined,
      rng: () => 0,
      slots: savedSlots.length ? savedSlots : undefined,
    });
    const pristine = sim.crystal.slice();
    const amounts = new Map<number, number>();
    if (Array.isArray(data.crystal)) {
      for (let i = 0; i + 1 < data.crystal.length; i += 2) amounts.set(data.crystal[i], data.crystal[i + 1]);
    }
    for (let i = 0; i < pristine.length; i++) {
      if (pristine[i] > 0) {
        const a = amounts.get(i) ?? 0;
        sim.crystal[i] = a;
        if (a <= 0 && sim.terrain[i] !== TILE_SHORE && sim.terrain[i] !== TILE_ROAD) sim.terrain[i] = TILE_SPENT;
      }
    }
    if (Array.isArray(data.slots)) {
      for (const s of data.slots) {
        if (s && typeof s.x === "number" && typeof s.y === "number") stampCamp(sim.terrain, sim.crystal, s.x, s.y, sim.gw);
      }
    }
    sim.time = data.time || 0;
    sim.outcome = data.outcome === "win" || data.outcome === "lose" ? data.outcome : "playing";
    sim.reason = data.reason || "";
    sim.credits = [0, 0, 0, 0];
    for (let t = 0; t < 4; t++) {
      const saved = data.credits?.[t];
      sim.credits[t] = typeof saved === "number" ? saved : t <= sim.opponents ? sim.startCredits : 0;
      const lv = data.commandLv?.[t];
      sim.commandLv[t] = typeof lv === "number" ? Math.max(0, Math.min(CP_MAX, lv | 0)) : 0;
    }
    if (Array.isArray(data.caches)) {
      sim.crates = [];
      for (const c of data.caches) {
        if (!c || typeof c.x !== "number" || typeof c.y !== "number") continue;
        const kind = c.kind === "squad" || c.kind === "haul" || c.kind === "mend" ? c.kind : "cash";
        sim.crates.push({ x: c.x, y: c.y, kind });
      }
      sim.cratesOpened = true;
    } else {
      sim.cratesOpened = (data.time || 0) > DEPLOY_SECS;
    }
    sim.haulLanded = !!data.haulLanded || (data.time || 0) >= HAUL_AT;
    sim.nextId = data.nextId || 1;
    sim.aiNext = data.aiNext ?? 70;
    sim.aiAt = [0, sim.aiNext, sim.aiNext + 8, sim.aiNext + 16];
    sim.hadYard = [false, false, false, false];
    for (let t = 0; t < 4; t++) sim.hadYard[t] = !!data.hadYard?.[t];
    for (let t = 0; t < 4; t++) sim.eliminated[t] = !!data.eliminated?.[t];
    const score = data.score;
    if (score) {
      for (let t = 0; t < 4; t++) {
        sim.statKills[t] = score.kills?.[t] ?? 0;
        sim.statLost[t] = score.lost?.[t] ?? 0;
        sim.statRazed[t] = score.razed?.[t] ?? 0;
        sim.statPlants[t] = score.plants?.[t] ?? 0;
        sim.statPower[t] = score.power?.[t] ?? 0;
        sim.statOut[t] = score.out?.[t] ?? 0;
      }
    }
    unpackFog(data.fog0, sim.fog[0]);
    unpackFog(data.fog1, sim.fog[1]);
    if (data.fog2) unpackFog(data.fog2, sim.fog[2]);
    if (data.fog3) unpackFog(data.fog3, sim.fog[3]);
    for (const b of data.buildings ?? []) {
      const built = sim.addBuilding(b.team, b.kind, b.tx, b.ty, b.complete, b.kind === "span");
      sim.clearOcc(built);
      built.id = b.id;
      if (b.kind !== "span") sim.fillOcc(built);
      built.hp = Math.min(built.maxHp, b.hp);
      built.buildLeft = b.buildLeft;
      built.queue = Array.isArray(b.queue) ? b.queue.slice() : [];
      built.prod = b.prod || 0;
      built.rallyX = b.rallyX;
      built.rallyY = b.rallyY;
      built.open = typeof b.open === "boolean" ? b.open : built.kind === "gate";
      built.rubble = b.rubble ?? 0;
      built.neutral = b.kind === "span" || !!b.neutral;
      built.mending = !!b.mending;
      built.prize = !!b.prize;
      if (b.id >= sim.nextId) sim.nextId = b.id + 1;
    }
    for (const b of sim.buildings) {
      if (b.kind === "refinery" && b.complete && !b.neutral && b.hp > 0) sim.claimNodes(b);
    }
    for (const src of data.units) {
      const u = sim.spawnUnit(src.team, src.kind, src.x, src.y);
      if (!u) continue;
      u.id = src.id;
      u.hp = Math.min(u.maxHp, src.hp);
      u.facing = src.facing;
      u.cargo = src.cargo || 0;
      u.order = src.order ?? { t: "idle" };
      u.harvestTx = src.harvestTx ?? -1;
      u.harvestTy = src.harvestTy ?? -1;
      u.deploy = src.deploy || 0;
      u.reveal = src.reveal || 0;
      if (typeof src.ammo === "number") u.ammo = src.ammo;
      if (typeof src.rearm === "number") u.rearm = src.rearm;
      if (typeof src.sortie === "number") u.sortie = src.sortie;
      if (src.id >= sim.nextId) sim.nextId = src.id + 1;
      if (sim.eliminated[u.team]) {
        u.damage = 0;
        u.order = { t: "idle" };
        u.path = [];
      }
    }
    return sim;
  }

  private runAi() {
    if (this.practice) return;
    for (let t = 0; t <= this.opponents; t++) {
      if (!this.cpu[t]) continue;
      aiThink(this, t as Team);
    }
  }

  private tickRepair(b: Building, dt: number) {
    if (b.hp >= b.maxHp) {
      b.hp = b.maxHp;
      b.mending = false;
      if (b.team === this.ear) this.say("Repairs finished", "repair", 0.6);
      return;
    }
    const plant = b.kind === "power" || b.kind === "advpower";
    const pace = plant ? 1 : this.powerFactor(b.team);
    const budget = Math.min(this.credits[b.team] | 0, Math.ceil((b.maxHp - b.hp) / 4));
    const spend = Math.min(budget, Math.max(0, Math.round(8 * pace * dt)));
    if (spend <= 0) {
      if ((this.credits[b.team] | 0) < 1) {
        b.mending = false;
        if (b.team === this.ear) this.say("Not enough credits", "repair", 0.8);
      }
      return;
    }
    this.credits[b.team] -= spend;
    b.hp = Math.min(b.maxHp, b.hp + spend * 4);
    if (b.hp >= b.maxHp) {
      b.mending = false;
      if (b.team === this.ear) this.say("Repairs finished", "repair", 0.6);
    }
  }

  private tickBuildings(dt: number) {
    for (const b of this.buildings) {
      if (b.hp <= 0 || b.rubble > 0) continue;
      if (b.neutral || this.eliminated[b.team]) continue;
      if (!b.complete) {
        const plant = b.kind === "power" || b.kind === "advpower";
        const rush = this.worksLeft[b.team]! > 0 ? 1.65 : 1;
        const pace = plant ? 1 : this.powerFactor(b.team);
        b.buildLeft -= dt * pace * 1.25 * rush;
        const p = 1 - b.buildLeft / Math.max(0.01, b.buildTotal);
        b.hp = Math.max(1, b.maxHp * (0.12 + 0.88 * clamp01(p)));
        if (b.buildLeft <= 0) {
          b.complete = true;
          b.buildLeft = 0;
          b.hp = b.maxHp;
          if (b.team === this.ear) {
            this.say(`${b.name} complete`);
            this.cue({ t: "sfx", id: "build" });
            this.cue({ t: "voice", id: "constructDone" });
          } else if (b.team === 0) this.say(`${b.name} complete`);
          if (b.kind === "refinery") {
            const spot = this.exitCell(b, "land") ?? this.doorOf(b);
            const h = this.spawnUnit(b.team, "harvester", spot.x, spot.y);
            if (h) {
              h.x = spot.x;
              h.y = spot.y;
              h.px = spot.x;
              h.py = spot.y;
              h.order = { t: "harvest" };
            }
            this.claimNodes(b);
          }
        }
        if (b.hit > 0) b.hit = Math.max(0, b.hit - dt);
        continue;
      }
      if (b.hit > 0) b.hit = Math.max(0, b.hit - dt);
      if (b.mending) this.tickRepair(b, dt);
      if (!b.queue.length) continue;
      const rush = this.worksLeft[b.team]! > 0 ? 1.65 : 1;
      const burned = b.maxHp > 0 && b.hp / b.maxHp < 0.3 ? 0.55 : 1;
      b.prod += dt * this.powerFactor(b.team) * rush * burned;
      const spec = resolveUnit(b.queue[0], this.factionOf(b.team));
      if (b.prod >= spec.time) {
        const kind = b.queue[0];
        if (!kind) {
          b.queue.shift();
          continue;
        }
        const res = this.spawnFrom(b, kind);
        if (res === "retry") {
          b.prod = spec.time;
          continue;
        }
        b.queue.shift();
        b.prod = Math.max(0, b.prod - spec.time);
        if (res === "drop") {
          this.credits[b.team] += spec.cost;
          const capped = this.countLiving(b.team) >= UNIT_CAP;
          if (b.team === this.ear || b.team === 0) this.say(capped ? "Unit cap reached" : "Command points full", "cap", 2);
        }
        if (b.queue.length === 0) b.prod = 0;
      }
    }
  }

  /**
   * Put a finished trainee on an open exit tile and walk it to the rally.
   * "retry" means the door is blocked — the queue stays and we do not announce.
   * "drop" means the cap was hit — the caller refunds and does not announce.
   */
  private spawnFrom(b: Building, kind: UnitId): "ok" | "retry" | "drop" {
    const spec = resolveUnit(kind, this.factionOf(b.team));
    const loco = locoOf(spec);
    if (this.countLiving(b.team) >= UNIT_CAP) return "drop";
    if (this.commandLoad(b.team, false) + commandCost(spec) > this.commandCap(b.team)) return "drop";
    if (loco === "land" || loco === "amphib") this.shoveOffDoor(b);
    const spot = this.exitCell(b, loco);
    if (!spot) {
      if (b.team === this.ear) this.say("Exit blocked", "exit", 2);
      return "retry";
    }
    const u = this.spawnUnit(b.team, kind, spot.x, spot.y);
    if (!u) return "drop";
    u.x = spot.x;
    u.y = spot.y;
    u.px = spot.x;
    u.py = spot.y;
    u.home = b.id;
    const inside =
      u.x >= b.tx - 0.05 && u.x < b.tx + b.w + 0.05 && u.y >= b.ty - 0.05 && u.y < b.ty + b.h + 0.05;
    const buried = loco !== "air" && loco !== "sea" && (inside || !this.footOpen(u.x, u.y));
    if (buried) {
      // Do not announce. The queue holds and the corpse is swept this tick.
      u.hp = 0;
      if (b.team === this.ear) this.say("Exit blocked", "exit", 2);
      return "retry";
    }
    if (b.team === this.ear) {
      this.say(`${u.name} ready`, "ready", 0.35);
      this.cue({ t: "voice", id: "unitReady" });
    }
    if (kind === "harvester") {
      u.order = { t: "harvest" };
      return "ok";
    }
    const goal = this.rallyStand(u, b.rallyX, b.rallyY);
    u.order = { t: "move", x: goal.x, y: goal.y, attackMove: false };
    this.requestPath(u, goal.x, goal.y, true);
    return "ok";
  }

  private tickUnit(u: Unit, dt: number) {
    if (this.eliminated[u.team]) {
      u.order = { t: "idle" };
      u.path = [];
      return;
    }
    if (u.aboard) {
      const host = this.unitById(u.aboard);
      if (!host || host.hp <= 0) {
        u.aboard = 0;
      } else {
        u.x = host.x;
        u.y = host.y;
        u.px = host.x;
        u.py = host.y;
        return;
      }
    }
    if (u.cooldown > 0) u.cooldown -= dt;
    if (u.reveal > 0) u.reveal -= dt;
    if (u.repath > 0) u.repath -= dt;
    if (u.rearm > 0) {
      u.rearm -= dt;
      if (u.rearm > 0) return;
      u.rearm = 0;
      this.launchAgain(u);
      return;
    }
    if (u.ammoMax > 0 && u.ammo <= 0 && u.order.t !== "rearm" && this.padFor(u)) {
      this.beginRearm(u);
    }

    if (u.order.t === "deploy") {
      this.tickDeploy(u, dt);
      return;
    }
    if (u.kind === "harvester" && (u.order.t === "harvest" || u.order.t === "return")) {
      this.tickHarvest(u, dt);
      return;
    }
    if (u.order.t === "rearm") {
      this.tickRearm(u, dt);
      return;
    }
    if (u.kind === "engineer" && u.order.t === "capture") {
      this.tickCapture(u, dt);
      return;
    }

    if (this.deploying() && (u.order.t === "attack" || u.order.t === "move")) {
      this.holdFire(u, dt);
      return;
    }

    let engage = u.damage > 0 && !this.deploying() ? this.pickEngage(u) : null;
    if (u.order.t === "attack" && !engage) {
      // Target died. Auto-target the nearest living enemy building, then any foe.
      const next = this.nearestBuilding(u, 48) ?? this.nearestFoe(u.team, u.x, u.y, Math.max(u.sight, u.range + 0.4), u.hitsAir, false, false);
      if (next && !(next.kind === "building" && next.b.rubble > 0)) {
        u.order = { t: "attack", id: next.kind === "unit" ? next.u.id : next.b.id };
        u.path = [];
        if (u.ring < 0) {
          const p = this.targetPoint(next);
          u.ring = Math.atan2(u.y - p.y, u.x - p.x);
        }
        engage = next;
      } else {
        // Keep the order. Do not silently cancel.
        const held = this.targetById(u.order.id);
        if (held) engage = held;
      }
    }
    if (engage) {
      const d = this.distTo(u, engage);
      const hunting = u.kind === "gunboat" && engage.kind === "unit" && engage.u.loco === "sea";
      const chasing =
        hunting ||
        u.order.t === "attack" ||
        u.order.t === "idle" ||
        (u.order.t === "move" && u.order.attackMove);
      if (d < u.minRange && u.loco !== "air") {
        this.stepAway(u, engage, dt);
        return;
      }
      if (d <= this.reachOf(u.range, u.x, u.y, u.loco)) {
        this.tryShoot(u, engage);
        this.faceTarget(u, engage);
        if (u.kind === "bomber" && u.ammo > 0) {
          this.stepTowardTarget(u, engage, dt);
          return;
        }
        if (u.ammoMax > 0 && u.ammo <= 0) return;
        if (u.kind === "attackheli") return;
        if (u.order.t === "attack" || u.order.t === "idle" || u.order.t === "guard" || (u.order.t === "move" && u.order.attackMove)) {
          return;
        }
      } else if (chasing) {
        if (u.repath <= 0) u.path = [];
        const spread = u.order.t === "attack" && engage.kind === "unit" && u.loco !== "sea" && u.kind !== "bomber";
        if (spread) this.stepRing(u, engage, dt);
        else this.stepTowardTarget(u, engage, dt);
        return;
      }
    }

    if (u.order.t === "move") {
      if (hypot(u.x, u.y, u.order.x, u.order.y) < 0.32) {
        u.path = [];
        u.pace = 0;
        u.postX = u.x;
        u.postY = u.y;
        u.order = { t: "idle" };
        return;
      }
      this.navigate(u, u.order.x, u.order.y, dt);
      return;
    }
    if (u.order.t === "guard") {
      if (hypot(u.x, u.y, u.order.x, u.order.y) > 0.42) this.navigate(u, u.order.x, u.order.y, dt);
      return;
    }
    if (u.order.t === "idle" && hypot(u.x, u.y, u.postX, u.postY) > 0.55) {
      this.navigate(u, u.postX, u.postY, dt);
      return;
    }
    if (u.order.t === "attack" && engage) {
      if (engage.kind === "unit" && u.loco !== "sea" && u.kind !== "bomber") this.stepRing(u, engage, dt);
      else this.stepTowardTarget(u, engage, dt);
    }
  }

  /**
   * Deployment: nobody shoots. An attack or capture order is kept and resumes
   * when the clock ends. A march stops at the enemy start instead of walking in.
   */
  private holdFire(u: Unit, dt: number) {
    if (u.order.t === "attack" || u.order.t === "capture") {
      const t = this.targetById(u.order.id);
      if (!t) return;
      const p = this.targetPoint(t);
      const q = this.quietPoint(u.team, p.x, p.y);
      if (Math.hypot(u.x - q.x, u.y - q.y) > 0.45) this.navigate(u, q.x, q.y, dt);
      return;
    }
    if (u.order.t !== "move") return;
    const q = this.quietPoint(u.team, u.order.x, u.order.y);
    const armed = u.order.attackMove;
    if (armed || Math.hypot(q.x - u.order.x, q.y - u.order.y) >= 0.05) {
      u.order = { t: "move", x: q.x, y: q.y, attackMove: false };
      u.path = [];
      u.ring = -1;
    }
    this.navigate(u, u.order.x, u.order.y, dt);
  }

  private pickEngage(u: Unit): Target | null {
    if (u.order.t === "attack") {
      const t = this.targetById(u.order.id);
      if (!t) return null;
      const span = t.kind === "building" && t.b.kind === "span" && t.b.neutral && t.b.hp > 0;
      if (!span) {
        const team = t.kind === "unit" ? t.u.team : t.b.team;
        if (team === u.team || this.allied(team, u.team)) return null;
      }
      if (t.kind === "unit" && t.u.loco === "air" && !u.hitsAir) return null;
      if (t.kind === "unit" && !this.visibleUnit(u.team, t.u)) return t;
      const wall = this.liveBreach(u);
      if (wall && t.kind === "building" && !isFence(t.b.kind) && this.distTo(u, t) > this.reachOf(u.range, u.x, u.y, u.loco)) return wall;
      return t;
    }
    const roaming = u.order.t === "idle" || u.order.t === "guard" || (u.order.t === "move" && u.order.attackMove);
    if (u.kind === "gunboat" && roaming) {
      const boat = this.nearestBoat(u, u.sight);
      if (boat) return boat;
    }
    if (u.kind === "missile" && roaming) {
      const boat = this.nearestBoat(u, Math.max(u.sight, u.range));
      if (boat) return boat;
      const air = this.nearestAir(u, u.range);
      if (air) return air;
    }
    if (u.hitsAir && roaming && u.kind !== "missile") {
      const air = this.nearestAir(u, u.range);
      if (air) return air;
    }
    if (u.kind === "frigate" && roaming) {
      const shore = this.nearestStrike(u, u.range);
      if (shore) return shore;
    }
    if (u.order.t === "move" && u.order.attackMove) {
      const reach = this.reachOf(u.range, u.x, u.y, u.loco);
      const foe = this.nearestOnPath(u.team, u.x, u.y, reach + 1.2, u.hitsAir);
      if (foe) return foe;
      return this.liveBreach(u);
    }
    if (u.order.t === "guard") {
      const foe = this.nearestFoe(u.team, u.x, u.y, Math.max(u.range, u.minRange), u.hitsAir, false, false);
      if (foe && this.distTo(u, foe) <= this.reachOf(u.range, u.x, u.y, u.loco)) return foe;
      return this.returnFire(u);
    }
    if (u.order.t === "idle") {
      const reach = this.reachOf(u.range, u.x, u.y, u.loco);
      const foe = this.nearestFoe(u.team, u.x, u.y, Math.max(reach, Math.min(u.sight, reach + 2.2)), u.hitsAir, false, false);
      if (foe && !(foe.kind === "building" && foe.b.rubble > 0)) {
        const d = this.distTo(u, foe);
        if (foe.kind === "building" && d > reach) {
          /* a hall out of range is not a reason to wander */
        } else if (d <= reach || d < u.minRange) {
          return foe;
        } else {
          const p = this.targetPoint(foe);
          if (hypot(p.x, p.y, u.postX, u.postY) <= u.range + 2.4) return foe;
        }
      }
      return this.returnFire(u);
    }
    if (u.order.t === "move") {
      const back = this.returnFire(u);
      if (back) return back;
      // A reposition doesn't spend a magazine. Attack-move still engages above.
      if (u.ammoMax > 0 && !u.order.attackMove) return null;
      return this.nearestFoe(u.team, u.x, u.y, u.range * 0.95, u.hitsAir, false, false);
    }
    return null;
  }

  /**
   * Idle troops shoot back at whoever just hit them, and walk into range if
   * that shooter is still inside sight. Guard and a plain move only fire when
   * the shooter is already in range, so they do not abandon the order.
   */
  private returnFire(u: Unit): Target | null {
    if (u.damage <= 0 || !u.aggro || this.time > u.aggroUntil) return null;
    const t = this.targetById(u.aggro);
    if (!t || t.kind !== "unit" || t.u.hp <= 0 || t.u.aboard || this.allied(t.u.team, u.team)) return null;
    if (t.u.loco === "air" && !u.hitsAir) return null;
    const d = this.distTo(u, t);
    const reach = this.reachOf(u.range, u.x, u.y, u.loco);
    if (d <= reach || d < u.minRange) return t;
    if (u.order.t !== "idle") return null;
    if (d > Math.max(u.sight, reach)) return null;
    return t;
  }

  /** Spread a squad onto a ring at firing range so the rear ranks are not stuck in a file. */
  private stepRing(u: Unit, target: Target, dt: number) {
    const p = this.targetPoint(target);
    const stand = Math.max(u.minRange + 0.55, Math.min(u.range * 0.82, Math.max(1.2, u.range - 0.45)));
    const ang = u.ring >= 0 ? u.ring : Math.atan2(u.y - p.y, u.x - p.x);
    const goal = this.domainGoal(u, p.x + Math.cos(ang) * stand, p.y + Math.sin(ang) * stand);
    this.navigate(u, goal.x, goal.y, dt);
  }

  /** Artillery inside its minimum range backs out until the gun can elevate. */
  private stepAway(u: Unit, target: Target, dt: number) {
    const p = this.targetPoint(target);
    const dx = u.x - p.x;
    const dy = u.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const goal = this.domainGoal(u, u.x + (dx / dist) * (u.minRange + 0.7), u.y + (dy / dist) * (u.minRange + 0.7));
    this.navigate(u, goal.x, goal.y, dt);
  }

  private stepTowardTarget(u: Unit, target: Target, dt: number) {
    if (target.kind === "unit") {
      const goal = this.domainGoal(u, target.u.x, target.u.y);
      this.navigate(u, goal.x, goal.y, dt);
      return;
    }
    if (u.loco === "sea") {
      const p = this.targetPoint(target);
      const goal = this.domainGoal(u, p.x, p.y);
      this.navigate(u, goal.x, goal.y, dt);
      return;
    }
    const tile = this.approachTile(target.b, u, u.range);
    if (!tile) {
      // No open tile within weapon range of the edge. The building's own tiles are not the reason.
      if (u.order.t === "attack" && u.team === this.ear) u.blocked = Math.max(u.blocked, 0.45);
      const p = this.targetPoint(target);
      this.navigate(u, p.x, p.y, dt);
      return;
    }
    this.navigate(u, tile.x + 0.5, tile.y + 0.5, dt);
  }

  private standKind(u: Unit): "boat" | "amphib" | "infantry" | "vehicle" {
    if (u.loco === "sea") return "boat";
    if (u.loco === "amphib") return "amphib";
    if (u.armor === "infantry") return "infantry";
    return "vehicle";
  }

  /** The deck under this route is gone. Occupied tiles do not count — only the ground. */
  private routeBroken(u: Unit): boolean {
    if (u.loco === "air" || u.path.length === 0) return false;
    const who = this.standKind(u);
    for (const p of u.path) {
      const i = p.y * this.gw + p.x;
      if (i < 0 || i >= this.terrain.length) return true;
      if (!allows(this.terrain[i] ?? 0, who, this.craters[i] ?? 0)) return true;
    }
    return false;
  }

  private stepOffWreck(u: Unit) {
    if (u.loco === "air" || u.loco === "sea") return;
    const tx = u.x | 0;
    const ty = u.y | 0;
    const t = this.terrain[ty * this.gw + tx] ?? 0;
    if (t !== TILE_WRECK && t !== TILE_DEEP) return;
    const tile = this.nearestDomainTile(u, tx, ty, 8);
    if (!tile) return;
    u.x = tile.x + 0.5;
    u.y = tile.y + 0.5;
    u.path = [];
    u.repath = 0;
  }

  private navigate(u: Unit, x: number, y: number, dt: number) {
    this.stepOffWreck(u);
    if (this.routeBroken(u)) {
      u.path = [];
      u.repath = 0;
    }
    if (u.path.length === 0 && u.repath <= 0 && hypot(u.x, u.y, x, y) > 0.35) {
      this.requestPath(u, x, y, false);
      if (u.order.t === "idle") return;
    }
    let tx = x;
    let ty = y;
    if (u.path.length) {
      const p = u.path[0];
      tx = p.x + 0.5;
      ty = p.y + 0.5;
      if (hypot(u.x, u.y, tx, ty) < 0.32) {
        u.path.shift();
        if (u.path[0]) {
          tx = u.path[0].x + 0.5;
          ty = u.path[0].y + 0.5;
        } else {
          tx = x;
          ty = y;
        }
      }
    }
    this.moveToward(u, tx, ty, dt);
  }

  private moveToward(u: Unit, tx: number, ty: number, dt: number) {
    let dx = tx - u.x;
    let dy = ty - u.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.015) return;
    dx /= dist;
    dy /= dist;
    let speed = u.loco === "amphib" ? u.speed * 0.5 : u.speed;
    if (u.pace > 0 && u.order.t === "move") speed = Math.min(speed, u.pace);
    const under = this.terrain[(Math.floor(u.y) * this.gw + Math.floor(u.x)) | 0];
    const vehicle = u.armor === "vehicle" || u.armor === "heavy";
    if (under === TILE_FORD) speed *= 0.45;
    else if (under === TILE_SHALLOW && u.armor === "infantry") speed *= 0.5;
    else if (under === TILE_RAMP) speed *= vehicle ? 0.58 : 0.75;
    else if (under === TILE_VALLEY || (vehicle && under === TILE_ROUGH)) speed *= 0.72;
    else if (under === TILE_ROAD) speed *= 1.2;
    else if (under === TILE_SCRUB && u.armor === "infantry") speed *= 0.82;
    if (u.armor === "infantry" && this.marchLeft[u.team]! > 0) speed *= 1.4;
    if (u.kind === "tank" || u.kind === "medium") {
      const bag = this.buildingAtPoint(u.x, u.y);
      if (bag && bag.kind === "sandbag" && bag.complete && bag.rubble <= 0) speed = Math.min(speed, 0.34);
    }
    const step = Math.min(speed * dt, dist);
    const nx = u.x + dx * step;
    const ny = u.y + dy * step;
    if (this.passable(u, nx, ny) && this.gradeStep(u, nx, ny)) {
      u.x = nx;
      u.y = ny;
      u.facing = Math.atan2(dy, dx);
      u.stuck = 0;
      this.crushTree(u);
    } else if (this.passable(u, nx, u.y) && this.gradeStep(u, nx, u.y)) {
      u.x = nx;
      u.facing = Math.atan2(0, dx);
      u.stuck += dt;
    } else if (this.passable(u, u.x, ny) && this.gradeStep(u, u.x, ny)) {
      u.y = ny;
      u.facing = Math.atan2(dy, 0);
      u.stuck += dt;
    } else {
      u.stuck += dt;
    }
    if (u.stuck > 0.9) {
      u.stuck = 0;
      u.path = [];
      u.repath = 0;
    }
  }

  private tickHarvest(u: Unit, dt: number) {
    const ref = this.nearestRefinery(u.team);
    if (u.order.t === "return" && u.cargo <= 0) u.order = { t: "harvest" };
    const dumping = u.order.t === "return" || u.cargo >= u.cargoMax - 1 || (u.cargo > 20 && !this.anyCrystal());
    if (dumping) {
      const before = u.cargo;
      this.haul(u, ref, dt);
      if (u.order.t === "return" && before > 0 && u.cargo <= 0) u.order = { t: "harvest" };
      if (u.gather > 0) u.gather = Math.max(0, u.gather - dt);
      return;
    }
    const cell = this.adjacentCrystal(u.x, u.y, u.team);
    if (cell && u.cargo < u.cargoMax) {
      const i = cell.y * this.gw + cell.x;
      const take = Math.min(this.crystal[i], u.cargoMax - u.cargo, HARVEST_PER_SEC * dt);
      this.crystal[i] -= take;
      u.cargo += take;
      u.harvestTx = cell.x;
      u.harvestTy = cell.y;
      u.gather = 0.35;
      if (u.team === this.ear) this.blip("harvest", 0.32);
      if (this.crystal[i] <= 0) {
        this.crystal[i] = 0;
        const ground = this.terrain[i];
        if (
          ground === TILE_CRYSTAL ||
          ground === TILE_CLEAR ||
          ground === TILE_SAND ||
          ground === TILE_ROUGH ||
          ground === TILE_ROAD
        ) {
          this.terrain[i] = TILE_SPENT;
        }
      }
      return;
    }
    if (u.gather > 0) u.gather = Math.max(0, u.gather - dt);
    let gx = -1;
    let gy = -1;
    if (u.harvestTx >= 0 && this.crystal[u.harvestTy * this.gw + u.harvestTx] > 0) {
      gx = u.harvestTx + 0.5;
      gy = u.harvestTy + 0.5;
    } else {
      const n = this.nearestCrystal(u.x, u.y, u.team);
      if (n) {
        u.harvestTx = n.x;
        u.harvestTy = n.y;
        gx = n.x + 0.5;
        gy = n.y + 0.5;
      }
    }
    if (gx < 0) {
      if (u.cargo > 0) this.haul(u, ref, dt);
      return;
    }
    this.navigate(u, gx, gy, dt);
  }

  private haul(u: Unit, ref: Building | null, dt: number) {
    if (!ref) {
      if (u.team === 0) this.say("Build a Refinery", "noref", 8);
      return;
    }
    const dock = this.doorOf(ref);
    if (hypot(u.x, u.y, dock.x, dock.y) < 1.25 || distPointToRect(u.x, u.y, ref) < 1.15) {
      const dump = u.cargo;
      u.cargo -= dump;
      this.credits[u.team] += dump;
      this.income[u.team] += dump;
      if (u.team === this.ear && dump > 0) this.blip("unload", 0.85);
      return;
    }
    this.navigate(u, dock.x, dock.y, dt);
  }

  private tickDeploy(u: Unit, dt: number) {
    const spot = this.deploySpot(u);
    if (!spot.ok || spot.tx === undefined || spot.ty === undefined) {
      u.order = { t: "idle" };
      u.deploy = 0;
      if (u.team === this.ear) {
        this.say(spot.reason, "deploy", 0.4);
        this.cue({ t: "sfx", id: "error" });
      }
      return;
    }
    u.deploy += dt / 2;
    u.x = spot.tx + 1.5;
    u.y = spot.ty + 1.5;
    if (u.deploy < 1) return;
    this.addBuilding(u.team, "yard", spot.tx, spot.ty, true);
    this.pushUnitsOff(spot.tx, spot.ty, 3, 3, u.id);
    u.hp = 0;
    if (u.team === this.ear) {
      this.say("Construction Yard online");
      this.cue({ t: "sfx", id: "deploy" });
      this.cue({ t: "voice", id: "constructDone" });
    }
  }

  private tickShots(dt: number) {
    for (const s of this.shots) {
      const tgt = this.targetById(s.targetId);
      if (tgt) {
        const p = this.targetPoint(tgt);
        const nx = s.x + s.vx * dt;
        const ny = s.y + s.vy * dt;
        const d = distToSeg(p.x, p.y, s.x, s.y, nx, ny);
        if (d <= (s.arc > 0.6 ? 0.72 : 0.42)) {
          s.x = p.x;
          s.y = p.y;
          this.detonate(s, tgt);
          s.ttl = 0;
          continue;
        }
        const spd = Math.hypot(s.vx, s.vy) || 1;
        const steer = s.arc > 0.5 ? 0.12 : 0.45;
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        const aim = Math.hypot(dx, dy) || 1;
        s.vx = s.vx * (1 - steer) + (dx / aim) * spd * steer;
        s.vy = s.vy * (1 - steer) + (dy / aim) * spd * steer;
        const v = Math.hypot(s.vx, s.vy) || 1;
        s.vx = (s.vx / v) * spd;
        s.vy = (s.vy / v) * spd;
      }
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.ttl -= dt;
      const aimed = this.targetById(s.targetId);
      const atAir = aimed?.kind === "unit" && aimed.u.loco === "air";
      const hitB = atAir ? null : this.buildingAtPoint(s.x, s.y);
      if (hitB && !hitB.neutral && !this.allied(hitB.team, s.team) && s.ttl > 0) {
        const aimed = this.targetById(s.targetId);
        const aimedThis = aimed?.kind === "building" && aimed.b.id === hitB.id;
        // A wall only stops the shell when the wall itself was ordered. Otherwise the shot
        // keeps going for the building or unit the player actually picked.
        if (!(isFence(hitB.kind) && !aimedThis)) {
          this.detonate(s, { kind: "building", b: hitB });
          s.ttl = 0;
        }
      }
    }
    if (this.shots.length) this.shots = this.shots.filter((s) => s.ttl > 0);
  }

  private detonate(s: Shot, direct: Target) {
    const before = direct.kind === "unit" ? direct.u.hp : 0;
    const sky = direct.kind === "unit" && direct.u.loco === "air";
    if (!sky || (s.hitsAir && s.vsAir > 0)) {
      this.applyDamage(direct, s.dmg, s.vsInf, s.vsVeh, s.vsBld, s.vsAir, s.kind, s.team, s.who, s.owner);
    }
    if (direct.kind === "unit" && before > 0 && direct.u.hp <= 0) this.creditKill(s.owner);
    const p = this.targetPoint(direct);
    const heavy = s.arc > 0.6 || s.kind === "rocket";
    this.boom(p.x, p.y, heavy ? 0.72 : 0.32);
    if (s.kind === "rocket" || s.kind === "shell") {
      this.blip("explosion", 0.1, p.x, p.y);
      this.scorch(p.x, p.y);
      spawnSparks(p.x, p.y, heavy ? 8 : 4);
      spawnDirt(p.x, p.y, heavy ? 6 : 3);
      this.impulse = Math.max(this.impulse, heavy ? 0.85 : 0.32);
    }
    if (s.splash > 0) {
      for (const o of this.units) {
        if (o.hp <= 0 || this.allied(o.team, s.team)) continue;
        if (direct.kind === "unit" && o.id === direct.u.id) continue;
        if (o.loco === "air" && (!s.hitsAir || s.vsAir <= 0)) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d >= s.splash) continue;
        const splash = s.dmg * 0.4 * (1 - d / s.splash);
        const woods = o.armor === "infantry" && this.inCover(o) ? 0.75 : 1;
        this.hurtUnit(o, (o.loco === "air" ? splash * s.vsAir : splash) * woods, s.team, s.owner);
      }
    }
  }

  private tickTowers(dt: number) {
    if (this.deploying()) return;
    for (const b of this.buildings) {
      const aa = b.special === "aa";
      if ((b.kind !== "tower" && !aa) || !b.complete || b.hp <= 0 || b.prize || b.damage <= 0) continue;
      const pace = this.powerFactor(b.team);
      if (b.cooldown > 0) b.cooldown -= dt * pace;
      if (pace <= 0) continue;
      const cx = b.tx + b.w / 2;
      const cy = b.ty + b.h / 2;
      const reach = this.reachOf(b.range, cx, cy, "ground");
      const foe = this.nearestFoe(b.team, cx, cy, reach, aa, aa, true);
      if (!foe || b.cooldown > 0) continue;
      if (foe.kind === "unit" && foe.u.loco === "air" && !aa) continue;
      const d = this.distFrom(cx, cy, foe);
      if (d > reach) continue;
      b.cooldown = b.rof;
      this.applyDamage(foe, b.damage, b.vsInf, b.vsVeh, b.vsBld, aa ? b.vsAir : 0, "structure", b.team);
      const p = this.targetPoint(foe);
      this.muzzle(cx, cy, p.x, p.y);
      this.beam(cx, cy, p.x, p.y, b.team);
      this.markPoint(b.team, cx, cy);
      this.blip("tower", 0.16);
    }
  }

  private tryShoot(u: Unit, target: Target) {
    if (this.deploying()) return;
    if (u.cooldown > 0 || u.damage <= 0) return;
    if (target.kind === "unit" && target.u.loco === "air" && !u.hitsAir) return;
    if (u.ammoMax > 0 && u.ammo <= 0) return;
    const pos = this.targetPoint(target);
    const gap = target.kind === "building" ? distPointToRect(u.x, u.y, target.b) : Math.hypot(pos.x - u.x, pos.y - u.y);
    if (u.minRange > 0 && gap < u.minRange) return;
    u.cooldown = u.rof;
    if (this.inCover(u)) u.reveal = 2;
    else if (u.stealth) u.reveal = 1.7;
    this.markFire(u);
    this.muzzle(u.x, u.y, pos.x, pos.y);
    if (u.ammoMax > 0) {
      u.ammo -= 1;
      if (u.ammo <= 0) this.beginRearm(u);
    }
    const aim = this.highAim(u, pos.x, pos.y);
    const mul = this.navalMul(u, target) * aim;
    if (u.shot === "hit") {
      const before = target.kind === "unit" ? target.u.hp : 0;
      this.applyDamage(target, u.damage * mul, u.vsInf, u.vsVeh, u.vsBld, u.vsAir, u.shot, u.team, u.kind, u.id);
      if (target.kind === "unit" && before > 0 && target.u.hp <= 0) u.kills++;
      this.beam(u.x, u.y, pos.x, pos.y, u.team);
      spawnTracer(u.x, u.y, pos.x, pos.y, u.team);
      this.weaponSfx(u);
      return;
    }
    const arc = u.kind === "artillery" || u.kind === "bomber" ? 1 : u.shot === "shell" ? 0.32 : 0;
    const spd = u.kind === "artillery" ? 5.2 : u.shot === "rocket" ? 7.2 : 9.2;
    const dx = pos.x - u.x;
    const dy = pos.y - u.y;
    const d = Math.hypot(dx, dy) || 1;
    const splash =
      u.kind === "artillery" ? 1.15 : u.kind === "bomber" ? 1.45 : u.shot === "rocket" ? 0.75 : u.shot === "shell" ? 0.4 : 0;
    this.shots.push({
      x: u.x,
      y: u.y,
      px: u.x,
      py: u.y,
      vx: (dx / d) * spd,
      vy: (dy / d) * spd,
      team: u.team,
      dmg: u.damage * mul,
      vsInf: u.vsInf,
      vsVeh: u.vsVeh,
      vsBld: u.vsBld,
      targetId: target.kind === "unit" ? target.u.id : target.b.id,
      ttl: arc > 0.6 ? 3.2 : 2.6,
      kind: u.shot,
      splash,
      hitsAir: u.hitsAir,
      vsAir: u.vsAir,
      owner: u.id,
      arc,
      age: 0,
      who: u.kind,
    });
    if (u.shot === "rocket" || u.shot === "shell") {
      spawnTrail(u.x, u.y, (dx / d) * spd, (dy / d) * spd, u.kind === "artillery" ? "artillery" : u.shot === "rocket" ? "rocket" : "shell");
    }
    this.weaponSfx(u);
  }

  private applyDamage(
    target: Target,
    base: number,
    vsInf: number,
    vsVeh: number,
    vsBld: number,
    vsAir = 0,
    shot: ShotKind | "structure" = "structure",
    from: Team = 0,
    who = "",
    attacker = 0,
  ) {
    const weapon = who || (shot === "rocket" ? "rocket" : shot === "hit" ? "rifle" : "tank");
    if (target.kind === "unit") {
      if (target.u.loco === "air") {
        if (vsAir <= 0) return;
        this.hurtUnit(target.u, base * vsAir, from, attacker);
        return;
      }
      const plate = plateOf(target.u.kind, target.u.armor);
      let mul = (target.u.armor === "infantry" ? vsInf : vsVeh) * counterMul(weapon, plate);
      if (target.u.armor === "infantry" && this.inCover(target.u) && (shot === "shell" || shot === "rocket")) mul *= 0.75;
      this.hurtUnit(target.u, base * mul, from, attacker);
    } else {
      if (this.spareNormalBuildings(from, target.b)) return;
      let dmg = base * vsBld;
      if ((target.b.kind === "wall" || target.b.kind === "gate" || target.b.kind === "sandbag") && target.b.rubble <= 0) {
        const explosive = shot === "shell" || shot === "rocket";
        const wall = !explosive ? (shot === "hit" ? 0.08 : 0.15) : target.b.kind === "sandbag" ? 6 : 2.8;
        dmg *= wall;
      } else {
        dmg *= counterMul(weapon, "building");
        if (target.b.kind === "span" && (shot === "shell" || shot === "rocket")) dmg *= 1.65;
      }
      this.hurtBuilding(target.b, dmg, from);
    }
  }

  /** Minimap pulse + advisor. Rate-limited so a wave does not repeat the line. */
  warnBase(victim: Team, x: number, y: number) {
    this.alarm[victim] = { x, y, until: this.time + 8 };
    if (victim !== this.ear) return;
    const until = this.logLock.get("underattack") ?? 0;
    if (this.time < until) return;
    this.say("Our base is under attack", "underattack", 8);
    this.cue({ t: "voice", id: "baseAttack" });
  }
  noteThreat(victim: Team, x: number, y: number, from: Team) {
    if (from === victim || this.allied(from, victim)) return;
    if (!this.cpu[victim]) return;
    this.aiHurt[victim] = true;
    this.aiAlert[victim] = { x, y, until: this.time + 30 };
  }

  private hurtUnit(u: Unit, dmg: number, from?: Team, attacker = 0) {
    if (u.hp <= 0 || dmg <= 0) return;
    u.hp -= dmg;
    u.hit = 0.28;
    this.flashAt(u.x, u.y);
    this.floatDmg(u.x, u.y - 0.15, dmg);
    if (attacker > 0 && from !== undefined && !this.allied(from, u.team)) {
      u.aggro = attacker;
      u.aggroUntil = this.time + 5;
    }
    if (from !== undefined) this.noteThreat(u.team, u.x, u.y, from);
    if (u.hp <= 0) {
      u.hp = 0;
      this.noteUnit(u.team, from);
      this.boom(u.x, u.y, u.armor === "vehicle" ? 0.55 : 0.32);
      this.debris(u.x, u.y, u.armor === "infantry" ? 4 : 6);
      this.blip("explosion", 0.08, u.x, u.y);
      if (u.armor !== "infantry" && u.armor !== "light") {
        spawnWreck(u.x, u.y, u.team);
        this.impulse = Math.max(this.impulse, 0.35);
      } else if (u.armor === "light" && u.loco !== "air") {
        spawnWreck(u.x, u.y, u.team);
        this.impulse = Math.max(this.impulse, 0.4);
      } else {
        spawnFall(u.x, u.y, u.team);
        this.impulse = Math.max(this.impulse, 0.12);
      }
      if (u.team === this.ear && u.kind !== "mcv") {
        this.say("Unit lost", "lost", 2);
        this.cue({ t: "voice", id: "unitLost" });
      }
    } else {
      if (u.armor === "vehicle") spawnSparks(u.x, u.y, 5);
      else spawnDirt(u.x, u.y, 3);
    }
    if (u.hp > 0 && u.team === this.ear && u.kind !== "harvester") {
      const home = this.starts.slots[u.team];
      if (home && Math.hypot(u.x - home.x, u.y - home.y) < 16) this.warnBase(u.team, u.x, u.y);
    } else if (u.hp > 0 && u.team === this.ear && u.kind === "harvester") {
      this.say("Harvester under attack", "harv", 6);
      this.cue({ t: "voice", id: "harvester" });
    }
  }

  /** Normal CPU seats do not damage buildings before the 4:00 harass. Hard and Easy are not gated. */
  private spareNormalBuildings(from: Team, b: Building): boolean {
    if (this.time >= NORMAL_HARASS_AT) return false;
    if (!this.cpu[from]) return false;
    if (this.difficultyOf(from) !== "normal") return false;
    if (b.neutral || this.allied(from, b.team)) return false;
    return true;
  }

  private hurtBuilding(b: Building, dmg: number, from?: Team) {
    if (b.hp <= 0 || dmg <= 0) return;
    if (from !== undefined) this.noteThreat(b.team, b.tx + b.w / 2, b.ty + b.h / 2, from);
    b.hit = 0.4;
    b.shown = this.time + 4;
    this.flashAt(b.tx + b.w / 2, b.ty + b.h / 2);
    this.floatDmg(b.tx + b.w / 2, b.ty - 0.2, dmg);
    spawnSparks(b.tx + b.w / 2, b.ty + b.h / 2, 5);
    if (b.rubble > 0) {
      b.hp = 1;
      return;
    }
    b.hp -= dmg;
    if (b.team === this.ear && !isFence(b.kind) && b.kind !== "span" && dmg > 1) {
      this.warnBase(b.team, b.tx + b.w / 2, b.ty + b.h / 2);
    } else if (!isFence(b.kind) && b.kind !== "span" && dmg > 1) {
      this.alarm[b.team] = { x: b.tx + b.w / 2, y: b.ty + b.h / 2, until: this.time + 8 };
    }
    if (b.hp > 0) return;
    if (isFence(b.kind)) {
      b.hp = 1;
      b.rubble = 5;
      b.open = false;
      b.complete = true;
      this.boom(b.tx + b.w / 2, b.ty + b.h / 2, 0.35);
      this.debris(b.tx + b.w / 2, b.ty + b.h / 2, 3);
      this.blip("explosion", 0.1);
      this.say("Wall collapsed", "rubble", 1.2);
      return;
    }
    if (b.kind === "span") {
      b.hp = 1;
      b.rubble = 1;
      b.complete = true;
      this.collapseSpan(b);
      this.groundRev++;
      this.boom(b.tx + b.w / 2, b.ty + b.h / 2, 0.9);
      this.blip("explosion", 0.08);
      this.say("Bridge down", "bridge", 1);
      return;
    }
    b.hp = Math.max(1, b.maxHp * 0.02);
    // Further shells must not restart the fall. A building under fire used to live forever at 2% hp.
    if (b.collapse <= 0) b.collapse = 1.35;
    this.notePlant(b, from);
    this.boom(b.tx + b.w / 2, b.ty + b.h / 2, 0.95);
    this.debris(b.tx + b.w / 2, b.ty + b.h / 2, 7);
    spawnRuin(b.tx + b.w / 2, b.ty + b.h / 2, b.w, b.h);
    this.blip("explosion", 0.08, b.tx + b.w / 2, b.ty + b.h / 2);
    this.impulse = Math.max(this.impulse, 0.55);
    if (b.team === 0) this.say(`${b.name} destroyed`);
    else this.say(`Enemy ${b.name} destroyed`, "kb", 1.2);
  }

  private spanDist(b: Building, x: number, y: number): number {
    const cx = Math.max(b.tx, Math.min(x + 0.5, b.tx + b.w));
    const cy = Math.max(b.ty, Math.min(y + 0.5, b.ty + b.h));
    return Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  }

  /** Drop the deck that belongs to this span. A neighboring span keeps its own planks. */
  private collapseSpan(b: Building) {
    const mine = (x: number, y: number) => {
      const d = this.spanDist(b, x, y);
      for (const o of this.buildings) {
        if (o.id === b.id || o.kind !== "span" || o.hp <= 0 || o.rubble > 0) continue;
        if (this.spanDist(o, x, y) + 0.2 < d) return false;
      }
      return true;
    };
    const seen = new Uint8Array(this.gw * this.gh);
    const stack: number[] = [];
    const seed = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return;
      const i = y * this.gw + x;
      if (seen[i] || this.terrain[i] !== TILE_BRIDGE) return;
      if (!mine(x, y)) return;
      seen[i] = 1;
      stack.push(i);
    };
    for (let y = b.ty - 1; y <= b.ty + b.h; y++) {
      for (let x = b.tx - 1; x <= b.tx + b.w; x++) seed(x, y);
    }
    while (stack.length) {
      const i = stack.pop() as number;
      this.terrain[i] = TILE_WRECK;
      const x = i % this.gw;
      const y = (i / this.gw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) seed(x + dx, y + dy);
      }
    }
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      if (this.routeBroken(u)) {
        u.path = [];
        u.repath = 0;
      }
      this.stepOffWreck(u);
    }
  }

  /** Ghost for a fence drag. Does not spend credits. Illegal tiles stay in the list so the run can show the break. */
  previewFence(
    team: Team,
    kind: BuildingId,
    tiles: { tx: number; ty: number }[],
  ): { tx: number; ty: number; ok: boolean; reason: string }[] {
    return this.evalFence(team, kind, tiles, false).steps;
  }

  /** Lay a sandbag, concrete, or gate run. Returns how many new tiles were paid for. */
  placeFence(team: Team, kind: BuildingId, tiles: { tx: number; ty: number }[]): number {
    return this.evalFence(team, kind, tiles, true).placed;
  }

  toggleGate(id: number, team: Team = 0) {
    const b = this.buildingById(id);
    if (!b || b.kind !== "gate" || b.team !== team || !b.complete || b.rubble > 0 || b.hp <= 0) return;
    b.open = !b.open;
    this.say(b.open ? "Gate open" : "Gate locked", "gate", 0.25);
  }

  private evalFence(
    team: Team,
    kind: BuildingId,
    tiles: { tx: number; ty: number }[],
    commit: boolean,
  ): { steps: { tx: number; ty: number; ok: boolean; reason: string }[]; placed: number } {
    const def = BUILDINGS[kind];
    const steps: { tx: number; ty: number; ok: boolean; reason: string }[] = [];
    if (!this.hasYard(team)) {
      for (const t of tiles) steps.push({ tx: t.tx, ty: t.ty, ok: false, reason: "Needs a yard" });
      return { steps, placed: 0 };
    }
    const virtual = new Set<number>();
    let credits = this.credits[team];
    let placed = 0;
    let fail = "";
    const cap = Math.min(tiles.length, WALL_RUN_MAX);
    for (let n = 0; n < cap; n++) {
      const tx = tiles[n].tx;
      const ty = tiles[n].ty;
      const key = ty * this.gw + tx;
      if (virtual.has(key)) {
        steps.push({ tx, ty, ok: true, reason: "" });
        continue;
      }
      const illegal = this.fenceIllegal(team, kind, tx, ty);
      if (illegal) {
        if (!fail) fail = illegal;
        steps.push({ tx, ty, ok: false, reason: illegal });
        continue;
      }
      if (credits < def.cost) {
        if (!fail) fail = "Not enough credits";
        steps.push({ tx, ty, ok: false, reason: "Not enough credits" });
        break;
      }
      if (kind !== "gate" && this.structureCount(team) + (commit ? 0 : virtual.size) >= BUILDING_CAP) {
        if (!fail) fail = "Base full";
        steps.push({ tx, ty, ok: false, reason: "Base full" });
        break;
      }
      if (!this.fenceReachable(team, tx, ty, virtual)) {
        if (!fail) fail = "Too far from your buildings";
        steps.push({ tx, ty, ok: false, reason: "Too far from your buildings" });
        continue;
      }
      virtual.add(key);
      credits -= def.cost;
      steps.push({ tx, ty, ok: true, reason: "" });
      if (commit) {
        if (kind === "gate") {
          const host = this.buildingAtPoint(tx + 0.5, ty + 0.5);
          if (host) {
            this.clearOcc(host);
            host.hp = 0;
          }
        }
        this.addBuilding(team, kind, tx, ty, false);
      }
      placed++;
    }
    if (commit) {
      this.fenceFail = placed > 0 ? "" : fail || "Blocked";
      if (placed > 0) this.credits[team] -= placed * def.cost;
      if (team === this.ear) {
        if (placed === 0 && fail) {
          this.say(fail === "Not enough credits" ? "Insufficient funds" : fail, "place", 0.6);
          if (fail === "Not enough credits") this.cue({ t: "voice", id: "funds" });
          else this.cue({ t: "sfx", id: "error" });
        } else if (placed > 0) {
          if (placed === 1) this.say(`${def.name} placed`);
          else this.say(`${placed} ${def.short} placed`);
          this.cue({ t: "sfx", id: "place" });
          this.cue({ t: "voice", id: "building" });
        }
      } else if (team === 0) {
        if (placed === 0 && fail) this.say(fail, "place", 0.6);
        else if (placed === 1) this.say(`${def.name} placed`);
        else if (placed > 1) this.say(`${placed} ${def.short} placed`);
      }
    }
    return { steps, placed };
  }

  private fenceIllegal(team: Team, kind: BuildingId, tx: number, ty: number): string {
    if (!this.wallsOn && (kind === "sandbag" || kind === "wall" || kind === "gate")) return "Walls are off";
    if (tx < 1 || ty < 1 || tx >= this.gw - 1 || ty >= this.gh - 1) return "Off the map";
    const i = ty * this.gw + tx;
    const t = this.terrain[i];
    if (t === TILE_ROCK || t === TILE_CLIFF) return "Blocked by rock";
    if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_WRECK) return "That's water";
    if (t === TILE_SCRUB) return "Blocked";
    if (isShell(t) && (this.craters[i] ?? 0) < 2) return "Blocked";
    if (this.crystal[i] > 0) return "Can't build on crystal";
    if (!canBuild(kind, this.factionOf(team))) return "Other faction";
    const def = resolveBuilding(kind, this.factionOf(team));
    if (def.requires && !this.buildings.some((b) => b.team === team && b.kind === def.requires && b.complete && b.hp > 0 && b.rubble <= 0)) {
      return `Needs ${BUILDINGS[def.requires].short}`;
    }
    if (kind === "gate") {
      const host = this.buildingAtPoint(tx + 0.5, ty + 0.5);
      if (
        !host ||
        host.team !== team ||
        (host.kind !== "sandbag" && host.kind !== "wall") ||
        !host.complete ||
        host.hp <= 0 ||
        host.rubble > 0
      ) {
        return "Needs a finished wall";
      }
      if (this.unitBlocksTile(tx, ty, 0)) return "Unit in the way";
      return "";
    }
    if (this.occ[i] !== 0) return "Blocked";
    if (this.unitBlocksTile(tx, ty, 0)) return "Unit in the way";
    return "";
  }

  /** Build radius of a real structure, or a friendly fence that itself reaches one. */
  private fenceReachable(team: Team, tx: number, ty: number, virtual: Set<number>): boolean {
    if (this.inBuildRadius(team, tx, ty)) return true;
    const seen = new Set<number>();
    const q: number[] = [];
    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return;
      const i = y * this.gw + x;
      if (seen.has(i)) return;
      if (!virtual.has(i) && !this.liveFence(team, x, y)) return;
      seen.add(i);
      q.push(i);
    };
    push(tx, ty);
    push(tx - 1, ty);
    push(tx + 1, ty);
    push(tx, ty - 1);
    push(tx, ty + 1);
    while (q.length) {
      const i = q.pop() as number;
      const x = i % this.gw;
      const y = (i / this.gw) | 0;
      if (this.inBuildRadius(team, x, y)) return true;
      push(x - 1, y);
      push(x + 1, y);
      push(x, y - 1);
      push(x, y + 1);
    }
    return false;
  }

  private inBuildRadius(team: Team, tx: number, ty: number): boolean {
    for (const b of this.buildings) {
      if (b.team !== team || b.neutral || !b.complete || b.hp <= 0 || isFence(b.kind)) continue;
      const gap = rectGap(tx, ty, 1, 1, b.tx, b.ty, b.w, b.h);
      if (gap >= 0 && gap <= BUILD_GAP) return true;
    }
    return false;
  }

  private liveFence(team: Team, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return false;
    const id = this.occ[y * this.gw + x];
    if (!id) return false;
    const b = this.buildingById(id);
    return !!b && b.team === team && isFence(b.kind) && b.hp > 0 && b.rubble <= 0;
  }

  /** Rubble blocks everyone. Tanks grind finished sandbags. Open gates pass friendlies only. */
  private fenceAllows(u: Unit, b: Building): boolean {
    if (!isFence(b.kind) || b.hp <= 0 || b.rubble > 0 || !b.complete) return false;
    if (b.kind === "sandbag") return u.kind === "tank" || u.kind === "medium";
    if (b.kind === "wall") return false;
    return u.team === b.team && b.open;
  }

  private crushWalls(dt: number) {
    for (const u of this.units) {
      if (u.hp <= 0 || u.aboard || (u.kind !== "tank" && u.kind !== "medium")) continue;
      const bag = this.buildingAtPoint(u.x, u.y);
      if (!bag || bag.kind !== "sandbag" || !bag.complete || bag.rubble > 0) continue;
      this.hurtBuilding(bag, 16 * dt);
    }
  }

  private tickCollapse(dt: number) {
    for (const b of this.buildings) {
      if (b.collapse <= 0) continue;
      b.collapse -= dt;
      if (b.collapse > 0) continue;
      b.collapse = 0;
      b.hp = 0;
      b.rubble = 9999;
      b.block = 6;
    }
  }

  private tickRubble(dt: number) {
    for (const b of this.buildings) {
      if (b.block > 0) {
        b.block -= dt;
        if (b.block <= 0) {
          b.block = 0;
          if (b.hp <= 0) this.clearOcc(b);
        }
      }
      if (b.rubble <= 0 || b.rubble > 100 || b.hp <= 0 || b.kind === "span") continue;
      b.rubble -= dt;
      if (b.rubble <= 0) {
        b.rubble = 0;
        b.hp = 0;
        this.clearOcc(b);
      }
    }
  }

  /** Land and sea never share a path. Aircraft fly over the grid and never occupy it. */
  passable(u: Unit, x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return false;
    if (this.hostileStart(u.team, tx + 0.5, ty + 0.5)) return false;
    if (u.loco === "air") return true;
    const t = this.terrain[ty * this.gw + tx];
    const who = u.loco === "sea" ? "boat" : u.loco === "amphib" ? "amphib" : u.armor === "infantry" ? "infantry" : "vehicle";
    const mark = this.craters[ty * this.gw + tx] ?? 0;
    if (u.loco === "sea") {
      if (boatBeaches(t, u.kind)) return true;
      if (!allows(t, "boat", mark)) return false;
    } else if (!allows(t, who, mark)) {
      return false;
    }
    const occId = this.occ[ty * this.gw + tx];
    if (occId !== 0) {
      const b = this.buildingById(occId);
      if (!b || !this.fenceAllows(u, b)) return false;
    }
    return true;
  }

  private crushTree(u: Unit) {
    if (u.armor !== "vehicle" && u.armor !== "heavy") return;
    const tx = u.x | 0;
    const ty = u.y | 0;
    const i = ty * this.gw + tx;
    if (this.terrain[i] !== TILE_SCRUB) return;
    this.terrain[i] = TILE_STUMP;
    u.path = [];
  }

  private scorch(x: number, y: number) {
    const tx = x | 0;
    const ty = y | 0;
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return;
    const i = ty * this.gw + tx;
    const t = this.terrain[i] ?? 0;
    if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_WRECK || t === TILE_CLIFF || t === TILE_ROCK) return;
    this.craters[i] = Math.min(3, (this.craters[i] ?? 0) + 1);
  }

  private tickRearm(u: Unit, dt: number) {
    const pad = this.padFor(u);
    if (!pad) {
      u.order = { t: "idle" };
      if (u.team === 0) this.say("No helipad", "nopad", 3);
      return;
    }
    const x = pad.tx + pad.w / 2;
    const y = pad.ty + pad.h / 2;
    if (Math.hypot(u.x - x, u.y - y) < 1.15) {
      u.x = x;
      u.y = y;
      u.rearm = Math.max(0.1, u.rearmFor);
      u.ammo = u.ammoMax;
      u.order = { t: "idle" };
      u.path = [];
      return;
    }
    this.navigate(u, x, y, dt);
  }

  private padFor(u: Unit): Building | undefined {
    const home = this.buildings.find((b) => b.id === u.home && b.hp > 0 && b.complete && b.kind === "helipad");
    if (home) return home;
    return this.buildings.find((b) => b.team === u.team && b.kind === "helipad" && b.complete && b.hp > 0);
  }

  /** Empty magazine: remember the attack, then fly home. Ground orders cannot cancel this. */
  private beginRearm(u: Unit) {
    if (u.order.t === "attack") u.sortie = u.order.id;
    u.ammo = 0;
    u.order = { t: "rearm" };
    u.path = [];
  }

  private launchAgain(u: Unit) {
    const id = u.sortie;
    u.sortie = 0;
    if (!id) {
      u.order = { t: "idle" };
      return;
    }
    const t = this.targetById(id);
    if (!t) {
      u.order = { t: "idle" };
      return;
    }
    const team = t.kind === "unit" ? t.u.team : t.b.team;
    if (team === u.team || this.allied(team, u.team) || (t.kind === "unit" && t.u.hp <= 0) || (t.kind === "building" && t.b.hp <= 0)) {
      u.order = { t: "idle" };
      return;
    }
    u.order = { t: "attack", id };
    u.path = [];
  }

  /** False while an aircraft is empty or sitting the pad timer. Clears a pending sortie on a fresh order. */
  private groundOrder(u: Unit): boolean {
    if (u.rearm > 0) {
      if (u.team === 0) this.say("Rearming", "rearm", 0.6);
      return false;
    }
    if (u.ammoMax > 0 && u.ammo <= 0) {
      if (u.order.t !== "rearm" && this.padFor(u)) this.beginRearm(u);
      if (u.team === 0) this.say(this.padFor(u) ? "Returning to rearm" : "No helipad", "rearm", 0.6);
      return false;
    }
    u.sortie = 0;
    return true;
  }

  private tickCapture(u: Unit, dt: number) {
    if (u.order.t !== "capture") return;
    const b = this.buildingById(u.order.id);
    const wreck = !!b && b.kind === "span" && b.rubble > 0 && b.hp > 0;
    if (!b || b.hp <= 0 || (!wreck && (b.kind === "span" || b.rubble > 0 || (!b.neutral && this.allied(b.team, u.team))))) {
      u.order = { t: "idle" };
      return;
    }
    const d = distPointToRect(u.x, u.y, b);
    const reach = wreck ? 3.2 : 1.65;
    if (this.deploying()) {
      const q = this.quietPoint(u.team, b.tx + b.w / 2, b.ty + b.h / 2);
      const cx = b.tx + b.w / 2;
      const cy = b.ty + b.h / 2;
      if (Math.hypot(q.x - cx, q.y - cy) > 0.3) {
        this.navigate(u, q.x, q.y, dt);
        u.capture = 0;
        return;
      }
    }
    if (d > reach) {
      const tile = this.approachTile(b, u, reach);
      if (tile) this.navigate(u, tile.x + 0.5, tile.y + 0.5, dt);
      else this.navigate(u, b.tx + b.w / 2, b.ty + b.h / 2, dt);
      u.capture = 0;
      return;
    }
    u.capture += dt;
    if (isFence(b.kind)) {
      if (u.capture < 2.6) return;
      this.hurtBuilding(b, b.hp + 8, u.team);
      u.order = { t: "idle" };
      u.capture = 0;
      u.path = [];
      return;
    }
    if (wreck) {
      if (u.capture < 6) return;
      this.repairSpan(b);
      u.order = { t: "idle" };
      u.capture = 0;
      u.path = [];
      if (u.team === this.ear) this.say("Bridge repaired", "bridge", 1);
      return;
    }
    if (u.capture < 3) return;
    b.team = u.team;
    b.neutral = false;
    b.hp = b.maxHp;
    b.mending = false;
    b.block = 0;
    this.say(u.team === 0 ? "Building captured" : `Lost ${b.name}`, "cap", 0.4);
    u.hp = 0;
    this.statLost[u.team] = (this.statLost[u.team] ?? 0) + 1;
  }

  private repairSpan(b: Building) {
    const seen = new Uint8Array(this.gw * this.gh);
    const stack: number[] = [];
    const seed = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return;
      const i = y * this.gw + x;
      if (seen[i] || this.terrain[i] !== TILE_WRECK) return;
      seen[i] = 1;
      stack.push(i);
    };
    for (let y = b.ty - 1; y <= b.ty + b.h; y++) {
      for (let x = b.tx - 1; x <= b.tx + b.w; x++) seed(x, y);
    }
    while (stack.length) {
      const i = stack.pop() as number;
      this.terrain[i] = TILE_BRIDGE;
      const x = i % this.gw;
      const y = (i / this.gw) | 0;
      seed(x + 1, y);
      seed(x - 1, y);
      seed(x, y + 1);
      seed(x, y - 1);
    }
    b.rubble = 0;
    b.hp = b.maxHp;
    b.neutral = true;
    this.groundRev++;
  }

  private tickCrates(dt: number) {
    if (!this.cratesOn) return;
    if (!this.cratesOpened && this.time >= DEPLOY_SECS) {
      this.cratesOpened = true;
      this.placeOpeningCrates();
    }
    if (!this.haulLanded && this.time >= HAUL_AT) this.landHaul();
    for (const c of this.crates) {
      for (const u of this.units) {
        if (u.hp <= 0 || u.aboard || u.loco === "air" || u.loco === "sea") continue;
        if (Math.hypot(u.x - c.x, u.y - c.y) > 0.7) continue;
        if (c.kind === "haul") {
          this.credits[u.team] += 1400;
          this.income[u.team] += 1400;
          this.splitHaul(c.x, c.y);
          if (u.team === this.ear) this.say("Field haul: 1400");
          else if (this.ear === 0) this.say("Enemy took the field haul");
        } else if (c.kind === "cash") {
          this.credits[u.team] += 450;
          this.income[u.team] += 450;
          if (u.team === this.ear) this.say("Field cache: 450");
        } else if (c.kind === "mend") {
          this.mendUntil[u.team] = this.time + 14;
          if (u.team === this.ear) this.say("Field repair", "mend", 1.2);
        } else {
          this.spawnUnit(u.team, "rifle", u.x + 0.6, u.y);
          if (u.team === this.ear) this.say("Cache: rifle squad");
        }
        c.x = -99;
        break;
      }
    }
    if (this.crates.some((c) => c.x < 0)) this.crates = this.crates.filter((c) => c.x >= 0);
  }

  /** High ground stretches weapons a little. Aircraft and boats ignore the slope. */
  private reachOf(range: number, x: number, y: number, loco: string): number {
    if (loco === "air" || loco === "sea") return range;
    const tx = x | 0;
    const ty = y | 0;
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return range;
    return this.terrain[ty * this.gw + tx] === TILE_HIGH ? range * HIGH_RANGE : range;
  }

  /** 0 low ground, 1 ramp, 2 mesa. Cliffs are walls, not a step. */
  private elevOf(x: number, y: number): number {
    const tx = x | 0;
    const ty = y | 0;
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return 0;
    const t = this.terrain[ty * this.gw + tx] ?? 0;
    if (t === TILE_HIGH) return 2;
    if (t === TILE_RAMP) return 1;
    return 0;
  }

  /** Land units change grade by at most one. A ramp is the only way onto a mesa. */
  private gradeStep(u: Unit, x: number, y: number): boolean {
    if (u.loco === "air" || u.loco === "sea") return true;
    return Math.abs(this.elevOf(u.x, u.y) - this.elevOf(x, y)) <= 1;
  }

  private gradeOk(u: Unit, x0: number, y0: number, x1: number, y1: number): boolean {
    if (u.loco === "air" || u.loco === "sea") return true;
    return Math.abs(this.elevOf(x0, y0) - this.elevOf(x1, y1)) <= 1;
  }

  /** Downhill shots hit a little harder. Aircraft and boats are not on the slope. */
  private highAim(u: Unit, x: number, y: number): number {
    if (u.loco === "air" || u.loco === "sea") return 1;
    return this.elevOf(u.x, u.y) > this.elevOf(x, y) ? HIGH_AIM : 1;
  }

  /** Roads and bridges are the fast line. Ramps and fords are the slow cut. */
  private stepCost(tx: number, ty: number): number {
    const t = this.terrain[ty * this.gw + tx] ?? 0;
    if (t === TILE_ROAD) return 0.83;
    if (t === TILE_BRIDGE) return 0.78;
    if (t === TILE_RAMP || t === TILE_FORD) return 1.65;
    if (t === TILE_ROUGH || t === TILE_VALLEY) return 1.35;
    if (t === TILE_SHALLOW) return 1.5;
    return 1;
  }

  /** Bots mend at their own camp. Players still heal only from a field-repair crate. */
  private tickBaseHeal(dt: number) {
    for (let t = 1; t <= this.opponents; t++) {
      const team = t as Team;
      if (!this.cpu[team]) continue;
      const home = this.starts.slots[team];
      if (!home) continue;
      for (const u of this.units) {
        if (u.team !== team || u.hp <= 0 || u.hp >= u.maxHp || u.aboard) continue;
        if (u.order.t === "attack") continue;
        if (this.time < u.aggroUntil) continue;
        if (Math.hypot(u.x - home.x, u.y - home.y) > 8) continue;
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.07 * dt);
      }
    }
  }

  private tickMend(dt: number) {
    for (let t = 0; t < 4; t++) {
      if ((this.mendUntil[t] ?? 0) <= this.time) continue;
      for (const u of this.units) {
        if (u.team !== t || u.hp <= 0 || u.hp >= u.maxHp) continue;
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.045 * dt);
      }
      for (const b of this.buildings) {
        if (b.team !== t || b.neutral || b.hp <= 0 || b.hp >= b.maxHp) continue;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.035 * dt);
      }
    }
  }

  private outpostAt(x: number, y: number): boolean {
    for (const b of this.buildings) {
      if (b.hp <= 0 || !b.neutral || b.kind === "span" || b.kind === "dock") continue;
      if (x >= b.tx - 1 && y >= b.ty - 1 && x < b.tx + b.w + 1 && y < b.ty + b.h + 1) return true;
    }
    return false;
  }

  /** Oil derrick and watchtower. Infantry take them by standing beside them. */
  private plantMichiganPrizes() {
    const heart = this.prizeAnchor();
    const derrickWant = heart ? { x: heart.x + 2.4, y: heart.y + 0.2 } : { x: this.gw / 2, y: this.gh / 2 };
    const siloDef = resolveBuilding("silo", this.factionOf(0));
    const siloPad = this.findPad(Math.round(derrickWant.x), Math.round(derrickWant.y), siloDef.w, siloDef.h);
    if (siloPad) {
      const b = this.addBuilding(0, "silo", siloPad.x, siloPad.y, true, true);
      b.prize = true;
      b.name = "Oil Derrick";
      b.powerUse = 0;
      this.fillOcc(b);
    }
    const span = this.buildings.find((b) => b.kind === "span" && b.hp > 0);
    const towerWant = span
      ? { x: span.tx + span.w + 2, y: span.ty + (span.h / 2) | 0 }
      : { x: this.gw / 2 + 6, y: this.gh / 2 - 4 };
    const towerDef = resolveBuilding("tower", this.factionOf(0));
    const towerPad = this.findPad(Math.round(towerWant.x), Math.round(towerWant.y), towerDef.w, towerDef.h);
    if (towerPad) {
      const b = this.addBuilding(0, "tower", towerPad.x, towerPad.y, true, true);
      b.prize = true;
      b.name = "Watchtower";
      b.damage = 0;
      b.range = 0;
      b.sight = 9;
      b.powerUse = 0;
      this.fillOcc(b);
    }
  }

  /** The rich middle field, or the map center when that field did not land. */
  private prizeAnchor(): { x: number; y: number } | null {
    let best = 0;
    let bx = -1;
    let by = -1;
    const cx = this.gw / 2;
    const cy = this.gh / 2;
    for (let y = 2; y < this.gh - 2; y++) {
      for (let x = 2; x < this.gw - 2; x++) {
        const n = this.crystal[y * this.gw + x] ?? 0;
        if (n < 2000) continue;
        const score = n - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) * 30;
        if (score > best) {
          best = score;
          bx = x;
          by = y;
        }
      }
    }
    if (bx < 0) return null;
    return { x: bx + 0.5, y: by + 0.5 };
  }

  /** Infantry beside a prize fill a bar. One side holding it takes the structure. */
  private tickPrizes(dt: number) {
    for (const b of this.buildings) {
      if (!b.prize || b.hp <= 0 || b.rubble > 0 || b.collapse > 0) continue;
      const teams: Team[] = [];
      for (const u of this.units) {
        if (u.hp <= 0 || u.armor !== "infantry" || u.aboard || this.eliminated[u.team]) continue;
        if (distPointToRect(u.x, u.y, b) > 1.65) continue;
        if (!teams.includes(u.team)) teams.push(u.team);
      }
      if (teams.length === 1 && teams[0] === b.team && !b.neutral) {
        b.cap = Math.max(0, b.cap - dt);
        b.capTeam = b.team;
        continue;
      }
      if (teams.length === 0) {
        b.cap = Math.max(0, b.cap - dt * 0.85);
        if (b.cap <= 0) b.capTeam = -2;
        continue;
      }
      if (teams.length > 1) {
        b.capTeam = -1;
        continue;
      }
      const team = teams[0]!;
      if (b.capTeam !== team) {
        b.capTeam = team;
        b.cap = 0;
      }
      b.cap += dt;
      if (b.cap < 3) continue;
      b.team = team;
      b.neutral = false;
      b.hp = b.maxHp;
      b.cap = 0;
      b.capTeam = team;
      this.say(team === this.ear ? `${b.name} captured` : `Lost ${b.name}`, "cap", 0.6);
    }
  }

  /** Neutral plants an engineer can take. They do not shoot and do not pay out until captured. */
  private plantOutposts() {
    if (this.mapId === "michigan") {
      this.plantMichiganPrizes();
      return;
    }
    const kinds: BuildingId[] = ["supply", "silo", "supply"];
    const slots = this.starts.slots;
    const cx = this.gw / 2;
    const cy = this.gh / 2;
    const raw: { x: number; y: number }[] = [];
    slots.forEach((s, i) => {
      const ang = Math.atan2(cy - s.y, cx - s.x) + (i % 2 === 0 ? 0.8 : -0.8);
      raw.push({ x: (s.x + cx) / 2 + Math.cos(ang) * 5, y: (s.y + cy) / 2 + Math.sin(ang) * 5 });
    });
    raw.push({ x: cx + 6, y: cy - 3 });
    let n = 0;
    for (const s of raw) {
      if (n >= 3) break;
      const kind = kinds[n]!;
      const def = resolveBuilding(kind, this.factionOf(0));
      const pad = this.findPad(Math.round(s.x), Math.round(s.y), def.w, def.h);
      if (!pad) continue;
      const b = this.addBuilding(0, kind, pad.x, pad.y, true, true);
      this.fillOcc(b);
      n++;
    }
  }

  private findPad(x: number, y: number, w: number, h: number): { x: number; y: number } | null {
    if (this.padFits(x, y, w, h)) return { x, y };
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.padFits(x + dx, y + dy, w, h)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  private padFits(x: number, y: number, w: number, h: number): boolean {
    if (x < 2 || y < 2 || x + w >= this.gw - 1 || y + h >= this.gh - 1) return false;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        const i = ty * this.gw + tx;
        const t = this.terrain[i] ?? 0;
        if (t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_ROUGH && t !== TILE_HIGH && t !== TILE_ROAD && t !== TILE_SHORE) return false;
        if ((this.crystal[i] ?? 0) > 0 || this.occ[i] !== 0) return false;
        if (isShell(t)) return false;
        for (const s of this.starts.slots) {
          if (Math.hypot(s.x - tx, s.y - ty) < 11) return false;
        }
      }
    }
    return true;
  }

  /** Contested caches after the deployment window. Both clients roll the same spots. */
  private placeOpeningCrates() {
    if (!this.cratesOn || this.crates.length) return;
    const slots = this.starts.slots;
    const raw: { x: number; y: number }[] = [{ x: this.gw / 2, y: this.gh / 2 }];
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        if (!a || !b) continue;
        raw.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
        raw.push({ x: (a.x + b.x) / 2 + Math.cos(ang) * 6, y: (a.y + b.y) / 2 + Math.sin(ang) * 6 });
      }
    }
    for (const b of this.buildings) {
      if (b.hp <= 0 || b.kind !== "span") continue;
      raw.push({ x: b.tx + b.w / 2, y: b.ty - 3 });
      raw.push({ x: b.tx + b.w / 2, y: b.ty + b.h + 2 });
    }
    const kinds = ["cash", "squad", "mend", "cash", "squad"] as const;
    const used: { x: number; y: number }[] = [];
    let placed = 0;
    const want = 4;
    for (const s of raw) {
      if (placed >= want) break;
      const spot = this.nearestCacheTile(Math.round(s.x), Math.round(s.y));
      if (!spot) continue;
      if (used.some((u) => Math.hypot(u.x - spot.x, u.y - spot.y) < 7)) continue;
      if (this.outpostAt(spot.x, spot.y)) continue;
      this.crates.push({ x: spot.x + 0.5, y: spot.y + 0.5, kind: kinds[placed] ?? "cash" });
      used.push(spot);
      placed++;
    }
    if (placed >= 3) return;
    const cx = (this.gw / 2) | 0;
    const cy = (this.gh / 2) | 0;
    for (let r = 6; r <= 28 && placed < 5; r += 4) {
      for (let i = 0; i < 8 && placed < 5; i++) {
        const ang = (i / 8) * Math.PI * 2 + r * 0.17;
        const spot = this.nearestCacheTile(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.85));
        if (!spot || used.some((u) => Math.hypot(u.x - spot.x, u.y - spot.y) < 7)) continue;
        this.crates.push({ x: spot.x + 0.5, y: spot.y + 0.5, kind: kinds[placed] ?? "cash" });
        used.push(spot);
        placed++;
      }
    }
  }

  private landHaul() {
    this.haulLanded = true;
    const spot = this.nearestCacheTile((this.gw / 2) | 0, (this.gh / 2) | 0);
    if (!spot) return;
    this.crates.push({ x: spot.x + 0.5, y: spot.y + 0.5, kind: "haul" });
    this.say("Heavy field haul on the center", "haul", 2);
  }

  private splitHaul(x: number, y: number) {
    const offs = [
      [2, 0],
      [-1, 2],
      [-1, -2],
    ];
    for (const [dx, dy] of offs) {
      const spot = this.nearestCacheTile(Math.round(x + dx), Math.round(y + dy));
      if (spot) this.crates.push({ x: spot.x + 0.5, y: spot.y + 0.5, kind: "cash" });
    }
  }

  private cacheTileOk(x: number, y: number): boolean {
    if (x < 2 || y < 2 || x >= this.gw - 2 || y >= this.gh - 2) return false;
    const t = this.terrain[y * this.gw + x] ?? 0;
    if (t === TILE_SCRUB || t === TILE_CLIFF || t === TILE_ROCK) return false;
    if (isWater(t) && t !== TILE_FORD) return false;
    if (!allows(t, "infantry", 0)) return false;
    for (const s of this.starts.slots) {
      if (Math.hypot(s.x - x, s.y - y) < 7) return false;
    }
    for (const c of this.crates) {
      if (c.x < 0) continue;
      if (Math.hypot(c.x - (x + 0.5), c.y - (y + 0.5)) < 3.5) return false;
    }
    return true;
  }

  private nearestCacheTile(x: number, y: number): { x: number; y: number } | null {
    if (this.cacheTileOk(x, y)) return { x, y };
    for (let r = 1; r <= 24; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.cacheTileOk(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  private tickSupply(dt: number) {
    for (let t = 0; t <= this.opponents; t++) {
      const team = t as Team;
      const per = this.supplyPerSec(team);
      if (per <= 0) continue;
      const add = per * dt;
      this.credits[team] += add;
      this.income[team] += add;
    }
  }

  private tickBoosts(dt: number) {
    for (let t = 0; t < 4; t++) {
      if (this.worksLeft[t]! > 0) this.worksLeft[t] = Math.max(0, this.worksLeft[t]! - dt);
      if (this.worksCd[t]! > 0) this.worksCd[t] = Math.max(0, this.worksCd[t]! - dt);
      if (this.marchLeft[t]! > 0) this.marchLeft[t] = Math.max(0, this.marchLeft[t]! - dt);
      if (this.marchCd[t]! > 0) this.marchCd[t] = Math.max(0, this.marchCd[t]! - dt);
      if (this.commandLeft[t]! > 0) {
        const rush = this.worksLeft[t]! > 0 ? 1.65 : 1;
        this.commandLeft[t] = Math.max(0, this.commandLeft[t]! - dt * rush);
        if (this.commandLeft[t] === 0) {
          this.commandLv[t] = Math.min(CP_MAX, (this.commandLv[t] ?? 0) + 1);
          if (t === this.ear) this.say("Command raised");
        }
      }
    }
  }

  /** Infantry in woods stay hidden until a shot, a detector, or a ground unit beside them. Air does not spot them. */
  private inCover(u: Unit): boolean {
    if (u.armor !== "infantry" || u.loco === "air" || u.loco === "sea") return false;
    const tx = u.x | 0;
    const ty = u.y | 0;
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return false;
    return this.terrain[ty * this.gw + tx] === TILE_SCRUB;
  }

  private coverBroken(viewer: Team, u: Unit): boolean {
    for (const o of this.units) {
      if (!this.allied(o.team, viewer) || o.hp <= 0 || o.aboard) continue;
      if (o.loco === "air" || o.loco === "sea") continue;
      if (Math.hypot(o.x - u.x, o.y - u.y) <= 1.55) return true;
    }
    for (const b of this.buildings) {
      if (!this.allied(b.team, viewer) || b.hp <= 0 || !b.complete) continue;
      if (b.kind !== "tower" && b.kind !== "aa") continue;
      if (this.powerOf(b.team).low) continue;
      if (distPointToRect(u.x, u.y, b) <= Math.max(2.4, b.range * 0.7)) return true;
    }
    return false;
  }

  private randomLand(): { x: number; y: number } | null {
    for (let n = 0; n < 24; n++) {
      const x = 2 + this.roll(this.gw - 4);
      const y = 2 + this.roll(this.gh - 4);
      const t = this.terrain[y * this.gw + x];
      if (t === TILE_SCRUB || isShell(t)) continue;
      if (isWater(t) && t !== TILE_FORD) continue;
      if (!allows(t, "infantry", this.craters[y * this.gw + x] ?? 0)) continue;
      return { x, y };
    }
    return null;
  }

  private tickIncome(dt: number) {
    this.rateAcc += dt;
    if (this.rateAcc < 20) return;
    this.rateAcc = 0;
    for (let t = 0; t < this.income.length; t++) {
      this.rate[t] = (this.income[t] - this.incomeAt[t]) / 20;
      this.incomeAt[t] = this.income[t];
    }
  }

  private hostileRate(): number {
    let n = 0;
    for (let t = 1; t <= this.opponents; t++) {
      if (!this.allied(0, t)) n += this.rate[t] ?? 0;
    }
    return n;
  }

  private applyCloak() {
    for (const u of this.units) {
      if (u.hp <= 0 || u.armor !== "infantry") continue;
      if (u.baseStealth) {
        u.stealth = true;
        continue;
      }
      u.stealth = u.reveal <= 0 && this.cloakHere(u);
    }
  }

  private cloakHere(u: Unit): boolean {
    if (this.powerOf(u.team).low) return false;
    for (const b of this.buildings) {
      if (b.team !== u.team || b.special !== "stealth" || !b.complete || b.hp <= 0) continue;
      if (distPointToRect(u.x, u.y, b) <= b.range) return true;
    }
    return false;
  }

  private sweep() {
    if (this.units.some((u) => u.hp <= 0)) this.units = this.units.filter((u) => u.hp > 0);
    if (this.buildings.some((b) => b.hp <= 0 && b.rubble < 100)) {
      this.buildings = this.buildings.filter((b) => b.hp > 0 || b.rubble >= 100);
    }
  }

  private checkEnd() {
    if (this.outcome !== "playing") return;
    this.noteLastBuilding();
    for (let t = 0; t <= this.opponents; t++) {
      const team = t as Team;
      if (!this.eliminated[team] && this.campDown(team)) this.eliminate(team);
    }
    const sides = new Set<number>();
    for (let t = 0; t <= this.opponents; t++) {
      if (!this.eliminated[t]) sides.add(this.alliance[t] ?? t);
    }
    if (sides.size <= 1) {
      const side = sides.values().next().value as number | undefined;
      const mine = this.alliance[0] ?? 0;
      const won = side === mine && sides.size === 1;
      this.finish(
        won ? "win" : "lose",
        won ? "Enemy forces destroyed" : "No buildings or units remain",
      );
      return;
    }
    if (this.mode === "survive" && this.time >= this.surviveFor) {
      const mine = this.alliance[0] ?? 0;
      const up = [...sides].some((side) => side === mine);
      this.finish(up ? "win" : "lose", up ? "Held the field" : "No buildings or units remain");
      return;
    }
    if (this.mode === "destroy" && (this.difficulty === "hard" || this.difficulty === "normal") && this.time >= HARD_CAP_SECS) {
      const mineSide = this.alliance[0] ?? 0;
      const mine = this.matchScore(mineSide);
      let bestOther = -1;
      const seen = new Set<number>();
      for (let t = 0; t <= this.opponents; t++) {
        if (this.eliminated[t]) continue;
        const side = this.alliance[t] ?? t;
        if (side === mineSide || seen.has(side)) continue;
        seen.add(side);
        bestOther = Math.max(bestOther, this.matchScore(side));
      }
      const won = mine >= bestOther;
      this.finish(
        won ? "win" : "lose",
        won ? "Twenty minutes. Your side leads on score" : "Twenty minutes. The enemy leads on score",
      );
      return;
    }
    if (this.time >= 720 && this.rate[0] > this.hostileRate() + 8) {
      this.lead += 0.1;
      if (this.lead >= 240) this.finish("win", "Crystal income held for 4 minutes");
    } else if (this.time >= 720) {
      this.lead = 0;
    }
  }

  /** A completed Construction Yard. Without one, that side cannot place buildings. */
  private hasYard(team: Team): boolean {
    return this.buildings.some(
      (b) => b.team === team && b.kind === "yard" && b.complete && b.hp > 0 && b.rubble <= 0 && b.collapse <= 0,
    );
  }

  /** Walls, bridges, and rubble do not keep a side alive. */
  private realBuildings(team: Team): number {
    let n = 0;
    for (const b of this.buildings) {
      if (b.team !== team || b.neutral) continue;
      if (b.hp <= 0 || b.rubble > 0 || b.collapse > 0) continue;
      if (isFence(b.kind) || b.kind === "span") continue;
      n++;
    }
    return n;
  }

  private noteLastBuilding() {
    for (let t = 0; t <= this.opponents; t++) {
      const team = t as Team;
      if (this.eliminated[team]) continue;
      const n = this.realBuildings(team);
      if (n === 1) {
        if (!this.lastOne[team]) {
          this.lastOne[team] = true;
          if (team === this.ear) this.say("Last building!", "lastb", 6);
        }
      } else if (n > 1) {
        this.lastOne[team] = false;
      }
    }
  }

  /** Eliminated only when nothing real is left: no buildings and no live units. */
  private campDown(team: Team): boolean {
    if (this.eliminated[team]) return true;
    if (this.realBuildings(team) > 0) return false;
    if (this.units.some((u) => u.team === team && u.hp > 0)) return false;
    return true;
  }

  /**
   * Buildings and units still on the field after the Construction Yard is gone.
   * Walls, bridges, and rubble do not count. Null until a yard has existed,
   * while one still stands (including a rebuild), or once the side is wiped.
   */
  yardHold(team: Team): number | null {
    if (!this.hadYard[team] || this.eliminated[team]) return null;
    const yardUp = this.buildings.some(
      (b) => b.team === team && b.kind === "yard" && b.hp > 0 && b.rubble <= 0 && b.collapse <= 0,
    );
    if (yardUp) return null;
    const n = this.realBuildings(team) + this.units.filter((u) => u.team === team && u.hp > 0).length;
    return n > 0 ? n : null;
  }

  yardLostLine(team: Team): string | null {
    const n = this.yardHold(team);
    if (n == null) return null;
    return `Construction Yard lost: ${n} buildings/units left`;
  }

  private finish(outcome: "win" | "lose", reason: string) {
    this.outcome = outcome;
    this.reason = reason;
    if (this.constructBed) {
      this.constructBed = false;
      this.cue({ t: "bed", id: "construct", on: false });
    }
    if (this.brownBed) {
      this.brownBed = false;
      this.cue({ t: "bed", id: "brownout", on: false });
    }
    this.cue({ t: "voice", id: outcome === "win" ? "win" : "lose" });
    this.cue({ t: "sfx", id: outcome });
  }

  private updateFog() {
    if (!this.fogOn) {
      for (const fog of this.fog) fog.fill(2);
      return;
    }
    for (let t = 0; t < this.fog.length; t++) {
      const fog = this.fog[t];
      if (!fog) continue;
      for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    }
    for (const u of this.units) {
      if (u.hp > 0 && !this.eliminated[u.team]) {
        const bonus = u.armor === "infantry" && this.marchLeft[u.team]! > 0 ? 2.2 : 0;
        const high = u.loco !== "air" && u.loco !== "sea" && this.elevOf(u.x, u.y) >= 2 ? HIGH_SIGHT : 0;
        this.reveal(u.team, u.x, u.y, u.sight + bonus + high);
      }
    }
    for (const b of this.buildings) {
      if (b.hp > 0 && !b.neutral && !this.eliminated[b.team]) {
        this.reveal(b.team, b.tx + b.w / 2, b.ty + b.h / 2, b.complete ? b.sight : 4);
      }
    }
    if (this.sharedVision) this.shareSight();
    for (const s of this.spots) {
      if (s.ttl <= 0) continue;
      this.reveal(s.team, s.x, s.y, 2.4);
    }
    this.trackKnown();
    this.trackHalls();
  }

  private shareSight() {
    for (let a = 0; a <= this.opponents; a++) {
      if (this.eliminated[a]) continue;
      const fog = this.fog[a];
      if (!fog) continue;
      for (let b = 0; b <= this.opponents; b++) {
        if (a === b || this.eliminated[b] || !this.allied(a, b)) continue;
        const other = this.fog[b];
        if (!other) continue;
        for (let i = 0; i < fog.length; i++) if (other[i] === 2) fog[i] = 2;
      }
    }
  }

  private sightClear(x0: number, y0: number, x1: number, y1: number): boolean {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist * 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(x0 + (x1 - x0) * t);
      const y = Math.floor(y0 + (y1 - y0) * t);
      if (x === Math.floor(x1) && y === Math.floor(y1)) continue;
      if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return false;
      if (blocksSight(this.terrain[y * this.gw + x] ?? 0) && this.elevOf(x0, y0) < 2) return false;
    }
    return true;
  }

  private reveal(team: Team, cx: number, cy: number, radius: number) {
    const fog = this.fog[team];
    if (!fog) return;
    const r = Math.ceil(radius);
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(this.gw - 1, Math.ceil(cx + r));
    const y1 = Math.min(this.gh - 1, Math.ceil(cy + r));
    const r2 = radius * radius;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        if (!this.sightClear(cx, cy, x + 0.5, y + 0.5)) continue;
        fog[y * this.gw + x] = 2;
      }
    }
  }

  private separate() {
    const list = this.units;
    const zone = wideField(this.mapSize);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.hp <= 0 || this.pinned(a) || a.loco === "air" || a.aboard) continue;
      if (zone && !this.liveUnit(a)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.hp <= 0 || this.pinned(b) || b.loco === "air" || b.aboard) continue;
        if (zone && !this.liveUnit(b)) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const friendly = a.team === b.team;
        const bothFoot = a.armor === "infantry" && b.armor === "infantry";
        const gap = friendly ? (bothFoot ? 0.72 : Math.max(a.radius + b.radius, 0.95)) : a.radius + b.radius;
        const min = Math.max(gap, a.radius + b.radius);
        let d = Math.hypot(dx, dy);
        if (d < 0.001) {
          dx = ((a.id % 5) - 2) * 0.01;
          dy = 0.02;
          d = Math.hypot(dx, dy);
        }
        if (d >= min) continue;
        const push = (min - d) * (friendly ? 0.7 : 0.4);
        const ux = dx / d;
        const uy = dy / d;
        this.tryNudge(a, -ux * push, -uy * push);
        this.tryNudge(b, ux * push, uy * push);
      }
    }
  }

  private pinned(u: Unit): boolean {
    if (u.order.t === "deploy") return true;
    if (u.kind !== "harvester" || (u.order.t !== "harvest" && u.order.t !== "return")) return false;
    if (this.adjacentCrystal(u.x, u.y, u.team) && u.cargo < u.cargoMax) return true;
    const ref = this.nearestRefinery(u.team);
    if (ref && u.cargo > 0 && hypot(u.x, u.y, this.doorOf(ref).x, this.doorOf(ref).y) < 1.25) return true;
    return false;
  }

  private tryNudge(u: Unit, dx: number, dy: number) {
    if (this.pinned(u)) return;
    const nx = u.x + dx;
    const ny = u.y + dy;
    if (this.passable(u, nx, ny) && this.gradeStep(u, nx, ny)) {
      u.x = nx;
      u.y = ny;
    }
  }

  deploySpot(u: Unit): { ok: boolean; reason: string; tx?: number; ty?: number } {
    const tx = Math.floor(u.x) - 1;
    const ty = Math.floor(u.y) - 1;
    if (tx < 1 || ty < 1 || tx + 3 >= this.gw - 1 || ty + 3 >= this.gh - 1) {
      return { ok: false, reason: "No room to deploy" };
    }
    for (let y = ty; y < ty + 3; y++) {
      for (let x = tx; x < tx + 3; x++) {
        const i = y * this.gw + x;
        if (this.terrain[i] === TILE_ROCK) return { ok: false, reason: "Rock under the pad" };
        if (this.crystal[i] > 0) return { ok: false, reason: "Crystal under the pad" };
        if (this.occ[i] !== 0) return { ok: false, reason: "No room to deploy" };
        if (this.unitBlocksTile(x, y, u.id)) return { ok: false, reason: "Move units off the pad" };
      }
    }
    return { ok: true, reason: "", tx, ty };
  }

  private addBuilding(team: Team, kind: BuildingId, tx: number, ty: number, complete: boolean, neutral = false): Building {
    const def = resolveBuilding(kind, this.factionOf(team));
    const b: Building = {
      id: this.nextId++,
      kind,
      team,
      name: def.name,
      tx,
      ty,
      w: def.w,
      h: def.h,
      hp: complete ? def.hp : Math.max(1, def.hp * 0.12),
      maxHp: def.hp,
      complete,
      buildLeft: complete ? 0 : def.time,
      buildTotal: Math.max(0.1, def.time),
      queue: [],
      prod: 0,
      rallyX: 0,
      rallyY: 0,
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
      neutral,
      special: def.special ?? null,
      vsAir: def.vsAir ?? 0,
      open: kind === "gate",
      rubble: 0,
      block: 0,
      hit: 0,
      shown: 0,
      mending: false,
      collapse: 0,
      prize: false,
      cap: 0,
      capTeam: -2,
    };
    const door = this.doorOf(b);
    b.rallyX = door.x;
    b.rallyY = team === 0 ? door.y - 2.4 : door.y + 2.4;
    this.buildings.push(b);
    if (!neutral) this.fillOcc(b);
    if (kind === "yard") this.hadYard[team] = true;
    return b;
  }

  private fillOcc(b: Building) {
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) this.occ[y * this.gw + x] = b.id;
    }
  }

  private clearOcc(b: Building) {
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        const i = y * this.gw + x;
        if (this.occ[i] === b.id) this.occ[i] = 0;
      }
    }
  }

  private pushUnitsOff(tx: number, ty: number, w: number, h: number, ignore: number) {
    for (const u of this.units) {
      if (u.id === ignore || u.hp <= 0 || u.loco === "air" || u.aboard) continue;
      if (u.x < tx - 0.2 || u.y < ty - 0.2 || u.x > tx + w + 0.2 || u.y > ty + h + 0.2) continue;
      const spot = nearestOpen(tx + w, ty + (h >> 1), this.blockFn, 6, this.gw, this.gh);
      if (spot) {
        u.x = spot.x + 0.5;
        u.y = spot.y + 0.5;
        u.path = [];
      }
    }
  }

  doorOf(b: Building): { x: number; y: number } {
    if (b.kind === "dock") {
      for (let y = b.ty - 1; y <= b.ty + b.h; y++) {
        for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
          if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) continue;
          const t = this.terrain[y * this.gw + x];
          if (t === TILE_DEEP || t === TILE_SHALLOW) return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    const south = b.team !== 0;
    const prefer = south
      ? { x: b.tx + b.w / 2, y: b.ty + b.h + 0.55 }
      : { x: b.tx + b.w / 2, y: b.ty - 0.55 };
    if (this.footOpen(prefer.x, prefer.y)) return prefer;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = b.ty - 1; y <= b.ty + b.h; y++) {
      for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
        const inside = x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h;
        if (inside) continue;
        const px = x + 0.5;
        const py = y + 0.5;
        if (!this.footOpen(px, py)) continue;
        const d = (px - prefer.x) ** 2 + (py - prefer.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    return best ?? prefer;
  }

  /** Land a harvester or a rally can stand on. Buildings and water are closed. */
  footOpen(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= this.gw - 1 || ty >= this.gh - 1) return false;
    const t = this.terrain[ty * this.gw + tx];
    const mark = this.craters[ty * this.gw + tx] ?? 0;
    if (t === TILE_ROCK || t === TILE_CLIFF || t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_WRECK || t === TILE_SCRUB) return false;
    if (isShell(t) && mark < 2) return false;
    if (this.occ[ty * this.gw + tx] !== 0) return false;
    return true;
  }

  private nearFriendly(team: Team, tx: number, ty: number, w: number, h: number): boolean {
    let any = false;
    for (const b of this.buildings) {
      if (b.team !== team || b.neutral || !b.complete || b.hp <= 0 || isFence(b.kind)) continue;
      any = true;
      const gap = rectGap(tx, ty, w, h, b.tx, b.ty, b.w, b.h);
      if (gap >= 0 && gap <= BUILD_GAP) return true;
    }
    return false && any;
  }

  private unitBlocksTile(tx: number, ty: number, ignore: number): boolean {
    for (const u of this.units) {
      if (u.hp <= 0 || u.id === ignore || u.aboard || u.loco === "air") continue;
      const cx = Math.max(tx, Math.min(u.x, tx + 1));
      const cy = Math.max(ty, Math.min(u.y, ty + 1));
      const dx = u.x - cx;
      const dy = u.y - cy;
      if (dx * dx + dy * dy <= u.radius * u.radius) return true;
    }
    return false;
  }

  blockedTile(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return true;
    const i = y * this.gw + x;
    const t = this.terrain[i];
    const mark = this.craters[i] ?? 0;
    if (t === TILE_ROCK || t === TILE_CLIFF || t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_WRECK || t === TILE_SCRUB) return true;
    if (isShell(t) && mark < 2) return true;
    if (this.occ[i] !== 0) return true;
    return false;
  }

  private blockedWorld(x: number, y: number): boolean {
    return this.blockedTile(Math.floor(x), Math.floor(y));
  }

  /** Snap an order onto this unit's domain. Sea goals land on water; transports can stop on shore. */
  private domainGoal(u: Unit, x: number, y: number): { x: number; y: number } {
    if (u.loco === "air" || this.passable(u, x, y)) return { x, y };
    const tile = this.nearestDomainTile(u, x | 0, y | 0, 48);
    if (tile) return { x: tile.x + 0.5, y: tile.y + 0.5 };
    // Open water (or a cliff) farther than the ring search: walk the ray back toward the unit.
    const dist = Math.hypot(u.x - x, u.y - y);
    const steps = Math.min(96, Math.max(8, Math.ceil(dist) + 1));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x + (u.x - x) * t;
      const py = y + (u.y - y) * t;
      if (this.passable(u, px, py)) return { x: px, y: py };
    }
    return { x: u.x, y: u.y };
  }

  private nearestDomainTile(u: Unit, gx: number, gy: number, radius = 10): { x: number; y: number } | null {
    for (let r = 1; r <= radius; r++) {
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = gx + dx;
          const ty = gy + dy;
          if (!this.passable(u, tx, ty)) continue;
          const d = hypot(u.x, u.y, tx + 0.5, ty + 0.5);
          if (d < bestD) {
            bestD = d;
            best = { x: tx, y: ty };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private nearestBoat(u: Unit, radius: number): Target | null {
    let best: Target | null = null;
    let bestD = radius;
    for (const o of this.units) {
      if (this.allied(o.team, u.team) || o.hp <= 0 || o.aboard || o.loco !== "sea") continue;
      if (!this.visibleUnit(u.team, o)) continue;
      const d = hypot(u.x, u.y, o.x, o.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: "unit", u: o };
      }
    }
    return best;
  }

  private nearestBuilding(u: Unit, radius: number): Target | null {
    let best: Target | null = null;
    let bestD = radius;
    for (const b of this.buildings) {
      if (this.allied(b.team, u.team) || b.neutral || b.hp <= 0) continue;
      if (!this.buildingVisible(u.team, b)) continue;
      const d = distPointToRect(u.x, u.y, b);
      if (d < bestD) {
        bestD = d;
        best = { kind: "building", b };
      }
    }
    return best;
  }

  private nearestAir(u: Unit, radius: number): Target | null {
    return this.nearestAirAt(u.team, u.x, u.y, radius);
  }

  /** Shore buildings first. A bridge in range is a fair target when nothing else is. */
  private nearestStrike(u: Unit, radius: number): Target | null {
    const bld = this.nearestBuilding(u, radius);
    if (bld) return bld;
    let best: Target | null = null;
    let bestD = radius;
    for (const b of this.buildings) {
      if (b.kind !== "span" || b.hp <= 0) continue;
      if (!this.buildingVisible(u.team, b)) continue;
      const d = distPointToRect(u.x, u.y, b);
      if (d < bestD) {
        bestD = d;
        best = { kind: "building", b };
      }
    }
    return best;
  }

  /** Missile boats kill hulls. Assault ships shell the shore. Skiffs only peck a frigate. */
  private navalMul(u: Unit, target: Target): number {
    const sea = target.kind === "unit" && target.u.loco === "sea";
    if (u.kind === "missile") return sea ? 1.85 : 0.62;
    if (u.kind === "frigate") return sea ? 0.7 : 1;
    if (u.kind === "gunboat") {
      if (sea && target.kind === "unit" && target.u.kind === "frigate") return 0.35;
      return sea ? 0.85 : 0.55;
    }
    return 1;
  }

  /**
   * Tap on a wall in front of a structure orders the structure.
   * A wall with no structure nearby stays the target, so a lone fence can still be demolished.
   */
  strikeTarget(viewer: Team, id: number, x: number, y: number): number {
    const b = this.buildingById(id);
    if (!b || b.hp <= 0 || !isFence(b.kind)) return id;
    let best = id;
    let bestD = 4.6;
    for (const o of this.buildings) {
      if (o.id === b.id || o.hp <= 0 || o.neutral || o.kind === "span" || isFence(o.kind)) continue;
      if (this.allied(viewer, o.team)) continue;
      if (!this.buildingVisible(viewer, o)) continue;
      const d = distPointToRect(x, y, o);
      if (d < bestD) {
        bestD = d;
        best = o.id;
      }
    }
    return best;
  }

  private orderedStructure(u: Unit): Building | null {
    if (u.order.t !== "attack" || u.damage <= 0 || u.loco === "air" || u.loco === "sea") return null;
    const t = this.targetById(u.order.id);
    if (!t || t.kind !== "building" || isFence(t.b.kind) || t.b.kind === "span" || t.b.hp <= 0) return null;
    return t.b;
  }

  private liveBreach(u: Unit): Target | null {
    if (!u.breach) return null;
    const wall = this.buildingById(u.breach);
    if (!wall || wall.hp <= 0 || wall.rubble > 0 || !isFence(wall.kind) || this.allied(wall.team, u.team)) {
      u.breach = 0;
      return null;
    }
    return { kind: "building", b: wall };
  }

  private touchesFootprint(b: Building, tx: number, ty: number): boolean {
    if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) return false;
    return tx >= b.tx - 1 && tx <= b.tx + b.w && ty >= b.ty - 1 && ty <= b.ty + b.h;
  }

  private armBreach(u: Unit, b: Building) {
    const fence = this.fenceOnOnlyRoute(u, b.tx + b.w / 2, b.ty + b.h / 2);
    const prev = u.breach;
    u.breach = fence?.id ?? 0;
    if (u.breach && u.breach !== prev && u.team === this.ear) this.say("The wall is the only way in", "breach", 5);
  }

  private armBreachMove(u: Unit) {
    if (u.order.t !== "move") return;
    const fence = this.fenceOnOnlyRoute(u, u.order.x, u.order.y);
    const prev = u.breach;
    u.breach = fence?.id ?? 0;
    if (u.breach && u.breach !== prev && u.team === this.ear) this.say("The wall is the only way in", "breach", 5);
  }

  /** Same as passable, except an enemy fence counts as open so we can see the wall that seals the route. */
  private passableThroughFence(u: Unit, x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return false;
    if (u.loco === "air") return true;
    const t = this.terrain[ty * this.gw + tx];
    if (t === TILE_ROCK || t === TILE_CLIFF) return false;
    const occId = this.occ[ty * this.gw + tx];
    if (occId !== 0) {
      const b = this.buildingById(occId);
      const enemyFence = !!b && isFence(b.kind) && b.hp > 0 && !this.allied(b.team, u.team) && !this.fenceAllows(u, b);
      if (!enemyFence && (!b || !this.fenceAllows(u, b))) return false;
    }
    if (u.loco === "sea") {
      if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD) return true;
      return t === TILE_SHORE && u.kind === "transport";
    }
    if (u.loco === "land" || u.loco === "amphib") {
      if (t === TILE_SCRUB && u.armor !== "infantry") return false;
      return t !== TILE_DEEP && t !== TILE_SHALLOW;
    }
    return true;
  }

  /** First enemy fence on a route that only exists if fences can be crossed. Null when rock or water is the block. */
  private fenceOnOnlyRoute(u: Unit, x: number, y: number): Building | null {
    if (u.loco === "air" || u.loco === "sea") return null;
    const path = findPath(
      (tx, ty) => !this.passableThroughFence(u, tx, ty),
      u.x | 0,
      u.y | 0,
      x | 0,
      y | 0,
      this.gw,
      this.gh,
      undefined,
      (x0, y0, x1, y1) => this.gradeOk(u, x0, y0, x1, y1),
    );
    if (!path || path.length < 2) return null;
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.hp <= 0 || b.rubble > 0 || !isFence(b.kind)) continue;
      if (this.allied(b.team, u.team) || this.fenceAllows(u, b)) continue;
      const sx = b.tx + b.w / 2;
      const sy = b.ty + b.h / 2;
      let onRoute = false;
      for (let i = 1; i < path.length; i++) {
        const ax = path[i - 1].x + 0.5;
        const ay = path[i - 1].y + 0.5;
        const bx = path[i].x + 0.5;
        const by = path[i].y + 0.5;
        if (distToSeg(sx, sy, ax, ay, bx, by) < 1.15) {
          onRoute = true;
          break;
        }
      }
      if (!onRoute) continue;
      const du = hypot(u.x, u.y, sx, sy);
      if (du < bestD) {
        bestD = du;
        best = b;
      }
    }
    return best;
  }

  private requestPath(u: Unit, x: number, y: number, force: boolean) {
    if (!force && u.repath > 0) return;
    const ordered = this.orderedStructure(u);
    const wall = u.breach ? this.buildingById(u.breach) : null;
    const headingForWall = !!wall && wall.hp > 0 && distPointToRect(x, y, wall) < 1.8;
    const sticky = !!ordered && !headingForWall && distPointToRect(x, y, ordered) < 2.6;
    const attackHop =
      !ordered && u.order.t === "move" && u.order.attackMove && hypot(x, y, u.order.x, u.order.y) < 2.5;
    const goal = sticky ? { x, y } : this.domainGoal(u, x, y);
    const path = findPath(
      (tx, ty) => !this.passable(u, tx, ty),
      u.x | 0,
      u.y | 0,
      goal.x | 0,
      goal.y | 0,
      this.gw,
      this.gh,
      (tx, ty) => this.stepCost(tx, ty),
      (x0, y0, x1, y1) => this.gradeOk(u, x0, y0, x1, y1),
    );
    u.repath = 0.4 + (u.id % 5) * 0.07;
    if (!path) {
      u.path = [];
      if (sticky && ordered) this.armBreach(u, ordered);
      else if (attackHop) this.armBreachMove(u);
      const boxed = !this.hasExit(u);
      // A sealed pocket cancels a plain move. Attack and attack-move keep their
      // order so focus-fire and a march through the fog are not dropped.
      if (boxed && u.loco !== "air" && u.order.t === "move" && !u.order.attackMove) {
        u.blocked = 0.9;
        u.order = { t: "idle" };
        if (u.team === 0) this.say("Blocked", "blocked", 1.4);
      }
      // Attack orders are never cancelled because the building's own tiles are blocked.
      return;
    }
    if (path.length && path[0].x === (u.x | 0) && path[0].y === (u.y | 0)) path.shift();
    u.path = path;
    if (sticky && ordered) {
      const end = u.path[u.path.length - 1];
      const reached = end ? this.touchesFootprint(ordered, end.x, end.y) : false;
      const standing = this.touchesFootprint(ordered, u.x | 0, u.y | 0);
      if (reached || standing) u.breach = 0;
      else this.armBreach(u, ordered);
    } else if (attackHop) {
      u.breach = 0;
    }
  }

  private hasExit(u: Unit): boolean {
    const tx = u.x | 0;
    const ty = u.y | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.passable(u, tx + dx + 0.2, ty + dy + 0.2)) return true;
      }
    }
    return false;
  }

  /** Nearest open tile within weapon range of the footprint edge. The building's own tiles are never a block. */
  private approachTile(b: Building, u: Unit, range = 4.4): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const pad = Math.max(1, Math.ceil(range));
    for (let y = b.ty - pad; y <= b.ty + b.h + pad - 1; y++) {
      for (let x = b.tx - pad; x <= b.tx + b.w + pad - 1; x++) {
        if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) continue;
        if (x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h) continue;
        if (!this.passable(u, x + 0.5, y + 0.5)) continue;
        const edge = distPointToRect(x + 0.5, y + 0.5, b);
        if (edge > range + 0.05) continue;
        const d = hypot(u.x, u.y, x + 0.5, y + 0.5);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  }

  /** Closest hostile unit or hall inside the leash. Fences and far targets do not pull an attack-move off its path. */
  private nearestOnPath(team: Team, x: number, y: number, radius: number, hitsAir: boolean): Target | null {
    let best: Target | null = null;
    let bestD = radius;
    for (const u of this.units) {
      if (this.allied(u.team, team) || u.hp <= 0 || u.aboard) continue;
      if (u.loco === "air" && !hitsAir) continue;
      if (!this.visibleUnit(team, u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bestD) {
        bestD = d;
        best = { kind: "unit", u };
      }
    }
    for (const b of this.buildings) {
      if (this.allied(b.team, team) || b.neutral || b.prize || b.hp <= 0 || b.rubble > 0) continue;
      if (isFence(b.kind) || b.kind === "span") continue;
      if (!this.buildingVisible(team, b)) continue;
      const d = distPointToRect(x, y, b);
      if (d < bestD) {
        bestD = d;
        best = { kind: "building", b };
      }
    }
    return best;
  }

  private nearestFoe(
    team: Team,
    x: number,
    y: number,
    radius: number,
    hitsAir = false,
    preferAir = false,
    fences = false,
  ): Target | null {
    if (preferAir && hitsAir) {
      const air = this.nearestAirAt(team, x, y, radius);
      if (air) return air;
    }
    let combat: Target | null = null;
    let combatD = radius;
    let other: Target | null = null;
    let otherD = radius;
    let structure: Target | null = null;
    let structureD = radius;
    let fence: Target | null = null;
    let fenceD = radius;
    for (const u of this.units) {
      if (this.allied(u.team, team) || u.hp <= 0 || u.aboard) continue;
      if (u.loco === "air" && !hitsAir) continue;
      if (!this.visibleUnit(team, u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (u.damage > 0) {
        if (d < combatD) {
          combatD = d;
          combat = { kind: "unit", u };
        }
      } else if (d < otherD) {
        otherD = d;
        other = { kind: "unit", u };
      }
    }
    for (const b of this.buildings) {
      if (this.allied(b.team, team) || b.neutral || b.prize || b.hp <= 0) continue;
      if (!this.buildingVisible(team, b)) continue;
      const d = distPointToRect(x, y, b);
      if (isFence(b.kind)) {
        if (d < fenceD) {
          fenceD = d;
          fence = { kind: "building", b };
        }
        continue;
      }
      if (d < structureD) {
        structureD = d;
        structure = { kind: "building", b };
      }
    }
    // Soldiers and vehicles before structures. A wall is last, and only when nothing else is in reach.
    if (combat) return combat;
    if (other) return other;
    if (structure) return structure;
    if (fences) return fence;
    return null;
  }

  private nearestAirAt(team: Team, x: number, y: number, radius: number): Target | null {
    let best: Target | null = null;
    let bestD = radius;
    for (const u of this.units) {
      if (u.loco !== "air" || u.hp <= 0 || u.aboard || this.allied(u.team, team)) continue;
      if (!this.visibleUnit(team, u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bestD) {
        bestD = d;
        best = { kind: "unit", u };
      }
    }
    return best;
  }

  /** Powered Radar Mast or Scout Buggy. Woods and cloaks share this check. */
  private sensorNear(viewer: Team, unit: Unit): boolean {
    if (!this.powerOf(viewer).low) {
      for (const b of this.buildings) {
        if (b.team !== viewer || b.special !== "radar" || !b.complete || b.hp <= 0) continue;
        if (distPointToRect(unit.x, unit.y, b) <= DETECT_RADAR) return true;
      }
    }
    for (const o of this.units) {
      if (!this.allied(o.team, viewer) || o.hp <= 0 || o.kind !== "scout") continue;
      if (Math.hypot(o.x - unit.x, o.y - unit.y) <= DETECT_SCOUT) return true;
    }
    return false;
  }

  /** Cloak breaks near a powered Radar Mast or a Scout Buggy. A shot breaks it too. */
  private detected(viewer: Team, unit: Unit): boolean {
    if (!unit.stealth || unit.reveal > 0) return true;
    return this.sensorNear(viewer, unit);
  }

  private nearestRefinery(team: Team): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    const origin = this.starts.slots[team] ?? this.starts.player;
    for (const b of this.buildings) {
      if (b.team !== team || b.kind !== "refinery" || !b.complete || b.hp <= 0) continue;
      const d = hypot(origin.x, origin.y, b.tx + b.w / 2, b.ty + b.h / 2);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private nearestCrystal(x: number, y: number, team: Team): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const c = this.crystal;
    for (let i = 0; i < c.length; i++) {
      if (!this.crystalFree(i, team)) continue;
      const tx = i % this.gw;
      const ty = (i / this.gw) | 0;
      const dx = tx + 0.5 - x;
      const dy = ty + 0.5 - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x: tx, y: ty };
      }
    }
    return best;
  }

  private adjacentCrystal(x: number, y: number, team: Team): { x: number; y: number } | null {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x2 = tx + dx;
        const y2 = ty + dy;
        if (x2 < 0 || y2 < 0 || x2 >= this.gw || y2 >= this.gh) continue;
        if (!this.crystalFree(y2 * this.gw + x2, team)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: x2, y: y2 };
        }
      }
    }
    return best;
  }

  private anyCrystal(): boolean {
    for (let i = 0; i < this.crystal.length; i++) if (this.crystal[i] > 0) return true;
    return false;
  }

  private buildingAtPoint(x: number, y: number): Building | null {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return null;
    const id = this.occ[ty * this.gw + tx];
    if (!id) return null;
    return this.buildingById(id) ?? null;
  }

  private targetById(id: number): Target | null {
    const u = this.unitById(id);
    if (u && u.hp > 0) return { kind: "unit", u };
    const b = this.buildingById(id);
    if (b && b.hp > 0) return { kind: "building", b };
    return null;
  }

  private targetPoint(t: Target): { x: number; y: number } {
    if (t.kind === "unit") return { x: t.u.x, y: t.u.y };
    return { x: t.b.tx + t.b.w / 2, y: t.b.ty + t.b.h / 2 };
  }

  private distTo(u: Unit, t: Target): number {
    return this.distFrom(u.x, u.y, t);
  }

  private distFrom(x: number, y: number, t: Target): number {
    if (t.kind === "unit") return Math.hypot(x - t.u.x, y - t.u.y);
    return distPointToRect(x, y, t.b);
  }

  private faceTarget(u: Unit, t: Target) {
    const p = this.targetPoint(t);
    u.facing = Math.atan2(p.y - u.y, p.x - u.x);
  }

  private idsToUnits(ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const u = this.unitById(id);
      if (u && u.hp > 0) out.push(u);
    }
    return out;
  }

  private countLiving(team: Team): number {
    let n = 0;
    for (const u of this.units) if (u.team === team && u.hp > 0) n++;
    return n;
  }

  private structureCount(team: Team): number {
    let n = 0;
    for (const b of this.buildings) {
      if (b.team === team && b.hp > 0 && b.kind !== "span" && !b.neutral) n++;
    }
    return n;
  }

  /** Warzone skips idle enemy armies that nobody can see. Harvesters and attacks always run. */
  private liveUnit(u: Unit): boolean {
    if (!wideField(this.mapSize)) return true;
    if (this.eliminated[u.team]) return false;
    if (u.team === 0 || u.kind === "harvester" || u.order.t === "harvest" || u.order.t === "return") return true;
    if (u.order.t === "attack" || u.order.t === "rearm" || u.order.t === "capture" || u.order.t === "deploy") return true;
    if (u.order.t === "move" || u.order.t === "guard") return true;
    if (u.rearm > 0) return true;
    const tx = u.x | 0;
    const ty = u.y | 0;
    if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return true;
    const i = ty * this.gw + tx;
    for (let t = 0; t <= this.opponents; t++) {
      if (t === u.team || this.eliminated[t]) continue;
      if (this.fog[t]?.[i] === 2) return true;
    }
    return false;
  }

  private crystalFree(i: number, team: Team): boolean {
    if (this.crystal[i] <= 0) return false;
    const owner = this.crystalOwner[i] ?? -1;
    if (owner < 0 || owner === team || this.eliminated[owner]) return true;
    return this.allied(owner, team);
  }

  private claimNodes(ref: Building) {
    const cx = ref.tx + ref.w / 2;
    const cy = ref.ty + ref.h / 2;
    const r = 16;
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(this.gw - 1, Math.ceil(cx + r));
    const y1 = Math.min(this.gh - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const i = y * this.gw + x;
        if (this.crystal[i] <= 0) continue;
        const owner = this.crystalOwner[i] ?? -1;
        if (owner < 0 || owner === ref.team || this.eliminated[owner]) this.crystalOwner[i] = ref.team;
      }
    }
  }

  private releaseNodes(team: Team) {
    for (let i = 0; i < this.crystalOwner.length; i++) {
      if (this.crystalOwner[i] === team) this.crystalOwner[i] = -1;
    }
  }

  private noteUnit(victim: Team, from?: Team) {
    this.statLost[victim] = (this.statLost[victim] ?? 0) + 1;
    if (from === undefined || this.allied(from, victim)) return;
    this.statKills[from] = (this.statKills[from] ?? 0) + 1;
  }

  private notePlant(b: Building, from?: Team) {
    if (b.neutral || b.kind === "span" || isFence(b.kind)) return;
    this.statPlants[b.team] = (this.statPlants[b.team] ?? 0) + 1;
    if (from === undefined || this.allied(from, b.team)) return;
    this.statRazed[from] = (this.statRazed[from] ?? 0) + 1;
  }

  private tallyPower(dt: number) {
    if (this.outcome !== "playing") return;
    for (let t = 0; t <= this.opponents; t++) {
      if (this.eliminated[t]) continue;
      const live = this.powerOf(t as Team);
      if (live.supply > 0 && !live.low) this.statPower[t] = (this.statPower[t] ?? 0) + dt;
    }
  }

  private eliminate(team: Team) {
    if (this.eliminated[team]) return;
    this.eliminated[team] = true;
    if (!this.statOut[team]) this.statOut[team] = this.time;
    for (const b of this.buildings) {
      if (b.team !== team || b.kind === "span") continue;
      b.neutral = true;
      b.queue = [];
      b.prod = 0;
    }
    for (const u of this.units) {
      if (u.team !== team || u.hp <= 0) continue;
      u.order = { t: "idle" };
      u.path = [];
      u.damage = 0;
    }
    this.releaseNodes(team);
    this.say(`${SEAT_NAME[team] ?? "Commander"} eliminated`, "out" + team, 1);
  }

  private seedPods() {
    for (const s of this.starts.corners) {
      const near = this.nearestCrystal(s.x, s.y, 0);
      if (near && Math.hypot(near.x + 0.5 - s.x, near.y + 0.5 - s.y) < 18) continue;
      const dx = Math.sign(this.gw / 2 - s.x) || 1;
      const dy = Math.sign(this.gh / 2 - s.y) || 1;
      const cx = s.x + dx * 8;
      const cy = s.y + dy * 8;
      for (let y = Math.floor(cy - 1.4); y <= Math.ceil(cy + 1.4); y++) {
        for (let x = Math.floor(cx - 1.4); x <= Math.ceil(cx + 1.4); x++) {
          if (x < 2 || y < 2 || x >= this.gw - 2 || y >= this.gh - 2) continue;
          const ddx = x + 0.5 - cx;
          const ddy = y + 0.5 - cy;
          if (ddx * ddx + ddy * ddy > 2.2) continue;
          const i = y * this.gw + x;
          const t = this.terrain[i];
          if (t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_ROUGH && t !== TILE_ROAD && t !== TILE_SPENT) continue;
          if (t === TILE_SPENT) this.terrain[i] = TILE_CLEAR;
          this.crystal[i] = 640;
        }
      }
    }
  }

  /** True when a land unit can walk there. Used by the AI to notice a walled camp. */
  reach(u: Unit, x: number, y: number): boolean {
    if (u.loco === "air") return true;
    const path = findPath(
      (tx, ty) => !this.passable(u, tx + 0.2, ty + 0.2),
      u.x | 0,
      u.y | 0,
      x | 0,
      y | 0,
      this.gw,
      this.gh,
      undefined,
      (x0, y0, x1, y1) => this.gradeOk(u, x0, y0, x1, y1),
    );
    return path !== null;
  }

  /** Nearest water this boat can sit on. Inland clicks snap to the harbor. */
  waterNear(u: Unit, x: number, y: number): { x: number; y: number } | null {
    if (u.loco !== "sea") return null;
    if (this.passable(u, x, y)) return { x, y };
    const tile = this.nearestDomainTile(u, x | 0, y | 0, 18);
    if (!tile) return null;
    return { x: tile.x + 0.5, y: tile.y + 0.5 };
  }

  /**
   * Span that cuts this boat off from the goal. Null when the water is already open
   * or no bridge can be reached.
   */
  bridgeBlocking(u: Unit, x: number, y: number): number | null {
    if (u.loco !== "sea" || u.hp <= 0) return null;
    const goal = this.domainGoal(u, x, y);
    if (this.passable(u, goal.x, goal.y) && this.reach(u, goal.x, goal.y)) return null;
    let best: number | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.kind !== "span" || b.hp <= 0) continue;
      const sx = b.tx + b.w / 2;
      const sy = b.ty + b.h / 2;
      const du = Math.hypot(u.x - sx, u.y - sy);
      const dg = Math.hypot(goal.x - sx, goal.y - sy);
      const total = Math.hypot(u.x - goal.x, u.y - goal.y) || 1;
      if (du + dg > total + 12) continue;
      let approach: { x: number; y: number } | null = null;
      for (let ty = b.ty - 2; ty <= b.ty + b.h + 1 && !approach; ty++) {
        for (let tx = b.tx - 2; tx <= b.tx + b.w + 1; tx++) {
          if (!this.passable(u, tx + 0.2, ty + 0.2)) continue;
          approach = { x: tx + 0.5, y: ty + 0.5 };
          break;
        }
      }
      if (!approach || !this.reach(u, approach.x, approach.y)) continue;
      if (du < bestD) {
        bestD = du;
        best = b.id;
      }
    }
    return best;
  }

  oreNear(team: Team, x: number, y: number): { x: number; y: number } | null {
    return this.nearestCrystal(x, y, team);
  }

  private queuedCount(team: Team): number {
    let n = 0;
    for (const b of this.buildings) if (b.team === team && b.hp > 0) n += b.queue.length;
    return n;
  }

  private clampCoord(v: number): number {
    return Math.max(1.2, Math.min(this.gw - 1.2, v));
  }

  private say(text: string, key?: string, cooldown = 0) {
    if (key) {
      const until = this.logLock.get(key) ?? 0;
      if (this.time < until) return;
      this.logLock.set(key, this.time + cooldown);
    }
    this.logs.push(text);
    if (this.logs.length > 5) this.logs.shift();
  }

  private cue(c: Cue) {
    this.onCue?.(c);
    if (c.t === "sfx") this.onSfx?.(c.id);
  }

  private weaponSfx(u: Unit) {
    if (u.kind === "artillery" || u.kind === "bomber") this.blip("cannon", 0.22, u.x, u.y);
    else if (u.shot === "rocket") this.blip("rocket", 0.16, u.x, u.y);
    else if (u.shot === "shell") this.blip("cannon", 0.18, u.x, u.y);
    else this.blip("rifle", 0.07, u.x, u.y);
  }

  private blip(name: SfxName, gap = 0.12, x?: number, y?: number) {
    const until = this.sfxAt.get(name) ?? 0;
    if (this.time < until) return;
    this.sfxAt.set(name, this.time + gap);
    this.cue({ t: "sfx", id: name, x, y });
  }

  /** Construction hammer and brownout hum follow the listener's base. Audio only. */
  private syncBeds() {
    const constructing = this.buildings.some(
      (b) => b.team === this.ear && b.hp > 0 && !b.complete && !b.neutral && b.rubble <= 0,
    );
    if (constructing !== this.constructBed) {
      this.constructBed = constructing;
      this.cue({ t: "bed", id: "construct", on: constructing });
    }
    const hasBase = this.buildings.some((b) => b.team === this.ear && b.hp > 0 && b.complete && !b.neutral);
    const brown = hasBase && this.powerOf(this.ear).low;
    if (brown !== this.brownBed) {
      this.brownBed = brown;
      this.cue({ t: "bed", id: "brownout", on: brown });
      if (brown) {
        this.lowNag = this.time;
        this.say("Low power", "lowpower", 8);
        this.cue({ t: "voice", id: "lowPower" });
      }
    } else if (brown && this.time >= this.lowNag + 14) {
      this.lowNag = this.time;
      this.say("Low power", "lowpower", 8);
      this.cue({ t: "voice", id: "lowPower" });
    }
  }

  private pushFx(f: Fx) {
    this.fx.push(f);
    if (this.fx.length > 80) this.fx.splice(0, this.fx.length - 80);
  }

  private muzzle(x: number, y: number, x2: number, y2: number) {
    this.pushFx({
      kind: "muzzle",
      x,
      y,
      x2,
      y2,
      ttl: 0.1,
      max: 0.1,
      color: "#fff6d2",
      r: 12,
    });
  }

  private flashAt(x: number, y: number) {
    this.pushFx({
      kind: "flash",
      x,
      y,
      x2: x,
      y2: y,
      ttl: 0.14,
      max: 0.14,
      color: "#ffffff",
      r: 18,
    });
  }

  /** Small rising number. Skipped when it would crowd a phone, and still under the 80 effect cap. */
  private floatDmg(x: number, y: number, dmg: number) {
    if (dmg < 8) return;
    let n = 0;
    for (const f of this.fx) if (f.kind === "num") n++;
    if (n >= 8) return;
    this.pushFx({
      kind: "num",
      x,
      y,
      x2: 0,
      y2: 0,
      ttl: 0.7,
      max: 0.7,
      color: "#fff6e4",
      r: 13,
      n: Math.max(1, Math.round(dmg)),
    });
  }

  private beam(x: number, y: number, x2: number, y2: number, team: Team) {
    this.pushFx({
      kind: "beam",
      x,
      y,
      x2,
      y2,
      ttl: 0.09,
      max: 0.09,
      color: team === 0 ? "#f2e2b0" : "#ffb089",
      r: 1,
    });
  }

  private boom(x: number, y: number, r: number) {
    this.pushFx({
      kind: "boom",
      x,
      y,
      x2: x,
      y2: y,
      ttl: 0.7,
      max: 0.7,
      color: "#e7c27a",
      r,
    });
  }

  /** Fixed angles so debris does not touch the match seed. */
  private debris(x: number, y: number, n: number) {
    const count = Math.max(3, Math.min(7, n));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      this.pushFx({
        kind: "debris",
        x,
        y,
        x2: Math.cos(a) * 1.45,
        y2: Math.sin(a) * 0.9,
        ttl: 0.7,
        max: 0.7,
        color: i % 2 ? "#6a5344" : "#c6a56a",
        r: 0.1,
      });
    }
  }

  private decayFx(dt: number) {
    if (!this.fx.length) return;
    for (const f of this.fx) f.ttl -= dt;
    if (this.fx.some((f) => f.ttl <= 0)) this.fx = this.fx.filter((f) => f.ttl > 0);
  }

  private decayContact(dt: number) {
    if (this.spots.length) {
      for (const s of this.spots) s.ttl -= dt;
      if (this.spots.some((s) => s.ttl <= 0)) this.spots = this.spots.filter((s) => s.ttl > 0);
    }
    if (this.ghosts.length) {
      for (const g of this.ghosts) g.ttl -= dt;
      if (this.ghosts.some((g) => g.ttl <= 0)) this.ghosts = this.ghosts.filter((g) => g.ttl > 0);
    }
  }

  private creditKill(id: number) {
    if (!id) return;
    const u = this.unitById(id);
    if (u && u.hp > 0) u.kills++;
  }

  /** Shooting lights the shooter for every enemy, and leaves a last-known mark. */
  private markFire(u: Unit) {
    this.markPoint(u.team, u.x, u.y);
    for (let t = 0; t <= this.opponents; t++) {
      if (this.allied(t, u.team)) continue;
      this.remember(t as Team, u, 6);
    }
  }

  private markPoint(from: Team, x: number, y: number) {
    for (let t = 0; t <= this.opponents; t++) {
      if (this.allied(t, from)) continue;
      this.spots.push({ team: t as Team, x, y, ttl: 2.2 });
    }
    if (this.spots.length > 48) this.spots.splice(0, this.spots.length - 48);
  }

  private trackKnown() {
    for (const u of this.units) {
      if (u.hp <= 0 || u.aboard) continue;
      for (let t = 0; t <= this.opponents; t++) {
        if (this.allied(t, u.team)) continue;
        if (this.visibleUnit(t as Team, u)) this.remember(t as Team, u, 6);
      }
    }
  }

  private trackHalls() {
    for (let t = 0; t <= this.opponents; t++) {
      const viewer = t as Team;
      for (const b of this.buildings) {
        if (b.hp <= 0 || b.rubble > 0 || b.neutral || b.kind === "span" || isFence(b.kind)) continue;
        if (this.allied(viewer, b.team)) continue;
        if (!this.buildingVisible(viewer, b)) continue;
        this.noteHall(viewer, b);
      }
    }
    if (!this.seenHalls.length) return;
    this.seenHalls = this.seenHalls.filter((g) => {
      let visible = false;
      let explored = false;
      for (let y = g.ty; y < g.ty + g.h; y++) {
        for (let x = g.tx; x < g.tx + g.w; x++) {
          if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) continue;
          const f = this.fog[g.viewer]?.[y * this.gw + x] ?? 0;
          if (f === 2) visible = true;
          if (f >= 1) explored = true;
        }
      }
      if (!explored) return false;
      const live = this.buildingById(g.id);
      if (visible && (!live || live.hp <= 0 || live.rubble > 0 || live.neutral)) return false;
      return true;
    });
  }

  private noteHall(viewer: Team, b: Building) {
    for (const g of this.seenHalls) {
      if (g.viewer !== viewer || g.id !== b.id) continue;
      g.tx = b.tx;
      g.ty = b.ty;
      g.w = b.w;
      g.h = b.h;
      g.hp = b.hp;
      g.complete = b.complete;
      g.kind = b.kind;
      g.team = b.team;
      return;
    }
    this.seenHalls.push({
      viewer,
      id: b.id,
      team: b.team,
      kind: b.kind,
      tx: b.tx,
      ty: b.ty,
      w: b.w,
      h: b.h,
      hp: b.hp,
      complete: b.complete,
    });
  }

  /** Trees, props, and shell holes inside a start pad are not a build. */
  private clearStartClutter(slots: { x: number; y: number }[]) {
    const r2 = 10.2 * 10.2;
    const near = (x: number, y: number) => {
      for (const s of slots) {
        const dx = x - s.x;
        const dy = y - s.y;
        if (dx * dx + dy * dy <= r2) return true;
      }
      return false;
    };
    for (const s of slots) {
      const rad = 11;
      for (let y = Math.floor(s.y) - rad; y <= Math.floor(s.y) + rad; y++) {
        for (let x = Math.floor(s.x) - rad; x <= Math.floor(s.x) + rad; x++) {
          if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) continue;
          const dx = x + 0.5 - s.x;
          const dy = y + 0.5 - s.y;
          if (dx * dx + dy * dy > r2) continue;
          this.craters[y * this.gw + x] = 0;
        }
      }
    }
    if (this.fieldProps.length) this.fieldProps = this.fieldProps.filter((p) => !near(p.x, p.y));
  }

  private remember(viewer: Team, u: Unit, ttl: number) {
    for (const g of this.ghosts) {
      if (g.viewer === viewer && g.id === u.id) {
        g.x = u.x;
        g.y = u.y;
        g.ttl = ttl;
        g.kind = u.kind;
        return;
      }
    }
    this.ghosts.push({ viewer, id: u.id, team: u.team, x: u.x, y: u.y, kind: u.kind, ttl });
    if (this.ghosts.length > 80) this.ghosts.splice(0, this.ghosts.length - 80);
  }

  /** Nudge a friendly unit off the service door so the next trainee is not swallowed. */
  private shoveOffDoor(b: Building) {
    const door = this.doorOf(b);
    const ox = door.x - (b.tx + b.w / 2);
    const oy = door.y - (b.ty + b.h / 2);
    const len = Math.hypot(ox, oy) || 1;
    for (const u of this.units) {
      if (u.hp <= 0 || u.aboard || u.loco === "air" || u.loco === "sea") continue;
      if (!this.allied(u.team, b.team)) continue;
      if (Math.hypot(u.x - door.x, u.y - door.y) > 0.95) continue;
      const nx = door.x + (ox / len) * 1.7;
      const ny = door.y + (oy / len) * 1.7;
      if (!this.footOpen(nx, ny)) continue;
      if (this.unitBlocksTile(Math.floor(nx), Math.floor(ny), u.id)) continue;
      u.x = nx;
      u.y = ny;
      u.px = nx;
      u.py = ny;
      u.path = [];
    }
  }

  /** Open tile a trainee can appear on. Null if the exit is buried. */
  private exitCell(b: Building, loco: Loco): { x: number; y: number } | null {
    if (loco === "air") {
      const d = this.doorOf(b);
      return { x: d.x, y: d.y };
    }
    const water = loco === "sea";
    const ok = (x: number, y: number) => {
      if (water) {
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        if (tx < 0 || ty < 0 || tx >= this.gw || ty >= this.gh) return false;
        const t = this.terrain[ty * this.gw + tx];
        return t === TILE_DEEP || t === TILE_SHALLOW;
      }
      return this.footOpen(x, y) && !this.unitBlocksTile(Math.floor(x), Math.floor(y), 0);
    };
    const door = this.doorOf(b);
    if (ok(door.x, door.y)) return door;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = b.ty - 6; y <= b.ty + b.h + 5; y++) {
      for (let x = b.tx - 6; x <= b.tx + b.w + 5; x++) {
        const inside = x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h;
        if (inside) continue;
        const px = x + 0.5;
        const py = y + 0.5;
        if (!ok(px, py)) continue;
        const d = (px - door.x) ** 2 + (py - door.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    return best;
  }

  /** Rally snapped onto open ground, with a loose slot so trainees do not stack. */
  private rallyStand(u: Unit, x: number, y: number): { x: number; y: number } {
    let n = 0;
    for (const o of this.units) {
      if (o.id === u.id || o.hp <= 0 || o.team !== u.team || o.aboard) continue;
      const gx = o.order.t === "move" ? o.order.x : o.x;
      const gy = o.order.t === "move" ? o.order.y : o.y;
      if (Math.hypot(gx - x, gy - y) < 3.6 || Math.hypot(o.x - x, o.y - y) < 3.6) n++;
    }
    const ang = n * 2.399963;
    const rad = n === 0 ? 0 : 0.82 + 0.26 * Math.sqrt(n);
    const sx = x + Math.cos(ang) * rad;
    const sy = y + Math.sin(ang) * rad;
    const goal = this.domainGoal(u, sx, sy);
    if (u.loco === "air" || u.loco === "sea") return goal;
    if (this.footOpen(goal.x, goal.y)) return goal;
    const gx = goal.x | 0;
    const gy = goal.y | 0;
    for (let r = 1; r <= 4; r++) {
      for (let ty = gy - r; ty <= gy + r; ty++) {
        for (let tx = gx - r; tx <= gx + r; tx++) {
          const px = tx + 0.5;
          const py = ty + 0.5;
          if (this.footOpen(px, py)) return { x: px, y: py };
        }
      }
    }
    return this.domainGoal(u, x, y);
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function rectGap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): number {
  const sx = Math.max(bx - (ax + aw), ax - (bx + bw));
  const sy = Math.max(by - (ay + ah), ay - (by + bh));
  if (sx < 0 && sy < 0) return -1;
  return Math.max(sx, sy, 0);
}

function distPointToRect(x: number, y: number, b: Building): number {
  const cx = Math.max(b.tx, Math.min(x, b.tx + b.w));
  const cy = Math.max(b.ty, Math.min(y, b.ty + b.h));
  return Math.hypot(x - cx, y - cy);
}

function packFog(f: Uint8Array): string {
  const chars = new Array<string>(f.length);
  for (let i = 0; i < f.length; i++) chars[i] = String.fromCharCode(48 + (f[i] > 2 ? 2 : f[i]));
  return chars.join("");
}

function unpackFog(s: string | undefined, into: Uint8Array) {
  if (!s || s.length < into.length) return;
  for (let i = 0; i < into.length; i++) {
    const c = s.charCodeAt(i) - 48;
    into[i] = c === 1 || c === 2 ? c : 0;
  }
}
