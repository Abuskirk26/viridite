import assert from "node:assert/strict";
import test from "node:test";
import { TILE_BRIDGE, TILE_CLIFF, TILE_DEEP, TILE_RAMP, TILE_ROCK, TILE_SHORE, TILE_VALLEY } from "./data.ts";
import { pack, readShare, shareCode, unpack } from "./custom.ts";
import {
  audit,
  cloneDoc,
  copyRect,
  docFromField,
  emptyDoc,
  fairnessNotes,
  islandHoppers,
  mirrorPoints,
  offersNavy,
  pasteClip,
  resizeDoc,
  sharesGround,
  snapBridge,
  stamp,
  stampSymmetric,
} from "./editor.ts";
import { FEATURED, buildFeatured } from "./featured.ts";
import { TEMPLATES, buildTemplate } from "./templates.ts";

test("every classic template is playable and Four Isles leads the list", () => {
  assert.equal(TEMPLATES[0]?.id, "fourisles");
  assert.ok(TEMPLATES.length >= 24);
  for (const card of TEMPLATES) {
    const doc = buildTemplate(card.id);
    const notes = audit(doc);
    assert.deepEqual(notes, [], `${card.name}: ${notes.join(" ")}`);
    assert.ok(doc.starts.length >= 2 && doc.starts.length <= 4, card.name);
    const nudged = buildTemplate(card.id, 3);
    assert.deepEqual(
      nudged.starts.map((s) => [s.x, s.y]),
      doc.starts.map((s) => [s.x, s.y]),
      `${card.name} nudge moved a start`,
    );
    assert.deepEqual(nudged.spans, doc.spans, `${card.name} nudge moved a bridge`);
  }
});

test("island hoppers keeps one near bridge and rich far crystal", () => {
  const doc = buildTemplate("hoppers");
  assert.equal(doc.w, 96);
  assert.equal(doc.theater, "snow");
  assert.equal(doc.spans.length, 1);
  let rich = 0;
  for (let i = 0; i < doc.crystal.length; i++) if (doc.crystal[i]! >= 1200) rich++;
  assert.ok(rich > 0);
});

test("island hoppers is saveable and not a copied layout file", () => {
  const doc = islandHoppers(64, "Island Hoppers", "snow");
  assert.equal(doc.starts.length, 4);
  assert.deepEqual(audit(doc), []);
  const bridges = doc.terrain.filter((t) => t === TILE_BRIDGE).length;
  assert.ok(bridges >= 6 && bridges <= 18);
  const back = unpack(pack(doc));
  assert.ok(back);
  assert.equal(back!.starts.length, 4);
  assert.equal(readShare(shareCode(doc))?.name, "Island Hoppers");
});

test("blank sand still reaches the starter crystal", () => {
  const doc = emptyDoc(64, "Blank", "desert");
  assert.deepEqual(audit(doc), []);
  const back = unpack(pack(doc));
  assert.equal(back?.w, 64);
  assert.equal(back?.h, 64);
  assert.equal(readShare(shareCode(islandHoppers(64, "Old", "snow")))?.w, 64);
});

test("starts cannot sit on water or within 8 tiles", () => {
  const doc = emptyDoc(64, "Blank", "desert");
  stamp(doc, "deep", [{ x: 40, y: 40 }], 1);
  assert.equal(stamp(doc, "start", [{ x: 40, y: 40 }], 1), false);
  const home = doc.starts[0]!;
  assert.equal(stamp(doc, "start", [{ x: Math.floor(home.x) + 3, y: Math.floor(home.y) }], 1), false);
});

test("water drag paints a shore rim and a ridge drops a south cliff", () => {
  const doc = emptyDoc(64, "Blank", "temperate");
  assert.equal(stamp(doc, "deep", [{ x: 30, y: 30 }], 3), true);
  assert.equal(doc.terrain[28 * 64 + 30], TILE_SHORE);
  const before = cloneDoc(doc);
  assert.equal(stamp(doc, "mountain", [{ x: 40, y: 40 }], 1), true);
  assert.equal(doc.terrain[41 * 64 + 40], TILE_CLIFF);
  doc.terrain.set(before.terrain);
  assert.equal(doc.terrain[41 * 64 + 40], before.terrain[41 * 64 + 40]);
});

test("a bridge refuses a wide lake and accepts a 4-tile gap", () => {
  const doc = emptyDoc(64, "Blank", "desert");
  stamp(doc, "deep", [{ x: 20, y: 30 }, { x: 32, y: 30 }], 1);
  for (let x = 24; x <= 36; x++) stamp(doc, "deep", [{ x, y: 30 }], 1);
  assert.equal(snapBridge(doc, 30, 30), false);
  const narrow = emptyDoc(64, "Gap", "desert");
  for (let x = 28; x <= 31; x++) narrow.terrain[30 * 64 + x] = 6;
  narrow.terrain[30 * 64 + 27] = TILE_SHORE;
  narrow.terrain[30 * 64 + 32] = TILE_SHORE;
  assert.equal(snapBridge(narrow, 29, 30), true);
  assert.equal(narrow.terrain[30 * 64 + 29], TILE_BRIDGE);
  assert.equal(narrow.spans.length, 1);
});

