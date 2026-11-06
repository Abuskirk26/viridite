/**
 * In-memory lockstep room. Forwards JSON only — no simulation lives here.
 * The one-file relay in relay/server.mjs speaks the same messages.
 */

import { isFactionId, type AiDifficulty, type FactionId, type MapId, type MapSizeId, type TeamMode } from "./data.ts";
import { clampYear, DEFAULT_YEAR } from "./eras.ts";
import type { Cmd } from "./orders.ts";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const IDLE_MS = 30 * 60 * 1000;
/** A dropped seat can reclaim the same token for one minute. The match keeps going. */
export const REJOIN_MS = 60_000;
export const AFK_MS = 60_000;
/** Lobby only. A backgrounded or dropped seat is held this long, then freed. */
export const LOBBY_HOLD_MS = 20_000;
export const CMD_PER_SEC = 20;
export const PING_BLOCK_MS = 250;

export interface NetRules {
  mapId: MapId;
  size: MapSizeId;
  credits: 2000 | 5000 | 10000;
  fog: boolean;
  walls: boolean;
  teams: TeamMode;
  player: FactionId;
  enemy: FactionId;
  delay: 4 | 8;
  /** How sharp empty-seat AI plays. Defaults to normal for older rooms. */
  difficulty: AiDifficulty;
  /** Match clock in minutes. 0 is unlimited. Missing means 60. */
  limit?: 20 | 40 | 60 | 0;
  /** Era year. Missing means the latest era, so the full roster stays. */
  year?: number;
  /** Editor map id. Tiles travel on the lobby as `chart`, and again on start. */
  customId?: string;
  customName?: string;
  customStarts?: number;
}

export type SeatFill = "human" | "ai" | "open";

/** Explicit seat lifecycle. Deploy means the phone has the seed and camps, and is waiting on the barrier. */
export type SeatStatus = "lobby" | "ready" | "loading" | "deploy" | "playing" | "disconnected";

export function seatStatusLabel(status: SeatStatus): string {
  if (status === "lobby") return "Lobby";
  if (status === "ready") return "Ready";
  if (status === "loading") return "Loading";
  if (status === "deploy") return "Deploy";
  if (status === "playing") return "Playing";
  return "Disconnected";
}

export interface VitalSeat {
  seat: number;
  name: string;
  rtt: number | null;
  status: SeatStatus;
  fill: SeatFill;
}

export interface SeatView {
  seat: number;
  name: string;
  fill: SeatFill;
  ready: boolean;
  rtt: number | null;
  connected: boolean;
  you: boolean;
  /** Lobby, Ready, Loading, Deploy, Playing, or Disconnected. */
  status: SeatStatus;
  away: boolean;
  afk: boolean;
}

export interface LobbyView {
  code: string;
  you: number;
  host: boolean;
  phase: "lobby" | "play";
  commanders: number;
  seats: SeatView[];
  rules: NetRules;
  note: string;
  /** VIR1 share string while a custom map is selected, so guests can draw it before ready. */
  chart?: string;
}

export interface GoPayload {
  seed: number;
  seat: number;
  opponents: 1 | 2 | 3;
  cpu: boolean[];
  rules: NetRules;
  shared: boolean;
  names: string[];
  /** VIR1 share string. Present only when the host picked a saved map. */
  chart?: string;
  /** Agreed camps. Missing on the host's layout pass; required before anyone ticks. */
  starts?: { x: number; y: number }[];
  /** Host only. Build the map and answer with `placed`. Do not simulate. */
  layout?: boolean;
}

type ClientMsg = {
  op: string;
  name?: string;
  code?: string;
  token?: string;
  ready?: boolean;
  rules?: Partial<NetRules>;
  commanders?: number;
  seat?: number;
  fill?: SeatFill;
  cmd?: Cmd;
  tick?: number;
  id?: number;
  rtt?: number;
  snap?: unknown;
  chart?: string;
  hidden?: boolean;
  for?: string;
  starts?: { x: number; y: number }[];
  hash?: number;
  resync?: boolean;
};

export type ServerMsg =
  | { op: "hello"; code: string; seat: number; token: string; host: boolean }
  | { op: "lobby"; lobby: LobbyView }
  | { op: "go"; go: GoPayload }
  | { op: "command"; cmd: Cmd }
  | { op: "end"; seat: number; tick: number }
  | { op: "pong"; id: number }
  | { op: "error"; reason: string }
  | { op: "needSnapshot"; for: string }
  | { op: "snapshot"; snap: unknown; resync?: boolean }
  | { op: "assume"; seat: number }
  | { op: "bye" }
  | { op: "release" }
  | { op: "presence"; seat: number; hidden: boolean; gone?: boolean }
  | { op: "afk"; seat: number; on: boolean }
  | { op: "vitals"; seats: VitalSeat[] }
  | { op: "desync"; tick: number };

