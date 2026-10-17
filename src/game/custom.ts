/** Device maps and the share string. The JSON is the map. No official files. */

import type { Theater } from "./data.ts";
import { audit, lobbySize, type EditorDoc } from "./editor.ts";

export interface CustomMap {
  v: 1;
  id: string;
  name: string;
  size: number;
  w?: number;
  h?: number;
  template?: string;
  nudge?: number;
  theater: Theater;
  terrain: string;
  gems: [number, number, number][];
  starts: [number, number][];
  spans: [number, number][];
  docks: [number, number][];
}

const KEY = "viridite-custom-maps";

export function pack(doc: EditorDoc): CustomMap {
  const gems: [number, number, number][] = [];
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      const n = doc.crystal[y * doc.w + x] ?? 0;
      if (n > 0) gems.push([x, y, n]);
    }
  }
  return {
    v: 1,
    id: doc.id || makeId(doc.name),
    name: doc.name.trim() || "Untitled",
    size: Math.max(doc.w, doc.h),
    w: doc.w,
    h: doc.h,
    template: doc.template,
    nudge: doc.nudge,
    theater: doc.theater,
    terrain: rle(doc.terrain),
    gems,
    starts: doc.starts.map((s) => [Math.round(s.x * 2) / 2, Math.round(s.y * 2) / 2]),
    spans: doc.spans.map((s) => [s.tx, s.ty]),
    docks: doc.docks.map((d) => [d.tx, d.ty]),
  };
}

export function unpack(map: CustomMap): EditorDoc | null {
  if (!map || map.v !== 1) return null;
  const w = map.w ?? map.size;
  const h = map.h ?? map.size;
  if (w < 32 || h < 32 || w > 128 || h > 128 || w * h > 128 * 128) return null;
  const terrain = unrle(map.terrain, w * h);
  if (!terrain) return null;
  const crystal = new Uint16Array(w * h);
  for (const gem of map.gems ?? []) {
    const [x, y, n] = gem;
    if (x > 0 && y > 0 && x < w && y < h && n > 0) crystal[y * w + x] = n;
  }
  return {
    id: map.id,
    name: map.name || "Untitled",
    w,
    h,
    theater: map.theater === "snow" || map.theater === "temperate" ? map.theater : "desert",
    terrain,
    crystal,
    starts: (map.starts ?? []).slice(0, 4).map(([x, y]) => ({ x, y })),
    spans: (map.spans ?? []).map(([tx, ty]) => ({ tx, ty })),
    docks: (map.docks ?? []).map(([tx, ty]) => ({ tx, ty })),
    template: map.template || "",
    nudge: map.nudge ?? 0,
  };
}

export function shareCode(doc: EditorDoc): string {
  return `VIR1.${b64(JSON.stringify(pack(doc)))}`;
}

export function readShare(code: string): EditorDoc | null {
  const raw = code.trim();
  const body = raw.startsWith("VIR1.") ? raw.slice(5) : raw;
  try {
    const parsed = JSON.parse(unb64(body)) as CustomMap;
    return unpack(parsed);
  } catch {
    return null;
  }
}

export function listMaps(): CustomMap[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomMap[];
    return Array.isArray(parsed) ? parsed.filter((m) => m && m.v === 1 && typeof m.id === "string") : [];
  } catch {
    return [];
  }
}

export function loadMap(id: string): EditorDoc | null {
  const found = listMaps().find((m) => m.id === id);
  return found ? unpack(found) : null;
}

export function saveMap(doc: EditorDoc): { ok: true; id: string } | { ok: false; notes: string[] } {
  const notes = audit(doc);
  if (notes.length) return { ok: false, notes };
  const map = pack({ ...doc, id: doc.id || makeId(doc.name) });
  const rows = listMaps().filter((m) => m.id !== map.id);
  rows.unshift(map);
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 24)));
  } catch {
    return { ok: false, notes: ["This device would not store the map."] };
  }
  return { ok: true, id: map.id };
}

export function deleteMap(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listMaps().filter((m) => m.id !== id)));
  } catch {
    /* private mode */
  }
}

function makeId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "map";
  return `${slug}${Math.floor(Math.random() * 9000 + 1000)}`;
}

function rle(src: Uint8Array): string {
  const parts: number[] = [];
  let i = 0;
  while (i < src.length) {
    let n = 1;
    while (i + n < src.length && src[i + n] === src[i] && n < 255) n++;
    parts.push(n, src[i] ?? 0);
    i += n;
  }
  return bytesToB64(new Uint8Array(parts));
}

function unrle(code: string, length: number): Uint8Array | null {
  const raw = b64ToBytes(code);
  if (!raw) return null;
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 1 < raw.length && o < length; i += 2) {
    const n = raw[i] ?? 0;
    const v = raw[i + 1] ?? 0;
    for (let k = 0; k < n && o < length; k++) out[o++] = v;
  }
  return o === length ? out : null;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64ToBytes(code: string): Uint8Array | null {
  try {
    const pad = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "===".slice((pad.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unb64(code: string): string {
  const pad = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "===".slice((pad.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