test("symmetry mirrors rich fields and a 2v2 start, and rot 4 stays off a rectangle", () => {
  const doc = emptyDoc(64, "Pass", "temperate");
  doc.starts = [];
  assert.equal(stampSymmetric(doc, "rich", [{ x: 16, y: 16 }], 1, "rot4"), true);
  assert.equal(doc.crystal[16 * 64 + 16], 1400);
  assert.equal(doc.crystal[16 * 64 + (63 - 16)], 1400);
  assert.equal(doc.crystal[(63 - 16) * 64 + 16], 1400);
  assert.equal(doc.crystal[(63 - 16) * 64 + (63 - 16)], 1400);
  assert.equal(stampSymmetric(doc, "start", [{ x: 12, y: 12 }], 1, "rot4"), true);
  assert.equal(doc.starts.length, 4);
  assert.equal(stampSymmetric(doc, "mountain", [{ x: 30, y: 32 }], 1, "x"), true);
  assert.equal(doc.terrain[32 * 64 + 30], TILE_ROCK);
  assert.equal(doc.terrain[32 * 64 + (63 - 30)], TILE_ROCK);
  const wide = emptyDoc(64, "Wide", "desert", "", 96);
  assert.deepEqual(mirrorPoints(wide.w, wide.h, 10, 10, "rot4"), []);
  assert.equal(mirrorPoints(64, 64, 10, 20, "x").length, 1);
});

test("copy and paste keeps a rich patch, and resize keeps the center", () => {
  const doc = emptyDoc(64, "Blank", "desert");
  stamp(doc, "rich", [{ x: 20, y: 20 }], 1);
  const clip = copyRect(doc, 19, 19, 21, 21);
  assert.ok(clip);
  assert.equal(pasteClip(doc, clip!, 40, 40, "off"), true);
  assert.equal(doc.crystal[41 * 64 + 41], 1400);
  const grown = resizeDoc(doc, 72, 72);
  assert.equal(grown.w, 72);
  assert.equal(grown.h, 72);
  assert.ok(grown.starts.length >= 2);
  const slim = resizeDoc(emptyDoc(64, "A", "snow"), 64, 126);
  assert.equal(slim.w, 64);
  assert.equal(slim.h, 126);
});

test("the current skirmish field opens as an editor map", () => {
  const doc = docFromField("dry", "skirmish", "Dry Basin");
  assert.equal(doc.w, 64);
  assert.equal(doc.h, 64);
  assert.ok(doc.starts.length >= 2);
  assert.equal(doc.terrain.length, 64 * 64);
});

test("featured pack is fair, teachable, and remixes as a new map", () => {
  assert.equal(FEATURED.length, 6);
  assert.deepEqual(
    FEATURED.map((card) => card.name),
    ["Twin Crystal", "Mountain Pass", "Bridge War", "Island Chain", "Fortress Keep", "Mayhem Free-For-All"],
  );
  for (const card of FEATURED) {
    const doc = buildFeatured(card.id);
    assert.equal(doc.w, card.w);
    assert.equal(doc.h, card.h);
    assert.deepEqual(audit(doc), [], `${card.name}: ${audit(doc).join(" ")}`);
    assert.deepEqual(fairnessNotes(doc), [], `${card.name} purse`);
    assert.equal(offersNavy(doc), card.naval, card.name);
    assert.equal(doc.id, "");
    const copy = cloneDoc(doc);
    copy.id = "";
    const back = unpack(pack(copy));
    assert.equal(back?.starts.length, doc.starts.length, card.name);
  }
  const twin = buildFeatured("twin");
  assert.equal(twin.starts.length, 2);
  assert.equal(twin.terrain.includes(TILE_DEEP), false);
  assert.ok(twin.crystal.some((n) => n >= 1200));

  const pass = buildFeatured("pass");
  assert.equal(pass.terrain[32 * pass.w + 31], TILE_CLIFF);
  assert.equal(pass.terrain[13 * pass.w + 31], TILE_RAMP);
  const west = pass.starts[0]!;
  const east = pass.starts[1]!;
  assert.equal(sharesGround(pass, Math.floor(west.x), Math.floor(west.y), Math.floor(east.x), Math.floor(east.y)), true);

  const war = buildFeatured("bridgewar");
  assert.equal(war.spans.length, 2);
  assert.ok(war.terrain.includes(TILE_BRIDGE));
  assert.equal(sharesGround(war, Math.floor(war.starts[0]!.x), Math.floor(war.starts[0]!.y), Math.floor(war.starts[1]!.x), Math.floor(war.starts[1]!.y)), true);

  const chain = buildFeatured("chain");
  assert.equal(chain.docks.length, 2);
  assert.equal(chain.terrain.includes(TILE_BRIDGE), false);
  assert.equal(sharesGround(chain, Math.floor(chain.starts[0]!.x), Math.floor(chain.starts[0]!.y), Math.floor(chain.starts[1]!.x), Math.floor(chain.starts[1]!.y)), false);
  for (const dock of chain.docks) {
    assert.equal(chain.terrain[dock.ty * chain.w + dock.tx], TILE_SHORE);
  }

  const keep = buildFeatured("keep");
  assert.equal(keep.terrain[32 * keep.w + 8], TILE_ROCK);
  assert.equal(keep.terrain[31 * keep.w + 22], TILE_VALLEY);

  const brawl = buildFeatured("brawl");
  assert.equal(brawl.starts.length, 4);
  assert.ok((brawl.crystal[32 * brawl.w + 32] ?? 0) >= 1200);
});