export interface Outbound {
  to: string;
  msg: ServerMsg;
}

interface Seat {
  fill: SeatFill;
  name: string;
  clientId: string | null;
  token: string;
  ready: boolean;
  rtt: number | null;
  connected: boolean;
  leftAt: number;
  hits: number[];
  /** This phone built the sim from the shared seed and camps, and ACKed. */
  loaded: boolean;
  /** Hidden or still catching up. Others do not wait on this seat's frames. */
  away: boolean;
  awayAt: number;
  afk: boolean;
}

export function makeCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]!;
  return s;
}

export const DEFAULT_RULES: NetRules = {
  mapId: "coast",
  size: "skirmish",
  credits: 5000,
  fog: true,
  walls: true,
  teams: "ffa",
  player: "concord",
  enemy: "syndicate",
  delay: 8,
  difficulty: "normal",
  limit: 60,
  year: DEFAULT_YEAR,
};

function freshSeat(fill: SeatFill, name: string): Seat {
  return {
    fill,
    name,
    clientId: null,
    token: "",
    ready: false,
    rtt: null,
    connected: false,
    leftAt: 0,
    hits: [],
    loaded: false,
    away: false,
    awayAt: 0,
    afk: false,
  };
}

function clampRules(prev: NetRules, patch: Partial<NetRules> | undefined): NetRules {
  const next = { ...prev };
  if (!patch) return next;
  const maps: MapId[] = ["coast", "river", "isles", "dry", "michigan"];
  const sizes: MapSizeId[] = ["skirmish", "large", "warzone", "continent"];
  if (patch.mapId && maps.includes(patch.mapId)) next.mapId = patch.mapId;
  if (patch.size && sizes.includes(patch.size)) next.size = patch.size;
  if (patch.credits === 2000 || patch.credits === 5000 || patch.credits === 10000) next.credits = patch.credits;
  if (typeof patch.fog === "boolean") next.fog = patch.fog;
  if (typeof patch.walls === "boolean") next.walls = patch.walls;
  if (patch.teams === "ffa" || patch.teams === "tvt") next.teams = patch.teams;
  if (isFactionId(patch.player)) next.player = patch.player;
  if (isFactionId(patch.enemy)) next.enemy = patch.enemy;
  if (patch.delay === 4 || patch.delay === 8) next.delay = patch.delay;
  if (patch.difficulty === "easy" || patch.difficulty === "normal" || patch.difficulty === "hard") {
    next.difficulty = patch.difficulty;
  }
  if (patch.limit === 0 || patch.limit === 20 || patch.limit === 40 || patch.limit === 60) next.limit = patch.limit;
  if (typeof patch.year === "number") next.year = clampYear(patch.year);
  if (typeof patch.customId === "string") next.customId = patch.customId.slice(0, 40);
  if (typeof patch.customName === "string") next.customName = patch.customName.slice(0, 32);
  if (typeof patch.customStarts === "number") next.customStarts = Math.max(0, Math.min(4, patch.customStarts | 0));
  if (patch.mapId && !patch.customId) {
    next.customId = "";
    next.customName = "";
    next.customStarts = 0;
  }
  if (next.customStarts && next.customStarts < 4 && next.teams === "tvt") next.teams = "ffa";
  if (next.teams === "tvt") {
    // 2v2 is four seats. The caller raises commanders to match.
  }
  if (next.size === "skirmish" && next.teams === "tvt") next.size = "large";
  return next;
}

export function startBlock(rules: NetRules, seats: SeatView[]): string {
  const active = seats.length;
  if (active < 2) return "Need two commanders";
  if (rules.teams === "tvt" && active !== 4) return "Co-op needs four seats";
  if (rules.size === "skirmish" && active > 2) return "Skirmish map fits two commanders";
  if (rules.customStarts && active > rules.customStarts) return `This map has ${rules.customStarts} starts`;
  for (const s of seats) {
    if (s.fill === "open") return `Seat ${s.seat + 1} is empty`;
    if (s.fill === "human") {
      if (!s.connected) return `${s.name || "A commander"} is disconnected`;
      if (s.away) return `Waiting for ${s.name || "a commander"}`;
      if (s.seat !== 0 && !s.ready) return `Waiting for ${s.name || "a commander"}`;
      if (s.rtt == null) return `No ping from ${s.name || "a commander"}`;
      if (s.rtt > PING_BLOCK_MS) return `${s.name || "A commander"} is over 250 ms`;
    }
  }
  return "";
}

function cleanStarts(raw: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) return null;
  const out: { x: number; y: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const x = (item as { x?: unknown }).x;
    const y = (item as { y?: unknown }).y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (Math.abs(x) > 10_000 || Math.abs(y) > 10_000) return null;
    out.push({ x, y });
  }
  return out;
}

