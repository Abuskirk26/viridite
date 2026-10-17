import { MAP_H, MAP_W, type MapSizeId } from "./data.ts";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  /** Pan velocity in world units per second. Used for inertia. */
  vx?: number;
  vy?: number;
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

/** Fallback tile sizes. Actual limits are computed from the view and map. */
export const ZOOM_MIN = 4;
export const ZOOM_MAX = 180;
/** Zoom where a troop is drawn at its authored size. */
const ZOOM_HOME = 34;

/**
 * HUD insets so the playable view is the area not covered by the top bar,
 * bottom command strip, or the minimap on the right.
 * Corners of the map can be centered inside this rectangle.
 */
export function playableInsets(view: View, warzone = false): { top: number; bottom: number; left: number; right: number } {
  const mm = minimapRect(view, warzone);
  const phone = view.h > view.w || view.w < 700;
  const top = phone ? Math.max(48, mm.y + mm.s * 0.15) : Math.max(36, 8);
  const bottom = phone ? (view.h < 500 ? 100 : 72) : 48;
  const right = Math.max(mm.s + 12, phone ? 16 : 8);
  const left = phone ? 8 : 8;
  return { top, bottom, left, right };
}

/** Dynamic zoom limits. Max zoom-out fits the whole map in the playable view.
 *  Max zoom-in shows about 9 tiles across the playable width. */
export function zoomLimits(view: View, gw: number, gh: number, warzone = false): { min: number; max: number } {
  const ins = playableInsets(view, warzone);
  const pw = Math.max(32, view.w - ins.left - ins.right);
  const ph = Math.max(32, view.h - ins.top - ins.bottom);
  const fitW = pw / Math.max(1, gw);
  const fitH = ph / Math.max(1, gh * pitch);
  const min = Math.min(fitW, fitH) * 0.92;
  const max = pw / 9;
  return {
    min: Math.max(ZOOM_MIN, Math.min(min, ZOOM_MAX)),
    max: Math.max(min + 1, Math.min(max, ZOOM_MAX * 1.4)),
  };
}

/**
 * Clamp so the camera stays on the map, with enough margin that every corner
 * can be centered in the playable (HUD-free) area.
 */
export function clampCamera(cam: Camera, gw = MAP_W, gh = MAP_H, view?: View, warzone = false) {
  const limits = view ? zoomLimits(view, gw, gh, warzone) : { min: ZOOM_MIN, max: ZOOM_MAX };
  cam.zoom = Math.max(limits.min, Math.min(limits.max, cam.zoom));

  const halfW = view ? view.w / (2 * cam.zoom) : 3;
  const halfH = view ? view.h / (2 * cam.zoom * pitch) : 3;
  const ins = view ? playableInsets(view, warzone) : { top: 0, bottom: 0, left: 0, right: 0 };
  // Extra world units so a map corner can sit under the center of the playable region.
  const marginX = view ? (ins.right - ins.left) / (2 * cam.zoom) : 0;
  const marginY = view ? (ins.bottom - ins.top) / (2 * cam.zoom * pitch) : 0;

  const minX = halfW - marginX * 1.15;
  const maxX = gw - halfW + marginX * 1.15;
  const minY = halfH - marginY * 1.15;
  const maxY = gh - halfH + marginY * 1.15;

  cam.x = Math.max(minX, Math.min(maxX, cam.x));
  cam.y = Math.max(minY, Math.min(maxY, cam.y));
  if (!Number.isFinite(cam.vx)) cam.vx = 0;
  if (!Number.isFinite(cam.vy)) cam.vy = 0;
}

/**
 * Keep one world point under the same pixel while the zoom changes.
 * Pinch, wheel, and the +/- rocker all go through this.
 * Zooms toward the cursor or pinch midpoint.
 */
export function zoomAbout(cam: Camera, sx: number, sy: number, view: View, next: number, gw = MAP_W, gh = MAP_H, warzone = false) {
  const limits = zoomLimits(view, gw, gh, warzone);
  const z = Math.max(limits.min, Math.min(limits.max, next));
  const wx = (sx - view.w / 2) / Math.max(0.01, cam.zoom) + cam.x;
  const wy = (sy - view.h / 2) / Math.max(0.01, cam.zoom * pitch) + cam.y;
  cam.zoom = z;
  cam.x = wx - (sx - view.w / 2) / cam.zoom;
  cam.y = wy - (sy - view.h / 2) / (cam.zoom * pitch);
  clampCamera(cam, gw, gh, view, warzone);
}

/** Wider fields open a step further out. Still close enough that a troop is a finger. */
export function openingZoom(size: MapSizeId): number {
  if (size === "continent") return 28;
  if (size === "warzone") return 32;
  if (size === "large") return 38;
  return 46;
}

/**
 * First frame only. A tall phone opens closer, like a village view, not a map of the whole coast.
 * Pinch still reaches the dynamic ZOOM_MIN that fits the whole map.
 */
export function fitZoom(viewH: number, preferred: number, viewW = viewH): number {
  const landscape = viewW > viewH + 40;
  const tiles = landscape ? (viewH < 430 ? 10 : 9) : 7;
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

/** Apply inertia. Call once per frame with dt in seconds. */
export function stepInertia(cam: Camera, dt: number, gw = MAP_W, gh = MAP_H, view?: View, warzone = false) {
  if (!cam.vx && !cam.vy) return;
  cam.x += (cam.vx || 0) * dt;
  cam.y += (cam.vy || 0) * dt;
  const decay = Math.exp(-dt * 6.5);
  cam.vx = (cam.vx || 0) * decay;
  cam.vy = (cam.vy || 0) * decay;
  if (Math.abs(cam.vx) < 0.15) cam.vx = 0;
  if (Math.abs(cam.vy) < 0.15) cam.vy = 0;
  clampCamera(cam, gw, gh, view, warzone);
}
