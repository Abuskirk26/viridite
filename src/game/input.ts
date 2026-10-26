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
 *     one finger pans the field. A long-press then a drag draws a box even
 *     when Select is off. The Select button stays on until it is tapped again.
 *     A mouse drag still draws the rectangle.
 *   - While placing a structure, the ghost follows the pointer and snaps to the
 *     grid. A mouse click drops it (hold Shift to place another). Right-click
 *     or Escape cancels. A finger only moves the ghost; Confirm or Cancel
 *     beside it commits. Pinch zooms and does not cancel the ghost.
 *   - While placing a fence, drag along the ground. The ghost follows the
 *     finger. Lift to lay the run. Pinch zooms without dropping the tool.
 *   - Tap or drag the minimap: jump the camera. A tap while Attack-move is armed
 *     sends the selected units there. Double-tap jumps to base.
 *
 * Two fingers
 *   - Drag: pan. Pinch: zoom toward the fingers. Cancels a box-select in progress.
 *
 * Mouse extras (desktop preview only; touch is unchanged)
 *   - Wheel zooms toward the cursor. The Zoom buttons do the same around the view center.
 *   - Right-drag or middle-drag pans.
 */

import { MAP_H, MAP_W } from "./data.ts";
import { clampCamera, minimapHit, seekZoom, viewPitch, type Camera, type View } from "./view.ts";

export interface PointerDraft {
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  hoverX: number;
  hoverY: number;
  hovering: boolean;
  wallPts: { x: number; y: number }[];
  /** True after the place finger has moved. The ghost lifts only while this is set. */
  lift: boolean;
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
  onTap: (sx: number, sy: number, isDouble: boolean, shift?: boolean) => void;
  onBox: (box: { x0: number; y0: number; x1: number; y1: number }) => void;
  onMinimap: (wx: number, wy: number) => void;
  /** A short tap on the minimap. Attack-move uses this; drags stay camera-only. */
  onMinimapTap?: (wx: number, wy: number) => void;
  /** Double-tap on the minimap jumps the camera to the player's base. */
  onJumpBase?: () => void;
  /** Touch pans with one finger unless this is true. Mouse drag still boxes. */
  selectMode?: () => boolean;
  /** Attack-target mode. A drag pans. It never starts a selection box. */
  suppressBox?: () => boolean;
  placing?: () => boolean;
  /** Fence or structure ghost. */
  placingWall?: () => boolean;
  /** True while the active pointer is a finger. */
  onPointerKind?: (touch: boolean) => void;
  /** Confirm / Cancel painted beside a touch ghost. */
  placeUi?: (sx: number, sy: number) => "confirm" | "cancel" | null;
  onPlaceUi?: (action: "confirm" | "cancel") => void;
  /** Fired after pinch or wheel so the battle can ease the +/- rocker to the same zoom. */
  onZoom?: (zoom: number) => void;
  /** Screen-space polyline. A tap is a one-point run. */
  onWall?: (screenPts: { x: number; y: number }[]) => void;
  /**
   * When set, one-finger pan tracks the ground under the finger.
   * Absent on the 2D battlefield, which keeps dx/zoom.
   */
  projectGround?: (sx: number, sy: number) => { x: number; y: number } | null;
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
  let touchPinch = false;
  let suppressUntil = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let armedBox = false;
  let fromPending = false;
  let gestureCam: { x: number; y: number } | null = null;
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

  const clearHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
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

  const beginPinch = (dist: number, midX: number, midY: number) => {
    clearTap();
    hooks.draft.box = null;
    mode = "pinch";
    prevDist = dist || 1;
    prevMidX = midX;
    prevMidY = midY;
    hooks.camera.hold = true;
    hooks.camera.vx = 0;
    hooks.camera.vy = 0;
  };

