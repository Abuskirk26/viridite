/** Baked trees. Hardwoods are a multi-stem grove: bark, a leafy crown, brush at the base. Biome only tints the palette. */

import { viewPitch } from "./view.ts";

export type TreeBiome = "temperate" | "snow" | "desert" | "tropic";
type Species = "broad" | "pine" | "bush" | "palm";

type Ink = { deep: string; mid: string; lit: string; trunk: string; snow: boolean };

const INK: Record<TreeBiome, Ink> = {
  temperate: { deep: "#163414", mid: "#3d6b32", lit: "#c5dc6a", trunk: "#6d5a48", snow: false },
  snow: { deep: "#1c3338", mid: "#3d6468", lit: "#d5e4ea", trunk: "#4a3a30", snow: true },
  desert: { deep: "#3a4018", mid: "#6a7030", lit: "#c6c078", trunk: "#6a4a2a", snow: false },
  tropic: { deep: "#0c3a22", mid: "#1f7a3c", lit: "#7ec85a", trunk: "#6b4424", snow: false },
};

const W = 128;
const H = 176;
const GROUND = 158;
/** Phone screens are sharp. The bake is 2× so a crown still reads as leaves. */
const SUPERSAMPLE = 2;

const cache = new Map<string, CanvasImageSource>();

function hash(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function rng(seed: number): () => number {
  let n = seed >>> 0 || 1;
  return () => {
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ink: Ink,
  rand: () => number,
) {
  ctx.fillStyle = ink.deep;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.08, y + r * 0.22, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink.mid;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.06, y + r * 0.02, r * 0.86, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink.lit;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.28, y - r * 0.28, r * 0.42, r * 0.32, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (ink.snow && rand() > 0.35) {
    ctx.fillStyle = "rgba(244,248,250,0.92)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.1, y - r * 0.42, r * 0.46, r * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function trunk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ink: Ink) {
  ctx.fillStyle = "#2a1c12";
  ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = ink.trunk;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,236,210,0.28)";
  ctx.fillRect(x, y, Math.max(2, w * 0.28), h);
}

function clump(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rot: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1.5, r), Math.max(1.2, r * 0.7), rot, 0, Math.PI * 2);
  ctx.fill();
}

/** Gray-brown limb. A curve and a pale bark edge, not a flat stick. */
function limb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  ink: Ink,
  rand: () => number,
) {
  const mx = (x0 + x1) / 2 + (rand() - 0.5) * 8;
  const my = (y0 + y1) / 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#2a221c";
  ctx.lineWidth = w + 1.6;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.8, y0);
  ctx.quadraticCurveTo(mx + 0.8, my, x1 + 0.6, y1);
  ctx.stroke();
  ctx.strokeStyle = ink.trunk;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(214, 196, 170, 0.38)";
  ctx.lineWidth = Math.max(1, w * 0.22);
  ctx.beginPath();
  ctx.moveTo(x0 - w * 0.16, y0);
  ctx.quadraticCurveTo(mx - w * 0.12, my, x1 - 0.4, y1);
  ctx.stroke();
}

