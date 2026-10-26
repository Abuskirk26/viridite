/**
 * Land movement classes shared by both renderers.
 * Infantry walk forests. Vehicles go around them. Boats own the water.
 * Cliffs and steep grades stop every ground unit; a ramp is the step between.
 * linkStarts cuts a ramp (or a ford, when water is the only gap) so every
 * start can reach the others by land. It is deterministic: no rng.
 */

import {
  TILE_BRIDGE,
  TILE_CLEAR,
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
  TILE_SPENT,
  TILE_STUMP,
  TILE_VALLEY,
  TILE_WRECK,
} from "./data.ts";
import { allows } from "./tileset.ts";

export type GroundClass = "infantry" | "vehicle";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export function gradeOf(tile: number): number {
  if (tile === TILE_HIGH) return 2;
  if (tile === TILE_RAMP) return 1;
  return 0;
}

function inb(x: number, y: number, gw: number, gh: number): boolean {
  return x >= 0 && y >= 0 && x < gw && y < gh;
}

function canStep(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x: number,
  y: number,
  nx: number,
  ny: number,
  who: GroundClass,
): boolean {
  if (!inb(nx, ny, gw, gh)) return false;
  const tb = terrain[ny * gw + nx] ?? 0;
  if (!allows(tb, who)) return false;
  const ta = terrain[y * gw + x] ?? 0;
  if (Math.abs(gradeOf(ta) - gradeOf(tb)) > 1) return false;
  if (nx !== x && ny !== y) {
    const sideA = terrain[y * gw + nx] ?? 0;
    const sideB = terrain[ny * gw + x] ?? 0;
    if (!allows(sideA, who) || !allows(sideB, who)) return false;
    if (Math.abs(gradeOf(ta) - gradeOf(sideA)) > 1) return false;
    if (Math.abs(gradeOf(ta) - gradeOf(sideB)) > 1) return false;
  }
  return true;
}

/** Nearest tile this class may stand on. Camps are sand; this covers a start dropped on a trunk. */
function stand(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  x: number,
  y: number,
  who: GroundClass,
): { x: number; y: number } | null {
  const tx = x | 0;
  const ty = y | 0;
  if (inb(tx, ty, gw, gh) && allows(terrain[ty * gw + tx] ?? 0, who)) return { x: tx, y: ty };
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!inb(nx, ny, gw, gh)) continue;
        if (allows(terrain[ny * gw + nx] ?? 0, who)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

function reaches(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  who: GroundClass,
): boolean {
  const n = gw * gh;
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const s = start.y * gw + start.x;
  const g = goal.y * gw + goal.x;
  seen[s] = 1;
  q[tail++] = s;
  while (head < tail) {
    const i = q[head++]!;
    if (i === g) return true;
    const x = i % gw;
    const y = (i / gw) | 0;
    for (let d = 0; d < DIRS.length; d++) {
      const dir = DIRS[d]!;
      const nx = x + dir[0];
      const ny = y + dir[1];
      if (!canStep(terrain, gw, gh, x, y, nx, ny, who)) continue;
      const ni = ny * gw + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      q[tail++] = ni;
    }
  }
  return false;
}

export function landConnected(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  who: GroundClass,
): boolean {
  const start = stand(terrain, gw, gh, a.x, a.y, who);
  const goal = stand(terrain, gw, gh, b.x, b.y, who);
  if (!start || !goal) return false;
  return reaches(terrain, gw, gh, start, goal, who);
}

function gapCost(tile: number): number {
  if (
    tile === TILE_CLEAR ||
    tile === TILE_SAND ||
    tile === TILE_ROAD ||
    tile === TILE_RAMP ||
    tile === TILE_FORD ||
    tile === TILE_BRIDGE ||
    tile === TILE_SHORE ||
    tile === TILE_ROUGH ||
    tile === TILE_VALLEY ||
    tile === TILE_SPENT ||
    tile === TILE_STUMP ||
    tile === TILE_CRYSTAL
  ) {
    return 1;
  }
  if (tile === TILE_HIGH) return 2;
  if (tile === TILE_CLIFF || tile === TILE_ROCK) return 4;
  if (tile === TILE_SCRUB) return 9;
  if (tile === TILE_DEEP || tile === TILE_SHALLOW || tile === TILE_WRECK) return 20;
  return 7;
}

class Heap {
  private a: { c: number; i: number }[] = [];
  get size(): number {
    return this.a.length;
  }
  push(c: number, i: number) {
    const a = this.a;
    a.push({ c, i });
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (a[p]!.c <= a[n]!.c) break;
      const tmp = a[p]!;
      a[p] = a[n]!;
      a[n] = tmp;
      n = p;
    }
  }
  pop(): { c: number; i: number } | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < a.length && a[l]!.c < a[m]!.c) m = l;
        if (r < a.length && a[r]!.c < a[m]!.c) m = r;
        if (m === n) break;
        const tmp = a[m]!;
        a[m] = a[n]!;
        a[n] = tmp;
        n = m;
      }
    }
    return top;
  }
}