export class RelayRoom {
  readonly code: string;
  rules: NetRules = { ...DEFAULT_RULES };
  phase: "lobby" | "play" = "lobby";
  /** Host left, or the lobby hold ran out on the host seat. Guests cannot rejoin. */
  closed = false;
  last = 0;
  private seats: Seat[] = [];
  private byClient = new Map<string, number>();
  private chart = "";
  /** True once every connected human has ACKed and the barrier has opened. */
  private opened = false;
  private seed = 1;
  private starts: { x: number; y: number }[] | null = null;
  private hashes = new Map<number, Map<number, number>>();
  private repairs = 0;
  private repairTick = -1;

  constructor(code?: string, now = 0) {
    this.code = code ?? makeCode();
    this.last = now || Date.now();
    this.resize(2);
  }

  expired(now = Date.now()): boolean {
    return now - this.last > IDLE_MS;
  }

  push(clientId: string, msg: ClientMsg, now = Date.now()): Outbound[] {
    this.last = now;
    if (!msg || typeof msg.op !== "string") return [];
    if (msg.op === "create") return this.create(clientId, msg, now);
    if (msg.op === "join") return this.join(clientId, msg, now);
    const seat = this.byClient.get(clientId);
    if (seat == null) return [{ to: clientId, msg: { op: "error", reason: "Not in this room" } }];
    const mine = this.seats[seat]!;
    if (msg.op === "ready") {
      if (this.phase !== "lobby") return [];
      mine.ready = !!msg.ready;
      return this.lobbyOut();
    }
    if (msg.op === "rules") {
      if (seat !== 0 || this.phase !== "lobby") return [{ to: clientId, msg: { op: "error", reason: "Only the host sets the map" } }];
      this.rules = clampRules(this.rules, msg.rules);
      if (typeof msg.chart === "string") {
        if (!this.rules.customId || msg.chart.length === 0) this.chart = "";
        else if (msg.chart.length < 400_000) this.chart = msg.chart;
      }
      if (!this.rules.customId) this.chart = "";
      const notices: Outbound[] = [];
      const cap = this.rules.customStarts && this.rules.customStarts >= 2 ? this.rules.customStarts : 0;
      if (cap && this.seats.length > cap) {
        const reason = `This map has ${cap} starts`;
        for (let i = cap; i < this.seats.length; i++) {
          const extra = this.seats[i];
          if (extra?.clientId && extra.fill === "human") {
            notices.push({ to: extra.clientId, msg: { op: "error", reason } });
            notices.push({ to: extra.clientId, msg: { op: "bye" } });
          }
        }
        this.resize(cap);
      }
      if (this.rules.teams === "tvt" && this.seats.length !== 4) this.resize(4);
      if (this.rules.size === "skirmish" && this.seats.length > 2) this.rules.size = "large";
      this.seatBots();
      return [...notices, ...this.lobbyOut()];
    }
    if (msg.op === "commanders") {
      if (seat !== 0 || this.phase !== "lobby") return [{ to: clientId, msg: { op: "error", reason: "Only the host sets seats" } }];
      const n = msg.commanders;
      if (n !== 2 && n !== 3 && n !== 4) return [{ to: clientId, msg: { op: "error", reason: "Seats are 2 to 4" } }];
      const cap = this.rules.customStarts && this.rules.customStarts >= 2 ? this.rules.customStarts : 4;
      if (n > cap) return [{ to: clientId, msg: { op: "error", reason: `This map has ${this.rules.customStarts} starts` } }];
      if (this.rules.teams === "tvt" && n !== 4) {
        return [{ to: clientId, msg: { op: "error", reason: "Co-op needs four seats" } }];
      }
      this.resize(n);
      if (n > 2 && this.rules.size === "skirmish") this.rules.size = "large";
      this.seatBots();
      return this.lobbyOut();
    }
    if (msg.op === "fill") {
      if (seat !== 0 || this.phase !== "lobby") return [{ to: clientId, msg: { op: "error", reason: "Only the host fills seats" } }];
      const i = msg.seat;
      if (typeof i !== "number" || i <= 0 || i >= this.seats.length) {
        return [{ to: clientId, msg: { op: "error", reason: "That seat is closed" } }];
      }
      const target = this.seats[i]!;
      if (target.connected && target.fill === "human") {
        return [{ to: clientId, msg: { op: "error", reason: "Someone is sitting there" } }];
      }
      if (msg.fill === "ai") {
        target.fill = "ai";
        target.name = this.rules.difficulty === "hard" ? "AI raider" : "AI builder";
        target.clientId = null;
        target.connected = false;
        target.ready = true;
        target.rtt = 0;
      } else if (msg.fill === "open") {
        target.fill = "open";
        target.name = "Open";
        target.clientId = null;
        target.connected = false;
        target.ready = false;
        target.rtt = null;
      }
      return this.lobbyOut();
    }
    if (msg.op === "ping") {
      if (typeof msg.rtt === "number" && msg.rtt >= 0 && msg.rtt < 10_000) mine.rtt = msg.rtt;
      const out: Outbound[] = [{ to: clientId, msg: { op: "pong", id: msg.id ?? 0 } }];
      if (this.phase === "lobby") out.push(...this.lobbyOut());
      else out.push(...this.vitalsOut());
      return out;
    }
    if (msg.op === "start" || msg.op === "rematch") {
      if (seat !== 0 && msg.op === "start") return [{ to: clientId, msg: { op: "error", reason: "Only the host starts" } }];
      if (msg.op === "rematch" && this.phase !== "play") return [];
      if (msg.op === "start") {
        if (this.phase === "play") return [];
        const block = startBlock(this.rules, this.view(clientId).seats);
        if (block) return [{ to: clientId, msg: { op: "error", reason: block } }];
        if (typeof msg.chart === "string" && msg.chart.length > 0 && msg.chart.length < 400_000) this.chart = msg.chart;
        else if (!this.rules.customId) this.chart = "";
      }
      return this.begin(now);
    }
    if (msg.op === "placed") {
      if (seat !== 0 || this.phase !== "play") return [];
      const starts = cleanStarts(msg.starts);
      if (!starts) return [{ to: clientId, msg: { op: "error", reason: "Bad start positions" } }];
      this.starts = starts;
      return [...this.fanGo(false), ...this.vitalsOut()];
    }
    if (msg.op === "match_started") {
      if (this.phase !== "play" || !this.starts) return [];
      mine.loaded = true;
      const release = this.releaseOut();
      return [...this.lobbyOut(), ...this.vitalsOut(), ...release];
    }
    if (msg.op === "presence") {
      if (this.phase !== "play") return [];
      return this.markPresence(seat, !!msg.hidden, now);
    }
    if (msg.op === "resync") {
      if (this.phase !== "play") return [];
      const donor = this.donorId(seat);
      if (!donor) return [];
      return [{ to: donor, msg: { op: "needSnapshot", for: clientId } }];
    }
    if (msg.op === "hash") {
      return this.onHash(seat, msg);
    }
    if (msg.op === "live") {
      if (this.phase !== "play") return [];
      mine.loaded = true;
      mine.away = false;
      mine.awayAt = 0;
      const wasAfk = mine.afk;
      mine.afk = false;
      const out: Outbound[] = [{ to: "*", msg: { op: "presence", seat, hidden: false } }];
      if (wasAfk) out.push({ to: "*", msg: { op: "afk", seat, on: false } });
      out.push(...this.vitalsOut());
      return out;
    }
    if (msg.op === "command") {
      if (this.phase !== "play") return [];
      if (!msg.cmd || typeof msg.cmd.tick !== "number" || typeof msg.cmd.kind !== "string") {
        return [{ to: clientId, msg: { op: "error", reason: "Bad command" } }];
      }
      if (typeof msg.cmd.seat === "number" && msg.cmd.seat !== seat) {
        return [{ to: clientId, msg: { op: "error", reason: "Wrong seat" } }];
      }
      if (!this.allow(mine, now)) return [{ to: clientId, msg: { op: "error", reason: "Too many orders" } }];
      const cmd: Cmd = { ...msg.cmd, seat };
      return [{ to: "*", msg: { op: "command", cmd } }];
    }
    if (msg.op === "end") {
      if (this.phase !== "play" || typeof msg.tick !== "number") return [];
      return [{ to: "*", msg: { op: "end", seat, tick: msg.tick } }];
    }
    if (msg.op === "snapshot") {
      if (this.phase !== "play") return [];
      const resync = msg.resync === true;
      if (typeof msg.for === "string" && msg.for && msg.for !== "*") {
        return [{ to: msg.for, msg: { op: "snapshot", snap: msg.snap } }];
      }
      if (seat !== 0) return [];
      return [{ to: "*", msg: { op: "snapshot", snap: msg.snap, resync } }];
    }
    if (msg.op === "kick") {
      if (seat !== 0 || this.phase !== "lobby") return [{ to: clientId, msg: { op: "error", reason: "Only the host kicks" } }];
      const i = msg.seat;
      if (typeof i !== "number" || i <= 0 || i >= this.seats.length) {
        return [{ to: clientId, msg: { op: "error", reason: "That seat is closed" } }];
      }
      const target = this.seats[i]!;
      if (target.fill !== "human" || !target.clientId) return this.lobbyOut();
      const kicked = target.clientId;
      this.freeSeat(i);
      return [{ to: kicked, msg: { op: "bye" } }, ...this.lobbyOut()];
    }
    if (msg.op === "away") {
      if (this.phase !== "lobby") return [];
      const hidden = !!msg.hidden;
      mine.ready = false;
      mine.away = hidden;
      mine.awayAt = hidden ? mine.awayAt || now : 0;
      return this.lobbyOut();
    }
    if (msg.op === "leave") {
      return this.drop(clientId, now, true);
    }
    return [];
  }

