/** Esri World Imagery mosaic. Same public satellite basemap a globe viewer uses. */

export interface SatSite {
  lat: number;
  lon: number;
  zoom: number;
  bounds?: { west: number; south: number; east: number; north: number };
}

const cache = new Map<string, HTMLCanvasElement>();
const inflight = new Map<string, Promise<HTMLCanvasElement | null>>();

function tileXY(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function fetchMosaic(site: SatSite): Promise<HTMLCanvasElement | null> {
  const z = site.zoom;
  const c = tileXY(site.lat, site.lon, z);
  const tiles = 3;
  const half = 1;
  const canvas = document.createElement("canvas");
  canvas.width = tiles * 256;
  canvas.height = tiles * 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#8a7048";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let ok = 0;
  const jobs: Promise<void>[] = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${c.y + dy}/${c.x + dx}`;
      jobs.push(
        loadImg(url).then((img) => {
          if (!img) return;
          ok += 1;
          ctx.drawImage(img, (dx + half) * 256, (dy + half) * 256);
        }),
      );
    }
  }
  await Promise.all(jobs);
  return ok > 0 ? canvas : null;
}

export function loadSatellite(id: string, site: SatSite): Promise<HTMLCanvasElement | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending) return pending;
  const job = fetchMosaic(site)
    .then((canvas) => {
      if (canvas) cache.set(id, canvas);
      inflight.delete(id);
      return canvas;
    })
    .catch(() => {
      inflight.delete(id);
      return null;
    });
  inflight.set(id, job);
  return job;
}

function tileFloat(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const clamped = Math.max(-85, Math.min(85, lat));
  const latRad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** One satellite photo stretched over the whole battlefield. Same Esri imagery a god's-eye globe uses. */
export function loadRegion(id: string, site: SatSite): Promise<HTMLCanvasElement | null> {
  const bounds = site.bounds;
  if (!bounds) return loadSatellite(id, site);
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending) return pending;
  const job = (async () => {
    const z = site.zoom;
    const nw = tileFloat(bounds.north, bounds.west, z);
    const se = tileFloat(bounds.south, bounds.east, z);
    const tx0 = Math.floor(nw.x);
    const ty0 = Math.floor(nw.y);
    const tx1 = Math.floor(se.x);
    const ty1 = Math.floor(se.y);
    const canvas = document.createElement("canvas");
    canvas.width = (tx1 - tx0 + 1) * 256;
    canvas.height = (ty1 - ty0 + 1) * 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#14384c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let ok = 0;
    const jobs: Promise<void>[] = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
        const dx = tx - tx0;
        const dy = ty - ty0;
        jobs.push(
          loadImg(url).then((img) => {
            if (!img) return;
            ok += 1;
            ctx.drawImage(img, dx * 256, dy * 256);
          }),
        );
      }
    }
    await Promise.all(jobs);
    if (!ok) return null;
    const crop = document.createElement("canvas");
    const sx = (nw.x - tx0) * 256;
    const sy = (nw.y - ty0) * 256;
    const sw = (se.x - nw.x) * 256;
    const sh = (se.y - nw.y) * 256;
    crop.width = Math.max(2, Math.round(sw));
    crop.height = Math.max(2, Math.round(sh));
    const cctx = crop.getContext("2d");
    if (!cctx) return null;
    cctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    return crop;
  })()
    .then((canvas) => {
      if (canvas) cache.set(id, canvas);
      inflight.delete(id);
      return canvas;
    })
    .catch(() => {
      inflight.delete(id);
      return null;
    });
  inflight.set(id, job);
  return job;
}

function mercY(lat: number): number {
  const lr = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(lr) + 1 / Math.cos(lr));
}

export function latLonToWorld(
  lat: number,
  lon: number,
  bounds: NonNullable<SatSite["bounds"]>,
  gw: number,
  gh: number,
): { x: number; y: number } {
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * gw;
  const y = ((mercY(lat) - mercY(bounds.north)) / (mercY(bounds.south) - mercY(bounds.north))) * gh;
  return { x, y };
}

function worldToLatLon(x: number, y: number, bounds: NonNullable<SatSite["bounds"]>, gw: number, gh: number): { lat: number; lon: number } {
  const lon = bounds.west + (x / gw) * (bounds.east - bounds.west);
  const t = y / gh;
  const north = mercY(bounds.north);
  const south = mercY(bounds.south);
  const m = north + t * (south - north);
  const lat = (Math.atan(Math.sinh(m)) * 180) / Math.PI;
  return { lat, lon };
}

function tileCorner(x: number, y: number, z: number): { lat: number; lon: number } {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
}

export interface SatPatch {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zoomed satellite around the camera so a close fight stays sharp. */
export function loadDetail(id: string, site: SatSite, wx: number, wy: number, gw: number, gh: number): Promise<SatPatch | null> {
  const bounds = site.bounds;
  if (!bounds) return Promise.resolve(null);
  const here = worldToLatLon(wx, wy, bounds, gw, gh);
  const z = 13;
  const c = tileXY(here.lat, here.lon, z);
  const key = `${id}:${z}:${c.x}:${c.y}`;
  const tx0 = c.x - 1;
  const ty0 = c.y - 1;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(patchFrom(hit, tx0, ty0, z, bounds, gw, gh));
  const pending = inflight.get(key);
  if (pending) return pending.then((canvas) => (canvas ? patchFrom(canvas, tx0, ty0, z, bounds, gw, gh) : null));
  const job = (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    let ok = 0;
    const jobs: Promise<void>[] = [];
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty0 + dy}/${tx0 + dx}`;
        jobs.push(
          loadImg(url).then((img) => {
            if (!img) return;
            ok += 1;
            ctx.drawImage(img, dx * 256, dy * 256);
          }),
        );
      }
    }
    await Promise.all(jobs);
    return ok > 0 ? canvas : null;
  })()
    .then((canvas) => {
      if (canvas) cache.set(key, canvas);
      inflight.delete(key);
      return canvas;
    })
    .catch(() => {
      inflight.delete(key);
      return null;
    });
  inflight.set(key, job);
  return job.then((canvas) => (canvas ? patchFrom(canvas, tx0, ty0, z, bounds, gw, gh) : null));
}

