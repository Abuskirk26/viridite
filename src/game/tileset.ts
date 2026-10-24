/**
 * One authored terrain. Eight grounds on a height field, lit from the northwest.
 * Color feathers across neighbors. Slope becomes a lit or shadowed face.
 * Viridite, trees, and civilian shells sit on top as props.
 */

import type { Theater } from "./data.ts";
import {
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
  TILE_ROAD,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SCRUB,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_SPENT,
  TILE_STUMP,
  TILE_VALLEY,
  TILE_WRECK,
} from "./data.ts";

export type Ground = "clear" | "rough" | "sand" | "rock" | "shore" | "shallow" | "deep" | "cliff" | "ramp";

export function groundOf(tile: number): Ground {
  if (tile === TILE_ROUGH || tile === TILE_VALLEY) return "rough";
  if (tile === TILE_SAND || tile === TILE_SHORE) return tile === TILE_SHORE ? "shore" : "sand";
  if (tile === TILE_ROCK) return "rock";
  if (tile === TILE_SHALLOW || tile === TILE_FORD) return "shallow";
  if (tile === TILE_DEEP || tile === TILE_WRECK) return "deep";
  if (tile === TILE_CLIFF) return "cliff";
  if (tile === TILE_RAMP) return "ramp";
  return "clear";
}

export function isWater(tile: number): boolean {
  const g = groundOf(tile);
  return g === "deep" || g === "shallow";
}

export function isTree(tile: number): boolean {
  return tile === TILE_SCRUB;
}

export function isShell(tile: number): boolean {
  return tile === TILE_HUT || tile === TILE_BARN || tile === TILE_PUMP;
}

/** Who may stand on this tile. A shell with mark >= 2 is rubble and opens. */
export function allows(
  tile: number,
  who: "air" | "boat" | "infantry" | "vehicle" | "amphib",
  shellMark = 0,
): boolean {
  if (who === "air") return true;
  if (tile === TILE_FORD) return true;
  if (tile === TILE_SCRUB) return who === "infantry" || who === "vehicle" || who === "amphib";
  if (tile === TILE_ROCK || tile === TILE_CLIFF) return false;
  if (isShell(tile) && shellMark < 2) return false;
  const g = groundOf(tile);
  if (g === "deep") return who === "boat";
  if (g === "shallow") return who === "boat" || who === "infantry" || who === "amphib";
  if (g === "shore") return who !== "boat";
  if (tile === TILE_BRIDGE) return who !== "boat";
  return who !== "boat";
}

export function boatBeaches(tile: number, kind: string): boolean {
  return tile === TILE_SHORE && kind === "transport";
}

export function blocksSight(tile: number): boolean {
  return tile === TILE_CLIFF;
}

export function slowsVehicles(tile: number): boolean {
  const g = groundOf(tile);
  return g === "rough" || g === "ramp" || tile === TILE_FORD;
}

