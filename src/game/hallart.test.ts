import assert from "node:assert/strict";
import test from "node:test";
import { HALL_SHEET } from "./hallart.ts";

/** These fourteen used to share seven images. Each name must be its own file. */
const SHARED_BEFORE = [
  ["power", "advpower"],
  ["supply", "silo"],
  ["barracks", "stealth"],
  ["factory", "dock", "helipad"],
  ["tower", "aa", "radar"],
] as const;

test("every structure that shared a sheet now points at its own file", () => {
  const names = Object.values(HALL_SHEET);
  assert.equal(new Set(names).size, names.length, "two buildings still share a png name");
  for (const group of SHARED_BEFORE) {
    const files = group.map((id) => HALL_SHEET[id]);
    assert.equal(new Set(files).size, group.length, group.join(" "));
  }
  for (const file of ["helipad", "dock", "aa", "radar", "advpower", "silo", "stealth", "wall", "gate", "sandbag"]) {
    assert.equal(HALL_SHEET[file as keyof typeof HALL_SHEET], file);
  }
});
