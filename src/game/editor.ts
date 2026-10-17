/**
 * Touch map editor. Original layouts only — nothing is read from a
 * Command & Conquer or Red Alert map file.
 *
 * One finger stamps the selected piece. Two fingers pan and pinch.
 * Water grows a shore rim. A mountain ridge drops a cliff on its south edge.
 * A bridge snaps across a 2–6 tile gap that already has shore on both ends.
 */

import {
  MAP_SIZE,
  TILE_BRIDGE,
  TILE_CLEAR,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_FORD,
  TILE_RAMP,
  TILE_ROAD,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_SPENT,
  TILE_STUMP,
  TILE_VALLEY,
  type MapId,
  type MapSizeId,
  type Theater,
} from "./data.ts";
import { generateMap, plantCorners, resampleMap, waterKind } from "./maps.ts";

export type Piece =
  | "land"
  | "rough"
  | "sand"
  | "shallow"
  | "deep"
  | "shore"
  | "mountain"
  | "valley"
  | "cliff"
  | "rock"
  | "ramp"
  | "road"
  | "bridge"
  | "ford"
  | "crystal"
  | "rich"
  | "gems"
  | "spawn"
  | "start"
  | "dock"
  | "erase"
  | "pick";

export type Brush = 1 | 3 | 5;
export type EditorSize = 64 | 96 | 128;
/** Paint once. The other side of the field follows. Rot 4 is square maps only. */
export type Symmetry = "off" | "x" | "y" | "rot2" | "rot4";
export type EditorLayer = "terrain" | "resources" | "starts" | "objects";

export const MAP_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: "48", label: "48", w: 48, h: 48 },
  { id: "64", label: "64", w: 64, h: 64 },
  { id: "72", label: "72", w: 72, h: 72 },
  { id: "96", label: "96", w: 96, h: 96 },
  { id: "64x126", label: "64×126", w: 64, h: 126 },
  { id: "126x64", label: "126×64", w: 126, h: 64 },
];

export function presetById(id: string): { id: string; label: string; w: number; h: number } {
  return MAP_PRESETS.find((s) => s.id === id) ?? MAP_PRESETS[1]!;
}

export interface EditorDoc {
  id: string;
  name: string;
  /** Width in tiles. */
  w: number;
  /** Height in tiles. */
  h: number;
  theater: Theater;
  terrain: Uint8Array;
  crystal: Uint16Array;
  starts: { x: number; y: number }[];
  /** One tile on each destructible bridge, used as the span building. */
  spans: { tx: number; ty: number }[];
  docks: { tx: number; ty: number }[];
  /** Template id, so Nudge can rebuild fields without moving chokepoints. */
  template: string;
  nudge: number;
}

export const PIECE_PAGES: { id: string; label: string; pieces: { id: Piece; label: string }[] }[] = [
  {
    id: "resources",
    label: "Resources",
    pieces: [
      { id: "crystal", label: "Viridite" },
      { id: "rich", label: "Rich" },
      { id: "gems", label: "Gems" },
    ],
  },
  {
    id: "spawns",
    label: "Spawns",
    pieces: [{ id: "start", label: "Start" }],
  },
  {
    id: "terrain",
    label: "Terrain",
    pieces: [
      { id: "land", label: "Clear" },
      { id: "rough", label: "Rough" },
      { id: "sand", label: "Sand" },
      { id: "rock", label: "Rock" },
      { id: "shore", label: "Shore" },
      { id: "shallow", label: "Shallow" },
      { id: "deep", label: "Deep" },
      { id: "cliff", label: "Cliff" },
      { id: "ramp", label: "Ramp" },
    ],
  },
  {
    id: "routes",
    label: "Routes",
    pieces: [
      { id: "road", label: "Road" },
      { id: "bridge", label: "Bridge" },
      { id: "ford", label: "Ford" },
      { id: "dock", label: "Dock ruin" },
    ],
  },
];

const WATER = new Set([TILE_DEEP, TILE_SHALLOW, TILE_FORD]);
const LANDISH = new Set([
  TILE_CLEAR,
  TILE_SAND,
  TILE_ROUGH,
  TILE_ROAD,
  TILE_VALLEY,
  TILE_RAMP,
  TILE_CRYSTAL,
  TILE_SPENT,
  TILE_STUMP,
  TILE_SHORE,
]);
const ORE_GROUND = new Set([
  TILE_CLEAR,
  TILE_SAND,
  TILE_ROUGH,
  TILE_ROAD,
  TILE_VALLEY,
  TILE_RAMP,
  TILE_SHORE,
  TILE_STUMP,
  TILE_SPENT,
  TILE_CRYSTAL,
]);

export function sizeId(size: number): MapSizeId {
  if (size > 128) return "continent";
  if (size > 96) return "warzone";
  if (size > 64) return "large";
  return "skirmish";
}

export function lobbySize(doc: Pick<EditorDoc, "w" | "h" | "starts">): MapSizeId {
  const n = Math.max(doc.w, doc.h);
  if (n > 128) return "continent";
  if (doc.starts.length >= 4 || n > 96) return "warzone";
  if (doc.starts.length >= 3 || n > 64) return "large";
  return "skirmish";
}

