/**
 * Friends play. A texted link carries the room code. No accounts.
 *
 *
 * Touch controls stay the same. A tap does not move a unit immediately:
 * it becomes a command scheduled `delay` sim ticks ahead (4 on a good link,
 * 8 on a bad one, at 10 Hz). Every phone runs the same simulation and applies
 * the same commands on the same tick. The relay only forwards JSON.
 *
 * Same-phone rooms use a BroadcastChannel mock of the relay so two tabs can
 * share a code with no server. A WebSocket URL uses relay/server.mjs.
 */

import { applyOrder, type Cmd, type CmdKind } from "./orders.ts";
import {
  RelayRoom,
  type GoPayload,
  type LobbyView,
  type NetRules,
  type ServerMsg,
  type VitalSeat,
} from "./relay-room.ts";
import { Rng } from "./rng.ts";
import { Sim } from "./sim.ts";
import { pack, readShare } from "./custom.ts";
import { lobbySize } from "./editor.ts";
import { TILE_DEEP } from "./data.ts";

export interface NetSocket {
  send(data: string): void;
  close(): void;
  onMessage(fn: (data: string) => void): void;
  onClose(fn: () => void): void;
  onError?(fn: () => void): void;
}

export interface FrameSlot {
  cmds: Cmd[];
  end: boolean;
}

const BUS = "viridite-lockstep-v1";

function uid(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return `p${Math.floor(Math.random() * 1e9)}`;
}

/** Host tab runs the room. Other tabs on this phone send through BroadcastChannel. */
export function openMockSocket(role: "host" | "guest"): NetSocket {
  const id = uid();
  const bus = new BroadcastChannel(BUS);
  let onMessage: (data: string) => void = () => {};
  let onClose: () => void = () => {};
  let room: RelayRoom | null = null;
  let code = "";
  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  const deliver = (outs: { to: string; msg: ServerMsg }[]) => {
    for (const o of outs) {
      if (o.to === "*" || o.to === id) onMessage(JSON.stringify(o.msg));
      if (o.to === "*" || (o.to !== id && room)) {
        bus.postMessage({ code: room?.code ?? code, to: o.to, msg: o.msg });
      }
    }
  };

  if (role === "host") {
    room = new RelayRoom();
    code = room.code;
    sweepTimer = setInterval(() => {
      if (!room) return;
      deliver(room.sweep());
    }, 1000);
    bus.onmessage = (ev: MessageEvent) => {
      const env = ev.data as { from?: string; code?: string; msg?: unknown } | null;
      if (!env || env.from === id || !room) return;
      if (env.code && env.code !== room.code) return;
      deliver(room.push(env.from || "guest", env.msg as { op: string }));
    };
  } else {
    bus.onmessage = (ev: MessageEvent) => {
      const env = ev.data as { to?: string; code?: string; msg?: unknown } | null;
      if (!env || !env.msg) return;
      if (code && env.code && env.code !== code) return;
      if (env.to !== "*" && env.to !== id) return;
      onMessage(JSON.stringify(env.msg));
    };
  }

  return {
    send(data: string) {
      const msg = JSON.parse(data) as { op?: string; code?: string };
      if (role === "guest") {
        if (msg.op === "join" && msg.code) code = msg.code;
        bus.postMessage({ from: id, code: msg.code || code, msg });
        return;
      }
      if (!room) return;
      deliver(room.push(id, msg as { op: string }));
    },
    close() {
      if (sweepTimer) clearInterval(sweepTimer);
      if (room) deliver(room.drop(id));
      else bus.postMessage({ from: id, code, msg: { op: "leave" } });
      bus.close();
      onClose();
    },
    onMessage(fn) {
      onMessage = fn;
    },
    onClose(fn) {
      onClose = fn;
    },
  };
}

export function openWebSocket(url: string): NetSocket {
  const ws = new WebSocket(url);
  let onMessage: (data: string) => void = () => {};
  let onClose: () => void = () => {};
  let onError: () => void = () => {};
  const queue: string[] = [];
  ws.addEventListener("open", () => {
    for (const d of queue) ws.send(d);
    queue.length = 0;
  });
  ws.addEventListener("message", (ev) => {
    onMessage(typeof ev.data === "string" ? ev.data : "");
  });
  ws.addEventListener("error", () => onError());
  ws.addEventListener("close", () => onClose());
  return {
    send(data: string) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else queue.push(data);
    },
    close() {
      ws.close();
    },
    onMessage(fn) {
      onMessage = fn;
    },
    onClose(fn) {
      onClose = fn;
    },
    onError(fn) {
      onError = fn;
    },
  };
}

