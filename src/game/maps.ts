import {
  MAP_H,
  MAP_W,
  TILE_BARN,
  TILE_BRIDGE,
  TILE_CLEAR,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_FORD,
  TILE_HIGH,
  TILE_HUT,
  TILE_PUMP,
  TILE_RAMP,
  TILE_ROCK,
  TILE_ROAD,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SCRUB,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_SPENT,
  TILE_STUMP,
  TILE_VALLEY,
  TILE_WRECK,
  type CornerId,
  type MapId,
} from "./data.ts";
import { softenField } from "./tileset.ts";
import { PALM_MASK } from "./palm-mask.ts";

export interface Span {
  tx: number;
  ty: number;
  w: number;
  h: number;
}

export interface GameMap {
  id: MapId;
  name: string;
  blurb: string;
  terrain: Uint8Array;
  crystal: Uint16Array;
  player: { x: number; y: number };
  enemy: { x: number; y: number };
  spans: Span[];
}

export interface EarthSite {
  lat: number;
  lon: number;
  zoom: number;
  place: string;
  bounds?: { west: number; south: number; east: number; north: number };
}

export const MAP_LIST: { id: MapId; name: string; blurb: string; earth?: EarthSite; player?: { x: number; y: number }; enemy?: { x: number; y: number } }[] = [
  {
    id: "palm",
    name: "Palm Isle",
    blurb: "The island picture. Beaches, cliffs, ore, and the lagoon are the real ground.",
    player: { x: 25.5, y: 36.5 },
    enemy: { x: 24.5, y: 19.5 },
  },
  {
    id: "coast",
    name: "Coastline",
    blurb: "A sea wall, two harbors, and a lagoon crossed by bridges.",
    player: { x: 36.5, y: 52.5 },
    enemy: { x: 36.5, y: 12.5 },
  },
  {
    id: "river",
    name: "River Split",
    blurb: "A deep channel cuts the field. Two bridges are the land crossing.",
    player: { x: 16.5, y: 50.5 },
    enemy: { x: 48.5, y: 14.5 },
  },
  {
    id: "isles",
    name: "Island Chain",
    blurb: "Three islands linked by bridges. Boats own the gaps.",
    player: { x: 14.5, y: 48.5 },
    enemy: { x: 50.5, y: 16.5 },
  },
  {
    id: "dry",
    name: "Dry Basin",
    blurb: "Open sand and a crystal heart. No harbor — dock and navy stay off the field.",
    player: { x: 12.5, y: 50.5 },
    enemy: { x: 50.5, y: 12.5 },
  },
  {
    id: "namib",
    name: "Sossusvlei",
    blurb: "Real Namib dunes. Open sand, a crystal heart, and a seam by each camp.",
    earth: { lat: -24.745, lon: 15.34, zoom: 16, place: "Namib-Naukluft, Namibia" },
  },
  {
    id: "atacama",
    name: "Valle de la Luna",
    blurb: "Real Atacama ridges. A broken stone spine with two crossings.",
    earth: { lat: -22.915, lon: -68.292, zoom: 16, place: "Atacama, Chile" },
  },
  {
    id: "whitesands",
    name: "White Sands",
    blurb: "Real gypsum dunes in New Mexico. Open field, rock islands, central crystal.",
    earth: { lat: 32.787, lon: -106.325, zoom: 16, place: "White Sands, New Mexico" },
  },
  {
    id: "lencois",
    name: "Lençóis",
    blurb: "Real dune lagoons on the Brazilian coast. Two crystal gardens.",
    earth: { lat: -2.485, lon: -43.13, zoom: 16, place: "Lençóis Maranhenses, Brazil" },
  },
  {
    id: "iceland",
    name: "Landmannalaugar",
    blurb: "Real rhyolite highlands. Color mountains, rock clusters, a crystal bowl.",
    earth: { lat: 63.99, lon: -19.06, zoom: 15, place: "Landmannalaugar, Iceland" },
  },
  {
    id: "pilbara",
    name: "Pilbara",
    blurb: "Real iron country in Western Australia. A diagonal ridge with two gaps.",
    earth: { lat: -22.49, lon: 118.4, zoom: 15, place: "Karijini, Australia" },
  },
  {
    id: "basin",
    name: "Dust Basin",
    blurb: "Painted field. Open sand, a rich crystal heart, and a seam beside each camp.",
  },
  {
    id: "ridge",
    name: "Split Ridge",
    blurb: "Painted field. A broken stone wall. Cross the north or south gap.",
  },
  {
    id: "oasis",
    name: "Twin Oasis",
    blurb: "Painted field. Two crystal gardens ringed with rock, joined by a sand corridor.",
  },
  {
    id: "michigan",
    name: "Michigan",
    blurb: "The state from satellite. A bridge crosses the straits. Rivers cut the mitten. Two camps up, two below.",
    player: { x: 32.5, y: 50.5 },
    enemy: { x: 16.5, y: 17.5 },
    earth: {
      lat: 45.0,
      lon: -86.35,
      zoom: 8,
      place: "Michigan, United States",
      bounds: { west: -90.55, south: 41.55, east: -82.15, north: 48.45 },
    },
  },
  {
    id: "plates",
    name: "World Plates",
    blurb: "Four continents. The only roads between them are bridges. Boats go around.",
    player: { x: 14.5, y: 40.5 },
    enemy: { x: 50.5, y: 22.5 },
  },
  {
    id: "links",
    name: "Bridge World",
    blurb: "Two landmasses and a chain of islands. Every crossing is a bridge.",
    player: { x: 12.5, y: 46.5 },
    enemy: { x: 52.5, y: 16.5 },
  },
];

export function earthOf(id: MapId): EarthSite | null {
  return MAP_LIST.find((m) => m.id === id)?.earth ?? null;
}

const PLAYER = { x: 12.5, y: 50.5 };
const ENEMY = { x: 50.5, y: 12.5 };

function idx(x: number, y: number): number {
  return y * MAP_W + x;
}

function disk(
  terrain: Uint8Array,
  crystal: Uint16Array,
  cx: number,
  cy: number,
  r: number,
  tile: number,
  amount = 0,
) {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(MAP_H - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(MAP_W - 1, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        terrain[idx(x, y)] = tile;
        if (tile === TILE_CRYSTAL) crystal[idx(x, y)] = amount;
        else crystal[idx(x, y)] = 0;
      }
    }
  }
}

function clearPad(terrain: Uint8Array, crystal: Uint16Array, cx: number, cy: number) {
  for (let y = Math.floor(cy) - 8; y <= Math.floor(cy) + 8; y++) {
    for (let x = Math.floor(cx) - 8; x <= Math.floor(cx) + 8; x++) {
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
      const t = terrain[idx(x, y)];
      if (
        t === TILE_DEEP ||
        t === TILE_SHALLOW ||
        t === TILE_SHORE ||
        t === TILE_BRIDGE ||
        t === TILE_ROCK ||
        t === TILE_CLIFF
      ) {
        continue;
      }
      terrain[idx(x, y)] = TILE_SAND;
      crystal[idx(x, y)] = 0;
    }
  }
}

function scatterScrub(terrain: Uint8Array, salt: number) {
  for (let y = 2; y < MAP_H - 2; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      if (terrain[idx(x, y)] !== TILE_SAND) continue;
      const n = (x * 13 + y * 29 + salt * 17) % 47;
      if (n === 0) terrain[idx(x, y)] = TILE_SCRUB;
    }
  }
}

function baseTerrain(): { terrain: Uint8Array; crystal: Uint16Array } {
  const terrain = new Uint8Array(MAP_W * MAP_H);
  const crystal = new Uint16Array(MAP_W * MAP_H);
  terrain.fill(TILE_SAND);
  // Soft border of rock so units stay on the field.
  for (let i = 0; i < MAP_W; i++) {
    terrain[idx(i, 0)] = TILE_ROCK;
    terrain[idx(i, MAP_H - 1)] = TILE_ROCK;
    terrain[idx(0, i)] = TILE_ROCK;
    terrain[idx(MAP_W - 1, i)] = TILE_ROCK;
  }
  return { terrain, crystal };
}

function layNamib(terrain: Uint8Array, crystal: Uint16Array) {
  disk(terrain, crystal, 32, 32, 6.5, TILE_CRYSTAL, 900);
  disk(terrain, crystal, 20, 38, 2.4, TILE_CRYSTAL, 720);
  disk(terrain, crystal, 44, 24, 2.4, TILE_CRYSTAL, 720);
  disk(terrain, crystal, 30, 18, 2.2, TILE_ROCK);
  disk(terrain, crystal, 36, 48, 2, TILE_ROCK);
}

function layAtacama(terrain: Uint8Array, crystal: Uint16Array) {
  for (let y = 8; y < 56; y++) {
    const gap = (y >= 20 && y <= 26) || (y >= 38 && y <= 44);
    if (gap || (y + 3) % 5 === 0) continue;
    terrain[idx(30, y)] = TILE_ROCK;
    terrain[idx(33, y)] = TILE_ROCK;
  }
  disk(terrain, crystal, 16, 32, 4, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 48, 32, 4, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 18, 44, 2.2, TILE_CRYSTAL, 700);
  disk(terrain, crystal, 46, 18, 2.2, TILE_CRYSTAL, 700);
}