export function emptyDoc(w: number, name: string, theater: Theater, id = "", h = w): EditorDoc {
  const terrain = new Uint8Array(w * h);
  terrain.fill(TILE_CLEAR);
  for (let x = 0; x < w; x++) {
    terrain[x] = TILE_ROCK;
    terrain[(h - 1) * w + x] = TILE_ROCK;
  }
  for (let y = 0; y < h; y++) {
    terrain[y * w] = TILE_ROCK;
    terrain[y * w + w - 1] = TILE_ROCK;
  }
  const ax = Math.round(w * 0.22);
  const ay = Math.round(h * 0.78);
  const bx = w - 1 - Math.round(w * 0.22);
  const by = Math.round(h * 0.22);
  const doc: EditorDoc = {
    id,
    name,
    w,
    h,
    theater,
    terrain,
    crystal: new Uint16Array(w * h),
    starts: [
      { x: ax + 0.5, y: ay + 0.5 },
      { x: bx + 0.5, y: by + 0.5 },
      { x: ax + 0.5, y: by + 0.5 },
      { x: bx + 0.5, y: ay + 0.5 },
    ],
    spans: [],
    docks: [],
    template: "blank",
    nudge: 0,
  };
  disk(doc, w / 2, h / 2, Math.max(2.2, Math.min(w, h) / 28), TILE_CRYSTAL, 800);
  return doc;
}

/** Four islands, short bridges, a viridite patch on each. Not a Westwood layout. */
export function islandHoppers(size: EditorSize, name: string, theater: Theater, id = ""): EditorDoc {
  const doc = emptyDoc(size, name, theater, id);
  doc.terrain.fill(TILE_DEEP);
  for (let i = 0; i < size; i++) {
    doc.terrain[i] = TILE_ROCK;
    doc.terrain[(size - 1) * size + i] = TILE_ROCK;
    doc.terrain[i * size] = TILE_ROCK;
    doc.terrain[i * size + size - 1] = TILE_ROCK;
  }
  const left = Math.round(size * 0.28);
  const right = Math.round(size * 0.72);
  const gap = 4;
  const radius = (right - left - gap) / 2;
  const centers = [
    [left, left],
    [right, left],
    [left, right],
    [right, right],
  ];
  doc.starts = [];
  for (const [cx, cy] of centers) {
    disk(doc, cx, cy, radius, TILE_SAND, 0);
    doc.starts.push({ x: cx + 0.5, y: cy + 0.5 });
    const towardX = cx < size / 2 ? cx + radius * 0.75 : cx - radius * 0.75;
    const towardY = cy < size / 2 ? cy + radius * 0.15 : cy - radius * 0.15;
    disk(doc, towardX, towardY, Math.max(1.6, size / 40), TILE_CRYSTAL, 800);
  }
  rimShores(doc);
  linkIslands(doc, centers[0]!, centers[1]!);
  linkIslands(doc, centers[2]!, centers[3]!);
  linkIslands(doc, centers[0]!, centers[2]!);
  return doc;
}

export function cloneDoc(doc: EditorDoc): EditorDoc {
  return {
    ...doc,
    terrain: doc.terrain.slice(),
    crystal: doc.crystal.slice(),
    starts: doc.starts.map((s) => ({ ...s })),
    spans: doc.spans.map((s) => ({ ...s })),
    docks: doc.docks.map((s) => ({ ...s })),
  };
}

/** Editor camera can pull back until the whole field fits. The battle camera stays tighter. */
export function clampEditorCam(cam: { x: number; y: number; zoom: number }, gw: number, gh: number) {
  cam.zoom = Math.max(2, Math.min(72, cam.zoom));
  cam.x = Math.max(0, Math.min(gw, cam.x));
  cam.y = Math.max(0, Math.min(gh, cam.y));
}

export function fitEditorCam(cam: { x: number; y: number; zoom: number }, viewW: number, viewH: number, gw: number, gh: number) {
  const zx = viewW / Math.max(1, gw);
  const zy = viewH / Math.max(1, gh);
  cam.zoom = Math.max(2, Math.min(72, Math.min(zx, zy) * 0.94));
  cam.x = gw / 2;
  cam.y = gh / 2;
}

/** Tile mirrors. Rot 4 is a no-op on a rectangle so a wide map is not smeared. */
export function mirrorPoints(w: number, h: number, x: number, y: number, mode: Symmetry): { x: number; y: number }[] {
  if (mode === "off") return [];
  const out: { x: number; y: number }[] = [];
  const push = (px: number, py: number) => {
    if (px === x && py === y) return;
    if (px <= 0 || py <= 0 || px >= w - 1 || py >= h - 1) return;
    if (out.some((p) => p.x === px && p.y === py)) return;
    out.push({ x: px, y: py });
  };
  if (mode === "x") push(w - 1 - x, y);
  else if (mode === "y") push(x, h - 1 - y);
  else if (mode === "rot2") push(w - 1 - x, h - 1 - y);
  else if (mode === "rot4" && w === h) {
    push(w - 1 - y, x);
    push(w - 1 - x, h - 1 - y);
    push(y, h - 1 - x);
  }
  return out;
}

