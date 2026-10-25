/** 2D stays the default. `?render=3d` or the Video setting turns the WebGL view on. */

const KEY = "viridite-render";

export type RenderMode = "2d" | "3d";

function stored(): RenderMode {
  try {
    return localStorage.getItem(KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

function fromLocation(): RenderMode | null {
  if (typeof location === "undefined") return null;
  const q = new URLSearchParams(location.search).get("render");
  if (q === "3d" || q === "2d") return q;
  return null;
}

let mode: RenderMode = typeof window === "undefined" ? "2d" : (fromLocation() ?? stored());

const listeners = new Set<(mode: RenderMode) => void>();

export function getRenderMode(): RenderMode {
  return mode;
}

/** Lobby, pause, and the Video tab all read this, so a pick in one place updates the others. */
export function subscribeRenderMode(fn: (mode: RenderMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setRenderMode(next: RenderMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode */
  }
  if (typeof history !== "undefined" && typeof location !== "undefined") {
    const url = new URL(location.href);
    if (next === "3d") url.searchParams.set("render", "3d");
    else url.searchParams.delete("render");
    history.replaceState(null, "", url);
  }
  for (const fn of listeners) fn(mode);
}