function layWhite(terrain: Uint8Array, crystal: Uint16Array) {
  disk(terrain, crystal, 32, 30, 5.5, TILE_CRYSTAL, 880);
  disk(terrain, crystal, 18, 42, 2.8, TILE_CRYSTAL, 740);
  disk(terrain, crystal, 48, 20, 2.8, TILE_CRYSTAL, 740);
  disk(terrain, crystal, 24, 20, 2.4, TILE_ROCK);
  disk(terrain, crystal, 42, 44, 2.6, TILE_ROCK);
  disk(terrain, crystal, 40, 16, 1.8, TILE_ROCK);
  disk(terrain, crystal, 22, 48, 1.6, TILE_ROCK);
}

function layLencois(terrain: Uint8Array, crystal: Uint16Array) {
  disk(terrain, crystal, 22, 28, 5, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 42, 36, 5, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 32, 22, 2, TILE_ROCK);
  disk(terrain, crystal, 32, 46, 2.2, TILE_ROCK);
  disk(terrain, crystal, 14, 18, 1.8, TILE_ROCK);
  disk(terrain, crystal, 50, 48, 1.8, TILE_ROCK);
}

function layIceland(terrain: Uint8Array, crystal: Uint16Array) {
  disk(terrain, crystal, 26, 24, 3.2, TILE_ROCK);
  disk(terrain, crystal, 38, 40, 3.4, TILE_ROCK);
  disk(terrain, crystal, 18, 40, 2.2, TILE_ROCK);
  disk(terrain, crystal, 48, 22, 2.2, TILE_ROCK);
  disk(terrain, crystal, 32, 32, 4.4, TILE_CRYSTAL, 900);
  disk(terrain, crystal, 16, 28, 2.3, TILE_CRYSTAL, 700);
  disk(terrain, crystal, 48, 36, 2.3, TILE_CRYSTAL, 700);
}

function layPilbara(terrain: Uint8Array, crystal: Uint16Array) {
  for (let i = 6; i < 58; i++) {
    const gap = (i >= 22 && i <= 28) || (i >= 40 && i <= 46);
    if (gap) continue;
    const x = i;
    const y = 58 - i;
    if (x > 1 && y > 1 && x < 62 && y < 62) {
      terrain[idx(x, y)] = TILE_ROCK;
      if (y + 1 < 63) terrain[idx(x, y + 1)] = TILE_ROCK;
    }
  }
  disk(terrain, crystal, 20, 22, 3.6, TILE_CRYSTAL, 820);
  disk(terrain, crystal, 44, 44, 3.6, TILE_CRYSTAL, 820);
  disk(terrain, crystal, 18, 40, 2.2, TILE_CRYSTAL, 700);
  disk(terrain, crystal, 46, 20, 2.2, TILE_CRYSTAL, 700);
}

function fillRect(terrain: Uint8Array, x0: number, y0: number, x1: number, y1: number, tile: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
      terrain[idx(x, y)] = tile;
    }
  }
}

function spanBridge(terrain: Uint8Array, spans: Span[], x: number, y: number, w: number, h: number) {
  fillRect(terrain, x, y, x + w - 1, y + h - 1, TILE_BRIDGE);
  spans.push({ tx: x, ty: y, w, h });
}

/** Ocean between continents. Armies cross only where a bridge is laid. */
function layPlates(terrain: Uint8Array, crystal: Uint16Array, spans: Span[]) {
  terrain.fill(TILE_DEEP);
  for (let i = 0; i < MAP_W; i++) {
    terrain[idx(i, 0)] = TILE_ROCK;
    terrain[idx(i, MAP_H - 1)] = TILE_ROCK;
    terrain[idx(0, i)] = TILE_ROCK;
    terrain[idx(MAP_W - 1, i)] = TILE_ROCK;
  }
  fillRect(terrain, 4, 10, 24, 54, TILE_SAND);
  fillRect(terrain, 40, 10, 59, 54, TILE_SAND);
  fillRect(terrain, 26, 6, 38, 18, TILE_SAND);
  fillRect(terrain, 26, 46, 38, 58, TILE_SAND);
  spanBridge(terrain, spans, 22, 30, 20, 3);
  spanBridge(terrain, spans, 30, 16, 3, 16);
  spanBridge(terrain, spans, 30, 33, 3, 15);
  disk(terrain, crystal, 14, 28, 2.4, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 50, 36, 2.6, TILE_CRYSTAL, 900);
  disk(terrain, crystal, 32, 12, 2, TILE_CRYSTAL, 1100);
  disk(terrain, crystal, 32, 52, 2, TILE_CRYSTAL, 800);
  paintShore(terrain);
}

/** Two home continents and a diagonal island chain, each hop a bridge. */
function layLinks(terrain: Uint8Array, crystal: Uint16Array, spans: Span[]) {
  terrain.fill(TILE_DEEP);
  for (let i = 0; i < MAP_W; i++) {
    terrain[idx(i, 0)] = TILE_ROCK;
    terrain[idx(i, MAP_H - 1)] = TILE_ROCK;
    terrain[idx(0, i)] = TILE_ROCK;
    terrain[idx(MAP_W - 1, i)] = TILE_ROCK;
  }
  fillRect(terrain, 4, 28, 22, 58, TILE_SAND);
  fillRect(terrain, 42, 6, 59, 36, TILE_SAND);
  island(terrain, 30, 44, 4);
  island(terrain, 34, 32, 3.5);
  island(terrain, 38, 22, 3.5);
  spanBridge(terrain, spans, 20, 46, 8, 2);
  spanBridge(terrain, spans, 32, 38, 2, 6);
  spanBridge(terrain, spans, 36, 26, 2, 6);
  spanBridge(terrain, spans, 40, 20, 6, 2);
  disk(terrain, crystal, 12, 40, 2.3, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 50, 18, 2.4, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 34, 32, 1.6, TILE_CRYSTAL, 1200);
  paintShore(terrain);
}

function layCoast(terrain: Uint8Array, crystal: Uint16Array, spans: Span[]) {
  // Right-side ocean wall with shore.
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 50; x < MAP_W - 1; x++) {
      terrain[idx(x, y)] = x >= 54 ? TILE_DEEP : x >= 52 ? TILE_SHALLOW : TILE_SHORE;
    }
  }
  // Horizontal lagoon.
  for (let y = 30; y <= 33; y++) {
    for (let x = 1; x <= 51; x++) terrain[idx(x, y)] = TILE_DEEP;
  }
  const bridges: [number, number][] = [
    [18, 30],
    [40, 30],
  ];
  for (const [bx, by] of bridges) {
    for (let y = by; y <= by + 3; y++) {
      for (let x = bx; x <= bx + 2; x++) terrain[idx(x, y)] = TILE_BRIDGE;
    }
    spans.push({ tx: bx, ty: by + 1, w: 3, h: 2 });
  }
  const seed = 0xc0a57;
  const rng = (x: number, y: number) => {
    let n = Math.imul(x ^ seed, 374761393) + Math.imul(y ^ seed, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 2; y < MAP_H - 2; y++) {
    for (let x = 2; x < 50; x++) {
      const t = terrain[idx(x, y)];
      if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_BRIDGE || t === TILE_SHORE) continue;
      const r = rng(x, y);
      if (r < 0.018) terrain[idx(x, y)] = TILE_ROCK;
      else if (r < 0.032) terrain[idx(x, y)] = TILE_SCRUB;
      else if (r < 0.042) terrain[idx(x, y)] = TILE_VALLEY;
      else if (r < 0.048) terrain[idx(x, y)] = TILE_HUT;
      else if (r < 0.055) terrain[idx(x, y)] = TILE_ROAD;
    }
  }
  disk(terrain, crystal, 16, 44, 4, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 22, 18, 3.2, TILE_CRYSTAL, 800);
  disk(terrain, crystal, 34, 46, 2.4, TILE_CRYSTAL, 720);
  disk(terrain, crystal, 28, 16, 2.2, TILE_CRYSTAL, 700);
  disk(terrain, crystal, 8, 22, 1.8, TILE_ROCK);
  disk(terrain, crystal, 12, 54, 1.6, TILE_ROCK);
  disk(terrain, crystal, 26, 38, 2.2, TILE_CLIFF);
  disk(terrain, crystal, 38, 24, 1.8, TILE_CLIFF);
  paintShore(terrain);
}

function layRiver(terrain: Uint8Array, crystal: Uint16Array, spans: Span[]) {
  for (let y = 1; y < MAP_H - 1; y++) {
    const bridge = (y >= 16 && y <= 18) || (y >= 46 && y <= 48);
    for (let x = 30; x <= 33; x++) terrain[idx(x, y)] = bridge ? TILE_BRIDGE : TILE_DEEP;
    if (!bridge) {
      terrain[idx(28, y)] = TILE_SHORE;
      terrain[idx(29, y)] = TILE_SHORE;
      terrain[idx(34, y)] = TILE_SHORE;
      terrain[idx(35, y)] = TILE_SHORE;
    }
  }
  spans.push({ tx: 30, ty: 16, w: 4, h: 3 }, { tx: 30, ty: 46, w: 4, h: 3 });
  disk(terrain, crystal, 16, 32, 4.2, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 48, 32, 4.2, TILE_CRYSTAL, 860);
  disk(terrain, crystal, 14, 42, 2.2, TILE_CRYSTAL, 700);
  disk(terrain, crystal, 50, 20, 2.2, TILE_CRYSTAL, 700);
}

