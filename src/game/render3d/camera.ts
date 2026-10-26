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
/** Wider than the 2D zoom so a landscape phone shows the base and the field past it. */
export const CAM_SPAN = 1.58;

export function eyeOf(cam: Camera, view: View): { x: number; y: number; z: number } {
  const aspect = Math.max(0.2, view.w / Math.max(1, view.h));
  const span = (view.w / Math.max(1, cam.zoom)) * CAM_SPAN;
  const dist = span / (2 * Math.tan(CAM_FOV / 2) * aspect);
  return {
    x: cam.x,
    y: dist * Math.sin(CAM_PITCH),
    z: cam.y + dist * Math.cos(CAM_PITCH),
  };
}

interface Ray {
  eye: { x: number; y: number; z: number };
  dx: number;
  dy: number;
  dz: number;
}

/** Camera ray through a pixel. dy is negative when the ray points at the ground. */
function rayOf(cam: Camera, view: View, sx: number, sy: number): Ray | null {
  if (view.w < 2 || view.h < 2) return null;
  const eye = eyeOf(cam, view);
  const ndcX = (sx / view.w) * 2 - 1;
  const ndcY = -((sy / view.h) * 2 - 1);
  const aspect = view.w / view.h;
  const tanV = Math.tan(CAM_FOV / 2);
  const tanH = tanV * aspect;
  const sp = Math.sin(CAM_PITCH);
  const cp = Math.cos(CAM_PITCH);
  return {
    eye,
    dx: ndcX * tanH,
    dy: ndcY * tanV * cp - sp,
    dz: -ndcY * tanV * sp - cp,
  };
}

/** Screen pixel to the y = 0 ground plane. Null when the ray misses the ground. */
export function projectGround(cam: Camera, view: View, sx: number, sy: number): { x: number; y: number } | null {
  const ray = rayOf(cam, view, sx, sy);
  if (!ray || ray.dy >= -1e-5) return null;
  const t = -ray.eye.y / ray.dy;
  if (t < 0) return null;
  return { x: ray.eye.x + t * ray.dx, y: ray.eye.z + t * ray.dz };
}

/**
 * Screen pixel to the terrain surface. `heightAt` is world-up at a tile (x, y).
 * A hill pulls the hit toward the camera; a flat map matches the ground plane.
 */
export function projectSurface(
  cam: Camera,
  view: View,
  sx: number,
  sy: number,
  heightAt: (x: number, y: number) => number,
): { x: number; y: number } | null {
  const ray = rayOf(cam, view, sx, sy);
  if (!ray || ray.dy >= -1e-5) return projectGround(cam, view, sx, sy);
  const { eye, dx, dy, dz } = ray;
  let t0 = (2.4 - eye.y) / dy;
  let t1 = (-0.45 - eye.y) / dy;
  if (t1 < t0) {
    const swap = t0;
    t0 = t1;
    t1 = swap;
  }
  if (t1 < 0) return null;
  if (t0 < 0) t0 = 0;
  const steps = 32;
  let prevT = t0;
  let prevY = eye.y + t0 * dy;
  let prevH = heightAt(eye.x + t0 * dx, eye.z + t0 * dz);
  for (let i = 1; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const x = eye.x + t * dx;
    const z = eye.z + t * dz;
    const y = eye.y + t * dy;
    const h = heightAt(x, z);
    if (prevY > prevH && y <= h) {
      const span = prevY - prevH - (y - h);
      const u = span === 0 ? 0 : (prevY - prevH) / span;
      const tt = prevT + (t - prevT) * Math.min(1, Math.max(0, u));
      return { x: eye.x + tt * dx, y: eye.z + tt * dz };
    }
    prevT = t;
    prevY = y;
    prevH = h;
  }
  return projectGround(cam, view, sx, sy);
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
