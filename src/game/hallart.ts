/**
 * One picture per structure.
 *
 * HALL_SHEET names a file in public/art/iso/<name>.png.
 * Drop that PNG in and it replaces the bake. A missing file keeps the bake.
 * Painted sheets already on disk: the original seven, plus advpower, helipad,
 * aa, radar, silo, stealth, wall, sandbag, and gate. Dock stays baked until
 * public/art/iso/dock.png is added.
 */

import type { BuildingId } from "./data.ts";
import { keySprite } from "./art.ts";
import { iso, type IsoBank } from "./iso.ts";

const ISO_READY = new Set(["yard", "power", "barracks", "factory", "tower", "refinery", "supply"]);

/**
 * Swap a bake for a painted sheet by dropping public/art/iso/<name>.png.
 * The string is that filename without the path. Null is not used: every kind
 * has a name so the swap is the file, not a second code path.
 */
export const HALL_SHEET: Record<Exclude<BuildingId, "span">, string> = {
  yard: "yard",
  power: "power",
  advpower: "advpower",
  refinery: "refinery",
  silo: "silo",
  supply: "supply",
  barracks: "barracks",
  stealth: "stealth",
  factory: "factory",
  dock: "dock",
  helipad: "helipad",
  tower: "tower",
  aa: "aa",
  radar: "radar",
  sandbag: "sandbag",
  wall: "wall",
  gate: "gate",
};

export function hallSheetName(kind: string): string | null {
  return (HALL_SHEET as Record<string, string | undefined>)[kind] ?? null;
}

const sheets = new Map<string, CanvasImageSource>();
const baked = new Map<string, CanvasImageSource>();
let started = false;

