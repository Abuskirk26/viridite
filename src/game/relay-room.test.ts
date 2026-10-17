import assert from "node:assert/strict";
import test from "node:test";
import { RelayRoom } from "./relay-room.ts";

test("a room dump restores seats, code, and phase", () => {
  const room = new RelayRoom("ABCDE", 1_000);
  room.push("host", { op: "create", name: "Ada" }, 1_000);
  room.push("guest", { op: "join", code: "ABCDE", name: "Bea" }, 1_100);
  const next = RelayRoom.restore(JSON.parse(JSON.stringify(room.dump())));
  assert.ok(next);
  assert.equal(next.code, "ABCDE");
  assert.equal(next.phase, "lobby");
  const again = next.push("guest", { op: "ready", ready: true }, 1_200);
  assert.ok(again.some((o) => o.msg.op === "lobby"));
});
