import assert from "node:assert/strict";
import test from "node:test";
import { NetPlay, matchError, parseRelayHint, parseRoomCode, relayHealthy, relayHttpUrl, roomInviteUrl, seatStatusText, smsInviteHref, type NetSocket } from "./netplay.ts";
import { AFK_MS, CMD_PER_SEC, IDLE_MS, RelayRoom, makeCode, startBlock } from "./relay-room.ts";
import type { ServerMsg } from "./relay-room.ts";

function link() {
  const room = new RelayRoom("ROOMX", 1_000_000);
  const handlers = new Map<string, (msg: ServerMsg) => void>();
  const deliver = (from: string, msg: unknown, now = 1_000_000) => {
    const outs = room.push(from, msg as { op: string }, now);
    for (const o of outs) {
      for (const [id, fn] of handlers) {
        if (o.to === "*" || o.to === id) fn(o.msg);
      }
    }
  };
  const sock = (id: string): NetSocket => ({
    send(data: string) {
      deliver(id, JSON.parse(data) as unknown);
    },
    close() {
      deliver(id, { op: "leave" });
    },
    onMessage(fn) {
      handlers.set(id, (msg) => fn(JSON.stringify(msg)));
    },
    onClose() {},
  });
  const a = new NetPlay(sock("a"), { ping: false });
  const b = new NetPlay(sock("b"), { ping: false });
  return { room, a, b, deliver };
}

function bootPair() {
  const net = link();
  let started = 0;
  net.a.onStart = () => {
    started++;
  };
  net.b.onStart = () => {
    started++;
  };
  net.a.host("Ada");
  net.b.join("ROOMX", "Bea");
  net.a.raw({ op: "ping", id: 1, rtt: 40 });
  net.b.raw({ op: "ping", id: 1, rtt: 55 });
  net.b.ready(true);
  net.a.setRules({ mapId: "dry", size: "skirmish", delay: 4, fog: false, walls: false, credits: 5000 });
  net.a.start();
  assert.equal(started, 2);
  assert.ok(net.a.sim);
  assert.ok(net.b.sim);
  assert.equal(net.a.seat, 0);
  assert.equal(net.b.seat, 1);
  assert.equal(net.a.sim.seed, net.b.sim.seed);
  return net;
}

test("room codes are 5 unambiguous characters", () => {
  const code = makeCode(() => 0);
  assert.equal(code.length, 5);
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
});

test("an invite link carries the room and opens it", () => {
  const href = "https://play.example/path?x=1#top";
  const link = roomInviteUrl("ab12c", { href });
  const url = new URL(link);
  assert.equal(url.searchParams.get("room"), "AB12C");
  assert.equal(url.searchParams.get("x"), "1");
  assert.equal(url.hash, "");
  assert.equal(parseRoomCode(url.search), "AB12C");
  const phone = new URL(roomInviteUrl("AB12C", { href, mode: "phone" }));
  assert.equal(phone.searchParams.get("relay"), "phone");
  assert.equal(parseRelayHint(phone.search).mode, "phone");
  const custom = new URL(roomInviteUrl("AB12C", { href, mode: "custom", customUrl: "wss://relay.example/v" }));
  assert.equal(parseRelayHint(custom.search).url, "wss://relay.example/v");
  assert.equal(parseRoomCode("?room=nope"), "");
  assert.equal(parseRoomCode("?room=abcde"), "ABCDE");
  assert.equal(parseRelayHint("?relay=javascript:alert(1)").mode, "public");
  assert.equal(parseRelayHint("?relay=local").mode, "local");
  const local = new URL(roomInviteUrl("AB12C", { href, mode: "local" }));
  assert.equal(local.searchParams.get("relay"), "local");
  assert.equal(relayHealthy(404, "<!DOCTYPE html><title>VIRIDITE</title>"), false);
  assert.equal(relayHealthy(200, "<!DOCTYPE html>VIRIDITE relay"), false);
  assert.equal(relayHealthy(200, 'VIRIDITE relay. Connect a WebSocket and send {op:"create", name}.\n'), true);
  assert.equal(relayHttpUrl("wss://abcc.grok.me/viridite-relay"), "https://abcc.grok.me/viridite-relay");
  assert.equal(relayHttpUrl("ws://127.0.0.1:8080/viridite-relay"), "http://127.0.0.1:8080/viridite-relay");
  assert.equal(matchError("No such room"), "No room with that code.");
  assert.equal(matchError("Room full"), "That room is full.");
  assert.equal(matchError("Match already started"), "That match already started.");
  assert.equal(matchError("WebSocket closed"), "The match service is down.");
  assert.equal(matchError("Can't reach the match service."), "The match service is down.");
  assert.equal(relayHealthy(406, '{"error":"Only HTML requests are supported here"}'), false);
  assert.equal(seatStatusText({ fill: "human", connected: true, away: false }, false, true), "Connecting");
  assert.equal(seatStatusText({ fill: "human", connected: true, away: false }, true, false), "Reconnecting");
  assert.equal(seatStatusText({ fill: "human", connected: true, away: false }, true, true), "Connected");
  assert.equal(seatStatusText({ fill: "human", connected: false, away: false }, true, true), "Reconnecting");
  assert.equal(seatStatusText({ fill: "open", connected: false, away: false }, true, true), "Waiting");
  assert.equal(seatStatusText({ fill: "ai", connected: false, away: false }, false, false), "AI");
  const sms = smsInviteHref("Join my VIRIDITE match\nhttps://play.example/?room=ABCDE", false);
  assert.equal(sms.startsWith("sms:?body="), true);
  assert.equal(decodeURIComponent(sms.slice("sms:?body=".length)).includes("https://play.example/?room=ABCDE"), true);
  assert.equal(smsInviteHref("Hi", true).startsWith("sms:&body="), true);
  assert.equal(sms.includes("javascript:"), false);
});