function hash(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

interface Ink {
  mid: string;
  lit: string;
  shade: string;
  grit: string;
}

function inkOf(g: Ground, theater: Theater): Ink {
  if (g === "deep") return { mid: "#14324a", lit: "#1e4c68", shade: "#081820", grit: "#0c2838" };
  if (g === "shallow") return { mid: "#2f7f96", lit: "#4aa8b8", shade: "#1c5870", grit: "#3a96a4" };
  if (g === "shore") {
    if (theater === "snow") return { mid: "#c5d2dc", lit: "#eef4f8", shade: "#6e8696", grit: "#d5e0e8" };
    if (theater === "desert") return { mid: "#d7b27a", lit: "#f0d7a4", shade: "#a78452", grit: "#edd8ae" };
    return { mid: "#cbb48a", lit: "#ead7b0", shade: "#8d7048", grit: "#ddc8a0" };
  }
  if (g === "sand") {
    if (theater === "snow") return { mid: "#d8e2ea", lit: "#f4f8fb", shade: "#8ea0ae", grit: "#e7eef3" };
    if (theater === "desert") return { mid: "#c9a56c", lit: "#e4c892", shade: "#8d6a3e", grit: "#dfc08a" };
    return { mid: "#c4a878", lit: "#e0c898", shade: "#8a6840", grit: "#d4bc90" };
  }
  if (g === "rock" || g === "cliff" || g === "ramp") {
    if (theater === "snow") {
      if (g === "cliff") return { mid: "#667480", lit: "#d5dee6", shade: "#1c242c", grit: "#8a98a6" };
      if (g === "ramp") return { mid: "#7c8c98", lit: "#e4eaf0", shade: "#334048", grit: "#a0aeb8" };
      return { mid: "#8a98a4", lit: "#e8eef3", shade: "#3a4650", grit: "#b0bcc6" };
    }
    if (theater === "desert") {
      if (g === "cliff") return { mid: "#7a5a3c", lit: "#c4a078", shade: "#2a1c12", grit: "#a08058" };
      if (g === "ramp") return { mid: "#8a6848", lit: "#d4b48a", shade: "#3a2818", grit: "#b09068" };
      return { mid: "#8d7358", lit: "#c4b09a", shade: "#3a3024", grit: "#a89078" };
    }
    if (g === "cliff") return { mid: "#5c5348", lit: "#c8beb0", shade: "#1a1410", grit: "#6a6156" };
    if (g === "ramp") return { mid: "#6a5c48", lit: "#c4b49a", shade: "#2a2218", grit: "#7a6a54" };
    return { mid: "#6d6256", lit: "#b4aa9e", shade: "#2a241e", grit: "#7a7268" };
  }
  if (g === "rough") {
    if (theater === "snow") return { mid: "#b7c2cc", lit: "#e4eaf0", shade: "#5a6774", grit: "#c5ced6" };
    if (theater === "desert") return { mid: "#a07848", lit: "#c49868", shade: "#4a3018", grit: "#b48858" };
    return { mid: "#3d5a30", lit: "#6a8a48", shade: "#1a2c14", grit: "#4a6a38" };
  }
  if (theater === "snow") return { mid: "#d5dee6", lit: "#f4f7fa", shade: "#8a9aaa", grit: "#e7eef3" };
  if (theater === "desert") return { mid: "#c4a06a", lit: "#e0c48c", shade: "#6a4c28", grit: "#d4b484" };
  return { mid: "#4e7a3c", lit: "#78a058", shade: "#1e3a18", grit: "#5c8a44" };
}

function at(terrain: ArrayLike<number>, x: number, y: number, gw: number, gh: number): number {
  if (x < 0 || y < 0 || x >= gw || y >= gh) return TILE_ROCK;
  return terrain[y * gw + x] ?? TILE_CLEAR;
}


const HEIGHT = new Float32Array([
  0.42, 1.28, 0.56, 0.56, 0.56, 0.09, 0.0, 1.72, 0.26, 0.09,
  0.56, 0.98, 0.09, 0.56, 0.98, 0.82, 0.56, 0.56, 0.56, 0.56, 0.0, 1.58,
]);

function rawH(tile: number): number {
  return HEIGHT[tile] ?? 0.56;
}

function tight(t: number): number {
  const s = t * t * (3 - 2 * t);
  return s * s * (3 - 2 * s);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

const palCache = new Map<Theater, Uint8Array>();

function palette(theater: Theater): Uint8Array {
  const hit = palCache.get(theater);
  if (hit) return hit;
  const p = new Uint8Array(24 * 3);
  for (let t = 0; t < 24; t++) {
    const g =
      t === TILE_BRIDGE || t === TILE_FORD ? "shallow" : t === TILE_WRECK ? "deep" : groundOf(t);
    const n = parseInt(inkOf(g, theater).mid.slice(1), 16);
    p[t * 3] = (n >> 16) & 255;
    p[t * 3 + 1] = (n >> 8) & 255;
    p[t * 3 + 2] = n & 255;
  }
  palCache.set(theater, p);
  return p;
}

function rockRgb(theater: Theater): [number, number, number] {
  const n = parseInt(inkOf("cliff", theater).mid.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sandRgb(theater: Theater): [number, number, number] {
  const n = parseInt(inkOf("sand", theater).mid.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function n2(px: number, py: number): number {
  const x0 = px | 0;
  const y0 = py | 0;
  const fx = px - x0;
  const fy = py - y0;
  const v00 = hash(x0, y0);
  const v10 = hash(x0 + 1, y0);
  const v01 = hash(x0, y0 + 1);
  const v11 = hash(x0 + 1, y0 + 1);
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}

function rampHeight(terrain: ArrayLike<number>, x: number, y: number, gw: number, gh: number): number {
  let s = 0;
  let n = 0;
  const add = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= gw || ty >= gh) return;
    const t = terrain[ty * gw + tx] ?? 0;
    if (t === TILE_RAMP) return;
    s += rawH(t);
    n += 1;
  };
  add(x, y - 1);
  add(x, y + 1);
  add(x - 1, y);
  add(x + 1, y);
  return n ? s / n : 0.82;
}

/** Cell color, height, and id for the GPU bake. Height is 0–1 meaning 0–2 world units. */
export function packTerrain(terrain: ArrayLike<number>, gw: number, gh: number, theater: Theater) {
  const pal = palette(theater);
  const color = new Uint8Array(gw * gh * 4);
  const height = new Uint8Array(gw * gh);
  const ids = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = terrain[y * gw + x] ?? 0;
      const i = y * gw + x;
      const h = t === TILE_RAMP ? rampHeight(terrain, x, y, gw, gh) : rawH(t);
      ids[i] = t;
      height[i] = Math.max(0, Math.min(255, Math.round((h / 2) * 255)));
      const o = (t > 23 ? TILE_CLEAR : t) * 3;
      const c = i * 4;
      color[c] = pal[o] ?? 80;
      color[c + 1] = pal[o + 1] ?? 90;
      color[c + 2] = pal[o + 2] ?? 60;
      color[c + 3] = 255;
    }
  }
  return { color, height, ids, rock: rockRgb(theater), sand: sandRgb(theater) };
}

/**
 * Break up flat fills. Rough patches and a wobbling shore.
 * Pads (starts) and bridges stay put so a map remains playable.
 * coastOnly leaves land tiles alone — lobby maps snap starts onto sand.
 */
export function softenField(
  terrain: Uint8Array,
  w: number,
  h: number,
  pads: { x: number; y: number }[],
  coastOnly = false,
) {
  const guard = new Uint8Array(w * h);
  const mark = (x: number, y: number, r: number) => {
    for (let y2 = y - r; y2 <= y + r; y2++) {
      for (let x2 = x - r; x2 <= x + r; x2++) {
        if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) continue;
        guard[y2 * w + x2] = 1;
      }
    }
  };
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] !== TILE_BRIDGE) continue;
    mark(i % w, (i / w) | 0, 2);
  }
  for (const p of pads) mark(Math.floor(p.x), Math.floor(p.y), 5);
  const blob = (x: number, y: number) => {
    const a = Math.sin(x * 0.17 + y * 0.11);
    const b = Math.sin(x * 0.05 - y * 0.08 + 1.7);
    return a * 0.6 + b * 0.4;
  };
  const next = new Uint8Array(terrain);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (guard[i]) continue;
      const t = terrain[i] ?? 0;
      const e = blob(x, y);
      let wet = false;
      let land = false;
      let deepN = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = terrain[(y + dy) * w + (x + dx)] ?? 0;
        if (n === TILE_DEEP || n === TILE_SHALLOW || n === TILE_FORD) wet = true;
        if (n === TILE_DEEP) deepN++;
        if (n === TILE_SAND || n === TILE_CLEAR || n === TILE_ROUGH || n === TILE_SHORE || n === TILE_SCRUB) land = true;
      }
      if (!coastOnly && (t === TILE_SAND || t === TILE_CLEAR) && wet && e < -0.42) {
        next[i] = TILE_SHALLOW;
        continue;
      }
      if (t === TILE_DEEP && land && deepN >= 2 && e > 0.28) {
        next[i] = TILE_SHALLOW;
        continue;
      }
      if (coastOnly) continue;
      if ((t === TILE_SAND || t === TILE_CLEAR) && !wet && e > 0.38) next[i] = TILE_ROUGH;
      else if (t === TILE_CLEAR && !wet && e < -0.48) next[i] = TILE_SAND;
    }
  }
  terrain.set(next);
}

