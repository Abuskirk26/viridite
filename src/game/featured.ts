/**
 * Six teaching maps. Original layouts. Each one is mirrored so the
 * 18-tile purse matches, and each one opens in the editor as a copy.
 */

import {
  TILE_BARN,
  TILE_BRIDGE,
  TILE_CLEAR,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_HUT,
  TILE_RAMP,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SCRUB,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_VALLEY,
  type Theater,
} from "./data.ts";
import { emptyDoc, type EditorDoc } from "./editor.ts";
import { softenField } from "./tileset.ts";

export interface FeaturedCard {
  id: string;
  name: string;
  players: string;
  w: number;
  h: number;
  theater: Theater;
  line: string;
  naval: boolean;
  credits: 2000 | 5000 | 10000;
  fog: boolean;
  walls: boolean;
}

export const FEATURED: FeaturedCard[] = [
  {
    id: "twin",
    name: "Twin Crystal",
    players: "1v1",
    w: 64,
    h: 64,
    theater: "desert",
    naval: false,
    credits: 5000,
    fog: true,
    walls: false,
    line: "Dry sand and a rough ridge. Each side has the same viridite. Scout it before you commit.",
  },
  {
    id: "pass",
    name: "Mountain Pass",
    players: "1v1",
    w: 64,
    h: 64,
    theater: "temperate",
    naval: false,
    credits: 5000,
    fog: false,
    walls: false,
    line: "A cliff wall splits the field. High ground on the flanks. Tanks take the north ramp or the south ramp.",
  },
  {
    id: "bridgewar",
    name: "Bridge War",
    players: "1v1",
    w: 64,
    h: 64,
    theater: "temperate",
    naval: true,
    credits: 5000,
    fog: true,
    walls: true,
    line: "A river with a wide middle and a cove on each bank. Two spans. A wall can plug a bridge.",
  },
  {
    id: "chain",
    name: "Island Chain",
    players: "1v1",
    w: 64,
    h: 64,
    theater: "snow",
    naval: true,
    credits: 10000,
    fog: false,
    walls: false,
    line: "Two jagged islands, a harbor notch, and no land bridge. Boats are the road.",
  },
  {
    id: "keep",
    name: "Fortress Keep",
    players: "1v1",
    w: 64,
    h: 64,
    theater: "desert",
    naval: false,
    credits: 5000,
    fog: true,
    walls: true,
    line: "Each camp sits behind rock with one gate. Sandbags and walls close that gate.",
  },
  {
    id: "brawl",
    name: "Mayhem Free-For-All",
    players: "4",
    w: 64,
    h: 64,
    theater: "temperate",
    naval: false,
    credits: 5000,
    fog: false,
    walls: false,
    line: "Four camps on open sand, rough ground in the middle, one rich heart. Fog off so you see who arrives.",
  },
];

export function featuredById(id: string): FeaturedCard | null {
  return FEATURED.find((card) => card.id === id) ?? null;
}

export function suggestLabel(card: FeaturedCard): string {
  const fog = card.fog ? "Fog on" : "Fog off";
  const walls = card.walls ? " · Walls on" : "";
  return `${card.credits.toLocaleString()} credits · ${fog}${walls}`;
}

export function buildFeatured(id: string, name?: string): EditorDoc {
  const card = featuredById(id) ?? FEATURED[0]!;
  const doc = blank(card.w, card.h, name?.trim() || card.name, card.theater);
  doc.template = card.id;
  BUILD[card.id]?.(doc);
  softenField(doc.terrain, doc.w, doc.h, doc.starts);
  return doc;
}

