import assert from "node:assert/strict";
import test from "node:test";
import { TILE_BRIDGE, TILE_CLEAR, TILE_DEEP, TILE_ROAD } from "./data.ts";
import { paintRoadNet } from "./roads.ts";
import { terrainFieldAlive, writeTerrain } from "./tileset.ts";
import {
  clampCamera,
  hallDrawMul,
  openingZoom,
  seekZoom,
  setViewPitch,
  stepZoom,
  tacticalHome,
  tileSpan,
  troopScale,
  unitPickRadius,
  unitPictureWidth,
  unitWorldSpan,
  viewPitch,
  zoomLimits,
  type Camera,
} from "./view.ts";

const phone = { w: 915, h: 412 };
const desk = { w: 1440, h: 900 };
const portrait = { w: 412, h: 915 };

test("battle zoom is a tile span, the same pixels per tile on every screen and map", () => {
  setViewPitch(0.68);
  const phoneLimits = zoomLimits(phone, 64, 64);
  const deskLimits = zoomLimits(desk, 64, 64);
  const wideLimits = zoomLimits(phone, 96, 96);
  const warLimits = zoomLimits(phone, 128, 128);
  assert.ok(Math.abs(phone.w / phoneLimits.min - 20) < 0.05, `phone zoom-out tiles ${phone.w / phoneLimits.min}`);
  assert.ok(Math.abs(phone.w / phoneLimits.max - 10) < 0.05, `phone zoom-in tiles ${phone.w / phoneLimits.max}`);
  assert.ok(Math.abs(portrait.w / zoomLimits(portrait, 64, 64).min - 14) < 0.05);
  assert.ok(Math.abs(portrait.w / zoomLimits(portrait, 64, 64).max - 10) < 0.05);
  assert.ok(Math.abs(phoneLimits.min - deskLimits.min) < 0.02, "soldier px/tile matches desktop");
  assert.ok(Math.abs(phoneLimits.max - deskLimits.max) < 0.02);
  assert.ok(desk.w / deskLimits.min > 28, "desktop sees more tiles, not a smaller soldier");
  assert.equal(phoneLimits.min, wideLimits.min);
  assert.equal(phoneLimits.max, warLimits.max);
  assert.ok(phone.w / phoneLimits.min < 30, "zoom-out is not the whole map");
  const homeTiles = phone.w / tacticalHome(phone);
  const outTiles = tileSpan(phone, "out");
  const inTiles = tileSpan(phone, "in");
  assert.ok(Math.abs(homeTiles - (inTiles + 0.7 * (outTiles - inTiles))) < 0.05);
  assert.equal(openingZoom("continent"), openingZoom("skirmish"));
  assert.equal(openingZoom("warzone"), tacticalHome({ w: 915, h: 412 }));
});

test("the camera stays inside the map at max zoom-out", () => {
  setViewPitch(0.68);
  const cam: Camera = { x: 0, y: 0, zoom: zoomLimits(phone, 96, 96).min };
  clampCamera(cam, 96, 96, phone);
  const halfW = phone.w / (2 * cam.zoom);
  const halfH = phone.h / (2 * cam.zoom * viewPitch());
  assert.ok(cam.x - halfW >= -0.02);
  assert.ok(cam.x + halfW <= 96.02);
  assert.ok(cam.y - halfH >= -0.02);
  assert.ok(cam.y + halfH <= 96.02);
  assert.ok(halfW * 2 < 96);
});

test("pinch and wheel ease onto the limit and do not bounce past it", () => {
  const view = phone;
  const limits = zoomLimits(view, 64, 64);
  const cam: Camera = { x: 32, y: 32, zoom: limits.min + 4 };
  seekZoom(cam, 400, 200, view, 0.2, 64, 64);
  assert.equal(cam.aim, limits.min);
  assert.ok(cam.zoom > limits.min, "does not snap");
  const seen = [cam.zoom];
  for (let i = 0; i < 40; i++) {
    stepZoom(cam, 1 / 60, view, 64, 64);
    seen.push(cam.zoom);
    assert.ok(cam.zoom >= limits.min - 0.001);
  }
  assert.ok(cam.zoom - limits.min < 0.05);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i]! <= seen[i - 1]! + 0.001);
  const held = cam.zoom;
  seekZoom(cam, 400, 200, view, 0.5, 64, 64);
  stepZoom(cam, 1 / 60, view, 64, 64);
  assert.ok(Math.abs(cam.zoom - held) < 0.02, "extra zoom-out does not jitter");
  seekZoom(cam, 400, 200, view, 1.08, 64, 64);
  assert.ok(cam.zoom > limits.min);
  assert.ok(cam.zoom <= limits.max);
});

