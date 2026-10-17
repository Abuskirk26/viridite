/**
 * Original skirmish layouts. The names and the one-line plans follow the
 * classic multiplayer set. The tiles are generated here. No INI file is read.
 * A nudge moves viridite by a couple of tiles and leaves starts, bridges,
 * fords, and ridges where they are.
 */

import {
  TILE_BRIDGE,
  TILE_CLEAR,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_FORD,
  TILE_ROAD,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_VALLEY,
  type Theater,
} from "./data.ts";
import { emptyDoc, type EditorDoc } from "./editor.ts";
import { layFourIsles } from "./fourisles.ts";
import { softenField } from "./tileset.ts";

export interface TemplateCard {
  id: string;
  name: string;
  players: string;
  w: number;
  h: number;
  theater: Theater;
  line: string;
  naval: boolean;
  /** Set when the classic count is larger than the flags stored on the map. */
  flags?: number;
}

export const TEMPLATES: TemplateCard[] = [
  { id: "fourisles", name: "Four Isles", players: "4", w: 96, h: 96, theater: "snow", naval: true, flags: 4, line: "Four islands and the water between them. Viridite sits on the beaches." },
  { id: "hoppers", name: "Island Hoppers", players: "4", w: 96, h: 96, theater: "snow", naval: true, line: "Four islands around a channel. One bridge on the near pair, fords to the outer islands, rich viridite on the far shores." },
  { id: "pond", name: "Pond Skirmish", players: "2–4", w: 64, h: 64, theater: "snow", naval: true, line: "One central pond, a land ring, short bridges, viridite in the corners." },
  { id: "ridge", name: "Ridge War", players: "2–4", w: 64, h: 64, theater: "temperate", naval: false, line: "A mountain spine down the middle with two valley gaps. Viridite on both flanks." },
  { id: "grass", name: "Keep off the Grass", players: "2", w: 48, h: 48, theater: "temperate", naval: false, line: "Tiny and open. One viridite field per start. No water." },
  { id: "grave", name: "Shallow Grave", players: "4", w: 48, h: 48, theater: "snow", naval: true, line: "Tight shallows, a little deep water, fast fights." },
  { id: "mayhem", name: "Middle Mayhem", players: "2", w: 75, h: 65, theater: "snow", naval: false, line: "Both starts face a shared central viridite basin." },
  { id: "equal", name: "Equal Opportunity", players: "2", w: 71, h: 71, theater: "snow", naval: true, line: "Mirrored starts, equal viridite, and a shore on one side only." },
  { id: "treasure", name: "Treasure Isle", players: "4–6", w: 126, h: 64, theater: "temperate", naval: true, line: "Long water, a rich central island, bridges at both ends." },
  { id: "dugout", name: "Dugout Isle", players: "4–6", w: 64, h: 126, theater: "snow", naval: true, line: "A narrow island chain. Docks matter." },
  { id: "coastal", name: "Coastal Influence", players: "4–6", w: 94, h: 94, theater: "snow", naval: true, line: "Bases inland, a contested coast, and two bridges." },
  { id: "fury", name: "Isle of Fury", players: "6–8", flags: 4, w: 96, h: 96, theater: "temperate", naval: true, line: "Several islands, one neutral center island with rich viridite." },
  { id: "wars", name: "Island Wars", players: "6–8", flags: 4, w: 96, h: 96, theater: "temperate", naval: true, line: "The same island fight, with more open water between the camps." },
  { id: "marooned", name: "Marooned II", players: "4", w: 94, h: 94, theater: "temperate", naval: true, line: "Separated beaches, one long bridge, boats decide the mid game." },
  { id: "escape", name: "No Escape", players: "4", w: 64, h: 126, theater: "temperate", naval: true, line: "A canyon with water at both ends and few ways out." },
  { id: "noman", name: "No Man's Land", players: "4", w: 126, h: 64, theater: "temperate", naval: false, line: "A wide open center and viridite in a neutral strip." },
  { id: "alley", name: "Combat Alley", players: "4", w: 64, h: 126, theater: "snow", naval: true, line: "A long road between ridges, with chokepoint bridges." },
  { id: "northwest", name: "North By Northwest", players: "4", w: 96, h: 96, theater: "snow", naval: false, line: "A diagonal mountain range, a valley road, and corner starts." },
  { id: "central", name: "Central Conflict", players: "4", w: 96, h: 96, theater: "temperate", naval: false, line: "A ring of ground around a viridite bowl." },
  { id: "path", name: "A Path Beyond", players: "4", w: 96, h: 96, theater: "temperate", naval: true, line: "A winding valley path, with water only at the far end." },
  { id: "desolation", name: "Desolation", players: "4", w: 96, h: 96, theater: "snow", naval: false, line: "Poor viridite, long travel, and one rich cluster tucked away." },
  { id: "ivory", name: "Ivory Wastelands", players: "2–4", w: 70, h: 70, theater: "snow", naval: false, line: "Open snow and scattered fields." },
  { id: "first", name: "First Come, First Serve", players: "4", w: 84, h: 84, theater: "temperate", naval: false, line: "One dominant central field and a fair road in from each corner." },
  { id: "normandy", name: "Normandy", players: "4", w: 64, h: 64, theater: "snow", naval: true, line: "Beach starts, a ridge inland, and one bridge off the beach." },
  { id: "raraku", name: "Raraku", players: "4", w: 96, h: 96, theater: "temperate", naval: false, line: "Broken mesas, valleys between them, viridite in the low ground." },
];

