import { stepParticles, drawParticles } from "./combat-fx.ts";
import { hearAt } from "./audio.ts";
import {
  BUILD_GAP,
  BUILDINGS,
  MAP_H,
  MAP_W,
  TILE_FORD,
  TILE_ROAD,
  TILE_VALLEY,
  type Theater,
  TILE_BRIDGE,
  TILE_CLEAR,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_HIGH,
  TILE_RAMP,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SCRUB,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_SPENT,
  TILE_STUMP,
  TILE_WRECK,
  isFence,
  resolveBuilding,
  resolveUnit,
  teamStyle,
  wideField,
  type TeamShape,
  type BuildingId,
  type Team,
} from "./data.ts";
import { generateMap } from "./maps.ts";
import type { Building, Sim, Unit } from "./sim.ts";
import { ghostPlaceReason, shortPlaceReason } from "./sim.ts";
import { hallDrawMul, minimapRect, unitPictureWidth, unitWorldSpan, viewPitch, worldToScreen, zoomLimits, type Camera, type View } from "./view.ts";
import { art, sourceSize, type Painted } from "./art.ts";
import { paintSolidBuilding, paintSolidUnit, SOLID_LIFT, SOLID_SHEAR } from "./solids.ts";
import { ensureIso, iso, type IsoBank } from "./iso.ts";
import { beginTerrain, isShell, packTerrain, paintCell, paintCrater, paintOre, paintShell, paintTree, paintWaterSheen, writeTerrain } from "./tileset.ts";

/** Phone and 4K panels keep their real pixels. Capped so a buffer never goes past 4K-class. */
export function frameScale(): number {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(3, Math.max(1, dpr));
}
let GW = MAP_W;
let GH = MAP_H;
let THEATER: Theater = "desert";
let VIEWER: Team = 0;

function seatPaint(sim: Sim, team: number): string {
  return sim.seatColor(team);
}

export interface DrawUi {
  selected: number[];
  buildingId: number | null;
  placing: BuildingId | null;
  hover: { tx: number; ty: number } | null;
  /** Lifted ghost while a finger is dragging. The drop tile stays in hover. */
  ghost?: { tx: number; ty: number } | null;
  wallRun: { tx: number; ty: number; ok: boolean; reason?: string }[] | null;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  shake: number;
  /** Seat whose fog and stealth the phone should draw. Local skirmish is 0. */
  viewer?: number;
  /** Build-range squares and the tile grid, drawn while a structure is in hand. */
  placeGrid?: boolean;
  /** Finger placement paints Confirm and Cancel beside the ghost. */
  touchPlace?: boolean;
}

function hash(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function shade(hex: string, m: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * m)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * m)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * m)));
  return `rgb(${r},${g},${b})`;
}

function groveAt(x: number, y: number): boolean {
  return hash((x / 4) | 0, (y / 4) | 0) > 0.22;
}

export function tileColor(terrain: number, x: number, y: number, theater: Theater = "desert"): string {
  const h = hash(x, y);
  if (terrain === TILE_DEEP) return h > 0.66 ? "#1a4d68" : h > 0.33 ? "#14384c" : "#0e2838";
  if (terrain === TILE_SHALLOW) return h > 0.55 ? "#5eb8c4" : h > 0.25 ? "#3e96ae" : "#2f7e98";
  if (terrain === TILE_FORD) return h > 0.5 ? "#3f8f78" : "#2f6e62";
  if (terrain === TILE_SHORE) return theater === "snow" ? "#d5dde6" : h > 0.5 ? "#e2c48a" : "#c9a56c";
  if (terrain === TILE_BRIDGE) return h > 0.5 ? "#a07848" : "#7a5a38";
  if (terrain === TILE_ROAD) return h > 0.5 ? "#8d6a42" : "#6e5232";
  if (terrain === TILE_HIGH) return theater === "snow" ? "#e7eef4" : "#d2c09a";
  if (terrain === TILE_RAMP) return "#b08a58";
  if (terrain === TILE_CLIFF || terrain === TILE_ROCK) return h > 0.5 ? "#6e5e4c" : "#514638";
  if (terrain === TILE_CRYSTAL) return h > 0.55 ? "#6a8a48" : "#7d9a56";
  if (terrain === TILE_SPENT) return h > 0.5 ? "#8a6a44" : "#6e5434";
  if (terrain === TILE_VALLEY) {
    if (theater === "snow") return "#b7c4b0";
    if (theater === "temperate") return h > 0.5 ? "#3e5a32" : "#2c4624";
    return "#5d7348";
  }
  if (theater === "snow" && terrain === TILE_SCRUB) return "#8ea0b4";
  if (theater === "snow") return h > 0.5 ? "#e8eef5" : "#d4dee8";
  if (theater === "temperate" && (terrain === TILE_SCRUB || groveAt(x, y))) {
    if (h > 0.72) return "#16381e";
    if (h > 0.4) return "#1f4e2a";
    return "#2d6836";
  }
  if (terrain === TILE_SCRUB) return h > 0.6 ? "#c4a56c" : "#d2b483";
  if (theater === "temperate") return h > 0.55 ? "#7ea85a" : h > 0.25 ? "#68924c" : "#52783c";
  const dune = hash((x / 6) | 0, (y / 3) | 0);
  if (dune > 0.72) return h > 0.5 ? "#edd6a4" : "#e0c48c";
  if (dune < 0.28) return h > 0.5 ? "#b68a52" : "#9a7040";
  if (h > 0.66) return "#e0c48a";
  if (h > 0.33) return "#d2b07a";
  return "#c4a068";
}

/** Lobby minimap. Rich viridite is brighter green. Starts are gold. */
export function paintDocThumb(
  canvas: HTMLCanvasElement,
  doc: {
    w: number;
    h: number;
    theater: Theater;
    terrain: ArrayLike<number>;
    crystal: ArrayLike<number>;
    starts: { x: number; y: number }[];
  },
) {
  canvas.width = doc.w;
  canvas.height = doc.h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const img = ctx.createImageData(doc.w, doc.h);
  const data = img.data;
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      const i = y * doc.w + x;
      const color = tileColor(doc.terrain[i] ?? 0, x, y, doc.theater);
      const n = Number.parseInt(color.slice(1), 16);
      const rich = (doc.crystal[i] ?? 0) >= 1200;
      const o = i * 4;
      data[o] = rich ? 80 : (n >> 16) & 255;
      data[o + 1] = rich ? 210 : (n >> 8) & 255;
      data[o + 2] = rich ? 110 : n & 255;
      data[o + 3] = 255;
    }
  }
  for (const s of doc.starts) {
    const x = Math.min(doc.w - 1, Math.max(0, Math.floor(s.x)));
    const y = Math.min(doc.h - 1, Math.max(0, Math.floor(s.y)));
    const o = (y * doc.w + x) * 4;
    data[o] = 228;
    data[o + 1] = 193;
    data[o + 2] = 90;
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function paintPreview(
  canvas: HTMLCanvasElement,
  mapId: Sim["mapId"],
  ground?: CanvasImageSource | null,
) {
  const map = generateMap(mapId);
  const s = 2;
  canvas.width = MAP_W * s;
  canvas.height = MAP_H * s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (ground) {
    ctx.drawImage(ground, 0, 0, canvas.width, canvas.height);
  }
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (!ground) {
        ctx.fillStyle = tileColor(map.terrain[i], x, y);
        ctx.fillRect(x * s, y * s, s, s);
      } else if (map.terrain[i] === TILE_ROCK) {
        ctx.fillStyle = "rgba(20,14,10,0.55)";
        ctx.fillRect(x * s, y * s, s, s);
      }
      if (map.crystal[i] > 0) {
        ctx.fillStyle = "#3dcc6e";
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  }
  ctx.fillStyle = "#6aa4d0";
  ctx.fillRect(map.player.x * s - 2, map.player.y * s - 2, 5, 5);
  ctx.fillStyle = "#e07a55";
  ctx.fillRect(map.enemy.x * s - 2, map.enemy.y * s - 2, 5, 5);
}

let fogCanvas: HTMLCanvasElement | null = null;
let fogSrc: Float32Array | null = null;
let fogTmp: Float32Array | null = null;

function fogAlpha(state: number): number {
  if (state === 2) return 0;
  if (state === 1) return 58;
  return 168;
}

function sampleFog(fog: Uint8Array, wx: number, wy: number, gw: number, gh: number): number {
  if (wx < 0 || wy < 0 || wx > gw - 1 || wy > gh - 1) return 196;
  const x0 = wx | 0;
  const y0 = wy | 0;
  const x1 = Math.min(gw - 1, x0 + 1);
  const y1 = Math.min(gh - 1, y0 + 1);
  const fx = wx - x0;
  const fy = wy - y0;
  const a00 = fogAlpha(fog[y0 * gw + x0] ?? 0);
  const a10 = fogAlpha(fog[y0 * gw + x1] ?? 0);
  const a01 = fogAlpha(fog[y1 * gw + x0] ?? 0);
  const a11 = fogAlpha(fog[y1 * gw + x1] ?? 0);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return (a00 * (1 - sx) + a10 * sx) * (1 - sy) + (a01 * (1 - sx) + a11 * sx) * sy;
}

function blurBox(src: Float32Array, dst: Float32Array, w: number, h: number, horiz: boolean, r: number) {
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const xx = horiz ? Math.max(0, Math.min(w - 1, x + k)) : x;
        const yy = horiz ? y : Math.max(0, Math.min(h - 1, y + k));
        s += src[yy * w + xx] ?? 0;
      }
      dst[y * w + x] = s / span;
    }
  }
}

/**
 * Fog in screen pixels, not one square per tile.
 * Visible ground stays clear. Explored ground is a dim veil. The edge is a gradient.
 */
function paintScreenFog(ctx: CanvasRenderingContext2D, fog: Uint8Array | undefined, cam: Camera, view: View, gw: number, gh: number) {
  if (!fog || fog.length < gw * gh || view.w < 8 || view.h < 8) return;
  const pitch = viewPitch();
  const maxSide = 200;
  const aspect = view.w / view.h;
  const bw = Math.max(72, aspect >= 1 ? maxSide : Math.round(maxSide * aspect));
  const bh = Math.max(72, aspect >= 1 ? Math.round(maxSide / aspect) : maxSide);
  const n = bw * bh;
  if (!fogSrc || fogSrc.length < n) {
    fogSrc = new Float32Array(n);
    fogTmp = new Float32Array(n);
  }
  const src = fogSrc;
  const tmp = fogTmp!;
  const halfW = view.w / (2 * cam.zoom);
  const halfH = view.h / (2 * cam.zoom * pitch);
  const x0 = cam.x - halfW;
  const y0 = cam.y - halfH;
  let peak = 0;
  for (let y = 0; y < bh; y++) {
    const wy = y0 + ((y + 0.5) / bh) * halfH * 2;
    for (let x = 0; x < bw; x++) {
      const wx = x0 + ((x + 0.5) / bw) * halfW * 2;
      const a = sampleFog(fog, wx, wy, gw, gh);
      src[y * bw + x] = a;
      if (a > peak) peak = a;
    }
  }
  if (peak < 1) return;
  blurBox(src, tmp, bw, bh, true, 5);
  blurBox(tmp, src, bw, bh, false, 5);
  blurBox(src, tmp, bw, bh, true, 3);
  blurBox(tmp, src, bw, bh, false, 3);
  if (!fogCanvas) fogCanvas = document.createElement("canvas");
  if (fogCanvas.width !== bw) fogCanvas.width = bw;
  if (fogCanvas.height !== bh) fogCanvas.height = bh;
  const fx = fogCanvas.getContext("2d");
  if (!fx) return;
  const img = fx.createImageData(bw, bh);
  const data = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = src[i] ?? 0;
    data[o] = 10;
    data[o + 1] = 16;
    data[o + 2] = 22;
    data[o + 3] = a < 1 ? 0 : a > 210 ? 210 : a;
  }
  fx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fogCanvas, 0, 0, view.w, view.h);
  ctx.restore();
}

