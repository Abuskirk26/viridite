/** Painted miniatures. Drawn over the map. The box models stay only where a picture is missing. */

import { keySprite } from "./art.ts";

export interface IsoBank {
  yard: CanvasImageSource;
  power: CanvasImageSource;
  barracks: CanvasImageSource;
  factory: CanvasImageSource;
  tower: CanvasImageSource;
  refinery: CanvasImageSource;
  supply: CanvasImageSource;
  rifle: CanvasImageSource;
  rocket: CanvasImageSource;
  marksman: CanvasImageSource;
  wader: CanvasImageSource;
  vanguard: CanvasImageSource;
  engineer: CanvasImageSource;
  tank: CanvasImageSource;
  medium: CanvasImageSource;
  scout: CanvasImageSource;
  razor: CanvasImageSource;
  scatter: CanvasImageSource;
  artillery: CanvasImageSource;
  apc: CanvasImageSource;
  harvester: CanvasImageSource;
  heli: CanvasImageSource;
  chinook: CanvasImageSource;
  attackheli: CanvasImageSource;
  bomber: CanvasImageSource;
}

const NAMES = [
  "yard",
  "power",
  "barracks",
  "factory",
  "tower",
  "refinery",
  "supply",
  "rifle",
  "rocket",
  "marksman",
  "wader",
  "vanguard",
  "engineer",
  "tank",
  "medium",
  "scout",
  "razor",
  "scatter",
  "artillery",
  "apc",
  "harvester",
  "heli",
  "chinook",
  "attackheli",
  "bomber",
] as const;

let bank: IsoBank | null = null;
let started = false;

function load(name: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve(img);
    img.onload = () => {
      if (typeof img.decode === "function") void img.decode().then(done, done);
      else done();
    };
    img.onerror = () => resolve(null);
    img.src = `/art/iso/${name}.png?v=5`;
  });
}

export function iso(): IsoBank | null {
  return bank;
}

export function ensureIso(): void {
  if (bank || started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    const loaded = await Promise.all(NAMES.map((name) => load(name)));
    if (loaded.some((img) => !img)) {
      started = false;
      return;
    }
    const next = {} as IsoBank;
    NAMES.forEach((name, i) => {
      next[name] = keySprite(loaded[i] as HTMLImageElement, `iso/${name}`);
    });
    bank = next;
  })();
}

if (typeof window !== "undefined") ensureIso();
