import { TILE_ROAD } from "./data.ts";

/**
 * Packed dirt drawn as one spline through road centers.
 * Bridges keep their own planks. This painter never dashes, rails, or insets.
 */

type Pt = { x: number; y: number };
type Chain = { pts: Pt[]; closed: boolean };

type Ink = {
  feather: string;
  mid: string;
  body: string;
  core: string;
  rut: string;
  grit: string;
  gritLit: string;
};

const BRIGHT: Ink = {
  feather: "rgba(58,40,24,0.32)",
  mid: "rgba(96,64,36,0.48)",
  body: "#7a4e2e",
  core: "#8d5c38",
  rut: "rgba(62,40,22,0.55)",
  grit: "#6a452c",
  gritLit: "#9a6840",
};

const MUTED: Ink = {
  feather: "rgba(64,48,34,0.32)",
  mid: "rgba(70,54,38,0.42)",
  body: "#5a4634",
  core: "#64503c",
  rut: "rgba(40,30,20,0.50)",
  grit: "#4a3c2e",
  gritLit: "#6e5a44",
};

const ORTHO: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAG: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const FEATHER = 1.38;
const MID = 1.28;
const BODY = 1.2;
const CORE = 1.05;
const RUT = 0.03;

function roadScale(gw: number, gh: number): number {
  return Math.max(8, Math.min(32, Math.floor(2048 / Math.max(gw, gh, 1))));
}

function at(terrain: Uint8Array, gw: number, gh: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= gw || y >= gh) return 0;
  return terrain[y * gw + x] ?? 0;
}

function shownRoad(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x: number,
  y: number,
  show?: (x: number, y: number) => boolean,
): boolean {
  if (at(terrain, gw, gh, x, y) !== TILE_ROAD) return false;
  return !show || show(x, y);
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function center(i: number, gw: number): Pt {
  return { x: (i % gw) + 0.5, y: ((i / gw) | 0) + 0.5 };
}

function buildRoads(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  show?: (x: number, y: number) => boolean,
): { chains: Chain[]; blobs: Pt[] } {
  const cells: number[] = [];
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    const left = adj.get(a);
    if (!left) adj.set(a, [b]);
    else if (!left.includes(b)) left.push(b);
    const right = adj.get(b);
    if (!right) adj.set(b, [a]);
    else if (!right.includes(a)) right.push(a);
  };
  const inside = (x: number, y: number) => x >= x0 && y >= y0 && x <= x1 && y <= y1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!shownRoad(terrain, gw, gh, x, y, show)) continue;
      const i = y * gw + x;
      cells.push(i);
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny) || !shownRoad(terrain, gw, gh, nx, ny, show)) continue;
        if (i < ny * gw + nx) link(i, ny * gw + nx);
      }
      for (const [dx, dy] of DIAG) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny) || !shownRoad(terrain, gw, gh, nx, ny, show)) continue;
        if (shownRoad(terrain, gw, gh, x + dx, y, show) && shownRoad(terrain, gw, gh, x, y + dy, show)) continue;
        if (i < ny * gw + nx) link(i, ny * gw + nx);
      }
    }
  }

  const blobs: Pt[] = [];
  for (const i of cells) {
    const deg = adj.get(i)?.length ?? 0;
    if (deg === 0) blobs.push(center(i, gw));
  }

  const used = new Set<string>();
  const chains: Chain[] = [];
  const trace = (start: number, next: number): Chain => {
    const pts: Pt[] = [center(start, gw)];
    let prev = start;
    let cur = next;
    used.add(edgeKey(start, next));
    const guard = cells.length + 2;
    for (let step = 0; step < guard; step++) {
      pts.push(center(cur, gw));
      if (cur === start) return { pts, closed: true };
      const nbrs = (adj.get(cur) ?? []).filter((n) => n !== prev && !used.has(edgeKey(cur, n)));
      const deg = adj.get(cur)?.length ?? 0;
      if (deg !== 2 || nbrs.length === 0) return { pts, closed: false };
      const nxt = nbrs[0]!;
      used.add(edgeKey(cur, nxt));
      prev = cur;
      cur = nxt;
    }
    return { pts, closed: false };
  };

  for (const i of cells) {
    const nbrs = adj.get(i) ?? [];
    if (nbrs.length === 0 || nbrs.length === 2) continue;
    for (const n of nbrs) {
      if (!used.has(edgeKey(i, n))) chains.push(trace(i, n));
    }
  }
  for (const i of cells) {
    for (const n of adj.get(i) ?? []) {
      if (!used.has(edgeKey(i, n))) chains.push(trace(i, n));
    }
  }
  return { chains, blobs };
}

/** Corner cutting keeps a constant width. Catmull-Rom bulged past 90° bends. */
function smoothChain(pts: Pt[], closed: boolean): Pt[] {
  if (pts.length < 2) return pts.slice();
  let src = pts;
  let wrap = closed;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (wrap && pts.length > 2 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
    src = pts.slice(0, -1);
  }
  if (src.length < 3) wrap = false;
  let cur = src;
  for (let pass = 0; pass < 2; pass++) {
    const n = cur.length;
    const next: Pt[] = [];
    const segs = wrap ? n : n - 1;
    if (!wrap) next.push(cur[0]!);
    for (let i = 0; i < segs; i++) {
      const a = cur[i]!;
      const b = cur[wrap ? (i + 1) % n : i + 1]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!wrap) next.push(cur[n - 1]!);
    cur = next;
  }
  if (wrap && cur.length) cur.push(cur[0]!);
  return cur;
}