function layIsles(terrain: Uint8Array, crystal: Uint16Array, spans: Span[]) {
  terrain.fill(TILE_DEEP);
  for (let i = 0; i < MAP_W; i++) {
    terrain[idx(i, 0)] = TILE_ROCK;
    terrain[idx(i, MAP_H - 1)] = TILE_ROCK;
    terrain[idx(0, i)] = TILE_ROCK;
    terrain[idx(MAP_W - 1, i)] = TILE_ROCK;
  }
  island(terrain, 14, 48, 8);
  island(terrain, 50, 16, 8);
  island(terrain, 32, 32, 6);
  for (let i = 0; i < 8; i++) {
    terrain[idx(20 + i, 40 - i)] = TILE_BRIDGE;
    terrain[idx(36 + i, 28 - i)] = TILE_BRIDGE;
  }
  spans.push({ tx: 22, ty: 38, w: 3, h: 1 }, { tx: 40, ty: 24, w: 3, h: 1 });
  disk(terrain, crystal, 32, 32, 3.2, TILE_CRYSTAL, 900);
  disk(terrain, crystal, 14, 44, 2, TILE_CRYSTAL, 700);
  disk(terrain, crystal, 50, 20, 2, TILE_CRYSTAL, 700);
  paintShore(terrain);
  thickenShore(terrain);
}

function layDry(terrain: Uint8Array, crystal: Uint16Array) {
  disk(terrain, crystal, 32, 32, 7.2, TILE_CRYSTAL, 900);
  disk(terrain, crystal, 18, 40, 2.6, TILE_CRYSTAL, 750);
  disk(terrain, crystal, 46, 22, 2.6, TILE_CRYSTAL, 750);
  disk(terrain, crystal, 46, 40, 3.2, TILE_DEEP);
  disk(terrain, crystal, 8, 18, 3.2, TILE_ROCK);
  disk(terrain, crystal, 56, 48, 3.4, TILE_ROCK);
  paintShore(terrain);
}

function island(terrain: Uint8Array, cx: number, cy: number, r: number) {
  const r2 = r * r;
  for (let y = Math.max(1, Math.floor(cy - r - 1)); y <= Math.min(MAP_H - 2, Math.ceil(cy + r + 1)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r - 1)); x <= Math.min(MAP_W - 2, Math.ceil(cx + r + 1)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = dx * dx + dy * dy;
      if (d <= r2) terrain[idx(x, y)] = TILE_SAND;
      else if (d <= (r + 1.6) * (r + 1.6)) terrain[idx(x, y)] = TILE_SHALLOW;
    }
  }
}

function paintShore(terrain: Uint8Array) {
  const next = terrain.slice();
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const t = terrain[idx(x, y)];
      if (t !== TILE_SAND && t !== TILE_SCRUB) continue;
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = terrain[idx(x + dx, y + dy)];
          if (n === TILE_DEEP || n === TILE_SHALLOW) wet = true;
        }
      }
      if (wet) next[idx(x, y)] = TILE_SHORE;
    }
  }
  terrain.set(next);
}

function thickenShore(terrain: Uint8Array) {
  const next = terrain.slice();
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (terrain[idx(x, y)] !== TILE_SHALLOW) continue;
      let beside = false;
      for (let dy = -1; dy <= 1 && !beside; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (terrain[idx(x + dx, y + dy)] === TILE_SHORE) beside = true;
        }
      }
      if (beside) next[idx(x, y)] = TILE_SHORE;
    }
  }
  terrain.set(next);
}

/** Land bitset, 64×64, row-major. Bit set means the State of Michigan. */
const MICHIGAN_LAND =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AAAAAAACABwAAAAAAAMADAAAAAAAA8AEAAAAAAAD8AAAAAAAAAP4eAAAAAADg/38AAAMAAPj/fwD+AwAA/P//gP8DAAD4//////8BAPD//////wEAAP//////AQAA+P////8BAABA//8/3AcAAAD4/wAIAAAAAPjfAAAAAAAA4AMAPAAAAADgAQD+AQAAAOABAPwHAAAA8AAA/B8AAABAAAD/PwAAAEAAgP9/AAAAAACg/z8AAAAAALD/fwAAAAAAvP9/AAAAAAD8/38AAAAAAP7/fwAAAAAA/v9/AAAAAAD+/38AAAAAAP//PwAAAAAA//8fAAAAAID//x8AAAAAgP//hw8AAACA//+HDwAAAID//8MPAAAAgP//7x8AAACA////HwAAAID///8fAAAAAP///x8AAAAA////HwAAAAD+//8/AAAAAP7//z8AAAAA/v//PwAAAAD+//8fAAAAAP7//xcAAAAA/v//BwAAAAD///8DAAAAAP///wEAAACA////AAAAAID///8AAAAAwP///wAAAADg//8/AAAAAAAA8AcAAAAAAAAAAAA=";

function layMichigan(terrain: Uint8Array, crystal: Uint16Array, spans: Span[]) {
  const land = new Uint8Array(MAP_W * MAP_H);
  const bits = Uint8Array.from(atob(MICHIGAN_LAND), (c) => c.charCodeAt(0));
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const on = ((bits[i >> 3] >> (i & 7)) & 1) === 1;
      land[i] = on ? 1 : 0;
      terrain[i] = on ? TILE_SCRUB : TILE_DEEP;
      crystal[i] = 0;
    }
  }
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (!land[idx(x, y)]) continue;
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!land[idx(x + dx, y + dy)]) wet = true;
        }
      }
      if (wet) terrain[idx(x, y)] = TILE_SHORE;
    }
  }
  // Straits deck runs north-south, shore to shore. Not a ribbon laid in the lake.
  for (let y = 23; y <= 26; y++) {
    for (let x = 43; x <= 44; x++) terrain[idx(x, y)] = TILE_BRIDGE;
  }
  spans.push({ tx: 43, ty: 23, w: 2, h: 4 });
  // Satellite shore fringe the state mask still called land. Troops were walking the lake.
  for (const [x, y] of MICHIGAN_FRINGE) {
    if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
    const t = terrain[idx(x, y)];
    if (t === TILE_SCRUB || t === TILE_SAND || t === TILE_SHORE) terrain[idx(x, y)] = TILE_DEEP;
  }
  refreshShore(terrain);
  carveRiver(terrain, [
    [48, 54],
    [44, 55],
    [40, 54],
    [37, 52],
  ]);
  carveRiver(terrain, [
    [52, 40],
    [48, 42],
    [44, 43],
    [40, 41],
    [36, 39],
    [34, 37],
  ]);
  carveRiver(terrain, [
    [49, 33],
    [45, 34],
    [41, 33],
    [37, 32],
    [35, 30],
  ]);
  refreshShore(terrain);
  // Ranges sit on the upper peninsula. A gap stays open so an army goes around, not over.
  ridge(terrain, crystal, 8, 17, 3.1, 1.45);
  ridge(terrain, crystal, 14, 15, 1.8, 1.05);
  ridge(terrain, crystal, 23, 20, 2.4, 1.25);
  ridge(terrain, crystal, 47, 36, 2.2, 1.15);
  placeField(terrain, crystal, 20, 19, 2.2, 1800);
  placeField(terrain, crystal, 36, 20, 2.0, 1600);
  placeField(terrain, crystal, 30, 42, 2.2, 1700);
  placeField(terrain, crystal, 38, 36, 2.0, 1500);
  placeField(terrain, crystal, 46, 40, 2.2, 1800);
  placeField(terrain, crystal, 34, 56, 2.0, 1600);
  placeField(terrain, crystal, 44, 52, 2.0, 1600);
  placeField(terrain, crystal, 50, 46, 1.8, 1400);
  placeField(terrain, crystal, 40, 48, 1.8, 1500);
}

/** Cells the state mask called land but the satellite photo shows as lake. */
const MICHIGAN_FRINGE: [number, number][] = [
  [41, 27],
  [40, 16],
  [31, 58],
  [32, 56],
  [29, 61],
  [42, 29],
  [37, 34],
  [31, 18],
  [16, 10],
  [50, 28],
  [3, 17],
  [41, 16],
  [39, 32],
  [28, 19],
  [39, 31],
  [33, 17],
  [31, 47],
  [30, 60],
  [32, 39],
  [37, 33],
  [52, 29],
  [49, 28],
];

function refreshShore(terrain: Uint8Array) {
  const next = terrain.slice();
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const t = terrain[idx(x, y)];
      if (t !== TILE_SCRUB && t !== TILE_SAND) continue;
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = terrain[idx(x + dx, y + dy)];
          if (n === TILE_DEEP || n === TILE_SHALLOW || n === TILE_FORD) wet = true;
        }
      }
      if (wet) next[idx(x, y)] = TILE_SHORE;
    }
  }
  terrain.set(next);
}