export function resizeDoc(doc: EditorDoc, w: number, h: number): EditorDoc {
  if (w < 32 || h < 32 || w > 128 || h > 128 || w * h > 128 * 128) return doc;
  if (w === doc.w && h === doc.h) return doc;
  const next = emptyDoc(w, doc.name, doc.theater, doc.id, h);
  next.template = doc.template;
  next.nudge = doc.nudge;
  next.terrain.fill(TILE_CLEAR);
  next.crystal.fill(0);
  next.starts = [];
  next.spans = [];
  next.docks = [];
  const ox = Math.floor((w - doc.w) / 2);
  const oy = Math.floor((h - doc.h) / 2);
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
      next.terrain[ny * w + nx] = doc.terrain[y * doc.w + x] ?? TILE_SAND;
      next.crystal[ny * w + nx] = doc.crystal[y * doc.w + x] ?? 0;
    }
  }
  for (let x = 0; x < w; x++) {
    next.terrain[x] = TILE_ROCK;
    next.terrain[(h - 1) * w + x] = TILE_ROCK;
    next.crystal[x] = 0;
    next.crystal[(h - 1) * w + x] = 0;
  }
  for (let y = 0; y < h; y++) {
    next.terrain[y * w] = TILE_ROCK;
    next.terrain[y * w + w - 1] = TILE_ROCK;
    next.crystal[y * w] = 0;
    next.crystal[y * w + w - 1] = 0;
  }
  next.starts = doc.starts
    .map((s) => ({ x: s.x + ox, y: s.y + oy }))
    .filter((s) => s.x > 1 && s.y > 1 && s.x < w - 1 && s.y < h - 1);
  if (next.starts.length < 2) next.starts = emptyDoc(w, doc.name, doc.theater, "", h).starts;
  next.spans = doc.spans
    .map((s) => ({ tx: s.tx + ox, ty: s.ty + oy }))
    .filter((s) => s.tx > 0 && s.ty > 0 && s.tx < w - 1 && s.ty < h - 1);
  next.docks = doc.docks
    .map((d) => ({ tx: d.tx + ox, ty: d.ty + oy }))
    .filter((d) => d.tx > 0 && d.ty > 0 && d.tx + 1 < w - 1 && d.ty + 1 < h - 1);
  return next;
}

/** The lobby field, as tiles. A saved map is cloned by the caller. Stock fields are 64, 96, or 128 square. */
export function docFromField(mapId: MapId, size: MapSizeId, name: string): EditorDoc {
  const side = MAP_SIZE[size];
  const base = generateMap(mapId);
  const field = side === baseSide(base) ? base : resampleMap(base, side);
  const doc = emptyDoc(side, name.trim() || field.name, "desert", "", side);
  doc.terrain = field.terrain.slice();
  doc.crystal = field.crystal.slice();
  doc.starts = plantCorners(doc.terrain, doc.crystal, side, waterKind(mapId))
    .slice(0, 4)
    .map((c) => ({ x: c.x, y: c.y }));
  doc.spans = field.spans.map((s) => ({ tx: s.tx, ty: s.ty }));
  doc.docks = [];
  doc.template = "";
  doc.nudge = 0;
  return doc;
}

function baseSide(map: { terrain: Uint8Array }): number {
  return Math.round(Math.sqrt(map.terrain.length));
}

export interface EditorClip {
  w: number;
  h: number;
  terrain: number[];
  crystal: number[];
  starts: { x: number; y: number }[];
  spans: { tx: number; ty: number }[];
  docks: { tx: number; ty: number }[];
}

export function copyRect(doc: EditorDoc, x0: number, y0: number, x1: number, y1: number): EditorClip | null {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(doc.w - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(doc.h - 1, Math.max(y0, y1));
  if (xb < xa || yb < ya) return null;
  const w = xb - xa + 1;
  const h = yb - ya + 1;
  const terrain: number[] = [];
  const crystal: number[] = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = y * doc.w + x;
      terrain.push(doc.terrain[i] ?? 0);
      crystal.push(doc.crystal[i] ?? 0);
    }
  }
  return {
    w,
    h,
    terrain,
    crystal,
    starts: doc.starts
      .filter((s) => Math.floor(s.x) >= xa && Math.floor(s.x) <= xb && Math.floor(s.y) >= ya && Math.floor(s.y) <= yb)
      .map((s) => ({ x: s.x - xa, y: s.y - ya })),
    spans: doc.spans
      .filter((s) => s.tx >= xa && s.tx <= xb && s.ty >= ya && s.ty <= yb)
      .map((s) => ({ tx: s.tx - xa, ty: s.ty - ya })),
    docks: doc.docks
      .filter((d) => d.tx >= xa && d.tx <= xb && d.ty >= ya && d.ty <= yb)
      .map((d) => ({ tx: d.tx - xa, ty: d.ty - ya })),
  };
}

function at(doc: EditorDoc, x: number, y: number): number {
  return y * doc.w + x;
}

function inside(doc: EditorDoc, x: number, y: number): boolean {
  return x > 0 && y > 0 && x < doc.w - 1 && y < doc.h - 1;
}

function disk(doc: EditorDoc, cx: number, cy: number, r: number, tile: number, amount: number) {
  const r2 = r * r;
  for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(doc.h - 2, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= Math.min(doc.w - 2, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = at(doc, x, y);
      doc.terrain[i] = tile;
      doc.crystal[i] = tile === TILE_CRYSTAL ? amount : 0;
    }
  }
}