test("one scale table: infantry smaller than tanks, tanks smaller than halls, same on every map", () => {
  assert.equal(troopScale(30), 1);
  assert.equal(troopScale(90), 1);
  assert.equal(unitWorldSpan("rifle"), 0.4);
  assert.equal(unitWorldSpan("scout"), 0.8);
  assert.equal(unitWorldSpan("tank"), 1.1);
  assert.equal(unitWorldSpan("artillery"), 1.2);
  assert.equal(unitWorldSpan("attackheli"), 1.15);
  const barracks = 2 * hallDrawMul("barracks");
  assert.ok(unitWorldSpan("rifle") < unitWorldSpan("tank"));
  assert.ok(unitWorldSpan("tank") < barracks);
  const z = zoomLimits(phone, 64, 64).min;
  const z2 = zoomLimits(phone, 96, 96).min;
  assert.equal(unitWorldSpan("rifle") * z, unitWorldSpan("rifle") * z2);
  assert.ok(unitWorldSpan("rifle") * z < unitWorldSpan("tank") * z);
  assert.ok(unitWorldSpan("tank") * z < barracks * z);
  const home = tacticalHome(phone);
  assert.ok(unitPickRadius("rifle", home) * home * 2 >= 44 - 0.01);
  assert.ok(unitPickRadius("tank", home) * home * 2 >= 44 - 0.01);
  assert.ok(unitPickRadius("artillery", home) * home * 2 >= 44 - 0.01);
  const rifleH = unitPictureWidth("rifle", 963 / 431) * (963 / 431);
  const tankW = unitPictureWidth("tank", 655 / 952);
  const tankH = tankW * (655 / 952);
  const artW = unitPictureWidth("artillery", 971 / 1279);
  const barracksW = 2 * hallDrawMul("barracks");
  assert.ok(Math.abs(rifleH - 0.4) < 0.02, `rifle height ${rifleH}`);
  assert.ok(tankW >= 1 && tankW <= 1.2, `tank width ${tankW}`);
  assert.ok(artW >= 1 && artW <= 1.2, `artillery width ${artW}`);
  assert.ok(rifleH < tankH, "a soldier is shorter than a tank");
  assert.ok(tankW > unitPictureWidth("rifle", 963 / 431) * 3, "a tank is much wider than a soldier");
  assert.ok(tankW < barracksW, "a tank is narrower than a barracks");
  assert.ok(tankH < barracksW * (911 / 770), "a tank is shorter than a barracks");
});

test("a terrain sheet has land or water, and a flat navy fill does not", () => {
  const gw = 8;
  const gh = 8;
  const terrain = new Uint8Array(gw * gh);
  for (let i = 0; i < terrain.length; i++) terrain[i] = i < 32 ? TILE_CLEAR : TILE_DEEP;
  const w = 32;
  const h = 32;
  const pixels = new Uint8ClampedArray(w * h * 4);
  writeTerrain(pixels, w, h, terrain, gw, gh, "temperate");
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = pixels[i * 4] ?? 0;
    rgb[i * 3 + 1] = pixels[i * 4 + 1] ?? 0;
    rgb[i * 3 + 2] = pixels[i * 4 + 2] ?? 0;
  }
  assert.equal(terrainFieldAlive(rgb), true);
  const blank = new Uint8Array(24 * 24 * 3);
  for (let i = 0; i < 24 * 24; i++) {
    blank[i * 3] = 10;
    blank[i * 3 + 1] = 26;
    blank[i * 3 + 2] = 34;
  }
  assert.equal(terrainFieldAlive(blank), false);
});

type RoadOp = {
  op: "stroke" | "fill" | "fillRect" | "dash";
  lineWidth: number;
  strokeStyle: string;
  fillStyle: string;
  dash: number[];
  lineTo: number;
  arcs: number;
  maxR: number;
};

