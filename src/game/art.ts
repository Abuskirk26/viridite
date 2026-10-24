/** Painted remaster bank. Default camera zoom is 48, so one tile is 48px. */

export const TILE_PX = 48;

export interface Painted {
  sand: HTMLImageElement;
  deep: HTMLImageElement;
  shallow: HTMLImageElement;
  shore: HTMLImageElement;
  rock: CanvasImageSource;
  crystal: CanvasImageSource;
  infantry: CanvasImageSource;
  rocket: CanvasImageSource;
  hull: CanvasImageSource;
  turret: CanvasImageSource;
  boat: CanvasImageSource;
  heli: CanvasImageSource;
  harvester: CanvasImageSource;
  yard: CanvasImageSource;
  power: CanvasImageSource;
  barracks: CanvasImageSource;
  factory: CanvasImageSource;
  tower: CanvasImageSource;
  refinery: CanvasImageSource;
  supply: CanvasImageSource;
  jungle: CanvasImageSource[];
  cliff: CanvasImageSource;
  boom: CanvasImageSource[];
  scaffold: CanvasImageSource[];
}

let painted: Painted | null = null;
let started = false;
const ready: (() => void)[] = [];

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** #C90485 plates and fringe on every cutout in /art. About 40 per channel. */
const KEY_R = 0xc9;
const KEY_G = 0x04;
const KEY_B = 0x85;
const KEY_TOL = 40;

/** Width and height for an image or a keyed canvas. */
export function sourceSize(img: CanvasImageSource): { w: number; h: number } {
  if (typeof HTMLImageElement !== "undefined" && img instanceof HTMLImageElement) {
    return { w: img.naturalWidth || img.width || 1, h: img.naturalHeight || img.height || 1 };
  }
  if (typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement) {
    return { w: img.width || 1, h: img.height || 1 };
  }
  if (typeof OffscreenCanvas !== "undefined" && img instanceof OffscreenCanvas) {
    return { w: img.width || 1, h: img.height || 1 };
  }
  if (typeof HTMLVideoElement !== "undefined" && img instanceof HTMLVideoElement) {
    return { w: img.videoWidth || 1, h: img.videoHeight || 1 };
  }
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
    return { w: img.width || 1, h: img.height || 1 };
  }
  return { w: 1, h: 1 };
}

function nearKey(r: number, g: number, b: number): boolean {
  return Math.abs(r - KEY_R) <= KEY_TOL && Math.abs(g - KEY_G) <= KEY_TOL && Math.abs(b - KEY_B) <= KEY_TOL;
}

/** A failed read must not draw the raw plate. An empty frame is blank, never magenta. */
function emptyPlate(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  return canvas;
}

/**
 * Drop the magenta plate so drawImage does not flash a pink square.
 * A clean sheet comes back as the original image. A plate or fringe comes back keyed.
 */
export function keySprite(img: HTMLImageElement, label: string): CanvasImageSource {
  if (typeof document === "undefined") return img;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    console.warn(`VIRIDITE: could not key ${label}. The magenta plate lives in art.ts punchKey.`);
    return emptyPlate(w, h);
  }
  ctx.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    console.warn(`VIRIDITE: could not read ${label}. The magenta plate lives in art.ts punchKey.`);
    return emptyPlate(w, h);
  }
  const px = data.data;
  let punched = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    if (nearKey(px[i]!, px[i + 1]!, px[i + 2]!)) {
      px[i + 3] = 0;
      punched++;
    }
  }
  if (punched === 0) return img;
  ctx.putImageData(data, 0, 0);
  let left = 0;
  const after = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < after.length; i += 4) {
    if (after[i + 3]! > 0 && nearKey(after[i]!, after[i + 1]!, after[i + 2]!)) left++;
  }
  if (left > 0) console.warn(`VIRIDITE: ${label} still has a magenta plate (#C90485). Key lives in art.ts punchKey.`);
  return canvas;
}