  const groundDelta = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number) => {
    const cam = hooks.camera;
    const project = hooks.projectGround;
    if (project) {
      const a = project(x0, y0);
      const b = project(x1, y1);
      if (a && b) return { dxw: b.x - a.x, dyw: b.y - a.y };
    }
    return { dxw: dx / cam.zoom, dyw: dy / (cam.zoom * viewPitch()) };
  };

  const applyPan = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number) => {
    const cam = hooks.camera;
    const view = hooks.getView();
    const g = grid();
    const wz = !!hooks.warzone?.();
    const { dxw, dyw } = groundDelta(x0, y0, x1, y1, dx, dy);
    cam.x -= dxw;
    cam.y -= dyw;
    cam.hold = true;
    cam.vx = -dxw / 0.18;
    cam.vy = -dyw / 0.18;
    clampCamera(cam, g.w, g.h, view, wz);
  };

  const applyPinch = (dist: number, midX: number, midY: number) => {
    const cam = hooks.camera;
    const view = hooks.getView();
    const g = grid();
    const wz = !!hooks.warzone?.();
    const project = hooks.projectGround;
    if (project) {
      const a = project(prevMidX, prevMidY);
      const b = project(midX, midY);
      if (a && b) {
        cam.x -= b.x - a.x;
        cam.y -= b.y - a.y;
      } else {
        cam.x -= (midX - prevMidX) / cam.zoom;
        cam.y -= (midY - prevMidY) / (cam.zoom * viewPitch());
      }
    } else {
      cam.x -= (midX - prevMidX) / cam.zoom;
      cam.y -= (midY - prevMidY) / (cam.zoom * viewPitch());
    }
    seekZoom(cam, midX, midY, view, dist / (prevDist || 1), g.w, g.h, wz, project);
    hooks.onZoom?.(cam.aim ?? cam.zoom);
    prevDist = dist || 1;
    prevMidX = midX;
    prevMidY = midY;
  };

  const touchPoint = (t: Touch) => {
    const r = el.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button === 2) e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, px: p.x, py: p.y, button: e.button });
    hooks.onPointerKind?.(e.pointerType !== "mouse");
    hooks.camera.hold = true;
    hooks.camera.vx = 0;
    hooks.camera.vy = 0;
    hooks.draft.lift = false;

    if (pts.size >= 2) {
      const pair = pinchPair();
      if (pair) {
        beginPinch(
          Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1,
          (pair[0].x + pair[1].x) / 2,
          (pair[0].y + pair[1].y) / 2,
        );
      } else mode = "pinch";
      return;
    }

    const hit = minimapHit(p.x, p.y, hooks.getView(), grid().w, grid().h, !!hooks.warzone?.());
    if (hit && e.button === 0) {
      mode = "minimap";
      const now = performance.now();
      if (lastTap.pending && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 28) {
        clearTap();
        hooks.onJumpBase?.();
      } else {
        hooks.onMinimap(hit.x, hit.y);
        lastTap = { t: now, x: p.x, y: p.y, pending: true };
        tapTimer = setTimeout(() => {
          lastTap.pending = false;
          tapTimer = null;
        }, 320);
      }
      return;
    }
    if (e.button === 1 || (e.button === 2 && !hooks.placing?.())) {
      mode = "pan";
      return;
    }
    if (e.button === 2 && hooks.placing?.()) {
      mode = "pan";
      hooks.onPlaceUi?.("cancel");
      return;
    }
    const chrome = hooks.placing?.() && !hooks.placingWall?.() ? hooks.placeUi?.(p.x, p.y) : null;
    if (chrome) {
      mode = "pan";
      hooks.onPlaceUi?.(chrome);
      return;
    }
    hooks.draft.hoverX = p.x;
    hooks.draft.hoverY = p.y;
    hooks.draft.hovering = true;
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
    fromPending = false;
    gestureCam = { x: hooks.camera.x, y: hooks.camera.y };
    armedBox = !!hooks.selectMode?.() && !hooks.suppressBox?.();
    clearHold();
    if (!armedBox && !hooks.suppressBox?.() && e.pointerType !== "mouse") {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (mode === "pending") armedBox = true;
      }, 320);
    }
  };

  const onMove = (e: PointerEvent) => {
    const p = local(e);
    hooks.draft.hoverX = p.x;
    hooks.draft.hoverY = p.y;
    hooks.draft.hovering = true;
    hooks.onPointerKind?.(e.pointerType !== "mouse");
    const cur = pts.get(e.pointerId);
    if (!cur) return;
    const dx = p.x - cur.x;
    const dy = p.y - cur.y;
    cur.px = cur.x;
    cur.py = cur.y;
    cur.x = p.x;
    cur.y = p.y;

    if (mode === "pinch") {
      const pair = pinchPair();
      if (!pair) return;
      const dist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
      const midX = (pair[0].x + pair[1].x) / 2;
      const midY = (pair[0].y + pair[1].y) / 2;
      applyPinch(dist, midX, midY);
      return;
    }

    if (mode === "pan") {
      applyPan(p.x - dx, p.y - dy, p.x, p.y, dx, dy);
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
    if (mode === "place") {
      if (Math.hypot(p.x - cur.sx, p.y - cur.sy) > 8) hooks.draft.lift = true;
      return;
    }
    if (mode === "pending") {
      const moved = Math.hypot(p.x - cur.sx, p.y - cur.sy);
      // Attack-target mode: a short slide is still a tap. A real drag pans, and never boxes.
      const slop = hooks.suppressBox?.() ? 36 : 12;
      if (moved > slop) {
        clearHold();
        const strike = !!hooks.suppressBox?.();
        const touchPan = strike || (e.pointerType !== "mouse" && !hooks.selectMode?.() && !armedBox);
        if (touchPan) {
          mode = "pan";
          fromPending = true;
          applyPan(cur.px, cur.py, p.x, p.y, p.x - cur.px, p.y - cur.py);
        } else if (!strike) {
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

  const fireTap = (sx: number, sy: number, isDouble: boolean, shift = false) => {
    if (performance.now() < suppressUntil) return;
    hooks.onTap(sx, sy, isDouble, shift);
  };

  const onUp = (e: PointerEvent) => {
    const cur = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!cur) return;
    const p = local(e);
    try {

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
      const slide = Math.hypot(p.x - cur.sx, p.y - cur.sy);
      const tapLimit = hooks.suppressBox?.() ? 48 : e.pointerType !== "mouse" ? 28 : 10;
      if (mode === "pan" && fromPending && gestureCam && e.button === 0 && slide < tapLimit) {
        const cam = hooks.camera;
        cam.x = gestureCam.x;
        cam.y = gestureCam.y;
        cam.vx = 0;
        cam.vy = 0;
        const view = hooks.getView();
        const g = grid();
        clampCamera(cam, g.w, g.h, view, !!hooks.warzone?.());
        mode = "none";
        fromPending = false;
        fireTap(p.x, p.y, false);
        if (pts.size === 0) cam.hold = false;
        return;
      }
      if (mode === "minimap" && slide < 12) {
        const hit = minimapHit(p.x, p.y, hooks.getView(), grid().w, grid().h, !!hooks.warzone?.());
        if (hit) hooks.onMinimapTap?.(hit.x, hit.y);
      }
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
      hooks.draft.lift = false;
      if (performance.now() < suppressUntil) return;
      if (e.pointerType !== "mouse") return;
      fireTap(p.x, p.y, false, e.shiftKey);
      return;
    }
    if (mode === "box") {
      const box = hooks.draft.box;
      hooks.draft.box = null;
      mode = "none";
      const span = box ? Math.hypot(box.x1 - box.x0, box.y1 - box.y0) : 0;
      // A shaky finger is a tap. Attack mode never reaches here (it pans instead).
      if (box && span > 20 && !hooks.suppressBox?.()) hooks.onBox(box);
      else fireTap(p.x, p.y, false);
      return;
    }

    mode = "none";
    clearHold();
    const slop = hooks.suppressBox?.() ? 36 : 12;
    if (Math.hypot(p.x - cur.sx, p.y - cur.sy) > slop) return;
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
    } finally {
      if (pts.size === 0) hooks.camera.hold = false;
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = { x: e.clientX - el.getBoundingClientRect().left, y: e.clientY - el.getBoundingClientRect().top };
    const cam = hooks.camera;
    const view = hooks.getView();
    const g = grid();
    const factor = Math.exp(-e.deltaY * 0.0016);
    const wz = !!hooks.warzone?.();
    seekZoom(cam, p.x, p.y, view, factor, g.w, g.h, wz, hooks.projectGround);
    hooks.onZoom?.(cam.aim ?? cam.zoom);
  };

  const onCancel = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    hooks.draft.box = null;
    hooks.draft.wallPts = [];
    hooks.draft.lift = false;
    clearHold();
    if (pts.size === 0) mode = "none";
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length < 2) return;
    e.preventDefault();
    if (pts.size >= 2) return;
    const a = touchPoint(e.touches[0]!);
    const b = touchPoint(e.touches[1]!);
    touchPinch = true;
    beginPinch(Math.hypot(a.x - b.x, a.y - b.y) || 1, (a.x + b.x) / 2, (a.y + b.y) / 2);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length < 2) return;
    e.preventDefault();
    if (pts.size >= 2) return;
    const a = touchPoint(e.touches[0]!);
    const b = touchPoint(e.touches[1]!);
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    touchPinch = true;
    if (mode !== "pinch") {
      beginPinch(dist, midX, midY);
      return;
    }
    applyPinch(dist, midX, midY);
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length >= 2) {
      const a = touchPoint(e.touches[0]!);
      const b = touchPoint(e.touches[1]!);
      beginPinch(Math.hypot(a.x - b.x, a.y - b.y) || 1, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!touchPinch) return;
    touchPinch = false;
    if (mode === "pinch") {
      mode = "none";
      suppressUntil = performance.now() + 280;
      clearTap();
      hooks.draft.box = null;
    }
    if (e.touches.length === 0) hooks.camera.hold = false;
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd);
  el.addEventListener("touchcancel", onTouchEnd);
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  return () => {
    clearTap();
    clearHold();
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onCancel);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
  };
}