/** Two tiles wide. Impassable except two fords, so the picture matches the path. */
function carveRiver(terrain: Uint8Array, pts: [number, number][]) {
  const carved: [number, number][] = [];
  const stamp = (x: number, y: number) => {
    if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) return;
    const t = terrain[idx(x, y)];
    if (t !== TILE_SCRUB && t !== TILE_SAND && t !== TILE_SHORE && t !== TILE_CRYSTAL) return;
    terrain[idx(x, y)] = TILE_DEEP;
    carved.push([x, y]);
  };
  const plot = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x);
    const sx = x < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y);
    const sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 80; guard++) {
      stamp(x, y);
      stamp(x + 1, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  };
  for (let i = 1; i < pts.length; i++) plot(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  const fordAt = (n: number) => {
    if (!carved.length) return;
    const [x, y] = carved[Math.max(0, Math.min(carved.length - 1, n))];
    if (terrain[idx(x, y)] === TILE_DEEP) terrain[idx(x, y)] = TILE_FORD;
    if (x + 1 < MAP_W - 1 && terrain[idx(x + 1, y)] === TILE_DEEP) terrain[idx(x + 1, y)] = TILE_FORD;
  };
  fordAt(Math.floor(carved.length * 0.38));
  fordAt(Math.floor(carved.length * 0.72));
}

function ridge(terrain: Uint8Array, crystal: Uint16Array, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.max(1, Math.floor(cy - ry - 1)); y <= Math.min(MAP_H - 2, Math.ceil(cy + ry + 1)); y++) {
    for (let x = Math.max(1, Math.floor(cx - rx - 1)); x <= Math.min(MAP_W - 2, Math.ceil(cx + rx + 1)); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const t = terrain[idx(x, y)];
      if (t !== TILE_SCRUB && t !== TILE_SAND && t !== TILE_SHORE) continue;
      terrain[idx(x, y)] = TILE_ROCK;
      crystal[idx(x, y)] = 0;
    }
  }
}

function placeField(terrain: Uint8Array, crystal: Uint16Array, cx: number, cy: number, r: number, amount: number) {
  const r2 = r * r;
  for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(MAP_H - 2, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= Math.min(MAP_W - 2, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const t = terrain[idx(x, y)];
      if (t !== TILE_SCRUB && t !== TILE_SAND && t !== TILE_SHORE) continue;
      terrain[idx(x, y)] = TILE_CRYSTAL;
      crystal[idx(x, y)] = amount;
    }
  }
}

function layPalm(terrain: Uint8Array, crystal: Uint16Array) {
  const code: Record<string, number> = {
    "0": TILE_SAND,
    "1": TILE_ROCK,
    "2": TILE_CRYSTAL,
    "6": TILE_DEEP,
    "7": TILE_CLIFF,
    "8": TILE_SHORE,
  };
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = code[PALM_MASK[y * MAP_W + x] ?? "6"] ?? TILE_DEEP;
      terrain[idx(x, y)] = t;
      crystal[idx(x, y)] = t === TILE_CRYSTAL ? 420 : 0;
    }
  }
}

const LAYOUT: Record<MapId, (terrain: Uint8Array, crystal: Uint16Array, spans: Span[]) => void> = {
  palm: layPalm,
  michigan: (terrain, crystal, spans) => layMichigan(terrain, crystal, spans),
  plates: layPlates,
  links: layLinks,
  namib: layNamib,
  atacama: layAtacama,
  whitesands: layWhite,
  lencois: layLencois,
  iceland: layIceland,
  pilbara: layPilbara,
  coast: layCoast,
  river: layRiver,
  isles: layIsles,
  dry: (terrain, crystal) => layDry(terrain, crystal),
  basin: (terrain, crystal) => {
    disk(terrain, crystal, 32, 32, 7.2, TILE_CRYSTAL, 900);
    disk(terrain, crystal, 18, 40, 2.6, TILE_CRYSTAL, 750);
    disk(terrain, crystal, 46, 22, 2.6, TILE_CRYSTAL, 750);
    disk(terrain, crystal, 8, 18, 3.2, TILE_ROCK);
    disk(terrain, crystal, 56, 48, 3.4, TILE_ROCK);
    disk(terrain, crystal, 40, 46, 2.2, TILE_ROCK);
    disk(terrain, crystal, 22, 16, 2.4, TILE_ROCK);
    disk(terrain, crystal, 28, 50, 1.6, TILE_ROCK);
  },
  ridge: (terrain, crystal) => {
    for (let y = 1; y < MAP_H - 1; y++) {
      const gap = (y >= 14 && y <= 18) || (y >= 44 && y <= 48);
      if (gap) continue;
      terrain[idx(31, y)] = TILE_ROCK;
      terrain[idx(32, y)] = TILE_ROCK;
    }
    disk(terrain, crystal, 18, 32, 4.2, TILE_CRYSTAL, 850);
    disk(terrain, crystal, 46, 30, 4.2, TILE_CRYSTAL, 850);
    disk(terrain, crystal, 16, 42, 2.2, TILE_CRYSTAL, 700);
    disk(terrain, crystal, 48, 20, 2.2, TILE_CRYSTAL, 700);
    disk(terrain, crystal, 22, 18, 2, TILE_ROCK);
    disk(terrain, crystal, 42, 46, 2, TILE_ROCK);
  },
  oasis: (terrain, crystal) => {
    disk(terrain, crystal, 20, 30, 5.2, TILE_CRYSTAL, 880);
    disk(terrain, crystal, 44, 34, 5.2, TILE_CRYSTAL, 880);
    disk(terrain, crystal, 16, 44, 2.3, TILE_CRYSTAL, 700);
    disk(terrain, crystal, 48, 18, 2.3, TILE_CRYSTAL, 700);
    for (let a = 0; a < 12; a++) {
      if (a === 2 || a === 3 || a === 8) continue;
      const ang = (a / 12) * Math.PI * 2;
      const x = Math.round(20 + Math.cos(ang) * 8);
      const y = Math.round(30 + Math.sin(ang) * 8);
      if (x > 1 && y > 1 && x < 62 && y < 62) terrain[idx(x, y)] = TILE_ROCK;
    }
    for (let a = 0; a < 12; a++) {
      if (a === 5 || a === 6 || a === 11) continue;
      const ang = (a / 12) * Math.PI * 2;
      const x = Math.round(44 + Math.cos(ang) * 8);
      const y = Math.round(34 + Math.sin(ang) * 8);
      if (x > 1 && y > 1 && x < 62 && y < 62) terrain[idx(x, y)] = TILE_ROCK;
    }
    disk(terrain, crystal, 32, 48, 2.1, TILE_ROCK);
    disk(terrain, crystal, 32, 14, 2.1, TILE_ROCK);
  },
};

function gradeDepth(terrain: Uint8Array) {
  const next = terrain.slice();
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (terrain[idx(x, y)] !== TILE_DEEP) continue;
      let shelf = false;
      for (let dy = -1; dy <= 1 && !shelf; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = terrain[idx(x + dx, y + dy)];
          if (n !== TILE_DEEP && n !== TILE_SHALLOW && n !== TILE_BRIDGE) shelf = true;
        }
      }
      if (shelf) next[idx(x, y)] = TILE_SHALLOW;
    }
  }
  terrain.set(next);
}

function saltOf(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 33 + id.charCodeAt(i)) | 0;
  return Math.abs(n % 97) + 1;
}

export function generateMap(id: MapId): GameMap {
  const meta = MAP_LIST.find((m) => m.id === id) ?? MAP_LIST[0];
  const { terrain, crystal } = baseTerrain();
  const spans: Span[] = [];
  LAYOUT[meta.id](terrain, crystal, spans);

  const player = meta.player ?? { ...PLAYER };
  const enemy = meta.enemy ?? { ...ENEMY };
  clearPad(terrain, crystal, player.x, player.y);
  clearPad(terrain, crystal, enemy.x, enemy.y);
  if (meta.id !== "palm") scatterScrub(terrain, saltOf(meta.id));
  clearPad(terrain, crystal, player.x, player.y);
  clearPad(terrain, crystal, enemy.x, enemy.y);
  if (meta.id !== "palm") {
    gradeDepth(terrain);
    softenField(terrain, MAP_W, MAP_H, [player, enemy], true);
  }

  return {
    id: meta.id,
    name: meta.name,
    blurb: meta.blurb,
    terrain,
    crystal,
    player,
    enemy,
    spans,
  };
}

function landTile(t: number): boolean {
  return (
    t === TILE_SAND ||
    t === TILE_SCRUB ||
    t === TILE_CRYSTAL ||
    t === TILE_SHORE ||
    t === TILE_SPENT
  );
}

/** Pull a start onto sand if a resample dropped it in rock or water. */
export function snapLand(terrain: Uint8Array, gw: number, x: number, y: number): { x: number; y: number } {
  const ok = (tx: number, ty: number) => {
    if (tx < 2 || ty < 2 || tx >= gw - 2 || ty >= gw - 2) return false;
    return landTile(terrain[(ty | 0) * gw + (tx | 0)]);
  };
  if (ok(x, y)) return { x, y };
  for (let r = 1; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return { x: Math.max(4, Math.min(gw - 5, x)), y: Math.max(4, Math.min(gw - 5, y)) };
}

function padOk(terrain: Uint8Array, gw: number, x: number, y: number): boolean {
  let land = 0;
  let n = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 1 || yy < 1 || xx >= gw - 1 || yy >= gw - 1) return false;
      n++;
      if (landTile(terrain[yy * gw + xx])) land++;
    }
  }
  return land >= n * 0.82;
}