const LAND_ROUND = new Set<number>([
  TILE_SAND,
  TILE_CLEAR,
  TILE_ROUGH,
  TILE_SHORE,
  TILE_SCRUB,
  TILE_HIGH,
  TILE_ROAD,
  TILE_STUMP,
  TILE_SPENT,
]);

function wetTile(t: number): boolean {
  return t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD || t === TILE_WRECK;
}

/**
 * Chamfer stair-step coasts and swallow one-tile water squares.
 * Starts and crystal stay put so a camp does not fall into the sea.
 */
export function roundCoast(
  terrain: Uint8Array,
  w: number,
  h: number,
  pads: { x: number; y: number }[],
) {
  const guard = new Uint8Array(w * h);
  const mark = (x: number, y: number, r: number) => {
    for (let y2 = y - r; y2 <= y + r; y2++) {
      for (let x2 = x - r; x2 <= x + r; x2++) {
        if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) continue;
        guard[y2 * w + x2] = 1;
      }
    }
  };
  for (const p of pads) mark(Math.floor(p.x), Math.floor(p.y), 4);
  for (let i = 0; i < terrain.length; i++) {
    if ((terrain[i] ?? 0) !== TILE_CRYSTAL) continue;
    mark(i % w, (i / w) | 0, 1);
  }
  const atT = (x: number, y: number, src: Uint8Array) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return TILE_DEEP;
    return src[y * w + x] ?? TILE_DEEP;
  };
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(terrain);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (guard[i]) continue;
        const t = terrain[i] ?? 0;
        if (t === TILE_BRIDGE || t === TILE_CRYSTAL || t === TILE_CLIFF || t === TILE_ROCK || t === TILE_RAMP) continue;
        const N = wetTile(atT(x, y - 1, terrain));
        const S = wetTile(atT(x, y + 1, terrain));
        const W = wetTile(atT(x - 1, y, terrain));
        const E = wetTile(atT(x + 1, y, terrain));
        const wetN = (N ? 1 : 0) + (S ? 1 : 0) + (W ? 1 : 0) + (E ? 1 : 0);
        const corner = (N && E) || (N && W) || (S && E) || (S && W);
        if (LAND_ROUND.has(t) && corner && wetN === 2) {
          next[i] = TILE_SHALLOW;
          continue;
        }
        const nL = !wetTile(atT(x, y - 1, terrain));
        const sL = !wetTile(atT(x, y + 1, terrain));
        const wL = !wetTile(atT(x - 1, y, terrain));
        const eL = !wetTile(atT(x + 1, y, terrain));
        const landN = (nL ? 1 : 0) + (sL ? 1 : 0) + (wL ? 1 : 0) + (eL ? 1 : 0);
        const landCorner = (nL && eL && wetTile(atT(x + 1, y - 1, terrain))) || (nL && wL && wetTile(atT(x - 1, y - 1, terrain))) || (sL && eL && wetTile(atT(x + 1, y + 1, terrain))) || (sL && wL && wetTile(atT(x - 1, y + 1, terrain)));
        if ((t === TILE_DEEP || t === TILE_SHALLOW) && landN >= 3) {
          next[i] = landN >= 4 ? TILE_SHORE : TILE_SHALLOW;
          continue;
        }
        if (t === TILE_DEEP && landCorner && landN === 2) next[i] = TILE_SHALLOW;
      }
    }
    terrain.set(next);
  }
}

