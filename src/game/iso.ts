/** Painted miniatures. Drawn over the map. The box models stay only where a picture is missing. */

export interface IsoBank {
  yard: HTMLImageElement;
  power: HTMLImageElement;
  barracks: HTMLImageElement;
  factory: HTMLImageElement;
  tower: HTMLImageElement;
  refinery: HTMLImageElement;
  supply: HTMLImageElement;
  rifle: HTMLImageElement;
  rocket: HTMLImageElement;
  marksman: HTMLImageElement;
  wader: HTMLImageElement;
  vanguard: HTMLImageElement;
  engineer: HTMLImageElement;
  tank: HTMLImageElement;
  medium: HTMLImageElement;
  scout: HTMLImageElement;
  razor: HTMLImageElement;
  scatter: HTMLImageElement;
  artillery: HTMLImageElement;
  apc: HTMLImageElement;
  harvester: HTMLImageElement;
  heli: HTMLImageElement;
  chinook: HTMLImageElement;
  attackheli: HTMLImageElement;
  bomber: HTMLImageElement;
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
    img.src = `/art/iso/${name}.png?v=4`;
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
      next[name] = loaded[i] as HTMLImageElement;
    });
    bank = next;
  })();
}

if (typeof window !== "undefined") ensureIso();