/** Authored camps first, then the sand pads farthest from those already taken. */
export function campSites(
  terrain: Uint8Array,
  gw: number,
  anchors: { x: number; y: number }[],
  count: number,
): { x: number; y: number }[] {
  const picked: { x: number; y: number }[] = [];
  for (const a of anchors) {
    if (picked.length >= count) break;
    picked.push(snapLand(terrain, gw, a.x, a.y));
  }
  const cands: { x: number; y: number }[] = [];
  for (let y = 6; y < gw - 6; y += 3) {
    for (let x = 6; x < gw - 6; x += 3) {
      if (padOk(terrain, gw, x, y)) cands.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  while (picked.length < count) {
    let best: { x: number; y: number } | null = null;
    let bestD = -1;
    for (const c of cands) {
      let min = Infinity;
      for (const p of picked) min = Math.min(min, Math.hypot(c.x - p.x, c.y - p.y));
      if (min > bestD) {
        bestD = min;
        best = c;
      }
    }
    if (!best || bestD < 8) break;
    picked.push(best);
  }
  while (picked.length < count) {
    const last = picked[picked.length - 1] ?? { x: gw * 0.5, y: gw * 0.5 };
    picked.push(snapLand(terrain, gw, Math.min(gw - 8, last.x + 10), Math.max(8, last.y - 6)));
  }
  return picked;
}

/** Clear crystal under a camp. Water, rock, and shore stay so harbors are not filled in. */
export function stampCamp(
  terrain: Uint8Array,
  crystal: Uint16Array,
  cx: number,
  cy: number,
  gw: number,
  gh = gw,
) {
  for (let y = Math.floor(cy) - 6; y <= Math.floor(cy) + 6; y++) {
    for (let x = Math.floor(cx) - 6; x <= Math.floor(cx) + 6; x++) {
      if (x < 1 || y < 1 || x >= gw - 1 || y >= gh - 1) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > 36) continue;
      const i = y * gw + x;
      const t = terrain[i];
      if (
        t === TILE_DEEP ||
        t === TILE_SHALLOW ||
        t === TILE_BRIDGE ||
        t === TILE_ROCK ||
        t === TILE_CLIFF ||
        t === TILE_SHORE
      ) {
        continue;
      }
      terrain[i] = TILE_SAND;
      crystal[i] = 0;
    }
  }
}

export interface FieldProp {
  x: number;
  y: number;
  kind: "wreck" | "fence" | "crate";
}

function dressHash(x: number, y: number, salt: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function nearPad(pads: { x: number; y: number }[], x: number, y: number, r: number): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  for (const p of pads) {
    if ((px - p.x) * (px - p.x) + (py - p.y) * (py - p.y) < r * r) return true;
  }
  return false;
}

function stampMesa(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  cx: number,
  cy: number,
  pads: { x: number; y: number }[],
) {
  const r = 3.7;
  const cells: number[] = [];
  for (let y = Math.max(2, Math.floor(cy - r)); y <= Math.min(gh - 3, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(2, Math.floor(cx - r)); x <= Math.min(gw - 3, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      if (nearPad(pads, x, y, 8)) continue;
      const i = y * gw + x;
      const t = terrain[i] ?? 0;
      if ((crystal[i] ?? 0) > 0) continue;
      if (
        t === TILE_DEEP ||
        t === TILE_SHALLOW ||
        t === TILE_FORD ||
        t === TILE_BRIDGE ||
        t === TILE_WRECK ||
        t === TILE_ROCK ||
        t === TILE_CLIFF ||
        t === TILE_CRYSTAL
      ) {
        continue;
      }
      cells.push(i);
    }
  }
  if (cells.length < 8) return;
  for (const i of cells) terrain[i] = TILE_HIGH;
  for (const i of cells) {
    const x = i % gw;
    const y = (i / gw) | 0;
    const edge = [terrain[i - 1], terrain[i + 1], terrain[i - gw], terrain[i + gw]].some(
      (n) => n !== TILE_HIGH && n !== TILE_CLIFF && n !== TILE_RAMP,
    );
    if (edge) terrain[i] = TILE_CLIFF;
  }
}

function dryDisk(terrain: Uint8Array, gw: number, gh: number, cx: number, cy: number, pads: { x: number; y: number }[]): number {
  const r = 3.4;
  let n = 0;
  for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(gh - 2, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= Math.min(gw - 2, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      if (nearPad(pads, x, y, 8)) continue;
      const t = terrain[y * gw + x] ?? 0;
      if (t === TILE_SAND || t === TILE_CLEAR || t === TILE_ROUGH || t === TILE_SCRUB || t === TILE_ROAD) n++;
    }
  }
  return n;
}

/** One mesa beside each camp-to-center line, on dry ground, so both sides share the high ground. */
function layFairMesas(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
) {
  let raised = 0;
  for (const t of terrain) if (t === TILE_HIGH || t === TILE_CLIFF) raised++;
  if (raised > 10) return;
  const cx = gw / 2;
  const cy = gh / 2;
  for (const p of pads) {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const along = Math.min(10, len * 0.28);
    const px = -dy / len;
    const py = dx / len;
    const ax = p.x + (dx / len) * along;
    const ay = p.y + (dy / len) * along;
    const a = { x: ax + px * 7, y: ay + py * 7 };
    const b = { x: ax - px * 7, y: ay - py * 7 };
    const spot = dryDisk(terrain, gw, gh, a.x, a.y, pads) >= dryDisk(terrain, gw, gh, b.x, b.y, pads) ? a : b;
    stampMesa(terrain, crystal, gw, gh, spot.x, spot.y, pads);
  }
}

/** Push each ramp two more tiles downhill so the slope is two or three tiles, not a step. */
function lengthenRamps(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
) {
  const extra: number[] = [];
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const;
  for (let y = 2; y < gh - 2; y++) {
    for (let x = 2; x < gw - 2; x++) {
      if ((terrain[y * gw + x] ?? 0) !== TILE_RAMP) continue;
      let dx = 0;
      let dy = 0;
      for (const [sx, sy] of dirs) {
        const n = terrain[(y + sy) * gw + (x + sx)] ?? 0;
        if (n === TILE_HIGH || n === TILE_CLIFF) {
          dx = -sx;
          dy = -sy;
          break;
        }
      }
      if (!dx && !dy) continue;
      for (let s = 1; s <= 2; s++) {
        const nx = x + dx * s;
        const ny = y + dy * s;
        if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) break;
        if (nearPad(pads, nx, ny, 7)) break;
        const i = ny * gw + nx;
        const t = terrain[i] ?? 0;
        if (t === TILE_RAMP || t === TILE_HIGH || t === TILE_CLIFF) continue;
        if ((crystal[i] ?? 0) > 0) break;
        if (t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_ROUGH && t !== TILE_SHORE && t !== TILE_ROAD && t !== TILE_SCRUB) break;
        extra.push(i);
      }
    }
  }
  for (const i of extra) terrain[i] = TILE_RAMP;
}

function linkBridges(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
) {
  const mouths: { x: number; y: number }[] = [];
  const bank = (t: number) =>
    t === TILE_SAND ||
    t === TILE_CLEAR ||
    t === TILE_ROUGH ||
    t === TILE_SHORE ||
    t === TILE_ROAD ||
    t === TILE_HIGH ||
    t === TILE_SCRUB ||
    t === TILE_STUMP;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      if ((terrain[y * gw + x] ?? 0) !== TILE_BRIDGE) continue;
      const touch =
        bank(terrain[y * gw + x - 1] ?? 0) ||
        bank(terrain[y * gw + x + 1] ?? 0) ||
        bank(terrain[(y - 1) * gw + x] ?? 0) ||
        bank(terrain[(y + 1) * gw + x] ?? 0);
      if (touch) mouths.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  if (!mouths.length) return;
  for (const p of pads) {
    let best = mouths[0]!;
    let bestD = Infinity;
    for (const b of mouths) {
      const d = (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    stampLane(terrain, crystal, gw, gh, p.x, p.y, best.x, best.y, 0);
  }
  for (const b of mouths) {
    const x = b.x | 0;
    const y = b.y | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
      if (nearPad(pads, nx, ny, 7)) continue;
      const i = ny * gw + nx;
      if (!roadOk(terrain[i] ?? 0, crystal[i] ?? 0)) continue;
      terrain[i] = TILE_ROAD;
    }
  }
}

function nearSegment(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((x - x0) * dx + (y - y0) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x0 + dx * t;
  const py = y0 + dy * t;
  return (x - px) * (x - px) + (y - py) * (y - py) < r * r;
}

/** A few mirrored rocks that do not sit on a camp, a bridge, or the road into the middle. */
function seedFairRocks(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
  salt: number,
) {
  const cx = gw / 2;
  const cy = gh / 2;
  const place = (x: number, y: number) => {
    if (x < 3 || y < 3 || x >= gw - 3 || y >= gh - 3) return;
    if (nearPad(pads, x, y, 9)) return;
    for (const p of pads) {
      if (nearSegment(x + 0.5, y + 0.5, p.x, p.y, cx, cy, 2.2)) return;
    }
    const i = y * gw + x;
    if ((crystal[i] ?? 0) > 0) return;
    const t = terrain[i] ?? 0;
    if (t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_ROUGH) return;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = terrain[(y + dy) * gw + (x + dx)] ?? 0;
      if (n === TILE_BRIDGE || n === TILE_DEEP || n === TILE_SHALLOW || n === TILE_FORD || n === TILE_CLIFF) return;
    }
    terrain[i] = TILE_ROCK;
  };
  for (let n = 0; n < 3; n++) {
    const x = 6 + ((dressHash(n, 4, salt) * (gw * 0.3)) | 0);
    const y = 6 + ((dressHash(7, n, salt) * (gh - 14)) | 0);
    place(x, y);
    place(gw - 1 - x, gh - 1 - y);
  }
}

/** Craters are marks, not tiles, so both sides of a 1v1 get the same scars. */
export function seedScars(
  craters: Uint8Array,
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
  id: string,
) {
  const salt = saltOf(id);
  const drop = (x: number, y: number) => {
    if (x < 2 || y < 2 || x >= gw - 2 || y >= gh - 2) return;
    if (nearPad(pads, x, y, 8)) return;
    const i = y * gw + x;
    if ((crystal[i] ?? 0) > 0 || (craters[i] ?? 0) > 0) return;
    const t = terrain[i] ?? 0;
    if (t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_ROUGH && t !== TILE_HIGH) return;
    craters[i] = 2;
  };
  for (let n = 0; n < 4; n++) {
    const x = 8 + ((dressHash(n, 2, salt) * (gw * 0.34)) | 0);
    const y = 8 + ((dressHash(n, 9, salt) * (gh - 16)) | 0);
    drop(x, y);
    drop(gw - 1 - x, gh - 1 - y);
  }
}

function roadOk(t: number, ore: number): boolean {
  if (ore > 0) return false;
  return (
    t === TILE_SAND ||
    t === TILE_CLEAR ||
    t === TILE_ROUGH ||
    t === TILE_SCRUB ||
    t === TILE_STUMP ||
    t === TILE_SPENT ||
    t === TILE_SHORE ||
    t === TILE_HIGH ||
    t === TILE_ROAD ||
    t === TILE_VALLEY ||
    t === TILE_HUT ||
    t === TILE_BARN ||
    t === TILE_PUMP
  );
}

/** Plateaus, forest clumps, and a dirt lane from each camp to the middle. Crystal and camps stay put. */
export function dressBattlefield(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
  id = "map",
): FieldProp[] {
  const salt = saltOf(id);
  raisePlateaus(terrain, crystal, gw, gh, pads);
  layFairMesas(terrain, crystal, gw, gh, pads);
  cutRamps(terrain, crystal, gw, gh, pads);
  lengthenRamps(terrain, crystal, gw, gh, pads);
  clumpForests(terrain, crystal, gw, gh, pads, salt);
  seedFairRocks(terrain, crystal, gw, gh, pads, salt);
  const cx = gw / 2;
  const cy = gh / 2;
  for (const p of pads) stampLane(terrain, crystal, gw, gh, p.x, p.y, cx, cy, 1);
  linkBridges(terrain, crystal, gw, gh, pads);
  const props = placeHamlets(terrain, crystal, gw, gh, pads, cx, cy, salt);
  return props;
}

function raisePlateaus(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
) {
  const seen = new Uint8Array(gw * gh);
  const mass = (t: number) => t === TILE_ROCK || t === TILE_CLIFF;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const start = y * gw + x;
      if (seen[start] || !mass(terrain[start] ?? 0)) continue;
      const blob: number[] = [];
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop() as number;
        blob.push(i);
        const bx = i % gw;
        const by = (i / gw) | 0;
        const push = (nx: number, ny: number) => {
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;
          const ni = ny * gw + nx;
          if (seen[ni] || !mass(terrain[ni] ?? 0)) return;
          seen[ni] = 1;
          stack.push(ni);
        };
        push(bx + 1, by);
        push(bx - 1, by);
        push(bx, by + 1);
        push(bx, by - 1);
      }
      let interior = 0;
      const set = new Set(blob);
      const inside = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < gw && ny < gh && set.has(ny * gw + nx);
      for (const i of blob) {
        const x0 = i % gw;
        const y0 = (i / gw) | 0;
        if (inside(x0 - 1, y0) && inside(x0 + 1, y0) && inside(x0, y0 - 1) && inside(x0, y0 + 1)) interior++;
      }
      if (interior < 4) continue;
      for (const i of blob) {
        if ((crystal[i] ?? 0) > 0) continue;
        const x0 = i % gw;
        const y0 = (i / gw) | 0;
        if (nearPad(pads, x0, y0, 8)) continue;
        const edge = !inside(x0 - 1, y0) || !inside(x0 + 1, y0) || !inside(x0, y0 - 1) || !inside(x0, y0 + 1);
        terrain[i] = edge ? TILE_CLIFF : TILE_HIGH;
      }
    }
  }
}