const BUILD: Record<string, (doc: EditorDoc) => void> = {
  twin: (doc) => {
    disc(doc, 30, 34, 5.5, TILE_ROUGH);
    start(doc, 16, 17);
    field(doc, 22, 23, 2.1, 1400);
    field(doc, 18, 29, 1.5, 800);
    grove(doc, 24, 18);
    mirrorRot2(doc);
  },
  pass: (doc) => {
    fillClear(doc);
    disc(doc, 10, 14, 5.2, TILE_ROUGH);
    disc(doc, 10, 52, 4.4, TILE_ROUGH);
    for (let y = 22; y <= 42; y += 4) grove(doc, 22, y);
    for (let y = 24; y <= 28; y++) set(doc, 26, y, TILE_ROCK);
    start(doc, 14, 32);
    field(doc, 18, 24, 2, 1400);
    field(doc, 18, 42, 1.4, 800);
    field(doc, 12, 28, 0.45, 2200);
    set(doc, 20, 16, TILE_HUT);
    mirrorX(doc);
    for (let y = 2; y < doc.h - 2; y++) {
      const gap = (y >= 12 && y <= 15) || (y >= 48 && y <= 51);
      for (let x = 30; x <= 33; x++) set(doc, x, y, gap ? TILE_RAMP : TILE_CLIFF);
    }
  },
  bridgewar: (doc) => {
    fillClear(doc);
    disc(doc, 8, 32, 4.2, TILE_ROUGH);
    start(doc, 14, 32);
    field(doc, 18, 22, 2, 1400);
    field(doc, 18, 44, 1.4, 800);
    field(doc, 12, 30, 0.45, 2200);
    set(doc, 10, 24, TILE_BARN);
    grove(doc, 20, 30);
    grove(doc, 18, 36);
    mirrorX(doc);
    for (let y = 1; y < doc.h - 1; y++) {
      const wide = y >= 26 && y <= 38;
      const x0 = wide ? 27 : 30;
      const x1 = wide ? 36 : 33;
      for (let x = x0; x <= x1; x++) set(doc, x, y, TILE_DEEP);
      set(doc, x0 - 1, y, TILE_SHALLOW);
      set(doc, x1 + 1, y, TILE_SHALLOW);
    }
    disc(doc, 18, 8, 3.4, TILE_DEEP);
    disc(doc, 45, 8, 3.4, TILE_DEEP);
    disc(doc, 18, 55, 3.2, TILE_DEEP);
    disc(doc, 45, 55, 3.2, TILE_DEEP);
    shoreRim(doc);
    span(doc, 29, 18, 4, 1, 0);
    span(doc, 29, 46, 4, 1, 0);
  },
  chain: (doc) => {
    doc.terrain.fill(TILE_DEEP);
    border(doc);
    coast(doc, 16, 32, 10.4, TILE_SHALLOW);
    coast(doc, 16, 32, 7.6, TILE_CLEAR);
    for (let y = 24; y <= 26; y++) {
      set(doc, 14, y, TILE_CLIFF);
      set(doc, 15, y, TILE_CLIFF);
    }
    shoreRim(doc);
    start(doc, 14, 32);
    field(doc, 17, 34, 1.5, 1400);
    field(doc, 13, 37, 1.2, 800);
    field(doc, 16, 30, 0.45, 2200);
    set(doc, 11, 34, TILE_HUT);
    grove(doc, 18, 38);
    dockAt(doc, 21, 31);
    mirrorX(doc);
  },
  keep: (doc) => {
    for (let y = 20; y <= 44; y++) {
      for (let x = 8; x <= 22; x++) {
        const edge = x === 8 || x === 22 || y === 20 || y === 44;
        const gate = x === 22 && y >= 30 && y <= 32;
        if (gate) set(doc, x, y, TILE_VALLEY);
        else if (edge) set(doc, x, y, TILE_ROCK);
      }
    }
    disc(doc, 14, 32, 2.2, TILE_ROUGH);
    start(doc, 14, 32);
    field(doc, 13, 26, 1.6, 1400);
    field(doc, 13, 38, 1.4, 800);
    grove(doc, 26, 28);
    road(doc, 22, 31, 30, 32);
    mirrorX(doc);
  },
  brawl: (doc) => {
    disc(doc, 32, 32, 8, TILE_ROUGH);
    disc(doc, 32, 32, 3.4, TILE_SAND);
    start(doc, 12, 12);
    field(doc, 18, 16, 2.2, 800);
    grove(doc, 22, 14);
    mirrorRot4(doc);
    field(doc, 32, 32, 2.6, 1400);
  },
};

function blank(w: number, h: number, name: string, theater: Theater): EditorDoc {
  const doc = emptyDoc(w, name, theater, "", h);
  doc.terrain.fill(TILE_SAND);
  doc.crystal.fill(0);
  doc.starts = [];
  doc.spans = [];
  doc.docks = [];
  doc.nudge = 0;
  border(doc);
  return doc;
}