function patchFrom(
  canvas: HTMLCanvasElement,
  tx: number,
  ty: number,
  z: number,
  bounds: NonNullable<SatSite["bounds"]>,
  gw: number,
  gh: number,
): SatPatch {
  const nw = tileCorner(tx, ty, z);
  const se = tileCorner(tx + 3, ty + 3, z);
  const a = latLonToWorld(nw.lat, nw.lon, bounds, gw, gh);
  const b = latLonToWorld(se.lat, se.lon, bounds, gw, gh);
  const feathered = featherEdges(canvas);
  return { canvas: feathered, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

function featherEdges(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  const f = Math.max(48, Math.round(Math.min(src.width, src.height) * 0.28));
  const fade = (grd: CanvasGradient, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, w, h);
  };
  const left = ctx.createLinearGradient(0, 0, f, 0);
  left.addColorStop(0, "rgba(0,0,0,0)");
  left.addColorStop(1, "rgba(0,0,0,1)");
  fade(left, 0, 0, f, src.height);
  const right = ctx.createLinearGradient(src.width, 0, src.width - f, 0);
  right.addColorStop(0, "rgba(0,0,0,0)");
  right.addColorStop(1, "rgba(0,0,0,1)");
  fade(right, src.width - f, 0, f, src.height);
  const top = ctx.createLinearGradient(0, 0, 0, f);
  top.addColorStop(0, "rgba(0,0,0,0)");
  top.addColorStop(1, "rgba(0,0,0,1)");
  fade(top, 0, 0, src.width, f);
  const bottom = ctx.createLinearGradient(0, src.height, 0, src.height - f);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,1)");
  fade(bottom, 0, src.height - f, src.width, f);
  return c;
}