const lit = [0, 0, 0];

/** Northwest sun on the slope. Steep ground becomes a lit or shadowed face. */
function relieve(
  r: number,
  g: number,
  b: number,
  h: number,
  hL: number,
  hR: number,
  hU: number,
  hD: number,
  dist: number,
  wx: number,
  wy: number,
  rock: readonly [number, number, number],
) {
  const tone = 0.78 + n2(wx * 0.32, wy * 0.32) * 0.28; // stronger variation for close zoom
  r *= tone;
  g *= tone;
  b *= tone;
  const dhdx = (hR - hL) / (2 * dist);
  const dhdy = (hD - hU) / (2 * dist);
  const slope = Math.sqrt(dhdx * dhdx + dhdy * dhdy);
  if (slope > 0.22) {
    const k = Math.max(0, Math.min(1, (slope - 0.22) / 0.55));
    r = r * (1 - k) + rock[0] * k;
    g = g * (1 - k) + rock[1] * k;
    b = b * (1 - k) + rock[2] * k;
  }
  const nx = -dhdx;
  const ny = -dhdy;
  const nz = 0.62;
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
  const ndotl = Math.max(0, nx * inv * -0.46 + ny * inv * -0.55 + nz * inv * 0.7);
  let light = 0.15 + 1.25 * ndotl;
  const avg = (hL + hR + hU + hD) * 0.25;
  if (avg > h) light *= 1 - Math.min(0.62, (avg - h) * 1.8);
  if (h < 0.12) light *= 1 - ((0.12 - h) / 0.12) * 0.35;
  r *= light;
  g *= light;
  b *= light;
  if (slope > 0.55 && ndotl > 0.55) {
    const lip = (ndotl - 0.5) * Math.min(1, slope) * 1.1;
    r += 70 * lip;
    g += 62 * lip;
    b += 48 * lip;
  }
  if (h > 0.05 && h < 0.3) {
    const band = 1 - Math.abs(h - 0.15) / 0.12;
    if (band > 0) {
      const f = Math.min(1, band) * 0.7;
      r = r * (1 - f) + 238 * f;
      g = g * (1 - f) + 246 * f;
      b = b * (1 - f) + 244 * f;
    }
  }
  const grain = (hash((wx * 8) | 0, (wy * 8) | 0) - 0.5) * (12 + Math.min(22, slope * 28));
  lit[0] = r + grain;
  lit[1] = g + grain;
  lit[2] = b + grain * 0.85;
}

function dress(
  terrain: ArrayLike<number>,
  ix: number,
  iy: number,
  gw: number,
  gh: number,
  wx: number,
  wy: number,
  r: number,
  g: number,
  b: number,
  sand: readonly [number, number, number],
): [number, number, number] {
  if (ix < 0 || iy < 0 || ix >= gw || iy >= gh) return [r, g, b];
  const tile = terrain[iy * gw + ix] ?? 0;
  const fx = wx - ix;
  const fy = wy - iy;
  if (tile === TILE_BRIDGE || tile === TILE_ROAD) return [r, g, b];
  if (tile === TILE_FORD && fy > 0.22 && fy < 0.78) {
    const k = 0.75;
    return [r * (1 - k) + sand[0] * k, g * (1 - k) + sand[1] * k, b * (1 - k) + sand[2] * k];
  }
  if (tile === TILE_WRECK) {
    if ((fx > 0.12 && fx < 0.38 && fy > 0.32 && fy < 0.46) || (fx > 0.52 && fx < 0.84 && fy > 0.55 && fy < 0.68)) {
      return [74, 56, 36];
    }
  }
  if (tile === TILE_ROCK || tile === TILE_CLIFF) {
    const south = at(terrain, ix, iy + 1, gw, gh);
    if (south !== TILE_ROCK && south !== TILE_CLIFF && fy > 0.62) {
      const k = (fy - 0.62) / 0.38 * 0.35;
      return [r * (1 - k) + 62 * k, g * (1 - k) + 54 * k, b * (1 - k) + 42 * k];
    }
  }
  return [r, g, b];
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

/**
 * A real field has land or water and a spread of brightness.
 * A lost WebGL sheet is one dark fill (navy or black) and fails this.
 */
export function terrainFieldAlive(rgb: ArrayLike<number>): boolean {
  const n = Math.floor(rgb.length / 3);
  if (n < 16) return false;
  let minL = 255;
  let maxL = 0;
  let land = 0;
  let water = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3] ?? 0;
    const g = rgb[i * 3 + 1] ?? 0;
    const b = rgb[i * 3 + 2] ?? 0;
    const l = 0.3 * r + 0.5 * g + 0.2 * b;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
    if (g > r + 8 && g > 45) land++;
    if (b > r + 10 && b > g && b > 40) water++;
  }
  return maxL - minL > 12 && (land > n * 0.05 || water > n * 0.05);
}