function rimShores(doc: EditorDoc) {
  const next = doc.terrain.slice();
  for (let y = 1; y < doc.h - 1; y++) {
    for (let x = 1; x < doc.w - 1; x++) {
      const i = at(doc, x, y);
      if (doc.terrain[i] !== TILE_SAND && doc.terrain[i] !== TILE_CRYSTAL && doc.terrain[i] !== TILE_CLEAR && doc.terrain[i] !== TILE_ROUGH) continue;
      if (neighbors(doc, x, y).some((n) => WATER.has(n))) next[i] = TILE_SHORE;
    }
  }
  doc.terrain = next;
}

function neighbors(doc: EditorDoc, x: number, y: number): number[] {
  return [
    doc.terrain[at(doc, x - 1, y)]!,
    doc.terrain[at(doc, x + 1, y)]!,
    doc.terrain[at(doc, x, y - 1)]!,
    doc.terrain[at(doc, x, y + 1)]!,
  ];
}

function linkIslands(doc: EditorDoc, a: number[], b: number[]) {
  const horizontal = Math.abs(a[0]! - b[0]!) >= Math.abs(a[1]! - b[1]!);
  const y = Math.round((a[1]! + b[1]!) / 2);
  const x = Math.round((a[0]! + b[0]!) / 2);
  if (horizontal) snapBridge(doc, x, y);
  else snapBridge(doc, x, y);
}

export function brushCells(tx: number, ty: number, brush: Brush, w: number, h = w): { x: number; y: number }[] {
  const r = (brush - 1) >> 1;
  const out: { x: number; y: number }[] = [];
  for (let y = ty - r; y <= ty + r; y++) {
    for (let x = tx - r; x <= tx + r; x++) {
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) out.push({ x, y });
    }
  }
  return out;
}

function tileOf(piece: Piece): number | null {
  if (piece === "land" || piece === "erase") return TILE_CLEAR;
  if (piece === "rough" || piece === "valley") return TILE_ROUGH;
  if (piece === "sand") return TILE_SAND;
  if (piece === "shallow") return TILE_SHALLOW;
  if (piece === "deep") return TILE_DEEP;
  if (piece === "shore") return TILE_SHORE;
  if (piece === "mountain" || piece === "rock") return TILE_ROCK;
  if (piece === "cliff") return TILE_CLIFF;
  if (piece === "ramp") return TILE_RAMP;
  if (piece === "road") return TILE_ROAD;
  if (piece === "ford") return TILE_FORD;
  return null;
}

function gemAmount(piece: Piece): number {
  if (piece === "gems") return 2200;
  if (piece === "rich") return 1400;
  if (piece === "spawn") return 500;
  if (piece === "crystal") return 800;
  return 0;
}

function orePiece(piece: Piece): boolean {
  return piece === "crystal" || piece === "rich" || piece === "gems" || piece === "spawn";
}

export function cellLegal(doc: EditorDoc, piece: Piece, x: number, y: number): boolean {
  if (!inside(doc, x, y)) return false;
  if (piece === "start") return startLegal(doc, x, y);
  if (piece === "dock") return dockLegal(doc, x, y);
  if (piece === "bridge") return true;
  return true;
}

export function clearGems(doc: EditorDoc, cells: { x: number; y: number }[], brush: Brush): boolean {
  let wrote = false;
  const seen = new Set<number>();
  for (const cell of cells) {
    for (const p of brushCells(cell.x, cell.y, brush, doc.w, doc.h)) {
      const key = p.y * doc.w + p.x;
      if (seen.has(key)) continue;
      seen.add(key);
      const i = at(doc, p.x, p.y);
      if ((doc.crystal[i] ?? 0) <= 0 && doc.terrain[i] !== TILE_CRYSTAL && doc.terrain[i] !== TILE_SPENT) continue;
      if (doc.terrain[i] === TILE_CRYSTAL || doc.terrain[i] === TILE_SPENT) doc.terrain[i] = TILE_CLEAR;
      doc.crystal[i] = 0;
      wrote = true;
    }
  }
  return wrote;
}

/** Move one flag. It will not sit on water, a mountain, or within 8 tiles of another flag. */
export function moveStart(doc: EditorDoc, index: number, x: number, y: number): boolean {
  const spot = doc.starts[index];
  if (!spot || !inside(doc, x, y)) return false;
  const t = doc.terrain[at(doc, x, y)];
  if (!t || !LANDISH.has(t) || t === TILE_SHORE || t === TILE_ROCK || t === TILE_CLIFF || WATER.has(t)) return false;
  for (let i = 0; i < doc.starts.length; i++) {
    if (i === index) continue;
    const o = doc.starts[i]!;
    if (Math.max(Math.abs(o.x - (x + 0.5)), Math.abs(o.y - (y + 0.5))) < 8) return false;
  }
  spot.x = x + 0.5;
  spot.y = y + 0.5;
  return true;
}

export function auditFocus(doc: EditorDoc): { x: number; y: number } | null {
  const sea = naval(doc);
  for (let n = 0; n < doc.starts.length; n++) {
    const s = doc.starts[n]!;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (!inside(doc, x, y)) return { x: s.x, y: s.y };
    const t = doc.terrain[at(doc, x, y)];
    if (t === TILE_ROCK || t === TILE_CLIFF || WATER.has(t!)) return { x: s.x, y: s.y };
    for (let j = 0; j < n; j++) {
      const o = doc.starts[j]!;
      if (Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y)) < 8) return { x: s.x, y: s.y };
    }
    const reach = flood(doc, x, y);
    if (reach.tiles < 12 || (!reach.crystal && !(sea && reach.shore))) return { x: s.x, y: s.y };
  }
  if (!bridgesTouchShores(doc) && doc.spans[0]) return { x: doc.spans[0].tx + 0.5, y: doc.spans[0].ty + 0.5 };
  if (doc.starts.length < 2) return doc.starts[0] ? { x: doc.starts[0].x, y: doc.starts[0].y } : { x: doc.w / 2, y: doc.h / 2 };
  return null;
}

