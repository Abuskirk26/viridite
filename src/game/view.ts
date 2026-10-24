import { MAP_H, MAP_W, type MapSizeId } from "./data.ts";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  /** Pan velocity in world units per second. Used for inertia. */
  vx?: number;
  vy?: number;
  /** While a finger is down, inertia must not add to the 1:1 drag. */
  hold?: boolean;
  /** Pinch and wheel aim here. The picture eases onto it only at the clamp. */
  aim?: number;
  focusX?: number;
  focusY?: number;
}

export interface View {
  w: number;
  h: number;
  /** Pixels of this canvas covered by the top HUD and the host banner. */
  chromeTop?: number;
  /** Pixels of this canvas covered by the bottom command bar. */
  chromeBottom?: number;
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

/** Fallback tile sizes. Battle limits are the band around BATTLE_TILE_PX. */
export const ZOOM_MIN = 4;
export const ZOOM_MAX = 180;

/**
 * Battle zoom stays near Art of War 3. 48 px per tile is home.
 * Pinch can pull back to 0.8× or in to 1.6×. The same pixels per tile on a
 * phone, a tablet, and a desktop — a wider glass shows more tiles, never the
 * whole map. The map editor does not use this band.
 */
export const BATTLE_TILE_PX = 48;
const BATTLE_ZOOM_OUT = 0.8;
const BATTLE_ZOOM_IN = 1.6;
const REF_LAND_W = 915;
/** 0 = zoomed in, 1 = zoomed out. 0.6 lands on BATTLE_TILE_PX. */
const HOME_TOWARD_OUT = 0.6;

export function portraitView(view: View): boolean {
  return view.h > view.w;
}

/** Tiles across the width. Pixels per tile stay fixed, so the count grows with the glass. */
export function tileSpan(view: View, end: "in" | "out"): number {
  const px = BATTLE_TILE_PX * (end === "out" ? BATTLE_ZOOM_OUT : BATTLE_ZOOM_IN);
  return Math.max(1, view.w) / px;
}

/** Tiles across at a bias from zoomed-in (0) toward zoomed-out (1). */
export function tilesAtBias(view: View, towardOut: number): number {
  const inn = tileSpan(view, "in");
  const out = tileSpan(view, "out");
  const t = Math.max(0, Math.min(1, towardOut));
  return inn + t * (out - inn);
}

export function zoomAtBias(view: View, towardOut: number): number {
  return view.w / Math.max(1, tilesAtBias(view, towardOut));
}

/** Where the current zoom sits between zoomed-in (0) and zoomed-out (1). */
export function zoomBias(zoom: number, view: View): number {
  const inn = tileSpan(view, "in");
  const out = tileSpan(view, "out");
  const tiles = view.w / Math.max(0.01, zoom);
  return Math.max(0, Math.min(1, (tiles - inn) / Math.max(0.001, out - inn)));
}

/** Default battle zoom. Same pixels per tile on every map. */
export function tacticalHome(view: View): number {
  return zoomAtBias(view, HOME_TOWARD_OUT);
}

/**
 * Battle zoom, in pixels per tile. Min is zoomed out, max is zoomed in.
 * Map size does not change it. A map smaller than the glass raises the
 * zoom-out floor so the black void past the edge never enters.
 */
export function zoomLimits(view: View, gw: number, gh: number, _warzone = false): { min: number; max: number } {
  const homeMin = BATTLE_TILE_PX * BATTLE_ZOOM_OUT;
  const homeMax = BATTLE_TILE_PX * BATTLE_ZOOM_IN;
  if (view.w < 8 || view.h < 8) return { min: homeMin, max: homeMax };
  let min = view.w / Math.max(1, tileSpan(view, "out"));
  let max = view.w / Math.max(1, tileSpan(view, "in"));
  if (max < min) max = min;
  // A zoom that frames the whole map is illegal. Raise the floor instead.
  const cover = Math.max(view.w / Math.max(1, gw), view.h / Math.max(1, gh * pitch)) * 1.004;
  if (cover > min) min = Math.min(cover, max);
  if (max < min) max = min;
  return { min, max };
}

/**
 * Keep the camera on the field. The map edge may touch the glass, but the
 * black void past it never enters the picture.
 */
export function clampCamera(cam: Camera, gw = MAP_W, gh = MAP_H, view?: View, warzone = false) {
  const limits = view ? zoomLimits(view, gw, gh, warzone) : { min: ZOOM_MIN, max: ZOOM_MAX };
  cam.zoom = Math.max(limits.min, Math.min(limits.max, cam.zoom));
  if (cam.aim != null) cam.aim = Math.max(limits.min, Math.min(limits.max, cam.aim));

  const halfW = view ? view.w / (2 * cam.zoom) : Math.min(3, gw / 2);
  const halfH = view ? view.h / (2 * cam.zoom * pitch) : Math.min(3, gh / 2);

  const pin = (value: number, half: number, span: number) => {
    const lo = half;
    const hi = span - half;
    if (lo >= hi) return span / 2;
    return Math.max(lo, Math.min(hi, value));
  };
  cam.x = pin(cam.x, halfW, gw);
  cam.y = pin(cam.y, halfH, gh);
  if (!Number.isFinite(cam.vx)) cam.vx = 0;
  if (!Number.isFinite(cam.vy)) cam.vy = 0;
}

/**
 * Keep one world point under the same pixel while the zoom changes.
 * Pinch and the mouse wheel go through this. The speed − and + buttons do not.
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

/**
 * Pinch or wheel. Inside the range the zoom follows the fingers exactly.
 * Past either end the aim sticks on the limit and the picture eases onto it,
 * so the stop is smooth and the camera does not bounce.
 */
export function seekZoom(cam: Camera, sx: number, sy: number, view: View, factor: number, gw = MAP_W, gh = MAP_H, warzone = false) {
  const limits = zoomLimits(view, gw, gh, warzone);
  const base = cam.aim ?? cam.zoom;
  const raw = base * factor;
  const clamped = Math.max(limits.min, Math.min(limits.max, raw));
  cam.focusX = sx;
  cam.focusY = sy;
  cam.aim = clamped;
  if (raw >= limits.min && raw <= limits.max) {
    zoomAbout(cam, sx, sy, view, clamped, gw, gh, warzone);
    cam.aim = clamped;
  }
}

/** Finish a zoom that stopped on the clamp. No-op while pinch is tracking 1:1. */
export function stepZoom(cam: Camera, dt: number, view: View, gw = MAP_W, gh = MAP_H, warzone = false) {
  if (cam.aim == null || view.w < 8 || view.h < 8) return;
  const limits = zoomLimits(view, gw, gh, warzone);
  cam.aim = Math.max(limits.min, Math.min(limits.max, cam.aim));
  const gap = cam.aim - cam.zoom;
  if (Math.abs(gap) < 0.03) {
    if (Math.abs(gap) > 0.0001) {
      zoomAbout(cam, cam.focusX ?? view.w / 2, cam.focusY ?? view.h / 2, view, cam.aim, gw, gh, warzone);
    }
    return;
  }
  const k = 1 - Math.exp(-dt * 12);
  const next = cam.zoom + gap * k;
  zoomAbout(cam, cam.focusX ?? view.w / 2, cam.focusY ?? view.h / 2, view, next, gw, gh, warzone);
}

/** Same opening zoom on every map. The first real frame refits this to the glass. */
export function openingZoom(_size?: MapSizeId): number {
  return tacticalHome({ w: REF_LAND_W, h: 412 });
}

/** Matches do not fit the whole map. Kept so an old caller cannot open an overview. */
export function fitZoom(viewH: number, _preferred = 0, viewW = viewH): number {
  return tacticalHome({ w: Math.max(8, viewW), h: Math.max(8, viewH) });
}

/**
 * One world-size table for every map and faction, in tiles.
 * Infantry stay clearly smaller than vehicles, vehicles smaller than a hall.
 * Screen size comes only from the camera.
 */
const INFANTRY_KINDS = new Set(["rifle", "rocket", "marksman", "wader", "vanguard", "engineer"]);

export function unitWorldSpan(kind: string): number {
  if (INFANTRY_KINDS.has(kind)) return 0.4;
  if (kind === "scout" || kind === "razor" || kind === "apc") return 0.8;
  if (kind === "artillery" || kind === "medium" || kind === "scatter" || kind === "frigate" || kind === "missile") return 1.4;
  if (kind === "chinook" || kind === "attackheli" || kind === "bomber" || kind === "heli") return 1.2;
  if (kind === "tank" || kind === "harvester" || kind === "mcv") return 1.1;
  return 1;
}

/**
 * Picture box in tiles. The sprite is fit inside it, so a tall soldier
 * portrait cannot grow taller than a tank. Buildings stay on their footprint.
 */
export function unitPictureBox(kind: string): { w: number; h: number } {
  if (INFANTRY_KINDS.has(kind)) return { w: 0.42, h: 0.56 };
  if (kind === "scout" || kind === "razor" || kind === "apc") return { w: 1.12, h: 0.88 };
  if (kind === "artillery" || kind === "medium" || kind === "scatter" || kind === "frigate" || kind === "missile") return { w: 1.85, h: 1.35 };
  if (kind === "chinook" || kind === "attackheli" || kind === "bomber" || kind === "heli") return { w: 1.45, h: 1.1 };
  if (kind === "tank" || kind === "harvester" || kind === "mcv") return { w: 1.55, h: 1.12 };
  return { w: 1.2, h: 0.92 };
}

/** Width of the drawn sprite. Height is this times the picture's aspect. */
export function unitPictureWidth(kind: string, aspect: number): number {
  const box = unitPictureBox(kind);
  const a = Math.max(0.35, aspect);
  return Math.min(box.w, box.h / a);
}

/** Hall picture is the footprint times this. Same on every map. Buildings are not resized. */
export function hallDrawMul(kind: string): number {
  if (kind === "tower" || kind === "aa") return 1.05;
  if (kind === "advpower") return 0.96;
  if (kind === "power") return 0.86;
  return 0.92;
}

/** Drawn picture aspect (height / width) of each hall sheet. Used so a tap on the roof hits the building. */
const HALL_ASPECT: Record<string, number> = {
  yard: 0.9,
  power: 1.43,
  advpower: 1.43,
  refinery: 1.15,
  barracks: 1.19,
  factory: 1.1,
  tower: 0.91,
  aa: 0.91,
  radar: 0.91,
  supply: 1.05,
  silo: 1.05,
  dock: 1.1,
  helipad: 0.85,
  stealth: 1.19,
};

/**
 * How far the hall picture rises above its south foot, in world tiles.
 * The picture is drawn with the pitch undone, so the roof sits north of the footprint.
 */
export function hallPictureLift(kind: string, w: number, h: number): number {
  if (kind === "wall" || kind === "sandbag" || kind === "gate" || kind === "span") return 0;
  const wide = Math.max(w, h) * hallDrawMul(kind);
  const aspect = HALL_ASPECT[kind] ?? 1.25;
  return (wide * aspect) / viewPitch();
}

/** World scale does not change with zoom, map, or doctrine. */
export function troopScale(_zoom: number): number {
  return 1;
}

/** Buildings stay on their footprint. Zoom does not shrink or swell them. */
export function hallScale(_zoom: number): number {
  return 1;
}

/** Tap radius in world tiles. Infantry stay a 44px target on a phone. */
export function unitPickRadius(kind: string, zoom: number): number {
  const px = Math.max(8, zoom);
  const minPx = INFANTRY_KINDS.has(kind) ? 44 : 32;
  return Math.max(unitWorldSpan(kind) * 0.45, minPx / px / 2);
}

/** Square minimap. Sits fully below the top HUD and host banner, and above the command bar. */
export function minimapRect(view: View, warzone = false): { x: number; y: number; s: number } {
  const top = Math.max(4, Math.round(view.chromeTop ?? 0) + 4);
  const bottom = Math.max(4, Math.round(view.chromeBottom ?? 0) + 4);
  const landscape = view.w > view.h + 40;
  const availH = Math.max(48, view.h - top - bottom);
  const availW = Math.max(48, view.w - 8);
  const short = view.h < 320;
  let s: number;
  if (landscape && view.h < 500) {
    s = 96;
  } else {
    const frac = landscape ? (short ? 0.42 : 0.46) : warzone ? 0.42 : 0.26;
    const cap = landscape ? (short ? 96 : 140) : warzone ? 200 : 120;
    const floor = landscape ? (short ? 64 : 88) : warzone ? 112 : 80;
    const maxSide = Math.max(48, Math.min(view.w * 0.3, availH));
    s = Math.round(Math.min(maxSide, Math.max(Math.min(floor, maxSide), Math.min(cap, Math.min(view.w, view.h) * frac))));
  }
  s = Math.max(48, Math.min(s, availH, availW, view.w * 0.42));
  return { x: Math.max(4, view.w - s - 4), y: top, s: Math.round(s) };
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
  if (cam.hold) return;
  if (!cam.vx && !cam.vy) return;
  cam.x += (cam.vx || 0) * dt;
  cam.y += (cam.vy || 0) * dt;
  const decay = Math.exp(-dt * 8.5);
  cam.vx = (cam.vx || 0) * decay;
  cam.vy = (cam.vy || 0) * decay;
  if (Math.abs(cam.vx) < 0.15) cam.vx = 0;
  if (Math.abs(cam.vy) < 0.15) cam.vy = 0;
  clampCamera(cam, gw, gh, view, warzone);
}