function lowWalk(t: number): boolean {
  return (
    t === TILE_SAND ||
    t === TILE_CLEAR ||
    t === TILE_ROUGH ||
    t === TILE_ROAD ||
    t === TILE_SCRUB ||
    t === TILE_SHORE ||
    t === TILE_STUMP ||
    t === TILE_SPENT ||
    t === TILE_CRYSTAL ||
    t === TILE_VALLEY ||
    t === TILE_HIGH
  );
}

function cutRamps(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
) {
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const;
  const taken = new Set<number>();
  for (let y = 2; y < gh - 2; y++) {
    for (let x = 2; x < gw - 2; x++) {
      const i = y * gw + x;
      if ((terrain[i] ?? 0) !== TILE_CLIFF) continue;
      if (nearPad(pads, x, y, 9) || (crystal[i] ?? 0) > 0) continue;
      let dx = 0;
      let dy = 0;
      for (const [sx, sy] of dirs) {
        const n = terrain[(y + sy) * gw + (x + sx)] ?? 0;
        if (lowWalk(n) && n !== TILE_HIGH) {
          dx = sx;
          dy = sy;
          break;
        }
      }
      if (!dx && !dy) continue;
      const key = ((x / 7) | 0) * 4096 + ((y / 7) | 0);
      if (taken.has(key)) continue;
      const px = -dy;
      const py = dx;
      const cells: number[] = [];
      for (const o of [-1, 0, 1]) {
        const nx = x + px * o;
        const ny = y + py * o;
        if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
        const ni = ny * gw + nx;
        if ((terrain[ni] ?? 0) !== TILE_CLIFF || (crystal[ni] ?? 0) > 0 || nearPad(pads, nx, ny, 9)) continue;
        cells.push(ni);
      }
      if (cells.length < 2) continue;
      for (const ni of cells) terrain[ni] = TILE_RAMP;
      taken.add(key);
    }
  }
}

function clumpForests(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
  salt: number,
) {
  const seeds: number[] = [];
  for (let y = 2; y < gh - 2; y++) {
    for (let x = 2; x < gw - 2; x++) {
      const i = y * gw + x;
      if ((terrain[i] ?? 0) !== TILE_SCRUB) continue;
      if (nearPad(pads, x, y, 8) || (crystal[i] ?? 0) > 0) continue;
      seeds.push(i);
    }
  }
  if (seeds.length < 12) {
    for (let n = 0; n < 90 && seeds.length < 14; n++) {
      const x = 3 + ((dressHash(n, salt, 3) * (gw - 6)) | 0);
      const y = 3 + ((dressHash(salt, n, 5) * (gh - 6)) | 0);
      if (nearPad(pads, x, y, 10)) continue;
      const i = y * gw + x;
      const t = terrain[i] ?? 0;
      if ((t !== TILE_SAND && t !== TILE_CLEAR) || (crystal[i] ?? 0) > 0) continue;
      terrain[i] = TILE_SCRUB;
      seeds.push(i);
    }
  }
  const next = new Uint8Array(terrain);
  for (const seed of seeds) {
    const sx = seed % gw;
    const sy = (seed / gw) | 0;
    const r = 2 + (dressHash(sx, sy, salt) > 0.55 ? 1 : 0);
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = sx + dx;
        const y = sy + dy;
        if (x < 2 || y < 2 || x >= gw - 2 || y >= gh - 2) continue;
        if (dressHash(x + salt, y, sx + sy) > 0.58) continue;
        const i = y * gw + x;
        if (nearPad(pads, x, y, 8) || (crystal[i] ?? 0) > 0) continue;
        const t = terrain[i] ?? 0;
        if (t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_ROUGH && t !== TILE_SCRUB) continue;
        next[i] = TILE_SCRUB;
      }
    }
  }
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      if ((next[i] ?? 0) !== TILE_SCRUB) continue;
      let n = 0;
      if (next[i - 1] === TILE_SCRUB) n++;
      if (next[i + 1] === TILE_SCRUB) n++;
      if (next[i - gw] === TILE_SCRUB) n++;
      if (next[i + gw] === TILE_SCRUB) n++;
      if (n === 0) next[i] = TILE_SAND;
    }
  }
  terrain.set(next);
}