  drop(clientId: string, now = Date.now(), intentional = false): Outbound[] {
    const seat = this.byClient.get(clientId);
    if (seat == null) return [];
    if (this.phase === "lobby") {
      if (intentional && seat === 0) return this.closeLobby("Host left. Ask for a new code.");
      if (intentional) {
        this.freeSeat(seat);
        return [{ to: clientId, msg: { op: "bye" } }, ...this.lobbyOut()];
      }
      const mine = this.seats[seat]!;
      mine.connected = false;
      mine.leftAt = now;
      if (seat !== 0) mine.ready = false;
      this.byClient.delete(clientId);
      return this.lobbyOut();
    }
    const mine = this.seats[seat]!;
    mine.connected = false;
    mine.leftAt = now;
    mine.away = this.phase === "play";
    if (mine.away && !mine.awayAt) mine.awayAt = now;
    this.byClient.delete(clientId);
    const out = this.lobbyOut();
    out.push({ to: clientId, msg: { op: "bye" } });
    if (this.phase === "play") {
      out.push({ to: "*", msg: { op: "presence", seat, hidden: true, gone: true } });
      out.push(...this.vitalsOut());
      if (!this.opened) out.push(...this.releaseOut());
    }
    return out;
  }

  /** Lobby holds a dropped seat for 20s. A match still waits the full rejoin minute. */
  sweep(now = Date.now()): Outbound[] {
    if (this.closed) return [];
    if (this.phase === "lobby") return this.sweepLobby(now);
    const out: Outbound[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i]!;
      if (s.fill !== "human" || s.connected || !s.leftAt) continue;
      if (now - s.leftAt < REJOIN_MS) continue;
      s.fill = "ai";
      s.name = this.rules.difficulty === "hard" ? "AI raider" : "AI builder";
      s.ready = true;
      s.rtt = 0;
      s.loaded = true;
      s.away = false;
      out.push({ to: "*", msg: { op: "assume", seat: i } });
      out.push(...this.vitalsOut());
    }
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i]!;
      if (s.fill === "human" && s.connected && s.away && s.awayAt && !s.afk && now - s.awayAt >= AFK_MS) {
        s.afk = true;
        out.push({ to: "*", msg: { op: "afk", seat: i, on: true } });
      }
    }
    return out;
  }

  private sweepLobby(now: number): Outbound[] {
    const out: Outbound[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i]!;
      if (s.fill !== "human") continue;
      const since = !s.connected ? s.leftAt : s.away ? s.awayAt : 0;
      if (!since || now - since < LOBBY_HOLD_MS) continue;
      if (i === 0) return this.closeLobby("Host left. Ask for a new code.");
      const id = s.clientId;
      this.freeSeat(i);
      if (id) out.push({ to: id, msg: { op: "bye" } });
      out.push(...this.lobbyOut());
    }
    return out;
  }

  private freeSeat(i: number) {
    const s = this.seats[i];
    if (!s) return;
    if (s.clientId) this.byClient.delete(s.clientId);
    s.fill = "open";
    s.name = "Open";
    s.clientId = null;
    s.token = "";
    s.ready = false;
    s.rtt = null;
    s.connected = false;
    s.leftAt = 0;
    s.away = false;
    s.awayAt = 0;
    s.loaded = false;
    s.afk = false;
    s.hits = [];
  }

  private closeLobby(reason: string): Outbound[] {
    this.closed = true;
    const ids = new Set<string>();
    for (const s of this.seats) if (s.clientId) ids.add(s.clientId);
    const out: Outbound[] = [];
    for (const id of ids) {
      out.push({ to: id, msg: { op: "error", reason } });
      out.push({ to: id, msg: { op: "bye" } });
    }
    this.byClient.clear();
    for (const s of this.seats) {
      s.connected = false;
      s.clientId = null;
    }
    return out;
  }

  private allow(seat: Seat, now: number): boolean {
    seat.hits = seat.hits.filter((t) => now - t < 1000);
    if (seat.hits.length >= CMD_PER_SEC) return false;
    seat.hits.push(now);
    return true;
  }

  private create(clientId: string, msg: ClientMsg, now: number): Outbound[] {
    if (this.byClient.size > 0 && this.seats[0]?.clientId) {
      return [{ to: clientId, msg: { op: "error", reason: "Room already hosted" } }];
    }
    const token = makeCode() + makeCode();
    const host = this.seats[0]!;
    host.fill = "human";
    host.name = (msg.name || "Host").slice(0, 16);
    host.clientId = clientId;
    host.token = token;
    host.ready = true;
    host.connected = true;
    host.leftAt = 0;
    this.byClient.set(clientId, 0);
    this.last = now;
    return [{ to: clientId, msg: { op: "hello", code: this.code, seat: 0, token, host: true } }, ...this.lobbyOut()];
  }

  private join(clientId: string, msg: ClientMsg, now: number): Outbound[] {
    if (this.closed) return [{ to: clientId, msg: { op: "error", reason: "Room expired" } }];
    if (msg.token) {
      const idx = this.seats.findIndex((s) => s.token && s.token === msg.token);
      if (idx >= 0) {
        const seat = this.seats[idx]!;
        if (seat.clientId && seat.clientId !== clientId && seat.connected) {
          return [{ to: clientId, msg: { op: "error", reason: "That seat is in use" } }];
        }
        if (seat.fill === "ai") return [{ to: clientId, msg: { op: "error", reason: "Seat taken by AI" } }];
        seat.clientId = clientId;
        seat.connected = true;
        seat.fill = "human";
        seat.leftAt = 0;
        if (this.phase === "lobby") {
          seat.away = false;
          seat.awayAt = 0;
        }
        this.byClient.set(clientId, idx);
        const hello: Outbound = {
          to: clientId,
          msg: { op: "hello", code: this.code, seat: idx, token: seat.token, host: idx === 0 },
        };
        if (this.phase === "play") {
          seat.away = true;
          seat.awayAt = seat.awayAt || now;
          const out: Outbound[] = [hello, ...this.lobbyOut(), ...this.vitalsOut()];
          if (!this.opened) {
            if (this.starts) out.push({ to: clientId, msg: { op: "go", go: this.goFor(idx, false) } });
            else if (idx === 0) out.push({ to: clientId, msg: { op: "go", go: this.goFor(0, true) } });
          } else {
            seat.loaded = false;
            const donor = this.donorId(idx);
            if (donor) out.push({ to: donor, msg: { op: "needSnapshot", for: clientId } });
          }
          out.push({ to: "*", msg: { op: "presence", seat: idx, hidden: true } });
          return out;
        }
        return [hello, ...this.lobbyOut()];
      }
    }
    if (this.phase !== "lobby") return [{ to: clientId, msg: { op: "error", reason: "Match already started" } }];
    const open = this.seats.findIndex((s) => s.fill === "open" && !s.connected);
    if (open < 0) return [{ to: clientId, msg: { op: "error", reason: "Room full" } }];
    const token = makeCode() + makeCode();
    const seat = this.seats[open]!;
    seat.fill = "human";
    seat.name = (msg.name || "Guest").slice(0, 16);
    seat.clientId = clientId;
    seat.token = token;
    seat.ready = false;
    seat.connected = true;
    seat.rtt = null;
    seat.leftAt = 0;
    this.byClient.set(clientId, open);
    this.last = now;
    return [
      { to: clientId, msg: { op: "hello", code: this.code, seat: open, token, host: false } },
      ...this.lobbyOut(),
    ];
  }

  /** Co-op fills North and South with bots so the next friend takes East, your ally. Versus gives those seats back. */
  private seatBots() {
    if (this.phase !== "lobby") return;
    if (this.rules.teams !== "tvt") {
      for (const s of this.seats) {
        if (s.fill === "ai" && s.name === "Bot") {
          s.fill = "open";
          s.name = "Open";
          s.clientId = null;
          s.connected = false;
          s.ready = false;
          s.rtt = null;
          s.token = "";
        }
      }
      return;
    }
    for (const i of [1, 3]) {
      const s = this.seats[i];
      if (!s || s.fill === "human") continue;
      s.fill = "ai";
      s.name = "Bot";
      s.clientId = null;
      s.connected = false;
      s.ready = true;
      s.rtt = 0;
      s.token = "";
      s.leftAt = 0;
    }
  }

  private resize(n: number) {
    const count = Math.max(2, Math.min(4, n));
    while (this.seats.length < count) {
      this.seats.push(freshSeat(this.seats.length === 0 ? "human" : "open", this.seats.length === 0 ? "Host" : "Open"));
    }
    if (this.seats.length > count) {
      for (let i = count; i < this.seats.length; i++) {
        const id = this.seats[i]?.clientId;
        if (id) this.byClient.delete(id);
      }
      this.seats.length = count;
    }
  }

  private begin(now: number): Outbound[] {
    this.seed = (Math.floor(Math.random() * 0x7ffffffe) + 1) >>> 0;
    this.starts = null;
    this.phase = "play";
    this.opened = false;
    this.repairs = 0;
    this.repairTick = -1;
    this.hashes.clear();
    this.last = now;
    for (const s of this.seats) {
      s.loaded = false;
      s.away = false;
      s.awayAt = 0;
      s.afk = false;
    }
    const host = this.seats[0];
    if (!host?.clientId || host.fill !== "human") return [];
    return [{ to: host.clientId, msg: { op: "go", go: this.goFor(0, true) } }, ...this.vitalsOut()];
  }

  private goFor(seatIndex: number, layout: boolean): GoPayload {
    const opponents = (this.seats.length - 1) as 1 | 2 | 3;
    const cpu = [false, false, false, false];
    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = this.seats[i];
      cpu[i] = !!s && s.fill === "ai";
      names[i] = s?.name ?? "";
    }
    return {
      seed: this.seed,
      seat: seatIndex,
      opponents,
      cpu,
      rules: this.rules,
      shared: this.rules.teams === "tvt",
      names,
      chart: this.chart || undefined,
      starts: layout ? undefined : (this.starts ?? undefined),
      layout: layout || undefined,
    };
  }

  /** Authoritative go: same seed and camps for every human. */
  private fanGo(layout: boolean): Outbound[] {
    const out: Outbound[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i]!;
      if (!s.clientId || s.fill !== "human" || !s.connected) continue;
      out.push({ to: s.clientId, msg: { op: "go", go: this.goFor(i, layout) } });
    }
    return out;
  }

  view(forId: string): LobbyView {
    const you = this.byClient.get(forId) ?? -1;
    return {
      code: this.code,
      you,
      host: you === 0,
      phase: this.phase,
      commanders: this.seats.length,
      rules: this.rules,
      note: this.phase === "lobby" ? startBlock(this.rules, this.publicSeats(forId)) : "",
      seats: this.publicSeats(forId),
      chart: this.chart || undefined,
    };
  }

  private publicSeats(forId: string): SeatView[] {
    return this.seats.map((s, seat) => ({
      seat,
      name: s.name,
      fill: s.fill,
      ready: s.ready,
      rtt: s.rtt,
      connected: s.connected,
      you: s.clientId === forId,
      status: this.seatStatus(s),
      away: s.away,
      afk: s.afk,
    }));
  }

  private seatStatus(s: Seat): SeatStatus {
    if (s.fill === "open") return "lobby";
    if (s.fill === "ai") {
      if (this.phase !== "play") return "ready";
      return this.opened ? "playing" : "deploy";
    }
    if (!s.connected) return "disconnected";
    if (this.phase === "lobby") return s.ready ? "ready" : "lobby";
    if (!s.loaded) return "loading";
    if (!this.opened) return "deploy";
    return "playing";
  }

  /** Battle ticks only after every connected human has the same seed and camps. */
  private releaseOut(): Outbound[] {
    if (this.opened || !this.starts) return [];
    let any = false;
    for (const s of this.seats) {
      if (s.fill !== "human" || !s.connected) continue;
      any = true;
      if (!s.loaded) return [];
    }
    if (!any) return [];
    this.opened = true;
    return [{ to: "*", msg: { op: "release" } }, ...this.vitalsOut()];
  }

  private vitalsOut(): Outbound[] {
    const seats: VitalSeat[] = this.seats.map((s, seat) => ({
      seat,
      name: s.name,
      rtt: s.rtt,
      status: this.seatStatus(s),
      fill: s.fill,
    }));
    return [{ to: "*", msg: { op: "vitals", seats } }];
  }

  private onHash(seat: number, msg: ClientMsg): Outbound[] {
    if (this.phase !== "play" || !this.opened) return [];
    if (typeof msg.tick !== "number" || typeof msg.hash !== "number" || !Number.isFinite(msg.hash)) return [];
    const tick = msg.tick | 0;
    let row = this.hashes.get(tick);
    if (!row) {
      row = new Map();
      this.hashes.set(tick, row);
      if (this.hashes.size > 40) {
        const oldest = Math.min(...this.hashes.keys());
        this.hashes.delete(oldest);
      }
    }
    row.set(seat, msg.hash >>> 0);
    const involved: number[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i]!;
      if (s.fill === "human" && s.connected && s.loaded && !s.away) involved.push(i);
    }
    if (involved.length < 2) return [];
    if (!involved.every((i) => row!.has(i))) return [];
    const first = row.get(involved[0]!)!;
    const same = involved.every((i) => row!.get(i) === first);
    if (same) {
      if (tick > this.repairTick) this.repairs = 0;
      return [];
    }
    const host = this.seats[0];
    if (this.repairs >= 1 || !host?.clientId || !host.connected) {
      return [{ to: "*", msg: { op: "desync", tick } }];
    }
    this.repairs = 1;
    this.repairTick = tick;
    return [{ to: host.clientId, msg: { op: "needSnapshot", for: "*" } }];
  }

  /** A hidden seat stays "away" until it finishes resync and sends live. */
  private markPresence(seat: number, hidden: boolean, now: number): Outbound[] {
    const mine = this.seats[seat];
    if (!mine) return [];
    if (hidden) {
      mine.away = true;
      if (!mine.awayAt) mine.awayAt = now;
      return [{ to: "*", msg: { op: "presence", seat, hidden: true } }];
    }
    mine.awayAt = 0;
    const out: Outbound[] = [];
    if (mine.afk) {
      mine.afk = false;
      out.push({ to: "*", msg: { op: "afk", seat, on: false } });
    }
    return out;
  }

  private donorId(except: number): string | null {
    let fallback: string | null = null;
    for (let i = 0; i < this.seats.length; i++) {
      if (i === except) continue;
      const s = this.seats[i];
      if (!s || s.fill !== "human" || !s.connected || !s.clientId) continue;
      if (!fallback) fallback = s.clientId;
      if (!s.away) return s.clientId;
    }
    return fallback;
  }

  private lobbyOut(): Outbound[] {
    const ids = new Set<string>();
    for (const s of this.seats) if (s.clientId && s.connected) ids.add(s.clientId);
    const out: Outbound[] = [];
    for (const id of ids) out.push({ to: id, msg: { op: "lobby", lobby: this.view(id) } });
    return out;
  }

  /** Shared across server instances. `byClient` is rebuilt from connected seats. */
  dump(): RelayDump {
    return {
      v: 1,
      code: this.code,
      rules: this.rules,
      phase: this.phase,
      closed: this.closed,
      last: this.last,
      seats: this.seats.map((s) => ({ ...s, hits: s.hits.slice() })),
      chart: this.chart,
      opened: this.opened,
      seed: this.seed,
      starts: this.starts ? this.starts.map((p) => ({ x: p.x, y: p.y })) : null,
      hashes: [...this.hashes.entries()].map(([tick, row]) => [tick, [...row.entries()]]),
      repairs: this.repairs,
      repairTick: this.repairTick,
    };
  }

  static restore(raw: unknown): RelayRoom | null {
    let data = raw;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data) as unknown;
      } catch {
        return null;
      }
    }
    if (!data || typeof data !== "object") return null;
    const row = data as Partial<RelayDump>;
    if (row.v !== 1 || typeof row.code !== "string" || !row.code) return null;
    const room = new RelayRoom(row.code, typeof row.last === "number" ? row.last : 0);
    room.rules = clampRules(DEFAULT_RULES, row.rules);
    room.phase = row.phase === "play" ? "play" : "lobby";
    room.closed = !!row.closed;
    room.last = typeof row.last === "number" ? row.last : 0;
    room.chart = typeof row.chart === "string" ? row.chart : "";
    room.opened = !!row.opened;
    room.seed = typeof row.seed === "number" ? row.seed >>> 0 : 1;
    room.starts = cleanStarts(row.starts);
    room.repairs = typeof row.repairs === "number" ? row.repairs : 0;
    room.repairTick = typeof row.repairTick === "number" ? row.repairTick : -1;
    room.seats = Array.isArray(row.seats) ? row.seats.map(normalizeSeat) : [];
    if (!room.seats.length) room.resize(2);
    room.byClient = new Map();
    room.hashes = new Map();
    for (let i = 0; i < room.seats.length; i++) {
      const seat = room.seats[i]!;
      if (seat.clientId && seat.connected) room.byClient.set(seat.clientId, i);
    }
    if (Array.isArray(row.hashes)) {
      for (const pair of row.hashes) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const tick = Number(pair[0]);
        const cells = pair[1];
        if (!Number.isFinite(tick) || !Array.isArray(cells)) continue;
        const map = new Map<number, number>();
        for (const cell of cells) {
          if (!Array.isArray(cell) || cell.length < 2) continue;
          map.set(Number(cell[0]), Number(cell[1]) >>> 0);
        }
        room.hashes.set(tick, map);
      }
    }
    return room;
  }
}