export function templateById(id: string): TemplateCard {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;
}

export function buildTemplate(id: string, nudge = 0, name?: string): EditorDoc {
  const card = templateById(id);
  const doc = emptyDoc(card.w, name?.trim() || card.name, card.theater, "", card.h);
  doc.template = card.id;
  doc.nudge = nudge;
  doc.terrain.fill(TILE_SAND);
  doc.crystal.fill(0);
  doc.starts = [];
  doc.spans = [];
  doc.docks = [];
  border(doc);
  BUILD[card.id]?.(doc, nudge);
  softenField(doc.terrain, doc.w, doc.h, doc.starts);
  return doc;
}

const BUILD: Record<string, (doc: EditorDoc, nudge: number) => void> = {
  fourisles: (doc) => layFourIsles(doc),
  hoppers: (doc, nudge) => {
    doc.terrain.fill(TILE_DEEP);
    border(doc);
    const islands = [
      [28, 58],
      [56, 58],
      [28, 28],
      [56, 28],
    ];
    for (const [x, y] of islands) disc(doc, x, y, 11, TILE_SAND);
    shoreRim(doc);
    span(doc, 39, 58, 4, 1, 0, TILE_BRIDGE);
    span(doc, 28, 39, 4, 0, 1, TILE_FORD);
    span(doc, 56, 39, 4, 0, 1, TILE_FORD);
    start(doc, 28, 58);
    start(doc, 56, 58);
    start(doc, 28, 28);
    start(doc, 56, 28);
    gem(doc, 28, 66, 1.6, 800, nudge, 0);
    gem(doc, 56, 66, 1.6, 800, nudge, 1);
    gem(doc, 22, 20, 1.7, 1400, nudge, 2);
    gem(doc, 64, 20, 1.7, 1400, nudge, 3);
  },
  pond: (doc, nudge) => {
    disc(doc, 32, 32, 9, TILE_DEEP);
    shoreRim(doc);
    span(doc, 32, 22, 3, 0, 1, TILE_BRIDGE);
    span(doc, 22, 32, 3, 1, 0, TILE_BRIDGE);
    corners(doc, 4);
    gem(doc, 12, 12, 2, 800, nudge, 0);
    gem(doc, 51, 12, 2, 800, nudge, 1);
    gem(doc, 12, 51, 2, 800, nudge, 2);
    gem(doc, 51, 51, 2, 800, nudge, 3);
  },
  ridge: (doc, nudge) => {
    spine(doc, 32, 0, 1);
    valleyGap(doc, 32, 18, 3);
    valleyGap(doc, 32, 44, 3);
    corners(doc, 4);
    gem(doc, 16, 32, 2.4, 800, nudge, 0);
    gem(doc, 48, 32, 2.4, 800, nudge, 1);
  },
  grass: (doc, nudge) => {
    start(doc, 12, 36);
    start(doc, 36, 12);
    gem(doc, 18, 28, 2, 800, nudge, 0);
    gem(doc, 30, 18, 2, 800, nudge, 1);
  },
  grave: (doc, nudge) => {
    doc.terrain.fill(TILE_SHALLOW);
    border(doc);
    disc(doc, 24, 24, 4, TILE_DEEP);
    for (const [x, y] of [
      [10, 10],
      [36, 10],
      [10, 36],
      [36, 36],
    ]) {
      disc(doc, x, y, 6, TILE_SAND);
      start(doc, x, y);
    }
    shoreRim(doc);
    gem(doc, 10, 16, 1.4, 700, nudge, 0);
    gem(doc, 36, 16, 1.4, 700, nudge, 1);
    gem(doc, 10, 30, 1.4, 700, nudge, 2);
    gem(doc, 36, 30, 1.4, 700, nudge, 3);
  },
  mayhem: (doc, nudge) => {
    start(doc, 14, 32);
    start(doc, 60, 32);
    gem(doc, 37, 32, 5, 1100, nudge, 0);
  },
  equal: (doc, nudge) => {
    start(doc, 16, 36);
    start(doc, 54, 36);
    gem(doc, 28, 24, 2.2, 800, nudge, 0);
    gem(doc, 42, 46, 2.2, 800, nudge, 1);
    for (let y = 8; y < doc.h - 8; y++) {
      set(doc, doc.w - 6, y, TILE_SHORE);
      set(doc, doc.w - 5, y, TILE_SHALLOW);
      set(doc, doc.w - 4, y, TILE_DEEP);
      set(doc, doc.w - 3, y, TILE_DEEP);
    }
  },
  treasure: (doc, nudge) => {
    for (let y = 8; y < doc.h - 8; y++) {
      for (let x = 28; x < 98; x++) set(doc, x, y, TILE_DEEP);
    }
    disc(doc, 63, 32, 10, TILE_SAND);
    shoreRim(doc);
    span(doc, 24, 32, 4, 1, 0, TILE_BRIDGE);
    span(doc, 73, 32, 4, 1, 0, TILE_BRIDGE);
    start(doc, 14, 18);
    start(doc, 14, 46);
    start(doc, 110, 18);
    start(doc, 110, 46);
    gem(doc, 63, 32, 3, 1400, nudge, 0);
    gem(doc, 16, 32, 1.6, 600, nudge, 1);
    gem(doc, 108, 32, 1.6, 600, nudge, 2);
  },
  dugout: (doc, nudge) => {
    doc.terrain.fill(TILE_DEEP);
    border(doc);
    const ys = [24, 46, 68, 90];
    ys.forEach((y, i) => {
      disc(doc, 32, y, 8, TILE_SAND);
      start(doc, 32, y);
      gem(doc, 32, y + (i % 2 === 0 ? 5 : -5), 1.5, 800, nudge, i);
    });
    shoreRim(doc);
    span(doc, 32, 32, 4, 0, 1, TILE_BRIDGE);
    span(doc, 32, 54, 4, 0, 1, TILE_BRIDGE);
    span(doc, 32, 76, 4, 0, 1, TILE_BRIDGE);
    dockAt(doc, 24, 20);
    dockAt(doc, 38, 98);
  },
  coastal: (doc, nudge) => {
    for (let y = 6; y < doc.h - 6; y++) {
      for (let x = 70; x < doc.w - 2; x++) set(doc, x, y, x < 74 ? TILE_SHORE : TILE_DEEP);
    }
    corners(doc, 4, 8);
    span(doc, 62, 30, 4, 1, 0, TILE_BRIDGE);
    span(doc, 62, 62, 4, 1, 0, TILE_BRIDGE);
    gem(doc, 40, 47, 2.4, 900, nudge, 0);
    gem(doc, 78, 47, 2, 1000, nudge, 1);
  },
  fury: (doc, nudge) => islands(doc, nudge, 11, false),
  wars: (doc, nudge) => islands(doc, nudge, 8, true),
  marooned: (doc, nudge) => {
    doc.terrain.fill(TILE_DEEP);
    border(doc);
    for (const [x, y] of [
      [18, 18],
      [74, 18],
      [18, 74],
      [74, 74],
    ]) {
      disc(doc, x, y, 10, TILE_SAND);
      start(doc, x, y);
    }
    shoreRim(doc);
    span(doc, 28, 46, 6, 1, 0, TILE_BRIDGE);
    gem(doc, 18, 28, 1.6, 800, nudge, 0);
    gem(doc, 74, 28, 1.6, 800, nudge, 1);
    gem(doc, 18, 64, 1.6, 800, nudge, 2);
    gem(doc, 74, 64, 1.6, 800, nudge, 3);
  },
  escape: (doc, nudge) => {
    for (let x = 8; x < doc.w - 8; x++) {
      for (let y = 4; y < 16; y++) set(doc, x, y, TILE_DEEP);
      for (let y = doc.h - 16; y < doc.h - 4; y++) set(doc, x, y, TILE_DEEP);
    }
    for (let y = 16; y < doc.h - 16; y++) {
      for (let x = 6; x < 16; x++) set(doc, x, y, TILE_ROCK);
      for (let x = doc.w - 16; x < doc.w - 6; x++) set(doc, x, y, TILE_ROCK);
    }
    valleyGap(doc, 12, 40, 4);
    valleyGap(doc, 50, 86, 4);
    shoreRim(doc);
    start(doc, 32, 28);
    start(doc, 32, 52);
    start(doc, 32, 78);
    start(doc, 32, 100);
    gem(doc, 32, 40, 2, 800, nudge, 0);
    gem(doc, 32, 88, 2, 800, nudge, 1);
  },
  noman: (doc, nudge) => {
    for (let y = 8; y < doc.h - 8; y++) {
      for (let x = 58; x < 68; x++) set(doc, x, y, TILE_CRYSTAL, 900);
    }
    start(doc, 16, 16);
    start(doc, 16, 48);
    start(doc, 108, 16);
    start(doc, 108, 48);
    gem(doc, 63, 32, 2, 900, nudge, 0);
  },
  alley: (doc, nudge) => {
    for (let y = 6; y < doc.h - 6; y++) {
      for (let x = 8; x < 18; x++) set(doc, x, y, TILE_ROCK);
      for (let x = 46; x < 56; x++) set(doc, x, y, TILE_ROCK);
      if (y % 2 === 0) set(doc, 32, y, TILE_ROAD);
    }
    for (let x = 18; x < 46; x++) {
      for (let y = 40; y < 48; y++) set(doc, x, y, TILE_SHALLOW);
      for (let y = 78; y < 86; y++) set(doc, x, y, TILE_SHALLOW);
    }
    shoreRim(doc);
    span(doc, 28, 42, 4, 0, 1, TILE_BRIDGE);
    span(doc, 28, 80, 4, 0, 1, TILE_BRIDGE);
    start(doc, 32, 16);
    start(doc, 32, 28);
    start(doc, 32, 96);
    start(doc, 32, 110);
    gem(doc, 32, 22, 1.5, 700, nudge, 0);
    gem(doc, 32, 64, 1.8, 900, nudge, 1);
    gem(doc, 32, 104, 1.5, 700, nudge, 2);
  },
  northwest: (doc, nudge) => {
    for (let i = 8; i < 88; i++) {
      set(doc, i, i, TILE_ROCK);
      set(doc, i + 1, i, TILE_ROCK);
      set(doc, i + 2, i, TILE_CLIFF);
      if (i > 10 && i < 84) set(doc, i - 2, i, TILE_ROAD);
    }
    for (let k = 0; k < 4; k++) {
      set(doc, 40 + k, 40, TILE_VALLEY);
      set(doc, 40, 40 + k, TILE_VALLEY);
    }
    corners(doc, 4);
    gem(doc, 22, 70, 2, 800, nudge, 0);
    gem(doc, 70, 22, 2, 800, nudge, 1);
  },
  central: (doc, nudge) => {
    disc(doc, 48, 48, 14, TILE_ROCK);
    disc(doc, 48, 48, 8, TILE_SAND);
    gem(doc, 48, 48, 3.2, 1400, nudge, 0);
    for (const [x, y] of [
      [48, 34],
      [48, 62],
      [34, 48],
      [62, 48],
    ]) {
      disc(doc, x, y, 3, TILE_VALLEY);
    }
    corners(doc, 4);
    gem(doc, 18, 18, 1.6, 600, nudge, 1);
    gem(doc, 78, 78, 1.6, 600, nudge, 2);
  },
  path: (doc, nudge) => {
    let x = 16;
    let y = 16;
    for (let i = 0; i < 70; i++) {
      disc(doc, x, y, 2.2, TILE_VALLEY);
      if (i % 14 < 7) x += 1;
      else y += 1;
    }
    for (let yy = 40; yy < 54; yy++) {
      for (let xx = 72; xx < 88; xx++) set(doc, xx, yy, TILE_SHALLOW);
    }
    shoreRim(doc);
    corners(doc, 4);
    gem(doc, 28, 36, 2, 800, nudge, 0);
    gem(doc, 48, 58, 2, 800, nudge, 1);
  },
  desolation: (doc, nudge) => {
    start(doc, 20, 24);
    start(doc, 74, 40);
    start(doc, 20, 74);
    start(doc, 74, 74);
    gem(doc, 34, 34, 1.2, 400, nudge, 0);
    gem(doc, 60, 48, 1.2, 400, nudge, 1);
    gem(doc, 34, 62, 1.2, 400, nudge, 2);
    disc(doc, 80, 16, 7, TILE_ROCK);
    valleyGap(doc, 78, 22, 3);
    gem(doc, 80, 14, 1.8, 1400, nudge, 3);
  },
  ivory: (doc, nudge) => {
    corners(doc, 4);
    gem(doc, 22, 35, 1.8, 700, nudge, 0);
    gem(doc, 48, 22, 1.6, 700, nudge, 1);
    gem(doc, 35, 50, 1.8, 700, nudge, 2);
    gem(doc, 55, 48, 1.5, 600, nudge, 3);
  },
  first: (doc, nudge) => {
    gem(doc, 42, 42, 6, 1300, nudge, 0);
    corners(doc, 4);
    roadTo(doc, 14, 14, 36, 36);
    roadTo(doc, 70, 14, 48, 36);
    roadTo(doc, 14, 70, 36, 48);
    roadTo(doc, 70, 70, 48, 48);
  },
  normandy: (doc, nudge) => {
    for (let x = 6; x < doc.w - 6; x++) {
      set(doc, x, 50, TILE_SHORE);
      set(doc, x, 52, TILE_SHALLOW);
      set(doc, x, 54, TILE_DEEP);
      set(doc, x, 56, TILE_DEEP);
    }
    for (let x = 8; x < doc.w - 8; x++) set(doc, x, 28, TILE_ROCK);
    valleyGap(doc, 32, 28, 4);
    span(doc, 30, 48, 3, 0, 1, TILE_BRIDGE);
    start(doc, 16, 44);
    start(doc, 48, 44);
    start(doc, 18, 16);
    start(doc, 46, 16);
    gem(doc, 32, 16, 2, 900, nudge, 0);
    gem(doc, 32, 40, 1.6, 600, nudge, 1);
  },
  raraku: (doc, nudge) => {
    for (const [x, y] of [
      [28, 24],
      [50, 30],
      [36, 52],
      [64, 58],
      [58, 18],
    ]) {
      disc(doc, x, y, 6, TILE_ROCK);
      disc(doc, x, y + 4, 2, TILE_CLIFF);
    }
    corners(doc, 4);
    gem(doc, 42, 42, 2.4, 900, nudge, 0);
    gem(doc, 22, 62, 2, 800, nudge, 1);
    gem(doc, 74, 40, 2, 800, nudge, 2);
  },
};

