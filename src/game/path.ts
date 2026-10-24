import { MAP_H, MAP_MAX, MAP_W } from "./data.ts";

/**
 * 8-direction A* on the field grid.
 * Diagonal steps cannot cut rock corners. Open set is a binary heap.
 * Buffers cover MAP_MAX (192) so a search never allocates a fresh grid.
 */

const MAX_N = MAP_MAX * MAP_MAX;
const SEEN = new Uint16Array(MAX_N);
const G = new Float32Array(MAX_N);
const CAME = new Int32Array(MAX_N);
let stamp = 1;

interface HNode {
  f: number;
  g: number;
  i: number;
}

class MinHeap {
  private a: HNode[] = [];
  get size(): number {
    return this.a.length;
  }
  push(n: HNode) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      const tmp = a[p];
      a[p] = a[i];
      a[i] = tmp;
      i = p;
    }
  }
  pop(): HNode | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        const tmp = a[m];
        a[m] = a[i];
        a[i] = tmp;
        i = m;
      }
    }
    return top;
  }
}

const HEAP = new MinHeap();

function bumpStamp() {
  stamp++;
  if (stamp >= 65535) {
    SEEN.fill(0);
    stamp = 1;
  }
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (1.41421356 - 2) * Math.min(dx, dy);
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.41421356],
  [1, -1, 1.41421356],
  [-1, 1, 1.41421356],
  [-1, -1, 1.41421356],
] as const;

export type BlockedFn = (x: number, y: number) => boolean;
export type CostFn = (x: number, y: number) => number;

function inb(x: number, y: number, gw: number, gh: number): boolean {
  return x >= 0 && y >= 0 && x < gw && y < gh;
}

export function nearestOpen(
  x: number,
  y: number,
  blocked: BlockedFn,
  rad = 5,
  gw = MAP_W,
  gh = MAP_H,
): { x: number; y: number } | null {
  if (inb(x, y, gw, gh) && !blocked(x, y)) return { x, y };
  for (let r = 1; r <= rad; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (inb(nx, ny, gw, gh) && !blocked(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

function los(x0: number, y0: number, x1: number, y1: number, blocked: BlockedFn): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 256; guard++) {
    if ((x !== x0 || y !== y0) && (x !== x1 || y !== y1) && blocked(x, y)) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return false;
}

function smooth(path: { x: number; y: number }[], blocked: BlockedFn): { x: number; y: number }[] {
  if (path.length <= 2) return path;
  const out: { x: number; y: number }[] = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!los(path[anchor].x, path[anchor].y, path[i].x, path[i].y, blocked)) {
      out.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

export function findPath(
  blocked: BlockedFn,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  gw = MAP_W,
  gh = MAP_H,
  cost?: CostFn,
): { x: number; y: number }[] | null {
  sx = Math.max(0, Math.min(gw - 1, sx | 0));
  sy = Math.max(0, Math.min(gh - 1, sy | 0));
  gx = Math.max(0, Math.min(gw - 1, gx | 0));
  gy = Math.max(0, Math.min(gh - 1, gy | 0));
  if (blocked(sx, sy)) {
    const alt = nearestOpen(sx, sy, blocked, 3, gw, gh);
    if (!alt) return null;
    sx = alt.x;
    sy = alt.y;
  }
  if (blocked(gx, gy)) {
    const alt = nearestOpen(gx, gy, blocked, 4, gw, gh);
    if (!alt) return null;
    gx = alt.x;
    gy = alt.y;
  }
  const start = sy * gw + sx;
  const goal = gy * gw + gx;
  if (start === goal) return [{ x: sx, y: sy }];

  bumpStamp();
  // Drain leftover heap from a previous search that bailed early.
  while (HEAP.size) HEAP.pop();

  SEEN[start] = stamp;
  G[start] = 0;
  CAME[start] = -1;
  const hScale = cost ? 0.7 : 1;
  HEAP.push({ f: octile(sx, sy, gx, gy) * hScale, g: 0, i: start });

  let found = false;
  let exp = 0;
  const cap = Math.min(4200, (gw * gh) >> 1);
  while (HEAP.size && exp < cap) {
    const cur = HEAP.pop();
    if (!cur) break;
    if (cur.g > G[cur.i] + 1e-4) continue;
    exp++;
    if (cur.i === goal) {
      found = true;
      break;
    }
    const cx = cur.i % gw;
    const cy = (cur.i / gw) | 0;
    for (let d = 0; d < DIRS.length; d++) {
      const dir = DIRS[d];
      const nx = cx + dir[0];
      const ny = cy + dir[1];
      if (!inb(nx, ny, gw, gh) || blocked(nx, ny)) continue;
      if (dir[0] !== 0 && dir[1] !== 0) {
        if (blocked(cx + dir[0], cy) || blocked(cx, cy + dir[1])) continue;
      }
      const ni = ny * gw + nx;
      const mul = cost ? Math.max(0.55, Math.min(2.4, cost(nx, ny))) : 1;
      const ng = cur.g + dir[2] * mul;
      if (SEEN[ni] === stamp && ng >= G[ni] - 1e-4) continue;
      SEEN[ni] = stamp;
      G[ni] = ng;
      CAME[ni] = cur.i;
      HEAP.push({ f: ng + octile(nx, ny, gx, gy) * hScale, g: ng, i: ni });
    }
  }
  if (!found && !(SEEN[goal] === stamp)) return null;

  const path: { x: number; y: number }[] = [];
  let cur = goal;
  for (let guard = 0; guard < gw * 2; guard++) {
    path.push({ x: cur % gw, y: (cur / gw) | 0 });
    if (cur === start) break;
    const prev = CAME[cur];
    if (prev < 0) return null;
    cur = prev;
  }
  path.reverse();
  return smooth(path, blocked);
}