function roadCtx(): { ctx: CanvasRenderingContext2D; ops: RoadOp[] } {
  const ops: RoadOp[] = [];
  let lineTo = 0;
  let arcs = 0;
  let maxR = 0;
  const ctx = {
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    strokeStyle: "",
    fillStyle: "",
    imageSmoothingEnabled: true,
    setLineDash(d: number[]) {
      ops.push({
        op: "dash",
        lineWidth: ctx.lineWidth,
        strokeStyle: String(ctx.strokeStyle),
        fillStyle: String(ctx.fillStyle),
        dash: d.slice(),
        lineTo,
        arcs,
        maxR,
      });
    },
    beginPath() {
      lineTo = 0;
      arcs = 0;
      maxR = 0;
    },
    moveTo() {},
    lineTo() {
      lineTo++;
    },
    rect() {},
    clip() {},
    arc(_x: number, _y: number, r?: number) {
      arcs++;
      if (typeof r === "number" && r > maxR) maxR = r;
    },
    stroke() {
      ops.push({
        op: "stroke",
        lineWidth: ctx.lineWidth,
        strokeStyle: String(ctx.strokeStyle),
        fillStyle: String(ctx.fillStyle),
        dash: [],
        lineTo,
        arcs,
        maxR,
      });
    },
    fill() {
      ops.push({
        op: "fill",
        lineWidth: ctx.lineWidth,
        strokeStyle: String(ctx.strokeStyle),
        fillStyle: String(ctx.fillStyle),
        dash: [],
        lineTo,
        arcs,
        maxR,
      });
    },
    fillRect() {
      ops.push({
        op: "fillRect",
        lineWidth: ctx.lineWidth,
        strokeStyle: String(ctx.strokeStyle),
        fillStyle: String(ctx.fillStyle),
        dash: [],
        lineTo,
        arcs,
        maxR,
      });
    },
    save() {},
    restore() {},
    setTransform() {},
    drawImage() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

function paintRoads(terrain: Uint8Array, show?: (x: number, y: number) => boolean): RoadOp[] {
  const { ctx, ops } = roadCtx();
  paintRoadNet(ctx, terrain, 16, 16, 0, 0, 15, 15, show);
  return ops;
}

function inkOf(style: string): { r: number; g: number; b: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(style.trim());
  if (hex) {
    const n = Number.parseInt(hex[1] ?? "", 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const short = /^#([0-9a-f]{3})$/i.exec(style.trim());
  if (short) {
    const h = short[1] ?? "000";
    const n = (c: string) => Number.parseInt(c + c, 16);
    return { r: n(h[0] ?? "0"), g: n(h[1] ?? "0"), b: n(h[2] ?? "0") };
  }
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(style);
  assert.ok(m, `color ${style}`);
  return { r: Number(m?.[1]), g: Number(m?.[2]), b: Number(m?.[3]) };
}

function assertDirtTrack(ops: RoadOp[]) {
  assert.equal(ops.some((op) => op.op === "fillRect"), false, "no inset rect");
  for (const op of ops) {
    if (op.op === "dash") {
      assert.deepEqual(op.dash, [], "no center dashes");
      continue;
    }
    const style = op.op === "fill" ? op.fillStyle : op.strokeStyle;
    if (!style) continue;
    const c = inkOf(style);
    assert.ok(!(c.r > 230 && c.g > 230 && c.b > 200), `white mark ${style}`);
    assert.ok(!(c.g > c.r + 8 && c.g > 80), `green inset ${style}`);
    if (op.op === "stroke" && op.lineWidth > 0.12) {
      assert.ok(!(c.r < 50 && c.g < 40 && c.b < 30), `rail ${op.lineWidth} ${style}`);
    }
  }
  const widths = ops.filter((op) => op.op === "stroke").map((op) => op.lineWidth);
  const maxW = Math.max(...widths);
  assert.ok(maxW >= 1.05 && maxW <= 1.5, `road width ${maxW}`);
}

function widestRed(ops: RoadOp[]): number {
  let red = 0;
  for (const op of ops) {
    if (op.op !== "stroke" || op.lineWidth < 1.05) continue;
    red = Math.max(red, inkOf(op.strokeStyle).r);
  }
  return red;
}

test("no road tile draws plank, rail, or inset artwork", () => {
  const gw = 16;
  const straight = new Uint8Array(gw * gw);
  for (let x = 2; x <= 10; x++) straight[8 * gw + x] = TILE_ROAD;
  const straightOps = paintRoads(straight);
  assertDirtTrack(straightOps);
  assert.ok(straightOps.some((op) => op.op === "stroke" && op.lineWidth >= 1.05 && op.lineWidth <= 1.3 && op.lineTo >= 4));

  const bend = new Uint8Array(gw * gw);
  for (let x = 2; x <= 6; x++) bend[4 * gw + x] = TILE_ROAD;
  for (let y = 5; y <= 9; y++) bend[y * gw + 6] = TILE_ROAD;
  const bendOps = paintRoads(bend);
  assertDirtTrack(bendOps);
  assert.ok(bendOps.some((op) => op.op === "stroke" && op.lineWidth >= 1.05 && op.lineWidth <= 1.3 && op.lineTo >= 4));

  const block = new Uint8Array(gw * gw);
  block[2 * gw + 2] = TILE_ROAD;
  block[2 * gw + 3] = TILE_ROAD;
  block[3 * gw + 2] = TILE_ROAD;
  block[3 * gw + 3] = TILE_ROAD;
  const blockOps = paintRoads(block);
  assertDirtTrack(blockOps);

  const junction = new Uint8Array(gw * gw);
  for (let x = 4; x <= 12; x++) junction[8 * gw + x] = TILE_ROAD;
  for (let y = 4; y <= 12; y++) junction[y * gw + 8] = TILE_ROAD;
  const junctionOps = paintRoads(junction);
  assertDirtTrack(junctionOps);
  assert.ok(!junctionOps.some((op) => op.op === "fill" && op.maxR > 0.2), "junction disk scallops the edge");

  const meet = new Uint8Array(gw * gw);
  for (let x = 3; x <= 6; x++) meet[10 * gw + x] = TILE_ROAD;
  meet[10 * gw + 7] = TILE_BRIDGE;
  meet[10 * gw + 8] = TILE_BRIDGE;
  assertDirtTrack(paintRoads(meet));

  const muted = paintRoads(straight, () => true);
  assertDirtTrack(muted);
  assert.ok(widestRed(muted) < widestRed(straightOps), "explored fog desaturates the track");
});