function stampLane(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  endGap = 3,
) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const sx = x < tx ? 1 : -1;
  const dy = -Math.abs(ty - y);
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  const horiz = Math.abs(tx - Math.round(x0)) >= Math.abs(ty - Math.round(y0));
  const ox = horiz ? 0 : 1;
  const oy = horiz ? 1 : 0;
  for (let guard = 0; guard < gw + gh; guard++) {
    const distS = Math.hypot(x + 0.5 - x0, y + 0.5 - y0);
    const distE = Math.hypot(x + 0.5 - x1, y + 0.5 - y1);
    if (distS >= 8 && distE >= endGap) {
      for (const o of [0, 1]) {
        const nx = x + ox * o;
        const ny = y + oy * o;
        if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
        const i = ny * gw + nx;
        if (!roadOk(terrain[i] ?? 0, crystal[i] ?? 0)) continue;
        terrain[i] = TILE_ROAD;
      }
    }
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function openPlot(terrain: Uint8Array, crystal: Uint16Array, gw: number, gh: number, x: number, y: number): boolean {
  if (x < 2 || y < 2 || x >= gw - 2 || y >= gh - 2) return false;
  const i = y * gw + x;
  const t = terrain[i] ?? 0;
  if ((crystal[i] ?? 0) > 0) return false;
  return t === TILE_SAND || t === TILE_CLEAR || t === TILE_ROUGH || t === TILE_STUMP || t === TILE_HIGH;
}

function placeHamlets(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
  cx: number,
  cy: number,
  salt: number,
): FieldProp[] {
  const props: FieldProp[] = [];
  const spots: { x: number; y: number }[] = [];
  pads.forEach((p, n) => {
    const mx = (p.x + cx) / 2;
    const my = (p.y + cy) / 2;
    const ang = Math.atan2(cy - p.y, cx - p.x) + (n % 2 === 0 ? 1 : -1) * Math.PI * 0.5;
    spots.push({ x: mx + Math.cos(ang) * 6.5, y: my + Math.sin(ang) * 6.5 });
  });
  spots.push({ x: cx + 7, y: cy - 4 });
  let hamlets = 0;
  for (const s of spots) {
    if (hamlets >= 5 || props.length >= 22) break;
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    if (nearPad(pads, x, y, 12)) continue;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 5) continue;
    const tiles = [
      [x, y, TILE_HUT],
      [x + 1, y, TILE_BARN],
      [x, y + 1, TILE_HUT],
      [x + 2, y + 1, TILE_PUMP],
    ] as const;
    const ok = tiles.every(([tx, ty]) => openPlot(terrain, crystal, gw, gh, tx, ty));
    if (!ok) continue;
    for (const [tx, ty, tile] of tiles) {
      if (tile === TILE_PUMP && dressHash(tx, ty, salt) > 0.5) continue;
      terrain[ty * gw + tx] = tile;
    }
    hamlets++;
    props.push({ x: x + 1.6, y: y + 2.2, kind: "wreck" });
    props.push({ x: x - 0.4, y: y + 0.4, kind: "fence" });
    props.push({ x: x + 2.3, y: y - 0.2, kind: "crate" });
  }
  return props.slice(0, 24);
}

/** Wrecks and fences for a hand-painted island. They do not block movement. */
export function dressProps(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  pads: { x: number; y: number }[],
): FieldProp[] {
  const props: FieldProp[] = [];
  for (let y = 2; y < gh - 2; y++) {
    for (let x = 2; x < gw - 2; x++) {
      if (props.length >= 16) return props;
      const h = dressHash(x, y, 11);
      if (h < 0.984) continue;
      const t = terrain[y * gw + x] ?? 0;
      if (t !== TILE_SAND && t !== TILE_CLEAR && t !== TILE_SHORE && t !== TILE_HIGH && t !== TILE_ROAD) continue;
      if (nearPad(pads, x, y, 9)) continue;
      props.push({ x: x + 0.45, y: y + 0.55, kind: h > 0.993 ? "fence" : "wreck" });
    }
  }
  return props;
}

/** Nearest-neighbor scale of an authored 64² field. Bridge cells are welded so a thin span stays crossable. */
export function resampleMap(map: GameMap, size: number): GameMap {
  if (size === MAP_W) return map;
  const srcW = MAP_W;
  const srcH = MAP_H;
  const terrain = new Uint8Array(size * size);
  const crystal = new Uint16Array(size * size);
  const sxOf = (x: number) => Math.max(0, Math.min(srcW - 1, Math.round((x * (srcW - 1)) / (size - 1))));
  const syOf = (y: number) => Math.max(0, Math.min(srcH - 1, Math.round((y * (srcH - 1)) / (size - 1))));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = syOf(y) * srcW + sxOf(x);
      const di = y * size + x;
      terrain[di] = map.terrain[si];
      crystal[di] = map.crystal[si];
    }
  }
  const k = (size - 1) / (srcW - 1);
  const plot = (x0: number, y0: number, x1: number, y1: number) => {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - x);
    const sx = x < tx ? 1 : -1;
    const dy = -Math.abs(ty - y);
    const sy = y < ty ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < size * 2; guard++) {
      if (x > 0 && y > 0 && x < size - 1 && y < size - 1) {
        const i = y * size + x;
        const t = terrain[i];
        if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_SHORE || t === TILE_BRIDGE) terrain[i] = TILE_BRIDGE;
      }
      if (x === tx && y === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  };
  for (let y = 1; y < srcH - 1; y++) {
    for (let x = 1; x < srcW - 1; x++) {
      if (map.terrain[y * srcW + x] !== TILE_BRIDGE) continue;
      const dx = x * k;
      const dy = y * k;
      if (map.terrain[y * srcW + x + 1] === TILE_BRIDGE) plot(dx, dy, (x + 1) * k, y * k);
      if (map.terrain[(y + 1) * srcW + x] === TILE_BRIDGE) plot(dx, dy, x * k, (y + 1) * k);
      if (x + 1 < srcW && map.terrain[(y + 1) * srcW + x + 1] === TILE_BRIDGE) plot(dx, dy, (x + 1) * k, (y + 1) * k);
      if (x > 0 && map.terrain[(y + 1) * srcW + x - 1] === TILE_BRIDGE) plot(dx, dy, (x - 1) * k, (y + 1) * k);
    }
  }
  for (let i = 0; i < size; i++) {
    terrain[i] = TILE_ROCK;
    terrain[(size - 1) * size + i] = TILE_ROCK;
    terrain[i * size] = TILE_ROCK;
    terrain[i * size + size - 1] = TILE_ROCK;
  }
  const spans = map.spans.map((sp) => ({
    tx: Math.max(1, Math.min(size - 4, Math.round(sp.tx * k))),
    ty: Math.max(1, Math.min(size - 3, Math.round(sp.ty * k))),
    w: Math.max(2, Math.round(sp.w * k)),
    h: Math.max(1, Math.round(sp.h * k)),
  }));
  return {
    ...map,
    terrain,
    crystal,
    player: { x: map.player.x * k, y: map.player.y * k },
    enemy: { x: map.enemy.x * k, y: map.enemy.y * k },
    spans,
  };
}

export interface Camp {
  id: CornerId;
  x: number;
  y: number;
}

export type WaterKind = "none" | "coast" | "channel" | "isles" | "michigan" | "palm";

export function waterKind(id: MapId): WaterKind {
  if (id === "coast") return "coast";
  if (id === "river") return "channel";
  if (id === "isles") return "isles";
  if (id === "michigan") return "michigan";
  if (id === "palm") return "palm";
  return "none";
}

function gapOf(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): number {
  const sx = Math.max(bx - (ax + aw), ax - (bx + bw));
  const sy = Math.max(by - (ay + ah), ay - (by + bh));
  if (sx < 0 && sy < 0) return -1;
  return Math.max(sx, sy, 0);
}

function shoreBlock(terrain: Uint8Array, gw: number, tx: number, ty: number): boolean {
  if (tx < 1 || ty < 1 || tx + 1 >= gw - 1 || ty + 1 >= gw - 1) return false;
  for (let y = ty; y < ty + 2; y++) {
    for (let x = tx; x < tx + 2; x++) {
      if (terrain[y * gw + x] !== TILE_SHORE) return false;
    }
  }
  return true;
}

/** A 2×2 dock footprint sits within build range of the yard a camp would deploy. */
export function dockSiteNear(terrain: Uint8Array, gw: number, cx: number, cy: number): boolean {
  const yx = Math.floor(cx) - 1;
  const yy = Math.floor(cy) - 1;
  for (let ty = yy - 5; ty <= yy + 6; ty++) {
    for (let tx = yx - 5; tx <= yx + 6; tx++) {
      if (!shoreBlock(terrain, gw, tx, ty)) continue;
      const gap = gapOf(yx, yy, 3, 3, tx, ty, 2, 2);
      if (gap >= 0 && gap <= 3) return true;
    }
  }
  return false;
}