/** Height-shaded field. One surface, lit from the northwest. Used by the match bake. */
export function writeTerrain(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  terrain: ArrayLike<number>,
  gw: number,
  gh: number,
  theater: Theater,
): void {
  if (gw < 2 || gh < 2 || width < 2 || height < 2) return;
  const pal = palette(theater);
  const rock = rockRgb(theater);
  const sand = sandRgb(theater);
  const ch = new Float32Array(gw * gh);
  const cr = new Uint8Array(gw * gh);
  const cg = new Uint8Array(gw * gh);
  const cb = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = terrain[y * gw + x] ?? 0;
      const i = y * gw + x;
      ch[i] = t === TILE_RAMP ? rampHeight(terrain, x, y, gw, gh) : rawH(t);
      const o = (t > 23 ? TILE_CLEAR : t) * 3;
      cr[i] = pal[o] ?? 80;
      cg[i] = pal[o + 1] ?? 90;
      cb[i] = pal[o + 2] ?? 60;
    }
  }
  const scaleX = width / gw;
  const scaleY = height / gh;
  const H = new Float32Array(width * height);
  const gw1 = gw - 2;
  const gh1 = gh - 2;
  for (let py = 0; py < height; py++) {
    let fy = (py + 0.5) / scaleY - 0.5;
    let y0 = Math.floor(fy);
    let ty = fy - y0;
    if (y0 < 0) {
      y0 = 0;
      ty = 0;
    } else if (y0 > gh1) {
      y0 = gh1;
      ty = 1;
    }
    const sy = smooth(ty);
    const hy = tight(ty);
    const row = py * width;
    for (let px = 0; px < width; px++) {
      const fx = (px + 0.5) / scaleX - 0.5;
      let x0 = Math.floor(fx);
      let tx = fx - x0;
      if (x0 < 0) {
        x0 = 0;
        tx = 0;
      } else if (x0 > gw1) {
        x0 = gw1;
        tx = 1;
      }
      const sx = smooth(tx);
      const hx = tight(tx);
      const i00 = y0 * gw + x0;
      const i10 = i00 + 1;
      const i01 = i00 + gw;
      const i11 = i01 + 1;
      const h = (ch[i00] * (1 - hx) + ch[i10] * hx) * (1 - hy) + (ch[i01] * (1 - hx) + ch[i11] * hx) * hy;
      const r = (cr[i00] * (1 - sx) + cr[i10] * sx) * (1 - sy) + (cr[i01] * (1 - sx) + cr[i11] * sx) * sy;
      const g = (cg[i00] * (1 - sx) + cg[i10] * sx) * (1 - sy) + (cg[i01] * (1 - sx) + cg[i11] * sx) * sy;
      const b = (cb[i00] * (1 - sx) + cb[i10] * sx) * (1 - sy) + (cb[i01] * (1 - sx) + cb[i11] * sx) * sy;
      const idx = row + px;
      H[idx] = h;
      const o = idx * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
    }
  }
  const step = Math.max(1, Math.round(0.42 * scaleX));
  const dist = step / scaleX;
  for (let py = 0; py < height; py++) {
    const row = py * width;
    const up = Math.max(0, py - step) * width;
    const dn = Math.min(height - 1, py + step) * width;
    for (let px = 0; px < width; px++) {
      const idx = row + px;
      const hL = H[row + Math.max(0, px - step)] ?? 0;
      const hR = H[row + Math.min(width - 1, px + step)] ?? 0;
      const hU = H[up + px] ?? 0;
      const hD = H[dn + px] ?? 0;
      const o = idx * 4;
      const wx = (px + 0.5) / scaleX;
      const wy = (py + 0.5) / scaleY;
      relieve(pixels[o] ?? 0, pixels[o + 1] ?? 0, pixels[o + 2] ?? 0, H[idx] ?? 0, hL, hR, hU, hD, dist, wx, wy, rock);
      const ix = wx | 0;
      const iy = wy | 0;
      let r = lit[0] ?? 0;
      let g = lit[1] ?? 0;
      let b = lit[2] ?? 0;
      if (ix >= 0 && iy >= 0 && ix < gw && iy < gh) {
        const tile = terrain[iy * gw + ix] ?? 0;
        if (tile === TILE_BRIDGE || tile === TILE_ROAD || tile === TILE_FORD || tile === TILE_WRECK) {
          const dressed = dress(terrain, ix, iy, gw, gh, wx, wy, r, g, b, sand);
          r = dressed[0];
          g = dressed[1];
          b = dressed[2];
        }
      }
      pixels[o] = clampByte(r);
      pixels[o + 1] = clampByte(g);
      pixels[o + 2] = clampByte(b);
    }
  }
}