function strokeChains(ctx: CanvasRenderingContext2D, splines: Pt[][], width: number, color: string) {
  ctx.beginPath();
  let any = false;
  for (const pts of splines) {
    if (pts.length < 2) continue;
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    any = true;
  }
  if (!any) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function fillDisks(ctx: CanvasRenderingContext2D, blobs: Pt[], radius: number, color: string) {
  if (!blobs.length) return;
  ctx.beginPath();
  for (const p of blobs) {
    ctx.moveTo(p.x + radius, p.y);
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.fill();
}

/** Two separate ruts. A shared path flips the normal at bends and draws a cross tie. */
function strokeRuts(ctx: CanvasRenderingContext2D, splines: Pt[][], color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = RUT;
  for (const pts of splines) {
    if (pts.length < 2) continue;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let down = false;
      let prevNx = 0;
      let prevNy = 0;
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)]!;
        const next = pts[Math.min(pts.length - 1, i + 1)]!;
        let dx = next.x - prev.x;
        let dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        let nx = -dy;
        let ny = dx;
        if (i > 0 && nx * prevNx + ny * prevNy < 0) {
          nx = -nx;
          ny = -ny;
        }
        const steady = i === 0 || nx * prevNx + ny * prevNy >= 0.2;
        const x = pts[i]!.x + nx * 0.16 * side;
        const y = pts[i]!.y + ny * 0.16 * side;
        if (!down || !steady) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        down = true;
        prevNx = nx;
        prevNy = ny;
      }
      ctx.stroke();
    }
  }
}

function speck(x: number, y: number, salt: number): number {
  let n = Math.imul(Math.round(x * 8) + salt * 17, 374761393) ^ Math.imul(Math.round(y * 8), 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function gravel(ctx: CanvasRenderingContext2D, splines: Pt[][], color: string, salt: number) {
  ctx.beginPath();
  let any = false;
  for (const pts of splines) {
    let acc = 0.4;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1]!.x;
      const ay = pts[i - 1]!.y;
      const bx = pts[i]!.x;
      const by = pts[i]!.y;
      const seg = Math.hypot(bx - ax, by - ay);
      acc += seg;
      if (acc < 0.72) continue;
      acc = 0;
      const h = speck(bx, by, salt);
      if (h < 0.42) continue;
      const len = seg || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      const off = (h - 0.5) * 0.28;
      const r = 0.016 + h * 0.016;
      const cx = bx + nx * off;
      const cy = by + ny * off;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      any = true;
    }
  }
  if (!any) return;
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeDirt(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  muted: boolean,
  show?: (x: number, y: number) => boolean,
) {
  const built = buildRoads(terrain, gw, gh, x0, y0, x1, y1, show);
  if (!built.chains.length && !built.blobs.length) return;
  const ink = muted ? MUTED : BRIGHT;
  const splines = built.chains.map((c) => smoothChain(c.pts, c.closed));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  strokeChains(ctx, splines, FEATHER, ink.feather);
  strokeChains(ctx, splines, MID, ink.mid);
  strokeChains(ctx, splines, BODY, ink.body);
  strokeChains(ctx, splines, CORE, ink.core);
  fillDisks(ctx, built.blobs, BODY / 2, ink.body);
  strokeRuts(ctx, splines, ink.rut);
  gravel(ctx, splines, ink.grit, 1);
  gravel(ctx, splines, ink.gritLit, 2);
  ctx.restore();
}

type RoadSheets = { key: string; full: HTMLCanvasElement };
let roadSheets: RoadSheets | null = null;

function roadKey(terrain: Uint8Array, gw: number, gh: number): string {
  let h = 2166136261;
  let n = 0;
  for (let i = 0; i < terrain.length; i++) {
    const t = terrain[i];
    if (t !== TILE_ROAD) continue;
    n++;
    h ^= Math.imul(i + 1, 0x9e3779b1);
    h = Math.imul(h, 16777619);
  }
  return `${gw}x${gh}|${n}|${h >>> 0}`;
}

function bakeSheet(terrain: Uint8Array, gw: number, gh: number, scale: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, gw * scale);
  canvas.height = Math.max(1, gh * scale);
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  strokeDirt(g, terrain, gw, gh, 0, 0, gw - 1, gh - 1, false);
  return canvas;
}

function sheetsFor(terrain: Uint8Array, gw: number, gh: number): RoadSheets | null {
  if (typeof document === "undefined") return null;
  const key = roadKey(terrain, gw, gh);
  if (roadSheets?.key === key) return roadSheets;
  const full = bakeSheet(terrain, gw, gh, roadScale(gw, gh));
  if (!full) return null;
  roadSheets = { key, full };
  return roadSheets;
}

/** Dirt bed through every road center. Explored fog strokes the muted track so the edge stays round. */
export function paintRoadNet(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  show?: (x: number, y: number) => boolean,
) {
  if (show) {
    strokeDirt(ctx, terrain, gw, gh, x0, y0, x1, y1, true, show);
    return;
  }
  const baked = sheetsFor(terrain, gw, gh);
  if (!baked) {
    strokeDirt(ctx, terrain, gw, gh, x0, y0, x1, y1, false);
    return;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(baked.full, 0, 0, gw, gh);
  ctx.restore();
}