function paintDisk(
  terrain: Uint8Array,
  crystal: Uint16Array,
  gw: number,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  tile: number,
) {
  const r2 = r1 * r1;
  const inner = r0 * r0;
  for (let y = Math.max(1, Math.floor(cy - r1)); y <= Math.min(gw - 2, Math.ceil(cy + r1)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r1)); x <= Math.min(gw - 2, Math.ceil(cx + r1)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = dx * dx + dy * dy;
      if (d > r2 || d < inner) continue;
      const i = y * gw + x;
      terrain[i] = tile;
      if (tile !== TILE_CRYSTAL) crystal[i] = 0;
    }
  }
}

function quadrant(gw: number): Camp[] {
  const a = Math.max(8, Math.round(gw * 0.2));
  const b = gw - 1 - a;
  return [
    { id: "nw", x: a + 0.5, y: a + 0.5 },
    { id: "ne", x: b + 0.5, y: a + 0.5 },
    { id: "sw", x: a + 0.5, y: b + 0.5 },
    { id: "se", x: b + 0.5, y: b + 0.5 },
  ];
}

function columnShare(terrain: Uint8Array, gw: number, x: number, tile: number): number {
  if (x < 1 || x >= gw - 1) return 0;
  let n = 0;
  for (let y = 1; y < gw - 1; y++) if (terrain[y * gw + x] === tile) n++;
  return n / gw;
}

/** Four camps. River and island starts each grow a dock-sized shore. */
export function plantCorners(terrain: Uint8Array, crystal: Uint16Array, gw: number, kind: WaterKind): Camp[] {
  if (kind === "channel") return plantChannel(terrain, crystal, gw);
  if (kind === "isles") return plantIsles(terrain, crystal, gw);
  if (kind === "coast") return plantCoast(terrain, gw);
  if (kind === "michigan") return plantMichigan(terrain, gw);
  if (kind === "palm") return plantPalm(terrain, gw);
  return plantLand(terrain, gw);
}

function plantPalm(terrain: Uint8Array, gw: number): Camp[] {
  const k = (gw - 1) / 63;
  const authored: Camp[] = [
    { id: "nw", x: 24.5 * k, y: 19.5 * k },
    { id: "ne", x: 39.5 * k, y: 29.5 * k },
    { id: "sw", x: 25.5 * k, y: 36.5 * k },
    { id: "se", x: 42.5 * k, y: 43.5 * k },
  ];
  return authored.map((c) => {
    const s = snapLand(terrain, gw, c.x, c.y);
    return { id: c.id, x: s.x, y: s.y };
  });
}

function plantMichigan(terrain: Uint8Array, gw: number): Camp[] {
  const k = (gw - 1) / 63;
  const authored: Camp[] = [
    { id: "nw", x: 16.5 * k, y: 17.5 * k },
    { id: "ne", x: 38.5 * k, y: 20.5 * k },
    { id: "sw", x: 32.5 * k, y: 50.5 * k },
    { id: "se", x: 46.5 * k, y: 44.5 * k },
  ];
  return authored.map((c) => {
    const s = snapLand(terrain, gw, c.x, c.y);
    return { id: c.id, x: s.x, y: s.y };
  });
}

function plantLand(terrain: Uint8Array, gw: number): Camp[] {
  return quadrant(gw).map((c) => {
    const s = snapLand(terrain, gw, c.x, c.y);
    return { id: c.id, x: s.x, y: s.y };
  });
}

function plantCoast(terrain: Uint8Array, gw: number): Camp[] {
  let shoreX = Math.round(gw * 0.78);
  let best = 0;
  for (let x = 2; x < gw - 2; x++) {
    const share = columnShare(terrain, gw, x, TILE_SHORE);
    if (share > best) {
      best = share;
      shoreX = x;
    }
  }
  return quadrant(gw).map((c) => {
    const east = c.id === "ne" || c.id === "se";
    const x = east ? shoreX - 3.5 : c.x;
    const y = c.y;
    if (!east) carveQuay(terrain, gw, x, y);
    return { id: c.id, ...seatWithDock(terrain, gw, x, y) };
  });
}

/** A two-tile quay and a canal east into existing water, just off the deploy pad. */
function carveQuay(terrain: Uint8Array, gw: number, cx: number, cy: number) {
  const tx = Math.floor(cx);
  const ty = Math.floor(cy);
  const quay = tx + 3;
  if (quay + 3 >= gw - 1) return;
  for (let dy = -1; dy <= 2; dy++) {
    const y = ty + dy;
    if (y < 2 || y >= gw - 2) continue;
    for (let s = 0; s < 2; s++) {
      const x = quay + s;
      const i = y * gw + x;
      const t = terrain[i];
      if (t === TILE_BRIDGE || t === TILE_ROCK || t === TILE_CLIFF) continue;
      terrain[i] = TILE_SHORE;
    }
    for (let x = quay + 2; x < gw - 1; x++) {
      const i = y * gw + x;
      const t = terrain[i];
      if (t === TILE_BRIDGE || t === TILE_ROCK || t === TILE_CLIFF) break;
      if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_SHORE) break;
      terrain[i] = TILE_DEEP;
    }
  }
}

/** Slide a camp onto land that can actually host a 2×2 dock. */
function seatWithDock(terrain: Uint8Array, gw: number, x: number, y: number): { x: number; y: number } {
  const start = snapLand(terrain, gw, x, y);
  const ok = (nx: number, ny: number) => landCenter(terrain, gw, nx, ny) && dockSiteNear(terrain, gw, nx, ny);
  if (ok(start.x, start.y)) return start;
  for (let r = 1; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = start.x + dx;
        const ny = start.y + dy;
        if (ok(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return start;
}

function landCenter(terrain: Uint8Array, gw: number, x: number, y: number): boolean {
  const tx = Math.floor(x) - 1;
  const ty = Math.floor(y) - 1;
  if (tx < 2 || ty < 2 || tx + 3 >= gw - 1 || ty + 3 >= gw - 1) return false;
  for (let yy = ty; yy < ty + 3; yy++) {
    for (let xx = tx; xx < tx + 3; xx++) {
      const t = terrain[yy * gw + xx];
      if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_ROCK || t === TILE_CLIFF || t === TILE_BRIDGE) return false;
    }
  }
  return true;
}

function plantChannel(terrain: Uint8Array, crystal: Uint16Array, gw: number): Camp[] {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] !== TILE_DEEP) continue;
    sum += i % gw;
    n++;
  }
  const mid = n ? Math.round(sum / n) : Math.floor(gw / 2);
  const shoreAt = (dir: number) => {
    for (let d = 1; d < 10; d++) {
      const x = mid + dir * d;
      if (columnShare(terrain, gw, x, TILE_SHORE) > 0.35) return x;
    }
    return mid + dir * 3;
  };
  const left = shoreAt(-1);
  const right = shoreAt(1);
  const quiet = (y: number) => {
    for (let k = 0; k < 16; k++) {
      const yy = y + (k % 2 === 0 ? k / 2 : -((k + 1) / 2));
      const row = yy | 0;
      if (row < 6 || row > gw - 7) continue;
      if (terrain[row * gw + mid] !== TILE_BRIDGE) return row;
    }
    return Math.max(6, Math.min(gw - 7, y | 0));
  };
  const north = quiet(Math.round(gw * 0.18));
  const south = quiet(Math.round(gw * 0.82));
  const paintBank = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      const ty = y + dy;
      if (ty < 1 || ty >= gw - 1 || x < 1 || x >= gw - 1) continue;
      const i = ty * gw + x;
      const t = terrain[i];
      if (t === TILE_BRIDGE || t === TILE_DEEP || t === TILE_ROCK) continue;
      terrain[i] = TILE_SHORE;
      crystal[i] = 0;
    }
  };
  paintBank(left - 1, north);
  paintBank(left - 1, south);
  paintBank(right + 1, north);
  paintBank(right + 1, south);
  const camps: Camp[] = [
    { id: "nw", x: left - 5.5, y: north + 0.5 },
    { id: "ne", x: right + 5.5, y: north + 0.5 },
    { id: "sw", x: left - 5.5, y: south + 0.5 },
    { id: "se", x: right + 5.5, y: south + 0.5 },
  ];
  return camps.map((c) => {
    const s = seatWithDock(terrain, gw, c.x, c.y);
    return { id: c.id, x: s.x, y: s.y };
  });
}

function plantIsles(terrain: Uint8Array, crystal: Uint16Array, gw: number): Camp[] {
  const inset = Math.max(12, Math.round(gw * 0.28));
  const far = gw - inset;
  const spots: Camp[] = [
    { id: "nw", x: inset + 0.5, y: inset + 0.5 },
    { id: "ne", x: far + 0.5, y: inset + 0.5 },
    { id: "sw", x: inset + 0.5, y: far + 0.5 },
    { id: "se", x: far + 0.5, y: far + 0.5 },
  ];
  const sandR = Math.max(3.2, gw * 0.05);
  for (const c of spots) {
    paintDisk(terrain, crystal, gw, c.x, c.y, sandR + 2.2, sandR + 3.6, TILE_SHALLOW);
    paintDisk(terrain, crystal, gw, c.x, c.y, sandR, sandR + 2.2, TILE_SHORE);
    paintDisk(terrain, crystal, gw, c.x, c.y, 0, sandR, TILE_SAND);
  }
  return spots.map((c) => {
    const s = seatWithDock(terrain, gw, c.x, c.y);
    return { id: c.id, x: s.x, y: s.y };
  });
}
