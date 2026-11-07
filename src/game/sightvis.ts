/**
 * Sight ring shared by the 2D canvas and the 3D glass overlay.
 * Forests, cliffs, and rocks clip the ring. High ground adds the same bonus the sim uses.
 */

import { SIGHT, TILE_CLIFF, TILE_HIGH, TILE_ROCK, TILE_SCRUB } from "./data.ts";

export function sightTileBlocks(tile: number): boolean {
  return tile === TILE_SCRUB || tile === TILE_CLIFF || tile === TILE_ROCK;
}

export function sightRadius(terrain: Uint8Array, gw: number, gh: number, x: number, y: number, sight: number): number {
  const tx = x | 0;
  const ty = y | 0;
  const here = tx >= 0 && ty >= 0 && tx < gw && ty < gh ? (terrain[ty * gw + tx] ?? 0) : 0;
  return sight + (here === TILE_HIGH ? SIGHT.highBonus : 0);
}

/** Screen size of the marksman eye. Never under 14 px once the camera is in the phone zoom band. */
export function marksmanEyePx(zoom: number): number {
  const z = Math.max(8, zoom);
  return Math.max(14, 0.28 * z);
}

export function marksmanAiming(kind: string, still: number): boolean {
  return kind === "marksman" && still >= SIGHT.marksmanSettle;
}

export interface SightSample {
  x: number;
  y: number;
  draw: boolean;
}

/** Points around the ring. A point on forest, cliff, or rock is not drawn. */
export function sightRingSamples(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x: number,
  y: number,
  radius: number,
  steps = 72,
): SightSample[] {
  const out: SightSample[] = [];
  const n = Math.max(12, steps);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wx = x + Math.cos(a) * radius;
    const wy = y + Math.sin(a) * radius;
    const tx = wx | 0;
    const ty = wy | 0;
    const inside = tx >= 0 && ty >= 0 && tx < gw && ty < gh;
    const tile = inside ? (terrain[ty * gw + tx] ?? 0) : TILE_ROCK;
    out.push({ x: wx, y: wy, draw: inside && !sightTileBlocks(tile) });
  }
  return out;
}