/** Same-origin relay. Two phones share a room through the server on this page. */
export function publicRelayUrl(): string {
  if (typeof location === "undefined") return "";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/viridite-relay`;
}

/** Peer id for a room when the host phone is the match service. */
export function linkPeerId(code: string): string {
  return `v${code.trim().toUpperCase()}`;
}

const HOST_CLIENT = "host";

/**
 * The published site has no relay process. The host phone runs the room and
 * friends attach with a direct link. Messages are the same JSON the relay uses.
 */
export function openLinkSocket(role: "host" | "guest", roomCode: string, selfId = ""): NetSocket {
  const code = roomCode.trim().toUpperCase();
  const peerId = role === "host" ? linkPeerId(code) : selfId || `g${code}${Math.floor(Math.random() * 1e6).toString(36)}`;
  let onMessage: (data: string) => void = () => {};
  let onClose: () => void = () => {};
  let onError: () => void = () => {};
  let closed = false;
  const queue: string[] = [];
  let room: RelayRoom | null = null;
  const guests = new Map<string, { send: (s: string) => void; open: boolean; buf: string[] }>();
  let sweep: ReturnType<typeof setInterval> | null = null;
  let destroyPeer: (() => void) | null = null;
  let guestSend: ((s: string) => void) | null = null;

  const emit = (msg: unknown) => {
    if (!closed) onMessage(JSON.stringify(msg));
  };

  const deliver = (outs: { to: string; msg: ServerMsg }[]) => {
    for (const o of outs) {
      const text = JSON.stringify(o.msg);
      if (o.to === "*" || o.to === HOST_CLIENT) emit(o.msg);
      const targets = o.to === "*" ? [...guests.keys()] : o.to === HOST_CLIENT ? [] : [o.to];
      for (const id of targets) {
        const g = guests.get(id);
        if (!g) continue;
        if (g.open) g.send(text);
        else g.buf.push(text);
      }
    }
  };

  const asMsg = (data: unknown): { op: string } | null => {
    try {
      if (typeof data === "string") return JSON.parse(data) as { op: string };
      if (data && typeof data === "object") return data as { op: string };
    } catch {
      return null;
    }
    return null;
  };

  void import("peerjs")
    .then(({ Peer }) => {
      if (closed) return;
      const secure = typeof location !== "undefined" && location.protocol === "https:";
      const peer = new Peer(peerId, { secure, debug: 0 });
      destroyPeer = () => {
        if (!peer.destroyed) peer.destroy();
      };
      peer.on("disconnected", () => {
        if (!closed && !peer.destroyed) peer.reconnect();
      });

      if (role === "host") {
        room = new RelayRoom(code);
        sweep = setInterval(() => {
          if (room && !closed) deliver(room.sweep());
        }, 1000);
        for (const raw of queue) {
          const msg = asMsg(raw);
          if (msg && room) deliver(room.push(HOST_CLIENT, msg));
        }
        queue.length = 0;
        peer.on("connection", (conn) => {
          const id = conn.peer;
          const slot = {
            send: (s: string) => conn.send(s),
            open: conn.open,
            buf: [] as string[],
          };
          guests.set(id, slot);
          const flush = () => {
            slot.open = true;
            for (const s of slot.buf) conn.send(s);
            slot.buf.length = 0;
          };
          if (conn.open) flush();
          else conn.on("open", flush);
          conn.on("data", (data) => {
            if (!room || closed) return;
            const msg = asMsg(data);
            if (!msg) return;
            deliver(room.push(id, msg));
          });
          conn.on("close", () => {
            guests.delete(id);
            if (room && !closed) deliver(room.drop(id));
          });
        });
        peer.on("error", (err) => {
          if (closed) return;
          if (err.type === "unavailable-id") emit({ op: "error", reason: "That room code is busy. Try again." });
          else if (err.type === "browser-incompatible") emit({ op: "error", reason: "This browser can't open a direct match." });
          else if (!peer.destroyed) peer.reconnect();
        });
        return;
      }

      let tries = 0;
      let retrying = false;
      let gaveUp = false;
      const dial = () => {
        if (closed || !peer.open) return;
        retrying = false;
        const conn = peer.connect(linkPeerId(code), { reliable: true, serialization: "json" });
        guestSend = (s: string) => conn.send(s);
        conn.on("open", () => {
          retrying = false;
          guestSend = (s: string) => conn.send(s);
          for (const s of queue) conn.send(s);
          queue.length = 0;
        });
        conn.on("data", (data) => {
          if (closed) return;
          onMessage(typeof data === "string" ? data : JSON.stringify(data));
        });
        conn.on("close", () => {
          guestSend = null;
          if (!closed && !retrying && !gaveUp) onClose();
        });
      };
      peer.on("open", () => dial());
      peer.on("error", (err) => {
        if (closed) return;
        if (err.type === "peer-unavailable" && tries < 8) {
          tries += 1;
          retrying = true;
          window.setTimeout(dial, 700);
          return;
        }
        if (err.type === "peer-unavailable") {
          gaveUp = true;
          emit({ op: "error", reason: "No room with that code." });
          return;
        }
        if (err.type === "unavailable-id") {
          gaveUp = true;
          emit({ op: "error", reason: "Could not open a link. Try again." });
          return;
        }
        onError();
      });
    })
    .catch(() => {
      if (!closed) onError();
    });

  return {
    send(data: string) {
      if (role === "host") {
        if (!room) {
          queue.push(data);
          return;
        }
        const msg = asMsg(data);
        if (msg) deliver(room.push(HOST_CLIENT, msg));
        return;
      }
      if (guestSend) guestSend(data);
      else queue.push(data);
    },
    close() {
      if (closed) return;
      if (role === "host" && room) {
        const outs = room.drop(HOST_CLIENT, Date.now(), true);
        for (const o of outs) {
          const text = JSON.stringify(o.msg);
          const ids = o.to === "*" ? [...guests.keys()] : o.to === HOST_CLIENT ? [] : [o.to];
          for (const id of ids) guests.get(id)?.send(text);
        }
      }
      closed = true;
      if (sweep) clearInterval(sweep);
      destroyPeer?.();
      onClose();
    },
    onMessage(fn) {
      onMessage = fn;
    },
    onClose(fn) {
      onClose = fn;
    },
    onError(fn) {
      onError = fn;
    },
  };
}

const ROOM_CODE = /^[A-Z0-9]{5}$/;

/** `?room=ABCDE` from a texted link. Anything else is not a room. */
export function parseRoomCode(search: string): string {
  const code = (new URLSearchParams(search).get("room") ?? "").trim().toUpperCase();
  return ROOM_CODE.test(code) ? code : "";
}

export type InviteRelay = "public" | "phone" | "local" | "custom";

/** How the link should connect. `local` is same-phone only. A ws(s) URL is a custom relay. */
export function parseRelayHint(search: string): { mode: InviteRelay; url: string } {
  const relay = (new URLSearchParams(search).get("relay") ?? "").trim();
  if (relay === "phone") return { mode: "phone", url: "" };
  if (relay === "local") return { mode: "local", url: "" };
  if (/^wss?:\/\//i.test(relay)) return { mode: "custom", url: relay };
  return { mode: "public", url: "" };
}

/** Page URL a friend can open. The code is still the room id. */
export function roomInviteUrl(
  code: string,
  opts: { href: string; mode?: InviteRelay; customUrl?: string },
): string {
  const url = new URL(opts.href);
  url.hash = "";
  url.searchParams.set("room", code.trim().toUpperCase());
  const mode = opts.mode ?? "public";
  if (mode === "phone") url.searchParams.set("relay", "phone");
  else if (mode === "local") url.searchParams.set("relay", "local");
  else if (mode === "custom" && opts.customUrl?.trim()) url.searchParams.set("relay", opts.customUrl.trim());
  else url.searchParams.delete("relay");
  return url.toString();
}

/** True only when this body is the relay health line, not the app page. */
export function relayHealthy(status: number, body: string): boolean {
  if (status !== 200) return false;
  const text = body.trimStart();
  if (!text || text.startsWith("<") || text.startsWith("{")) return false;
  return text.startsWith("VIRIDITE relay");
}

/** One sentence per failure. A dead socket is not a bad code. */
export function matchError(reason: string): string {
  const raw = reason.trim();
  if (/no such room|not in this room/i.test(raw)) return "No room with that code.";
  if (/room full/i.test(raw)) return "That room is full.";
  if (/already started/i.test(raw)) return "That match already started.";
  if (/host left/i.test(raw)) return "Host left. Ask for a new code.";
  if (/room expired|room closed/i.test(raw)) return "That room closed. Ask for a new code.";
  if (/websocket|wss?:\/\/|close code|\bsocket\b|econn|match service is down|404|can't reach|cannot reach/i.test(raw)) {
    return "The match service is down.";
  }
  return raw;
}

/** Seat label. Connected only after the room accepted this phone and the link is still up. */
export function seatStatusText(
  seat: { fill: string; connected: boolean; away: boolean },
  handshook: boolean,
  linkUp: boolean,
): string {
  if (seat.fill === "open") return "Waiting";
  if (seat.fill === "ai") return "AI";
  if (!handshook) return "Connecting";
  if (!linkUp || seat.away || !seat.connected) return "Reconnecting";
  return "Connected";
}

export async function probeRelay(wsUrl = publicRelayUrl()): Promise<boolean> {
  if (!wsUrl || typeof fetch === "undefined") return false;
  const http = relayHttpUrl(wsUrl);
  try {
    const res = await fetch(http, { cache: "no-store" });
    return relayHealthy(res.status, await res.text());
  } catch {
    return false;
  }
}

/** `wss://host/viridite-relay` → `https://host/viridite-relay`. */
export function relayHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws/i, "http");
}