export function art(): Painted | null {
  return painted;
}

/** Fires once the painted tiles exist. Used so the editor can redraw into them. */
export function onArt(fn: () => void) {
  if (painted) fn();
  else ready.push(fn);
}

/** Kick off sprite loads. Safe to call more than once. No-op on the server. */
export function ensureArt(): void {
  if (painted || typeof window === "undefined") return;
  if (started) return;
  started = true;
  const png = (name: string) => load(`/art/${name}.png`);
  void (async () => {
    const loaded = await Promise.all([
      png("sand"),
      png("deep"),
      png("shallow"),
      png("shore"),
      png("rock"),
      png("crystal"),
      png("infantry"),
      png("rocket"),
      png("hull"),
      png("turret"),
      png("boat"),
      png("heli"),
      png("harvester"),
      png("yard"),
      png("power"),
      png("barracks"),
      png("factory"),
      png("tower"),
      png("refinery"),
      png("boom-1"),
      png("boom-2"),
      png("boom-3"),
      png("boom-4"),
      png("boom-5"),
      png("boom-6"),
      png("scaffold-1"),
      png("scaffold-2"),
      png("scaffold-3"),
      png("scaffold-4"),
      png("supply"),
      png("jungle-a"),
      png("jungle-b"),
      png("cliff"),
    ]);
    const names = [
      "sand",
      "deep",
      "shallow",
      "shore",
      "rock",
      "crystal",
      "infantry",
      "rocket",
      "hull",
      "turret",
      "boat",
      "heli",
      "harvester",
      "yard",
      "power",
      "barracks",
      "factory",
      "tower",
      "refinery",
    ] as const;
    const miss = names.filter((_, i) => !loaded[i]);
    const boom = loaded.slice(19, 25).filter((f): f is HTMLImageElement => !!f);
    const scaffold = loaded.slice(25, 29).filter((f): f is HTMLImageElement => !!f);
    const supply = loaded[29];
    const jungle = [loaded[30], loaded[31]].filter((f): f is HTMLImageElement => !!f);
    const cliff = loaded[32];
    if (miss.length || boom.length < 6 || scaffold.length < 4 || !supply || jungle.length < 2 || !cliff) {
      started = false;
      return;
    }
    const img = (i: number) => loaded[i] as HTMLImageElement;
    // Sand, deep, shallow, and shore are opaque ground tiles. They were checked
    // and have no #C90485 plate, so they stay raw. Every cutout is keyed.
    painted = {
      sand: img(0),
      deep: img(1),
      shallow: img(2),
      shore: img(3),
      rock: keySprite(img(4), "rock"),
      crystal: keySprite(img(5), "crystal"),
      infantry: keySprite(img(6), "infantry"),
      rocket: keySprite(img(7), "rocket"),
      hull: keySprite(img(8), "hull"),
      turret: keySprite(img(9), "turret"),
      boat: keySprite(img(10), "boat"),
      heli: keySprite(img(11), "heli"),
      harvester: keySprite(img(12), "harvester"),
      yard: keySprite(img(13), "yard"),
      power: keySprite(img(14), "power"),
      barracks: keySprite(img(15), "barracks"),
      factory: keySprite(img(16), "factory"),
      tower: keySprite(img(17), "tower"),
      refinery: keySprite(img(18), "refinery"),
      supply: keySprite(supply, "supply"),
      jungle: jungle.map((frame, i) => keySprite(frame, i === 0 ? "jungle-a" : "jungle-b")),
      cliff: keySprite(cliff, "cliff"),
      boom: boom.map((frame, i) => keySprite(frame, `boom-${i + 1}`)),
      scaffold: scaffold.map((frame, i) => keySprite(frame, `scaffold-${i + 1}`)),
    };
    const wait = ready.splice(0, ready.length);
    for (const fn of wait) fn();
  })();
}

if (typeof window !== "undefined") ensureArt();
