import { TILE_BRIDGE, TILE_DEEP, TILE_FORD, TILE_ROAD, TILE_SHALLOW, TILE_WRECK } from "./data.ts";

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
  feather: "rgba(92,64,34,0.22)",
  mid: "rgba(140,96,52,0.40)",
  body: "#b07d45",
  core: "#c99658",
  rut: "rgba(74,48,26,0.38)",
  grit: "#8a5a32",
  gritLit: "#e0c088",
};

const MUTED: Ink = {
  feather: "rgba(72,58,40,0.28)",
  mid: "rgba(96,74,50,0.45)",
  body: "#6e5840",
  core: "#7d6750",
  rut: "rgba(48,36,24,0.45)",
  grit: "#5c4632",
  gritLit: "#a89070",
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

const FEATHER = 1.96;
const MID = 1.82;
const BODY = 1.7;
const CORE = 1.2;
const RUT = 0.055;

function roadScale(gw: number, gh: number): number {
  return Math.max(8, Math.min(32, Math.floor(2048 / Math.max(gw, gh, 1))));
}

function blocked(t: number): boolean {
  return t === TILE_BRIDGE || t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_FORD || t === TILE_WRECK;
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
  const stubs: Chain[] = [];
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
  const linkStub = (i: number, dx: number, dy: number) => {
    const a = center(i, gw);
    stubs.push({
      pts: [a, { x: a.x + dx * 0.5, y: a.y + dy * 0.5 }],
      closed: false,
    });
  };
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
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx;
        const ny = y + dy;
        if (at(terrain, gw, gh, nx, ny) !== TILE_BRIDGE) continue;
        if (show && !show(nx, ny)) continue;
        // Half a step, so the round cap is clipped on the bridge edge instead of painting the deck.
        linkStub(i, dx, dy);
      }
    }
  }

  const blobs: Pt[] = [];
  for (const i of cells) {
    const deg = adj.get(i)?.length ?? 0;
    if (deg === 0 || deg >= 3) blobs.push(center(i, gw));
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
  return { chains: chains.concat(stubs), blobs };
}

function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function sampleSpline(pts: Pt[], closed: boolean): Pt[] {
  if (pts.length < 2) return pts.slice();
  let src = pts;
  let wrap = closed;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (wrap && pts.length > 2 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
    src = pts.slice(0, -1);
  }
  if (src.length < 3) wrap = false;
  const n = src.length;
  const out: Pt[] = [];
  const segs = wrap ? n : n - 1;
  const steps = 4;
  for (let i = 0; i < segs; i++) {
    const p0 = src[wrap ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const p1 = src[i]!;
    const p2 = src[wrap ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const p3 = src[wrap ? (i + 2) % n : Math.min(n - 1, i + 2)]!;
    for (let s = 0; s < steps; s++) out.push(catmull(p0, p1, p2, p3, s / steps));
  }
  out.push((wrap ? src[0] : src[n - 1])!);
  return out;
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

function strokeRuts(ctx: CanvasRenderingContext2D, splines: Pt[][], color: string) {
  ctx.beginPath();
  let any = false;
  for (const pts of splines) {
    if (pts.length < 2) continue;
    for (const side of [-1, 1]) {
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)]!;
        const next = pts[Math.min(pts.length - 1, i + 1)]!;
        let dx = next.x - prev.x;
        let dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const x = pts[i]!.x + -dy * 0.2 * side;
        const y = pts[i]!.y + dx * 0.2 * side;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      any = true;
    }
  }
  if (!any) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = RUT;
  ctx.stroke();
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
      const off = (h - 0.5) * 0.9;
      const r = 0.045 + h * 0.05;
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

/** Erase the round cap where it crosses a bridge or water tile, without a seam along the dirt. */
function punchCrossings(
  ctx: CanvasRenderingContext2D,
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  ctx.beginPath();
  let any = false;
  const xa = Math.max(0, x0);
  const ya = Math.max(0, y0);
  const xb = Math.min(gw - 1, x1);
  const yb = Math.min(gh - 1, y1);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (!blocked(terrain[y * gw + x] ?? 0)) continue;
      ctx.rect(x, y, 1, 1);
      any = true;
    }
  }
  if (!any) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fill();
  ctx.restore();
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
  const splines = built.chains.map((c) => sampleSpline(c.pts, c.closed));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  strokeChains(ctx, splines, FEATHER, ink.feather);
  strokeChains(ctx, splines, MID, ink.mid);
  strokeChains(ctx, splines, BODY, ink.body);
  strokeChains(ctx, splines, CORE, ink.core);
  fillDisks(ctx, built.blobs, 0.9, ink.body);
  fillDisks(ctx, built.blobs, 0.62, ink.core);
  strokeRuts(ctx, splines, ink.rut);
  gravel(ctx, splines, ink.grit, 1);
  gravel(ctx, splines, ink.gritLit, 2);
  punchCrossings(ctx, terrain, gw, gh, x0, y0, x1, y1);
  ctx.restore();
}

type RoadSheets = { key: string; full: HTMLCanvasElement; muted: HTMLCanvasElement };
let roadSheets: RoadSheets | null = null;

function roadKey(terrain: Uint8Array, gw: number, gh: number): string {
  let h = 2166136261;
  let n = 0;
  for (let i = 0; i < terrain.length; i++) {
    const t = terrain[i];
    if (t !== TILE_ROAD && t !== TILE_BRIDGE) continue;
    n++;
    h ^= Math.imul(i + 1, t === TILE_ROAD ? 0x9e3779b1 : 0x85ebca6b);
    h = Math.imul(h, 16777619);
  }
  return `${gw}x${gh}|${n}|${h >>> 0}`;
}

function bakeSheet(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  muted: boolean,
  scale: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, gw * scale);
  canvas.height = Math.max(1, gh * scale);
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  strokeDirt(g, terrain, gw, gh, 0, 0, gw - 1, gh - 1, muted);
  return canvas;
}

function sheetsFor(terrain: Uint8Array, gw: number, gh: number): RoadSheets | null {
  if (typeof document === "undefined") return null;
  const key = roadKey(terrain, gw, gh);
  if (roadSheets?.key === key) return roadSheets;
  const scale = roadScale(gw, gh);
  const full = bakeSheet(terrain, gw, gh, false, scale);
  const muted = bakeSheet(terrain, gw, gh, true, scale);
  if (!full || !muted) return null;
  roadSheets = { key, full, muted };
  return roadSheets;
}

/** Dirt bed through every road center. `show` is the explored-fog pass and uses the muted sheet. */
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
  const baked = sheetsFor(terrain, gw, gh);
  if (!baked) {
    strokeDirt(ctx, terrain, gw, gh, x0, y0, x1, y1, !!show, show);
    return;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (show) {
    ctx.beginPath();
    let any = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!shownRoad(terrain, gw, gh, x, y, show)) continue;
        ctx.rect(x - 0.42, y - 0.42, 1.84, 1.84);
        any = true;
      }
    }
    if (!any) {
      ctx.restore();
      return;
    }
    ctx.clip();
    ctx.drawImage(baked.muted, 0, 0, gw, gh);
  } else {
    ctx.drawImage(baked.full, 0, 0, gw, gh);
  }
  ctx.restore();
}