function startLegal(doc: EditorDoc, x: number, y: number): boolean {
  const t = doc.terrain[at(doc, x, y)];
  if (!LANDISH.has(t) || t === TILE_SHORE) return false;
  if (doc.starts.length >= 4 && !doc.starts.some((s) => Math.floor(s.x) === x && Math.floor(s.y) === y)) return false;
  for (const s of doc.starts) {
    if (Math.floor(s.x) === x && Math.floor(s.y) === y) return true;
    if (Math.max(Math.abs(s.x - (x + 0.5)), Math.abs(s.y - (y + 0.5))) < 8) return false;
  }
  return true;
}

function dockLegal(doc: EditorDoc, x: number, y: number): boolean {
  if (x + 1 >= doc.w - 1 || y + 1 >= doc.h - 1) return false;
  let wet = false;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const t = doc.terrain[at(doc, x + dx, y + dy)];
      if (t === TILE_ROCK || t === TILE_CLIFF || t === TILE_DEEP) return false;
      if (WATER.has(t) || t === TILE_SHORE) wet = true;
    }
  }
  return wet;
}

/** Stamp one stroke. Returns false when nothing legal landed. */
export function stamp(doc: EditorDoc, piece: Piece, cells: { x: number; y: number }[], brush: Brush): boolean {
  if (piece === "pick") return false;
  if (piece === "bridge") {
    const c = cells[cells.length - 1];
    return c ? snapBridge(doc, c.x, c.y) : false;
  }
  if (piece === "start") {
    const c = cells[0];
    return c ? placeStart(doc, c.x, c.y) : false;
  }
  if (piece === "dock") {
    const c = cells[0];
    return c ? placeDock(doc, c.x, c.y) : false;
  }
  const tile = tileOf(piece);
  if (tile == null && !orePiece(piece)) return false;
  const seen = new Set<number>();
  let wrote = false;
  const painted: { x: number; y: number }[] = [];
  for (const cell of cells) {
    for (const p of brushCells(cell.x, cell.y, brush, doc.w, doc.h)) {
      const key = p.y * doc.w + p.x;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!cellLegal(doc, piece, p.x, p.y)) continue;
      const i = at(doc, p.x, p.y);
      if (piece === "erase") eraseAt(doc, p.x, p.y);
      if (orePiece(piece)) {
        const ground = doc.terrain[i] ?? 0;
        if (!ORE_GROUND.has(ground)) continue;
        if (ground === TILE_CRYSTAL || ground === TILE_SPENT) doc.terrain[i] = TILE_CLEAR;
        doc.crystal[i] = gemAmount(piece);
      } else {
        doc.terrain[i] = tile ?? TILE_CLEAR;
        if (!orePiece(piece)) doc.crystal[i] = 0;
      }
      painted.push(p);
      wrote = true;
    }
  }
  if (piece === "deep" || piece === "shallow") rimAround(doc, painted);
  if (piece === "mountain") cliffSouth(doc, painted);
  return wrote;
}

function rimAround(doc: EditorDoc, painted: { x: number; y: number }[]) {
  for (const p of painted) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!inside(doc, x, y)) continue;
      const i = at(doc, x, y);
      const t = doc.terrain[i];
      if (
        t === TILE_SAND ||
        t === TILE_CLEAR ||
        t === TILE_ROUGH ||
        t === TILE_ROAD ||
        t === TILE_VALLEY ||
        t === TILE_RAMP ||
        t === TILE_CRYSTAL ||
        t === TILE_STUMP ||
        t === TILE_SPENT
      ) {
        doc.terrain[i] = TILE_SHORE;
        doc.crystal[i] = 0;
      }
    }
  }
}

function cliffSouth(doc: EditorDoc, painted: { x: number; y: number }[]) {
  const ridge = new Set(painted.map((p) => p.y * doc.w + p.x));
  for (const p of painted) {
    const y = p.y + 1;
    if (!inside(doc, p.x, y)) continue;
    const i = at(doc, p.x, y);
    if (ridge.has(i)) continue;
    const t = doc.terrain[i];
    if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_BRIDGE) continue;
    doc.terrain[i] = TILE_CLIFF;
    doc.crystal[i] = 0;
  }
}

function eraseAt(doc: EditorDoc, x: number, y: number) {
  doc.starts = doc.starts.filter((s) => Math.floor(s.x) !== x || Math.floor(s.y) !== y);
  doc.docks = doc.docks.filter((d) => x < d.tx || y < d.ty || x >= d.tx + 2 || y >= d.ty + 2);
  doc.spans = doc.spans.filter((s) => s.tx !== x || s.ty !== y);
}

function placeStart(doc: EditorDoc, x: number, y: number): boolean {
  if (!startLegal(doc, x, y)) return false;
  doc.starts = doc.starts.filter((s) => Math.floor(s.x) !== x || Math.floor(s.y) !== y);
  if (doc.starts.length >= 4) return false;
  doc.starts.push({ x: x + 0.5, y: y + 0.5 });
  return true;
}

