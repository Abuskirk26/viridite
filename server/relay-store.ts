/**
 * One room, many server instances. The socket stays on whichever instance
 * accepted it. Room state, the client→room map, and the outbound queue live
 * in the database so a friend's phone can land on a different instance.
 */
import { getSql, type Sql } from "../src/lib/db.ts";
import { RelayRoom, type Outbound, type ServerMsg } from "../src/game/relay-room.ts";

type ClientMsg = { op: string; code?: string; name?: string; token?: string; [key: string]: unknown };

const CLIENT_ID = /^[A-Za-z0-9-]{8,80}$/;

const local = new Map<string, (raw: string) => void>();
const roomOf = new Map<string, string>();
let timer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

export function attachClient(id: string, send: (raw: string) => void) {
  local.set(id, send);
  if (!timer) {
    timer = setInterval(() => {
      void pump().catch(() => undefined);
    }, 100);
    timer.unref?.();
  }
}

export function detachClient(id: string) {
  local.delete(id);
  void relayPush(id, { op: "leave" })
    .catch(() => undefined)
    .finally(() => {
      roomOf.delete(id);
    });
}

export async function relayPush(clientId: string, msg: ClientMsg): Promise<void> {
  if (!msg || typeof msg.op !== "string") return;
  const sql = await getSql();
  await apply(sql, clientId, msg);
}

/**
 * One request: apply an optional client message, sweep the room, and return
 * whatever is waiting for this phone. Used when a WebSocket upgrade is not
 * available. Messages are claimed, so a socket pump cannot deliver them too.
 */
export async function relayExchange(clientId: string, msg: ClientMsg | null): Promise<ServerMsg[]> {
  if (!CLIENT_ID.test(clientId)) return [{ op: "error", reason: "The match service is down." }];
  try {
    const sql = await getSql();
    await sql`delete from relay_out where at < now() - interval '2 minutes'`;
    if (msg && typeof msg.op === "string") await apply(sql, clientId, msg);
    const code = await codeFor(sql, clientId);
    if (code) await mutate(sql, code, (room) => room.sweep(Date.now()));
    return drain(sql, clientId);
  } catch {
    return [{ op: "error", reason: "The match service is down." }];
  }
}

async function apply(sql: Sql, clientId: string, msg: ClientMsg): Promise<void> {
  if (msg.op === "create") {
    await createRoom(sql, clientId, msg);
    return;
  }
  if (msg.op === "join") {
    const code = String(msg.code || "").trim().toUpperCase();
    const room = await mutate(sql, code, (live) => live.push(clientId, msg, Date.now()));
    if (!room) await enqueue(sql, [{ to: clientId, msg: { op: "error", reason: "No such room" } }], []);
    else await remember(sql, clientId, code, room);
    return;
  }
  const code = await codeFor(sql, clientId);
  if (!code) return;
  const room = await mutate(sql, code, (live) => live.push(clientId, msg, Date.now()));
  if (room) await remember(sql, clientId, code, room);
}

async function createRoom(sql: Sql, clientId: string, msg: ClientMsg) {
  for (let n = 0; n < 6; n++) {
    const room = new RelayRoom();
    const outs = room.push(clientId, msg, Date.now());
    try {
      await sql`insert into relay_room (code, ver, state) values (${room.code}, 1, ${JSON.stringify(room.dump())}::jsonb)`;
      roomOf.set(clientId, room.code);
      await sql`insert into relay_client (client, code) values (${clientId}, ${room.code})
        on conflict (client) do update set code = excluded.code`;
      await enqueue(sql, outs, roomClientIds(room));
      return;
    } catch {
      /* code clash or a lost race */
    }
  }
  await enqueue(sql, [{ to: clientId, msg: { op: "error", reason: "The match service is down." } }], []);
}

