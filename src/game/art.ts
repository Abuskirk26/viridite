/** Painted remaster bank. Default camera zoom is 48, so one tile is 48px. */

export const TILE_PX = 48;

export interface Painted {
  sand: HTMLImageElement;
  deep: HTMLImageElement;
  shallow: HTMLImageElement;
  shore: HTMLImageElement;
  rock: HTMLImageElement;
  crystal: HTMLImageElement;
  infantry: HTMLImageElement;
  rocket: HTMLImageElement;
  hull: HTMLImageElement;
  turret: HTMLImageElement;
  boat: HTMLImageElement;
  heli: HTMLImageElement;
  harvester: HTMLImageElement;
  yard: HTMLImageElement;
  power: HTMLImageElement;
  barracks: HTMLImageElement;
  factory: HTMLImageElement;
  tower: HTMLImageElement;
  refinery: HTMLImageElement;
  supply: HTMLImageElement;
  jungle: HTMLImageElement[];
  cliff: HTMLImageElement;
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

/** #C90485 plates on the boom and scaffold sheets. About 40 per channel. */
const KEY_R = 0xc9;
const KEY_G = 0x04;
const KEY_B = 0x85;
const KEY_TOL = 40;

function nearKey(r: number, g: number, b: number): boolean {
  return Math.abs(r - KEY_R) <= KEY_TOL && Math.abs(g - KEY_G) <= KEY_TOL && Math.abs(b - KEY_B) <= KEY_TOL;
}

/** Drop the magenta plate so drawImage does not flash a pink square. */
function punchKey(img: HTMLImageElement, label: string): CanvasImageSource {
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
    return img;
  }
  ctx.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    console.warn(`VIRIDITE: could not read ${label}. The magenta plate lives in art.ts punchKey.`);
    return img;
  }
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    if (nearKey(px[i]!, px[i + 1]!, px[i + 2]!)) px[i + 3] = 0;
  }
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
    painted = {
      sand: img(0),
      deep: img(1),
      shallow: img(2),
      shore: img(3),
      rock: img(4),
      crystal: img(5),
      infantry: img(6),
      rocket: img(7),
      hull: img(8),
      turret: img(9),
      boat: img(10),
      heli: img(11),
      harvester: img(12),
      yard: img(13),
      power: img(14),
      barracks: img(15),
      factory: img(16),
      tower: img(17),
      refinery: img(18),
      supply,
      jungle,
      cliff,
      boom: boom.map((frame, i) => punchKey(frame, `boom-${i + 1}`)),
      scaffold: scaffold.map((frame, i) => punchKey(frame, `scaffold-${i + 1}`)),
    };
    const wait = ready.splice(0, ready.length);
    for (const fn of wait) fn();
  })();
}

if (typeof window !== "undefined") ensureArt();