function paintMapRim(ctx: CanvasRenderingContext2D, gw: number, gh: number) {
  const band = 2.4;
  const edge = (grad: CanvasGradient, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  };
  ctx.save();
  const sea = "rgba(10, 42, 62, 0.28)";
  const fade = "rgba(10, 42, 62, 0)";
  const north = ctx.createLinearGradient(0, 0, 0, band);
  north.addColorStop(0, sea);
  north.addColorStop(1, fade);
  edge(north, 0, 0, gw, band);
  const south = ctx.createLinearGradient(0, gh, 0, gh - band);
  south.addColorStop(0, sea);
  south.addColorStop(1, fade);
  edge(south, 0, gh - band, gw, band);
  const west = ctx.createLinearGradient(0, 0, band, 0);
  west.addColorStop(0, sea);
  west.addColorStop(1, fade);
  edge(west, 0, 0, band, gh);
  const east = ctx.createLinearGradient(gw, 0, gw - band, 0);
  east.addColorStop(0, sea);
  east.addColorStop(1, fade);
  edge(east, gw - band, 0, band, gh);
  ctx.restore();
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cam: Camera,
  view: View,
  ui: DrawUi,
  alpha: number,
  ground?: CanvasImageSource | null,
  detail?: { canvas: CanvasImageSource; x: number; y: number; w: number; h: number } | null,
  sheet?: { image: CanvasImageSource; tw: number; th: number } | null,
  relief?: CanvasImageSource | null,
) {
  VIEWER = ui.viewer === 1 || ui.viewer === 2 || ui.viewer === 3 ? ui.viewer : 0;
  hearAt(cam.x, cam.y);
  GW = sim.gw;
  GH = sim.gh;
  THEATER = sim.theater;
  ensureIso();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const dpr = ctx.canvas.width / Math.max(1, view.w);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = THEATER === "snow" ? "#1a2830" : THEATER === "desert" ? "#1a1610" : "#0a1a22";
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.save();
  ctx.translate(view.w / 2, view.h / 2);
  ctx.scale(cam.zoom, cam.zoom * viewPitch());
  ctx.translate(-cam.x, -cam.y);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const pad = 2;
  const ySpan = 2 * cam.zoom * viewPitch();
  const x0 = Math.max(0, Math.floor(cam.x - view.w / (2 * cam.zoom)) - pad);
  const y0 = Math.max(0, Math.floor(cam.y - view.h / ySpan) - pad);
  const x1 = Math.min(GW - 1, Math.ceil(cam.x + view.w / (2 * cam.zoom)) + pad);
  const y1 = Math.min(GH - 1, Math.ceil(cam.y + view.h / ySpan) + pad);
  const fog = sim.fog[VIEWER];
  const bank = art();
  if (ground) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(ground, 0, 0, GW, GH);
    if (detail && detail.w > 0 && detail.h > 0) {
      ctx.drawImage(detail.canvas, detail.x, detail.y, detail.w, detail.h);
    }
  } else if (sheet) {
    const sx = (x0 * sheet.tw) / GW;
    const sy = (y0 * sheet.th) / GH;
    const sw = ((x1 - x0 + 1) * sheet.tw) / GW;
    const sh = ((y1 - y0 + 1) * sheet.th) / GH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sheet.image, sx, sy, sw, sh, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    ctx.imageSmoothingEnabled = true;
  }
  const baked = !!sheet;
  if (!ground && !baked) beginTerrain(sim.terrain, GW, GH, sim.theater);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ground) {
        if (sim.mapId === "michigan") blendMichigan(ctx, sim, x, y);
      } else if (!baked) {
        paintCell(ctx, sim.terrain, x, y, GW, GH, sim.theater, 0);
      }
    }
  }
  paintMapRim(ctx, GW, GH);
  let trees = 0;
  let shells = 0;
  const spark = new Set<number>();
  for (const u of sim.units) {
    if (u.hp > 0 && u.gather > 0 && u.harvestTx >= 0) spark.add(u.harvestTy * GW + u.harvestTx);
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (fog[y * GW + x] !== 2) continue;
      const drew = paintFieldProps(ctx, sim, x, y, baked, spark, trees < 150, shells < 40);
      if (drew === "tree") trees++;
      else if (drew === "shell") shells++;
    }
  }
  paintCrossings(ctx, sim.terrain, GW, GH, x0, y0, x1, y1);

  // Every map shares one scale with the ground. A rifle is about half a tile,
  // a tank about one, a hall sits on its footprint. The camera is the only zoom.
  const hs = 1;
  const ts = 1;
  const around = (px: number, py: number, s: number, draw: () => void) => {
    if (s > 0.995 && s < 1.005) {
      draw();
      return;
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.translate(-px, -py);
    draw();
    ctx.restore();
  };

  const depth: { y: number; draw: () => void }[] = [];
  for (const b of sim.buildings) {
    if (b.hp <= 0 && b.rubble > 100) {
      if (b.team === VIEWER || rubbleSeen(sim, b)) {
        depth.push({ y: b.ty + b.h, draw: () => paintRubble(ctx, b) });
      }
      continue;
    }
    if (b.hp <= 0 && b.collapse <= 0) continue;
    if (!sim.buildingVisible(VIEWER, b)) continue;
    const low = sim.powerOf(b.team).low;
    const paint = () => {
      drawBuilding(ctx, b, seatPaint(sim, b.team), ui.buildingId === b.id, sim.time, low, sim);
      if (b.hit > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.9, b.hit * 2.2);
        ctx.strokeStyle = "#fff6e8";
        ctx.lineWidth = 0.14;
        ctx.strokeRect(b.tx - 0.08, b.ty - 0.08, b.w + 0.16, b.h + 0.16);
        ctx.restore();
      }
    };
    depth.push({
      y: b.ty + b.h,
      draw: () => (isFence(b.kind) ? paint() : around(b.tx + b.w / 2, b.ty + b.h / 2, hs, paint)),
    });
  }

  for (const c of sim.crates) {
    const ti = (c.y | 0) * GW + (c.x | 0);
    if (ti < 0 || ti >= fog.length || fog[ti] !== 2) continue;
    depth.push({ y: c.y, draw: () => drawCrate(ctx, c.x, c.y, c.kind, sim.time) });
  }

  const a = Math.max(0, Math.min(1, alpha));
  const cullFar = wideField(sim.mapSize);
  const halfW = view.w / (2 * cam.zoom) + 2.6;
  const halfH = view.h / (2 * cam.zoom * viewPitch()) + 2.6;
  const onScreen = (x: number, y: number) => !cullFar || (Math.abs(x - cam.x) <= halfW && Math.abs(y - cam.y) <= halfH);
  let propN = 0;
  for (const p of sim.fieldProps) {
    if (propN >= 40) break;
    if (!onScreen(p.x, p.y)) continue;
    const ti = (p.y | 0) * GW + (p.x | 0);
    if (ti < 0 || ti >= fog.length || fog[ti] !== 2) continue;
    propN++;
    depth.push({ y: p.y, draw: () => paintFieldProp(ctx, p.x, p.y, p.kind, sim.time) });
  }
  for (const u of sim.units) {
    if (u.loco !== "air" || !sim.visibleUnit(VIEWER, u)) continue;
    const x = u.px + (u.x - u.px) * a;
    const y = u.py + (u.y - u.py) * a;
    if (!onScreen(x, y)) continue;
    around(x, y, ts, () => drawAirShadow(ctx, u, x, y, seatPaint(sim, u.team)));
  }
  const paintUnit = (u: Unit) => {
    const x = u.px + (u.x - u.px) * a;
    const y = u.py + (u.y - u.py) * a;
    if (!onScreen(x, y)) return;
    const o = airPictureOffset(u);
    const px = x + o.x;
    const py = y + o.y;
    around(px, py, ts, () => {
      const tx = u.x | 0;
      const ty = u.y | 0;
      const leaf =
        u.armor === "infantry" &&
        u.team === VIEWER &&
        tx >= 0 &&
        ty >= 0 &&
        tx < GW &&
        ty < GH &&
        sim.terrain[ty * GW + tx] === TILE_SCRUB;
      drawUnit(ctx, u, px, py, seatPaint(sim, u.team), ui.selected.includes(u.id), sim.time, aimOf(sim, u), leaf, cam.zoom, zoomLimits(view, sim.gw, sim.gh).min);
      if (u.hit > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.7, u.hit * 2.2);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(px, py, u.radius + 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (u.kind === "engineer" && u.order.t === "capture" && u.capture > 0) {
        paintCaptureRing(ctx, px, py, Math.min(1, u.capture / 3));
      }
      if (u.blocked > 0) {
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.55 * Math.min(1, u.blocked);
        ctx.strokeStyle = "#e23b2f";
        ctx.lineWidth = 0.09;
        const s = 0.32;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
        ctx.restore();
      }
    });
  };
  for (const u of sim.units) {
    if (u.loco === "air" || !sim.visibleUnit(VIEWER, u)) continue;
    const gy = u.py + (u.y - u.py) * a;
    depth.push({ y: gy, draw: () => paintUnit(u) });
  }
  depth.sort((p, q) => p.y - q.y);
  for (const stamp of depth) stamp.draw();

  for (const u of sim.units) {
    if (u.loco !== "air" || !sim.visibleUnit(VIEWER, u)) continue;
    paintUnit(u);
  }

  for (const s of sim.shots) {
    const x = s.px + (s.x - s.px) * a;
    const baseY = s.py + (s.y - s.py) * a;
    const span = Math.max(0.05, s.age + s.ttl);
    const t = Math.max(0, Math.min(1, s.age / span));
    const lift = (s.arc || 0) * Math.sin(t * Math.PI) * (s.arc > 0.6 ? 2.6 : 1.15);
    const y = baseY - lift;
    const v = Math.hypot(s.vx, s.vy) || 1;
    const len = s.kind === "rocket" ? 0.9 : s.arc > 0.6 ? 0.28 : s.kind === "shell" ? 0.58 : 0.36;
    if (s.kind === "rocket") {
      ctx.strokeStyle = "rgba(255, 120, 30, 0.9)";
      ctx.lineWidth = 0.46;
      ctx.beginPath();
      ctx.moveTo(x - (s.vx / v) * len * 1.4, y - (s.vy / v) * len * 1.4);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (s.arc > 0.6) {
      ctx.fillStyle = "rgba(255, 244, 210, 0.35)";
      ctx.beginPath();
      ctx.arc(x, baseY, 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = s.kind === "rocket" ? "#ffb25a" : s.arc > 0.6 ? "#ffe08a" : "#fff6d0";
    ctx.lineWidth = s.kind === "rocket" ? 0.16 : s.arc > 0.6 ? 0.14 : 0.1;
    ctx.beginPath();
    ctx.moveTo(x - (s.vx / v) * len, y - (s.vy / v) * len * 0.4);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = s.kind === "rocket" ? "#ffe7b0" : "#fffdf2";
    ctx.beginPath();
    ctx.arc(x, y, s.kind === "rocket" ? 0.24 : s.arc > 0.6 ? 0.2 : 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  const fogNow = sim.fog[VIEWER];
  for (const g of sim.ghosts) {
    if (g.viewer !== VIEWER || g.ttl <= 0) continue;
    const live = sim.unitById(g.id);
    if (live && live.hp > 0 && sim.visibleUnit(VIEWER, live)) continue;
    const tx = g.x | 0;
    const ty = g.y | 0;
    if (tx < 0 || ty < 0 || tx >= sim.gw || ty >= sim.gh) continue;
    if ((fogNow?.[ty * sim.gw + tx] ?? 0) === 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(0.7, g.ttl / 6);
    ctx.strokeStyle = seatPaint(sim, g.team);
    ctx.lineWidth = 0.05;
    ctx.setLineDash([0.08, 0.06]);
    ctx.strokeRect(g.x - 0.28, g.y - 0.28, 0.56, 0.56);
    ctx.setLineDash([]);
    ctx.restore();
  }

  const marked = new Set<number>();
  for (const u of sim.units) {
    if (u.hp <= 0 || u.team !== VIEWER || u.order.t !== "attack") continue;
    const b = sim.buildingById(u.order.id);
    if (!b || b.hp <= 0 || marked.has(b.id)) continue;
    marked.add(b.id);
    const pulse = 0.55 + 0.45 * Math.sin(sim.time * 6);
    ctx.save();
    ctx.strokeStyle = "#ff3b30";
    ctx.globalAlpha = 0.75 + 0.25 * pulse;
    ctx.lineWidth = 0.1;
    ctx.strokeRect(b.tx - 0.12, b.ty - 0.12, b.w + 0.24, b.h + 0.24);
    ctx.beginPath();
    ctx.arc(b.tx + b.w / 2, b.ty + b.h / 2, Math.max(b.w, b.h) * 0.55 + 0.15 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#ffe0d6";
    ctx.lineWidth = 0.05;
    const cx = b.tx + b.w / 2;
    const cy = b.ty + b.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 0.28, cy);
    ctx.lineTo(cx + 0.28, cy);
    ctx.moveTo(cx, cy - 0.28);
    ctx.lineTo(cx, cy + 0.28);
    ctx.stroke();
    ctx.restore();
  }

  for (const p of sim.pings) {
    const k = Math.max(0, Math.min(1, p.life / 1.2));
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * k;
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = p.kind === "attack" ? "#ff4d3a" : p.kind === "amove" ? "#ffb25a" : "#7dff9a";
    ctx.fillStyle = p.kind === "attack" ? "rgba(255, 70, 48, 0.28)" : p.kind === "amove" ? "rgba(255, 160, 60, 0.22)" : "rgba(90, 220, 120, 0.22)";
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(0, 0, 0.42 + (1 - k) * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (p.kind === "attack") {
      ctx.beginPath();
      ctx.arc(0, 0, 0.28, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "amove") {
      ctx.beginPath();
      ctx.moveTo(-0.18, 0);
      ctx.lineTo(0.18, 0);
      ctx.moveTo(0, -0.18);
      ctx.lineTo(0, 0.18);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -0.28);
      ctx.lineTo(0.16, 0.12);
      ctx.lineTo(-0.16, 0.12);
      ctx.closePath();
      ctx.fillStyle = "#d8ffe6";
      ctx.fill();
    }
    ctx.restore();
  }

  for (const p of sim.pings) {
    if (p.kind !== "amove" || p.fx === undefined || p.fy === undefined) continue;
    const k = Math.max(0, Math.min(1, p.life / 1.8));
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.55 * k;
    ctx.strokeStyle = "#ffb25a";
    ctx.lineWidth = 0.05;
    ctx.setLineDash([0.18, 0.14]);
    ctx.beginPath();
    ctx.moveTo(p.fx, p.fy);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  for (const m of sim.marks) {
    const letter = m.mark === "defend" ? "D" : m.mark === "way" ? "W" : m.mark === "crystal" ? "C" : "A";
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, Math.min(1, m.life / 8));
    ctx.translate(m.x, m.y);
    ctx.strokeStyle = seatPaint(sim, m.seat);
    ctx.lineWidth = 0.06;
    ctx.strokeRect(-0.45, -0.45, 0.9, 0.9);
    ctx.fillStyle = "#f4e2b0";
    ctx.font = "0.55px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 0, 0.02);
    ctx.restore();
  }

  for (const f of sim.fx) {
    const k = 1 - f.ttl / f.max;
    if (f.kind === "beam") {
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === "boom") {
      const frames = art()?.boom;
      if (frames && frames.length >= 6) {
        const frame = Math.min(5, Math.floor(k * 6));
        const size = Math.max(0.9, f.r * 2.6);
        ctx.globalAlpha = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
        ctx.drawImage(frames[frame]!, f.x - size / 2, f.y - size / 2, size, size);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = k < 0.35 ? "#fff1c4" : "#e25822";
        ctx.beginPath();
        ctx.arc(f.x, f.y, Math.max(0.2, f.r * (0.35 + k * 0.9)), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd27a";
        ctx.beginPath();
        ctx.arc(f.x, f.y, Math.max(0.08, f.r * (0.18 + k * 0.25)), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.fillStyle = "rgba(28, 26, 24, 0.85)";
        ctx.beginPath();
        ctx.arc(f.x, f.y - f.r * 0.35, Math.max(0.15, f.r * (0.45 + k * 0.4)), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (f.kind === "debris") {
      const travel = 1 - f.ttl / f.max;
      ctx.globalAlpha = 1 - travel;
      ctx.fillStyle = f.color;
      ctx.fillRect(f.x + f.x2 * travel - 0.06, f.y + f.y2 * travel - 0.04, 0.12, 0.08);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = k < 0.4 ? "#fff1c4" : "#e07a3a";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.4 + k), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  stepParticles(0.016);
  drawParticles(ctx, sim.time);
  if (typeof localStorage !== "undefined" && localStorage.getItem("viridite-dmg-numbers") === "1") {
    for (const b of sim.buildings) {
      if (b.hit <= 0 || b.hp <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.hit * 2);
      ctx.fillStyle = "#fff";
      ctx.font = "0.4px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("-", b.tx + b.w / 2, b.ty - 0.3);
      ctx.restore();
    }
  }

  if (ui.buildingId) {
    const b = sim.buildingById(ui.buildingId);
    if (b && b.hp > 0 && b.kind !== "span") {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.ellipse(b.tx + b.w / 2, b.ty + b.h / 2, Math.max(0.55, b.w * 0.68), Math.max(0.4, b.h * 0.62), 0, 0, Math.PI * 2);
      ctx.stroke();
      if (!isFence(b.kind)) drawDoorArrow(ctx, sim, b);
      ctx.restore();
    }
    if (b && !sim.allied(VIEWER, b.team) && !b.neutral && ui.selected.length) {
      ctx.save();
      ctx.strokeStyle = "#e5483b";
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.ellipse(b.tx + b.w / 2, b.ty + b.h / 2, b.w * 0.55, b.h * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ffd0c8";
      ctx.lineWidth = 0.04;
      const cx = b.tx + b.w / 2;
      const cy = b.ty + b.h * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - 0.25, cy); ctx.lineTo(cx + 0.25, cy);
      ctx.moveTo(cx, cy - 0.25); ctx.lineTo(cx, cy + 0.25);
      ctx.stroke();
      ctx.restore();
    }
    if (b && (b.kind === "barracks" || b.kind === "factory" || b.kind === "dock" || b.kind === "helipad")) {
      ctx.strokeStyle = seatPaint(sim, b.team);
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(b.tx + b.w / 2, b.ty + b.h / 2);
      ctx.lineTo(b.rallyX, b.rallyY);
      ctx.stroke();
    }
  }

  for (const id of ui.selected) {
    const u = sim.unitById(id);
    if (!u) continue;
    const x = u.px + (u.x - u.px) * a;
    const y = u.py + (u.y - u.py) * a;
    const o = airPictureOffset(u);
    if (u.path.length || u.order.t === "move" || u.order.t === "rearm") {
      ctx.strokeStyle = "rgba(243,234,215,0.45)";
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(x + o.x, y + o.y);
      for (const p of u.path) ctx.lineTo(p.x + 0.5, p.y + 0.5);
      if (u.order.t === "move") ctx.lineTo(u.order.x, u.order.y);
      if (u.order.t === "rearm") {
        const pad = sim.buildings.find((b) => b.id === u.home && b.hp > 0) ?? sim.buildings.find((b) => b.team === u.team && b.kind === "helipad" && b.hp > 0);
        if (pad) ctx.lineTo(pad.tx + pad.w / 2, pad.ty + pad.h / 2);
      }
      ctx.stroke();
    }
    if (u.order.t === "deploy") {
      ctx.strokeStyle = "#c6a56a";
      ctx.lineWidth = 0.08;
      const tx = Math.floor(u.x) - 1;
      const ty = Math.floor(u.y) - 1;
      ctx.strokeRect(tx + 0.05, ty + 0.05, 2.9, 2.9);
    }
  }

  if (ui.placing && ui.hover) {
    const span = 5;
    const spot = ui.ghost ?? ui.hover;
    drawPlaceGrid(
      ctx,
      Math.max(x0, spot.tx - span),
      Math.max(y0, spot.ty - span),
      Math.min(x1, spot.tx + footprintSize(ui.placing).w + span),
      Math.min(y1, spot.ty + footprintSize(ui.placing).h + span),
    );
  }
  if (ui.placing) drawBuildHalo(ctx, sim);

  if (ui.wallRun && ui.wallRun.length) {
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = "#f3ead7";
    ctx.beginPath();
    for (let i = 0; i < ui.wallRun.length; i++) {
      const t = ui.wallRun[i];
      if (i === 0) ctx.moveTo(t.tx + 0.5, t.ty + 0.5);
      else ctx.lineTo(t.tx + 0.5, t.ty + 0.5);
    }
    ctx.stroke();
    for (const t of ui.wallRun) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = t.ok ? "#3dcc6e" : "#d25a48";
      ctx.fillRect(t.tx + 0.05, t.ty + 0.05, 0.9, 0.9);
      if (!t.ok && ui.placing === "gate") {
        /* gate ghosts orient once they stick to a finished wall */
      }
    }
    ctx.globalAlpha = 1;
    if (ui.placing === "gate") {
      for (const t of ui.wallRun) {
        if (!t.ok) continue;
        drawGateBar(ctx, t.tx, t.ty, gateVertical(sim, t.tx, t.ty), true);
      }
    }
  } else if (ui.placing && ui.hover) {
    const drop = ui.hover;
    const origin = ui.ghost ?? ui.hover;
    const bdef = sim.canPlace(VIEWER, ui.placing, drop.tx, drop.ty);
    const w = footprintSize(ui.placing).w;
    const h = footprintSize(ui.placing).h;
    const lifted = origin.tx !== drop.tx || origin.ty !== drop.ty;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = bdef.ok ? "#3dcc6e" : "#d25a48";
    ctx.fillRect(origin.tx, origin.ty, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = bdef.ok ? "#d8ffe6" : "#ffd0c8";
    ctx.lineWidth = 0.12;
    ctx.strokeRect(origin.tx + 0.03, origin.ty + 0.03, w - 0.06, h - 0.06);
    if (lifted) {
      ctx.strokeStyle = "#f4f0e6";
      ctx.lineWidth = 0.08;
      ctx.strokeRect(drop.tx + 0.18, drop.ty + 0.18, Math.max(0.2, w - 0.36), Math.max(0.2, h - 0.36));
      const mx = drop.tx + w / 2;
      const my = drop.ty + h / 2;
      ctx.beginPath();
      ctx.moveTo(mx - 0.28, my);
      ctx.lineTo(mx + 0.28, my);
      ctx.moveTo(mx, my - 0.28);
      ctx.lineTo(mx, my + 0.28);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!isFence(ui.placing)) {
      drawDoorArrow(ctx, sim, {
        kind: ui.placing,
        team: VIEWER,
        tx: origin.tx,
        ty: origin.ty,
        w,
        h,
      } as Building);
    }
    if (ui.placing === "gate") drawGateBar(ctx, origin.tx, origin.ty, gateVertical(sim, origin.tx, origin.ty), bdef.ok);
  }

  ctx.restore();

  paintScreenFog(ctx, sim.fog[VIEWER], cam, view, GW, GH);

  drawJobsScreen(ctx, sim, cam, view);
  drawPlaceLabel(ctx, sim, cam, view, ui);

  // Screen-space chrome: health, box, minimap.
  for (const u of sim.units) {
    if (!sim.visibleUnit(VIEWER, u)) continue;
    const x = u.px + (u.x - u.px) * a;
    const y = u.py + (u.y - u.py) * a;
    const o = airPictureOffset(u);
    const selected = ui.selected.includes(u.id);
    const damaged = u.maxHp > 0 && u.hp < u.maxHp - 0.5;
    const cargo = selected && u.kind === "harvester" && u.cargoMax > 0;
    if (!damaged && !cargo) continue;
    const s = worldToScreen(cam, x + o.x, y + o.y, view);
    if (damaged) {
      const pct = u.hp / u.maxHp;
      bar(ctx, s.x, s.y - 18, pct, "troop", hpInk(pct), selected ? `${Math.ceil(pct * 100)}%` : undefined);
    }
    if (cargo) bar(ctx, s.x, s.y - (damaged ? 4 : 18), u.cargo / u.cargoMax, "troop", "#3dcc6e");
  }
  for (const b of sim.buildings) {
    if (b.hp <= 0 || b.maxHp <= 0 || isFence(b.kind) || b.kind === "span" || b.rubble > 0) continue;
    if (!sim.buildingVisible(VIEWER, b) && b.team !== VIEWER) continue;
    const picked = ui.buildingId === b.id;
    const damaged = b.maxHp > 0 && b.hp < b.maxHp - 0.5;
    if (!damaged && !picked) continue;
    const s = worldToScreen(cam, b.tx + b.w / 2, structureTop(b), view);
    if (damaged || picked) {
      const pct = b.hp / b.maxHp;
      const tag = b.mending ? `Repair ${Math.ceil(b.hp)}/${Math.ceil(b.maxHp)}` : `${Math.ceil(b.hp)}/${Math.ceil(b.maxHp)}`;
      bar(ctx, s.x, s.y - 16, pct, "hall", hpInk(pct), tag);
    }
    if (picked) {
      ctx.fillStyle = "#e7f6ea";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(b.name, s.x, s.y - 10);
    }
  }

  paintSeatBadges(ctx, sim, cam, view, a, ui);

  const aimed = new Set<number>();
  for (const u of sim.units) {
    if (u.hp <= 0 || u.team !== VIEWER || u.order.t !== "attack") continue;
    const b = sim.buildingById(u.order.id);
    if (!b || b.hp <= 0 || b.rubble > 0 || aimed.has(b.id)) continue;
    if (!sim.buildingVisible(VIEWER, b) && b.team !== VIEWER) continue;
    aimed.add(b.id);
    const s = worldToScreen(cam, b.tx + b.w / 2, b.ty + b.h / 2, view);
    const edge = worldToScreen(cam, b.tx + b.w, b.ty + b.h / 2, view);
    const pulse = 0.65 + 0.35 * Math.sin(sim.time * 6);
    const radius = Math.max(28, Math.hypot(edge.x - s.x, edge.y - s.y) + 10) + 4 * pulse;
    ctx.save();
    ctx.strokeStyle = "#ff3b30";
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#ffe0d6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x - 14, s.y);
    ctx.lineTo(s.x + 14, s.y);
    ctx.moveTo(s.x, s.y - 14);
    ctx.lineTo(s.x, s.y + 14);
    ctx.stroke();
    ctx.restore();
  }

  if (ui.box) {
    const x = Math.min(ui.box.x0, ui.box.x1);
    const y = Math.min(ui.box.y0, ui.box.y1);
    const w = Math.abs(ui.box.x1 - ui.box.x0);
    const h = Math.abs(ui.box.y1 - ui.box.y0);
    ctx.strokeStyle = "#7dff9a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(80, 220, 120, 0.14)";
    ctx.fillRect(x, y, w, h);
  }

  drawMinimap(ctx, sim, cam, view, ground, relief);
}

function drawPlaceGrid(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(232, 220, 180, 0.28)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 1; x++) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1 + 1);
  }
  for (let y = y0; y <= y1 + 1; y++) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1 + 1, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function placeChrome(
  _cam: Camera,
  view: View,
  _tx: number,
  _ty: number,
  _w: number,
): { confirm: { x: number; y: number; w: number; h: number }; cancel: { x: number; y: number; w: number; h: number } } {
  const bw = 96;
  const bh = 44;
  const padW = 52;
  const x = Math.max(4, Math.round(view.w - bw - padW - 8));
  const y = Math.max(4, Math.round(view.h - (bh * 2 + 6) - 8));
  return {
    confirm: { x, y, w: bw, h: bh },
    cancel: { x, y: y + bh + 6, w: bw, h: bh },
  };
}

function paintPlaceChrome(
  ctx: CanvasRenderingContext2D,
  box: { confirm: { x: number; y: number; w: number; h: number }; cancel: { x: number; y: number; w: number; h: number } },
) {
  const paint = (r: { x: number; y: number; w: number; h: number }, label: string, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "#f3ead7";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = "#14110e";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  };
  paint(box.confirm, "Confirm", "#7dce6a");
  paint(box.cancel, "Cancel", "#e7b2a8");
}

/** Cells a finished structure can build from. Same Chebyshev gap as placement. */
function drawBuildHalo(ctx: CanvasRenderingContext2D, sim: Sim) {
  ctx.save();
  ctx.fillStyle = "rgba(120, 210, 150, 0.12)";
  ctx.strokeStyle = "rgba(210, 255, 220, 0.28)";
  ctx.lineWidth = 0.05;
  for (const b of sim.buildings) {
    if (b.team !== VIEWER || b.neutral || !b.complete || b.hp <= 0 || b.rubble > 0 || isFence(b.kind)) continue;
    const cx = b.tx + b.w / 2;
    const cy = b.ty + b.h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, b.w / 2 + BUILD_GAP + 0.2, b.h / 2 + BUILD_GAP + 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawDoorArrow(ctx: CanvasRenderingContext2D, sim: Sim, b: Building) {
  const door = sim.doorOf(b);
  const cx = b.tx + b.w / 2;
  const cy = b.ty + b.h / 2;
  const dx = door.x - cx;
  const dy = door.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  ctx.strokeStyle = "#f4f1e4";
  ctx.fillStyle = "#f4f1e4";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(door.x, door.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(door.x + ux * 0.38, door.y + uy * 0.38);
  ctx.lineTo(door.x - ux * 0.02 + px * 0.2, door.y - uy * 0.02 + py * 0.2);
  ctx.lineTo(door.x - ux * 0.02 - px * 0.2, door.y - uy * 0.02 - py * 0.2);
  ctx.closePath();
  ctx.fill();
}

function paintPlaceCard(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], bad: boolean) {
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = Math.max(96, ...lines.map((line) => ctx.measureText(line).width)) + 16;
  const height = lines.length * 16 + 8;
  ctx.fillStyle = "rgba(12,10,8,0.9)";
  ctx.fillRect(x - width / 2, y - height - 6, width, height);
  lines.forEach((line, i) => {
    ctx.fillStyle = bad ? "#ffb0a4" : i === 0 ? "#f3ead7" : "#8fd0ff";
    ctx.fillText(line, x, y - height + 8 + i * 16);
  });
}

function drawPlaceLabel(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cam: Camera,
  view: View,
  ui: DrawUi,
) {
  if (!ui.placing) return;
  let tx = 0;
  let ty = 0;
  let text = "";
  let bad = false;
  if (ui.wallRun && ui.wallRun.length) {
    const fail = ui.wallRun.find((t) => !t.ok);
    const last = ui.wallRun[ui.wallRun.length - 1];
    const spot = fail ?? last;
    if (!spot) return;
    tx = spot.tx;
    ty = spot.ty;
    const ok = ui.wallRun.filter((t) => t.ok).length;
    text = fail ? shortPlaceReason(fail.reason || "Blocked") : ok > 1 ? `${ok} tiles` : "Place";
    bad = !!fail;
  } else if (ui.hover) {
    const drop = ui.hover;
    const visual = ui.ghost ?? ui.hover;
    const check = sim.canPlace(VIEWER, ui.placing, drop.tx, drop.ty);
    const def = resolveBuilding(ui.placing, sim.factionOf(VIEWER));
    tx = visual.tx;
    ty = visual.ty;
    const power = def.powerUse > 0 ? `Power −${def.powerUse}` : def.powerOut > 0 ? `Power +${def.powerOut}` : "No power draw";
    text = check.ok ? `${def.cost} credits` : ghostPlaceReason(check.reason);
    bad = !check.ok;
    const s = worldToScreen(cam, tx + def.w / 2, ty, view);
    const lines = check.ok ? [text, power] : [text];
    paintPlaceCard(ctx, s.x, s.y, lines, bad);
    if (ui.touchPlace) paintPlaceChrome(ctx, placeChrome(cam, view, visual.tx, visual.ty, def.w));
    return;
  } else return;
  const s = worldToScreen(cam, tx + 0.5, ty, view);
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const width = Math.max(72, ctx.measureText(text).width + 16);
  ctx.fillStyle = "rgba(12,10,8,0.88)";
  ctx.fillRect(s.x - width / 2, s.y - 24, width, 20);
  ctx.fillStyle = bad ? "#ffb0a4" : "#d8ffe6";
  ctx.fillText(text, s.x, s.y - 8);
}

function gateVertical(sim: Sim, tx: number, ty: number): boolean {
  const fence = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= sim.gw || y >= sim.gh) return false;
    const id = sim.occ[y * sim.gw + x];
    if (!id) return false;
    const b = sim.buildingById(id);
    return !!b && b.hp > 0 && b.rubble <= 0 && (b.kind === "wall" || b.kind === "sandbag" || b.kind === "gate");
  };
  let vertical = 0;
  let horizontal = 0;
  if (fence(tx, ty - 1)) vertical++;
  if (fence(tx, ty + 1)) vertical++;
  if (fence(tx - 1, ty)) horizontal++;
  if (fence(tx + 1, ty)) horizontal++;
  if (vertical !== horizontal) return vertical > horizontal;
  return fence(tx, ty - 2) || fence(tx, ty + 2);
}

function drawGateBar(ctx: CanvasRenderingContext2D, tx: number, ty: number, vertical: boolean, ok: boolean) {
  ctx.save();
  ctx.translate(tx + 0.5, ty + 0.5);
  if (vertical) ctx.rotate(Math.PI / 2);
  ctx.fillStyle = ok ? "#d8ffe6" : "#ffb0a4";
  ctx.fillRect(-0.34, -0.08, 0.68, 0.16);
  ctx.restore();
}
function drawJobsScreen(ctx: CanvasRenderingContext2D, sim: Sim, cam: Camera, view: View) {
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const b of sim.buildings) {
    if (b.hp <= 0 || b.rubble > 0 || !sim.buildingVisible(VIEWER, b)) continue;
    const mine = sim.allied(b.team, VIEWER);
    const low = sim.powerOf(b.team).low && b.kind !== "power" && b.kind !== "advpower";
    const rate = low ? 0.5 : 1;
    let p = -1;
    let label = "";
    if (!b.complete) {
      p = 1 - b.buildLeft / Math.max(0.01, b.buildTotal);
      label = `${Math.ceil(Math.max(0, b.buildLeft) / rate)}s`;
    } else if (mine && b.queue.length) {
      const spec = resolveUnit(b.queue[0], sim.factionOf(b.team));
      p = Math.max(0, Math.min(1, b.prod / Math.max(0.01, spec.time)));
      const left = Math.max(0, (spec.time - b.prod) / rate);
      label = `${spec.short} ${Math.ceil(left)}s`;
      if (b.queue.length > 1) label += ` +${b.queue.length - 1}`;
      if (low) label += " ½";
    }
    if (p < 0) continue;
    const anchor = worldToScreen(cam, b.tx + b.w / 2, structureTop(b), view);
    const w = Math.max(56, Math.min(128, b.w * cam.zoom));
    const x = anchor.x - w / 2;
    const y = anchor.y - 18;
    ctx.fillStyle = "#f3ead7";
    ctx.fillText(label, anchor.x, y - 1);
    ctx.fillStyle = "rgba(12,10,8,0.9)";
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = low ? "#e15b48" : "#d7b56a";
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, p)), 8);
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function footprintSize(kind: BuildingId): { w: number; h: number } {
  const d = BUILDINGS[kind];
  return { w: d.w, h: d.h };
}

function miniTone(t: number, crystal: number, fog: number): string {
  const [r, g, b] = miniRgb(t, crystal, fog);
  return `rgb(${r},${g},${b})`;
}

function miniRgb(t: number, crystal: number, fog: number, x = 0, y = 0): [number, number, number] {
  const seen = fog === 2;
  if (t === TILE_DEEP || t === TILE_WRECK) return [32, 112, 156];
  if (t === TILE_SHALLOW || t === TILE_FORD) return [64, 176, 196];
  if (t === TILE_BRIDGE || t === TILE_ROAD) return [196, 154, 96];
  if (t === TILE_SHORE) return seen ? [230, 201, 138] : [186, 164, 120];
  if (t === TILE_ROCK || t === TILE_CLIFF) return [120, 108, 96];
  if (t === TILE_RAMP) return [168, 136, 88];
  if (t === TILE_HIGH) return THEATER === "snow" ? [214, 224, 232] : [150, 132, 96];
  if (crystal > 0) return [61, 204, 110];
  if (t === TILE_SCRUB || t === TILE_STUMP) return seen ? [22, 82, 34] : [12, 40, 18];
  if (t === TILE_ROUGH || t === TILE_VALLEY) return seen ? [62, 92, 48] : [28, 46, 24];
  if (THEATER === "snow") return [228, 236, 244];
  if (THEATER === "temperate") {
    if (t === TILE_SCRUB || groveAt(x, y)) return seen ? [22, 82, 34] : [12, 40, 18];
    if (t === TILE_VALLEY) return seen ? [48, 78, 40] : [24, 40, 20];
    return seen ? [104, 142, 68] : [48, 66, 32];
  }
  const dune = hash((x / 6) | 0, (y / 3) | 0);
  if (dune > 0.72) return seen ? [236, 214, 164] : [118, 104, 76];
  if (dune < 0.28) return seen ? [176, 132, 78] : [88, 66, 40];
  return seen ? [228, 196, 140] : [110, 92, 68];
}

function flowAngle(x: number, y: number): number {
  return hash((x / 6) | 0, (y / 6) | 0) * Math.PI * 2;
}

function paintCurrent(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, deep: boolean) {
  const ang = flowAngle(x, y);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const speed = deep ? 0.22 : 0.46;
  const n = deep ? 3 : 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = deep ? "rgba(210,240,250,0.55)" : "rgba(255,255,255,0.78)";
  ctx.lineWidth = deep ? 0.1 : 0.12;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const phase = ((time * speed + hash(x + i, y) + i * 0.33) % 1) - 0.5;
    const across = (i + 0.5) / n - 0.5;
    const ox = x + 0.5 + ca * phase * 0.85 - sa * across * 0.72;
    const oy = y + 0.5 + sa * phase * 0.85 + ca * across * 0.72;
    const len = deep ? 0.55 : 0.42;
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + ca * len, oy + sa * len);
  }
  ctx.stroke();
  if (!deep) {
    const glint = (Math.sin(time * 2.4 + hash(x, y) * 6) + 1) * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${0.28 + glint * 0.35})`;
    ctx.fillRect(x + 0.12 + glint * 0.25, y + 0.38, 0.34, 0.1);
  } else {
    ctx.strokeStyle = "rgba(120,190,220,0.35)";
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    const phase = ((time * speed * 0.6 + hash(y, x)) % 1) - 0.5;
    ctx.moveTo(x + 0.5 + ca * phase * 0.4, y + 0.5 + sa * phase * 0.4);
    ctx.lineTo(x + 0.5 + ca * (phase * 0.4 + 0.7), y + 0.5 + sa * (phase * 0.4 + 0.7));
    ctx.stroke();
  }
}

function paintDunes(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const band = hash((x / 5) | 0, (y / 3) | 0);
  if (band < 0.34) return;
  const crest = hash(x, y);
  const bow = 0.28 + crest * 0.22;
  ctx.fillStyle = `rgba(120,78,40,${0.28 + crest * 0.16})`;
  ctx.beginPath();
  ctx.ellipse(x + 0.5, y + bow + 0.12, 0.48, 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(74,48,24,${0.45 + crest * 0.2})`;
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(x + 0.02, y + bow + 0.1);
  ctx.quadraticCurveTo(x + 0.5, y + bow - 0.16, x + 0.98, y + bow + 0.08);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,236,200,${0.55 + (1 - crest) * 0.3})`;
  ctx.lineWidth = 0.055;
  ctx.beginPath();
  ctx.moveTo(x + 0.06, y + bow + 0.02);
  ctx.quadraticCurveTo(x + 0.48, y + bow - 0.2, x + 0.94, y + bow);
  ctx.stroke();
}

function paintCanopy(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const h = hash(x, y);
  ctx.fillStyle = "rgba(10,36,16,0.72)";
  ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.ellipse(x + 0.62, y + 0.8, 0.3, 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  const n = 4 + ((h * 2) | 0);
  for (let i = 0; i < n; i++) {
    const hx = hash(x + i * 3, y + 9);
    const hy = hash(x + 5, y + i * 4);
    ctx.fillStyle = i % 2 === 0 ? "rgba(8,42,18,0.92)" : "rgba(22,72,28,0.88)";
    ctx.beginPath();
    ctx.arc(x + 0.12 + hx * 0.76, y + 0.14 + hy * 0.7, 0.34 + hx * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(168,204,96,0.55)";
  ctx.beginPath();
  ctx.arc(x + 0.28 + h * 0.34, y + 0.26 + (1 - h) * 0.16, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(8,28,12,0.55)";
  ctx.beginPath();
  ctx.arc(x + 0.7 - h * 0.2, y + 0.72, 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function dressTile(ctx: CanvasRenderingContext2D, terrain: Uint8Array, x: number, y: number, time: number) {
  const t = terrain[y * GW + x];
  if (t === TILE_DEEP) {
    paintCurrent(ctx, x, y, time, true);
    return;
  }
  if (t === TILE_SHALLOW || t === TILE_FORD) {
    paintCurrent(ctx, x, y, time, false);
    return;
  }
  if (t === TILE_SHORE) {
    const foam = (Math.sin(time * 2.2 + hash(x, y) * 6) + 1) * 0.5;
    const alpha = 0.35 + foam * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    const wet = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return false;
      const n = terrain[ny * GW + nx];
      return n === TILE_DEEP || n === TILE_SHALLOW;
    };
    if (wet(x, y - 1)) ctx.fillRect(x, y, 1, 0.2);
    if (wet(x, y + 1)) ctx.fillRect(x, y + 0.8, 1, 0.2);
    if (wet(x - 1, y)) ctx.fillRect(x, y, 0.2, 1);
    if (wet(x + 1, y)) ctx.fillRect(x + 0.8, y, 0.2, 1);
    ctx.fillStyle = `rgba(255,255,255,${0.45 + foam * 0.4})`;
    ctx.fillRect(x + 0.15 + foam * 0.1, y + 0.35, 0.12, 0.08);
    ctx.fillRect(x + 0.55, y + 0.62 - foam * 0.08, 0.16, 0.07);
    return;
  }
  if (t === TILE_BRIDGE) {
    ctx.strokeStyle = "rgba(40,28,18,0.55)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(x + 0.33, y + 0.08);
    ctx.lineTo(x + 0.33, y + 0.92);
    ctx.moveTo(x + 0.66, y + 0.08);
    ctx.lineTo(x + 0.66, y + 0.92);
    ctx.stroke();
    return;
  }
  if (THEATER === "desert" && (t === TILE_SAND || t === TILE_SPENT)) {
    paintDunes(ctx, x, y);
    return;
  }
  if (
    THEATER === "temperate" &&
    t !== TILE_ROAD &&
    t !== TILE_ROCK &&
    t !== TILE_CLIFF &&
    t !== TILE_CRYSTAL &&
    (t === TILE_SCRUB || groveAt(x, y))
  ) {
    paintCanopy(ctx, x, y);
  }
}

function neighborTile(terrain: Uint8Array, x: number, y: number, gw: number, gh: number): number {
  if (x < 0 || y < 0 || x >= gw || y >= gh) return -1;
  return terrain[y * gw + x] ?? -1;
}

/** Lit from the north-west. Raised ground gets a top edge and a south face. The grid does not move. */
export function paintRelief(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  x: number,
  y: number,
  gw: number,
  gh: number,
) {
  const t = neighborTile(terrain, x, y, gw, gh);
  if (t === TILE_ROCK || t === TILE_CLIFF) {
    const south = neighborTile(terrain, x, y + 1, gw, gh);
    const drop = south !== TILE_ROCK && south !== TILE_CLIFF;
    ctx.fillStyle = "rgba(255,244,220,0.34)";
    ctx.fillRect(x, y, 1, 0.16);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(x + 0.84, y, 0.18, drop ? 0.72 : 1);
    if (!drop) return;
    const face = t === TILE_CLIFF ? 0.42 : 0.28;
    ctx.fillStyle = t === TILE_CLIFF ? "rgba(28,20,14,0.82)" : "rgba(18,14,10,0.68)";
    ctx.fillRect(x, y + 1 - face, 1, face);
    ctx.fillStyle = "rgba(255,236,210,0.32)";
    ctx.fillRect(x, y + 1 - face, 1, 0.05);
    return;
  }
  if (t === TILE_VALLEY) {
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(x, y, 1, 0.2);
    ctx.fillStyle = "rgba(214,232,176,0.16)";
    ctx.fillRect(x, y + 0.78, 1, 0.22);
    return;
  }
  if (t === TILE_DEEP) {
    ctx.fillStyle = "rgba(0,8,18,0.38)";
    ctx.fillRect(x, y + 0.52, 1, 0.48);
    ctx.fillStyle = "rgba(170,214,232,0.16)";
    ctx.fillRect(x, y, 1, 0.1);
    const north = neighborTile(terrain, x, y - 1, gw, gh);
    if (north !== TILE_DEEP && north !== TILE_WRECK) {
      ctx.fillStyle = "rgba(220,240,250,0.22)";
      ctx.fillRect(x, y, 1, 0.08);
    }
    return;
  }
  if (t === TILE_SHALLOW || t === TILE_FORD) {
    ctx.fillStyle = "rgba(0,28,40,0.2)";
    ctx.fillRect(x, y + 0.7, 1, 0.3);
    const north = neighborTile(terrain, x, y - 1, gw, gh);
    if (north !== TILE_SHALLOW && north !== TILE_DEEP && north !== TILE_FORD) {
      ctx.fillStyle = "rgba(240,248,255,0.28)";
      ctx.fillRect(x, y, 1, 0.06);
    }
    return;
  }
  if (t === TILE_SHORE) {
    ctx.fillStyle = "rgba(70,44,18,0.2)";
    ctx.fillRect(x, y + 0.7, 1, 0.3);
  }
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "cash" | "squad" | "haul" | "mend", time: number) {
  const haul = kind === "haul";
  const bob = Math.sin(time * 3 + x) * 0.05;
  const w = haul ? 0.72 : 0.46;
  const h = haul ? 0.54 : 0.38;
  const pulse = 0.35 + 0.25 * Math.sin(time * 4 + y);
  ctx.fillStyle = `rgba(226, 194, 90, ${pulse})`;
  ctx.beginPath();
  ctx.arc(x, y - 0.15 + bob, haul ? 0.55 : 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 0.18, w * 0.55, 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = haul ? "#d07a1a" : kind === "cash" ? "#1e8a48" : kind === "mend" ? "#2f8f6a" : "#c6a56a";
  ctx.fillRect(x - w / 2, y - h + 0.08 + bob, w, h);
  ctx.strokeStyle = "#f4ecd4";
  ctx.lineWidth = 0.05;
  ctx.strokeRect(x - w / 2, y - h + 0.08 + bob, w, h);
  ctx.fillStyle = "#f6f1e4";
  ctx.font = `${haul ? 0.28 : 0.22}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const mark = kind === "cash" ? "$" : kind === "squad" ? "+" : kind === "mend" ? "+" : "!";
  ctx.fillText(mark, x, y - h * 0.45 + bob);
}

/** Health only. Teams never use these greens, yellows, or reds. */
function hpInk(pct: number): string {
  if (pct >= 0.6) return "#3dcc6e";
  if (pct >= 0.3) return "#e6b325";
  return "#e23b32";
}

const UNIT_BADGE_PX = 14;
const HALL_BADGE_PX = 21;

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, pct: number, size: "troop" | "hall" = "troop", fill?: string, label?: string) {
  const w = size === "hall" ? 44 : 28;
  const h = size === "hall" ? 6 : 5;
  const p = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = "rgba(8, 6, 4, 0.9)";
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill ?? hpInk(p);
  ctx.fillRect(x - w / 2, y, Math.max(2, w * p), h);
  if (!label) return;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#14110e";
  ctx.fillText(label, x + w / 2 + 5, y + h / 2 + 1);
  ctx.fillStyle = "#f6efd2";
  ctx.fillText(label, x + w / 2 + 4, y + h / 2);
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, photo: boolean) {
  if (photo) {
    ctx.fillStyle = "rgba(16,12,10,0.38)";
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = photo ? "rgba(28,22,18,0.9)" : "rgba(20,16,14,0.45)";
  ctx.beginPath();
  ctx.moveTo(x + 0.18, y + 0.72);
  ctx.lineTo(x + 0.32, y + 0.22);
  ctx.lineTo(x + 0.58, y + 0.18);
  ctx.lineTo(x + 0.82, y + 0.4);
  ctx.lineTo(x + 0.74, y + 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = photo ? "rgba(90,78,68,0.85)" : "rgba(70,62,54,0.55)";
  ctx.beginPath();
  ctx.moveTo(x + 0.34, y + 0.34);
  ctx.lineTo(x + 0.56, y + 0.26);
  ctx.lineTo(x + 0.62, y + 0.48);
  ctx.fill();
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number) {
  if (THEATER === "snow") {
    ctx.fillStyle = "#2d4a38";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + 0.16);
    ctx.lineTo(x + 0.78, y + 0.78);
    ctx.lineTo(x + 0.22, y + 0.78);
    ctx.fill();
    return;
  }
  if (THEATER === "temperate") {
    const blobs: [number, number, number, string][] = [
      [0.28, 0.62, 0.22, "#14381e"],
      [0.52, 0.46, 0.26, "#1f5a30"],
      [0.72, 0.66, 0.18, "#0e3018"],
      [0.4, 0.34, 0.16, "#3d8a40"],
      [0.58, 0.72, 0.14, "#246332"],
    ];
    for (const [bx, by, rad, color] of blobs) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + bx, y + by, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.fillStyle = "#4e6736";
  ctx.beginPath();
  ctx.arc(x + 0.35, y + 0.6, 0.16, 0, Math.PI * 2);
  ctx.arc(x + 0.55, y + 0.55, 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function wetNeighbor(terrain: Uint8Array, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return false;
  const t = terrain[ny * GW + nx];
  return t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD;
}

/** Satellite stays on the land. Water and ridges are painted on the same tiles the army uses. */
function blendMichigan(ctx: CanvasRenderingContext2D, sim: Sim, x: number, y: number) {
  const t = sim.terrain[y * sim.gw + x];
  if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD || t === TILE_WRECK) {
    ctx.fillStyle = t === TILE_SHALLOW ? "rgba(24, 92, 128, 0.72)" : "rgba(12, 58, 96, 0.8)";
    ctx.fillRect(x, y, 1.02, 1.02);
    const wave = (Math.sin(sim.time * 1.5 + x * 0.85 + y * 0.4) + 1) * 0.5;
    ctx.fillStyle = `rgba(186, 222, 226, ${0.06 + wave * 0.08})`;
    ctx.fillRect(x, y + 0.28 + wave * 0.12, 1, 0.1);
    if (t === TILE_FORD) {
      ctx.fillStyle = "rgba(214, 184, 122, 0.88)";
      ctx.fillRect(x + 0.12, y + 0.34, 0.76, 0.28);
      ctx.fillStyle = "rgba(244, 236, 214, 0.45)";
      ctx.fillRect(x + 0.2, y + 0.4, 0.6, 0.08);
    }
    if (t === TILE_WRECK) {
      ctx.fillStyle = "#4a3824";
      ctx.fillRect(x + 0.12, y + 0.35, 0.22, 0.08);
      ctx.fillRect(x + 0.55, y + 0.58, 0.28, 0.07);
    }
    ctx.fillStyle = "rgba(236, 242, 236, 0.55)";
    const bank = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= sim.gw || ny >= sim.gh) return false;
      const n = sim.terrain[ny * sim.gw + nx];
      return n !== TILE_DEEP && n !== TILE_SHALLOW && n !== TILE_FORD && n !== TILE_BRIDGE;
    };
    if (bank(x, y - 1)) ctx.fillRect(x, y, 1, 0.16);
    if (bank(x, y + 1)) ctx.fillRect(x, y + 0.84, 1, 0.16);
    if (bank(x - 1, y)) ctx.fillRect(x, y, 0.16, 1);
    if (bank(x + 1, y)) ctx.fillRect(x + 0.84, y, 0.16, 1);
    return;
  }
  if ((t === TILE_ROCK || t === TILE_CLIFF) && x > 0 && y > 0 && x < sim.gw - 1 && y < sim.gh - 1) {
    ctx.fillStyle = "rgba(28, 32, 26, 0.62)";
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = "rgba(92, 96, 88, 0.55)";
    ctx.beginPath();
    ctx.moveTo(x + 0.08, y + 0.78);
    ctx.lineTo(x + 0.38, y + 0.28);
    ctx.lineTo(x + 0.62, y + 0.7);
    ctx.fill();
    ctx.fillStyle = "rgba(214, 210, 198, 0.7)";
    ctx.beginPath();
    ctx.moveTo(x + 0.38, y + 0.28);
    ctx.lineTo(x + 0.5, y + 0.18);
    ctx.lineTo(x + 0.58, y + 0.42);
    ctx.fill();
    return;
  }
  if (t === TILE_SHORE) {
    ctx.fillStyle = "rgba(236, 228, 206, 0.28)";
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = "rgba(244, 248, 244, 0.7)";
    if (wetNeighbor(sim.terrain, x, y, 0, -1)) ctx.fillRect(x, y, 1, 0.2);
    if (wetNeighbor(sim.terrain, x, y, 0, 1)) ctx.fillRect(x, y + 0.8, 1, 0.2);
    if (wetNeighbor(sim.terrain, x, y, -1, 0)) ctx.fillRect(x, y, 0.2, 1);
    if (wetNeighbor(sim.terrain, x, y, 1, 0)) ctx.fillRect(x + 0.8, y, 0.2, 1);
  }
}

/** Ore, trees, shells, craters, and the shoreline. Boring tiles return immediately. */
function paintFieldProps(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  x: number,
  y: number,
  baked: boolean,
  spark: Set<number>,
  treeBudget: boolean,
  shellBudget: boolean,
): "tree" | "shell" | "" {
  const i = y * sim.gw + x;
  const t = sim.terrain[i] ?? 0;
  const mark = sim.craters[i] ?? 0;
  const ore = sim.crystal[i] ?? 0;
  const wet = t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD || t === TILE_WRECK;
  const tree = t === TILE_SCRUB || t === TILE_STUMP;
  const shell = isShell(t);
  const raised = t === TILE_CLIFF || t === TILE_ROCK || t === TILE_RAMP || t === TILE_HIGH;
  if (!wet && !tree && !shell && !raised && t !== TILE_ROAD && t !== TILE_BRIDGE && ore <= 0 && t !== TILE_SPENT && mark <= 0) return "";
  if (wet && !baked) {
    paintWaterSheen(ctx, t, x, y, sim.time);
    paintShoreLip(ctx, sim, x, y);
  }
  if (t === TILE_ROAD) return "";
  if (t === TILE_BRIDGE) return "";
  if (mark > 0 && !shell) paintCrater(ctx, x, y, mark);
  if (tree) {
    const lonely =
      !scrubAt(sim, x - 1, y) && !scrubAt(sim, x + 1, y) && !scrubAt(sim, x, y - 1) && !scrubAt(sim, x, y + 1);
    const rep = ((x ^ y) & 1) === 0;
    if (treeBudget && (lonely || rep)) {
      if (!paintGrove(ctx, x, y, t === TILE_STUMP)) paintTree(ctx, x, y, t === TILE_STUMP);
      if (raised) paintVolume(ctx, sim, x, y);
      return "tree";
    }
  }
  if (raised) paintVolume(ctx, sim, x, y);
  if (shell && shellBudget) {
    paintShell(ctx, t, x, y, mark);
    return "shell";
  }
  if (ore > 0 || t === TILE_SPENT) paintOre(ctx, x, y, ore, t === TILE_SPENT, sim.time, spark.has(i));
  return "";
}

function scrubAt(sim: Sim, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= sim.gw || y >= sim.gh) return false;
  return (sim.terrain[y * sim.gw + x] ?? 0) === TILE_SCRUB;
}

function paintFieldProp(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "wreck" | "fence" | "crate", time: number) {
  ctx.save();
  ctx.fillStyle = "rgba(12, 14, 10, 0.32)";
  ctx.beginPath();
  ctx.ellipse(x + 0.18, y + 0.22, kind === "fence" ? 0.55 : 0.32, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "wreck") {
    ctx.fillStyle = "#3a342c";
    ctx.beginPath();
    ctx.ellipse(x, y, 0.42, 0.2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5c5146";
    ctx.fillRect(x - 0.22, y - 0.16, 0.38, 0.16);
    ctx.fillStyle = "#1c1814";
    ctx.beginPath();
    ctx.arc(x - 0.16, y + 0.08, 0.07, 0, Math.PI * 2);
    ctx.arc(x + 0.16, y + 0.05, 0.07, 0, Math.PI * 2);
    ctx.fill();
    const puff = 0.35 + 0.25 * Math.sin(time * 3 + x * 4);
    ctx.fillStyle = `rgba(90, 90, 86, ${0.25 + puff * 0.2})`;
    ctx.beginPath();
    ctx.arc(x + 0.05, y - 0.22 - puff * 0.08, 0.08 + puff * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(232, 120, 40, ${0.45 + puff * 0.3})`;
    ctx.beginPath();
    ctx.arc(x + 0.02, y - 0.08, 0.05, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "fence") {
    ctx.strokeStyle = "#8a7352";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(x - 0.45, y);
    ctx.lineTo(x + 0.55, y - 0.08);
    ctx.moveTo(x - 0.45, y - 0.16);
    ctx.lineTo(x + 0.55, y - 0.24);
    ctx.stroke();
    ctx.fillStyle = "#6a5438";
    ctx.fillRect(x - 0.48, y - 0.28, 0.06, 0.32);
    ctx.fillRect(x + 0.5, y - 0.36, 0.06, 0.32);
  } else {
    const bob = Math.sin(time * 2 + x) * 0.02;
    ctx.fillStyle = "#8a5a32";
    ctx.fillRect(x - 0.14, y - 0.22 + bob, 0.28, 0.22);
    ctx.strokeStyle = "#c4a06a";
    ctx.lineWidth = 0.03;
    ctx.strokeRect(x - 0.14, y - 0.22 + bob, 0.28, 0.22);
  }
  ctx.restore();
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, bright: boolean) {
  const bob = bright ? Math.sin(time * 2.2 + x * 1.7 + y) * 0.04 : 0;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + 0.54, y + 0.78, 0.22, 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  if (bright) {
    ctx.fillStyle = "rgba(61,204,110,0.28)";
    ctx.beginPath();
    ctx.arc(x + 0.5, y + 0.52, 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = bright ? "#0e4a28" : "#1a4a2c";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.1 + bob);
  ctx.lineTo(x + 0.82, y + 0.48);
  ctx.lineTo(x + 0.5, y + 0.92);
  ctx.lineTo(x + 0.18, y + 0.48);
  ctx.fill();
  ctx.fillStyle = bright ? "#b8ffd0" : "#3dcc6e";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.16 + bob);
  ctx.lineTo(x + 0.66, y + 0.46);
  ctx.lineTo(x + 0.5, y + 0.4);
  ctx.fill();
  ctx.strokeStyle = bright ? "#eafff2" : "#1e8a48";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.1 + bob);
  ctx.lineTo(x + 0.82, y + 0.48);
  ctx.lineTo(x + 0.5, y + 0.92);
  ctx.lineTo(x + 0.18, y + 0.48);
  ctx.closePath();
  ctx.stroke();
}

function wetAt(terrain: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
  const t = terrain[y * GW + x];
  return t === TILE_DEEP || t === TILE_SHALLOW;
}

/** Editor terrain. One blended sheet, same lighting as a match, cached until the field changes. */
let docBake: { sum: number; w: number; h: number; theater: Theater; canvas: HTMLCanvasElement } | null = null;

function terrainSum(terrain: Uint8Array): number {
  let s = terrain.length;
  for (let i = 0; i < terrain.length; i += 11) s = (Math.imul(s, 31) + (terrain[i] ?? 0)) | 0;
  return s;
}

export function paintDocTiles(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  w: number,
  h: number,
  theater: Theater,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  time: number,
): boolean {
  const sum = terrainSum(terrain);
  if (!docBake || docBake.sum !== sum || docBake.w !== w || docBake.h !== h || docBake.theater !== theater) {
    const gpu = bakeTerrain(terrain, w, h, theater, Math.min(2048, Math.max(w, h) * 18));
    if (!gpu) {
      beginTerrain(terrain, w, h, theater);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) paintCell(ctx, terrain, x, y, w, h, theater, time);
      }
      return true;
    }
    const copy = document.createElement("canvas");
    copy.width = gpu.width;
    copy.height = gpu.height;
    const g = copy.getContext("2d");
    if (!g) return false;
    g.drawImage(gpu, 0, 0);
    docBake = { sum, w, h, theater, canvas: copy };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(docBake.canvas, 0, 0, w, h);
  return true;
}

/** Long side for a cached terrain sheet. Stays under a 4K frame so a phone can hold it. */
export function sheetLong(w: number, h: number, want: number, cap = 8_294_400): number {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  let side = want;
  const pixels = () => side * ((side * short) / long);
  while (pixels() > cap && side > 640) side = Math.floor(side * 0.8);
  return Math.max(256, Math.round(side));
}

const TERRAIN_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const TERRAIN_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uHeight;
uniform sampler2D uId;
uniform sampler2D uMat;
uniform vec2 uSize;
uniform float uTheater;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float n2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float tapH(vec2 cell) {
  return texture2D(uHeight, (cell + 0.5) / uSize).r * 2.0;
}
float idOf(vec2 cell) {
  return texture2D(uId, (cell + 0.5) / uSize).r * 255.0;
}
vec3 colOf(vec2 cell) {
  return texture2D(uColor, (cell + 0.5) / uSize).rgb;
}
float hAt(vec2 w) {
  vec2 p = w - 0.5;
  vec2 c = floor(p);
  vec2 f = fract(p);
  vec2 k = smoothstep(0.02, 0.98, f);
  return mix(mix(tapH(c), tapH(c + vec2(1.0, 0.0)), k.x), mix(tapH(c + vec2(0.0, 1.0)), tapH(c + vec2(1.0, 1.0)), k.x), k.y);
}
vec3 slotTex(float slot, vec2 uv) {
  float col = mod(slot, 4.0);
  float row = floor(slot / 4.0);
  vec2 f = fract(uv);
  f = mix(vec2(0.004), vec2(0.996), f);
  return texture2D(uMat, (vec2(col, row) + f) / vec2(4.0, 2.0)).rgb;
}
vec3 matTex(float slot, vec2 w) {
  vec3 broad = slotTex(slot, w * 0.16);
  vec3 fine = slotTex(slot, w * 0.38 + vec2(7.2, 2.6));
  return mix(broad, fine, 0.32);
}
vec4 biomeOf(vec3 ctrl) {
  float luma = dot(ctrl, vec3(0.30, 0.52, 0.18));
  float chroma = abs(ctrl.r - ctrl.g) + abs(ctrl.g - ctrl.b);
  float snow = smoothstep(0.58, 0.80, luma) * (1.0 - smoothstep(0.05, 0.18, chroma));
  float sand = clamp((ctrl.r - ctrl.g) * 2.6, 0.0, 1.0) * (1.0 - snow);
  float grass = clamp((ctrl.g - ctrl.r) * 3.0, 0.0, 1.0) * (1.0 - snow);
  float dirt = 0.22 + 0.15 * (1.0 - snow);
  float s = max(0.001, grass + dirt + sand + snow);
  return vec4(grass, dirt, sand, snow) / s;
}
vec4 dryOf(float id, vec3 ctrl) {
  vec4 b = biomeOf(ctrl);
  if (abs(id - 1.0) < 0.45 || abs(id - 7.0) < 0.45) return vec4(0.0);
  if (abs(id - 5.0) < 0.45 || abs(id - 6.0) < 0.45 || abs(id - 12.0) < 0.45 || abs(id - 20.0) < 0.45 || abs(id - 9.0) < 0.45) return vec4(0.0);
  if (abs(id - 0.0) < 0.45) return vec4(b.x * 0.08, b.y * 0.22, b.w > 0.55 ? 0.15 : 0.92, b.w);
  if (abs(id - 8.0) < 0.45) return vec4(b.x * 0.12, b.y * 0.28, b.w > 0.55 ? 0.25 : 0.95, b.w * 0.9);
  if (abs(id - 14.0) < 0.45 || abs(id - 11.0) < 0.45) return vec4(b.x * 0.28, 0.78, b.z * 0.22, b.w * 0.55);
  if (abs(id - 15.0) < 0.45) return vec4(b.x * 0.22, 0.48, b.z * 0.16, b.w * 0.30);
  if (b.w > 0.45) return vec4(0.02, 0.06, 0.05, 0.92);
  if (b.z > b.x && b.z > 0.32) return vec4(0.04, 0.18, 0.78, 0.0);
  return vec4(0.88, 0.12, 0.0, 0.0);
}
vec3 wetOf(float id) {
  if (abs(id - 1.0) < 0.45 || abs(id - 7.0) < 0.45) return vec3(1.0, 0.0, 0.0);
  if (abs(id - 15.0) < 0.45) return vec3(0.38, 0.0, 0.0);
  if (abs(id - 5.0) < 0.45 || abs(id - 12.0) < 0.45) return vec3(0.0, 1.0, 0.0);
  if (abs(id - 6.0) < 0.45 || abs(id - 20.0) < 0.45 || abs(id - 9.0) < 0.45) return vec3(0.0, 0.0, 1.0);
  if (abs(id - 8.0) < 0.45) return vec3(0.0, 0.12, 0.0);
  return vec3(0.0);
}
float beachId(float id) {
  if (abs(id - 5.0) < 0.45 || abs(id - 6.0) < 0.45 || abs(id - 8.0) < 0.45) return 1.0;
  if (abs(id - 12.0) < 0.45 || abs(id - 20.0) < 0.45 || abs(id - 9.0) < 0.45) return 1.0;
  return 0.0;
}
float beachNear(vec2 cell) {
  return beachId(idOf(cell + vec2(1.0, 0.0))) + beachId(idOf(cell + vec2(-1.0, 0.0))) + beachId(idOf(cell + vec2(0.0, 1.0))) + beachId(idOf(cell + vec2(0.0, -1.0)));
}
float inlandSand(vec2 cell) {
  if (abs(idOf(cell) - 0.0) > 0.45) return 0.0;
  if (beachNear(cell) > 0.5) return 0.0;
  if (uTheater > 0.5 && uTheater < 1.5) return 1.0;
  if (uTheater > 1.5) return 0.65;
  return 0.0;
}
void main() {
  vec2 world = vUv * uSize;
  vec2 bend = vec2(n2(world * 0.47), n2(world * 0.47 + vec2(5.2, 1.3))) - 0.5;
  vec2 p = world + bend * 1.85;
  vec2 q = p - 0.5;
  vec2 c0 = floor(q);
  vec2 f = fract(q);
  vec2 k = smoothstep(0.04, 0.96, f);
  float i00 = idOf(c0);
  float i10 = idOf(c0 + vec2(1.0, 0.0));
  float i01 = idOf(c0 + vec2(0.0, 1.0));
  float i11 = idOf(c0 + vec2(1.0, 1.0));
  vec4 d00 = dryOf(i00, colOf(c0));
  vec4 d10 = dryOf(i10, colOf(c0 + vec2(1.0, 0.0)));
  vec4 d01 = dryOf(i01, colOf(c0 + vec2(0.0, 1.0)));
  vec4 d11 = dryOf(i11, colOf(c0 + vec2(1.0, 1.0)));
  vec4 dry = mix(mix(d00, d10, k.x), mix(d01, d11, k.x), k.y);
  vec3 w00 = wetOf(i00);
  vec3 w10 = wetOf(i10);
  vec3 w01 = wetOf(i01);
  vec3 w11 = wetOf(i11);
  vec3 wet = mix(mix(w00, w10, k.x), mix(w01, w11, k.x), k.y);
  float meadow = mix(mix(inlandSand(c0), inlandSand(c0 + vec2(1.0, 0.0)), k.x), mix(inlandSand(c0 + vec2(0.0, 1.0)), inlandSand(c0 + vec2(1.0, 1.0)), k.x), k.y);
  if (meadow > 0.001 && uTheater > 1.5) {
    dry.w += dry.z * meadow;
    dry.z *= 1.0 - meadow;
  } else if (meadow > 0.001) {
    float path = smoothstep(0.55, 0.9, n2(p * 0.09));
    float give = dry.z * meadow * (1.0 - path);
    dry.x += give;
    dry.y += dry.z * meadow * path * 0.45;
    dry.z *= 1.0 - meadow * (1.0 - path * 0.35);
  }
  float h = hAt(p) + (n2(p * 0.16) - 0.5) * 0.035;
  float hL = hAt(p - vec2(0.55, 0.0));
  float hR = hAt(p + vec2(0.55, 0.0));
  float hU = hAt(p - vec2(0.0, 0.55));
  float hD = hAt(p + vec2(0.0, 0.55));
  float dhdx = (hR - hL) / 1.1;
  float dhdy = (hD - hU) / 1.1;
  float slope = length(vec2(dhdx, dhdy));
  float face = smoothstep(0.42, 1.05, slope) * (1.0 - clamp(wet.y + wet.z, 0.0, 1.0));
  wet.x += face * 0.85;
  float sum = dry.x + dry.y + dry.z + dry.w + wet.x + wet.y + wet.z;
  sum = max(sum, 0.001);
  dry /= sum;
  wet /= sum;
  vec3 grass = matTex(0.0, p);
  grass = vec3(grass.r * 0.92, grass.g * 1.08, grass.b * 0.75);
  float tuft = n2(p * 0.33);
  grass = mix(grass, grass * vec3(0.94, 1.05, 0.9), tuft * 0.22);
  vec3 dirt = matTex(1.0, p);
  vec3 sand = matTex(2.0, p);
  vec3 snow = matTex(3.0, p);
  vec3 rock = matTex(4.0, p);
  float rip = n2(p * 0.15);
  vec3 shall = mix(vec3(0.16, 0.58, 0.68), vec3(0.30, 0.76, 0.80), rip);
  vec3 deepc = mix(vec3(0.05, 0.24, 0.44), vec3(0.09, 0.36, 0.56), n2(p * 0.08));
  vec3 albedo = grass * dry.x;
  albedo += dirt * dry.y;
  albedo += sand * dry.z;
  albedo += snow * dry.w;
  albedo += rock * wet.x;
  albedo += shall * wet.y;
  albedo += deepc * wet.z;
  float field = n2(p * 0.06);
  float speckle = n2(p * 0.21 + 4.0);
  float dryAmt = dry.x + dry.y + dry.z + dry.w;
  vec3 warm = vec3(0.045, 0.055, 0.0) * (field - 0.32) + vec3(speckle - 0.5) * 0.02;
  vec3 cool = vec3(0.0, 0.02, 0.045) * (field - 0.4);
  albedo += mix(warm, cool, clamp(dry.w * 3.0, 0.0, 1.0)) * dryAmt;
  albedo.g += dry.x * (field - 0.42) * 0.08;
  float dune = sin((p.x * 0.22 + p.y * 0.05) + n2(p * 0.05) * 4.0);
  albedo += vec3(0.075, 0.05, 0.01) * dune * dry.z;
  albedo *= mix(1.0, 0.9 + n2(p * 0.7) * 0.2, dry.z);
  vec3 nrm = normalize(vec3(-dhdx * 1.25, -dhdy * 1.25, 0.78));
  float ndotl = clamp(dot(nrm, normalize(vec3(-0.38, -0.58, 0.72))), 0.0, 1.0);
  float avg = (hL + hR + hU + hD) * 0.25;
  float light = 0.66 + 0.5 * ndotl + clamp((h - avg) * 0.7, -0.14, 0.16);
  vec3 col = albedo * light;
  col += vec3(0.16, 0.13, 0.1) * wet.x * ndotl * smoothstep(0.18, 0.72, slope);
  float foam = smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.16, 0.46, h));
  foam *= wet.y + wet.z * 0.7;
  foam *= 0.5 + 0.5 * n2(p * 2.4);
  col = mix(col, vec3(0.94, 0.98, 0.97), foam * 0.88);
  float wetAmt = wet.y + wet.z;
  float dryEdge = dry.x + dry.y + dry.z + dry.w;
  float coast = smoothstep(0.02, 0.38, wetAmt) * smoothstep(0.02, 0.46, dryEdge);
  float lace = 0.32 + 0.68 * n2(vec2(p.x * 3.2 + n2(p * 0.7) * 2.4, p.y * 2.6));
  col = mix(col, vec3(0.96, 0.99, 0.97), coast * lace * 0.92);
  float id = idOf(floor(world));
  vec2 fr = fract(world);
  if (abs(id - 12.0) < 0.45) {
    col = mix(col, vec3(0.78, 0.70, 0.46), smoothstep(0.12, 0.28, fr.y) * (1.0 - smoothstep(0.72, 0.88, fr.y)) * 0.7);
  } else if (abs(id - 15.0) < 0.45) {
    col = mix(col, vec3(0.62, 0.50, 0.32), 0.2);
  } else if (abs(id - 21.0) < 0.45) {
    col = mix(col, vec3(0.9, 0.93, 0.96), 0.22);
    col *= 1.06;
  } else if (abs(id - 3.0) < 0.45 || abs(id - 16.0) < 0.45) {
    col = mix(col, vec3(0.22, 0.42, 0.16), 0.16);
  }
  float walk = 0.0;
  if (abs(id - 13.0) < 0.45 || abs(id - 10.0) < 0.45 || abs(id - 11.0) < 0.45 || abs(id - 14.0) < 0.45 || abs(id - 0.0) < 0.45 || abs(id - 8.0) < 0.45 || abs(id - 4.0) < 0.45 || abs(id - 2.0) < 0.45 || abs(id - 15.0) < 0.45 || abs(id - 21.0) < 0.45) walk = 1.0;
  col += vec3(0.04, 0.05, 0.012) * walk;
  float hCast = hAt(p - vec2(1.35, 1.7));
  float dropSh = smoothstep(0.18, 0.85, hCast - h);
  dropSh *= 1.0 - clamp(wet.y + wet.z, 0.0, 1.0);
  col *= 1.0 - dropSh * 0.55;
  if (uTheater < 0.5) col *= vec3(1.05, 0.99, 0.92);
  else if (uTheater > 1.5) col *= vec3(0.93, 0.98, 1.05);
  float luma = dot(col, vec3(0.30, 0.50, 0.20));
  col = mix(vec3(luma), col, 1.14);
  col *= 1.02 + (n2(p * 1.7) - 0.5) * 0.04;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

let terrainProg: { gl: WebGLRenderingContext; prog: WebGLProgram; buf: WebGLBuffer; id: number } | null = null;
const SHADER_ID = 28;

function terrainProgram(gl: WebGLRenderingContext) {
  if (terrainProg && terrainProg.gl === gl && terrainProg.id === SHADER_ID) return terrainProg;
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  gl.shaderSource(vs, TERRAIN_VS);
  gl.shaderSource(fs, TERRAIN_FS);
  gl.compileShader(vs);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const msg = `${gl.getShaderInfoLog(vs) ?? ""} ${gl.getShaderInfoLog(fs) ?? ""}`;
    console.error(msg);
    return null;
  }
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  const buf = gl.createBuffer();
  if (!buf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  terrainProg = { gl, prog, buf, id: SHADER_ID };
  return terrainProg;
}

function uploadTex(gl: WebGLRenderingContext, data: Uint8Array, w: number, h: number, format: number, filter: number) {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, gl.UNSIGNED_BYTE, data);
  return tex;
}

let gpuCanvas: HTMLCanvasElement | null = null;
let matImg: HTMLImageElement | null = null;
let matState: "idle" | "loading" | "ready" | "fail" = "idle";

function groundArt(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (matState === "ready" && matImg?.complete) return matImg;
  if (matState === "idle") {
    matState = "loading";
    const img = new Image();
    img.onload = () => {
      const done = () => {
        matState = "ready";
      };
      if (typeof img.decode === "function") void img.decode().then(done, done);
      else done();
    };
    img.onerror = () => {
      matState = "fail";
    };
    img.src = "/art/terrain/ground.png?v=19";
    matImg = img;
  }
  return matState === "ready" && matImg?.complete ? matImg : null;
}

/** Start the aerial atlas fetch. Safe to call more than once. */
export function ensureGround(): void {
  groundArt();
}

/** The atlas has arrived, or it failed and the flat fallback will do. */
export function groundSettled(): boolean {
  return matState === "ready" || matState === "fail";
}

let palmImg: HTMLImageElement | null = null;
let palmState: "idle" | "loading" | "ready" | "fail" = "idle";

/** The island picture used as the Palm Isle battlefield. */
export function palmPoster(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (palmState === "ready" && palmImg?.complete) return palmImg;
  if (palmState === "idle") {
    palmState = "loading";
    const img = new Image();
    img.onload = () => {
      palmState = "ready";
    };
    img.onerror = () => {
      palmState = "fail";
    };
    img.src = "/maps/palm-isle.jpg";
    palmImg = img;
  }
  return palmState === "ready" ? palmImg : null;
}

function bakeTerrainGl(
  terrain: Uint8Array,
  w: number,
  h: number,
  theater: Theater,
  width: number,
  height: number,
  mats: HTMLImageElement,
): HTMLCanvasElement | null {
  if (!gpuCanvas) gpuCanvas = document.createElement("canvas");
  const canvas = gpuCanvas;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true, alpha: false });
  if (!gl) return null;
  const linked = terrainProgram(gl);
  if (!linked) return null;
  const pack = packTerrain(terrain, w, h, theater);
  const color = uploadTex(gl, pack.color, w, h, gl.RGBA, gl.NEAREST);
  const heightTex = uploadTex(gl, pack.height, w, h, gl.LUMINANCE, gl.NEAREST);
  const ids = uploadTex(gl, pack.ids, w, h, gl.LUMINANCE, gl.NEAREST);
  const atlas = gl.createTexture();
  if (!color || !heightTex || !ids || !atlas) return null;
  gl.bindTexture(gl.TEXTURE_2D, atlas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mats);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.viewport(0, 0, width, height);
  gl.useProgram(linked.prog);
  const loc = (name: string) => gl.getUniformLocation(linked.prog, name);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.uniform1i(loc("uColor"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, heightTex);
  gl.uniform1i(loc("uHeight"), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, ids);
  gl.uniform1i(loc("uId"), 2);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, atlas);
  gl.uniform1i(loc("uMat"), 3);
  gl.uniform2f(loc("uSize"), w, h);
  const theaterId = theater === "snow" ? 2 : theater === "temperate" ? 1 : 0;
  gl.uniform1f(loc("uTheater"), theaterId);
  const pos = gl.getAttribLocation(linked.prog, "aPos");
  gl.bindBuffer(gl.ARRAY_BUFFER, linked.buf);
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.deleteTexture(color);
  gl.deleteTexture(heightTex);
  gl.deleteTexture(ids);
  gl.deleteTexture(atlas);
  return canvas;
}

/** Paint the field once. The match draws a slice of this, not every tile, every tick. */
export function bakeTerrain(
  terrain: Uint8Array,
  w: number,
  h: number,
  theater: Theater,
  longSide: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const mats = groundArt();
  const scale = longSide / Math.max(w, h);
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  if (!mats) {
    if (matState !== "fail") return null;
  } else {
    const gpu = bakeTerrainGl(terrain, w, h, theater, width, height, mats);
    if (gpu) return gpu;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  const img = ctx.createImageData(canvas.width, canvas.height);
  writeTerrain(img.data, canvas.width, canvas.height, terrain, w, h, theater);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function gradeTile(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  let color = "#c4a06a";
  if (t === TILE_DEEP || t === TILE_BRIDGE) color = "#1a6ea0";
  else if (t === TILE_SHALLOW || t === TILE_FORD) color = "#3aa0a4";
  else if (t === TILE_SHORE) color = "#e4c99a";
  else if (t === TILE_ROCK || t === TILE_CLIFF) color = "#7a7368";
  else if (t === TILE_CRYSTAL) color = "#3dcc6e";
  else if (THEATER === "snow") color = "#e4eef4";
  else if (THEATER === "temperate" || t === TILE_SCRUB) color = "#3f8a38";
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1.02, 1.02);
  ctx.restore();
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  bank: Painted,
  terrain: Uint8Array,
  x: number,
  y: number,
  time: number,
) {
  const t = terrain[y * GW + x];
  if (t === TILE_DEEP || t === TILE_BRIDGE) {
    ctx.drawImage(bank.deep, x, y, 1.02, 1.02);
    gradeTile(ctx, x, y, t);
    return;
  }
  if (t === TILE_SHALLOW || t === TILE_FORD) {
    ctx.drawImage(bank.shallow, x, y, 1.02, 1.02);
    if (t === TILE_FORD) {
      ctx.fillStyle = "rgba(196,160,104,0.45)";
      ctx.fillRect(x, y + 0.35, 1, 0.3);
    }
    gradeTile(ctx, x, y, t);
    return;
  }
  if (t === TILE_SHORE) {
    let ang = 0;
    if (wetAt(terrain, x, y - 1)) ang = 0;
    else if (wetAt(terrain, x, y + 1)) ang = Math.PI;
    else if (wetAt(terrain, x - 1, y)) ang = -Math.PI / 2;
    else if (wetAt(terrain, x + 1, y)) ang = Math.PI / 2;
    ctx.drawImage(bank.sand, x, y, 1.02, 1.02);
    ctx.save();
    ctx.translate(x + 0.5, y + 0.5);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.rect(-0.52, -0.52, 1.04, 0.42);
    ctx.clip();
    ctx.drawImage(bank.shore, -0.51, -0.51, 1.02, 1.02);
    ctx.restore();
    gradeTile(ctx, x, y, t);
    return;
  }
  ctx.drawImage(bank.sand, x, y, 1.02, 1.02);
  if (THEATER === "snow") {
    ctx.fillStyle = "rgba(236,242,248,0.22)";
    ctx.fillRect(x, y, 1, 1);
  } else if (THEATER === "temperate" && t !== TILE_ROAD && t !== TILE_ROCK && t !== TILE_CLIFF) {
    const grove = t === TILE_SCRUB || groveAt(x, y);
    ctx.fillStyle = grove ? "rgba(18,64,28,0.34)" : "rgba(52,104,40,0.16)";
    ctx.fillRect(x, y, 1, 1);
  }
  if (t === TILE_ROAD) {
    ctx.fillStyle = "rgba(92,64,36,0.55)";
    ctx.fillRect(x, y + 0.28, 1, 0.44);
  } else if (t === TILE_VALLEY) {
    ctx.fillStyle = "rgba(20,40,16,0.35)";
    ctx.fillRect(x, y + 0.35, 1, 0.3);
  } else if (t === TILE_ROCK || t === TILE_CLIFF) {
    ctx.drawImage(bank.rock, x + 0.04, y + 0.02, 0.94, 0.94);
  } else if (t === TILE_CRYSTAL) {
    const bob = Math.sin(time * 2.1 + x * 1.3 + y) * 0.03;
    ctx.drawImage(bank.crystal, x + 0.08, y + 0.02 + bob, 0.84, 0.9);
  } else if (t === TILE_SPENT) {
    ctx.fillStyle = "rgba(48,28,12,0.3)";
    ctx.fillRect(x, y, 1, 1);
  } else if (t === TILE_SCRUB) {
    drawBush(ctx, x, y);
  }
  gradeTile(ctx, x, y, t);
}

function aimOf(sim: Sim, u: Unit): number {
  if (u.order.t === "attack") {
    const foe = sim.unitById(u.order.id);
    if (foe && foe.hp > 0) return Math.atan2(foe.y - u.y, foe.x - u.x);
    const b = sim.buildingById(u.order.id);
    if (b && b.hp > 0) return Math.atan2(b.ty + b.h / 2 - u.y, b.tx + b.w / 2 - u.x);
  }
  return u.facing;
}

type HallKey = "yard" | "power" | "refinery" | "barracks" | "factory" | "tower" | "supply";

const HALL: Partial<Record<BuildingId, HallKey>> = {
  yard: "yard",
  power: "power",
  advpower: "power",
  refinery: "refinery",
  silo: "supply",
  supply: "supply",
  barracks: "barracks",
  factory: "factory",
  dock: "factory",
  helipad: "factory",
  tower: "tower",
  aa: "tower",
  radar: "tower",
  stealth: "barracks",
};

/** Art is painted with crimson trim. Rotate that trim onto the seat color. */
function trimFilter(color: string): string {
  const m = /#([0-9a-f]{6})/i.exec(color);
  if (!m) return "none";
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.05) return "none";
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  let deg = h - 354;
  if (deg > 180) deg -= 360;
  if (deg < -180) deg += 360;
  return `hue-rotate(${deg.toFixed(1)}deg)`;
}

function hallFrame(b: Building, img: CanvasImageSource) {
  const tall = b.kind === "tower" || b.kind === "aa" || b.kind === "radar";
  const dw = Math.max(b.w, b.h) * (tall ? 1.55 : 1.24);
  const size = sourceSize(img);
  const aspect = size.h / Math.max(1, size.w);
  const dh = dw * aspect;
  return {
    x: b.tx + (b.w - dw) / 2,
    y: b.ty + b.h - dh * 0.8,
    w: dw,
    h: dh,
  };
}

function structureTop(b: Building): number {
  if (isFence(b.kind) || b.kind === "span") return b.ty;
  const bank = art();
  const key = HALL[b.kind] ?? "yard";
  const img = bank?.[key];
  if (!img) return b.ty;
  return hallFrame(b, img).y;
}

function paintSnowTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const h = hash(x, y);
  ctx.fillStyle = "rgba(16, 22, 28, 0.4)";
  ctx.beginPath();
  ctx.ellipse(x + 0.58, y + 0.88, 0.32, 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3e342c";
  ctx.fillRect(x + 0.44, y + 0.62, 0.12, 0.24);
  ctx.fillStyle = "#5e7e96";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.06 + h * 0.1);
  ctx.lineTo(x + 0.9, y + 0.72);
  ctx.lineTo(x + 0.1, y + 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f3f7fa";
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + 0.06 + h * 0.1);
  ctx.lineTo(x + 0.72, y + 0.4);
  ctx.lineTo(x + 0.28, y + 0.4);
  ctx.closePath();
  ctx.fill();
}

function paintGrove(ctx: CanvasRenderingContext2D, x: number, y: number, stump: boolean): boolean {
  if (stump || THEATER === "desert") return false;
  if (THEATER === "snow") {
    paintSnowTree(ctx, x, y);
    return true;
  }
  const bank = art();
  if (!bank || bank.jungle.length < 1) return false;
  const pick = hash(x, y);
  const img = bank.jungle[pick < 0.5 ? 0 : bank.jungle.length - 1] ?? bank.jungle[0];
  if (!img) return false;
  const w = 1.55 + hash(x + 1, y + 3) * 0.85;
  const grove = sourceSize(img);
  const hh = w * (grove.h / Math.max(1, grove.w));
  ctx.save();
  ctx.translate(x + 0.5, y + 0.94);
  ctx.scale(hash(x + 2, y + 5) > 0.5 ? -1 : 1, 1 / viewPitch());
  ctx.drawImage(img, -w / 2, -hh, w, hh);
  ctx.restore();
  return true;
}

function tileElev(t: number): number {
  if (t === TILE_CLIFF) return 1.7;
  if (t === TILE_HIGH) return 1.22;
  if (t === TILE_ROCK) return 0.96;
  if (t === TILE_BRIDGE) return 0.58;
  if (t === TILE_RAMP) return 0.64;
  if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD || t === TILE_WRECK) return -0.08;
  return 0;
}

function volumeQuad(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  color: string,
) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** The ground leaves the picture here. A drop is a wall in the same height the buildings use. */
function paintVolume(ctx: CanvasRenderingContext2D, sim: Sim, x: number, y: number) {
  const t = sim.terrain[y * sim.gw + x] ?? 0;
  const h = tileElev(t);
  const at = (nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= sim.gw || ny >= sim.gh) return h;
    return tileElev(sim.terrain[ny * sim.gw + nx] ?? 0);
  };
  const snow = THEATER === "snow";
  const drop = (edge: number, draw: (rise: number, shear: number) => void) => {
    const gap = h - edge;
    if (gap < 0.16) return;
    draw(gap * SOLID_LIFT, gap * SOLID_SHEAR);
  };
  drop(at(x, y + 1), (rise, shear) => {
    if (rise < 0.22) return;
    const yb = y + 1;
    const wall = t === TILE_CLIFF ? (snow ? "#6a7c88" : "#3a342c") : t === TILE_ROCK ? (snow ? "#7d8d98" : "#4a433c") : snow ? "#9aa8b0" : "#6a6258";
    volumeQuad(ctx, x, yb, x + 1, yb, x + 1 + shear, yb - rise, x + shear, yb - rise, wall);
    if (t === TILE_CLIFF || t === TILE_ROCK) {
      volumeQuad(ctx, x, yb - rise, x + 1, yb - rise, x + 1 + shear * 0.15, yb - rise - 0.04, x + shear * 0.15, yb - rise - 0.04, snow ? "#f4f7fa" : "rgba(236,226,206,0.45)");
    }
  });
  drop(at(x + 1, y), (rise, shear) => {
    const xb = x + 1;
    volumeQuad(ctx, xb, y, xb, y + 1, xb + shear, y + 1 - rise, xb + shear, y - rise, t === TILE_CLIFF ? "#241e1a" : "#2e2924");
  });
  if (t === TILE_CLIFF && h - at(x, y + 1) > 0.4) {
    ctx.fillStyle = "rgba(10, 12, 10, 0.28)";
    ctx.beginPath();
    ctx.ellipse(x + 0.7, y + 1.28, 0.72, 0.2, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bridgeTile(terrain: Uint8Array, gw: number, gh: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= gw || y >= gh) return false;
  return (terrain[y * gw + x] ?? 0) === TILE_BRIDGE;
}

function groundTile(terrain: Uint8Array, gw: number, gh: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= gw || y >= gh) return TILE_ROCK;
  return terrain[y * gw + x] ?? 0;
}

function waterTile(t: number): boolean {
  return t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD || t === TILE_WRECK;
}

function bankTile(t: number): boolean {
  return (
    t === TILE_SAND ||
    t === TILE_CLEAR ||
    t === TILE_ROUGH ||
    t === TILE_SHORE ||
    t === TILE_ROAD ||
    t === TILE_HIGH ||
    t === TILE_RAMP ||
    t === TILE_STUMP ||
    t === TILE_SPENT ||
    t === TILE_SCRUB ||
    t === TILE_VALLEY
  );
}

function paintPlankDeck(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alongY: boolean) {
  ctx.fillStyle = "#6b5340";
  ctx.fillRect(x, y, w, h);
  const tone = 128 + ((hash(x * 3, y * 5) * 28) | 0);
  ctx.fillStyle = `rgb(${tone + 18},${tone - 8},62)`;
  ctx.fillRect(x + 0.05, y + 0.05, Math.max(0.08, w - 0.1), Math.max(0.08, h - 0.1));
  ctx.fillStyle = "rgba(42, 28, 16, 0.42)";
  const n = Math.max(3, Math.round((alongY ? h : w) * 2.2));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (alongY) ctx.fillRect(x + 0.06, y + h * t, Math.max(0.04, w - 0.12), 0.028);
    else ctx.fillRect(x + w * t, y + 0.06, 0.028, Math.max(0.04, h - 0.12));
  }
}

function paintBridgeRamps(ctx: CanvasRenderingContext2D, terrain: Uint8Array, gw: number, gh: number, x: number, y: number) {
  const dirt = (rx: number, ry: number, rw: number, rh: number, a: number) => {
    ctx.fillStyle = `rgba(112, 84, 52, ${a})`;
    ctx.fillRect(rx, ry, rw, rh);
  };
  if (bankTile(groundTile(terrain, gw, gh, x, y - 1))) {
    dirt(x, y - 1.05, 1, 0.42, 0.16);
    dirt(x, y - 0.64, 1, 0.42, 0.38);
    dirt(x, y - 0.24, 1, 0.3, 0.78);
  }
  if (bankTile(groundTile(terrain, gw, gh, x, y + 1))) {
    dirt(x, y + 1.58, 1, 0.4, 0.16);
    dirt(x, y + 1.18, 1, 0.42, 0.38);
    dirt(x, y + 0.92, 1, 0.3, 0.78);
  }
  if (bankTile(groundTile(terrain, gw, gh, x - 1, y))) {
    dirt(x - 1.05, y, 0.42, 1, 0.16);
    dirt(x - 0.64, y, 0.42, 1, 0.38);
    dirt(x - 0.24, y, 0.3, 1, 0.78);
  }
  if (bankTile(groundTile(terrain, gw, gh, x + 1, y))) {
    dirt(x + 1.58, y, 0.4, 1, 0.16);
    dirt(x + 1.18, y, 0.42, 1, 0.38);
    dirt(x + 0.94, y, 0.3, 1, 0.78);
  }
}

function paintBridgeDeckTile(ctx: CanvasRenderingContext2D, terrain: Uint8Array, gw: number, gh: number, x: number, y: number) {
  const n = bridgeTile(terrain, gw, gh, x, y - 1);
  const s = bridgeTile(terrain, gw, gh, x, y + 1);
  const e = bridgeTile(terrain, gw, gh, x + 1, y);
  const w = bridgeTile(terrain, gw, gh, x - 1, y);
  const ortho = n || s || e || w;
  const dNE = bridgeTile(terrain, gw, gh, x + 1, y - 1);
  const dNW = bridgeTile(terrain, gw, gh, x - 1, y - 1);
  const dSE = bridgeTile(terrain, gw, gh, x + 1, y + 1);
  const dSW = bridgeTile(terrain, gw, gh, x - 1, y + 1);
  if (!ortho && (dNE || dNW || dSE || dSW)) {
    const ang = dNE || dSW ? -Math.PI / 4 : Math.PI / 4;
    ctx.save();
    ctx.translate(x + 0.5, y + 0.5);
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(4, 10, 16, 0.4)";
    ctx.fillRect(-0.42, -0.02, 0.95, 0.42);
    paintPlankDeck(ctx, -0.64, -0.2, 1.28, 0.4, false);
    ctx.fillStyle = "#efe4d2";
    ctx.fillRect(-0.64, -0.26, 1.28, 0.07);
    ctx.fillRect(-0.64, 0.19, 1.28, 0.07);
    ctx.fillStyle = "#3a2c1e";
    ctx.fillRect(-0.58, -0.28, 0.1, 0.12);
    ctx.fillRect(0.48, -0.28, 0.1, 0.12);
    ctx.fillRect(-0.58, 0.16, 0.1, 0.12);
    ctx.fillRect(0.48, 0.16, 0.1, 0.12);
    ctx.restore();
    return;
  }
  const alongY = (n || s) && !(e || w) ? true : (e || w) && !(n || s) ? false : n || s;
  paintPlankDeck(ctx, x - 0.015, y - 0.015, 1.03, 1.03, alongY);
  ctx.fillStyle = "#efe4d2";
  const rail = (nx: number, ny: number, rx: number, ry: number, rw: number, rh: number) => {
    if (!waterTile(groundTile(terrain, gw, gh, nx, ny))) return;
    ctx.fillRect(rx, ry, rw, rh);
  };
  rail(x, y - 1, x, y + 0.02, 1, 0.08);
  rail(x, y + 1, x, y + 0.9, 1, 0.08);
  rail(x - 1, y, x + 0.02, y, 0.08, 1);
  rail(x + 1, y, x + 0.9, y, 0.08, 1);
  ctx.fillStyle = "#3a2c1e";
  const post = (px: number, py: number) => ctx.fillRect(px, py, 0.11, 0.12);
  if (waterTile(groundTile(terrain, gw, gh, x, y - 1)) && x % 2 === 0) {
    post(x + 0.06, y);
    post(x + 0.82, y);
  }
  if (waterTile(groundTile(terrain, gw, gh, x, y + 1)) && x % 2 === 0) {
    post(x + 0.06, y + 0.86);
    post(x + 0.82, y + 0.86);
  }
  if (waterTile(groundTile(terrain, gw, gh, x - 1, y)) && y % 2 === 0) {
    post(x, y + 0.08);
    post(x, y + 0.78);
  }
  if (waterTile(groundTile(terrain, gw, gh, x + 1, y)) && y % 2 === 0) {
    post(x + 0.86, y + 0.08);
    post(x + 0.86, y + 0.78);
  }
}

function paintBridgeShadow(ctx: CanvasRenderingContext2D, terrain: Uint8Array, gw: number, gh: number, x: number, y: number) {
  ctx.fillStyle = "rgba(4, 10, 16, 0.42)";
  if (waterTile(groundTile(terrain, gw, gh, x, y + 1))) ctx.fillRect(x + 0.08, y + 1.0, 0.9, 0.22);
  if (waterTile(groundTile(terrain, gw, gh, x + 1, y))) ctx.fillRect(x + 1.0, y + 0.12, 0.2, 0.86);
  if (waterTile(groundTile(terrain, gw, gh, x, y - 1))) ctx.fillRect(x + 0.12, y - 0.16, 0.84, 0.16);
  if (waterTile(groundTile(terrain, gw, gh, x - 1, y))) ctx.fillRect(x - 0.16, y + 0.16, 0.16, 0.8);
}

function paintBridges(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const visit = (draw: (x: number, y: number) => void) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!bridgeTile(terrain, gw, gh, x, y)) continue;
        draw(x, y);
      }
    }
  };
  visit((x, y) => paintBridgeShadow(ctx, terrain, gw, gh, x, y));
  visit((x, y) => paintBridgeRamps(ctx, terrain, gw, gh, x, y));
  visit((x, y) => paintBridgeDeckTile(ctx, terrain, gw, gh, x, y));
}

function roadTile(terrain: Uint8Array, gw: number, gh: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= gw || y >= gh) return false;
  const t = terrain[y * gw + x] ?? 0;
  return t === TILE_ROAD || t === TILE_BRIDGE;
}

/** One soft strip through tile centers, including diagonals. Not a brick staircase. */
function paintRoadNet(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((terrain[y * gw + x] ?? 0) !== TILE_ROAD) continue;
      const links: [number, number][] = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ];
      for (const [dx, dy] of links) {
        if (!roadTile(terrain, gw, gh, x + dx, y + dy)) continue;
        ctx.moveTo(x + 0.5, y + 0.5);
        ctx.lineTo(x + dx + 0.5, y + dy + 0.5);
      }
    }
  }
  ctx.strokeStyle = "rgba(48, 34, 20, 0.42)";
  ctx.lineWidth = 0.84;
  ctx.stroke();
  ctx.strokeStyle = "rgba(154, 116, 68, 0.96)";
  ctx.lineWidth = 0.56;
  ctx.stroke();
  ctx.strokeStyle = "rgba(226, 198, 150, 0.38)";
  ctx.lineWidth = 0.12;
  ctx.stroke();
  ctx.restore();
}

/** Roads then bridges, on top of the baked ground. Match and editor share this. */
export function paintCrossings(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  paintRoadNet(ctx, terrain, gw, gh, x0, y0, x1, y1);
  paintBridges(ctx, terrain, gw, gh, x0, y0, x1, y1);
}

function paintShoreLip(ctx: CanvasRenderingContext2D, sim: Sim, x: number, y: number) {
  const t = sim.terrain[y * sim.gw + x] ?? 0;
  if (t !== TILE_DEEP && t !== TILE_SHALLOW && t !== TILE_FORD && t !== TILE_WRECK) return;
  const land = (nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= sim.gw || ny >= sim.gh) return false;
    const n = sim.terrain[ny * sim.gw + nx] ?? 0;
    return n !== TILE_DEEP && n !== TILE_SHALLOW && n !== TILE_FORD && n !== TILE_WRECK && n !== TILE_BRIDGE;
  };
  ctx.fillStyle = THEATER === "snow" ? "rgba(236, 244, 248, 0.72)" : "rgba(232, 244, 236, 0.55)";
  if (land(x, y - 1)) ctx.fillRect(x, y, 1, 0.07);
  if (land(x, y + 1)) ctx.fillRect(x, y + 0.93, 1, 0.07);
  if (land(x - 1, y)) ctx.fillRect(x, y, 0.07, 1);
  if (land(x + 1, y)) ctx.fillRect(x + 0.93, y, 0.07, 1);
}

function paintBuilding(
  ctx: CanvasRenderingContext2D,
  bank: Painted,
  b: Building,
  color: string,
  selected: boolean,
  time: number,
  low: boolean,
): boolean {
  if (b.kind === "wall" || b.kind === "sandbag" || b.kind === "gate" || b.kind === "span") return false;
  const key = HALL[b.kind] ?? "yard";
  const img = bank[key];
  const p = b.complete ? 1 : 1 - b.buildLeft / Math.max(0.01, b.buildTotal);
  const box = hallFrame(b, img);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(b.tx + b.w / 2 + 0.2, b.ty + b.h * 0.86, b.w * 0.36, Math.max(0.08, b.h * 0.1), 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = b.complete ? 1 : 0.42 + 0.58 * Math.max(0, Math.min(1, p));
  ctx.filter = trimFilter(color);
  ctx.drawImage(img, box.x, box.y, box.w, box.h);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  if (!b.complete) {
    const phase = Math.min(3, Math.floor(Math.max(0, Math.min(0.999, p)) * 4));
    const sc = bank.scaffold[phase];
    if (sc) ctx.drawImage(sc, b.tx - 0.08, b.ty - 0.2, b.w + 0.16, b.h + 0.32);
  }
  if (b.complete && (b.kind === "power" || b.kind === "advpower")) {
    const glow = 0.35 + 0.35 * Math.sin(time * 3 + b.id);
    ctx.fillStyle = `rgba(255, 214, 140, ${glow})`;
    ctx.beginPath();
    ctx.arc(b.tx + b.w * 0.7, b.ty + b.h * 0.34, Math.max(0.06, b.w * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.kind === "helipad") {
    ctx.strokeStyle = "#f4efe4";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(b.tx + b.w / 2, b.ty + b.h * 0.42, Math.min(b.w, b.h) * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (selected) {
    ctx.strokeStyle = "#f3ead7";
    ctx.lineWidth = 0.07;
    ctx.strokeRect(b.tx + 0.04, b.ty + 0.04, b.w - 0.08, b.h - 0.08);
  }
  if (low && b.complete && (b.kind === "tower" || b.kind === "aa" || b.special === "aa" || b.special === "radar")) {
    ctx.fillStyle = "rgba(8,6,4,0.45)";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = "#e23b2f";
    ctx.font = "0.42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OFF", b.tx + b.w / 2, b.ty + b.h / 2);
  }
  ctx.restore();
  return true;
}

function selectRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, _color = "#ffffff", _time = 0) {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.ellipse(x, y + 0.02, r * 1.15, r * 0.46, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Soft contact shadow, offset with the light, plus a thin team rim. */
function drawStand(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const rx = Math.max(0.28, radius * 0.95);
  const ry = rx * 0.32;
  ctx.save();
  ctx.fillStyle = "rgba(20, 16, 10, 0.2)";
  ctx.beginPath();
  ctx.ellipse(x + 0.12, y + 0.1, rx, ry, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.ellipse(x, y + 0.02, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function paintCutout(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const o = Math.max(0.035, Math.min(w, h) * 0.07);
  ctx.save();
  ctx.filter = "brightness(0) invert(1)";
  ctx.drawImage(img, x - o, y, w, h);
  ctx.drawImage(img, x + o, y, w, h);
  ctx.drawImage(img, x, y - o, w, h);
  ctx.drawImage(img, x, y + o, w, h);
  ctx.filter = "none";
  ctx.restore();
  ctx.drawImage(img, x, y, w, h);
}

function teamBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = "#140e0a";
  ctx.fillRect(x - 0.02, y - 0.02, w + 0.04, h + 0.04);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function fitSpan(radius: number, mul: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, radius * mul));
}

function drawFoot(ctx: CanvasRenderingContext2D, kind: "marksman" | "wader", color: string, s: number) {
  ctx.fillStyle = "#2a2620";
  ctx.fillRect(-s * 0.12, -s * 0.28, s * 0.24, s * 0.62);
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.16, -s * 0.46, s * 0.32, s * 0.22);
  ctx.fillStyle = "#c8b48a";
  ctx.fillRect(-s * 0.08, -s * 0.56, s * 0.16, s * 0.12);
  if (kind === "marksman") {
    ctx.fillStyle = "#1c1814";
    ctx.fillRect(s * 0.02, -s * 0.08, s * 0.55, s * 0.06);
  } else {
    ctx.fillStyle = "#1a6ea0";
    ctx.fillRect(-s * 0.22, s * 0.18, s * 0.44, s * 0.1);
  }
}

function paintUnitSprite(
  ctx: CanvasRenderingContext2D,
  bank: Painted,
  u: Unit,
  x: number,
  y: number,
  color: string,
  selected: boolean,
  time: number,
  aim: number,
  moving: boolean,
): boolean {
  if (u.stealth && u.team === VIEWER) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "rgba(125,143,58,0.8)";
    ctx.lineWidth = 0.04;
    ctx.setLineDash([0.08, 0.06]);
    ctx.strokeRect(-0.45, -0.45, 0.9, 0.9);
    ctx.setLineDash([]);
    ctx.restore();
  }

  const infantry = u.kind === "rifle" || u.kind === "rocket" || u.kind === "engineer" || u.kind === "vanguard";
  if (u.loco === "land") drawStand(ctx, x, y, u.radius, color);
  else if (u.loco !== "air") {
    ctx.save();
    ctx.fillStyle = "rgba(12,10,6,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + 0.06, y + 0.16, u.radius * 0.9, u.radius * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (infantry || u.kind === "marksman" || u.kind === "wader") {
    const s = fitSpan(u.radius, 2.7, 0.64, u.kind === "vanguard" ? 1.02 : 0.9);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u.facing + (moving ? Math.sin(time * 10 + u.id) * 0.07 : 0));
    if (u.kind === "marksman" || u.kind === "wader") drawFoot(ctx, u.kind, color, s);
    else {
      const img = u.kind === "rocket" ? bank.rocket : bank.infantry;
      paintCutout(ctx, img, -s / 2, -s / 2, s, s);
      teamBand(ctx, -s * 0.15, -s * 0.32, s * 0.34, s * 0.09, color);
      if (u.kind === "engineer") {
        ctx.fillStyle = "#e4c15a";
        ctx.fillRect(-0.1, -s * 0.46, 0.2, 0.06);
      }
    }
    ctx.restore();
    if (selected) selectRing(ctx, x, y, u.radius + 0.16, color, time);
    return true;
  }

  if (u.loco === "sea") {
    if (moving) drawWake(ctx, x, y, u.facing, Math.floor((time * 8 + u.id) % 4));
    const wide = u.kind === "frigate" || u.kind === "transport";
    const w = u.kind === "frigate" ? 1.85 : wide ? 1.6 : 1.28;
    const h = wide ? 0.78 : 0.58;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u.facing);
    paintCutout(ctx, bank.boat, -w / 2, -h / 2, w, h);
    teamBand(ctx, -0.05, -0.08, w * 0.28, 0.1, color);
    ctx.restore();
    if (selected) selectRing(ctx, x, y, u.radius + 0.16, color, time);
    return true;
  }

  if (u.loco === "air") {
    const w = u.kind === "bomber" ? 1.6 : u.kind === "chinook" ? 1.45 : 1.22;
    const h = u.kind === "chinook" ? 0.7 : 0.62;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u.facing);
    paintCutout(ctx, bank.heli, -w / 2, -h / 2, w, h);
    teamBand(ctx, -0.08, -0.08, 0.28, 0.1, color);
    ctx.rotate(time * 16);
    ctx.strokeStyle = "rgba(18,14,10,0.88)";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-0.78, 0);
    ctx.lineTo(0.78, 0);
    ctx.moveTo(0, -0.78);
    ctx.lineTo(0, 0.78);
    ctx.stroke();
    ctx.fillStyle = "rgba(24,18,12,0.16)";
    ctx.beginPath();
    ctx.arc(0, 0, 0.66, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (selected) selectRing(ctx, x, y, u.radius + 0.18, color, time);
    return true;
  }

  if (u.kind === "harvester") {
    const w = 1.55;
    const h = 1.02;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u.facing);
    paintCutout(ctx, bank.harvester, -w / 2, -h / 2, w, h);
    teamBand(ctx, -0.28, -0.1, 0.32, 0.12, color);
    if (u.cargo > 0) {
      const fill = Math.min(1, u.cargo / Math.max(1, u.cargoMax));
      ctx.fillStyle = "#14381f";
      ctx.fillRect(0.02, -0.16, 0.42, 0.32);
      ctx.fillStyle = "#3dcc6e";
      ctx.fillRect(0.05, 0.12 - 0.24 * fill, 0.36, 0.24 * fill);
    }
    if (u.gather > 0) {
      const swing = Math.sin(time * 9 + u.id) * 0.16;
      ctx.fillStyle = "#c6a56a";
      ctx.fillRect(0.2, -0.32 + swing, 0.1, 0.36);
      ctx.fillStyle = "#3dcc6e";
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0.16, -0.38 + swing, 0.18, 0.1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (selected) selectRing(ctx, x, y, u.radius + 0.16, color, time);
    return true;
  }

  const scout = u.kind === "scout" || u.kind === "razor";
  const arty = u.kind === "artillery";
  const w =
    u.kind === "mcv"
      ? 1.55
      : arty
        ? 1.35
        : scout
          ? 0.92
          : u.kind === "medium"
            ? 1.28
            : u.kind === "scatter"
              ? 1.05
              : fitSpan(u.radius, 2.7, 1.05, 1.42);
  const h = w * 0.64;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(u.facing);
  paintCutout(ctx, bank.hull, -w / 2, -h / 2, w, h);
  if (moving) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#1a120c";
    const o = (time * 1.7 + u.id) % 0.2;
    for (let i = 0; i < 6; i++) {
      const px = -w / 2 + 0.04 + ((i * 0.2 + o) % (w - 0.16));
      ctx.fillRect(px, -h / 2 + 0.03, 0.07, 0.07);
      ctx.fillRect(px, h / 2 - 0.1, 0.07, 0.07);
    }
    ctx.restore();
  }
  teamBand(ctx, -0.08, -0.07, w * 0.32, 0.12, color);
  ctx.restore();

  const turreted = u.kind === "tank" || u.kind === "medium" || u.kind === "artillery" || u.kind === "scatter";
  if (turreted) {
    const ts = arty ? 0.92 : u.kind === "medium" ? 0.74 : u.kind === "scatter" ? 0.62 : 0.64;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim);
    paintCutout(ctx, bank.turret, -ts / 2, -ts / 2, ts, ts);
    ctx.restore();
  }
  if (selected) selectRing(ctx, x, y, u.radius + 0.16, color, time);
  return true;
}

function drawFence(
  ctx: CanvasRenderingContext2D,
  b: Building,
  color: string,
  selected: boolean,
  time: number,
  sim: Sim,
) {
  const spin = b.kind === "gate" && gateVertical(sim, b.tx, b.ty);
  if (spin) {
    ctx.save();
    ctx.translate(b.tx + 0.5, b.ty + 0.5);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-(b.tx + 0.5), -(b.ty + 0.5));
  }
  const x = b.tx;
  const y = b.ty;
  if (selected) {
    ctx.strokeStyle = "#f3ead7";
    ctx.lineWidth = 0.06;
    ctx.strokeRect(x + 0.05, y + 0.05, 0.9, 0.9);
  }
  if (b.rubble > 0) {
    ctx.fillStyle = "#4a382c";
    ctx.fillRect(x + 0.16, y + 0.62, 0.3, 0.16);
    ctx.fillStyle = "#6a5340";
    ctx.fillRect(x + 0.42, y + 0.56, 0.24, 0.18);
    ctx.fillStyle = "#2e261f";
    ctx.fillRect(x + 0.28, y + 0.72, 0.4, 0.12);
    ctx.fillStyle = "#8a7058";
    ctx.fillRect(x + 0.58, y + 0.66, 0.18, 0.1);
    if (spin) ctx.restore();
    return;
  }
  const grow = b.complete ? 1 : Math.max(0.28, 1 - b.buildLeft / Math.max(0.01, b.buildTotal));
  if (b.kind === "sandbag") {
    ctx.fillStyle = "#3d2a1c";
    ctx.fillRect(x + 0.08, y + 0.64, 0.84 * grow, 0.14);
    ctx.fillStyle = "#8a5a32";
    ctx.fillRect(x + 0.06, y + 0.52, 0.88 * grow, 0.16);
    ctx.fillStyle = "#c4a078";
    ctx.fillRect(x + 0.08, y + 0.52, 0.84 * grow, 0.04);
    ctx.fillStyle = color;
    ctx.fillRect(x + 0.14, y + 0.38, 0.08, 0.3);
    ctx.fillRect(x + 0.78, y + 0.38, 0.08, 0.3);
    ctx.fillStyle = "#241810";
    ctx.fillRect(x + 0.15, y + 0.38, 0.025, 0.3);
    ctx.fillRect(x + 0.79, y + 0.38, 0.025, 0.3);
  } else {
    ctx.fillStyle = "#2a2826";
    ctx.fillRect(x + 0.05, y + 0.36, 0.9, 0.42);
    ctx.fillStyle = b.kind === "gate" ? "#8d8882" : "#b0aaa4";
    ctx.fillRect(x + 0.06, y + 0.28, 0.88 * grow, 0.46);
    ctx.fillStyle = "#e4dfd8";
    ctx.fillRect(x + 0.06, y + 0.28, 0.88 * grow, 0.05);
    ctx.fillStyle = color;
    ctx.fillRect(x + 0.06, y + 0.44, 0.88 * grow, 0.07);
    if (b.kind === "gate") {
      const open = b.open && b.complete;
      ctx.fillStyle = "#242220";
      ctx.fillRect(x + 0.08, y + 0.22, 0.1, 0.56);
      ctx.fillRect(x + 0.82, y + 0.22, 0.1, 0.56);
      const wobble = open ? Math.sin(time * 3 + b.id) * 0.03 : 0;
      ctx.fillStyle = shade(color, 0.75);
      if (open) ctx.fillRect(x + 0.18, y + 0.22 + wobble, 0.64, 0.1);
      else ctx.fillRect(x + 0.16, y + 0.46, 0.68, 0.12);
    }
  }
  if (b.complete && b.maxHp > 0 && b.hp < b.maxHp * 0.55) {
    ctx.strokeStyle = "rgba(18,14,10,0.85)";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(x + 0.22, y + 0.34);
    ctx.lineTo(x + 0.58, y + 0.72);
    if (b.hp < b.maxHp * 0.28) {
      ctx.moveTo(x + 0.74, y + 0.32);
      ctx.lineTo(x + 0.36, y + 0.64);
    }
    ctx.stroke();
  }
  if (!b.complete) {
    const p = 1 - b.buildLeft / Math.max(0.01, b.buildTotal);
    ctx.fillStyle = "#c6a56a";
    ctx.fillRect(x + 0.12, y + 0.86, 0.76 * Math.max(0, Math.min(1, p)), 0.06);
  }
  if (spin) ctx.restore();
}

function hallPlate(kind: string): keyof IsoBank | null {
  if (kind === "yard") return "yard";
  if (kind === "power" || kind === "advpower") return "power";
  if (kind === "barracks") return "barracks";
  if (kind === "factory") return "factory";
  if (kind === "tower" || kind === "aa") return "tower";
  if (kind === "refinery") return "refinery";
  if (kind === "supply" || kind === "silo") return "supply";
  return null;
}

function unitPlate(kind: string): keyof IsoBank | null {
  if (
    kind === "rifle" ||
    kind === "rocket" ||
    kind === "marksman" ||
    kind === "wader" ||
    kind === "vanguard" ||
    kind === "engineer" ||
    kind === "tank" ||
    kind === "medium" ||
    kind === "scout" ||
    kind === "razor" ||
    kind === "scatter" ||
    kind === "artillery" ||
    kind === "apc" ||
    kind === "harvester" ||
    kind === "chinook" ||
    kind === "attackheli" ||
    kind === "bomber"
  ) {
    return kind;
  }
  return null;
}

const tintedRoofs = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();
const roofAnchors = new WeakMap<CanvasImageSource, { nx: number; ny: number }>();
const TINT_MAX_W = 320;

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function isRoofGray(r: number, g: number, b: number, a: number): boolean {
  if (a < 48) return false;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum >= 140 && Math.max(r, g, b) - Math.min(r, g, b) <= 50;
}

/** Light-gray roof and trim, tinted once per picture and seat color. */
function tintedRoof(img: CanvasImageSource, color: string): CanvasImageSource {
  if (typeof document === "undefined") return img;
  let byColor = tintedRoofs.get(img);
  if (!byColor) {
    byColor = new Map();
    tintedRoofs.set(img, byColor);
  }
  const cached = byColor.get(color);
  if (cached) return cached;
  const size = sourceSize(img);
  const scale = Math.min(1, TINT_MAX_W / Math.max(1, size.w));
  const cw = Math.max(1, Math.round(size.w * scale));
  const ch = Math.max(1, Math.round(size.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return img;
  c.drawImage(img, 0, 0, cw, ch);
  let data: ImageData;
  try {
    data = c.getImageData(0, 0, cw, ch);
  } catch {
    return img;
  }
  const px = data.data;
  const [tr, tg, tb] = hexRgb(color);
  let bestY = -1;
  const grayAt: number[] = [];
  for (let i = 0; i < px.length; i += 4) {
    if (!isRoofGray(px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!)) continue;
    const p = i >> 2;
    const py = (p / cw) | 0;
    if (py > bestY) bestY = py;
    grayAt.push(p);
  }
  if (!roofAnchors.has(img)) {
    let sx = 0;
    let sy = 0;
    let sn = 0;
    for (const p of grayAt) {
      const py = (p / cw) | 0;
      if (py < bestY - 2) continue;
      sx += p % cw;
      sy += py;
      sn++;
    }
    roofAnchors.set(img, sn > 0 ? { nx: sx / sn / cw, ny: sy / sn / ch } : { nx: 0.68, ny: 0.48 });
  }
  for (const p of grayAt) {
    const i = p << 2;
    px[i] = px[i]! * 0.6 + tr * 0.4;
    px[i + 1] = px[i + 1]! * 0.6 + tg * 0.4;
    px[i + 2] = px[i + 2]! * 0.6 + tb * 0.4;
  }
  c.putImageData(data, 0, 0);
  byColor.set(color, canvas);
  return canvas;
}

/** Front eave of the light-gray roof, in picture space. Nearest the camera. */
function roofFront(img: CanvasImageSource, color: string): { nx: number; ny: number } {
  tintedRoof(img, color);
  return roofAnchors.get(img) ?? { nx: 0.68, ny: 0.48 };
}

function hallBadgeWorld(b: Building, img: CanvasImageSource, color: string): { x: number; y: number } {
  const { nx, ny } = roofFront(img, color);
  const wide = Math.max(b.w, b.h) * hallDrawMul(b.kind);
  const size = sourceSize(img);
  const aspect = size.h / Math.max(1, size.w);
  const imgH = wide * aspect;
  const footX = b.tx + b.w / 2;
  const footY = b.ty + b.h - 0.02;
  return {
    x: footX + (nx - 0.5) * wide,
    y: footY + ((ny - 1) * imgH) / viewPitch(),
  };
}

/** Push a screen badge below a health bar when the two would overlap. */
function clearOfBar(x: number, y: number, r: number, barX: number, barY: number, barW: number, barH: number): number {
  const left = barX - barW / 2 - 1;
  const right = barX + barW / 2 + 1;
  const top = barY - 1;
  const bottom = barY + barH + 1;
  const hit = x + r > left && x - r < right && y + r > top && y - r < bottom;
  return hit ? bottom + r + 2 : y;
}

/** Filled seat shape. Field badges carry a 2 px dark outline so the color is not the only tell. Size is in screen pixels. */
export function paintTeamShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  shape: TeamShape,
  line = 2,
) {
  const edge = Math.max(1, size / 2 - line / 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  if (shape === "circle") ctx.arc(0, 0, edge, 0, Math.PI * 2);
  else if (shape === "square") ctx.rect(-edge, -edge, edge * 2, edge * 2);
  else if (shape === "diamond") {
    ctx.moveTo(0, -edge);
    ctx.lineTo(edge, 0);
    ctx.lineTo(0, edge);
    ctx.lineTo(-edge, 0);
    ctx.closePath();
  } else {
    ctx.moveTo(0, -edge);
    ctx.lineTo(edge * 0.92, edge);
    ctx.lineTo(-edge * 0.92, edge);
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = "#1a1510";
  ctx.lineWidth = line;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Screen-space seat marks. Constant size, above health bars, not a hit target. */
function paintSeatBadges(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cam: Camera,
  view: View,
  alpha: number,
  ui: DrawUi,
) {
  const a = Math.max(0, Math.min(1, alpha));
  const pad = HALL_BADGE_PX;
  for (const u of sim.units) {
    if (u.hp <= 0 || !sim.visibleUnit(VIEWER, u)) continue;
    const x = u.px + (u.x - u.px) * a;
    const y = u.py + (u.y - u.py) * a;
    const o = airPictureOffset(u);
    const s = worldToScreen(cam, x + o.x, y + o.y, view);
    if (s.x < -pad || s.y < -pad || s.x > view.w + pad || s.y > view.h + pad) continue;
    const style = teamStyle(u.team);
    const barY = s.y - 18;
    const badgeY = barY - 1 - 2 - UNIT_BADGE_PX / 2;
    paintTeamShape(ctx, s.x, badgeY, UNIT_BADGE_PX, seatPaint(sim, u.team), style.shape);
  }
  for (const b of sim.buildings) {
    if (b.hp <= 0 || b.rubble > 0 || isFence(b.kind) || b.kind === "span") continue;
    if (!sim.buildingVisible(VIEWER, b) && b.team !== VIEWER) continue;
    const plate = hallPlate(b.kind);
    const img = plate ? iso()?.[plate] : undefined;
    const color = seatPaint(sim, b.team);
    const style = teamStyle(b.team);
    let sx: number;
    let sy: number;
    if (img) {
      const at = hallBadgeWorld(b, img, color);
      const s = worldToScreen(cam, at.x, at.y, view);
      sx = s.x;
      sy = s.y - 4;
    } else {
      const corners: [number, number][] = [
        [b.tx, b.ty],
        [b.tx + b.w, b.ty],
        [b.tx, b.ty + b.h],
        [b.tx + b.w, b.ty + b.h],
      ];
      let near = worldToScreen(cam, corners[0]![0], corners[0]![1], view);
      for (let i = 1; i < corners.length; i++) {
        const s = worldToScreen(cam, corners[i]![0], corners[i]![1], view);
        if (s.y > near.y) near = s;
      }
      const top = worldToScreen(cam, b.tx + b.w / 2, structureTop(b), view);
      sx = near.x;
      sy = near.y + (top.y - near.y) * 0.32;
    }
    const bar = worldToScreen(cam, b.tx + b.w / 2, structureTop(b), view);
    sy = clearOfBar(sx, sy, HALL_BADGE_PX / 2, bar.x, bar.y - 16, 44, 6);
    if (sx < -pad || sy < -pad || sx > view.w + pad || sy > view.h + pad) continue;
    paintTeamShape(ctx, sx, sy, HALL_BADGE_PX, color, style.shape);
  }
  if (ui.buildingId) {
    const b = sim.buildingById(ui.buildingId);
    if (b && (b.kind === "barracks" || b.kind === "factory" || b.kind === "dock" || b.kind === "helipad")) {
      const s = worldToScreen(cam, b.rallyX, b.rallyY, view);
      const style = teamStyle(b.team);
      paintTeamShape(ctx, s.x, s.y, UNIT_BADGE_PX, seatPaint(sim, b.team), style.shape);
    }
  }
}

function paintPlate(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  flip: boolean,
  _outline = false,
  cast: "unit" | "hall" = "unit",
  color = "#2EC4F0",
) {
  const plateSize = sourceSize(img);
  const aspect = plateSize.h / Math.max(1, plateSize.w);
  const h = w * aspect;
  const picture = cast === "hall" ? tintedRoof(img, color) : img;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -1 : 1, 1 / viewPitch());
  const o = Math.max(0.01, w * 0.018);
  ctx.save();
  ctx.filter = "brightness(0)";
  ctx.globalAlpha = 0.45;
  ctx.drawImage(picture, -w / 2, -h + o, w, h);
  ctx.restore();
  ctx.drawImage(picture, -w / 2, -h, w, h);
  ctx.restore();
}

/** Base ring under a troop, tinted 35% with the seat color. Selection is a white ring. */
function paintUnitMark(ctx: CanvasRenderingContext2D, x: number, y: number, wide: number, color: string, selected = false) {
  const rx = Math.max(0.34, wide * 0.72);
  const ry = Math.max(0.1, rx * 0.38);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(0.035, wide * 0.05);
  ctx.beginPath();
  ctx.ellipse(x, y + 0.02, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (selected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(0.045, wide * 0.055);
    ctx.beginPath();
    ctx.ellipse(x, y + 0.02, rx + 0.08, ry + 0.04, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: Building,
  color: string,
  selected: boolean,
  time = 0,
  low = false,
  sim?: Sim,
) {
  if (isFence(b.kind)) {
    if (sim) drawFence(ctx, b, color, selected, time, sim);
    return;
  }
  if (b.kind === "span") return;
  if (b.collapse > 0) {
    const t = 1 - Math.max(0, Math.min(1, b.collapse / 1.35));
    const footX = b.tx + b.w / 2;
    const footY = b.ty + b.h - 0.02;
    const wide = Math.max(b.w, b.h);
    ctx.save();
    ctx.translate(footX, footY);
    ctx.scale(1 + t * 0.2, Math.max(0.1, 1 - t * 0.9));
    ctx.translate(-footX, -footY);
    ctx.globalAlpha = Math.max(0.2, 1 - t * 0.85);
    ctx.fillStyle = "#4a3a2c";
    ctx.fillRect(b.tx + 0.12, b.ty + 0.35, Math.max(0.4, b.w - 0.24), Math.max(0.3, b.h - 0.5));
    ctx.fillStyle = color;
    ctx.fillRect(b.tx + 0.12, b.ty + b.h * 0.42, Math.max(0.4, b.w - 0.24), 0.16);
    ctx.restore();
    paintCollapse(ctx, b, footX, footY - 0.15, wide, time);
    return;
  }
  const plate = hallPlate(b.kind);
  const img = plate ? iso()?.[plate] : undefined;
  if (img) {
    const footX = b.tx + b.w / 2;
    const footY = b.ty + b.h - 0.02;
    const wide = Math.max(b.w, b.h) * hallDrawMul(b.kind);
    ctx.fillStyle = "rgba(20, 16, 10, 0.2)";
    ctx.beginPath();
    ctx.ellipse(footX + 0.26, footY + 0.2, wide * 0.34, wide * 0.09, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = low && b.complete ? 0.62 : 1;
    if (!b.complete) {
      const p = Math.max(0.08, 1 - b.buildLeft / Math.max(0.01, b.buildTotal));
      const hallSize = sourceSize(img);
      const aspect = hallSize.h / Math.max(1, hallSize.w);
      const h = (wide * aspect) / viewPitch();
      ctx.save();
      ctx.beginPath();
      ctx.rect(footX - wide / 2, footY - h * p, wide, h * p + 0.08);
      ctx.clip();
      paintPlate(ctx, img, footX, footY, wide, false, true, "hall", color);
      ctx.restore();
    } else {
      paintPlate(ctx, img, footX, footY, wide, false, true, "hall", color);
    }
    ctx.globalAlpha = 1;
    paintStructureHurt(ctx, b, footX, footY, wide, time);
    if (selected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.ellipse(footX, footY, Math.max(0.35, b.w * 0.42), Math.max(0.14, b.h * 0.16), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }
  paintSolidBuilding(ctx, b, color, selected, time, THEATER === "snow", low);
  paintStructureHurt(ctx, b, b.tx + b.w / 2, b.ty + b.h * 0.45, Math.max(b.w, b.h), time);
}

/** Damage stages. Procedural fire and smoke. No texture, no magenta. */
function paintStructureHurt(
  ctx: CanvasRenderingContext2D,
  b: Building,
  x: number,
  y: number,
  wide: number,
  time: number,
) {
  if (!b.complete || b.maxHp <= 0 || isFence(b.kind) || b.kind === "span") return;
  if (b.collapse > 0) {
    paintCollapse(ctx, b, x, y, wide, time);
    return;
  }
  if (b.rubble > 0 || b.hp <= 0) return;
  const frac = b.hp / b.maxHp;
  if (frac >= 0.66) return;
  ctx.save();
  if (frac < 0.66) {
    ctx.globalAlpha = 0.18 + (0.66 - frac) * 0.4;
    ctx.fillStyle = "rgba(20, 16, 12, 0.55)";
    ctx.beginPath();
    ctx.ellipse(x, y - wide * 0.15, wide * 0.42, wide * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const light = frac >= 0.33;
  const points = light ? 2 : 4;
  if (!light) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.04 + 0.02 * Math.sin(time * 2 + b.id));
    ctx.translate(-x, -y);
  }
  for (let i = 0; i < points; i++) {
    const ox = (i - (points - 1) / 2) * wide * 0.22;
    const oy = -wide * (0.35 + (i % 2) * 0.12);
    paintSmoke(ctx, x + ox, y + oy, wide * (light ? 0.14 : 0.22), time + i * 0.7, light);
    if (!light) {
      paintFlame(ctx, x + ox, y + oy + wide * 0.08, wide * 0.16, time + i);
      if (Math.sin(time * 9 + i) > 0.6) {
        ctx.fillStyle = "#fff6d0";
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x + ox + 0.04, y + oy - 0.1, 0.04, 0.04);
        ctx.globalAlpha = 1;
      }
    }
  }
  if (!light) ctx.restore();
  ctx.restore();
}

function paintSmoke(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, light: boolean) {
  const rise = (time * 0.4) % 1;
  ctx.save();
  ctx.globalAlpha = (light ? 0.35 : 0.55) * (1 - rise * 0.6);
  ctx.fillStyle = light ? "rgba(70, 70, 74, 0.7)" : "rgba(28, 26, 24, 0.85)";
  ctx.beginPath();
  ctx.arc(x + Math.sin(time * 1.3) * r * 0.3, y - rise * r * 2.2, r * (0.7 + rise * 0.6), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintFlame(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, time: number) {
  const flick = 0.75 + 0.25 * Math.sin(time * 11);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#e25822";
  ctx.beginPath();
  ctx.moveTo(x - h * 0.35, y);
  ctx.quadraticCurveTo(x - h * 0.1, y - h * flick, x, y - h * 1.3 * flick);
  ctx.quadraticCurveTo(x + h * 0.1, y - h * flick, x + h * 0.35, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffe7a0";
  ctx.beginPath();
  ctx.moveTo(x - h * 0.15, y);
  ctx.quadraticCurveTo(x, y - h * 0.7 * flick, x + h * 0.15, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintCollapse(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number, wide: number, time: number) {
  const t = 1 - b.collapse / 1.35;
  ctx.save();
  ctx.globalAlpha = 0.55 + t * 0.35;
  ctx.fillStyle = "rgba(90, 78, 62, 0.75)";
  ctx.beginPath();
  ctx.ellipse(x, y + t * 0.45, wide * (0.55 + t * 0.35), wide * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8 + time * 2;
    const d = wide * (0.15 + t * 0.55);
    ctx.fillStyle = i % 2 ? "#6a5644" : "#2e261f";
    ctx.fillRect(x + Math.cos(a) * d - 0.1, y + Math.sin(a) * d * 0.45 - t * 0.35, 0.22, 0.12);
  }
  paintSmoke(ctx, x - wide * 0.2, y - wide * 0.35, wide * 0.42, time, false);
  paintSmoke(ctx, x + wide * 0.18, y - wide * 0.2, wide * 0.36, time + 0.6, false);
  ctx.restore();
}

function paintCaptureRing(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number) {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(x, y, 0.35, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function rubbleSeen(sim: Sim, b: Building): boolean {
  const fog = sim.fog[VIEWER];
  if (!fog) return true;
  for (let y = b.ty; y < b.ty + b.h; y++) {
    for (let x = b.tx; x < b.tx + b.w; x++) {
      if (x < 0 || y < 0 || x >= sim.gw || y >= sim.gh) continue;
      if ((fog[y * sim.gw + x] ?? 0) !== 0) return true;
    }
  }
  return false;
}

function paintRubble(ctx: CanvasRenderingContext2D, b: Building) {
  const x0 = b.tx + 0.08;
  const y0 = b.ty + 0.12;
  ctx.save();
  ctx.fillStyle = "rgba(36, 28, 22, 0.72)";
  ctx.fillRect(x0, y0, Math.max(0.6, b.w - 0.16), Math.max(0.5, b.h - 0.2));
  ctx.strokeStyle = "#8a7060";
  ctx.lineWidth = 0.06;
  ctx.strokeRect(x0, y0, Math.max(0.6, b.w - 0.16), Math.max(0.5, b.h - 0.2));
  ctx.fillStyle = "#5c4638";
  for (let i = 0; i < 8; i++) {
    const ox = ((i * 37) % 9) * b.w * 0.08;
    const oy = ((i * 19) % 7) * b.h * 0.09;
    ctx.fillRect(b.tx + 0.2 + ox, b.ty + 0.25 + oy, 0.28 + (i % 3) * 0.08, 0.16);
  }
  ctx.fillStyle = "#2a211c";
  ctx.fillRect(b.tx + 0.3, b.ty + b.h * 0.55, Math.max(0.4, b.w * 0.45), 0.14);
  ctx.restore();
}

/** 0 on the pad, 1 in flight. The gap between picture and shadow is the altitude cue. */
function airLift(u: Unit): number {
  if (u.rearm > 0) return 0;
  if (u.order.t === "rearm") return 0.42;
  return 1;
}

function airPictureOffset(u: Unit): { x: number; y: number } {
  if (u.loco !== "air") return { x: 0, y: 0 };
  const lift = airLift(u);
  return { x: -0.52 * lift, y: -0.7 * lift };
}

function drawAirShadow(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, color = "#2EC4F0") {
  const lift = airLift(u);
  const span = unitWorldSpan(u.kind);
  const ox = x + 0.16 + 0.42 * lift;
  const oy = y + 0.16 + 0.55 * lift;
  const rx = span * 0.38 * (0.72 + 0.28 * lift);
  const ry = rx * 0.42;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(ox, oy, rx * 1.35, ry * 1.45, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(4,6,8,${0.4 + 0.2 * lift})`;
  ctx.beginPath();
  ctx.ellipse(ox, oy, rx, ry, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.ellipse(x, y + 0.04, Math.max(0.28, span * 0.42), Math.max(0.1, span * 0.16), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  u: Unit,
  x: number,
  y: number,
  color: string,
  selected: boolean,
  time = 0,
  aim = u.facing,
  leaf = false,
  zoom = 48,
  _zoomOut = 46,
) {
  const moving = Math.hypot(u.x - u.px, u.y - u.py) > 0.004;
  const plate = unitPlate(u.kind);
  const img = plate ? iso()?.[plate] : undefined;
  const unitSize = img ? sourceSize(img) : null;
  const aspect = unitSize && unitSize.w > 0 ? unitSize.h / Math.max(1, unitSize.w) : 1;
  const wide = img ? unitPictureWidth(u.kind, aspect) : unitWorldSpan(u.kind);
  const ground = u.loco !== "air";
  if (ground) {
    ctx.fillStyle = "rgba(20, 16, 10, 0.18)";
    ctx.beginPath();
    ctx.ellipse(x + 0.08, y + 0.06, wide * 0.34, wide * 0.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
    paintUnitMark(ctx, x, y + 0.04, wide, color, selected);
  }
  // The battle camera stays close. A dot is only for a sprite that would
  // be smaller than a finger-tip, which this zoom range does not reach.
  if (wide * zoom < 8) {
    if (leaf) paintLeaf(ctx, x, y);
    return;
  }
  if (img) {
    paintPlate(ctx, img, x, y + 0.04, wide, Math.cos(aim) < -0.15, true, "unit", color);
    if (leaf) paintLeaf(ctx, x, y);
    return;
  }
  paintSolidUnit(ctx, u, x, y, color, selected, time, aim, moving, THEATER === "snow", VIEWER);
  if (selected) paintUnitMark(ctx, x, y + 0.04, wide, color, true);
}

function paintLeaf(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y - 0.42);
  ctx.strokeStyle = "rgba(186, 220, 110, 0.9)";
  ctx.fillStyle = "rgba(42, 110, 48, 0.4)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.ellipse(-0.16, 0.02, 0.1, 0.05, -0.7, 0, Math.PI * 2);
  ctx.ellipse(0.14, -0.06, 0.09, 0.045, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawWake(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, frame: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.fillStyle = "rgba(210,236,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(-0.15, 0);
  ctx.lineTo(-1.15 - frame * 0.04, 0.34);
  ctx.lineTo(-0.85, 0);
  ctx.lineTo(-1.15 - frame * 0.04, -0.34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(245,252,255,0.9)";
  ctx.lineWidth = 0.055;
  for (let i = 1; i <= 4; i++) {
    const back = -0.28 - i * 0.2 - frame * 0.03;
    const spread = 0.06 + i * 0.07;
    ctx.beginPath();
    ctx.moveTo(back, -spread);
    ctx.lineTo(back + 0.22, 0);
    ctx.lineTo(back, spread);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoat(ctx: CanvasRenderingContext2D, u: Unit, color: string) {
  const wide = u.kind === "frigate" || u.kind === "transport";
  const beam = wide ? 0.28 : 0.18;
  const len = u.kind === "frigate" ? 0.72 : 0.52;
  ctx.fillStyle = shade(color, 0.82);
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(-len * 0.72, beam);
  ctx.lineTo(-len, beam * 0.55);
  ctx.lineTo(-len, -beam * 0.55);
  ctx.lineTo(-len * 0.72, -beam);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (u.kind === "missile") {
    ctx.fillStyle = "#1c1914";
    ctx.fillRect(-0.02, -0.09, 0.38, 0.06);
    ctx.fillRect(-0.02, 0.03, 0.38, 0.06);
  } else if (u.kind === "transport") {
    ctx.fillStyle = shade(color, 1.12);
    ctx.fillRect(-0.18, -0.14, 0.46, 0.28);
    ctx.strokeRect(-0.18, -0.14, 0.46, 0.28);
  } else {
    ctx.fillStyle = "#1c1914";
    ctx.fillRect(0.05, -0.05, u.kind === "frigate" ? 0.42 : 0.26, 0.1);
  }
}

function drawAir(ctx: CanvasRenderingContext2D, u: Unit, color: string, time: number) {
  ctx.fillStyle = color;
  if (u.kind === "chinook") {
    ctx.fillRect(-0.46, -0.16, 0.92, 0.32);
    ctx.strokeRect(-0.46, -0.16, 0.92, 0.32);
    ctx.fillStyle = shade(color, 0.7);
    ctx.fillRect(-0.1, -0.1, 0.28, 0.2);
  } else if (u.kind === "bomber") {
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(-0.1, 0.46);
    ctx.lineTo(-0.32, 0.12);
    ctx.lineTo(-0.32, -0.12);
    ctx.lineTo(-0.1, -0.46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(-0.16, 0.18);
    ctx.lineTo(-0.46, 0.07);
    ctx.lineTo(-0.46, -0.07);
    ctx.lineTo(-0.16, -0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(0.08, -0.04, 0.26, 0.08);
  }
  ctx.save();
  ctx.rotate(-u.facing + time * 18);
  ctx.strokeStyle = "rgba(12,10,8,0.75)";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.58, 0);
  ctx.lineTo(0.58, 0);
  ctx.moveTo(0, -0.58);
  ctx.lineTo(0, 0.58);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(20,18,16,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.52, 0.14, time * 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawArmor(ctx: CanvasRenderingContext2D, u: Unit, color: string, frame: number) {
  const heavy = u.kind === "medium";
  ctx.fillStyle = "#16120e";
  ctx.fillRect(-0.52, heavy ? -0.36 : -0.3, 1.04, 0.16);
  ctx.fillRect(-0.52, heavy ? 0.2 : 0.14, 1.04, 0.16);
  ctx.fillStyle = "#3a3228";
  const shift = frame * 0.05;
  for (let i = 0; i < 4; i++) {
    const tx = -0.42 + ((i * 0.22 + shift) % 0.84);
    ctx.fillRect(tx, heavy ? -0.34 : -0.28, 0.06, 0.12);
    ctx.fillRect(tx, heavy ? 0.22 : 0.16, 0.06, 0.12);
  }
  ctx.fillStyle = color;
  const bw = heavy ? 0.86 : 0.74;
  const bh = heavy ? 0.48 : 0.36;
  ctx.fillRect(-bw / 2 + 0.04, -bh / 2, bw, bh);
  ctx.strokeRect(-bw / 2 + 0.04, -bh / 2, bw, bh);
  ctx.fillStyle = "#1c1914";
  ctx.fillRect(0.16, -0.045, u.kind === "artillery" ? 0.72 : 0.38, u.kind === "artillery" ? 0.07 : 0.1);
  if (u.kind === "apc") {
    ctx.fillStyle = shade(color, 1.15);
    ctx.fillRect(-0.08, -0.12, 0.3, 0.24);
    ctx.strokeRect(-0.08, -0.12, 0.3, 0.24);
  }
}

const miniIds = new WeakMap<Sim, number>();
let miniSeq = 1;
let miniSheet: { key: string; canvas: HTMLCanvasElement } | null = null;

/** One pixel per tile, rebuilt on the sim tick — not once per frame. */
function minimapSheet(sim: Sim): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  let id = miniIds.get(sim);
  if (!id) {
    id = miniSeq++;
    miniIds.set(sim, id);
  }
  let sig = sim.buildings.length;
  for (const b of sim.buildings) {
    sig = Math.imul(sig, 16777619) ^ (b.id + (b.hp | 0) + b.tx + (b.neutral ? 64 : 0) + (b.complete ? 3 : 0));
  }
  const key = `${id}|${(sim.time * 10) | 0}|${sig}`;
  if (miniSheet?.key === key) return miniSheet.canvas;
  const canvas = miniSheet?.canvas ?? document.createElement("canvas");
  if (canvas.width !== sim.gw || canvas.height !== sim.gh) {
    canvas.width = sim.gw;
    canvas.height = sim.gh;
  }
  const g = canvas.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(sim.gw, sim.gh);
  const d = img.data;
  const fog = sim.fog[VIEWER];
  const n = sim.gw * sim.gh;
  for (let i = 0; i < n; i++) {
    const f = fog?.[i] ?? 0;
    const x = i % sim.gw;
    const y = (i / sim.gw) | 0;
    const [r, gc, b] = miniRgb(sim.terrain[i] ?? 0, f === 2 ? (sim.crystal[i] ?? 0) : 0, 2, x, y);
    const dim = f === 2 ? 1 : f === 1 ? 0.92 : 0.84;
    const o = i * 4;
    d[o] = r * dim;
    d[o + 1] = gc * dim;
    d[o + 2] = b * dim;
    d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (const b of sim.buildings) {
    if (b.hp <= 0 || !sim.buildingVisible(VIEWER, b)) continue;
    g.fillStyle = seatPaint(sim, b.team);
    g.fillRect(b.tx, b.ty, Math.max(1, b.w), Math.max(1, b.h));
  }
  miniSheet = { key, canvas };
  return canvas;
}

function seatAtCorner(sim: Sim, x: number, y: number): number {
  let best = -1;
  let bestD = 14 * 14;
  const slots = sim.starts.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s) continue;
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

let fogVeil: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Gray multiply mask. The terrain picture stays visible under the fog. */
function minimapFogVeil(sim: Sim): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${sim.gw}x${sim.gh}|${(sim.time * 4) | 0}|${VIEWER}`;
  if (fogVeil?.key === key) return fogVeil.canvas;
  const canvas = fogVeil?.canvas ?? document.createElement("canvas");
  if (canvas.width !== sim.gw) canvas.width = sim.gw;
  if (canvas.height !== sim.gh) canvas.height = sim.gh;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const w = sim.gw;
  const h = sim.gh;
  const n = w * h;
  const src = new Float32Array(n);
  const fog = sim.fog[VIEWER];
  for (let i = 0; i < n; i++) {
    const f = fog?.[i] ?? 0;
    src[i] = f === 2 ? 255 : f === 1 ? 236 : 214;
  }
  const tmp = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let k = -1; k <= 1; k++) {
        s += src[y * w + Math.max(0, Math.min(w - 1, x + k))] ?? 0;
        c++;
      }
      tmp[y * w + x] = s / c;
    }
  }
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let k = -1; k <= 1; k++) {
        s += tmp[Math.max(0, Math.min(h - 1, y + k)) * w + x] ?? 0;
        c++;
      }
      const v = s / c;
      const o = (y * w + x) * 4;
      d[o] = v;
      d[o + 1] = v;
      d[o + 2] = v;
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  fogVeil = { key, canvas };
  return canvas;
}

function paintMiniRoutes(ctx: CanvasRenderingContext2D, sim: Sim, ox: number, oy: number, cell: number) {
  const fog = sim.fog[VIEWER];
  for (let y = 0; y < sim.gh; y++) {
    for (let x = 0; x < sim.gw; x++) {
      const i = y * sim.gw + x;
      const t = sim.terrain[i] ?? 0;
      let color = "";
      if (t === TILE_BRIDGE) color = "#c4a06a";
      else if (t === TILE_ROAD) color = "#8d6840";
      else if (t === TILE_HIGH) color = "#e4dcc8";
      else if (t === TILE_CLIFF) color = "#5c5348";
      else if (t === TILE_RAMP) color = "#b08a58";
      else continue;
      const f = fog?.[i] ?? 0;
      ctx.globalAlpha = f === 2 ? 1 : f === 1 ? 0.72 : 0.38;
      ctx.fillStyle = color;
      const pad = t === TILE_ROAD ? 0.35 : 0.45;
      ctx.fillRect(ox + x * cell, oy + y * cell, cell + pad, cell + pad);
    }
  }
  ctx.globalAlpha = 1;
}

function paintEnemySpawns(ctx: CanvasRenderingContext2D, sim: Sim, r: { x: number; y: number; s: number }) {
  // 1v1 and skirmish: every enemy start is a red marker from the first second, fog or not.
  const slots = sim.starts.slots;
  for (let t = 0; t < slots.length; t++) {
    if (t === VIEWER || sim.allied(VIEWER, t)) continue;
    const s = slots[t];
    if (!s) continue;
    const cx = r.x + (s.x / Math.max(1, sim.gw)) * r.s;
    const cy = r.y + (s.y / Math.max(1, sim.gh)) * r.s;
    const rad = 6.5;
    ctx.save();
    ctx.fillStyle = "#d63428";
    ctx.strokeStyle = "#fff6ea";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy - rad);
    ctx.lineTo(cx + rad * 0.82, cy);
    ctx.lineTo(cx, cy + rad);
    ctx.lineTo(cx - rad * 0.82, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cam: Camera,
  view: View,
  ground?: CanvasImageSource | null,
  relief?: CanvasImageSource | null,
) {
  const r = minimapRect(view, wideField(sim.mapSize));
  const veil = view.h < 500 && view.w > view.h;
  if (veil) {
    ctx.save();
    ctx.globalAlpha = 0.78;
  }
  ctx.fillStyle = veil ? "rgba(16,14,12,0.72)" : "#100e0c";
  ctx.fillRect(r.x - 4, r.y - 4, r.s + 8, r.s + 8);
  ctx.strokeStyle = "#c6a56a";
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x - 4, r.y - 4, r.s + 8, r.s + 8);
  const cell = r.s / sim.gw;
  const fog = sim.fog[VIEWER];
  if (!ground && relief) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(relief, r.x, r.y, r.s, r.s);
    const shade = minimapFogVeil(sim);
    if (shade) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shade, r.x, r.y, r.s, r.s);
      ctx.restore();
    }
    for (let y = 0; y < sim.gh; y++) {
      for (let x = 0; x < sim.gw; x++) {
        const i = y * sim.gw + x;
        if ((fog[i] ?? 0) === 0 || (sim.crystal[i] ?? 0) <= 0) continue;
        ctx.fillStyle = "#3dcc6e";
        ctx.fillRect(r.x + x * cell, r.y + y * cell, Math.max(1.5, cell), Math.max(1.5, cell));
      }
    }
    for (const b of sim.buildings) {
      if (b.hp <= 0 || !sim.buildingVisible(VIEWER, b)) continue;
      ctx.fillStyle = seatPaint(sim, b.team);
      ctx.fillRect(r.x + b.tx * cell, r.y + b.ty * cell, Math.max(2, b.w * cell), Math.max(2, b.h * cell));
    }
  } else {
  const sheet = ground ? null : minimapSheet(sim);
  if (sheet) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sheet, r.x, r.y, r.s, r.s);
  } else {
    const fog = sim.fog[VIEWER];
    if (ground) ctx.drawImage(ground, r.x, r.y, r.s, r.s);
    for (let y = 0; y < sim.gh; y++) {
      for (let x = 0; x < sim.gw; x++) {
        const i = y * sim.gw + x;
        const t = sim.terrain[i];
        const seen = (fog[i] ?? 0) === 2;
        if (!ground) {
          ctx.fillStyle = miniTone(t, (fog[i] ?? 0) === 2 ? sim.crystal[i] : 0, 2);
          ctx.fillRect(r.x + x * cell, r.y + y * cell, cell + 0.3, cell + 0.3);
        } else if (seen && sim.crystal[i] > 0) {
          ctx.fillStyle = "#3dcc6e";
          ctx.fillRect(r.x + x * cell, r.y + y * cell, cell + 0.3, cell + 0.3);
        } else if (seen && t === TILE_ROCK) {
          ctx.fillStyle = "rgba(20,16,12,0.75)";
          ctx.fillRect(r.x + x * cell, r.y + y * cell, cell + 0.3, cell + 0.3);
        }
      }
    }
    for (const b of sim.buildings) {
      if (b.hp <= 0 || !sim.buildingVisible(VIEWER, b)) continue;
      ctx.fillStyle = seatPaint(sim, b.team);
      ctx.fillRect(r.x + b.tx * cell, r.y + b.ty * cell, Math.max(2, b.w * cell), Math.max(2, b.h * cell));
    }
  }
  }
  paintMiniRoutes(ctx, sim, r.x, r.y, cell);
  for (const c of sim.starts.corners) {
    const seat = seatAtCorner(sim, c.x, c.y);
    const cx = r.x + c.x * cell;
    const cy = r.y + c.y * cell;
    if (seat >= 0) paintTeamShape(ctx, cx, cy, 6, seatPaint(sim, seat), teamStyle(seat).shape, 1);
    else {
      ctx.fillStyle = "rgba(237,230,217,0.45)";
      ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
      ctx.strokeStyle = "#100e0c";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 2.5, cy - 2.5, 5, 5);
    }
  }
  for (const u of sim.units) {
    if (!sim.minimapUnit(VIEWER, u)) continue;
    const cx = r.x + u.x * cell;
    const cy = r.y + u.y * cell;
    const foe = !sim.allied(u.team, VIEWER);
    const combat = foe && u.damage > 0 && u.kind !== "harvester";
    const dot = combat ? 7 : 5;
    paintTeamShape(ctx, cx, cy, dot, seatPaint(sim, u.team), teamStyle(u.team).shape, 1);
  }
  for (const c of sim.crates) {
    if (c.x < 0) continue;
    const cx = r.x + c.x * cell;
    const cy = r.y + c.y * cell;
    ctx.fillStyle = c.kind === "mend" ? "#8fd9b0" : c.kind === "squad" ? "#e2c27a" : "#3dcc6e";
    ctx.fillRect(cx - 1.7, cy - 1.7, 3.4, 3.4);
    ctx.strokeStyle = "#100e0c";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(cx - 1.7, cy - 1.7, 3.4, 3.4);
  }
  for (const g of sim.ghosts) {
    if (g.viewer !== VIEWER || g.ttl <= 0) continue;
    const live = sim.unitById(g.id);
    if (live && live.hp > 0 && sim.minimapUnit(VIEWER, live)) continue;
    ctx.fillStyle = "rgba(224,122,85,0.7)";
    ctx.fillRect(r.x + g.x * cell - 1.4, r.y + g.y * cell - 1.4, 2.8, 2.8);
  }
  for (const b of sim.buildings) {
    if (b.kind !== "yard" || b.team === VIEWER || b.hp <= 0) continue;
    if (!sim.buildingVisible(VIEWER, b)) continue;
    const cx = r.x + (b.tx + b.w / 2) * cell;
    const cy = r.y + (b.ty + b.h / 2) * cell;
    paintTeamShape(ctx, cx, cy, 9, seatPaint(sim, b.team), teamStyle(b.team).shape, 1);
    ctx.fillStyle = "#14110e";
    ctx.font = "8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("B", cx, cy + 2);
  }
  const alarm = sim.alarm[VIEWER];
  if (alarm && sim.time < alarm.until) {
    const pulse = 0.35 + 0.55 * Math.abs(Math.sin(sim.time * 8));
    ctx.strokeStyle = `rgba(214, 52, 40, ${pulse})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(r.x - 6, r.y - 6, r.s + 12, r.s + 12);
  }
  paintEnemySpawns(ctx, sim, r);
  const halfW = view.w / (2 * cam.zoom);
  const halfH = view.h / (2 * cam.zoom * viewPitch());
  ctx.strokeStyle = "#f3ead7";
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + (cam.x - halfW) * cell, r.y + (cam.y - halfH) * cell, halfW * 2 * cell, halfH * 2 * cell);
  if (veil) ctx.restore();
}