/** True when a WebSocket on this URL answers a health message. An open with no reply is not connected. */
export function socketTalks(url: string, ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let ws: WebSocket | null = null;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), ms);
    try {
      ws = new WebSocket(url);
    } catch {
      finish(false);
      return;
    }
    ws.addEventListener("open", () => {
      try {
        ws?.send(JSON.stringify({ op: "health" }));
      } catch {
        finish(false);
      }
    });
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as { op?: unknown };
        finish(typeof msg.op === "string");
      } catch {
        finish(false);
      }
    });
    ws.addEventListener("error", () => finish(false));
    ws.addEventListener("close", () => finish(false));
  });
}

/**
 * Public match transport. Prefer a WebSocket that actually answers.
 * If the upgrade never speaks, use ordinary requests so two phones still share a room.
 * Null means the health check was not the relay.
 */
export async function openPublicTransport(wsUrl: string): Promise<{ sock: NetSocket; reopen: () => NetSocket } | null> {
  if (!wsUrl || !(await probeRelay(wsUrl))) return null;
  if (await socketTalks(wsUrl)) {
    return { sock: openWebSocket(wsUrl), reopen: () => openWebSocket(wsUrl) };
  }
  const http = relayHttpUrl(wsUrl);
  return { sock: openPollSocket(http), reopen: () => openPollSocket(http) };
}