function islands(doc: EditorDoc, nudge: number, radius: number, open: boolean) {
  doc.terrain.fill(TILE_DEEP);
  border(doc);
  const spots = [
    [22, 22],
    [74, 22],
    [22, 74],
    [74, 74],
  ];
  for (const [x, y] of spots) {
    disc(doc, x, y, radius, TILE_SAND);
    start(doc, x, y);
  }
  disc(doc, 48, 48, open ? 6 : 9, TILE_SAND);
  shoreRim(doc);
  if (!open) {
    span(doc, 22, 34, 4, 0, 1, TILE_BRIDGE);
    span(doc, 34, 22, 4, 1, 0, TILE_FORD);
  } else {
    span(doc, 30, 22, 5, 1, 0, TILE_FORD);
    span(doc, 22, 30, 5, 0, 1, TILE_FORD);
  }
  gem(doc, 48, 48, open ? 2 : 3, 1400, nudge, 0);
  gem(doc, 22, 30, 1.4, 600, nudge, 1);
  gem(doc, 74, 66, 1.4, 600, nudge, 2);
}

function border(doc: EditorDoc) {
  for (let x = 0; x < doc.w; x++) {
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
  if (x <= 0 || y <= 0 || x >= doc.w - 1 || y >= doc.h - 1) return;
  const i = y * doc.w + x;
  doc.terrain[i] = tile;
  doc.crystal[i] = tile === TILE_CRYSTAL ? amount : 0;
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

function shoreRim(doc: EditorDoc) {
  const next = doc.terrain.slice();
  const water = (t: number) => t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD;
  for (let y = 1; y < doc.h - 1; y++) {
    for (let x = 1; x < doc.w - 1; x++) {
      const i = y * doc.w + x;
      const t = doc.terrain[i];
      if (t !== TILE_SAND && t !== TILE_CRYSTAL && t !== TILE_ROAD && t !== TILE_CLEAR && t !== TILE_ROUGH) continue;
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

function span(doc: EditorDoc, x: number, y: number, len: number, dx: number, dy: number, tile: number) {
  const n = Math.max(2, Math.min(6, len));
  set(doc, x, y, TILE_SHORE);
  for (let i = 1; i <= n; i++) set(doc, x + dx * i, y + dy * i, tile);
  set(doc, x + dx * (n + 1), y + dy * (n + 1), TILE_SHORE);
  if (tile === TILE_BRIDGE) {
    const mid = 1 + (n >> 1);
    doc.spans.push({ tx: x + dx * mid, ty: y + dy * mid });
  }
}

function start(doc: EditorDoc, x: number, y: number) {
  set(doc, x, y, TILE_SAND);
  doc.starts.push({ x: x + 0.5, y: y + 0.5 });
}

function gem(doc: EditorDoc, x: number, y: number, r: number, amount: number, nudge: number, slot: number) {
  const dx = nudge ? ((nudge * 3 + slot * 7) % 5) - 2 : 0;
  const dy = nudge ? ((nudge * 5 + slot * 3) % 5) - 2 : 0;
  const cx = Math.max(4, Math.min(doc.w - 5, x + dx));
  const cy = Math.max(4, Math.min(doc.h - 5, y + dy));
  disc(doc, cx, cy, r, TILE_CRYSTAL, amount);
}

function corners(doc: EditorDoc, n: number, inset = 0) {
  const ax = Math.max(6, Math.round(doc.w * 0.18) + inset);
  const ay = Math.max(6, Math.round(doc.h * 0.18) + inset);
  const bx = Math.min(doc.w - 7, doc.w - 1 - Math.round(doc.w * 0.18) - inset);
  const by = Math.min(doc.h - 7, doc.h - 1 - Math.round(doc.h * 0.18) - inset);
  const spots = [
    [ax, by],
    [bx, ay],
    [ax, ay],
    [bx, by],
  ];
  for (let i = 0; i < n && i < spots.length; i++) start(doc, spots[i]![0]!, spots[i]![1]!);
}

function spine(doc: EditorDoc, x: number, horizontal: number, _unused: number) {
  if (horizontal) return;
  for (let y = 4; y < doc.h - 4; y++) {
    set(doc, x, y, TILE_ROCK);
    set(doc, x + 1, y, TILE_CLIFF);
  }
}

function valleyGap(doc: EditorDoc, x: number, y: number, len: number) {
  for (let i = 0; i < len; i++) {
    set(doc, x, y + i, TILE_VALLEY);
    set(doc, x + 1, y + i, TILE_VALLEY);
  }
}

function dockAt(doc: EditorDoc, x: number, y: number) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(doc, x + dx, y + dy, TILE_SHORE);
  doc.docks.push({ tx: x, ty: y });
}

function roadTo(doc: EditorDoc, x0: number, y0: number, x1: number, y1: number) {
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 200; guard++) {
    set(doc, x, y, TILE_ROAD);
    if (x === x1 && y === y1) break;
    if (x !== x1) x += x < x1 ? 1 : -1;
    else if (y !== y1) y += y < y1 ? 1 : -1;
  }
}
