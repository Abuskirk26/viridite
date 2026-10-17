/** Oblique solids. Footprints stay on the grid; height lifts the roof so a wall and a lit top read at phone zoom. */

/** Shared with the ground so a cliff and a building use one height. */
export const SOLID_SHEAR = 0.34;
export const SOLID_LIFT = 0.9;

const SHEAR = SOLID_SHEAR;
const LIFT = SOLID_LIFT;

type Mat = "concrete" | "metal" | "dark" | "roof" | "trim" | "glass" | "hazard" | "pad" | "glow";

type Part =
  | { t: "box"; u: number; v: number; du: number; dv: number; z0: number; z1: number; mat: Mat }
  | { t: "drum"; u: number; v: number; r: number; z0: number; z1: number; mat: Mat };

const TONES: Record<Mat, [string, string, string]> = {
  concrete: ["#b7b8b2", "#6e726c", "#8c9088"],
  metal: ["#9aa7ae", "#4e5c64", "#6d7c84"],
  dark: ["#5c646c", "#2a3138", "#3c454c"],
  roof: ["#6a737c", "#3a424a", "#505860"],
  trim: ["#d7c4a2", "#8a7048", "#b08960"],
  glass: ["#d5eee9", "#3f8f88", "#7ec8c0"],
  hazard: ["#e4c56a", "#8a6a28", "#c6a24a"],
  pad: ["#8b9298", "#3e464c", "#5c656c"],
  glow: ["#ffe7a8", "#e0a040", "#ffd27a"],
};

const SNOW_TOP: Partial<Record<Mat, string>> = {
  concrete: "#e7eef4",
  metal: "#d5e0e8",
  roof: "#f2f6f8",
  pad: "#dfe7ee",
  dark: "#c5d0d8",
};

function tones(mat: Mat, snow: boolean, trim: string): [string, string, string] {
  if (mat === "trim") {
    const side = hexMul(trim, 0.62);
    const front = hexMul(trim, 0.78);
    return [trim, front, side];
  }
  const base = TONES[mat];
  if (!snow || !SNOW_TOP[mat]) return base;
  return [SNOW_TOP[mat]!, base[1], base[2]];
}