/** Same messages as the WebSocket relay, one request at a time. */
export function openPollSocket(httpUrl: string): NetSocket {
  const raw = uid();
  const clientId = raw.length >= 8 ? raw : `client${raw}`;
  let onMessage: (data: string) => void = () => {};
  let onClose: () => void = () => {};
  let onError: () => void = () => {};
  let closed = false;
  let busy = false;
  const pending: string[] = [];

  const deliver = (msgs: unknown[]) => {
    for (const msg of msgs) {
      if (msg && typeof msg === "object") onMessage(JSON.stringify(msg));
    }
  };

  const post = async (msg: unknown | null) => {
    const res = await fetch(httpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(msg ? { client: clientId, msg } : { client: clientId }),
      cache: "no-store",
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("json")) throw new Error("relay");
    const data = (await res.json()) as { msgs?: unknown[] };
    deliver(Array.isArray(data.msgs) ? data.msgs : []);
  };

  const tick = async () => {
    if (closed || busy) return;
    busy = true;
    const next = pending.shift();
    try {
      await post(next ? (JSON.parse(next) as unknown) : null);
    } catch {
      if (!closed) {
        closed = true;
        window.clearInterval(timer);
        try {
          await fetch(httpUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ client: clientId, msg: { op: "leave" } }),
          });
        } catch {
          /* the room will drop the seat on its own */
        }
        onError();
      }
    } finally {
      busy = false;
      if (!closed && pending.length) void tick();
    }
  };

  const timer = window.setInterval(() => {
    void tick();
  }, 250);

  return {
    send(data: string) {
      if (closed) return;
      pending.push(data);
      void tick();
    },
    close() {
      if (closed) return;
      closed = true;
      window.clearInterval(timer);
      void fetch(httpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client: clientId, msg: { op: "leave" } }),
      }).catch(() => undefined);
      onClose();
    },
    onMessage(fn) {
      onMessage = fn;
    },
    onClose(fn) {
      onClose = fn;
    },
    onError(fn) {
      onError = fn;
    },
  };
}

/** Opens the phone's text app with the invite already written. iOS wants `sms:&body=`. */
export function smsInviteHref(body: string, ios = false): string {
  const encoded = encodeURIComponent(body);
  return ios ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
}

/** One-line connect used by the lobby and by a bare script. */
export function connectRelay(url: string): WebSocket {
  return new WebSocket(url);
}

export class NetPlay {
  lobby: LobbyView | null = null;
  sim: Sim | null = null;
  seat = 0;
  simTick = 0;
  delay: 4 | 8 = 8;
  rtt: number | null = null;
  stalled = false;
  waiting = "";
  /** Soft status. Hidden phones do not freeze the match. AFK is the 60s mark. */
  awayNote = "";
  error = "";
  token = "";
  code = "";
  /** True after the relay has accepted this socket. */
  helloed = false;
  /** Mid-match drop. The seat is held for 60 seconds. */
  reconnecting = false;
  /** State hashes diverged and a resync did not stick. Offer Rematch. */
  desynced = false;
  vitals: VitalSeat[] = [];
  onLobby: (lobby: LobbyView) => void = () => {};
  onStart: (sim: Sim, seat: number) => void = () => {};
  onError: (reason: string) => void = () => {};
  /** The room closed this seat. The lobby should leave the room view. */
  onBye: () => void = () => {};
  /** Public relay never answered. The lobby may fall back to this phone. */
  onRelayDead: () => void = () => {};
  /** Ping, reconnect, or desync changed. Safe to ignore. */
  onNet: () => void = () => {};
  private seq = 1;
  private pingId = 1;
  private pingAt = 0;
  private humans: number[] = [];
  private autoEmpty = new Set<number>();
  /** Seats whose tabs are hidden or still catching up. Their empty frames are assumed. */
  private away = new Set<number>();
  private gone = new Set<number>();
  private afkSeats = new Set<number>();
  private inbox = new Map<number, Map<number, FrameSlot>>();
  private sealed = new Set<number>();
  private names: string[] = [];
  private playerName = "Commander";
  private go: GoPayload | null = null;
  private closed = false;
  private stopRetry = false;
  /** True after an error was already shown. Closing the socket must not replace it. */
  private told = false;
  /** True once every phone has ACKed and the battle is allowed to tick. */
  private released = false;
  /** Do not seal or advance. Used while hidden and while applying a snapshot. */
  private holding = false;
  /** After a resume, ask for a fresh snapshot if the live room has moved on. */
  private catching = false;
  /** True only while this phone is waiting to apply a snapshot. Don't serve one then. */
  private expectSnap = false;
  private misses = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private dropAt = 0;
  private dropQueued = false;
  private sock: NetSocket;
  private gen = 0;
  private acc = 0;
  private readonly opts: { ping?: boolean; reopen?: () => NetSocket; roomSurvives?: boolean };