function root(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ink: Ink) {
  ctx.fillStyle = "#2c261e";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, w, w * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink.trunk;
  ctx.beginPath();
  ctx.ellipse(x - w * 0.08, y, w * 0.7, w * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Overlapping leaf clumps. Dark in the middle, sun on the upper left, a ragged edge. */
function crown(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ink: Ink,
  rand: () => number,
) {
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const u = Math.sqrt(rand()) * 0.72;
    clump(ctx, cx + Math.cos(a) * rx * u, cy + Math.sin(a) * ry * u, rx * (0.24 + rand() * 0.16), ink.deep, (rand() - 0.5) * 0.8);
  }
  for (let i = 0; i < 48; i++) {
    const a = rand() * Math.PI * 2;
    const u = 0.42 + rand() * 0.62;
    const x = cx + Math.cos(a) * rx * Math.min(1.05, u);
    const y = cy + Math.sin(a) * ry * Math.min(1.02, u) * 0.92;
    const sun = y < cy - ry * 0.05 && x < cx + rx * 0.15 && rand() > 0.42;
    const color = sun ? ink.lit : u > 0.72 ? ink.mid : ink.deep;
    clump(ctx, x, y, rx * (0.12 + rand() * 0.14), color, (rand() - 0.5) * 1.1);
  }
  for (let i = 0; i < 12; i++) {
    clump(
      ctx,
      cx - rx * (0.05 + rand() * 0.48),
      cy - ry * (0.2 + rand() * 0.55),
      rx * (0.07 + rand() * 0.08),
      ink.lit,
      -0.5 + rand() * 0.4,
    );
  }
  if (ink.snow) {
    ctx.fillStyle = "rgba(244,248,250,0.9)";
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + (rand() - 0.6) * rx * 0.7, cy - ry * (0.35 + rand() * 0.4), rx * 0.16, ry * 0.07, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function brush(ctx: CanvasRenderingContext2D, ink: Ink, rand: () => number) {
  for (let i = 0; i < 9; i++) {
    const x = 14 + rand() * 100;
    const y = GROUND - 2 - rand() * 14;
    clump(ctx, x, y, 7 + rand() * 8, rand() > 0.45 ? ink.deep : ink.mid, (rand() - 0.5) * 0.6);
  }
}

function paintBroad(ctx: CanvasRenderingContext2D, ink: Ink, rand: () => number) {
  const style = rand();
  brush(ctx, ink, rand);
  if (style < 0.46) {
    root(ctx, 64, GROUND - 2, 18, ink);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const lean = (t - 0.5) * 72;
      const topX = 64 + lean;
      const topY = 84 + rand() * 16;
      limb(ctx, 64 + (t - 0.5) * 10, GROUND - 6, topX, topY, 7 - Math.abs(t - 0.5) * 5, ink, rand);
      limb(ctx, topX, topY + 10, topX + lean * 0.22, topY - 20, 2.2, ink, rand);
    }
    crown(ctx, 64, 68, 58, 46, ink, rand);
    return;
  }
  if (style < 0.78) {
    const xs = [30, 64, 98];
    for (const base of xs) {
      const x = base + (rand() - 0.5) * 4;
      root(ctx, x, GROUND - 1, 9, ink);
      const topY = 90 + rand() * 12;
      limb(ctx, x, GROUND - 4, x + (rand() - 0.5) * 8, topY, 5.2, ink, rand);
      limb(ctx, x, topY + 8, x - 14, topY - 16, 2, ink, rand);
      limb(ctx, x, topY + 6, x + 14, topY - 14, 2, ink, rand);
    }
    crown(ctx, 64, 70, 62, 44, ink, rand);
    return;
  }
  root(ctx, 66, GROUND - 2, 16, ink);
  limb(ctx, 66, GROUND - 4, 64, 98, 11, ink, rand);
  limb(ctx, 64, 112, 30, 78, 4.2, ink, rand);
  limb(ctx, 66, 106, 100, 72, 4.2, ink, rand);
  limb(ctx, 42, 90, 22, 66, 2.2, ink, rand);
  limb(ctx, 88, 86, 114, 62, 2.2, ink, rand);
  crown(ctx, 64, 60, 56, 46, ink, rand);
}

function paintPine(ctx: CanvasRenderingContext2D, ink: Ink, rand: () => number) {
  trunk(ctx, 60, 118, 8, 38, ink);
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const y = 118 - i * 16;
    const reach = 34 - i * 4.2;
    const n = 3 + ((rand() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const x = 64 + (k - (n - 1) / 2) * (reach * 0.55) + (rand() - 0.5) * 6;
      blob(ctx, x, y + (rand() - 0.5) * 5, reach * (0.28 + rand() * 0.16), ink, rand);
    }
  }
  blob(ctx, 64, 28, 12, ink, rand);
}

function paintBush(ctx: CanvasRenderingContext2D, ink: Ink, rand: () => number) {
  for (let i = 0; i < 8; i++) {
    blob(ctx, 18 + rand() * 92, GROUND - 6 - rand() * 20, 11 + rand() * 10, ink, rand);
  }
}

function paintPalm(ctx: CanvasRenderingContext2D, ink: Ink, rand: () => number) {
  ctx.strokeStyle = ink.trunk;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(70, 150);
  ctx.quadraticCurveTo(78, 110, 64, 62);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,236,210,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(67, 146);
  ctx.quadraticCurveTo(74, 108, 62, 66);
  ctx.stroke();
  const crown = 8;
  for (let i = 0; i < crown; i++) {
    const a = -Math.PI * 0.95 + (i / (crown - 1)) * Math.PI * 1.15 + (rand() - 0.5) * 0.15;
    const len = 34 + rand() * 16;
    ctx.save();
    ctx.translate(64, 60);
    ctx.rotate(a);
    ctx.fillStyle = ink.deep;
    ctx.beginPath();
    ctx.ellipse(len * 0.45, 3, len * 0.48, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i < 3 ? ink.lit : ink.mid;
    ctx.beginPath();
    ctx.ellipse(len * 0.42, 0, len * 0.42, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  blob(ctx, 64, 58, 10, ink, rand);
}

function bake(species: Species, biome: TreeBiome, variant: number): CanvasImageSource | null {
  if (typeof document === "undefined") return null;
  const key = `${species}:${biome}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = W * SUPERSAMPLE;
  canvas.height = H * SUPERSAMPLE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rand = rng(variant * 97 + species.length * 13 + biome.length * 29 + 5);
  const ink = INK[biome];
  ctx.save();
  ctx.setTransform(SUPERSAMPLE, 0, 0, SUPERSAMPLE, 0, 0);
  if (variant % 2 === 1) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  if (species === "broad") paintBroad(ctx, ink, rand);
  else if (species === "pine") paintPine(ctx, ink, rand);
  else if (species === "bush") paintBush(ctx, ink, rand);
  else paintPalm(ctx, ink, rand);
  ctx.restore();
  cache.set(key, canvas);
  return canvas;
}

function speciesAt(x: number, y: number, biome: TreeBiome): Species {
  const h = hash(x * 3 + 1, y * 5 + 2);
  if (biome === "tropic" && h > 0.62) return "palm";
  if (biome === "desert" && h > 0.55) return "bush";
  if (biome === "temperate") {
    if (h < 0.08) return "bush";
    if (h < 0.18) return "pine";
    return "broad";
  }
  if (h < 0.16) return "bush";
  if (h < 0.48) return "pine";
  return "broad";
}

/** Multi-stem hardwood, top-left sun, contact shadow. Drawn from a baked sheet. */
export function paintSceneryTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stump: boolean,
  biome: TreeBiome,
) {
  const species = stump ? "broad" : speciesAt(x, y, biome);
  const broad = species === "broad";
  const jx = (hash(x + 2, y) - 0.5) * (broad ? 0.26 : 0.16);
  ctx.fillStyle = "rgba(12, 18, 10, 0.38)";
  ctx.beginPath();
  ctx.ellipse(x + 0.56 + jx, y + 0.84, stump ? 0.16 : broad ? 0.38 : 0.28, stump ? 0.06 : 0.1, -0.35, 0, Math.PI * 2);
  ctx.fill();
  if (stump) {
    ctx.fillStyle = "#4a3424";
    ctx.fillRect(x + 0.4, y + 0.62, 0.18, 0.18);
    ctx.fillStyle = "#c4a478";
    ctx.beginPath();
    ctx.ellipse(x + 0.49, y + 0.62, 0.11, 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const variant = (hash(x * 9 + 4, y * 7 + 1) * 6) | 0;
  const img = bake(species, biome, variant);
  const scale = species === "bush" ? 0.62 + hash(x + 5, y + 1) * 0.28 : broad ? 1.32 + hash(x + 8, y + 3) * 0.36 : 0.78 + hash(x + 8, y + 3) * 0.48;
  if (!img) return;
  const w = scale;
  const hh = w * (H / W);
  ctx.save();
  ctx.translate(x + 0.5 + jx, y + 0.9);
  ctx.scale(1, 1 / viewPitch());
  ctx.drawImage(img, -w / 2, -hh, w, hh);
  ctx.restore();
}
