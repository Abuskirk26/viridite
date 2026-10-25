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

export function getRenderMode(): RenderMode {
  return mode;
}

export function setRenderMode(next: RenderMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode */
  }
  if (typeof history === "undefined" || typeof location === "undefined") return;
  const url = new URL(location.href);
  if (next === "3d") url.searchParams.set("render", "3d");
  else url.searchParams.delete("render");
  history.replaceState(null, "", url);
}
