/**
 * Punchy combat effects for VIRIDITE — Art of War 3 style.
 * Object-pooled particles. Weapon-specific trails, hit sparks, dirt, scorch,
 * vehicle wrecks that smoke and fade, infantry fall, building collapse debris.
 * Call spawn* from sim on fire/hit/death, and drawParticles from render each frame.
 */

export interface Particle {
  alive: boolean;
  kind: "tracer" | "trail" | "spark" | "dirt" | "smoke" | "debris" | "scorch" | "fall" | "wreck" | "ruin";
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  max: number;
  size: number;
  color: string;
  team?: number;
  // For wrecks / falls
  angle?: number;
  fade?: number;
}

const POOL_SIZE = 800;
const pool: Particle[] = [];
for (let i = 0; i < POOL_SIZE; i++) {
  pool.push({
    alive: false,
    kind: "spark",
    x: 0, y: 0, vx: 0, vy: 0,
    ttl: 0, max: 1, size: 0.1, color: "#fff",
  });
}
let next = 0;

function alloc(): Particle | null {
  for (let n = 0; n < POOL_SIZE; n++) {
    const i = (next + n) % POOL_SIZE;
    if (!pool[i].alive) {
      next = (i + 1) % POOL_SIZE;
      pool[i].alive = true;
      return pool[i];
    }
  }
  return null; // pool exhausted — drop
}

export function clearParticles() {
  for (const p of pool) p.alive = false;
  next = 0;
}

/** Rifle / hit-scan tracer. */
export function spawnTracer(x1: number, y1: number, x2: number, y2: number, team: number) {
  const p = alloc();
  if (!p) return;
  p.kind = "tracer";
  p.x = x1; p.y = y1;
  p.vx = x2; p.vy = y2; // store end point
  p.ttl = 0.12; p.max = 0.12;
  p.size = 0.04;
  p.color = team === 0 ? "#ffe7a8" : "#ff8a6a";
  p.team = team;
}

/** Rocket / shell trail. */
export function spawnTrail(x: number, y: number, vx: number, vy: number, kind: "rocket" | "shell" | "artillery") {
  const p = alloc();
  if (!p) return;
  p.kind = "trail";
  p.x = x; p.y = y;
  p.vx = -vx * 0.15; p.vy = -vy * 0.15;
  p.ttl = kind === "rocket" ? 0.45 : 0.28;
  p.max = p.ttl;
  p.size = kind === "rocket" ? 0.18 : 0.12;
  p.color = kind === "rocket" ? "#ff6a20" : "#fff1c4";
}

/** Sparks on armor hit. */
export function spawnSparks(x: number, y: number, count = 6) {
  for (let i = 0; i < count; i++) {
    const p = alloc();
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const s = 1.2 + Math.random() * 2.4;
    p.kind = "spark";
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s - 0.4;
    p.ttl = 0.18 + Math.random() * 0.14;
    p.max = p.ttl;
    p.size = 0.06;
    p.color = Math.random() > 0.5 ? "#fff6d0" : "#ffb25a";
  }
}

/** Dirt puffs on ground miss. */
export function spawnDirt(x: number, y: number, count = 4) {
  for (let i = 0; i < count; i++) {
    const p = alloc();
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const s = 0.6 + Math.random() * 1.2;
    p.kind = "dirt";
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s * 0.6;
    p.ttl = 0.35 + Math.random() * 0.2;
    p.max = p.ttl;
    p.size = 0.14;
    p.color = "#6a5438";
  }
}

/** Scorch decal (static, long lived). */
export function spawnScorch(x: number, y: number, r = 0.45) {
  const p = alloc();
  if (!p) return;
  p.kind = "scorch";
  p.x = x; p.y = y;
  p.vx = 0; p.vy = 0;
  p.ttl = 12; p.max = 12;
  p.size = r;
  p.color = "#1a1410";
}

/** Vehicle wreck that smokes, burns, and fades (~20s). */
export function spawnWreck(x: number, y: number, team: number) {
  const p = alloc();
  if (!p) return;
  p.kind = "wreck";
  p.x = x; p.y = y;
  p.vx = 0; p.vy = 0;
  p.ttl = 20; p.max = 20;
  p.size = 0.72;
  p.color = team === 0 ? "#4a555c" : "#6a4034";
  p.team = team;
  p.angle = Math.random() * Math.PI;
  spawnSmoke(x, y - 0.15, 2.2);
  spawnSmoke(x + 0.12, y - 0.05, 1.6);
}

function spawnSmoke(x: number, y: number, life: number) {
  const p = alloc();
  if (!p) return;
  p.kind = "smoke";
  p.x = x; p.y = y;
  p.vx = (Math.random() - 0.5) * 0.3;
  p.vy = -0.4 - Math.random() * 0.3;
  p.ttl = life; p.max = life;
  p.size = 0.2 + Math.random() * 0.15;
  p.color = "rgba(40,40,40,0.6)";
}

/** Infantry fall, then a small body that stays and fades. */
export function spawnFall(x: number, y: number, team: number) {
  const p = alloc();
  if (!p) return;
  p.kind = "fall";
  p.x = x; p.y = y;
  p.vx = 0; p.vy = 0;
  p.ttl = 10; p.max = 10;
  p.size = 0.28;
  p.color = team === 0 ? "#8fb7d4" : "#e08a62";
  p.team = team;
  p.angle = 0;
}