  constructor(sock: NetSocket, opts?: { ping?: boolean; reopen?: () => NetSocket; roomSurvives?: boolean }) {
    this.opts = opts ?? {};
    this.sock = sock;
    this.bind(sock);
    this.pingTimer = opts?.ping === false ? null : setInterval(() => this.ping(), 1000);
  }

  private bind(sock: NetSocket) {
    const gen = ++this.gen;
    this.sock = sock;
    sock.onMessage((raw) => {
      if (gen !== this.gen) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(raw) as ServerMsg;
      } catch {
        return;
      }
      this.receive(msg);
    });
    sock.onClose(() => {
      if (gen !== this.gen) return;
      this.socketClosed();
    });
    if (sock.onError) {
      sock.onError(() => {
        if (gen !== this.gen) return;
        this.socketClosed();
      });
    }
  }

  /** Relay and tests push server messages here. */
  inject(msg: ServerMsg) {
    this.receive(msg);
  }

  raw(msg: unknown) {
    this.send(msg);
  }

  private send(msg: unknown) {
    this.sock.send(JSON.stringify(msg));
  }

  host(name: string) {
    this.playerName = (name || "Host").slice(0, 16);
    this.send({ op: "create", name: this.playerName });
  }

  join(code: string, name: string, token = "") {
    this.playerName = (name || "Guest").slice(0, 16);
    this.code = code.trim().toUpperCase();
    if (token) {
      this.token = token;
      this.expectSnap = true;
    }
    this.send({ op: "join", code: this.code, name: this.playerName, token });
  }

  setRules(patch: Partial<NetRules>, chart?: string) {
    this.send(chart === undefined ? { op: "rules", rules: patch } : { op: "rules", rules: patch, chart });
  }

  setCommanders(n: number) {
    this.send({ op: "commanders", commanders: n });
  }

  setFill(seat: number, fill: "ai" | "open") {
    this.send({ op: "fill", seat, fill });
  }

  kick(seat: number) {
    this.send({ op: "kick", seat });
  }

  /** Lobby only. Hiding the app drops ready and starts the 20s hold. */
  signalAway(hidden: boolean) {
    this.send({ op: "away", hidden });
    if (hidden) this.ready(false);
  }

  ready(on: boolean) {
    this.send({ op: "ready", ready: on });
  }

  start(chart?: string) {
    this.send({ op: "start", chart });
  }

  rematch() {
    this.send({ op: "rematch" });
  }

  leave() {
    this.closed = true;
    this.stopRetry = true;
    this.gen += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.forgetSeat();
    this.send({ op: "leave" });
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.sock.close();
  }

  /** Seat was closed by the room. Stop the socket without asking to leave again. */
  hangup() {
    this.closed = true;
    this.stopRetry = true;
    this.gen += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.sock.close();
  }

  /**
   * Queue an order for the tick `delay` steps ahead. The relay echoes it;
   * we do not apply it locally until that echo arrives.
   */
  command(kind: CmdKind, payload: Cmd["payload"]) {
    if (!this.sim || !this.released || this.holding || this.sim.outcome !== "playing") return;
    const cmd: Cmd = {
      tick: this.simTick + this.delay,
      seat: this.seat,
      seq: this.seq++,
      kind,
      payload,
    };
    this.send({ op: "command", cmd });
  }

  /**
   * Tab hide does not pause the room. The match keeps ticking for everyone else.
   * Coming back asks for a snapshot so this phone does not sit on an old Deploy.
   */
  setHidden(hidden: boolean) {
    if (!this.sim || !this.released) return;
    this.holding = true;
    if (hidden) {
      this.catching = false;
      this.expectSnap = false;
      this.send({ op: "presence", hidden: true });
      return;
    }
    this.catching = true;
    this.expectSnap = true;
    this.misses = 0;
    this.send({ op: "presence", hidden: false });
    this.send({ op: "resync" });
  }

  /** Drive the 10 Hz sim. Returns how many ticks actually ran. */
  pump(dt: number): number {
    if (!this.sim || this.sim.outcome !== "playing") return 0;
    this.acc = Math.min(0.3, this.acc + dt);
    let steps = 0;
    while (this.acc >= 0.1 && steps < 4) {
      if (!this.step()) break;
      this.acc -= 0.1;
      steps++;
    }
    return steps;
  }

  /** One sim tick, or false if a human has not closed their orders yet. */
  step(): boolean {
    if (!this.sim || !this.released) return false;
    if (this.holding) {
      this.stalled = false;
      this.waiting = "";
      return false;
    }
    const closing = this.simTick + this.delay;
    this.seal(closing);
    const next = this.simTick + 1;
    if (!this.frameReady(next)) {
      this.stalled = next >= this.delay;
      this.waiting = this.stalled ? this.missing(next) : "";
      if (this.catching) {
        this.misses += 1;
        if (this.misses >= 8) {
          this.misses = 0;
          this.holding = true;
          this.expectSnap = true;
          this.send({ op: "presence", hidden: true });
          this.send({ op: "resync" });
        }
      }
      return false;
    }
    this.stalled = false;
    this.waiting = "";
    this.misses = 0;
    this.catching = false;
    this.applyTick(next);
    this.sim.tick(0.1);
    this.simTick = next;
    if (this.simTick > 0 && this.simTick % 20 === 0) {
      this.send({ op: "hash", tick: this.simTick, hash: this.sim.checksum() >>> 0 });
    }
    return true;
  }

  snapshot(): unknown {
    if (!this.sim || !this.go) return null;
    const inbox: Record<string, Record<string, FrameSlot>> = {};
    for (const [tick, seats] of this.inbox) {
      if (tick <= this.simTick) continue;
      inbox[String(tick)] = {};
      for (const [seat, slot] of seats) inbox[String(tick)]![String(seat)] = { cmds: slot.cmds.slice(), end: slot.end };
    }
    return {
      save: this.sim.toSave(),
      rng: this.sim.rng?.s ?? 0,
      tick: this.simTick,
      cpu: this.sim.cpu.slice(),
      frozenBits: this.sim.pauseBits,
      go: this.go,
      inbox,
      auto: [...this.autoEmpty],
    };
  }

  restore(snap: unknown) {
    if (!snap || typeof snap !== "object") return;
    const data = snap as {
      save: unknown;
      rng?: number;
      tick?: number;
      cpu?: boolean[];
      frozenBits?: number;
      go?: GoPayload;
      inbox?: Record<string, Record<string, FrameSlot>>;
      auto?: number[];
    };
    const sim = Sim.fromSave(data.save);
    if (!sim) return;
    if (data.go) {
      sim.seed = data.go.seed;
      if (typeof data.rng === "number") {
        sim.rng = new Rng(data.go.seed);
        sim.rng.s = data.rng >>> 0;
      }
    }
    if (data.cpu) sim.cpu = data.cpu.slice();
    if (typeof data.frozenBits === "number") {
      sim.pauseBits = data.frozenBits;
      sim.frozen = sim.pauseBits !== 0;
    }
    const late = this.inbox;
    this.sim = sim;
    this.simTick = data.tick ?? 0;
    this.inbox = new Map();
    this.sealed.clear();
    if (data.inbox) {
      for (const [tick, seats] of Object.entries(data.inbox)) {
        const row = new Map<number, FrameSlot>();
        for (const [seat, slot] of Object.entries(seats)) {
          row.set(Number(seat), { cmds: slot.cmds.slice(), end: !!slot.end });
        }
        this.inbox.set(Number(tick), row);
      }
    }
    for (const [tick, seats] of late) {
      if (tick <= this.simTick) continue;
      for (const [seat, slot] of seats) {
        const into = this.slot(tick, seat);
        into.end = into.end || slot.end;
        for (const cmd of slot.cmds) {
          if (!into.cmds.some((c) => c.seq === cmd.seq && c.seat === cmd.seat)) into.cmds.push(cmd);
        }
      }
    }
    this.autoEmpty = new Set(data.auto ?? []);
    this.holding = false;
    this.released = true;
    this.catching = true;
    this.misses = 0;
    for (let t = this.simTick + 1; t <= this.simTick + this.delay; t++) this.seal(t);
    this.onStart(sim, this.seat);
    this.send({ op: "live", tick: this.simTick });
  }

  private ping() {
    if (this.closed || this.reconnecting) return;
    this.pingId += 1;
    this.pingAt = Date.now();
    this.send({ op: "ping", id: this.pingId, rtt: this.rtt ?? undefined });
  }

  private socketClosed() {
    if (this.closed || this.stopRetry) return;
    if (!this.helloed) {
      this.stopRetry = true;
      if (!this.told) this.onRelayDead();
      return;
    }
    if (this.dropQueued) return;
    if (!this.opts.roomSurvives || !this.opts.reopen || !this.token) {
      this.error = "Connection closed";
      this.onError(this.error);
      this.onNet();
      return;
    }
    this.dropQueued = true;
    if (!this.dropAt) this.dropAt = Date.now();
    this.reconnecting = true;
    this.onNet();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.dropQueued = false;
      this.tryReopen();
    }, 600);
  }

  private tryReopen() {
    if (this.closed || this.stopRetry) return;
    const hold = this.lobby?.phase === "play" || this.sim != null ? 60_000 : 20_000;
    if (Date.now() - this.dropAt > hold || !this.opts.reopen || !this.token) {
      this.reconnecting = false;
      this.error = "Rejoin window closed";
      this.onError(this.error);
      this.onNet();
      return;
    }
    let sock: NetSocket;
    try {
      sock = this.opts.reopen();
    } catch {
      this.socketClosed();
      return;
    }
    this.bind(sock);
    this.expectSnap = true;
    this.send({ op: "join", code: this.code, name: this.playerName, token: this.token });
  }

  private remember() {
    if (!this.code || !this.token) return;
    const pack = JSON.stringify({ code: this.code, token: this.token, name: this.playerName });
    try {
      sessionStorage.setItem("viridite-room", pack);
      localStorage.setItem("viridite-room", pack);
    } catch {
      /* private mode */
    }
  }

  private forgetSeat() {
    try {
      sessionStorage.removeItem("viridite-room");
      localStorage.removeItem("viridite-room");
    } catch {
      /* private mode */
    }
  }

  private receive(msg: ServerMsg) {
    if (msg.op === "hello") {
      this.code = msg.code;
      this.seat = msg.seat;
      this.token = msg.token;
      this.helloed = true;
      this.stopRetry = false;
      this.reconnecting = false;
      this.dropAt = 0;
      this.error = "";
      this.remember();
      this.onNet();
      return;
    }
    if (msg.op === "lobby") {
      this.lobby = msg.lobby;
      if (msg.lobby.phase === "lobby") this.expectSnap = false;
      const mine = msg.lobby.seats.find((s) => s.you);
      if (mine?.name) this.playerName = mine.name;
      this.remember();
      this.onLobby(msg.lobby);
      return;
    }
    if (msg.op === "vitals") {
      this.vitals = msg.seats;
      this.onNet();
      return;
    }
    if (msg.op === "error") {
      this.error = msg.reason;
      this.told = true;
      if (/Seat taken|No such room|Match already|Room full|window|Room expired|Host left|room closed|match service is down/i.test(msg.reason)) {
        this.stopRetry = true;
      }
      this.reconnecting = false;
      this.onError(msg.reason);
      this.onNet();
      return;
    }
    if (msg.op === "bye") {
      this.stopRetry = true;
      this.reconnecting = false;
      this.onBye();
      return;
    }
    if (msg.op === "pong") {
      if (this.pingAt) this.rtt = Math.max(0, Date.now() - this.pingAt);
      return;
    }
    if (msg.op === "go") {
      if (msg.go.layout) {
        this.place(msg.go);
        return;
      }
      if (this.released && this.sim && this.go && this.go.seed === msg.go.seed && this.simTick > 0) return;
      this.begin(msg.go);
      return;
    }
    if (msg.op === "release") {
      this.opening();
      return;
    }
    if (msg.op === "desync") {
      this.desynced = true;
      this.holding = true;
      this.onNet();
      return;
    }
    if (msg.op === "presence") {
      if (msg.seat === this.seat) return;
      if (msg.hidden) {
        this.away.add(msg.seat);
        if (msg.gone) this.gone.add(msg.seat);
      } else {
        this.away.delete(msg.seat);
        this.gone.delete(msg.seat);
      }
      if (!msg.hidden) this.afkSeats.delete(msg.seat);
      this.refreshAwayNote();
      return;
    }
    if (msg.op === "afk") {
      if (msg.on) this.afkSeats.add(msg.seat);
      else this.afkSeats.delete(msg.seat);
      this.refreshAwayNote();
      return;
    }
    if (msg.op === "command") {
      this.pushCmd(msg.cmd);
      return;
    }
    if (msg.op === "end") {
      this.markEnd(msg.seat, msg.tick);
      return;
    }
    if (msg.op === "assume") {
      this.autoEmpty.add(msg.seat);
      this.away.delete(msg.seat);
      this.gone.delete(msg.seat);
      if (this.sim) this.sim.cpu[msg.seat] = true;
      this.humans = this.humans.filter((s) => s !== msg.seat);
      this.refreshAwayNote();
      return;
    }
    if (msg.op === "needSnapshot") {
      if (!this.sim || !this.released || this.expectSnap || this.desynced) return;
      const snap = this.snapshot();
      if (!snap) return;
      if (msg.for === "*") this.send({ op: "snapshot", snap, resync: true });
      else this.send({ op: "snapshot", snap, for: msg.for });
      return;
    }
    if (msg.op === "snapshot") {
      if (msg.resync) {
        if (this.seat === 0 && this.sim) return;
        this.expectSnap = false;
        this.desynced = false;
        this.restore(msg.snap);
        return;
      }
      if (this.sim && !this.expectSnap) return;
      this.expectSnap = false;
      this.restore(msg.snap);
    }
  }

  /** Host measures camps, then the room repeats them to every phone. */
  private place(go: GoPayload) {
    const sim = this.makeSim(go);
    const starts = sim.starts.slots.map((s) => ({ x: s.x, y: s.y }));
    this.send({ op: "placed", starts });
  }

  private begin(go: GoPayload) {
    if (!go.starts || go.starts.length < 2) {
      this.error = "Start positions missing";
      this.onError(this.error);
      return;
    }
    this.go = go;
    this.seat = go.seat;
    this.delay = go.rules.delay;
    this.names = go.names.slice();
    this.simTick = 0;
    this.acc = 0;
    this.seq = 1;
    this.inbox.clear();
    this.sealed.clear();
    this.autoEmpty.clear();
    this.humans = [];
    for (let i = 0; i <= go.opponents; i++) if (!go.cpu[i]) this.humans.push(i);
    const sim = this.makeSim(go);
    const got = sim.starts.slots;
    for (let i = 0; i < go.starts.length; i++) {
      const want = go.starts[i]!;
      const have = got[i];
      if (!have || Math.abs(have.x - want.x) > 0.02 || Math.abs(have.y - want.y) > 0.02) {
        this.error = "Start positions did not match";
        this.onError(this.error);
        return;
      }
    }
    this.sim = sim;
    this.holding = true;
    this.released = false;
    this.catching = false;
    this.expectSnap = false;
    this.desynced = false;
    this.away.clear();
    this.gone.clear();
    this.afkSeats.clear();
    this.awayNote = "";
    this.send({ op: "match_started" });
  }

  private makeSim(go: GoPayload): Sim {
    const doc = go.chart ? readShare(go.chart) : null;
    const diff = go.rules.difficulty === "easy" || go.rules.difficulty === "hard" ? go.rules.difficulty : "normal";
    return new Sim({
      mapId: doc ? (doc.terrain.some((t) => t === TILE_DEEP) ? "coast" : "dry") : go.rules.mapId,
      faction: go.rules.player,
      enemy: go.rules.enemy,
      mode: "destroy",
      credits: go.rules.credits,
      ai: diff === "hard" ? "raider" : "builder",
      difficulty: diff,
      fog: go.rules.fog,
      crates: true,
      mapSize: doc ? lobbySize(doc) : go.rules.size,
      opponents: go.opponents,
      teams: go.rules.teams,
      start: "sw",
      walls: go.rules.walls,
      shared: go.shared,
      limit: go.rules.limit == null ? 60 * 60 : go.rules.limit <= 0 ? 0 : go.rules.limit * 60,
      year: go.rules.year,
      seed: go.seed,
      cpu: go.cpu,
      custom: doc ? pack(doc) : undefined,
      slots: go.layout ? undefined : go.starts,
    });
  }

  /** All phones have ACKed. The battle screen may open. */
  private opening() {
    if (this.released || !this.sim) return;
    this.released = true;
    this.holding = false;
    this.onStart(this.sim, this.seat);
  }

  private refreshAwayNote() {
    const label = (seat: number) => this.names[seat] || this.lobby?.seats.find((s) => s.seat === seat)?.name || "A commander";
    const parts: string[] = [];
    for (const seat of this.afkSeats) {
      if (seat === this.seat) continue;
      parts.push(`${label(seat)} is AFK`);
    }
    for (const seat of this.gone) {
      if (seat === this.seat) continue;
      parts.push(`${label(seat)} is disconnected. 60 seconds to rejoin`);
    }
    for (const seat of this.away) {
      if (seat === this.seat || this.afkSeats.has(seat) || this.gone.has(seat)) continue;
      parts.push(`${label(seat)} is away`);
    }
    this.awayNote = parts.join(" · ");
  }

  private slot(tick: number, seat: number): FrameSlot {
    let row = this.inbox.get(tick);
    if (!row) {
      row = new Map();
      this.inbox.set(tick, row);
    }
    let slot = row.get(seat);
    if (!slot) {
      slot = { cmds: [], end: false };
      row.set(seat, slot);
    }
    return slot;
  }

  private pushCmd(cmd: Cmd) {
    if (!Number.isFinite(cmd.tick) || cmd.tick < 0) return;
    const slot = this.slot(cmd.tick | 0, cmd.seat | 0);
    if (slot.cmds.some((c) => c.seq === cmd.seq && c.seat === cmd.seat)) return;
    slot.cmds.push(cmd);
  }

  private markEnd(seat: number, tick: number) {
    this.slot(tick | 0, seat | 0).end = true;
  }

  private seal(tick: number) {
    if (this.sealed.has(tick) || tick < this.delay) return;
    this.sealed.add(tick);
    this.markEnd(this.seat, tick);
    this.send({ op: "end", tick });
  }

  private frameReady(tick: number): boolean {
    if (tick < this.delay) return true;
    for (const seat of this.humans) {
      if (this.autoEmpty.has(seat) || this.away.has(seat)) continue;
      const slot = this.inbox.get(tick)?.get(seat);
      if (!slot?.end) return false;
    }
    return true;
  }

  private missing(tick: number): string {
    for (const seat of this.humans) {
      if (this.autoEmpty.has(seat) || this.away.has(seat)) continue;
      const slot = this.inbox.get(tick)?.get(seat);
      if (!slot?.end) return `Waiting for ${this.names[seat] || "a commander"}`;
    }
    return "";
  }

  private applyTick(tick: number) {
    if (!this.sim) return;
    if (tick < this.delay) return;
    const row = this.inbox.get(tick);
    if (!row) return;
    const cmds: Cmd[] = [];
    for (const [seat, slot] of row) {
      if (this.away.has(seat)) continue;
      cmds.push(...slot.cmds);
    }
    cmds.sort((a, b) => a.seat - b.seat || a.seq - b.seq);
    for (const cmd of cmds) applyOrder(this.sim, cmd);
    this.inbox.delete(tick);
  }
}
