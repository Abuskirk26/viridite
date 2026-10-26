/** Baked trees. One set on every map. Biome only tints the palette. */

import { viewPitch } from "./view.ts";

export type TreeBiome = "temperate" | "snow" | "desert" | "tropic";
type Species = "broad" | "pine" | "bush" | "palm";

type Ink = { deep: string; mid: string; lit: string; trunk: string; snow: boolean };

const INK: Record<TreeBiome, Ink> = {
  temperate: { deep: "#14361c", mid: "#2d6a38", lit: "#8fbf62", trunk: "#5c3b24", snow: false },
  snow: { deep: "#1c3338", mid: "#3d6468", lit: "#d5e4ea", trunk: "#4a3a30", snow: true },
  desert: { deep: "#3a4018", mid: "#6a7030", lit: "#c6c078", trunk: "#6a4a2a", snow: false },
  tropic: { deep: "#0c3a22", mid: "#1f7a3c", lit: "#7ec85a", trunk: "#6b4424", snow: false },
};

const W = 128;
const H = 176;
const GROUND = 158;

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

function paintBroad(ctx: CanvasRenderingContext2D, ink: Ink, rand: () => number) {
  trunk(ctx, 58, 108, 10, 46, ink);
  const clumps: [number, number, number][] = [
    [64, 96, 28],
    [40, 84, 24],
    [86, 80, 26],
    [62, 62, 30],
    [46, 58, 18],
    [80, 52, 20],
    [64, 40, 16],
  ];
  for (const [x, y, r] of clumps) blob(ctx, x + (rand() - 0.5) * 8, y + (rand() - 0.5) * 6, r * (0.85 + rand() * 0.3), ink, rand);
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
  for (let i = 0; i < 5; i++) {
    blob(ctx, 40 + i * 14 + (rand() - 0.5) * 6, 118 + (rand() - 0.5) * 8, 16 + rand() * 8, ink, rand);
  }
  blob(ctx, 64, 100, 20, ink, rand);
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
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rand = rng(variant * 97 + species.length * 13 + biome.length * 29 + 5);
  const ink = INK[biome];
  ctx.save();
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
  if (h < 0.16) return "bush";
  if (h < 0.48) return "pine";
  return "broad";
}

/** Rounded canopy, top-left light, contact shadow. Drawn from a baked sheet. */
export function paintSceneryTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stump: boolean,
  biome: TreeBiome,
) {
  const jx = (hash(x + 2, y) - 0.5) * 0.16;
  ctx.fillStyle = "rgba(12, 18, 10, 0.32)";
  ctx.beginPath();
  ctx.ellipse(x + 0.56 + jx, y + 0.84, stump ? 0.16 : 0.28, stump ? 0.06 : 0.09, -0.35, 0, Math.PI * 2);
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
  const species = speciesAt(x, y, biome);
  const variant = (hash(x * 9 + 4, y * 7 + 1) * 6) | 0;
  const img = bake(species, biome, variant);
  const scale = species === "bush" ? 0.62 + hash(x + 5, y + 1) * 0.28 : 0.78 + hash(x + 8, y + 3) * 0.48;
  if (!img) return;
  const w = scale;
  const hh = w * (H / W);
  ctx.save();
  ctx.translate(x + 0.5 + jx, y + 0.9);
  ctx.scale(1, 1 / viewPitch());
  ctx.drawImage(img, -w / 2, -hh, w, hh);
  ctx.restore();
}
