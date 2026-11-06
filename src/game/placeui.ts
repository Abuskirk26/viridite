/**
 * Confirm / Cancel beside a placement ghost.
 * Buttons stay on the battlefield and off the minimap, A-MOVE stack, and army pad.
 */

import { minimapRect, worldToScreen, type Camera, type View } from "./view.ts";

export type ScreenRect = { x: number; y: number; w: number; h: number };

export const PLACE_BTN_W = 112;
export const PLACE_BTN_H = 48;

function overlaps(a: ScreenRect, b: ScreenRect, pad = 4): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

/** Screen rectangles the placement buttons must not cover. */
export function phonePlaceHud(view: View, warzone = false): ScreenRect[] {
  const mm = minimapRect(view, warzone);
  const landscape = view.w > view.h + 40;
  const short = view.h < 500;
  const bottomInset = landscape ? (short ? 8 : 64) : 12;
  const btn = 44;
  const gap = 8;
  const rightStack = btn * 3 + gap * 2;
  const leftStack = btn * 2 + gap;
  return [
    { x: mm.x - 6, y: mm.y - 6, w: mm.s + 12, h: mm.s + 12 },
    {
      x: view.w - 8 - btn - 6,
      y: view.h - bottomInset - rightStack - 6,
      w: btn + 20,
      h: rightStack + 12,
    },
    {
      x: 0,
      y: view.h - bottomInset - leftStack - 6,
      w: 8 + btn + 14,
      h: leftStack + 12,
    },
  ];
}

/** Mouse can edge-scroll. A finger, a placement, or the BUILD panel never does. */
export function allowEdgeScroll(kind: "mouse" | "touch", placing: boolean, panel: boolean, holding: boolean): boolean {
  return kind === "mouse" && !placing && !panel && !holding;
}

function inside(view: View, x: number, y: number, stack: number): boolean {
  const margin = 4;
  return x >= margin && y >= margin && x + PLACE_BTN_W <= view.w - margin && y + stack <= view.h - margin;
}

/**
 * Two stacked buttons beside the footprint, on the side that stays clear of `avoid`.
 * With an empty avoid list this matches the old right-then-left clamp.
 */
export function placeChrome(
  cam: Camera,
  view: View,
  tx: number,
  ty: number,
  w: number,
  h = w,
  project?: (wx: number, wy: number) => { x: number; y: number },
  avoid: ScreenRect[] = [],
): { confirm: ScreenRect; cancel: ScreenRect } {
  const bw = PLACE_BTN_W;
  const bh = PLACE_BTN_H;
  const gap = 10;
  const to = project ?? ((x: number, y: number) => worldToScreen(cam, x, y, view));
  const a = to(tx, ty);
  const b = to(tx + w, ty + h);
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  const stack = bh * 2 + 6;
  const midY = (top + bottom) / 2 - stack / 2;
  const midX = (left + right) / 2 - bw / 2;
  const raw = [
    { x: right + gap, y: midY },
    { x: left - gap - bw, y: midY },
    { x: midX, y: top - gap - stack },
    { x: midX, y: bottom + gap },
  ];
  const clear = (x: number, y: number) => {
    if (!inside(view, x, y, stack)) return false;
    const box = { x, y, w: bw, h: stack };
    return !avoid.some((block) => overlaps(box, block));
  };
  let pick = raw.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })).find((c) => clear(c.x, c.y));
  if (!pick) {
    let x = Math.round(right + gap);
    let y = Math.round(midY);
    if (x + bw > view.w - 4) x = Math.round(left - gap - bw);
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    if (y + stack > view.h - 4) y = Math.max(4, Math.round(view.h - 4 - stack));
    x = Math.max(4, Math.min(x, view.w - 4 - bw));
    y = Math.max(4, Math.min(y, view.h - 4 - stack));
    for (let i = 0; i < 12 && avoid.some((block) => overlaps({ x, y, w: bw, h: stack }, block)); i++) {
      const hit = avoid.find((block) => overlaps({ x, y, w: bw, h: stack }, block));
      if (!hit) break;
      const toLeft = x + bw / 2 > hit.x + hit.w / 2;
      x += toLeft ? -(hit.w + 8) : hit.w + 8;
      x = Math.max(4, Math.min(x, view.w - 4 - bw));
      if (avoid.some((block) => overlaps({ x, y, w: bw, h: stack }, block))) {
        y = Math.max(4, y - 28);
      }
    }
    x = Math.max(4, Math.min(x, view.w - 4 - bw));
    y = Math.max(4, Math.min(y, view.h - 4 - stack));
    pick = { x, y };
  }
  return {
    confirm: { x: pick.x, y: pick.y, w: bw, h: bh },
    cancel: { x: pick.x, y: pick.y + bh + 6, w: bw, h: bh },
  };
}
