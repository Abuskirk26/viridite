import { MAP_H, MAP_W, type MapSizeId } from "./data.ts";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface View {
  w: number;
  h: number;
}

/** How flat the ground looks. 0.68 matches a low aerial. Palm Isle sets this to 1 so the picture keeps its own shape. */
export const VIEW_PITCH = 0.68;
let pitch = VIEW_PITCH;

export function setViewPitch(next: number) {
  pitch = next > 0.2 ? next : VIEW_PITCH;
}

export function viewPitch(): number {
  return pitch;
}

export function screenToWorld(cam: Camera, sx: number, sy: number, view: View): { x: number; y: number } {
  return {
    x: (sx - view.w / 2) / cam.zoom + cam.x,
    y: (sy - view.h / 2) / (cam.zoom * pitch) + cam.y,
  };
}

export function worldToScreen(cam: Camera, wx: number, wy: number, view: View): { x: number; y: number } {
  return {
    x: (wx - cam.x) * cam.zoom + view.w / 2,
    y: (wy - cam.y) * cam.zoom * pitch + view.h / 2,
  };
}

/** One tile in CSS pixels. Far enough to frame a base, close enough for a troop. */
export const ZOOM_MIN = 5;
export const ZOOM_MAX = 180;
/** Zoom where a troop is drawn at its authored size. */
const ZOOM_HOME = 34;

export function clampCamera(cam: Camera, gw = MAP_W, gh = MAP_H) {
  cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom));
  cam.x = Math.max(3, Math.min(gw - 3, cam.x));
  cam.y = Math.max(3, Math.min(gh - 3, cam.y));
}

/**
 * Keep one world point under the same pixel while the zoom changes.
 * Pinch, wheel, and the +/- rocker all go through this.
 */
export function zoomAbout(cam: Camera, sx: number, sy: number, view: View, next: number, gw = MAP_W, gh = MAP_H) {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
  const wx = (sx - view.w / 2) / Math.max(0.01, cam.zoom) + cam.x;
  const wy = (sy - view.h / 2) / Math.max(0.01, cam.zoom * pitch) + cam.y;
  cam.zoom = z;
  cam.x = wx - (sx - view.w / 2) / cam.zoom;
  cam.y = wy - (sy - view.h / 2) / (cam.zoom * pitch);
  clampCamera(cam, gw, gh);
}

/** Wider fields open a step further out. Still close enough that a troop is a finger. */
export function openingZoom(size: MapSizeId): number {
  if (size === "continent") return 24;
  if (size === "warzone") return 28;
  if (size === "large") return 34;
  return 40;
}

/**
 * First frame only. A tall phone opens closer, like a village view, not a map of the whole coast.
 * Pinch still reaches ZOOM_MIN.
 */
export function fitZoom(viewH: number, preferred: number, viewW = viewH): number {
  const landscape = viewW > viewH + 40;
  const tiles = landscape ? (viewH < 430 ? 12 : 11) : 9;
  const fit = Math.max(1, viewH) / tiles;
  const zoom = Math.max(preferred, fit * 0.9);
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/**
 * Clash-style troop picture. World sprites sit under the camera scale, so this
 * multiplier is in tiles: above 1 when pulled back (a squad still reads),
 * below 1 when pressed in (a tank does not fill the glass).
 */
export function troopScale(zoom: number): number {
  const pulled = Math.pow(ZOOM_HOME / Math.max(ZOOM_MIN, zoom), 0.55);
  return Math.max(0.38, Math.min(1.75, pulled));
}

/** Buildings stay on the grid. They shrink with the camera so a close zoom shows the model, not a stamp. */
export function hallScale(zoom: number): number {
  const pulled = Math.pow(ZOOM_HOME / Math.max(ZOOM_MIN, zoom), 0.42);
  return Math.max(0.42, Math.min(1.22, pulled));
}

/** Square minimap. Never taller than the canvas — a phone landscape strip used to hide the map. */
export function minimapRect(view: View, warzone = false): { x: number; y: number; s: number } {
  const landscape = view.w > view.h + 40;
  const short = view.h < 320;
  const frac = landscape ? (short ? 0.42 : 0.46) : warzone ? 0.42 : 0.26;
  const cap = landscape ? (short ? 96 : 140) : warzone ? 200 : 120;
  const floor = landscape ? (short ? 64 : 88) : warzone ? 112 : 80;
  const maxSide = Math.max(48, Math.min(view.w * 0.3, view.h - 8));
  const s = Math.round(Math.min(maxSide, Math.max(Math.min(floor, maxSide), Math.min(cap, Math.min(view.w, view.h) * frac))));
  return { x: Math.max(4, view.w - s - 4), y: 4, s };
}

export function minimapHit(
  sx: number,
  sy: number,
  view: View,
  gw = MAP_W,
  gh = MAP_H,
  warzone = false,
): { x: number; y: number } | null {
  const r = minimapRect(view, warzone);
  if (sx < r.x - 4 || sy < r.y - 4 || sx > r.x + r.s + 4 || sy > r.y + r.s + 4) return null;
  const u = Math.max(0, Math.min(1, (sx - r.x) / r.s));
  const v = Math.max(0, Math.min(1, (sy - r.y) / r.s));
  return { x: u * gw, y: v * gh };
}