function border(doc: EditorDoc) {
  for (let x = 0; x < doc.w; x++) {
    set(doc, x, 0, TILE_ROCK);
    set(doc, x, doc.h - 1, TILE_ROCK);
    doc.terrain[x] = TILE_ROCK;
    doc.terrain[(doc.h - 1) * doc.w + x] = TILE_ROCK;
    doc.crystal[x] = 0;
    doc.crystal[(doc.h - 1) * doc.w + x] = 0;
  }
  for (let y = 0; y < doc.h; y++) {
    doc.terrain[y * doc.w] = TILE_ROCK;
    doc.terrain[y * doc.w + doc.w - 1] = TILE_ROCK;
    doc.crystal[y * doc.w] = 0;
    doc.crystal[y * doc.w + doc.w - 1] = 0;
  }
}

function set(doc: EditorDoc, x: number, y: number, tile: number, amount = 0) {
  if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return;
  if (x === 0 || y === 0 || x === doc.w - 1 || y === doc.h - 1) {
    if (tile !== TILE_ROCK) return;
  }
  const i = y * doc.w + x;
  doc.terrain[i] = tile;
  doc.crystal[i] = tile === TILE_CRYSTAL ? amount : 0;
}

function coast(doc: EditorDoc, cx: number, cy: number, r: number, tile: number) {
  const reach = r * 1.25;
  for (let y = Math.max(1, Math.floor(cy - reach)); y <= Math.min(doc.h - 2, Math.ceil(cy + reach)); y++) {
    for (let x = Math.max(1, Math.floor(cx - reach)); x <= Math.min(doc.w - 2, Math.ceil(cx + reach)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ang = Math.atan2(dy, dx);
      const wobble = 0.84 + 0.18 * Math.sin(ang * 3) + 0.08 * Math.sin(ang * 6 + 0.7);
      const harbor = Math.cos(ang) > 0.55 ? 0.78 : 1;
      if (dx * dx + dy * dy > (r * wobble * harbor) * (r * wobble * harbor)) continue;
      set(doc, x, y, tile);
    }
  }
}

function disc(doc: EditorDoc, cx: number, cy: number, r: number, tile: number, amount = 0) {
  const r2 = r * r;
  for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(doc.h - 2, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= Math.min(doc.w - 2, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      set(doc, x, y, tile, amount);
    }
  }
}

function fillClear(doc: EditorDoc) {
  for (let y = 1; y < doc.h - 1; y++) {
    for (let x = 1; x < doc.w - 1; x++) {
      const i = y * doc.w + x;
      doc.terrain[i] = TILE_CLEAR;
      doc.crystal[i] = 0;
    }
  }
}

function field(doc: EditorDoc, cx: number, cy: number, r: number, amount: number) {
  const r2 = r * r;
  for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(doc.h - 2, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= Math.min(doc.w - 2, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * doc.w + x;
      const t = doc.terrain[i];
      if (t !== TILE_CLEAR && t !== TILE_SAND && t !== TILE_ROUGH && t !== TILE_SHORE) continue;
      doc.crystal[i] = amount;
    }
  }
}

function grove(doc: EditorDoc, x: number, y: number) {
  set(doc, x, y, TILE_SCRUB);
  set(doc, x + 1, y, TILE_SCRUB);
  set(doc, x, y + 1, TILE_SCRUB);
}

function start(doc: EditorDoc, x: number, y: number) {
  const t = doc.terrain[y * doc.w + x];
  if (t === TILE_ROCK || t === TILE_CLIFF || t === TILE_DEEP || t === TILE_SHALLOW) set(doc, x, y, TILE_CLEAR);
  doc.starts.push({ x: x + 0.5, y: y + 0.5 });
}

function road(doc: EditorDoc, x0: number, y0: number, x1: number, y1: number) {
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 200; guard++) {
    if (doc.terrain[y * doc.w + x] === TILE_SAND) set(doc, x, y, TILE_SAND);
    if (x === x1 && y === y1) break;
    if (x !== x1) x += x < x1 ? 1 : -1;
    else if (y !== y1) y += y < y1 ? 1 : -1;
  }
}

