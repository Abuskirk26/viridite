/**
 * Fixed Art of War 3 camera.
 * World X is the tile column, world Z is the tile row, Y is up.
 * Pitch is 52° off the horizontal. Yaw is fixed: the camera sits south of
 * the look point and looks north. Zoom is the logical camera's pixels per tile,
 * so pinch limits and the minimap stay the ones the sim already uses.
 * Taps hit the flat ground plane (y = 0), the same grid the simulation walks.
 */

import type { Camera, View } from "../view.ts";

export const CAM_PITCH = (52 * Math.PI) / 180;
export const CAM_FOV = (46 * Math.PI) / 180;

export function eyeOf(cam: Camera, view: View): { x: number; y: number; z: number } {
  const aspect = Math.max(0.2, view.w / Math.max(1, view.h));
  const span = view.w / Math.max(1, cam.zoom);
  const dist = span / (2 * Math.tan(CAM_FOV / 2) * aspect);
  return {
    x: cam.x,
    y: dist * Math.sin(CAM_PITCH),
    z: cam.y + dist * Math.cos(CAM_PITCH),
  };
}

/** Screen pixel to the y = 0 ground plane. Null when the ray misses the ground. */
export function projectGround(cam: Camera, view: View, sx: number, sy: number): { x: number; y: number } | null {
  if (view.w < 2 || view.h < 2) return null;
  const eye = eyeOf(cam, view);
  const ndcX = (sx / view.w) * 2 - 1;
  const ndcY = -((sy / view.h) * 2 - 1);
  const aspect = view.w / view.h;
  const tanV = Math.tan(CAM_FOV / 2);
  const tanH = tanV * aspect;
  const sp = Math.sin(CAM_PITCH);
  const cp = Math.cos(CAM_PITCH);
  const dx = ndcX * tanH;
  const dy = ndcY * tanV * cp - sp;
  const dz = -ndcY * tanV * sp - cp;
  if (dy >= -1e-5) return null;
  const t = -eye.y / dy;
  if (t < 0) return null;
  return { x: eye.x + t * dx, y: eye.z + t * dz };
}

/** World tile (wx, wy) on the ground plane to a screen pixel. */
export function projectWorld(cam: Camera, view: View, wx: number, wy: number, lift = 0): { x: number; y: number } {
  const eye = eyeOf(cam, view);
  const vx = wx - eye.x;
  const vy = lift - eye.y;
  const vz = wy - eye.z;
  const sp = Math.sin(CAM_PITCH);
  const cp = Math.cos(CAM_PITCH);
  const right = vx;
  const up = vy * cp - vz * sp;
  const depth = -vy * sp - vz * cp;
  if (depth < 0.05) return { x: -9999, y: -9999 };
  const aspect = view.w / Math.max(1, view.h);
  const tanV = Math.tan(CAM_FOV / 2);
  const tanH = tanV * aspect;
  const ndcX = right / (depth * tanH);
  const ndcY = up / (depth * tanV);
  return {
    x: (ndcX + 1) * 0.5 * view.w,
    y: (1 - ndcY) * 0.5 * view.h,
  };
}