function hexMul(hex: string, m: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = Math.max(0, Math.min(255, Math.round(parseInt(n.slice(0, 2), 16) * m)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(n.slice(2, 4), 16) * m)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(n.slice(4, 6), 16) * m)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function face(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(12,14,16,0.55)";
  ctx.lineWidth = 0.02;
  ctx.stroke();
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  d: number,
  z0: number,
  z1: number,
  top: string,
  front: string,
  side: string,
) {
  if (w <= 0.01 || d <= 0.01 || z1 <= z0) return;
  const ax = x + z0 * SHEAR;
  const ay = y - z0 * LIFT;
  const bx = x + w + z0 * SHEAR;
  const by = y - z0 * LIFT;
  const cx = x + w + z0 * SHEAR;
  const cy = y + d - z0 * LIFT;
  const dx = x + z0 * SHEAR;
  const dy = y + d - z0 * LIFT;
  const ax1 = x + z1 * SHEAR;
  const ay1 = y - z1 * LIFT;
  const bx1 = x + w + z1 * SHEAR;
  const by1 = y - z1 * LIFT;
  const cx1 = x + w + z1 * SHEAR;
  const cy1 = y + d - z1 * LIFT;
  const dx1 = x + z1 * SHEAR;
  const dy1 = y + d - z1 * LIFT;
  face(ctx, ax, ay, dx, dy, dx1, dy1, ax1, ay1, side);
  face(ctx, dx, dy, cx, cy, cx1, cy1, dx1, dy1, front);
  face(ctx, ax1, ay1, bx1, by1, cx1, cy1, dx1, dy1, top);
}

function drum(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  z0: number,
  z1: number,
  top: string,
  front: string,
) {
  const x0 = cx + z0 * SHEAR;
  const y0 = cy - z0 * LIFT;
  const x1 = cx + z1 * SHEAR;
  const y1 = cy - z1 * LIFT;
  ctx.fillStyle = front;
  ctx.beginPath();
  ctx.moveTo(x0 - r, y0);
  ctx.lineTo(x1 - r, y1);
  ctx.lineTo(x1 + r, y1);
  ctx.lineTo(x0 + r, y0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(x1, y1, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(12,14,16,0.45)";
  ctx.lineWidth = 0.02;
  ctx.stroke();
}

function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number) {
  ctx.fillStyle = "rgba(16, 22, 28, 0.38)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.55 + h * 0.12, y + d * 0.78, Math.max(0.2, w * 0.46), Math.max(0.08, d * 0.2), 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function yard(): Part[] {
  return [
    { t: "box", u: 0.06, v: 0.12, du: 0.5, dv: 0.72, z0: 0, z1: 0.95, mat: "concrete" },
    { t: "box", u: 0.56, v: 0.22, du: 0.36, dv: 0.56, z0: 0, z1: 0.52, mat: "metal" },
    { t: "box", u: 0.1, v: 0.78, du: 0.4, dv: 0.06, z0: 0.28, z1: 0.5, mat: "glass" },
    { t: "box", u: 0.08, v: 0.72, du: 0.42, dv: 0.08, z0: 0.9, z1: 1.02, mat: "trim" },
    { t: "box", u: 0.16, v: 0.04, du: 0.1, dv: 0.12, z0: 0, z1: 1.45, mat: "dark" },
    { t: "box", u: 0.16, v: 0.04, du: 0.62, dv: 0.08, z0: 1.32, z1: 1.42, mat: "hazard" },
    { t: "box", u: 0.6, v: 0.38, du: 0.28, dv: 0.22, z0: 0.52, z1: 0.6, mat: "dark" },
  ];
}

function power(): Part[] {
  return [
    { t: "box", u: 0.06, v: 0.28, du: 0.38, dv: 0.6, z0: 0, z1: 0.7, mat: "concrete" },
    { t: "box", u: 0.5, v: 0.28, du: 0.42, dv: 0.6, z0: 0, z1: 0.78, mat: "metal" },
    { t: "drum", u: 0.24, v: 0.22, r: 0.16, z0: 0.7, z1: 1.35, mat: "metal" },
    { t: "drum", u: 0.7, v: 0.2, r: 0.18, z0: 0.78, z1: 1.55, mat: "metal" },
    { t: "box", u: 0.08, v: 0.72, du: 0.34, dv: 0.08, z0: 0.7, z1: 0.8, mat: "trim" },
    { t: "box", u: 0.66, v: 0.16, du: 0.08, dv: 0.08, z0: 1.5, z1: 1.62, mat: "glow" },
  ];
}

function refinery(): Part[] {
  return [
    { t: "box", u: 0.05, v: 0.4, du: 0.42, dv: 0.5, z0: 0, z1: 0.72, mat: "concrete" },
    { t: "drum", u: 0.68, v: 0.38, r: 0.2, z0: 0, z1: 1.05, mat: "metal" },
    { t: "drum", u: 0.68, v: 0.72, r: 0.16, z0: 0, z1: 0.82, mat: "hazard" },
    { t: "box", u: 0.4, v: 0.48, du: 0.22, dv: 0.16, z0: 0.4, z1: 0.55, mat: "dark" },
    { t: "box", u: 0.08, v: 0.42, du: 0.36, dv: 0.08, z0: 0.72, z1: 0.82, mat: "trim" },
  ];
}

function barracks(): Part[] {
  return [
    { t: "box", u: 0.06, v: 0.28, du: 0.88, dv: 0.58, z0: 0, z1: 0.62, mat: "concrete" },
    { t: "box", u: 0.06, v: 0.22, du: 0.88, dv: 0.16, z0: 0.62, z1: 0.92, mat: "roof" },
    { t: "box", u: 0.14, v: 0.8, du: 0.28, dv: 0.06, z0: 0.22, z1: 0.4, mat: "glass" },
    { t: "box", u: 0.5, v: 0.8, du: 0.28, dv: 0.06, z0: 0.22, z1: 0.4, mat: "glass" },
    { t: "box", u: 0.1, v: 0.74, du: 0.76, dv: 0.08, z0: 0.5, z1: 0.6, mat: "trim" },
    { t: "box", u: 0.42, v: 0.18, du: 0.08, dv: 0.08, z0: 0.92, z1: 1.25, mat: "dark" },
  ];
}

function factory(): Part[] {
  return [
    { t: "box", u: 0.05, v: 0.18, du: 0.9, dv: 0.68, z0: 0, z1: 0.78, mat: "metal" },
    { t: "box", u: 0.12, v: 0.08, du: 0.22, dv: 0.16, z0: 0.78, z1: 1.05, mat: "concrete" },
    { t: "box", u: 0.4, v: 0.08, du: 0.22, dv: 0.16, z0: 0.78, z1: 1.02, mat: "concrete" },
    { t: "box", u: 0.68, v: 0.08, du: 0.2, dv: 0.16, z0: 0.78, z1: 0.98, mat: "concrete" },
    { t: "box", u: 0.16, v: 0.78, du: 0.22, dv: 0.06, z0: 0.28, z1: 0.48, mat: "glass" },
    { t: "box", u: 0.46, v: 0.78, du: 0.22, dv: 0.06, z0: 0.28, z1: 0.48, mat: "glass" },
    { t: "box", u: 0.08, v: 0.2, du: 0.84, dv: 0.08, z0: 0.78, z1: 0.88, mat: "trim" },
  ];
}

function tower(): Part[] {
  return [
    { t: "box", u: 0.22, v: 0.28, du: 0.56, dv: 0.56, z0: 0, z1: 0.28, mat: "concrete" },
    { t: "box", u: 0.32, v: 0.36, du: 0.36, dv: 0.36, z0: 0.28, z1: 0.95, mat: "dark" },
    { t: "box", u: 0.18, v: 0.22, du: 0.64, dv: 0.5, z0: 0.95, z1: 1.18, mat: "metal" },
    { t: "box", u: 0.22, v: 0.28, du: 0.56, dv: 0.1, z0: 1.1, z1: 1.2, mat: "trim" },
    { t: "drum", u: 0.5, v: 0.42, r: 0.1, z0: 1.18, z1: 1.42, mat: "metal" },
  ];
}

function dock(): Part[] {
  return [
    { t: "box", u: 0.04, v: 0.35, du: 0.92, dv: 0.22, z0: 0, z1: 0.16, mat: "pad" },
    { t: "box", u: 0.08, v: 0.18, du: 0.55, dv: 0.42, z0: 0.16, z1: 0.7, mat: "concrete" },
    { t: "box", u: 0.62, v: 0.22, du: 0.12, dv: 0.12, z0: 0.16, z1: 1.15, mat: "dark" },
    { t: "box", u: 0.62, v: 0.22, du: 0.3, dv: 0.08, z0: 1.02, z1: 1.12, mat: "hazard" },
    { t: "box", u: 0.1, v: 0.22, du: 0.4, dv: 0.08, z0: 0.7, z1: 0.8, mat: "trim" },
  ];
}

function helipad(): Part[] {
  return [
    { t: "box", u: 0.04, v: 0.28, du: 0.62, dv: 0.62, z0: 0, z1: 0.1, mat: "pad" },
    { t: "box", u: 0.28, v: 0.48, du: 0.08, dv: 0.28, z0: 0.1, z1: 0.16, mat: "hazard" },
    { t: "box", u: 0.2, v: 0.58, du: 0.28, dv: 0.08, z0: 0.1, z1: 0.16, mat: "hazard" },
    { t: "box", u: 0.66, v: 0.18, du: 0.28, dv: 0.55, z0: 0, z1: 0.85, mat: "metal" },
    { t: "box", u: 0.7, v: 0.12, du: 0.2, dv: 0.12, z0: 0.85, z1: 1.15, mat: "concrete" },
    { t: "box", u: 0.66, v: 0.55, du: 0.28, dv: 0.08, z0: 0.85, z1: 0.95, mat: "trim" },
  ];
}

function aa(): Part[] {
  return [
    { t: "box", u: 0.18, v: 0.3, du: 0.64, dv: 0.55, z0: 0, z1: 0.32, mat: "concrete" },
    { t: "box", u: 0.3, v: 0.38, du: 0.4, dv: 0.36, z0: 0.32, z1: 0.62, mat: "metal" },
    { t: "box", u: 0.22, v: 0.42, du: 0.1, dv: 0.1, z0: 0.62, z1: 1.15, mat: "dark" },
    { t: "box", u: 0.68, v: 0.42, du: 0.1, dv: 0.1, z0: 0.62, z1: 1.15, mat: "dark" },
    { t: "box", u: 0.28, v: 0.34, du: 0.44, dv: 0.1, z0: 0.55, z1: 0.66, mat: "trim" },
  ];
}

function radar(): Part[] {
  return [
    { t: "box", u: 0.28, v: 0.4, du: 0.44, dv: 0.44, z0: 0, z1: 0.28, mat: "concrete" },
    { t: "box", u: 0.4, v: 0.5, du: 0.18, dv: 0.18, z0: 0.28, z1: 0.95, mat: "dark" },
    { t: "box", u: 0.18, v: 0.22, du: 0.55, dv: 0.16, z0: 0.88, z1: 1.02, mat: "metal" },
    { t: "drum", u: 0.5, v: 0.28, r: 0.22, z0: 1.02, z1: 1.12, mat: "glass" },
  ];
}

function supply(): Part[] {
  return [
    { t: "box", u: 0.08, v: 0.22, du: 0.84, dv: 0.62, z0: 0, z1: 0.7, mat: "concrete" },
    { t: "box", u: 0.2, v: 0.12, du: 0.22, dv: 0.22, z0: 0.7, z1: 1.05, mat: "hazard" },
    { t: "box", u: 0.55, v: 0.14, du: 0.22, dv: 0.2, z0: 0.7, z1: 0.98, mat: "metal" },
    { t: "box", u: 0.12, v: 0.68, du: 0.7, dv: 0.08, z0: 0.62, z1: 0.72, mat: "trim" },
  ];
}

function stealth(): Part[] {
  return [
    { t: "box", u: 0.12, v: 0.28, du: 0.76, dv: 0.58, z0: 0, z1: 0.22, mat: "dark" },
    { t: "box", u: 0.22, v: 0.34, du: 0.56, dv: 0.42, z0: 0.22, z1: 0.48, mat: "metal" },
    { t: "box", u: 0.34, v: 0.4, du: 0.32, dv: 0.28, z0: 0.48, z1: 0.66, mat: "glass" },
  ];
}

function hall(kind: string): Part[] {
  if (kind === "yard") return yard();
  if (kind === "power" || kind === "advpower") return power();
  if (kind === "refinery") return refinery();
  if (kind === "barracks") return barracks();
  if (kind === "factory") return factory();
  if (kind === "tower") return tower();
  if (kind === "dock") return dock();
  if (kind === "helipad") return helipad();
  if (kind === "aa") return aa();
  if (kind === "radar") return radar();
  if (kind === "supply" || kind === "silo") return supply();
  if (kind === "stealth") return stealth();
  return barracks();
}

function paintParts(
  ctx: CanvasRenderingContext2D,
  parts: Part[],
  x: number,
  y: number,
  w: number,
  d: number,
  grow: number,
  snow: boolean,
  trim: string,
) {
  for (const p of parts) {
    const z0 = p.z0 * grow;
    const z1 = p.z1 * grow;
    const [top, front, side] = tones(p.mat, snow, trim);
    if (p.t === "drum") {
      drum(ctx, x + p.u * w, y + p.v * d, p.r * Math.min(w, d), z0, z1, top, front);
    } else {
      box(ctx, x + p.u * w, y + p.v * d, p.du * w, p.dv * d, z0, z1, top, front, side);
    }
  }
}

export function paintSolidBuilding(
  ctx: CanvasRenderingContext2D,
  b: {
    kind: string;
    tx: number;
    ty: number;
    w: number;
    h: number;
    id: number;
    complete: boolean;
    buildLeft: number;
    buildTotal: number;
  },
  color: string,
  selected: boolean,
  time: number,
  snow: boolean,
  low: boolean,
) {
  const grow = b.complete ? 1 : 0.18 + 0.82 * (1 - b.buildLeft / Math.max(0.01, b.buildTotal));
  const parts = hall(b.kind);
  let peak = 0.4;
  for (const p of parts) peak = Math.max(peak, p.z1);
  groundShadow(ctx, b.tx, b.ty, b.w, b.h, peak * grow);
  ctx.save();
  if (!b.complete) ctx.globalAlpha = 0.55 + 0.45 * grow;
  paintParts(ctx, parts, b.tx, b.ty, b.w, b.h, grow, snow, color);
  ctx.restore();
  if ((b.kind === "power" || b.kind === "advpower" || b.kind === "refinery") && b.complete && !low) {
    const puff = (time * 0.35 + b.id) % 1;
    ctx.fillStyle = snow ? `rgba(230,236,240,${0.28 - puff * 0.2})` : `rgba(210,214,216,${0.22 - puff * 0.16})`;
    ctx.beginPath();
    ctx.arc(b.tx + b.w * 0.7 + puff * 0.15, b.ty - peak * LIFT - puff * 0.55, 0.12 + puff * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = selected ? "#f7f1e4" : color;
  ctx.globalAlpha = selected ? 0.95 : 0.45;
  ctx.lineWidth = selected ? 0.07 : 0.035;
  ctx.beginPath();
  ctx.ellipse(b.tx + b.w * 0.5, b.ty + b.h * 0.86, b.w * 0.5, Math.max(0.12, b.h * 0.16), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (low && b.complete && (b.kind === "tower" || b.kind === "aa" || b.kind === "radar")) {
    ctx.fillStyle = "rgba(8,10,12,0.35)";
    ctx.fillRect(b.tx, b.ty - peak * LIFT, b.w, b.h + peak * LIFT);
  }
}

function rot(x: number, y: number, lx: number, ly: number, f: number): [number, number] {
  const c = Math.cos(f);
  const s = Math.sin(f);
  return [x + lx * c - ly * s, y + lx * s + ly * c];
}

function vehBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: number,
  lx: number,
  ly: number,
  lw: number,
  ld: number,
  z0: number,
  z1: number,
  mat: Mat,
  snow: boolean,
  trim: string,
) {
  const [top, front, side] = tones(mat, snow, trim);
  const c = Math.cos(f);
  const s = Math.sin(f);
  const pts: [number, number][] = [
    [lx, ly],
    [lx + lw, ly],
    [lx + lw, ly + ld],
    [lx, ly + ld],
  ];
  const g = pts.map(([px, py]) => [x + px * c - py * s + z0 * SHEAR, y + px * s + py * c - z0 * LIFT] as [number, number]);
  const r = pts.map(([px, py]) => [x + px * c - py * s + z1 * SHEAR, y + px * s + py * c - z1 * LIFT] as [number, number]);
  const edges: [number, number][] = [
    [0, 3],
    [3, 2],
    [2, 1],
    [1, 0],
  ];
  edges.sort((a, b) => g[a[0]][1] + g[a[1]][1] - (g[b[0]][1] + g[b[1]][1]));
  for (const [i, j] of edges) {
    const dy = Math.abs(g[i][1] - g[j][1]);
    const dx = Math.abs(g[i][0] - g[j][0]);
    face(ctx, g[i][0], g[i][1], g[j][0], g[j][1], r[j][0], r[j][1], r[i][0], r[i][1], dy > dx ? side : front);
  }
  face(ctx, r[0][0], r[0][1], r[1][0], r[1][1], r[2][0], r[2][1], r[3][0], r[3][1], top);
}

function contact(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = "rgba(14, 18, 22, 0.45)";
  ctx.beginPath();
  ctx.ellipse(x + 0.04, y + 0.08, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function infantry(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: number,
  time: number,
  id: number,
  moving: boolean,
  rocket: boolean,
  snow: boolean,
  trim: string,
) {
  const step = moving ? Math.sin(time * 10 + id) * 0.05 : 0;
  vehBox(ctx, x, y, f, -0.08, -0.1, 0.16, 0.2, 0.02, 0.36 + step, "dark", snow, trim);
  vehBox(ctx, x, y, f, -0.06, -0.08, 0.12, 0.16, 0.36, 0.52, "metal", snow, trim);
  vehBox(ctx, x, y, f, 0.04, -0.04, rocket ? 0.28 : 0.2, 0.06, 0.26, 0.34, rocket ? "hazard" : "dark", snow, trim);
  vehBox(ctx, x, y, f, -0.05, -0.07, 0.1, 0.14, 0.46, 0.54, "trim", snow, trim);
}

function tankish(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: number,
  snow: boolean,
  trim: string,
  heavy: boolean,
  barrel: number,
) {
  const w = heavy ? 0.46 : 0.38;
  vehBox(ctx, x, y, f, -w, -0.2, w * 2, 0.4, 0.02, 0.12, "dark", snow, trim);
  vehBox(ctx, x, y, f, -w * 0.82, -0.16, w * 1.64, 0.32, 0.12, 0.32, "metal", snow, trim);
  vehBox(ctx, x, y, f, -0.12, -0.12, 0.26, 0.24, 0.32, 0.52, "concrete", snow, trim);
  vehBox(ctx, x, y, f, 0.12, -0.04, barrel, 0.08, 0.38, 0.48, "dark", snow, trim);
  vehBox(ctx, x, y, f, -w * 0.5, -0.16, w * 0.8, 0.08, 0.32, 0.4, "trim", snow, trim);
}

function paintCraft(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, f: number, time: number, id: number, moving: boolean, snow: boolean, trim: string) {
  if (kind === "rifle" || kind === "engineer" || kind === "marksman" || kind === "wader" || kind === "vanguard") {
    infantry(ctx, x, y, f, time, id, moving, false, snow, trim);
    return;
  }
  if (kind === "rocket") {
    infantry(ctx, x, y, f, time, id, moving, true, snow, trim);
    return;
  }
  if (kind === "scout" || kind === "razor") {
    vehBox(ctx, x, y, f, -0.22, -0.1, 0.44, 0.2, 0.04, 0.16, "metal", snow, trim);
    vehBox(ctx, x, y, f, -0.02, -0.08, 0.16, 0.16, 0.16, 0.3, "glass", snow, trim);
    vehBox(ctx, x, y, f, 0.12, -0.03, 0.16, 0.06, 0.14, 0.2, "dark", snow, trim);
    vehBox(ctx, x, y, f, -0.16, -0.1, 0.16, 0.05, 0.16, 0.21, "trim", snow, trim);
    return;
  }
  if (kind === "harvester") {
    vehBox(ctx, x, y, f, -0.48, -0.2, 0.46, 0.4, 0.06, 0.36, "hazard", snow, trim);
    vehBox(ctx, x, y, f, -0.02, -0.18, 0.36, 0.36, 0.06, 0.28, "metal", snow, trim);
    vehBox(ctx, x, y, f, 0.06, -0.12, 0.2, 0.24, 0.28, 0.46, "glass", snow, trim);
    vehBox(ctx, x, y, f, -0.42, -0.2, 0.12, 0.08, 0, 0.1, "dark", snow, trim);
    vehBox(ctx, x, y, f, 0.22, -0.2, 0.1, 0.08, 0, 0.1, "dark", snow, trim);
    return;
  }
  if (kind === "mcv") {
    vehBox(ctx, x, y, f, -0.36, -0.18, 0.72, 0.36, 0.04, 0.34, "concrete", snow, trim);
    vehBox(ctx, x, y, f, 0.12, -0.12, 0.2, 0.24, 0.34, 0.5, "metal", snow, trim);
    vehBox(ctx, x, y, f, -0.28, -0.16, 0.3, 0.08, 0.34, 0.42, "trim", snow, trim);
    return;
  }
  if (kind === "artillery") {
    tankish(ctx, x, y, f, snow, trim, true, 0.42);
    return;
  }
  if (kind === "apc") {
    vehBox(ctx, x, y, f, -0.3, -0.14, 0.6, 0.28, 0.04, 0.26, "metal", snow, trim);
    vehBox(ctx, x, y, f, 0.08, -0.1, 0.16, 0.2, 0.26, 0.38, "glass", snow, trim);
    vehBox(ctx, x, y, f, -0.22, -0.12, 0.24, 0.06, 0.26, 0.32, "trim", snow, trim);
    return;
  }
  if (kind === "gunboat" || kind === "transport") {
    vehBox(ctx, x, y, f, -0.34, -0.12, 0.68, 0.24, 0.02, 0.14, "dark", snow, trim);
    vehBox(ctx, x, y, f, -0.08, -0.1, 0.24, 0.2, 0.14, 0.32, "metal", snow, trim);
    vehBox(ctx, x, y, f, -0.2, -0.1, 0.2, 0.06, 0.14, 0.2, "trim", snow, trim);
    return;
  }
  if (kind === "frigate" || kind === "missile") {
    vehBox(ctx, x, y, f, -0.42, -0.12, 0.84, 0.24, 0.02, 0.16, "dark", snow, trim);
    vehBox(ctx, x, y, f, -0.05, -0.1, 0.22, 0.2, 0.16, 0.4, "metal", snow, trim);
    vehBox(ctx, x, y, f, 0.16, -0.04, kind === "missile" ? 0.28 : 0.18, 0.08, 0.28, 0.36, "dark", snow, trim);
    vehBox(ctx, x, y, f, -0.28, -0.1, 0.22, 0.06, 0.16, 0.22, "trim", snow, trim);
    return;
  }
  if (kind === "chinook" || kind === "attackheli" || kind === "bomber") {
    const lift = 0.05;
    vehBox(ctx, x, y, f, -0.28, -0.1, 0.5, 0.2, lift, lift + 0.16, "metal", snow, trim);
    vehBox(ctx, x, y, f, -0.08, -0.08, 0.18, 0.16, lift + 0.16, lift + 0.28, "glass", snow, trim);
    vehBox(ctx, x, y, f, -0.42, -0.04, 0.16, 0.08, lift + 0.06, lift + 0.12, "dark", snow, trim);
    if (kind === "bomber") {
      vehBox(ctx, x, y, f, -0.08, -0.36, 0.16, 0.72, lift + 0.08, lift + 0.12, "dark", snow, trim);
    }
    vehBox(ctx, x, y, f, -0.16, -0.08, 0.22, 0.06, lift + 0.16, lift + 0.22, "trim", snow, trim);
    const spin = time * 18 + id;
    const [rx, ry] = rot(x, y, 0, 0, f);
    ctx.strokeStyle = "rgba(230,236,240,0.8)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(rx + Math.cos(spin) * 0.34 + (lift + 0.3) * SHEAR, ry + Math.sin(spin) * 0.12 - (lift + 0.3) * LIFT);
    ctx.lineTo(rx - Math.cos(spin) * 0.34 + (lift + 0.3) * SHEAR, ry - Math.sin(spin) * 0.12 - (lift + 0.3) * LIFT);
    ctx.stroke();
    return;
  }
  tankish(ctx, x, y, f, snow, trim, kind === "medium" || kind === "scatter", kind === "scatter" ? 0.2 : 0.28);
}

export function paintSolidUnit(
  ctx: CanvasRenderingContext2D,
  u: { kind: string; id: number; facing: number; radius: number; loco: string; team: number; stealth?: boolean },
  x: number,
  y: number,
  color: string,
  selected: boolean,
  time: number,
  aim: number,
  moving: boolean,
  snow: boolean,
  viewer: number,
) {
  const air = u.loco === "air";
  if (!air) contact(ctx, x, y, Math.max(0.22, u.radius * 0.95), Math.max(0.1, u.radius * 0.38));
  if (u.stealth && u.team === viewer) {
    ctx.save();
    ctx.strokeStyle = "rgba(125,200,160,0.75)";
    ctx.lineWidth = 0.035;
    ctx.setLineDash([0.08, 0.06]);
    ctx.strokeRect(x - 0.28, y - 0.28, 0.56, 0.56);
    ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.save();
  if (u.stealth && u.team === viewer) ctx.globalAlpha = 0.72;
  paintCraft(ctx, u.kind, x, y, aim, time, u.id, moving, snow, color);
  ctx.restore();
  if (selected) {
    ctx.strokeStyle = "#f7f1e4";
    ctx.lineWidth = 0.045;
    ctx.beginPath();
    ctx.ellipse(x, y + 0.1, Math.max(0.28, u.radius * 1.15), Math.max(0.12, u.radius * 0.48), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