/** Building collapse. The pile stays about twenty seconds, then fades. */
export function spawnRuin(x: number, y: number, w: number, h: number) {
  const p = alloc();
  if (p) {
    p.kind = "ruin";
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.ttl = 20;
    p.max = 20;
    p.size = Math.max(0.7, Math.max(w, h) * 0.42);
    p.color = "#4a3b30";
    p.angle = 0.15;
  }
  spawnScorch(x, y, Math.max(w, h) * 0.55);
  spawnBuildingDebris(x, y, 10);
  for (let i = 0; i < 4; i++) spawnSmoke(x + (i - 1.5) * 0.25, y - 0.1, 2.4);
}

/** Building debris + fire. */
export function spawnBuildingDebris(x: number, y: number, count = 8) {
  for (let i = 0; i < count; i++) {
    const p = alloc();
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 2.2;
    p.kind = "debris";
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s - 1.2;
    p.ttl = 0.6 + Math.random() * 0.4;
    p.max = p.ttl;
    p.size = 0.1 + Math.random() * 0.08;
    p.color = Math.random() > 0.4 ? "#5a4a3a" : "#e07a3a";
  }
  // Lingering fire
  const fire = alloc();
  if (fire) {
    fire.kind = "smoke";
    fire.x = x; fire.y = y;
    fire.vx = 0; fire.vy = -0.2;
    fire.ttl = 4; fire.max = 4;
    fire.size = 0.6;
    fire.color = "rgba(224,122,58,0.5)";
  }
}

export function stepParticles(dt: number) {
  for (const p of pool) {
    if (!p.alive) continue;
    p.ttl -= dt;
    if (p.ttl <= 0) {
      p.alive = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "smoke") p.vy -= 0.15 * dt;
    if (p.kind === "debris" || p.kind === "spark") p.vy += 1.8 * dt;
    if (p.kind === "wreck") {
      const before = p.ttl + dt;
      if (p.ttl > 1 && Math.floor(before / 2) !== Math.floor(p.ttl / 2)) spawnSmoke(p.x, p.y - 0.18, 1.5);
    }
  }
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  time: number,
  clipDecal?: (x: number, y: number, r: number) => void,
) {
  for (const p of pool) {
    if (!p.alive) continue;
    const k = p.ttl / p.max;
    ctx.globalAlpha = Math.max(0, Math.min(1, k));
    if (p.kind === "tracer") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.vx, p.vy);
      ctx.stroke();
    } else if (p.kind === "trail") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "spark") {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 0.03, p.y - 0.03, 0.06, 0.06);
    } else if (p.kind === "dirt") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.2 - k * 0.4), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "smoke") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + (1 - k) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "debris") {
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.angle ?? 0) + time * 3);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    } else if (p.kind === "scorch") {
      ctx.save();
      clipDecal?.(p.x, p.y, p.size);
      ctx.fillStyle = p.color;
      ctx.globalAlpha *= 0.55;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === "wreck") {
      const fade = k < 0.2 ? k / 0.2 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle ?? 0);
      ctx.globalAlpha *= fade;
      ctx.fillStyle = "#1a1612";
      ctx.fillRect(-0.5, -0.24, 1, 0.48);
      ctx.fillStyle = p.color;
      ctx.fillRect(-0.4, -0.16, 0.72, 0.32);
      ctx.fillStyle = "#14110e";
      ctx.fillRect(0.05, -0.12, 0.28, 0.22);
      ctx.fillStyle = "#2a221c";
      ctx.fillRect(-0.46, -0.2, 0.1, 0.4);
      ctx.fillRect(0.36, -0.2, 0.1, 0.4);
      ctx.restore();
      const flick = 0.65 + 0.35 * Math.sin(time * 12 + p.x * 5);
      ctx.globalAlpha = fade * flick * 0.9;
      ctx.fillStyle = "#ff5a18";
      ctx.beginPath();
      ctx.arc(p.x + 0.06, p.y - 0.14, 0.11 * flick, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffe08a";
      ctx.globalAlpha = fade * 0.85;
      ctx.beginPath();
      ctx.arc(p.x + 0.06, p.y - 0.18, 0.045, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "ruin") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha *= 0.9;
      ctx.fillStyle = "#2a211c";
      ctx.beginPath();
      ctx.ellipse(0, 0.08, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5c4638";
      ctx.fillRect(-p.size * 0.55, -p.size * 0.15, p.size * 0.38, p.size * 0.22);
      ctx.fillStyle = "#3d3028";
      ctx.fillRect(-p.size * 0.05, -p.size * 0.28, p.size * 0.46, p.size * 0.28);
      ctx.fillStyle = "#7a5a42";
      ctx.fillRect(p.size * 0.18, -0.02, p.size * 0.28, p.size * 0.16);
      ctx.restore();
      if (Math.random() < 0.05) spawnSmoke(p.x, p.y - 0.2, 1.4);
    } else if (p.kind === "fall") {
      const age = p.max - p.ttl;
      const drop = Math.min(1, age / 0.45);
      const fade = p.ttl < 1.6 ? p.ttl / 1.6 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(drop * 1.2);
      ctx.globalAlpha *= fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-0.045, -0.22 + drop * 0.16, 0.09, 0.26 - drop * 0.1);
      ctx.beginPath();
      ctx.ellipse(0, 0.05, 0.06 + drop * 0.12, 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.14 * drop, -0.02, 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