function heightAt(ch: Float32Array, wx: number, wy: number, gw: number, gh: number): number {
  const fx = wx - 0.5;
  const fy = wy - 0.5;
  let x0 = Math.floor(fx);
  let y0 = Math.floor(fy);
  let tx = fx - x0;
  let ty = fy - y0;
  if (x0 < 0) {
    x0 = 0;
    tx = 0;
  } else if (x0 > gw - 2) {
    x0 = Math.max(0, gw - 2);
    tx = 1;
  }
  if (y0 < 0) {
    y0 = 0;
    ty = 0;
  } else if (y0 > gh - 2) {
    y0 = Math.max(0, gh - 2);
    ty = 1;
  }
  const hx = tight(tx);
  const hy = tight(ty);
  const i00 = y0 * gw + x0;
  return (ch[i00]! * (1 - hx) + ch[i00 + 1]! * hx) * (1 - hy) + (ch[i00 + gw]! * (1 - hx) + ch[i00 + gw + 1]! * hx) * hy;
}

function sampleTerrain(
  terrain: ArrayLike<number>,
  wx: number,
  wy: number,
  gw: number,
  gh: number,
  theater: Theater,
  ch: Float32Array,
  cr: Uint8Array,
  cg: Uint8Array,
  cb: Uint8Array,
  rock: readonly [number, number, number],
  sand: readonly [number, number, number],
): [number, number, number] {
  const fx = wx - 0.5;
  const fy = wy - 0.5;
  let x0 = Math.floor(fx);
  let y0 = Math.floor(fy);
  let tx = fx - x0;
  let ty = fy - y0;
  if (x0 < 0) {
    x0 = 0;
    tx = 0;
  } else if (x0 > gw - 2) {
    x0 = Math.max(0, gw - 2);
    tx = 1;
  }
  if (y0 < 0) {
    y0 = 0;
    ty = 0;
  } else if (y0 > gh - 2) {
    y0 = Math.max(0, gh - 2);
    ty = 1;
  }
  const sx = smooth(tx);
  const sy = smooth(ty);
  const i00 = y0 * gw + x0;
  const r = (cr[i00]! * (1 - sx) + cr[i00 + 1]! * sx) * (1 - sy) + (cr[i00 + gw]! * (1 - sx) + cr[i00 + gw + 1]! * sx) * sy;
  const g = (cg[i00]! * (1 - sx) + cg[i00 + 1]! * sx) * (1 - sy) + (cg[i00 + gw]! * (1 - sx) + cg[i00 + gw + 1]! * sx) * sy;
  const b = (cb[i00]! * (1 - sx) + cb[i00 + 1]! * sx) * (1 - sy) + (cb[i00 + gw]! * (1 - sx) + cb[i00 + gw + 1]! * sx) * sy;
  const h = heightAt(ch, wx, wy, gw, gh);
  const dist = 0.42;
  relieve(
    r, g, b, h,
    heightAt(ch, wx - dist, wy, gw, gh),
    heightAt(ch, wx + dist, wy, gw, gh),
    heightAt(ch, wx, wy - dist, gw, gh),
    heightAt(ch, wx, wy + dist, gw, gh),
    dist, wx, wy, rock,
  );
  return dress(terrain, wx | 0, wy | 0, gw, gh, wx, wy, lit[0] ?? 0, lit[1] ?? 0, lit[2] ?? 0, sand);
}

const gridSlot: {
  terrain: ArrayLike<number>;
  theater: Theater;
  ch: Float32Array;
  cr: Uint8Array;
  cg: Uint8Array;
  cb: Uint8Array;
  gw: number;
  gh: number;
} = {
  terrain: new Uint8Array(0),
  theater: "temperate",
  ch: new Float32Array(0),
  cr: new Uint8Array(0),
  cg: new Uint8Array(0),
  cb: new Uint8Array(0),
  gw: 0,
  gh: 0,
};

