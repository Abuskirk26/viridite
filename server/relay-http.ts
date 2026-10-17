/**
 * Match relay over ordinary HTTP, and a WebSocket when the host allows one.
 * The page app used to answer this path, so a phone could look connected
 * while a friend got a 404.
 *
 * A published match uses the shared database. A single preview process with
 * no database keeps the room in memory so two phones on that process still meet.
 */
import { RelayRoom, type ServerMsg } from "../src/game/relay-room.ts";

export const RELAY_HEALTH = 'VIRIDITE relay. Connect a WebSocket and send {op:"create", name}.\n';

type ClientMsg = { op: string; [key: string]: unknown };

const CLIENT_ID = /^[A-Za-z0-9-]{8,80}$/;

const rooms = new Map<string, RelayRoom>();
const where = new Map<string, string>();
const pending = new Map<string, ServerMsg[]>();
const sockets = new Map<string, (raw: string) => void>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function useDb(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function store() {
  return import("./relay-store.ts");
}

function members(room: RelayRoom): string[] {
  const ids: string[] = [];
  for (const seat of room.dump().seats) if (seat.clientId && seat.connected) ids.push(seat.clientId);
  return ids;
}

function queue(id: string, msg: ServerMsg) {
  const list = pending.get(id);
  if (list) list.push(msg);
  else pending.set(id, [msg]);
}

function fan(outs: { to: string; msg: ServerMsg }[], room: RelayRoom) {
  const live = members(room);
  for (const o of outs) {
    const targets = o.to === "*" ? live : [o.to];
    for (const id of targets) if (id) queue(id, o.msg);
  }
}

function take(id: string): ServerMsg[] {
  const list = pending.get(id) ?? [];
  pending.delete(id);
  return list;
}

function flushSockets() {
  for (const [id, send] of sockets) {
    for (const msg of take(id)) send(JSON.stringify(msg));
  }
}

function remember(clientId: string, room: RelayRoom) {
  if (room.closed) {
    where.delete(clientId);
    rooms.delete(room.code);
    return;
  }
  const live = room.dump().seats.some((seat) => seat.clientId === clientId && seat.connected);
  if (live) where.set(clientId, room.code);
  else where.delete(clientId);
}

function localTurn(clientId: string, msg: ClientMsg | null): ServerMsg[] {
  if (!CLIENT_ID.test(clientId)) return [{ op: "error", reason: "The match service is down." }];
  if (!sweepTimer) {
    sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const room of [...rooms.values()]) {
        fan(room.sweep(now), room);
        if (room.closed) rooms.delete(room.code);
      }
      flushSockets();
    }, 1000);
    sweepTimer.unref?.();
  }
  if (msg?.op === "health") return [{ op: "pong", id: 0 }];
  if (msg?.op === "create") {
    let room = new RelayRoom();
    while (rooms.has(room.code)) room = new RelayRoom();
    rooms.set(room.code, room);
    const outs = room.push(clientId, msg, Date.now());
    where.set(clientId, room.code);
    fan(outs, room);
  } else if (msg && msg.op === "join") {
    const code = String(msg.code || "").trim().toUpperCase();
    const room = rooms.get(code) ?? null;
    if (!room) queue(clientId, { op: "error", reason: "No such room" });
    else {
      fan(room.push(clientId, msg, Date.now()), room);
      remember(clientId, room);
    }
  } else if (msg && typeof msg.op === "string") {
    const code = where.get(clientId) ?? "";
    const room = rooms.get(code);
    if (room) {
      fan(room.push(clientId, msg, Date.now()), room);
      remember(clientId, room);
    }
  }
  const code = where.get(clientId);
  const room = code ? rooms.get(code) : undefined;
  if (room) fan(room.sweep(Date.now()), room);
  const mine = take(clientId);
  flushSockets();
  return mine;
}

async function turn(clientId: string, msg: ClientMsg | null): Promise<ServerMsg[]> {
  if (!useDb()) return localTurn(clientId, msg);
  try {
    const db = await store();
    if (msg?.op === "health") return [{ op: "pong", id: 0 }];
    return db.relayExchange(clientId, msg);
  } catch {
    return [{ op: "error", reason: "The match service is down." }];
  }
}

const hooks = {
  open(peer: { id: string; send: (data: string) => void }) {
    if (useDb()) {
      void store()
        .then((db) => db.attachClient(peer.id, (raw) => peer.send(raw)))
        .catch(() => peer.send(JSON.stringify({ op: "error", reason: "The match service is down." })));
      return;
    }
    sockets.set(peer.id, (raw) => peer.send(raw));
  },
  message(peer: { id: string; send: (data: string) => void }, message: { text: () => string }) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message.text()) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg.op !== "string") return;
    if (msg.op === "health") {
      peer.send(JSON.stringify({ op: "pong", id: 0 }));
      return;
    }
    if (useDb()) {
      void store()
        .then((db) => db.relayPush(peer.id, msg))
        .catch(() => peer.send(JSON.stringify({ op: "error", reason: "The match service is down." })));
      return;
    }
    for (const out of localTurn(peer.id, msg)) peer.send(JSON.stringify(out));
  },
  close(peer: { id: string }) {
    sockets.delete(peer.id);
    if (useDb()) {
      void store()
        .then((db) => db.detachClient(peer.id))
        .catch(() => undefined);
      return;
    }
    for (const out of localTurn(peer.id, { op: "leave" })) {
      /* the phone is gone; everyone else was flushed */
      void out;
    }
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** GET is the health line. POST is one mailbox turn. A socket upgrade reads `crossws`. */
export async function relayHttp(req: Request): Promise<Response> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "POST") {
    let body: { client?: unknown; msg?: { op?: unknown } } | null = null;
    try {
      body = (await req.json()) as { client?: unknown; msg?: { op?: unknown } } | null;
    } catch {
      body = null;
    }
    const client = typeof body?.client === "string" ? body.client : "";
    const raw = body?.msg;
    const msg = raw && typeof raw === "object" && typeof raw.op === "string" ? { ...raw, op: raw.op } : null;
    const msgs = await turn(client, msg);
    return json({ msgs });
  }
  const res = new Response(method === "HEAD" ? null : RELAY_HEALTH, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
  return Object.assign(res, { crossws: hooks });
}