function placeDock(doc: EditorDoc, x: number, y: number): boolean {
  if (!dockLegal(doc, x, y)) return false;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const i = at(doc, x + dx, y + dy);
      if (doc.terrain[i] !== TILE_SHORE) {
        doc.terrain[i] = TILE_SHORE;
        doc.crystal[i] = 0;
      }
    }
  }
  if (!doc.docks.some((d) => d.tx === x && d.ty === y)) doc.docks.push({ tx: x, ty: y });
  return true;
}

export function pieceLayer(piece: Piece): EditorLayer | null {
  if (piece === "crystal" || piece === "rich" || piece === "gems" || piece === "spawn") return "resources";
  if (piece === "start") return "starts";
  if (piece === "dock" || piece === "bridge") return "objects";
  if (piece === "pick" || piece === "erase") return null;
  return "terrain";
}

/** Stamp, then copy whatever changed onto the mirrors. Starts, rich fields, and docks follow. */
export function stampSymmetric(
  doc: EditorDoc,
  piece: Piece,
  cells: { x: number; y: number }[],
  brush: Brush,
  mode: Symmetry,
): boolean {
  if (mode === "off" || piece === "pick") return stamp(doc, piece, cells, brush);
  const beforeT = doc.terrain.slice();
  const beforeC = doc.crystal.slice();
  const startCount = doc.starts.length;
  const dockCount = doc.docks.length;
  const spanCount = doc.spans.length;
  const wrote = stamp(doc, piece, cells, brush);
  mirrorDiff(doc, beforeT, beforeC, startCount, dockCount, spanCount, mode, piece === "erase");
  return wrote;
}

export function pasteClip(doc: EditorDoc, clip: EditorClip, ox: number, oy: number, mode: Symmetry): boolean {
  const beforeT = doc.terrain.slice();
  const beforeC = doc.crystal.slice();
  const startCount = doc.starts.length;
  const dockCount = doc.docks.length;
  const spanCount = doc.spans.length;
  let wrote = false;
  for (let ly = 0; ly < clip.h; ly++) {
    for (let lx = 0; lx < clip.w; lx++) {
      const x = ox + lx;
      const y = oy + ly;
      if (!inside(doc, x, y)) continue;
      const i = at(doc, x, y);
      const s = ly * clip.w + lx;
      doc.terrain[i] = clip.terrain[s] ?? TILE_SAND;
      doc.crystal[i] = clip.crystal[s] ?? 0;
      wrote = true;
    }
  }
  for (const s of clip.starts) placeStart(doc, Math.floor(ox + s.x), Math.floor(oy + s.y));
  for (const d of clip.docks) placeDock(doc, ox + d.tx, oy + d.ty);
  for (const s of clip.spans) {
    const x = ox + s.tx;
    const y = oy + s.ty;
    if (!inside(doc, x, y)) continue;
    if (!doc.spans.some((o) => o.tx === x && o.ty === y)) doc.spans.push({ tx: x, ty: y });
  }
  mirrorDiff(doc, beforeT, beforeC, startCount, dockCount, spanCount, mode, false);
  return wrote;
}

function mirrorDiff(
  doc: EditorDoc,
  beforeT: Uint8Array,
  beforeC: Uint16Array,
  startCount: number,
  dockCount: number,
  spanCount: number,
  mode: Symmetry,
  erase: boolean,
) {
  for (let y = 1; y < doc.h - 1; y++) {
    for (let x = 1; x < doc.w - 1; x++) {
      const i = at(doc, x, y);
      if (doc.terrain[i] === beforeT[i] && doc.crystal[i] === beforeC[i]) continue;
      for (const m of mirrorPoints(doc.w, doc.h, x, y, mode)) {
        const di = at(doc, m.x, m.y);
        doc.terrain[di] = doc.terrain[i] ?? TILE_SAND;
        doc.crystal[di] = doc.crystal[i] ?? 0;
        if (erase) clearMarks(doc, m.x, m.y);
      }
    }
  }
  if (erase) return;
  for (const s of doc.starts.slice(startCount)) {
    for (const m of mirrorPoints(doc.w, doc.h, Math.floor(s.x), Math.floor(s.y), mode)) placeStart(doc, m.x, m.y);
  }
  for (const d of doc.docks.slice(dockCount)) {
    for (const m of mirrorPoints(doc.w, doc.h, d.tx, d.ty, mode)) placeDock(doc, m.x, m.y);
  }
  for (const s of doc.spans.slice(spanCount)) {
    for (const m of mirrorPoints(doc.w, doc.h, s.tx, s.ty, mode)) {
      if (!doc.spans.some((o) => o.tx === m.x && o.ty === m.y)) doc.spans.push({ tx: m.x, ty: m.y });
    }
  }
}

function clearMarks(doc: EditorDoc, x: number, y: number) {
  doc.starts = doc.starts.filter((s) => Math.floor(s.x) !== x || Math.floor(s.y) !== y);
  doc.docks = doc.docks.filter((d) => x < d.tx || y < d.ty || x >= d.tx + 2 || y >= d.ty + 2);
  doc.spans = doc.spans.filter((s) => s.tx !== x || s.ty !== y);
}

