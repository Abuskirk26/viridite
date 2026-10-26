/**
 * Shared corner of the 3D ground. Neighbouring tiles meet on the same
 * vertex, so sand and grass blend and the grid does not show as squares.
 * A tall step stays a cliff instead of being averaged into a ramp.
 */

import {
  TILE_BRIDGE,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_FORD,
  TILE_HIGH,
  TILE_RAMP,
  TILE_ROAD,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SCRUB,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_STUMP,
  TILE_VALLEY,
  TILE_WRECK,
} from "../data.ts";

export type RGB = [number, number, number];

const ROCK: RGB = [0.43, 0.4, 0.36];

export function hash01(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function waterTile(tile: number): boolean {
  return tile === TILE_DEEP || tile === TILE_SHALLOW || tile === TILE_WRECK;
}

export function surfaceOf(tile: number): number {
  if (tile === TILE_CLIFF) return 1.7;
  if (tile === TILE_HIGH) return 1.22;
  if (tile === TILE_ROCK) return 0.96;
  if (tile === TILE_BRIDGE) return 0.5;
  if (tile === TILE_RAMP) return 0.58;
  if (tile === TILE_DEEP || tile === TILE_WRECK) return -0.16;
  if (tile === TILE_SHALLOW) return -0.08;
  return 0.02;
}

/** Flat colour of one tile, before it is blended with its neighbours. */
export function tintOf(tile: number): RGB {
  if (tile === TILE_CRYSTAL) return [0.5, 0.44, 0.28];
  if (tile === TILE_SAND) return [0.8, 0.68, 0.44];
  if (tile === TILE_SHORE) return [0.74, 0.66, 0.42];
  if (tile === TILE_FORD) return [0.58, 0.5, 0.32];
  if (tile === TILE_ROAD || tile === TILE_BRIDGE) return [0.42, 0.32, 0.2];
  if (tile === TILE_ROCK || tile === TILE_CLIFF) return [0.46, 0.43, 0.38];
  if (tile === TILE_HIGH) return [0.38, 0.52, 0.28];
  if (tile === TILE_RAMP) return [0.44, 0.48, 0.3];
  if (tile === TILE_SCRUB || tile === TILE_STUMP) return [0.24, 0.4, 0.18];
  if (tile === TILE_ROUGH || tile === TILE_VALLEY) return [0.4, 0.38, 0.24];
  return [0.32, 0.5, 0.26];
}

export interface Corner {
  x: number;
  z: number;
  y: number;
  high: number;
  low: number;
  cliff: boolean;
  rgb: RGB;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash01(x0, y0);
  const n10 = hash01(x0 + 1, y0);
  const n01 = hash01(x0, y0 + 1);
  const n11 = hash01(x0 + 1, y0 + 1);
  const a = n00 * (1 - sx) + n10 * sx;
  const b = n01 * (1 - sx) + n11 * sx;
  return a * (1 - sy) + b * sy;
}

/**
 * `tileAt` returns the tile id, or -1 outside the map. Corner (cx, cz) is the
 * grid point at the corner of up to four tiles.
 */
export function sampleCorner(tileAt: (x: number, y: number) => number, cx: number, cz: number): Corner {
  const spots: [number, number][] = [
    [cx - 1, cz - 1],
    [cx, cz - 1],
    [cx - 1, cz],
    [cx, cz],
  ];
  const land: { x: number; z: number; y: number; rgb: RGB }[] = [];
  let wet = false;
  for (const [tx, tz] of spots) {
    const tile = tileAt(tx, tz);
    if (tile < 0) continue;
    if (waterTile(tile)) {
      wet = true;
      continue;
    }
    land.push({ x: tx + 0.5, z: tz + 0.5, y: surfaceOf(tile), rgb: tintOf(tile) });
  }
  if (!land.length) {
    return { x: cx, z: cz, y: -0.12, high: -0.12, low: -0.12, cliff: false, rgb: [0.08, 0.22, 0.3] };
  }
  let low = Infinity;
  let high = -Infinity;
  let sum = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let sx = 0;
  let sz = 0;
  for (const spot of land) {
    low = Math.min(low, spot.y);
    high = Math.max(high, spot.y);
    sum += spot.y;
    r += spot.rgb[0];
    g += spot.rgb[1];
    b += spot.rgb[2];
    sx += spot.x;
    sz += spot.z;
  }
  const n = land.length;
  const cliff = high - low > 0.7;
  let y = cliff ? low : sum / n;
  let x = cx;
  let z = cz;
  if (!cliff && wet) {
    const pull = 0.2 + hash01(cx * 5 + 1, cz * 7 + 3) * 0.22;
    x = cx + (sx / n - cx) * pull;
    z = cz + (sz / n - cz) * pull;
    y *= 1 - pull * 0.75;
  }
  const grain = (valueNoise(cx * 0.37, cz * 0.37) - 0.5) * 0.07;
  const rock = Math.min(1, Math.max(0, (high - low - 0.22) / 0.7));
  const rgb: RGB = [
    (r / n + grain) * (1 - rock) + ROCK[0] * rock,
    (g / n + grain * 0.9) * (1 - rock) + ROCK[1] * rock,
    (b / n + grain * 0.45) * (1 - rock) + ROCK[2] * rock,
  ];
  return { x, z, y, high, low, cliff, rgb };
}