export interface RelayDump {
  v: 1;
  code: string;
  rules: NetRules;
  phase: "lobby" | "play";
  closed: boolean;
  last: number;
  seats: Seat[];
  chart: string;
  opened: boolean;
  seed: number;
  starts: { x: number; y: number }[] | null;
  hashes: [number, [number, number][]][];
  repairs: number;
  repairTick: number;
}

function normalizeSeat(raw: Seat): Seat {
  const fill = raw?.fill === "ai" || raw?.fill === "human" || raw?.fill === "open" ? raw.fill : "open";
  return {
    fill,
    name: typeof raw?.name === "string" ? raw.name.slice(0, 16) : "Open",
    clientId: typeof raw?.clientId === "string" ? raw.clientId : null,
    token: typeof raw?.token === "string" ? raw.token : "",
    ready: !!raw?.ready,
    rtt: typeof raw?.rtt === "number" ? raw.rtt : null,
    connected: !!raw?.connected,
    leftAt: typeof raw?.leftAt === "number" ? raw.leftAt : 0,
    hits: Array.isArray(raw?.hits) ? raw.hits.filter((n) => typeof n === "number") : [],
    loaded: !!raw?.loaded,
    away: !!raw?.away,
    awayAt: typeof raw?.awayAt === "number" ? raw.awayAt : 0,
    afk: !!raw?.afk,
  };
}