function load(name: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/art/iso/${name}.png`;
  });
}

/** Try every sheet that is not already in the iso bank. Missing files stay baked. */
export function ensureHallSheets(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const files = [...new Set(Object.values(HALL_SHEET))].filter((name) => !ISO_READY.has(name));
  void Promise.all(
    files.map(async (name) => {
      const img = await load(name);
      if (img) sheets.set(name, keySprite(img, `iso/${name}`));
    }),
  );
}

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function sheet(w: number, h: number, draw: Paint): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx, w, h);
  return canvas;
}

function shadow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "rgba(16, 14, 10, 0.35)";
  ctx.beginPath();
  ctx.ellipse(w * 0.52, h * 0.9, w * 0.36, h * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, side: string, face: string) {
  ctx.fillStyle = face;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = side;
  ctx.fillRect(x, y, Math.max(3, w * 0.16), h);
  ctx.fillStyle = top;
  ctx.fillRect(x, y, w, Math.max(3, h * 0.2));
}

/** Light gray trim. The renderer tints this with the seat color. */
function teamBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#d5d6d2";
  ctx.fillRect(x, y, w, h);
}

function paintHelipad(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  block(ctx, w * 0.08, h * 0.42, w * 0.62, h * 0.4, "#9aa3a8", "#5c666c", "#727c82");
  ctx.strokeStyle = "#e8e4da";
  ctx.lineWidth = 4;
  ctx.strokeRect(w * 0.14, h * 0.48, w * 0.5, h * 0.28);
  ctx.strokeStyle = "#f4f0e6";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(w * 0.32, h * 0.54);
  ctx.lineTo(w * 0.32, h * 0.7);
  ctx.moveTo(w * 0.26, h * 0.54);
  ctx.lineTo(w * 0.38, h * 0.54);
  ctx.moveTo(w * 0.26, h * 0.7);
  ctx.lineTo(w * 0.38, h * 0.7);
  ctx.stroke();
  const lights: [number, number, string][] = [
    [0.16, 0.5, "#ffe08a"],
    [0.58, 0.5, "#8fd0ff"],
    [0.16, 0.74, "#8fd0ff"],
    [0.58, 0.74, "#ffe08a"],
  ];
  for (const [lx, ly, color] of lights) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w * lx, h * ly, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  block(ctx, w * 0.7, h * 0.28, w * 0.22, h * 0.5, "#c8ccd0", "#4a545c", "#6a747c");
  ctx.fillStyle = "#9fd6e8";
  ctx.fillRect(w * 0.74, h * 0.4, w * 0.1, h * 0.1);
  teamBand(ctx, w * 0.72, h * 0.62, w * 0.18, h * 0.045);
}

function paintDock(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  ctx.fillStyle = "#1a6e96";
  ctx.fillRect(w * 0.08, h * 0.62, w * 0.84, h * 0.22);
  ctx.fillStyle = "#8fd0ea";
  ctx.fillRect(w * 0.1, h * 0.66, w * 0.5, 3);
  block(ctx, w * 0.18, h * 0.48, w * 0.64, h * 0.16, "#c4b39a", "#6a5844", "#8a7460");
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? "#6a5038" : "#3a2c22";
    ctx.fillRect(w * (0.22 + i * 0.1), h * 0.7, 6, h * 0.16);
  }
  block(ctx, w * 0.12, h * 0.28, w * 0.28, h * 0.28, "#d0d4d6", "#4e585e", "#6e787e");
  ctx.strokeStyle = "#e2b84a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(w * 0.4, h * 0.36);
  ctx.lineTo(w * 0.72, h * 0.22);
  ctx.lineTo(w * 0.72, h * 0.48);
  ctx.stroke();
  teamBand(ctx, w * 0.14, h * 0.42, w * 0.24, 6);
}

function paintAa(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  block(ctx, w * 0.22, h * 0.62, w * 0.56, h * 0.2, "#b7b8b0", "#5a5e58", "#7a7e76");
  block(ctx, w * 0.34, h * 0.46, w * 0.32, h * 0.2, "#9aa4aa", "#3e4850", "#5c666e");
  ctx.strokeStyle = "#2a3138";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * 0.5);
  ctx.lineTo(w * 0.22, h * 0.18);
  ctx.moveTo(w * 0.58, h * 0.5);
  ctx.lineTo(w * 0.78, h * 0.18);
  ctx.stroke();
  ctx.strokeStyle = "#d7dde2";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.4, h * 0.48);
  ctx.lineTo(w * 0.24, h * 0.2);
  ctx.moveTo(w * 0.6, h * 0.48);
  ctx.lineTo(w * 0.76, h * 0.2);
  ctx.stroke();
  ctx.fillStyle = "#e23b2f";
  ctx.beginPath();
  ctx.arc(w * 0.22, h * 0.18, 6, 0, Math.PI * 2);
  ctx.arc(w * 0.78, h * 0.18, 6, 0, Math.PI * 2);
  ctx.fill();
  teamBand(ctx, w * 0.3, h * 0.66, w * 0.4, 6);
}

function paintRadar(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  block(ctx, w * 0.3, h * 0.7, w * 0.4, h * 0.14, "#c8ccd0", "#4a545c", "#6a747c");
  ctx.strokeStyle = "#3a4248";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * 0.72);
  ctx.lineTo(w * 0.36, h * 0.36);
  ctx.moveTo(w * 0.58, h * 0.72);
  ctx.lineTo(w * 0.64, h * 0.36);
  ctx.moveTo(w * 0.38, h * 0.52);
  ctx.lineTo(w * 0.62, h * 0.52);
  ctx.stroke();
  ctx.fillStyle = "#8fd0ea";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.28, w * 0.28, h * 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e8eef2";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#dfe6ea";
  ctx.beginPath();
  ctx.ellipse(w * 0.42, h * 0.24, w * 0.1, h * 0.035, -0.4, 0, Math.PI * 2);
  ctx.fill();
  teamBand(ctx, w * 0.34, h * 0.74, w * 0.32, 5);
}

function paintAdvPower(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  block(ctx, w * 0.08, h * 0.48, w * 0.84, h * 0.32, "#c5c8c4", "#4e5854", "#6e7874");
  const tower = (cx: number) => {
    ctx.fillStyle = "#8a9298";
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.12, h * 0.5);
    ctx.lineTo(cx - w * 0.06, h * 0.12);
    ctx.lineTo(cx + w * 0.06, h * 0.12);
    ctx.lineTo(cx + w * 0.12, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e7eef2";
    ctx.fillRect(cx - w * 0.05, h * 0.12, w * 0.04, h * 0.36);
    ctx.fillStyle = "#d7dde2";
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.12, w * 0.07, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  tower(w * 0.32);
  tower(w * 0.68);
  ctx.strokeStyle = "#e2b84a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.52, h * 0.58);
  ctx.lineTo(w * 0.44, h * 0.68);
  ctx.lineTo(w * 0.52, h * 0.68);
  ctx.lineTo(w * 0.42, h * 0.8);
  ctx.stroke();
  teamBand(ctx, w * 0.18, h * 0.62, w * 0.64, 6);
}

function paintSilo(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  ctx.fillStyle = "#6a5138";
  ctx.fillRect(w * 0.28, h * 0.28, w * 0.44, h * 0.52);
  ctx.fillStyle = "#c4a078";
  ctx.fillRect(w * 0.28, h * 0.28, w * 0.1, h * 0.52);
  ctx.fillStyle = "#8a6848";
  for (let i = 1; i < 5; i++) ctx.fillRect(w * 0.3, h * (0.28 + i * 0.1), w * 0.4, 3);
  ctx.fillStyle = "#a84838";
  ctx.beginPath();
  ctx.moveTo(w * 0.22, h * 0.3);
  ctx.lineTo(w * 0.5, h * 0.08);
  ctx.lineTo(w * 0.78, h * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f0d0b0";
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.26);
  ctx.lineTo(w * 0.5, h * 0.1);
  ctx.lineTo(w * 0.5, h * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a241c";
  ctx.fillRect(w * 0.44, h * 0.62, w * 0.12, h * 0.16);
  teamBand(ctx, w * 0.32, h * 0.5, w * 0.36, 6);
}

function paintStealth(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  ctx.fillStyle = "#2a3138";
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.72);
  ctx.lineTo(w * 0.5, h * 0.28);
  ctx.lineTo(w * 0.92, h * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4a5864";
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.68);
  ctx.lineTo(w * 0.5, h * 0.34);
  ctx.lineTo(w * 0.42, h * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7ec8c0";
  ctx.beginPath();
  ctx.ellipse(w * 0.62, h * 0.42, w * 0.1, h * 0.06, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d5d6d2";
  ctx.lineWidth = 4;
  ctx.stroke();
  teamBand(ctx, w * 0.22, h * 0.64, w * 0.4, 5);
}

function paintWall(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  block(ctx, w * 0.1, h * 0.4, w * 0.8, h * 0.38, "#d5d2cc", "#6a6864", "#8e8c86");
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = "#c8c6c0";
    ctx.fillRect(w * (0.14 + i * 0.2), h * 0.28, w * 0.12, h * 0.16);
  }
  ctx.strokeStyle = "#3a3834";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.42);
  ctx.lineTo(w * 0.5, h * 0.74);
  ctx.stroke();
  teamBand(ctx, w * 0.16, h * 0.58, w * 0.68, 6);
}

function paintSandbag(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  const bags: [number, number][] = [
    [0.12, 0.58],
    [0.38, 0.6],
    [0.62, 0.58],
    [0.24, 0.42],
    [0.5, 0.4],
  ];
  bags.forEach(([bx, by], i) => {
    ctx.fillStyle = i % 2 ? "#a87848" : "#c4a078";
    ctx.beginPath();
    ctx.ellipse(w * bx + 18, h * by, w * 0.16, h * 0.1, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5a3c24";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  teamBand(ctx, w * 0.28, h * 0.46, w * 0.2, 5);
}

function paintGate(ctx: CanvasRenderingContext2D, w: number, h: number) {
  shadow(ctx, w, h);
  block(ctx, w * 0.08, h * 0.32, w * 0.18, h * 0.48, "#b0aaa4", "#3a3836", "#5c5a56");
  block(ctx, w * 0.74, h * 0.32, w * 0.18, h * 0.48, "#b0aaa4", "#3a3836", "#5c5a56");
  ctx.fillStyle = "#2a2826";
  ctx.fillRect(w * 0.26, h * 0.4, w * 0.48, h * 0.36);
  ctx.strokeStyle = "#e2b84a";
  ctx.lineWidth = 5;
  ctx.strokeRect(w * 0.3, h * 0.46, w * 0.4, h * 0.22);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.46);
  ctx.lineTo(w * 0.5, h * 0.68);
  ctx.moveTo(w * 0.34, h * 0.57);
  ctx.lineTo(w * 0.66, h * 0.57);
  ctx.stroke();
  teamBand(ctx, w * 0.1, h * 0.52, w * 0.14, 6);
  teamBand(ctx, w * 0.76, h * 0.52, w * 0.14, 6);
}

const BAKERS: Record<string, { w: number; h: number; paint: Paint }> = {
  advpower: { w: 360, h: 340, paint: paintAdvPower },
  silo: { w: 260, h: 420, paint: paintSilo },
  stealth: { w: 360, h: 240, paint: paintStealth },
  helipad: { w: 360, h: 250, paint: paintHelipad },
  dock: { w: 360, h: 300, paint: paintDock },
  aa: { w: 320, h: 360, paint: paintAa },
  radar: { w: 280, h: 400, paint: paintRadar },
  wall: { w: 240, h: 180, paint: paintWall },
  sandbag: { w: 260, h: 150, paint: paintSandbag },
  gate: { w: 240, h: 200, paint: paintGate },
};

function bake(kind: string): CanvasImageSource | null {
  const hit = baked.get(kind);
  if (hit) return hit;
  const spec = BAKERS[kind];
  if (!spec) return null;
  const canvas = sheet(spec.w, spec.h, spec.paint);
  if (!canvas) return null;
  baked.set(kind, canvas);
  return canvas;
}

/** Painted PNG if it has loaded, otherwise the baked sheet. Original seven wait for their PNG. */
export function hallImage(kind: string): CanvasImageSource | null {
  const file = hallSheetName(kind);
  if (file) {
    if (ISO_READY.has(file)) {
      const bank = iso();
      if (bank && file in bank) return bank[file as keyof IsoBank];
      return null;
    }
    const got = sheets.get(file);
    if (got) return got;
  }
  return bake(kind);
}
