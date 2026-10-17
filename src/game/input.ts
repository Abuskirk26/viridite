/**
 * VIRIDITE pointer scheme — phones first, no keyboard.
 *
 * One finger
 *   - Tap a unit or building: select it.
 *   - Tap empty ground with nothing selected: clear the selection.
 *   - Tap empty ground with units selected: move. The tap is delayed a
 *     quarter-second so a second tap can turn it into attack-move.
 *   - Tap an enemy with units selected: attack.
 *   - Double-tap empty ground: attack-move.
 *   - Drag on the ground: box-select, unless a phone is panning. On touch,
 *     one finger pans the field. Box-select is the Select button (selectMode).
 *     A mouse drag still draws the rectangle.
 *   - While placing a structure, a tap or drag drops the footprint above the
 *     finger (green = legal, red = the short reason). Pinch zooms and does not
 *     cancel the ghost. Only the Cancel button clears it.
 *   - While placing a fence, drag along the ground. The ghost follows the
 *     finger. Lift to lay the run. Pinch zooms without dropping the tool.
 *   - Tap or drag the minimap (top right): jump the camera.
 *
 * Two fingers
 *   - Drag: pan. Pinch: zoom toward the fingers. Cancels a box-select in progress.
 *
 * Mouse extras (desktop preview only; touch is unchanged)
 *   - Wheel zooms toward the cursor. +/- on the battle screen does the same.
 *   - Right-drag or middle-drag pans.
 */

import { MAP_H, MAP_W } from "./data.ts";
import { clampCamera, minimapHit, zoomAbout, viewPitch, type Camera, type View } from "./view.ts";

export interface PointerDraft {
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  hoverX: number;
  hoverY: number;
  hovering: boolean;
  wallPts: { x: number; y: number }[];
}

export interface InputHooks {
  camera: Camera;
  draft: PointerDraft;
  getView: () => View;
  /** World size for camera clamp and minimap jumps. Defaults to the 64² field. */
  grid?: () => { w: number; h: number };
  /** Warzone draws a larger minimap. */
  warzone?: () => boolean;
  /** "delay" holds a ground tap so double-tap can become attack-move. */
  classify: (sx: number, sy: number) => "immediate" | "delay";
  onTap: (sx: number, sy: number, isDouble: boolean) => void;
  onBox: (box: { x0: number; y0: number; x1: number; y1: number }) => void;
  onMinimap: (wx: number, wy: number) => void;
  /** Touch pans with one finger unless this is true. Mouse drag still boxes. */
  selectMode?: () => boolean;
  placing?: () => boolean;
  /** Fence or structure ghost. */
  placingWall?: () => boolean;
  /** Fired after pinch or wheel so the battle can ease the +/- rocker to the same zoom. */
  onZoom?: (zoom: number) => void;
  /** Screen-space polyline. A tap is a one-point run. */
  onWall?: (screenPts: { x: number; y: number }[]) => void;
}

interface Pt {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  px: number;
  py: number;
  button: number;
}