/** Gap of water between two shores, 2 to 6 tiles, on the row or column of the finger. */
export function snapBridge(doc: EditorDoc, tx: number, ty: number): boolean {
  const horizontal = spanGap(doc, tx, ty, 1, 0);
  const vertical = spanGap(doc, tx, ty, 0, 1);
  const pick = chooseGap(horizontal, vertical, tx, ty);
  if (!pick) return false;
  for (const cell of pick.cells) {
    const i = at(doc, cell.x, cell.y);
    doc.terrain[i] = TILE_BRIDGE;
    doc.crystal[i] = 0;
  }
  const mid = pick.cells[pick.cells.length >> 1]!;
  if (!doc.spans.some((s) => s.tx === mid.x && s.ty === mid.y)) doc.spans.push({ tx: mid.x, ty: mid.y });
  return true;
}

function chooseGap(
  a: { cells: { x: number; y: number }[] } | null,
  b: { cells: { x: number; y: number }[] } | null,
  tx: number,
  ty: number,
): { cells: { x: number; y: number }[] } | null {
  if (a && b) {
    const da = gapDist(a.cells, tx, ty);
    const db = gapDist(b.cells, tx, ty);
    return da <= db ? a : b;
  }
  return a ?? b;
}

function gapDist(cells: { x: number; y: number }[], tx: number, ty: number): number {
  const mid = cells[cells.length >> 1]!;
  return Math.abs(mid.x - tx) + Math.abs(mid.y - ty);
}

function spanGap(
  doc: EditorDoc,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): { cells: { x: number; y: number }[] } | null {
  const waterAt = (x: number, y: number) => inside(doc, x, y) && WATER.has(doc.terrain[at(doc, x, y)]!);
  const shoreAt = (x: number, y: number) => inside(doc, x, y) && doc.terrain[at(doc, x, y)] === TILE_SHORE;
  let x = tx;
  let y = ty;
  if (!waterAt(x, y) && !shoreAt(x, y)) {
    for (let step = 1; step <= 6; step++) {
      if (waterAt(tx + dx * step, ty + dy * step)) {
        x = tx + dx * step;
        y = ty + dy * step;
        break;
      }
      if (waterAt(tx - dx * step, ty - dy * step)) {
        x = tx - dx * step;
        y = ty - dy * step;
        break;
      }
    }
  }
  if (!waterAt(x, y)) return null;
  while (waterAt(x - dx, y - dy)) {
    x -= dx;
    y -= dy;
  }
  const cells: { x: number; y: number }[] = [];
  while (waterAt(x, y) && cells.length <= 6) {
    cells.push({ x, y });
    x += dx;
    y += dy;
  }
  if (cells.length < 2 || cells.length > 6) return null;
  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  if (!shoreAt(first.x - dx, first.y - dy) || !shoreAt(last.x + dx, last.y + dy)) return null;
  return { cells };
}

export function pieceAt(doc: EditorDoc, x: number, y: number): Piece {
  if (!inside(doc, x, y)) return "rock";
  if (doc.starts.some((s) => Math.floor(s.x) === x && Math.floor(s.y) === y)) return "start";
  if (doc.docks.some((d) => x >= d.tx && y >= d.ty && x < d.tx + 2 && y < d.ty + 2)) return "dock";
  const t = doc.terrain[at(doc, x, y)];
  const ore = doc.crystal[at(doc, x, y)] ?? 0;
  if (ore >= 2000) return "gems";
  if (ore >= 1200) return "rich";
  if (ore > 0) return ore <= 550 ? "spawn" : "crystal";
  if (t === TILE_DEEP) return "deep";
  if (t === TILE_SHALLOW) return "shallow";
  if (t === TILE_SHORE) return "shore";
  if (t === TILE_CLIFF) return "cliff";
  if (t === TILE_ROCK) return "rock";
  if (t === TILE_ROAD) return "road";
  if (t === TILE_ROUGH || t === TILE_VALLEY) return "rough";
  if (t === TILE_RAMP) return "ramp";
  if (t === TILE_BRIDGE) return "bridge";
  if (t === TILE_FORD) return "ford";
  if (t === TILE_SAND) return "sand";
  return "land";
}

const WALK = new Set([
  TILE_CLEAR,
  TILE_SAND,
  TILE_ROUGH,
  TILE_ROAD,
  TILE_VALLEY,
  TILE_RAMP,
  TILE_SHORE,
  TILE_BRIDGE,
  TILE_FORD,
  TILE_CRYSTAL,
  TILE_SPENT,
  TILE_STUMP,
]);

function flood(doc: EditorDoc, sx: number, sy: number): { tiles: number; crystal: boolean; shore: boolean } {
  const seen = new Uint8Array(doc.w * doc.h);
  const stack = [sy * doc.w + sx];
  seen[sy * doc.w + sx] = 1;
  let tiles = 0;
  let crystal = false;
  let shore = false;
  while (stack.length) {
    const i = stack.pop() as number;
    tiles++;
    const t = doc.terrain[i];
    if ((doc.crystal[i] ?? 0) > 0) crystal = true;
    if (t === TILE_SHORE) shore = true;
    const x = i % doc.w;
    const y = (i / doc.w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(doc, nx, ny)) continue;
      const ni = at(doc, nx, ny);
      if (seen[ni] || !WALK.has(doc.terrain[ni]!)) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return { tiles, crystal, shore };
}

/** Credits within this many tiles of a start. Fairness uses the purse, not the whole field. */
export const PURSE_RADIUS = 18;

/** Viridite value inside each start's purse. Rich counts as its stored amount. */
export function startPurses(doc: EditorDoc): number[] {
  const r2 = PURSE_RADIUS * PURSE_RADIUS;
  return doc.starts.map((s) => {
    let total = 0;
    const x0 = Math.max(1, Math.floor(s.x - PURSE_RADIUS));
    const x1 = Math.min(doc.w - 2, Math.ceil(s.x + PURSE_RADIUS));
    const y0 = Math.max(1, Math.floor(s.y - PURSE_RADIUS));
    const y1 = Math.min(doc.h - 2, Math.ceil(s.y + PURSE_RADIUS));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - s.x;
        const dy = y + 0.5 - s.y;
        if (dx * dx + dy * dy > r2) continue;
        total += doc.crystal[y * doc.w + x] ?? 0;
      }
    }
    return total;
  });
}