/** Orthogonal corridor across the cheapest gap. Returns false when there is nothing to cut. */
function carveGap(
  terrain: Uint8Array,
  gw: number,
  gh: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const start = stand(terrain, gw, gh, a.x, a.y, "vehicle");
  const goal = stand(terrain, gw, gh, b.x, b.y, "vehicle");
  if (!start || !goal) return false;
  const n = gw * gh;
  const home = new Uint8Array(n);
  const dest = new Uint8Array(n);
  const q = new Int32Array(n);
  const flood = (seed: { x: number; y: number }, mark: Uint8Array) => {
    let head = 0;
    let tail = 0;
    const s = seed.y * gw + seed.x;
    mark[s] = 1;
    q[tail++] = s;
    while (head < tail) {
      const i = q[head++]!;
      const x = i % gw;
      const y = (i / gw) | 0;
      for (let d = 0; d < 4; d++) {
        const dir = DIRS[d]!;
        const nx = x + dir[0];
        const ny = y + dir[1];
        if (!canStep(terrain, gw, gh, x, y, nx, ny, "vehicle")) continue;
        const ni = ny * gw + nx;
        if (mark[ni]) continue;
        mark[ni] = 1;
        q[tail++] = ni;
      }
    }
  };
  flood(start, home);
  flood(goal, dest);
  if (home[goal.y * gw + goal.x]) return false;

  const cost = new Float64Array(n);
  const parent = new Int32Array(n);
  cost.fill(1e15);
  parent.fill(-1);
  const heap = new Heap();
  for (let i = 0; i < n; i++) {
    if (!home[i]) continue;
    cost[i] = 0;
    heap.push(0, i);
  }
  let hit = -1;
  while (heap.size) {
    const cur = heap.pop();
    if (!cur || cur.c > cost[cur.i] + 1e-6) continue;
    if (dest[cur.i] && cur.c > 0) {
      hit = cur.i;
      break;
    }
    const x = cur.i % gw;
    const y = (cur.i / gw) | 0;
    for (let d = 0; d < 4; d++) {
      const dir = DIRS[d]!;
      const nx = x + dir[0];
      const ny = y + dir[1];
      if (!inb(nx, ny, gw, gh)) continue;
      const ni = ny * gw + nx;
      const step = canStep(terrain, gw, gh, x, y, nx, ny, "vehicle") ? 1 : gapCost(terrain[ni] ?? 0);
      const nc = cur.c + step;
      if (nc >= cost[ni]) continue;
      cost[ni] = nc;
      parent[ni] = cur.i;
      heap.push(nc, ni);
    }
  }
  if (hit < 0) return false;

  const path: number[] = [];
  for (let i = hit; i >= 0 && cost[i] > 0; i = parent[i]!) path.push(i);
  if (!path.length) return false;
  for (const i of path) {
    const t = terrain[i] ?? 0;
    if (!allows(t, "vehicle")) {
      if (t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_WRECK) terrain[i] = TILE_FORD;
      else if (t === TILE_SCRUB) terrain[i] = TILE_ROAD;
      else terrain[i] = TILE_RAMP;
    }
  }
  for (let k = 0; k < path.length; k++) {
    const i = path[k]!;
    const p = parent[i]!;
    if (p < 0) continue;
    const ta = terrain[p] ?? 0;
    const tb = terrain[i] ?? 0;
    if (Math.abs(gradeOf(ta) - gradeOf(tb)) <= 1) continue;
    if (gradeOf(tb) > gradeOf(ta)) terrain[i] = TILE_RAMP;
    else terrain[p] = TILE_RAMP;
  }
  return true;
}

/** Make every start reachable by a tank. Infantry can use that same lane, plus the forests. */
export function linkStarts(terrain: Uint8Array, gw: number, gh: number, slots: { x: number; y: number }[]) {
  if (slots.length < 2) return;
  const home = slots[0];
  if (!home) return;
  for (let s = 1; s < slots.length; s++) {
    const there = slots[s];
    if (!there) continue;
    for (let n = 0; n < 5; n++) {
      if (landConnected(terrain, gw, gh, home, there, "vehicle")) break;
      if (!carveGap(terrain, gw, gh, home, there)) break;
    }
  }
}