async function mutate(sql: Sql, code: string, fn: (room: RelayRoom) => Outbound[]): Promise<RelayRoom | null> {
  if (!code) return null;
  for (let n = 0; n < 8; n++) {
    const rows = await sql<{ ver: number; state: unknown }>`select ver, state from relay_room where code = ${code}`;
    const row = rows[0];
    if (!row) return null;
    const room = RelayRoom.restore(row.state);
    if (!room) return null;
    const before = JSON.stringify(room.dump());
    const outs = fn(room);
    const after = JSON.stringify(room.dump());
    if (before === after && outs.length === 0) return room;
    const saved = await sql<{ ver: number }>`
      update relay_room
      set state = ${JSON.stringify(room.dump())}::jsonb, ver = ver + 1, updated_at = now()
      where code = ${code} and ver = ${Number(row.ver)}
      returning ver
    `;
    if (!saved.length) continue;
    await enqueue(sql, outs, roomClientIds(room));
    if (room.closed) {
      await sql`delete from relay_room where code = ${code}`;
      await sql`delete from relay_client where code = ${code}`;
    }
    return room;
  }
  return null;
}

function roomClientIds(room: RelayRoom): string[] {
  const ids: string[] = [];
  for (const seat of room.dump().seats) if (seat.clientId && seat.connected) ids.push(seat.clientId);
  return ids;
}

async function remember(sql: Sql, clientId: string, code: string, room: RelayRoom) {
  if (room.closed) {
    roomOf.delete(clientId);
    return;
  }
  const live = room.dump().seats.some((seat) => seat.clientId === clientId && seat.connected);
  if (live) {
    roomOf.set(clientId, code);
    await sql`insert into relay_client (client, code) values (${clientId}, ${code})
      on conflict (client) do update set code = excluded.code`;
    return;
  }
  roomOf.delete(clientId);
  await sql`delete from relay_client where client = ${clientId}`;
}

async function codeFor(sql: Sql, clientId: string): Promise<string> {
  const cached = roomOf.get(clientId);
  if (cached) return cached;
  const rows = await sql<{ code: string }>`select code from relay_client where client = ${clientId}`;
  const code = rows[0]?.code ?? "";
  if (code) roomOf.set(clientId, code);
  return code;
}

async function enqueue(sql: Sql, outs: Outbound[], members: string[]) {
  for (const o of outs) {
    const targets = o.to === "*" ? members : [o.to];
    const body = JSON.stringify(o.msg);
    for (const client of targets) {
      if (!client) continue;
      await sql`insert into relay_out (client, body) values (${client}, ${body}::jsonb)`;
    }
  }
}

async function drain(sql: Sql, clientId: string): Promise<ServerMsg[]> {
  const rows = await sql<{ id: number; body: unknown }>`
    delete from relay_out
    where id in (
      select id from relay_out where client = ${clientId} order by id limit 40
    )
    returning id, body
  `;
  rows.sort((a, b) => Number(a.id) - Number(b.id));
  const msgs: ServerMsg[] = [];
  for (const row of rows) {
    const msg = asMsg(row.body);
    if (msg) msgs.push(msg);
  }
  return msgs;
}

async function pump() {
  if (flushing) return;
  const ids = [...local.keys()];
  if (!ids.length) return;
  flushing = true;
  try {
    const sql = await getSql();
    await sql`delete from relay_out where at < now() - interval '2 minutes'`;
    for (const id of ids) {
      const send = local.get(id);
      if (!send) continue;
      for (const msg of await drain(sql, id)) send(JSON.stringify(msg));
    }
    const codes = new Set<string>();
    for (const id of ids) {
      const code = roomOf.get(id);
      if (code) codes.add(code);
    }
    const now = Date.now();
    for (const code of codes) await mutate(sql, code, (room) => room.sweep(now));
  } finally {
    flushing = false;
  }
}

function asMsg(body: unknown): ServerMsg | null {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as ServerMsg;
    } catch {
      return null;
    }
  }
  if (body && typeof body === "object") return body as ServerMsg;
  return null;
}