/** Empty means purses match within 15%. Shown by Check. It does not block a save. */
export function fairnessNotes(doc: EditorDoc): string[] {
  const purses = startPurses(doc);
  if (purses.length < 2) return [];
  const max = Math.max(...purses);
  const min = Math.min(...purses);
  if (max <= 0) return ["No viridite within 18 tiles of a start."];
  const gap = (max - min) / max;
  if (gap <= 0.15) return [];
  const spread = purses.map((n, i) => `Start ${i + 1} ${n.toLocaleString()}`).join(", ");
  return [`Purses differ by ${Math.round(gap * 100)}%. Keep them within 15%. ${spread}.`];
}

/** True when two tiles share a land walk. Mountains stop it. Bridges and valleys do not. */
export function sharesGround(doc: EditorDoc, ax: number, ay: number, bx: number, by: number): boolean {
  if (!inside(doc, ax, ay) || !inside(doc, bx, by)) return false;
  if (!WALK.has(doc.terrain[at(doc, ax, ay)] ?? 0)) return false;
  const seen = new Uint8Array(doc.w * doc.h);
  const stack = [ay * doc.w + ax];
  seen[ay * doc.w + ax] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    if (i === by * doc.w + bx) return true;
    const x = i % doc.w;
    const y = (i / doc.w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(doc, nx, ny)) continue;
      const ni = at(doc, nx, ny);
      if (seen[ni] || !WALK.has(doc.terrain[ni] ?? 0)) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return false;
}

/** Dock and boats need deep water. Shore, shallows, and fords stay a land fight. */
export function offersNavy(doc: EditorDoc): boolean {
  for (let i = 0; i < doc.terrain.length; i++) {
    if (doc.terrain[i] === TILE_DEEP) return true;
  }
  return false;
}

function naval(doc: EditorDoc): boolean {
  let wet = 0;
  for (let i = 0; i < doc.terrain.length; i++) if (WATER.has(doc.terrain[i]!) || doc.terrain[i] === TILE_DEEP) wet++;
  return wet > Math.min(doc.w, doc.h) * 4;
}

/** Short sentences. Empty means the map can be saved. */
export function audit(doc: EditorDoc): string[] {
  const notes: string[] = [];
  if (doc.starts.length < 2) notes.push("Place at least two start flags.");
  if (doc.starts.length > 4) notes.push("Four starts is the limit.");
  const sea = naval(doc);
  doc.starts.forEach((s, n) => {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    const label = `Start ${n + 1}`;
    if (!inside(doc, x, y) || (!startLegal(doc, x, y) && !LANDISH.has(doc.terrain[at(doc, x, y)]!))) {
      notes.push(`${label} is on water or a mountain.`);
      return;
    }
    const t = doc.terrain[at(doc, x, y)];
    if (t === TILE_ROCK || t === TILE_CLIFF || WATER.has(t!)) notes.push(`${label} is on water or a mountain.`);
    for (let j = 0; j < n; j++) {
      const o = doc.starts[j]!;
      if (Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y)) < 8) notes.push(`${label} is within 8 tiles of another start.`);
    }
    const reach = flood(doc, x, y);
    if (reach.tiles < 12) notes.push(`${label} is walled in by mountains.`);
    else if (!reach.crystal && !(sea && reach.shore)) notes.push(`${label} cannot reach viridite on foot.`);
  });
  if (!bridgesTouchShores(doc)) notes.push("A bridge must touch shore on both ends, across 2 to 6 tiles.");
  return notes;
}

function bridgesTouchShores(doc: EditorDoc): boolean {
  const seen = new Uint8Array(doc.w * doc.h);
  for (let y = 1; y < doc.h - 1; y++) {
    for (let x = 1; x < doc.w - 1; x++) {
      const i = at(doc, x, y);
      if (seen[i] || doc.terrain[i] !== TILE_BRIDGE) continue;
      const cells: number[] = [];
      const stack = [i];
      seen[i] = 1;
      let shore = 0;
      while (stack.length) {
        const cur = stack.pop() as number;
        cells.push(cur);
        const cx = cur % doc.w;
        const cy = (cur / doc.w) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inside(doc, nx, ny)) continue;
          const ni = at(doc, nx, ny);
          if (doc.terrain[ni] === TILE_SHORE) shore++;
          if (seen[ni] || doc.terrain[ni] !== TILE_BRIDGE) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (cells.length < 2 || cells.length > 6 || shore < 2) return false;
    }
  }
  return true;
}