/** Rebuild the height grids once per frame before painting cells. */
export function beginTerrain(terrain: ArrayLike<number>, gw: number, gh: number, theater: Theater) {
  if (gw < 2 || gh < 2) return;
  const pal = palette(theater);
  if (gridSlot.ch.length !== gw * gh) {
    gridSlot.ch = new Float32Array(gw * gh);
    gridSlot.cr = new Uint8Array(gw * gh);
    gridSlot.cg = new Uint8Array(gw * gh);
    gridSlot.cb = new Uint8Array(gw * gh);
  }
  gridSlot.terrain = terrain;
  gridSlot.theater = theater;
  gridSlot.gw = gw;
  gridSlot.gh = gh;
  const { ch, cr, cg, cb } = gridSlot;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = terrain[y * gw + x] ?? 0;
      const i = y * gw + x;
      ch[i] = t === TILE_RAMP ? rampHeight(terrain, x, y, gw, gh) : rawH(t);
      const o = (t > 23 ? TILE_CLEAR : t) * 3;
      cr[i] = pal[o] ?? 80;
      cg[i] = pal[o + 1] ?? 90;
      cb[i] = pal[o + 2] ?? 60;
    }
  }
}

/** Ground only. Props are drawn on top so a crush or a depleted field does not wait on the sheet. */
export function paintCell(
  ctx: CanvasRenderingContext2D,
  terrain: ArrayLike<number>,
  x: number,
  y: number,
  gw: number,
  gh: number,
  theater: Theater,
  _time: number,
) {
  if (gw < 2 || gh < 2) {
    ctx.fillStyle = "#3a4a32";
    ctx.fillRect(x, y, 1, 1);
    return;
  }
  if (gridSlot.terrain !== terrain || gridSlot.gw !== gw || gridSlot.gh !== gh || gridSlot.theater !== theater) {
    beginTerrain(terrain, gw, gh, theater);
  }
  const { ch, cr, cg, cb } = gridSlot;
  const rock = rockRgb(theater);
  const sand = sandRgb(theater);
  const n = 4;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const wx = x + (i + 0.5) / n;
      const wy = y + (j + 0.5) / n;
      const rgb = sampleTerrain(terrain, wx, wy, gw, gh, theater, ch, cr, cg, cb, rock, sand);
      ctx.fillStyle = `rgb(${clampByte(rgb[0])},${clampByte(rgb[1])},${clampByte(rgb[2])})`;
      ctx.fillRect(x + i / n, y + j / n, 1 / n + 0.01, 1 / n + 0.01);
    }
  }
}

export function paintWaterSheen(
  ctx: CanvasRenderingContext2D,
  tile: number,
  x: number,
  y: number,
  time: number,
) {
  if (tile !== TILE_DEEP && tile !== TILE_SHALLOW && tile !== TILE_FORD && tile !== TILE_WRECK) return;
  const deep = tile === TILE_DEEP || tile === TILE_WRECK;
  const roll = (time * 0.28 + hash(x, y) * 0.7 + y * 0.05) % 1;
  // Softer sheen that reads at close tactical zoom
  ctx.fillStyle = deep ? "rgba(186, 214, 222, 0.16)" : "rgba(214, 236, 232, 0.22)";
  ctx.fillRect(x, y + roll * 0.68, 1, 0.05);
  // Shore foam on shallow water so coasts meet the land cleanly
  if (!deep) {
    const foam = hash(x * 7 + 3, y * 5 + 1);
    if (foam > 0.45) {
      ctx.fillStyle = `rgba(230, 245, 240, ${0.08 + foam * 0.1})`;
      const fy = y + 0.12 + (hash(x, y) * 0.5);
      ctx.fillRect(x + 0.05, fy, 0.9, 0.035 + foam * 0.02);
    }
  }
}