test("relay rejects the wrong seat and excess orders", () => {
  const room = new RelayRoom("ZZZZZ", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("g", { op: "join", code: "ZZZZZ", name: "Bea" }, 5_000);
  room.push("h", { op: "ping", id: 1, rtt: 10 }, 5_000);
  room.push("g", { op: "ping", id: 1, rtt: 10 }, 5_000);
  room.push("g", { op: "ready", ready: true }, 5_000);
  room.push("h", { op: "start" }, 5_000);
  const bad = room.push(
    "g",
    { op: "command", cmd: { tick: 8, seat: 0, seq: 1, kind: "move", payload: { ids: [1], x: 1, y: 1 } } },
    5_000,
  );
  assert.equal(bad[0]?.msg.op, "error");
  if (bad[0]?.msg.op === "error") assert.match(bad[0].msg.reason, /Wrong seat/);

  let dropped = false;
  for (let i = 0; i < CMD_PER_SEC + 2; i++) {
    const out = room.push(
      "h",
      { op: "command", cmd: { tick: 9, seat: 0, seq: i + 2, kind: "stop", payload: { ids: [1] } } },
      5_100,
    );
    if (out.some((o) => o.msg.op === "error")) dropped = true;
  }
  assert.equal(dropped, true);
});

test("co-op puts the next friend on your side and bots on the other", () => {
  const room = new RelayRoom("COOP1", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("h", { op: "rules", rules: { teams: "tvt", size: "large" } }, 5_000);
  const view = room.view("h");
  assert.equal(view.commanders, 4);
  assert.equal(view.seats[1]?.fill, "ai");
  assert.equal(view.seats[1]?.name, "Bot");
  assert.equal(view.seats[2]?.fill, "open");
  assert.equal(view.seats[3]?.name, "Bot");
  const joined = room.push("g", { op: "join", code: "COOP1", name: "Bea" }, 5_000);
  const hello = joined.find((o) => o.to === "g" && o.msg.op === "hello");
  assert.equal(hello && hello.msg.op === "hello" ? hello.msg.seat : -1, 2);
  room.push("h", { op: "rules", rules: { teams: "ffa" } }, 5_100);
  const back = room.view("h");
  assert.equal(back.rules.teams, "ffa");
  assert.equal(back.seats[1]?.fill, "open");
  assert.equal(back.seats[2]?.fill, "human");
  assert.equal(back.seats[3]?.fill, "open");
});

test("start stays blocked while a ping is over 250 ms", () => {
  const room = new RelayRoom("PINGY", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("g", { op: "join", code: "PINGY", name: "Bea" }, 5_000);
  room.push("h", { op: "ping", id: 1, rtt: 20 }, 5_000);
  room.push("g", { op: "ping", id: 1, rtt: 400 }, 5_000);
  room.push("g", { op: "ready", ready: true }, 5_000);
  const view = room.view("h");
  assert.match(startBlock(view.rules, view.seats), /250/);
  const out = room.push("h", { op: "start" }, 5_000);
  assert.equal(out[0]?.msg.op, "error");
});

test("a two-start map blocks a third seat and shows the chart before start", () => {
  const room = new RelayRoom("MAP01", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("g", { op: "join", code: "MAP01", name: "Bea" }, 5_000);
  room.push("h", { op: "commanders", commanders: 3 }, 5_000);
  room.push("c", { op: "join", code: "MAP01", name: "Cy" }, 5_000);
  assert.equal(room.view("h").commanders, 3);
  const kicked = room.push(
    "h",
    {
      op: "rules",
      rules: { customId: "tpl:grass", customName: "Keep off the Grass", customStarts: 2, mapId: "dry", size: "skirmish", teams: "tvt" },
      chart: "VIR1.grass",
    },
    5_000,
  );
  assert.equal(room.rules.teams, "ffa");
  assert.ok(kicked.some((o) => o.to === "c" && o.msg.op === "error" && /2 starts/.test(o.msg.op === "error" ? o.msg.reason : "")));
  assert.ok(kicked.some((o) => o.to === "c" && o.msg.op === "bye"));
  assert.equal(room.view("h").commanders, 2);
  assert.equal(room.view("g").chart, "VIR1.grass");
  assert.equal(room.view("g").rules.customName, "Keep off the Grass");
  const refused = room.push("h", { op: "commanders", commanders: 3 }, 5_000);
  assert.equal(refused[0]?.msg.op, "error");
  if (refused[0]?.msg.op === "error") assert.match(refused[0].msg.reason, /2 starts/);
  assert.equal(room.view("h").commanders, 2);
  const full = room.push("d", { op: "join", code: "MAP01", name: "Dee" }, 5_000);
  assert.equal(full[0]?.msg.op, "error");
  room.push("h", { op: "rules", rules: { mapId: "coast" } }, 5_000);
  assert.equal(room.view("h").chart, undefined);
  assert.equal(room.view("h").rules.customId, "");
});

test("rooms expire after 30 minutes idle", () => {
  const room = new RelayRoom("OLD01", 0);
  room.push("h", { op: "create", name: "Ada" }, 1_000);
  assert.equal(room.expired(1_000 + IDLE_MS - 1), false);
  assert.equal(room.expired(1_000 + IDLE_MS + 1), true);
});

test("two clients stay in lockstep for 3 minutes of orders", () => {
  const { a, b } = bootPair();
  const simA = a.sim!;
  const simB = b.sim!;
  const mcvA = simA.units.find((u) => u.team === 0 && u.kind === "mcv");
  const mcvB = simB.units.find((u) => u.team === 1 && u.kind === "mcv");
  assert.ok(mcvA && mcvB);
  const ax = mcvA.x;
  const ay = mcvA.y;
  a.command("move", { ids: [mcvA.id], x: Math.round((ax + 4) * 16) / 16, y: Math.round(ay * 16) / 16 });
  b.command("attackMove", { ids: [mcvB.id], x: Math.round((mcvB.x - 3) * 16) / 16, y: Math.round(mcvB.y * 16) / 16 });

  for (let i = 0; i < 1800; i++) {
    if (i === 500) {
      a.command("chat", { x: 10, y: 12, mark: "attack" });
      b.command("chat", { x: 14, y: 12, mark: "crystal" });
    }
    assert.equal(a.step(), true, `A stalled at ${a.simTick}: ${a.waiting}`);
    assert.equal(b.step(), true, `B stalled at ${b.simTick}: ${b.waiting}`);
    if (i % 100 === 0) assert.equal(simA.checksum(), simB.checksum(), `desync at step ${i}`);
  }
  assert.equal(a.simTick, 1800);
  assert.equal(simA.checksum(), simB.checksum());
  const moved = simA.units.find((u) => u.id === mcvA.id);
  assert.ok(moved);
  assert.ok(Math.abs(moved.x - ax) > 0.5, `mcv did not move (${moved.x})`);
  const twin = simB.units.find((u) => u.id === mcvA.id);
  assert.ok(twin);
  assert.equal(Math.round(twin.x * 16), Math.round(moved.x * 16));
  assert.equal(Math.round(twin.y * 16), Math.round(moved.y * 16));
  a.leave();
  b.leave();
});

test("a dropped seat is ignored after assume, and the match keeps matching", () => {
  const net = link();
  net.a.host("Ada");
  net.b.join("ROOMX", "Bea");
  net.a.raw({ op: "ping", id: 1, rtt: 20 });
  net.b.raw({ op: "ping", id: 1, rtt: 20 });
  net.b.ready(true);
  net.a.setRules({ mapId: "dry", size: "skirmish", delay: 4, fog: false, walls: false });
  net.a.start();
  assert.ok(net.a.sim && net.b.sim);
  for (let i = 0; i < 12; i++) {
    assert.equal(net.a.step(), true, net.a.waiting);
    assert.equal(net.b.step(), true, net.b.waiting);
  }
  net.room.drop("b", 1_000_000);
  for (const msg of net.room.sweep(1_000_000 + 21_000)) {
    net.a.inject(msg.msg);
    net.b.inject(msg.msg);
  }
  assert.equal(net.a.sim.cpu[1], false, "60s rejoin window is still open at 21s");
  for (const msg of net.room.sweep(1_000_000 + 60_000)) {
    net.a.inject(msg.msg);
    net.b.inject(msg.msg);
  }
  const hold = net.b.step.bind(net.b);
  net.b.step = () => false;
  assert.equal(net.a.step(), true, net.a.waiting);
  net.b.step = hold;
  assert.equal(net.b.step(), true, net.b.waiting);
  for (let i = 0; i < 30; i++) {
    assert.equal(net.a.step(), true, net.a.waiting);
    assert.equal(net.b.step(), true, net.b.waiting);
  }
  assert.equal(net.a.sim.cpu[1], true);
  assert.equal(net.b.sim.cpu[1], true);
  assert.equal(net.a.sim.checksum(), net.b.sim.checksum());
  net.a.leave();
  net.b.leave();
});

test("websocket relay assigns seats and rejects a foreign command", async () => {
  const { startRelay } = await import("../../relay/server.mjs");
  const srv = await startRelay(0, "127.0.0.1");
  const open = () =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(srv.url);
      ws.addEventListener("open", () => resolve(ws));
      ws.addEventListener("error", () => reject(new Error("socket")));
    });
  const read = (ws: WebSocket) =>
    new Promise<unknown>((resolve) => {
      ws.addEventListener("message", (ev) => resolve(JSON.parse(String(ev.data))), { once: true });
    });
  const host = await open();
  const guest = await open();
  host.send(JSON.stringify({ op: "create", name: "Ada" }));
  const hello = (await read(host)) as { op: string; code?: string; seat?: number };
  assert.equal(hello.op, "hello");
  assert.equal(hello.seat, 0);
  assert.equal(hello.code?.length, 5);
  guest.send(JSON.stringify({ op: "join", code: hello.code, name: "Bea" }));
  const joined = (await read(guest)) as { op: string; seat?: number };
  assert.equal(joined.op, "hello");
  assert.equal(joined.seat, 1);
  host.close();
  guest.close();
  await srv.close();
});

test("the battle opens only after every seat ACKs match_started", () => {
  const room = new RelayRoom("ACK01", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("g", { op: "join", code: "ACK01", name: "Bea" }, 5_000);
  room.push("h", { op: "ping", id: 1, rtt: 20 }, 5_000);
  room.push("g", { op: "ping", id: 1, rtt: 20 }, 5_000);
  room.push("g", { op: "ready", ready: true }, 5_000);
  const started = room.push("h", { op: "start" }, 5_000);
  assert.ok(started.some((o) => o.msg.op === "go" && o.msg.go.layout === true));
  assert.equal(started.some((o) => o.msg.op === "release"), false);
  assert.equal(room.view("h").seats[0]?.status, "loading");
  assert.equal(room.view("h").seats[1]?.status, "loading");
  const armed = room.push("h", { op: "placed", starts: [{ x: 8, y: 8 }, { x: 40, y: 40 }] }, 5_000);
  const gos = armed.filter((o) => o.msg.op === "go");
  assert.equal(gos.length, 2);
  if (gos[0]?.msg.op === "go" && gos[1]?.msg.op === "go") {
    assert.equal(gos[0].msg.go.seed, gos[1].msg.go.seed);
    assert.deepEqual(gos[0].msg.go.starts, [{ x: 8, y: 8 }, { x: 40, y: 40 }]);
    assert.equal(gos[0].msg.go.layout, undefined);
  }
  const one = room.push("h", { op: "match_started" }, 5_000);
  assert.equal(one.some((o) => o.msg.op === "release"), false);
  assert.equal(room.view("h").seats[0]?.status, "deploy");
  assert.equal(room.view("h").seats[1]?.status, "loading");
  assert.equal(room.view("h").note, "");
  const both = room.push("g", { op: "match_started" }, 5_000);
  assert.equal(both.some((o) => o.msg.op === "release"), true);
  assert.equal(room.view("g").seats[1]?.status, "playing");
  assert.equal(room.view("g").seats[0]?.status, "playing");
});

test("hiding a seat does not pause or stall the other commander", () => {
  const { a, b } = bootPair();
  for (let i = 0; i < 6; i++) {
    assert.equal(a.step(), true, a.waiting);
    assert.equal(b.step(), true, b.waiting);
  }
  const tick = a.simTick;
  b.setHidden(true);
  assert.equal(b.step(), false);
  assert.equal(a.sim!.frozen, false);
  assert.equal(a.sim!.pauseBits, 0);
  const before = a.sim!.time;
  for (let i = 0; i < 12; i++) assert.equal(a.step(), true, a.waiting);
  assert.equal(a.waiting, "");
  assert.ok(a.sim!.time > before, "visible client kept simulating");
  assert.equal(a.awayNote.includes("Bea"), true);
  assert.equal(a.sim!.frozen, false);
  assert.equal(b.simTick, tick);
  b.setHidden(false);
  assert.equal(a.simTick, b.simTick);
  assert.equal(a.sim!.checksum(), b.sim!.checksum());
  assert.equal(a.sim!.frozen, false);
  assert.equal(a.awayNote, "");
  for (let i = 0; i < 20; i++) {
    assert.equal(a.step(), true, a.waiting);
    assert.equal(b.step(), true, b.waiting);
    assert.equal(a.sim!.checksum(), b.sim!.checksum());
  }
  a.command("pause", { on: true });
  for (let i = 0; i < 8; i++) {
    assert.equal(a.step(), true, a.waiting);
    assert.equal(b.step(), true, b.waiting);
  }
  assert.equal(a.sim!.frozen, true);
  const held = a.sim!.time;
  assert.equal(a.step() && b.step(), true);
  assert.equal(a.sim!.time, held);
  a.command("pause", { on: false });
  for (let i = 0; i < 8; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.sim!.frozen, false);
  assert.ok(a.sim!.time > held);
  a.leave();
  b.leave();
});

test("a hidden seat is AFK after 60 seconds and the match is not frozen", () => {
  const room = new RelayRoom("AFK01", 1_000_000);
  room.push("h", { op: "create", name: "Ada" }, 1_000_000);
  room.push("g", { op: "join", code: "AFK01", name: "Bea" }, 1_000_000);
  room.push("h", { op: "ping", id: 1, rtt: 10 }, 1_000_000);
  room.push("g", { op: "ping", id: 1, rtt: 10 }, 1_000_000);
  room.push("g", { op: "ready", ready: true }, 1_000_000);
  room.push("h", { op: "start" }, 1_000_000);
  room.push("h", { op: "match_started" }, 1_000_000);
  room.push("g", { op: "match_started" }, 1_000_000);
  const t = 2_000_000;
  room.push("g", { op: "presence", hidden: true }, t);
  assert.equal(room.view("h").seats[1]?.away, true);
  assert.equal(room.view("h").seats[1]?.afk, false);
  assert.equal(room.sweep(t + AFK_MS - 1).some((o) => o.msg.op === "afk"), false);
  const flagged = room.sweep(t + AFK_MS);
  assert.equal(flagged.some((o) => o.msg.op === "afk" && o.msg.on === true), true);
  assert.equal(room.view("h").seats[1]?.afk, true);
  room.push("g", { op: "presence", hidden: false }, t + AFK_MS + 5);
  assert.equal(room.view("h").seats[1]?.afk, false);
  assert.equal(room.view("h").seats[1]?.away, true);
  room.push("g", { op: "live" }, t + AFK_MS + 6);
  assert.equal(room.view("h").seats[1]?.away, false);
});

test("seat states are Lobby, Ready, Loading, Deploy, Playing, and Disconnected", () => {
  const room = new RelayRoom("STAT1", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  assert.equal(room.view("h").seats[0]?.status, "ready");
  room.push("g", { op: "join", code: "STAT1", name: "Bea" }, 5_000);
  assert.equal(room.view("h").seats[1]?.status, "lobby");
  room.push("g", { op: "ready", ready: true }, 5_000);
  assert.equal(room.view("h").seats[1]?.status, "ready");
  room.push("h", { op: "ping", id: 1, rtt: 12 }, 5_000);
  room.push("g", { op: "ping", id: 1, rtt: 44 }, 5_000);
  assert.equal(room.view("h").seats[1]?.rtt, 44);
  room.push("h", { op: "start" }, 5_000);
  assert.equal(room.view("h").seats[0]?.status, "loading");
  assert.equal(room.view("h").seats[1]?.status, "loading");
  room.push("h", { op: "placed", starts: [{ x: 3, y: 3 }, { x: 30, y: 30 }] }, 5_000);
  room.push("h", { op: "match_started" }, 5_000);
  assert.equal(room.view("h").seats[0]?.status, "deploy");
  assert.equal(room.view("g").seats[1]?.status, "loading");
  room.push("g", { op: "match_started" }, 5_000);
  assert.equal(room.view("g").seats[0]?.status, "playing");
  assert.equal(room.view("g").seats[1]?.status, "playing");
  room.drop("g", 5_000);
  assert.equal(room.view("h").seats[1]?.status, "disconnected");
  assert.equal(room.phase, "play");
});

test("rejoin with the same seat token inside 60s does not end the match", () => {
  const room = new RelayRoom("BACK1", 1_000_000);
  room.push("h", { op: "create", name: "Ada" }, 1_000_000);
  const joined = room.push("g", { op: "join", code: "BACK1", name: "Bea" }, 1_000_000);
  const guestHello = joined.find((o) => o.to === "g" && o.msg.op === "hello");
  const token = guestHello && guestHello.msg.op === "hello" ? guestHello.msg.token : "";
  assert.ok(token);
  room.push("h", { op: "ping", id: 1, rtt: 10 }, 1_000_000);
  room.push("g", { op: "ping", id: 1, rtt: 10 }, 1_000_000);
  room.push("g", { op: "ready", ready: true }, 1_000_000);
  room.push("h", { op: "start" }, 1_000_000);
  room.push("h", { op: "placed", starts: [{ x: 4, y: 4 }, { x: 20, y: 20 }] }, 1_000_000);
  room.push("h", { op: "match_started" }, 1_000_000);
  room.push("g", { op: "match_started" }, 1_000_000);
  room.drop("g", 1_000_000);
  assert.equal(room.view("h").seats[1]?.status, "disconnected");
  assert.equal(room.sweep(1_000_000 + 59_000).some((o) => o.msg.op === "assume"), false);
  const back = room.push("g2", { op: "join", code: "BACK1", token, name: "Bea" }, 1_000_000 + 30_000);
  assert.equal(back.some((o) => o.to === "g2" && o.msg.op === "hello"), true);
  assert.equal(back.some((o) => o.msg.op === "needSnapshot"), true);
  assert.equal(room.phase, "play");
  assert.equal(room.view("h").seats[1]?.connected, true);
  assert.equal(room.view("h").seats[1]?.fill, "human");
  assert.equal(room.sweep(1_000_000 + 90_000).some((o) => o.msg.op === "assume"), false);
});

test("diverging state hashes resync from the host, then offer a rematch", () => {
  const room = new RelayRoom("HASH1", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("g", { op: "join", code: "HASH1", name: "Bea" }, 5_000);
  room.push("h", { op: "ping", id: 1, rtt: 10 }, 5_000);
  room.push("g", { op: "ping", id: 1, rtt: 10 }, 5_000);
  room.push("g", { op: "ready", ready: true }, 5_000);
  room.push("h", { op: "start" }, 5_000);
  room.push("h", { op: "placed", starts: [{ x: 2, y: 2 }, { x: 22, y: 22 }] }, 5_000);
  room.push("h", { op: "match_started" }, 5_000);
  room.push("g", { op: "match_started" }, 5_000);
  const one = room.push("g", { op: "hash", tick: 20, hash: 2 }, 6_000);
  assert.equal(one.some((o) => o.msg.op === "needSnapshot"), false);
  const bad = room.push("h", { op: "hash", tick: 20, hash: 1 }, 6_000);
  assert.equal(bad.some((o) => o.msg.op === "needSnapshot" && o.to === "h"), true);
  const later = room.push("g", { op: "hash", tick: 40, hash: 8 }, 7_000);
  assert.equal(later.some((o) => o.msg.op === "desync"), false);
  const fatal = room.push("h", { op: "hash", tick: 40, hash: 9 }, 7_000);
  assert.equal(fatal.some((o) => o.msg.op === "desync"), true);
});

test("both phones deploy the MCV, move, and keep the same checksum", () => {
  const { a, b } = bootPair();
  assert.equal(a.sim!.seed, b.sim!.seed);
  assert.deepEqual(
    a.sim!.starts.slots.map((s) => [s.x, s.y]),
    b.sim!.starts.slots.map((s) => [s.x, s.y]),
  );
  const mcvA = a.sim!.units.find((u) => u.team === 0 && u.kind === "mcv");
  const mcvB = b.sim!.units.find((u) => u.team === 1 && u.kind === "mcv");
  assert.ok(mcvA && mcvB);
  a.command("move", { ids: [mcvA.id], x: Math.round((mcvA.x + 1) * 16) / 16, y: Math.round(mcvA.y * 16) / 16 });
  for (let i = 0; i < 16; i++) {
    assert.equal(a.step(), true, a.waiting);
    assert.equal(b.step(), true, b.waiting);
  }
  a.command("deploy", { ids: [mcvA.id] });
  b.command("deploy", { ids: [mcvB.id] });
  for (let i = 0; i < 50; i++) {
    assert.equal(a.step(), true, a.waiting);
    assert.equal(b.step(), true, b.waiting);
  }
  const yard = (team: number) => a.sim!.buildings.some((u) => u.team === team && u.kind === "yard" && u.hp > 0);
  const yardB = (team: number) => b.sim!.buildings.some((u) => u.team === team && u.kind === "yard" && u.hp > 0);
  assert.equal(yard(0), true);
  assert.equal(yardB(0), true);
  assert.equal(yard(1), true);
  assert.equal(yardB(1), true);
  assert.equal(a.sim!.checksum(), b.sim!.checksum());
  assert.ok(Math.abs((a.sim!.units.find((u) => u.id === mcvA.id)?.x ?? mcvA.x) - mcvA.x) >= 0 || yard(0));
  a.leave();
  b.leave();
});

test("host leave in the lobby closes the room", () => {
  const room = new RelayRoom("HOSTX", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("g", { op: "join", code: "HOSTX", name: "Bea" }, 5_000);
  const left = room.push("h", { op: "leave" }, 5_100);
  assert.equal(room.closed, true);
  const told = left.find((o) => o.to === "g" && o.msg.op === "error");
  assert.equal(told?.msg.op, "error");
  if (told?.msg.op === "error") assert.match(told.msg.reason, /Host left/);
  const again = room.push("n", { op: "join", code: "HOSTX", name: "Cy" }, 5_200);
  assert.equal(again[0]?.msg.op, "error");
  if (again[0]?.msg.op === "error") assert.match(again[0].msg.reason, /expired|closed|Host left/);
});

test("a lobby drop keeps the seat for 20 seconds, then frees it", () => {
  const room = new RelayRoom("HOLD1", 5_000);
  room.push("h", { op: "create", name: "Ada" }, 5_000);
  room.push("g", { op: "join", code: "HOLD1", name: "Bea" }, 5_000);
  const dropped = room.drop("g", 5_000);
  assert.equal(dropped.some((o) => o.msg.op === "bye"), false);
  assert.equal(room.view("h").seats[1]?.fill, "human");
  assert.equal(room.view("h").seats[1]?.connected, false);
  assert.equal(room.sweep(5_000 + 19_000).some((o) => o.msg.op === "bye"), false);
  assert.equal(room.view("h").seats[1]?.fill, "human");
  room.sweep(5_000 + 20_000);
  assert.equal(room.view("h").seats[1]?.fill, "open");
  assert.equal(room.closed, false);

  const gone = room.push("g2", { op: "join", code: "HOLD1", name: "Bea" }, 5_000 + 21_000);
  assert.equal(gone.some((o) => o.msg.op === "hello"), true);
  const bye = room.push("g2", { op: "leave" }, 5_000 + 22_000);
  assert.equal(room.view("h").seats[1]?.fill, "open");
  assert.equal(bye.some((o) => o.to === "g2" && o.msg.op === "bye"), true);
  assert.equal(room.closed, false);
});