function shoreRim(doc: EditorDoc) {
  const next = doc.terrain.slice();
  const water = (t: number) => t === TILE_DEEP || t === TILE_SHALLOW;
  for (let y = 1; y < doc.h - 1; y++) {
    for (let x = 1; x < doc.w - 1; x++) {
      const i = y * doc.w + x;
      const t = doc.terrain[i];
      if (t !== TILE_SAND && t !== TILE_CRYSTAL && t !== TILE_CLEAR && t !== TILE_ROUGH) continue;
      const wet =
        water(doc.terrain[i - 1]!) ||
        water(doc.terrain[i + 1]!) ||
        water(doc.terrain[i - doc.w]!) ||
        water(doc.terrain[i + doc.w]!);
      if (wet) {
        next[i] = TILE_SHORE;
        doc.crystal[i] = 0;
      }
    }
  }
  doc.terrain = next;
}

function span(doc: EditorDoc, x: number, y: number, len: number, dx: number, dy: number) {
  const n = Math.max(2, Math.min(6, len));
  set(doc, x, y, TILE_SHORE);
  for (let i = 1; i <= n; i++) set(doc, x + dx * i, y + dy * i, TILE_BRIDGE);
  set(doc, x + dx * (n + 1), y + dy * (n + 1), TILE_SHORE);
  const mid = 1 + (n >> 1);
  doc.spans.push({ tx: x + dx * mid, ty: y + dy * mid });
}

function dockAt(doc: EditorDoc, x: number, y: number) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(doc, x + dx, y + dy, TILE_SHORE);
  doc.docks.push({ tx: x, ty: y });
}

function mirrorX(doc: EditorDoc) {
  const w = doc.w;
  for (let y = 1; y < doc.h - 1; y++) {
    for (let x = 1; x < w / 2; x++) {
      const mx = w - 1 - x;
      const i = y * w + x;
      const j = y * w + mx;
      doc.terrain[j] = doc.terrain[i]!;
      doc.crystal[j] = doc.crystal[i]!;
    }
  }
  const extraStarts = doc.starts.map((s) => {
    const tile = Math.floor(s.x);
    return { x: w - 1 - tile + 0.5, y: s.y };
  });
  for (const s of extraStarts) {
    if (!doc.starts.some((o) => Math.floor(o.x) === Math.floor(s.x) && Math.floor(o.y) === Math.floor(s.y))) doc.starts.push(s);
  }
  const extraDocks = doc.docks.map((d) => ({ tx: w - 1 - (d.tx + 1), ty: d.ty }));
  for (const d of extraDocks) {
    if (!doc.docks.some((o) => o.tx === d.tx && o.ty === d.ty)) doc.docks.push(d);
  }
}

function mirrorRot2(doc: EditorDoc) {
  const w = doc.w;
  const h = doc.h;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const mx = w - 1 - x;
      const my = h - 1 - y;
      if (y > my || (y === my && x >= mx)) continue;
      const i = y * w + x;
      const j = my * w + mx;
      doc.terrain[j] = doc.terrain[i]!;
      doc.crystal[j] = doc.crystal[i]!;
    }
  }
  for (const s of [...doc.starts]) {
    const mx = w - 1 - Math.floor(s.x);
    const my = h - 1 - Math.floor(s.y);
    if (!doc.starts.some((o) => Math.floor(o.x) === mx && Math.floor(o.y) === my)) doc.starts.push({ x: mx + 0.5, y: my + 0.5 });
  }
}

function mirrorRot4(doc: EditorDoc) {
  const w = doc.w;
  if (w !== doc.h) return;
  const terrain = doc.terrain.slice();
  const crystal = doc.crystal.slice();
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (terrain[i] === TILE_SAND && crystal[i] === 0) continue;
      const turns = [
        [w - 1 - y, x],
        [w - 1 - x, w - 1 - y],
        [y, w - 1 - x],
      ];
      for (const [mx, my] of turns) {
        const j = my! * w + mx!;
        doc.terrain[j] = terrain[i]!;
        doc.crystal[j] = crystal[i]!;
      }
    }
  }
  for (const s of [...doc.starts]) {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    const turns = [
      [w - 1 - y, x],
      [w - 1 - x, w - 1 - y],
      [y, w - 1 - x],
    ];
    for (const [mx, my] of turns) {
      if (!doc.starts.some((o) => Math.floor(o.x) === mx && Math.floor(o.y) === my)) doc.starts.push({ x: mx! + 0.5, y: my! + 0.5 });
    }
  }
}