/** One tile of a deposit. Crystals pack into an irregular cluster and spill past the cell, so the field is not a grid. */
export function paintOre(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  amount: number,
  spent: boolean,
  time: number,
  spark = false,
  around = 4,
  _edge = 0,
) {
  if (spent || amount <= 0) {
    if (!spent) return;
    ctx.fillStyle = "#3a2c1c";
    ctx.fillRect(x + 0.28, y + 0.62, 0.12, 0.08);
    ctx.fillRect(x + 0.55, y + 0.7, 0.14, 0.07);
    return;
  }
  const fill = Math.max(0.55, Math.min(1, amount / 1200));
  const gx = x + 0.42 + (hash(x * 3, y + 2) - 0.5) * 0.55;
  const gy = y + 0.48 + (hash(x + 5, y * 2) - 0.5) * 0.4;
  const reach = 0.72 + (around >= 4 ? 0.28 : 0);
  const glow = ctx.createRadialGradient(gx, gy, 0.04, gx, gy, reach);
  glow.addColorStop(0, `rgba(255, 214, 140, ${0.42 + fill * 0.28})`);
  glow.addColorStop(0.42, `rgba(232, 122, 36, ${0.22 + fill * 0.16})`);
  glow.addColorStop(1, "rgba(232, 122, 36, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(gx, gy, reach, 0, Math.PI * 2);
  ctx.fill();
  const n = around >= 6 ? 6 : around >= 3 ? 5 : 3;
  const bright = ["#ffe2a4", "#ffb03a", "#f08428", "#ffd27a"];
  const deep = ["#c45e16", "#a84812", "#e07020", "#d47828"];
  for (let i = 0; i < n; i++) {
    const hx = hash(x * 5 + i * 13, y * 3 + 4);
    const hy = hash(x + i * 9, y * 8 + 2);
    const px = x - 0.22 + hx * 1.4;
    const py = y - 0.16 + hy * 1.15 + Math.sin(time * 1.6 + x + y + i) * 0.01;
    const s = (around >= 4 ? 0.2 : 0.16) + fill * 0.08 + hash(x + i, y + 11) * 0.06;
    const rot = (hash(x + i * 4, y + 9) - 0.5) * 2.2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.beginPath();
    if (hash(x + i, y * 2) > 0.5) {
      ctx.moveTo(0, -s * 1.25);
      ctx.lineTo(s * 0.62, -s * 0.1);
      ctx.lineTo(s * 0.22, s * 0.95);
      ctx.lineTo(-s * 0.48, s * 0.42);
      ctx.lineTo(-s * 0.7, -s * 0.22);
    } else {
      ctx.moveTo(-s * 0.15, -s * 1.05);
      ctx.lineTo(s * 0.9, -s * 0.2);
      ctx.lineTo(s * 0.4, s * 0.85);
      ctx.lineTo(-s * 0.55, s * 0.55);
      ctx.lineTo(-s * 0.85, -s * 0.05);
    }
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? bright[i % bright.length]! : deep[i % deep.length]!;
    ctx.fill();
    ctx.fillStyle = "rgba(255, 248, 220, 0.9)";
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, -s * 0.72);
    ctx.lineTo(s * 0.18, -s * 0.28);
    ctx.lineTo(-s * 0.1, -s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (spark || hash(x * 11 + 2, y * 7 + 5) > 0.72) {
    const glint = (Math.sin(time * 5 + x * 2 + y) + 1) * 0.5;
    ctx.fillStyle = `rgba(255, 250, 230, ${0.35 + glint * 0.55})`;
    ctx.beginPath();
    ctx.arc(gx + 0.08, gy - 0.1, 0.045 + glint * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function paintTree(ctx: CanvasRenderingContext2D, x: number, y: number, stump: boolean) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + 0.55, y + 0.78, 0.22, 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  if (stump) {
    ctx.fillStyle = "#6a4a28";
    ctx.fillRect(x + 0.4, y + 0.62, 0.2, 0.14);
    ctx.fillStyle = "#c4a06a";
    ctx.fillRect(x + 0.38, y + 0.58, 0.24, 0.06);
    return;
  }
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(x + 0.44, y + 0.55, 0.12, 0.24);
  ctx.fillStyle = "#16381e";
  ctx.beginPath();
  ctx.arc(x + 0.42, y + 0.4, 0.22, 0, Math.PI * 2);
  ctx.arc(x + 0.6, y + 0.36, 0.2, 0, Math.PI * 2);
  ctx.arc(x + 0.5, y + 0.28, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d6836";
  ctx.beginPath();
  ctx.arc(x + 0.36, y + 0.32, 0.08, 0, Math.PI * 2);
  ctx.fill();
}

export function paintShell(ctx: CanvasRenderingContext2D, tile: number, x: number, y: number, mark: number) {
  const rubble = mark >= 2;
  const damaged = mark === 1 || rubble;
  ctx.fillStyle = rubble ? "#5a5044" : tile === TILE_BARN ? "#7a3a28" : tile === TILE_PUMP ? "#4a5a62" : "#8a6a3a";
  if (rubble) {
    ctx.fillRect(x + 0.15, y + 0.55, 0.7, 0.2);
    ctx.fillRect(x + 0.3, y + 0.4, 0.2, 0.18);
    return;
  }
  ctx.fillRect(x + 0.18, y + 0.38, 0.64, 0.4);
  ctx.fillStyle = damaged ? "#2a2420" : "#1a120c";
  ctx.fillRect(x + 0.42, y + 0.55, 0.16, 0.23);
  ctx.fillStyle = tile === TILE_PUMP ? "#8aa0a8" : "#6a2a22";
  ctx.beginPath();
  ctx.moveTo(x + 0.12, y + 0.4);
  ctx.lineTo(x + 0.5, y + 0.16);
  ctx.lineTo(x + 0.88, y + 0.4);
  ctx.fill();
  if (damaged) {
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(x + 0.6, y + 0.42, 0.12, 0.14);
  }
}

export function paintCrater(ctx: CanvasRenderingContext2D, x: number, y: number, mark: number) {
  if (mark <= 0) return;
  ctx.fillStyle = "rgba(20,14,8,0.55)";
  ctx.beginPath();
  ctx.ellipse(x + 0.5, y + 0.58, 0.22 + mark * 0.04, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(90,70,40,0.8)";
  ctx.lineWidth = 0.04;
  ctx.stroke();
}