export function attachInput(el: HTMLElement, hooks: InputHooks): () => void {
  const pts = new Map<number, Pt>();
  let mode: "none" | "pending" | "box" | "pan" | "minimap" | "pinch" | "wall" | "place" = "none";
  let prevDist = 0;
  let prevMidX = 0;
  let prevMidY = 0;
  let suppressUntil = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTap = { t: 0, x: 0, y: 0, pending: false };

  const local = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clearTap = () => {
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = null;
    lastTap.pending = false;
  };

  const grid = () => hooks.grid?.() ?? { w: MAP_W, h: MAP_H };

  const pinchPair = (): [Pt, Pt] | null => {
    if (pts.size < 2) return null;
    const it = pts.values();
    const a = it.next().value;
    const b = it.next().value;
    if (!a || !b) return null;
    return [a, b];
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button === 2) e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, px: p.x, py: p.y, button: e.button });
    hooks.draft.hoverX = p.x;
    hooks.draft.hoverY = p.y;
    hooks.draft.hovering = true;

    if (pts.size >= 2) {
      clearTap();
      hooks.draft.box = null;
      mode = "pinch";
      const pair = pinchPair();
      if (pair) {
        prevDist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
        prevMidX = (pair[0].x + pair[1].x) / 2;
        prevMidY = (pair[0].y + pair[1].y) / 2;
      }
      return;
    }

    const hit = minimapHit(p.x, p.y, hooks.getView(), grid().w, grid().h, !!hooks.warzone?.());
    if (hit && e.button === 0) {
      mode = "minimap";
      hooks.onMinimap(hit.x, hit.y);
      return;
    }
    if (e.button === 1 || e.button === 2) {
      mode = "pan";
      return;
    }
    if (hooks.placingWall?.()) {
      mode = "wall";
      hooks.draft.wallPts = [{ x: p.x, y: p.y }];
      return;
    }
    if (hooks.placing?.()) {
      mode = "place";
      return;
    }
    mode = "pending";
  };

  const onMove = (e: PointerEvent) => {
    const cur = pts.get(e.pointerId);
    if (!cur) return;
    const p = local(e);
    const dx = p.x - cur.x;
    const dy = p.y - cur.y;
    cur.px = cur.x;
    cur.py = cur.y;
    cur.x = p.x;
    cur.y = p.y;
    hooks.draft.hoverX = p.x;
    hooks.draft.hoverY = p.y;
    hooks.draft.hovering = true;

    if (mode === "pinch") {
      const pair = pinchPair();
      if (!pair) return;
      const dist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
      const midX = (pair[0].x + pair[1].x) / 2;
      const midY = (pair[0].y + pair[1].y) / 2;
      const cam = hooks.camera;
      const view = hooks.getView();
      const g = grid();
      cam.x -= (midX - prevMidX) / cam.zoom;
      cam.y -= (midY - prevMidY) / (cam.zoom * viewPitch());
      zoomAbout(cam, midX, midY, view, cam.zoom * (dist / prevDist), g.w, g.h);
      hooks.onZoom?.(cam.zoom);
      prevDist = dist;
      prevMidX = midX;
      prevMidY = midY;
      return;
    }

    if (mode === "pan") {
      hooks.camera.x -= dx / hooks.camera.zoom;
      hooks.camera.y -= dy / (hooks.camera.zoom * viewPitch());
      clampCamera(hooks.camera, grid().w, grid().h);
      return;
    }
    if (mode === "minimap") {
      const hit = minimapHit(p.x, p.y, hooks.getView(), grid().w, grid().h, !!hooks.warzone?.());
      if (hit) hooks.onMinimap(hit.x, hit.y);
      return;
    }
    if (mode === "wall") {
      const run = hooks.draft.wallPts;
      const last = run[run.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 6) run.push({ x: p.x, y: p.y });
      return;
    }
    if (mode === "place") return;
    if (mode === "pending") {
      if (Math.hypot(p.x - cur.sx, p.y - cur.sy) > 12) {
        const touchPan = e.pointerType !== "mouse" && !hooks.selectMode?.();
        if (touchPan) {
          mode = "pan";
          hooks.camera.x -= (p.x - cur.px) / hooks.camera.zoom;
          hooks.camera.y -= (p.y - cur.py) / (hooks.camera.zoom * viewPitch());
          clampCamera(hooks.camera, grid().w, grid().h);
        } else {
          mode = "box";
          hooks.draft.box = { x0: cur.sx, y0: cur.sy, x1: p.x, y1: p.y };
        }
      }
      return;
    }
    if (mode === "box") {
      hooks.draft.box = { x0: cur.sx, y0: cur.sy, x1: p.x, y1: p.y };
    }
  };

  const fireTap = (sx: number, sy: number, isDouble: boolean) => {
    if (performance.now() < suppressUntil) return;
    hooks.onTap(sx, sy, isDouble);
  };

  const onUp = (e: PointerEvent) => {
    const cur = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!cur) return;
    const p = local(e);

    if (mode === "pinch") {
      if (pts.size === 0) {
        mode = "none";
        suppressUntil = performance.now() + 280;
        clearTap();
      } else if (pts.size === 1) {
        mode = hooks.placingWall?.() ? "wall" : hooks.placing?.() ? "place" : "none";
        suppressUntil = performance.now() + 280;
        clearTap();
      }
      return;
    }
    if (mode === "pan" || mode === "minimap") {
      if (pts.size === 0) mode = "none";
      return;
    }
    if (mode === "wall") {
      const run = hooks.draft.wallPts.slice();
      hooks.draft.wallPts = [];
      mode = "none";
      if (performance.now() < suppressUntil) return;
      if (run.length) hooks.onWall?.(run);
      return;
    }
    if (mode === "place") {
      mode = "none";
      if (performance.now() < suppressUntil) return;
      fireTap(p.x, p.y, false);
      return;
    }
    if (mode === "box") {
      const box = hooks.draft.box;
      hooks.draft.box = null;
      mode = "none";
      if (box && Math.hypot(box.x1 - box.x0, box.y1 - box.y0) > 14) hooks.onBox(box);
      return;
    }

    mode = "none";
    if (Math.hypot(p.x - cur.sx, p.y - cur.sy) > 12) return;
    const now = performance.now();
    if (lastTap.pending && now - lastTap.t < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 32) {
      clearTap();
      const ground = hooks.classify(p.x, p.y) === "delay";
      fireTap(p.x, p.y, ground);
      return;
    }
    if (hooks.classify(p.x, p.y) === "immediate") {
      clearTap();
      lastTap = { t: now, x: p.x, y: p.y, pending: false };
      fireTap(p.x, p.y, false);
      return;
    }
    lastTap = { t: now, x: p.x, y: p.y, pending: true };
    tapTimer = setTimeout(() => {
      lastTap.pending = false;
      tapTimer = null;
      fireTap(lastTap.x, lastTap.y, false);
    }, 230);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = { x: e.clientX - el.getBoundingClientRect().left, y: e.clientY - el.getBoundingClientRect().top };
    const cam = hooks.camera;
    const view = hooks.getView();
    const g = grid();
    const factor = Math.exp(-e.deltaY * 0.0016);
    zoomAbout(cam, p.x, p.y, view, cam.zoom * factor, g.w, g.h);
    hooks.onZoom?.(cam.zoom);
  };

  const onCancel = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    hooks.draft.box = null;
    hooks.draft.wallPts = [];
    if (pts.size === 0) mode = "none";
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  return () => {
    clearTap();
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onCancel);
    el.removeEventListener("wheel", onWheel);
  };
}
