#!/usr/bin/env node
// @ts-nocheck
/**
 * VIRIDITE lockstep relay. One process, no accounts, no simulation.
 *
 *   node relay/server.mjs
 *   # listens on 0.0.0.0:8091
 *
 * Rooms are 5-character codes and die after 30 minutes of silence.
 * Messages: create, join, ready, start, placed, match_started, command, hash,
 * snapshot, leave (plus rules, commanders, fill, ping, end, rematch, presence,
 * resync, live). The server assigns seats, repeats one map seed and the host's
 * start positions, and drops any command whose seat does not match the socket.
 * A dropped seat can reclaim its token for 60 seconds. Divergent state hashes
 * ask the host for a snapshot, then declare desync.
 * It stores no world state. Each seat may send 20 commands/second.
 *
 * Client:
 *   const ws = new WebSocket("ws://127.0.0.1:8091");
 *   ws.onopen = () => ws.send(JSON.stringify({ op: "create", name: "Ada" }));
 *   ws.onmessage = (ev) => {
 *     const msg = JSON.parse(ev.data);
 *     if (msg.op === "hello") console.log("code", msg.code, "seat", msg.seat);
 *     if (msg.op === "go") console.log("seed", msg.go.seed);
 *   };
 */

import http from "node:http";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { RelayRoom } from "../src/game/relay-room.ts";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME = 1_500_000;

export function startRelay(port = 8091, host = "0.0.0.0") {
  /** @type {Map<string, import("../src/game/relay-room.ts").RelayRoom>} */
  const rooms = new Map();
  /** @type {Map<string, { socket: import("node:net").Socket, room: import("../src/game/relay-room.ts").RelayRoom | null }>} */
  const clients = new Map();

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("VIRIDITE relay. Connect a WebSocket and send {op:\"create\", name}.\n");
  });

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.closed) {
        rooms.delete(code);
        continue;
      }
      if (room.expired(now)) {
        fan(room, [{ to: "*", msg: { op: "error", reason: "Room expired" } }]);
        rooms.delete(code);
        continue;
      }
      fan(room, room.sweep(now));
      if (room.closed) rooms.delete(code);
    }
  }, 5_000);
  sweep.unref?.();

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash("sha1").update(String(key) + GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const id = crypto.randomUUID();
    /** @type {Buffer} */
    let buf = Buffer.alloc(0);
    const slot = { socket, room: /** @type {import("../src/game/relay-room.ts").RelayRoom | null} */ (null) };
    clients.set(id, slot);

    const take = (msg) => {
      if (msg.op === "health") {
        sendText(socket, JSON.stringify({ op: "pong", id: 0 }));
        return;
      }
      let room = slot.room;
      if (!room && (msg.op === "create" || msg.op === "join")) {
        if (msg.op === "create") {
          let created = new RelayRoom();
          while (rooms.has(created.code)) created = new RelayRoom();
          room = created;
          rooms.set(room.code, room);
          slot.room = room;
        } else {
          const code = String(msg.code || "").toUpperCase();
          room = rooms.get(code) ?? null;
          if (!room) {
            sendText(socket, JSON.stringify({ op: "error", reason: "No such room" }));
            return;
          }
          if (room.expired() || room.closed) {
            sendText(socket, JSON.stringify({ op: "error", reason: "Room expired" }));
            return;
          }
          slot.room = room;
        }
      }
      if (!room) {
        sendText(socket, JSON.stringify({ op: "error", reason: "No such room" }));
        return;
      }
      if (room.expired() || room.closed) {
        slot.room = null;
        sendText(socket, JSON.stringify({ op: "error", reason: "Room expired" }));
        return;
      }
      fan(room, room.push(id, msg, Date.now()));
    };

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_FRAME) {
        socket.destroy();
        return;
      }
      const next = readFrames(buf, (text, op) => {
        if (op === 0x8) {
          socket.end();
          return;
        }
        if (op === 0x9) {
          sendControl(socket, 0xa, text);
          return;
        }
        if (op !== 0x1) return;
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (!msg || typeof msg.op !== "string") return;
        take(msg);
      });
      if (next < 0) {
        socket.end();
        return;
      }
      buf = buf.subarray(next);
    });

    const gone = () => {
      if (!clients.has(id)) return;
      clients.delete(id);
      const room = slot.room;
      if (!room) return;
      fan(room, room.drop(id, Date.now()));
    };
    socket.on("close", gone);
    socket.on("end", gone);
    socket.on("error", gone);
  });

  function fan(room, outs) {
    const ids = [];
    for (const [cid, slot] of clients) if (slot.room === room) ids.push(cid);
    for (const o of outs) {
      const targets = o.to === "*" ? ids : [o.to];
      const raw = JSON.stringify(o.msg);
      for (const cid of targets) {
        const slot = clients.get(cid);
        if (slot) sendText(slot.socket, raw);
      }
    }
  }

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const real = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: real,
        url: `ws://127.0.0.1:${real}`,
        close: () =>
          new Promise((done) => {
            clearInterval(sweep);
            server.close(() => done());
            for (const slot of clients.values()) slot.socket.destroy();
          }),
      });
    });
  });
}

function sendText(socket, text) {
  if (socket.destroyed) return;
  const payload = Buffer.from(text);
  socket.write(Buffer.concat([frameHead(0x81, payload.length), payload]));
}

function sendControl(socket, opcode, text) {
  if (socket.destroyed) return;
  const payload = Buffer.from(text);
  socket.write(Buffer.concat([frameHead(0x80 | opcode, payload.length), payload]));
}

function frameHead(first, len) {
  if (len < 126) return Buffer.from([first, len]);
  if (len < 65536) {
    const head = Buffer.alloc(4);
    head[0] = first;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
    return head;
  }
  const head = Buffer.alloc(10);
  head[0] = first;
  head[1] = 127;
  head.writeBigUInt64BE(BigInt(len), 2);
  return head;
}

/** @returns {number} bytes consumed, or -1 to close */
function readFrames(buf, onFrame) {
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    const op = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = offset + 2;
    if (len === 126) {
      if (buf.length < p + 2) return offset;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (buf.length < p + 8) return offset;
      const big = buf.readBigUInt64BE(p);
      if (big > BigInt(MAX_FRAME)) return -1;
      len = Number(big);
      p += 8;
    }
    if (len > MAX_FRAME) return -1;
    const maskLen = masked ? 4 : 0;
    if (buf.length < p + maskLen + len) return offset;
    let data;
    if (masked) {
      const mask = buf.subarray(p, p + 4);
      p += 4;
      data = Buffer.alloc(len);
      for (let i = 0; i < len; i++) data[i] = buf[p + i] ^ mask[i & 3];
    } else {
      data = buf.subarray(p, p + len);
    }
    p += len;
    offset = p;
    if (op === 0x8) return -1;
    if (op === 0x1 || op === 0x9) onFrame(data.toString("utf8"), op);
  }
  return offset;
}

const launched = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launched) {
  const port = Number(process.env.PORT || 8091);
  startRelay(port).then((srv) => {
    process.stdout.write(`VIRIDITE relay on ${srv.url}\n`);
  });
}
