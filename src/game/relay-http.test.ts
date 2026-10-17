import assert from "node:assert/strict";
import test from "node:test";
import { RELAY_HEALTH, relayHttp } from "../../server/relay-http.ts";

async function post(client: string, msg: Record<string, unknown> | null) {
  const res = await relayHttp(
    new Request("http://play.test/viridite-relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(msg ? { client, msg } : { client }),
    }),
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /json/);
  const data = (await res.json()) as { msgs: { op: string; reason?: string; code?: string; seat?: number; lobby?: { seats: { name: string; fill: string }[] } }[] };
  return data.msgs;
}

test("relay health is plain text, not the app page", async () => {
  const res = await relayHttp(new Request("http://play.test/viridite-relay", { headers: { accept: "text/plain" } }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/plain/);
  assert.equal(await res.text(), RELAY_HEALTH);
});

test("two phones share a room, and the failures stay distinct", async () => {
  const created = await post("host-phone-1", { op: "create", name: "Ada" });
  const hello = created.find((m) => m.op === "hello");
  assert.ok(hello?.code);
  assert.equal(hello?.seat, 0);

  const joined = await post("guest-phone-2", { op: "join", code: hello.code, name: "Bea" });
  assert.equal(joined.find((m) => m.op === "hello")?.seat, 1);
  const lobby = joined.find((m) => m.op === "lobby");
  assert.deepEqual(
    lobby?.lobby?.seats.filter((s) => s.fill === "human").map((s) => s.name),
    ["Ada", "Bea"],
  );

  const missing = await post("guest-phone-3", { op: "join", code: "ZZZZZ", name: "Cy" });
  assert.equal(missing.find((m) => m.op === "error")?.reason, "No such room");

  const full = await post("guest-phone-4", { op: "join", code: hello.code, name: "Dee" });
  assert.equal(full.find((m) => m.op === "error")?.reason, "Room full");

  await post("host-phone-1", { op: "ping", id: 1, rtt: 20 });
  await post("guest-phone-2", { op: "ping", id: 1, rtt: 20 });
  await post("guest-phone-2", { op: "ready", ready: true });
  const started = await post("host-phone-1", { op: "start" });
  assert.ok(started.some((m) => m.op === "go" || m.op === "lobby"));
  const late = await post("guest-phone-5", { op: "join", code: hello.code, name: "Eve" });
  assert.equal(late.find((m) => m.op === "error")?.reason, "Match already started");
});
