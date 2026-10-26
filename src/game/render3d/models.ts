/**
 * Placeholder meshes. A real model replaces one by file name:
 * drop `public/art/models/<kind>.glb` (rifle.glb, yard.glb, …).
 * Name a mesh or material `team` and it takes the seat colour
 * (cyan, orange, purple, yellow). Anything else keeps the placeholder paint.
 */

import * as THREE from "three";
import { teamStyle } from "../data.ts";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
const CONE = new THREE.ConeGeometry(0.5, 1, 7);
const ICO = new THREE.IcosahedronGeometry(0.5, 0);

const PAINT: Record<string, THREE.MeshStandardMaterial> = {
  cloth: new THREE.MeshStandardMaterial({ color: 0x6e675c, roughness: 0.86 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x59636a, roughness: 0.42, metalness: 0.38 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.72 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8c867e, roughness: 0.92 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x6d4534, roughness: 0.78 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xb7d0ce, roughness: 0.18, metalness: 0.04 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.84 }),
  dome: new THREE.MeshStandardMaterial({ color: 0x2a6570, roughness: 0.22, transparent: true, opacity: 0.78 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f6a34, roughness: 0.9 }),
  pine: new THREE.MeshStandardMaterial({ color: 0x1d4a32, roughness: 0.9 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.9 }),
  palm: new THREE.MeshStandardMaterial({ color: 0x3c8a40, roughness: 0.85 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xc2ae86, roughness: 0.95 }),
};

function matOf(name: string): THREE.Material {
  return PAINT[name] ?? PAINT.concrete!;
}

function box(g: THREE.Group, paint: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, name = "") {
  const m = new THREE.Mesh(BOX, paint === "team" ? teamMat() : matOf(paint));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name || paint === "team") m.name = name || "team";
  g.add(m);
}

function cyl(g: THREE.Group, paint: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, name = "") {
  const m = new THREE.Mesh(CYL, matOf(paint));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  g.add(m);
}

function cone(g: THREE.Group, paint: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(CONE, matOf(paint));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  g.add(m);
}

function teamMat(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.05, emissive: 0x000000, emissiveIntensity: 0.18 });
  return m;
}

function group(): THREE.Group {
  return new THREE.Group();
}

function person(g: THREE.Group, gun: "rifle" | "tube" | "long" | "pack" | "none", tall = 1) {
  box(g, "cloth", 0, 0.28 * tall, 0, 0.18, 0.28 * tall, 0.14);
  box(g, "dark", 0, 0.48 * tall, 0, 0.12, 0.12, 0.12);
  box(g, "team", 0, 0.16 * tall, 0, 0.2, 0.06, 0.16);
  if (gun === "rifle") box(g, "dark", 0.22, 0.3 * tall, 0, 0.34, 0.04, 0.04);
  if (gun === "tube") cyl(g, "dark", 0.16, 0.4 * tall, 0.08, 0.08, 0.36, 0.08);
  if (gun === "long") box(g, "dark", 0.34, 0.32 * tall, 0, 0.62, 0.035, 0.035);
  if (gun === "pack") box(g, "steel", 0, 0.32 * tall, -0.1, 0.14, 0.16, 0.1);
}

const UNIT: Record<string, (g: THREE.Group) => void> = {
  rifle: (g) => person(g, "rifle"),
  rocket: (g) => person(g, "tube", 1.05),
  marksman: (g) => {
    box(g, "cloth", 0.05, 0.12, 0, 0.42, 0.12, 0.16);
    box(g, "dark", 0, 0.22, 0, 0.12, 0.1, 0.12);
    box(g, "team", 0, 0.08, 0, 0.22, 0.04, 0.16);
    box(g, "dark", 0.4, 0.16, 0, 0.7, 0.03, 0.03);
  },
  wader: (g) => person(g, "rifle", 1.25),
  scatter: (g) => {
    person(g, "none");
    box(g, "dark", 0.16, 0.28, 0.06, 0.22, 0.06, 0.1);
    box(g, "dark", 0.16, 0.28, -0.06, 0.22, 0.06, 0.1);
  },
  engineer: (g) => person(g, "pack", 0.92),
  vanguard: (g) => {
    person(g, "rifle", 1.08);
    box(g, "steel", 0, 0.34, 0.12, 0.22, 0.16, 0.06);
  },
  scout: (g) => {
    box(g, "steel", 0, 0.22, 0, 0.62, 0.22, 0.36);
    box(g, "glass", 0.12, 0.38, 0, 0.22, 0.14, 0.28);
    cyl(g, "dark", 0.18, 0.12, 0.2, 0.16, 0.1, 0.16);
    cyl(g, "dark", -0.18, 0.12, 0.2, 0.16, 0.1, 0.16);
    cyl(g, "dark", 0.18, 0.12, -0.2, 0.16, 0.1, 0.16);
    cyl(g, "dark", -0.18, 0.12, -0.2, 0.16, 0.1, 0.16);
    box(g, "team", 0, 0.34, 0, 0.28, 0.05, 0.3);
  },
  tank: (g) => {
    box(g, "steel", 0, 0.22, 0, 0.85, 0.26, 0.55);
    box(g, "dark", 0, 0.4, 0, 0.36, 0.16, 0.36);
    box(g, "dark", 0.42, 0.4, 0, 0.55, 0.06, 0.06);
    box(g, "team", 0, 0.5, 0, 0.22, 0.05, 0.22);
  },
  medium: (g) => {
    box(g, "steel", 0, 0.24, 0, 0.95, 0.3, 0.62);
    box(g, "dark", 0.02, 0.46, 0, 0.42, 0.2, 0.42);
    box(g, "dark", 0.5, 0.46, 0, 0.62, 0.07, 0.07);
    box(g, "team", 0, 0.58, 0, 0.24, 0.05, 0.24);
  },
  razor: (g) => {
    box(g, "steel", 0.05, 0.16, 0, 0.9, 0.16, 0.48);
    box(g, "dark", 0.35, 0.26, 0, 0.4, 0.06, 0.08);
    box(g, "team", -0.1, 0.26, 0, 0.2, 0.04, 0.36);
  },
  harvester: (g) => {
    box(g, "steel", -0.1, 0.28, 0, 0.7, 0.32, 0.48);
    box(g, "wood", 0.45, 0.24, 0, 0.55, 0.22, 0.46);
    box(g, "dark", 0.85, 0.16, 0, 0.28, 0.12, 0.36);
    box(g, "team", -0.1, 0.46, 0, 0.3, 0.05, 0.3);
  },
  mcv: (g) => {
    box(g, "concrete", -0.05, 0.4, 0, 1.15, 0.55, 0.62);
    box(g, "glass", 0.42, 0.48, 0, 0.28, 0.22, 0.48);
    box(g, "dark", -0.15, 0.78, 0, 0.16, 0.28, 0.16);
    box(g, "team", 0, 0.7, 0.32, 0.4, 0.08, 0.04);
  },
  artillery: (g) => {
    box(g, "steel", -0.05, 0.2, 0, 0.8, 0.22, 0.5);
    box(g, "dark", 0.35, 0.42, 0, 0.9, 0.06, 0.06);
    box(g, "dark", 0.15, 0.32, 0, 0.2, 0.12, 0.2);
    box(g, "team", -0.2, 0.34, 0, 0.2, 0.05, 0.28);
  },
  apc: (g) => {
    box(g, "steel", 0, 0.28, 0, 0.95, 0.36, 0.48);
    box(g, "glass", 0.32, 0.4, 0, 0.2, 0.12, 0.36);
    box(g, "team", -0.05, 0.48, 0, 0.4, 0.05, 0.3);
  },
  gunboat: (g) => {
    box(g, "steel", 0, 0.12, 0, 0.95, 0.14, 0.32);
    box(g, "dark", -0.05, 0.28, 0, 0.28, 0.16, 0.22);
    box(g, "dark", 0.28, 0.28, 0, 0.28, 0.05, 0.05);
    box(g, "team", 0, 0.22, 0, 0.3, 0.04, 0.22);
  },
  frigate: (g) => {
    box(g, "steel", 0, 0.14, 0, 1.35, 0.16, 0.34);
    box(g, "dark", -0.15, 0.32, 0, 0.4, 0.22, 0.26);
    box(g, "dark", 0.35, 0.28, 0, 0.4, 0.05, 0.05);
    box(g, "team", -0.15, 0.46, 0, 0.22, 0.04, 0.2);
  },
  missile: (g) => {
    box(g, "steel", 0, 0.12, 0, 1.05, 0.14, 0.32);
    box(g, "dark", 0.05, 0.4, 0, 0.22, 0.4, 0.22);
    box(g, "team", -0.3, 0.24, 0, 0.18, 0.05, 0.22);
  },
  transport: (g) => {
    box(g, "steel", 0, 0.1, 0, 1.25, 0.12, 0.48);
    box(g, "wood", 0, 0.2, 0, 0.9, 0.06, 0.4);
    box(g, "team", -0.4, 0.2, 0, 0.16, 0.06, 0.3);
  },
  chinook: (g) => {
    box(g, "steel", 0, 0.16, 0, 1.15, 0.22, 0.28);
    cyl(g, "dark", -0.32, 0.34, 0, 0.7, 0.03, 0.08, "rotor");
    cyl(g, "dark", 0.32, 0.34, 0, 0.7, 0.03, 0.08, "rotor");
    box(g, "team", 0, 0.28, 0, 0.2, 0.04, 0.22);
  },
  attackheli: (g) => {
    box(g, "steel", 0, 0.16, 0, 0.85, 0.22, 0.26);
    box(g, "dark", 0.15, 0.16, 0.28, 0.4, 0.04, 0.16);
    box(g, "dark", 0.15, 0.16, -0.28, 0.4, 0.04, 0.16);
    cyl(g, "dark", 0, 0.34, 0, 0.78, 0.03, 0.08, "rotor");
    box(g, "dark", 0.48, 0.16, 0, 0.28, 0.05, 0.05);
    box(g, "team", -0.1, 0.28, 0, 0.18, 0.04, 0.2);
  },
  bomber: (g) => {
    box(g, "steel", 0, 0.14, 0, 0.9, 0.16, 0.22);
    box(g, "dark", 0, 0.16, 0, 0.4, 0.04, 1.15);
    box(g, "dark", -0.35, 0.2, 0, 0.16, 0.12, 0.04);
    box(g, "team", 0.1, 0.26, 0, 0.16, 0.04, 0.16);
  },
};

const HALL: Record<string, (g: THREE.Group) => void> = {
  yard: (g) => {
    box(g, "concrete", 0, 0.25, 0, 2.4, 0.4, 2.4);
    box(g, "steel", 0.7, 0.9, 0.4, 0.12, 1.3, 0.12);
    box(g, "dark", 0.15, 1.45, 0.4, 0.9, 0.08, 0.08);
    box(g, "roof", -0.45, 0.6, -0.4, 0.9, 0.45, 0.7);
    box(g, "team", -0.45, 0.86, -0.4, 0.5, 0.06, 0.5);
  },
  power: (g) => {
    box(g, "concrete", 0, 0.4, 0, 1.5, 0.7, 1.5);
    cyl(g, "dark", -0.35, 1.05, 0.2, 0.28, 0.7, 0.28);
    cyl(g, "dark", 0.35, 0.95, -0.15, 0.22, 0.5, 0.22);
    box(g, "team", 0, 0.78, 0.76, 0.5, 0.16, 0.04);
  },
  advpower: (g) => {
    box(g, "concrete", 0, 0.45, 0, 1.7, 0.8, 1.6);
    cyl(g, "steel", -0.4, 1.15, 0, 0.55, 0.7, 0.55);
    cyl(g, "steel", 0.4, 1.15, 0, 0.55, 0.7, 0.55);
    cyl(g, "dark", -0.4, 1.55, 0, 0.22, 0.16, 0.22);
    cyl(g, "dark", 0.4, 1.55, 0, 0.22, 0.16, 0.22);
    box(g, "team", 0, 0.9, 0.8, 0.6, 0.12, 0.04);
  },
  refinery: (g) => {
    box(g, "concrete", -0.2, 0.45, 0, 1.6, 0.8, 1.5);
    box(g, "steel", 0.85, 0.35, 0, 0.7, 0.28, 0.4);
    box(g, "dark", 0.4, 0.7, 0.55, 0.9, 0.1, 0.1);
    box(g, "team", -0.2, 0.9, 0, 0.5, 0.08, 0.5);
  },
  silo: (g) => {
    cyl(g, "concrete", 0, 0.7, 0, 0.7, 1.3, 0.7);
    cyl(g, "roof", 0, 1.4, 0, 0.78, 0.12, 0.78);
    box(g, "team", 0, 0.9, 0.36, 0.28, 0.2, 0.04);
  },
  supply: (g) => {
    box(g, "concrete", 0, 0.35, 0, 1.7, 0.55, 1.4);
    box(g, "roof", 0, 0.7, 0, 1.8, 0.16, 1.5);
    box(g, "wood", 0.4, 0.45, 0.72, 0.4, 0.3, 0.06);
    box(g, "team", -0.4, 0.82, 0, 0.4, 0.06, 0.4);
  },
  barracks: (g) => {
    box(g, "concrete", 0, 0.4, 0, 1.7, 0.65, 1.15);
    box(g, "roof", 0, 0.78, 0, 1.8, 0.12, 1.25);
    box(g, "dark", 0, 0.28, 0.58, 0.28, 0.4, 0.06);
    box(g, "team", 0, 0.55, 0.58, 0.5, 0.1, 0.04);
  },
  stealth: (g) => {
    box(g, "dark", 0, 0.28, 0, 1.5, 0.4, 1.3);
    cyl(g, "dome", 0, 0.7, 0, 1.05, 0.55, 1.05);
    box(g, "team", 0, 0.5, 0.66, 0.4, 0.08, 0.04);
  },
  factory: (g) => {
    box(g, "concrete", 0, 0.5, 0, 2.3, 0.85, 2.1);
    box(g, "dark", 0, 0.4, 1.05, 1.1, 0.6, 0.08);
    box(g, "roof", 0, 0.98, -0.2, 2.4, 0.12, 1.5);
    box(g, "team", 0, 1.08, -0.2, 0.6, 0.06, 0.5);
  },
  dock: (g) => {
    box(g, "wood", 0, 0.12, 0.2, 1.8, 0.12, 0.7);
    box(g, "wood", 0, 0.12, -0.55, 0.35, 0.1, 0.9);
    box(g, "steel", 0.55, 0.7, 0.15, 0.1, 1.0, 0.1);
    box(g, "dark", 0.15, 1.15, 0.15, 0.7, 0.06, 0.06);
    box(g, "team", -0.4, 0.28, 0.2, 0.3, 0.08, 0.3);
  },
  helipad: (g) => {
    box(g, "concrete", 0, 0.08, 0, 1.8, 0.1, 1.8);
    box(g, "sand", 0, 0.15, 0, 0.16, 0.06, 0.7);
    box(g, "sand", -0.22, 0.15, 0.22, 0.4, 0.06, 0.14);
    box(g, "sand", 0.22, 0.15, -0.22, 0.4, 0.06, 0.14);
    box(g, "steel", -0.7, 0.35, -0.7, 0.35, 0.4, 0.35);
    box(g, "team", -0.7, 0.58, -0.7, 0.28, 0.06, 0.28);
  },
  tower: (g) => {
    box(g, "concrete", 0, 0.15, 0, 0.7, 0.2, 0.7);
    box(g, "steel", 0, 0.7, 0, 0.16, 0.9, 0.16);
    box(g, "dark", 0, 1.2, 0, 0.4, 0.22, 0.4);
    box(g, "dark", 0.22, 1.2, 0, 0.28, 0.06, 0.06);
    box(g, "team", 0, 1.34, 0, 0.28, 0.05, 0.28);
  },
  aa: (g) => {
    box(g, "concrete", 0, 0.15, 0, 0.75, 0.22, 0.75);
    box(g, "steel", 0, 0.45, 0, 0.18, 0.4, 0.18);
    box(g, "dark", 0.16, 0.7, 0.1, 0.45, 0.08, 0.1);
    box(g, "dark", 0.16, 0.78, -0.08, 0.45, 0.08, 0.1);
    box(g, "team", 0, 0.3, 0.38, 0.3, 0.08, 0.04);
  },
  radar: (g) => {
    box(g, "concrete", 0, 0.12, 0, 0.7, 0.16, 0.7);
    box(g, "steel", 0, 0.7, 0, 0.1, 1.05, 0.1);
    cyl(g, "glass", 0.16, 1.15, 0, 0.55, 0.08, 0.55);
    box(g, "team", 0, 0.28, 0.36, 0.28, 0.08, 0.04);
  },
  sandbag: (g) => {
    box(g, "sand", 0, 0.12, 0, 0.9, 0.2, 0.38);
    box(g, "team", 0, 0.24, 0, 0.28, 0.05, 0.28);
  },
  wall: (g) => {
    box(g, "concrete", 0, 0.35, 0, 0.92, 0.62, 0.28);
    box(g, "team", 0, 0.68, 0, 0.3, 0.06, 0.22);
  },
  gate: (g) => {
    box(g, "concrete", 0, 0.4, -0.28, 0.28, 0.75, 0.24);
    box(g, "concrete", 0, 0.4, 0.28, 0.28, 0.75, 0.24);
    box(g, "steel", 0, 0.72, 0, 0.2, 0.08, 0.7);
    box(g, "team", 0, 0.84, 0, 0.16, 0.06, 0.4);
  },
  span: (g) => {
    box(g, "wood", 0, 0.08, 0, 2.6, 0.1, 0.7);
    box(g, "team", 0, 0.16, 0, 0.4, 0.04, 0.4);
  },
};

const templates = new Map<string, THREE.Group>();

function build(kind: string): THREE.Group {
  const g = group();
  const unit = UNIT[kind];
  const hall = HALL[kind];
  if (unit) unit(g);
  else if (hall) hall(g);
  else {
    box(g, "concrete", 0, 0.3, 0, 0.6, 0.5, 0.6);
    box(g, "team", 0, 0.58, 0, 0.3, 0.06, 0.3);
  }
  g.userData.kind = kind;
  return g;
}

export function modelUrl(kind: string): string {
  return `/art/models/${kind}.glb`;
}

export function placeholder(kind: string): THREE.Group {
  let src = templates.get(kind);
  if (!src) {
    src = build(kind);
    templates.set(kind, src);
  }
  const g = src.clone(true);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.name === "team" && mesh.material instanceof THREE.Material) {
      mesh.material = mesh.material.clone();
    }
  });
  g.userData.kind = kind;
  return g;
}

export function paintTeam(root: THREE.Object3D, team: number) {
  const style = teamStyle(team);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.name !== "team") return;
    const material = mesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    if (mesh.userData.seat === style.color) return;
    material.color.set(style.color);
    material.emissive.set(style.color);
    mesh.userData.seat = style.color;
  });
}

function baked(root: THREE.Group): THREE.BufferGeometry {
  const parts: { pos: Float32Array; nrm: Float32Array }[] = [];
  let count = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry.clone();
    src.applyMatrix4(mesh.matrixWorld);
    const flat = src.index ? src.toNonIndexed() : src;
    const pos = flat.getAttribute("position").array as Float32Array;
    const nrm = flat.getAttribute("normal").array as Float32Array;
    parts.push({ pos, nrm });
    count += pos.length;
  });
  const pos = new Float32Array(count);
  const nrm = new Float32Array(count);
  let o = 0;
  for (const part of parts) {
    pos.set(part.pos, o);
    nrm.set(part.nrm, o);
    o += part.pos.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return geo;
}

export function treeGeometry(species: "broad" | "pine" | "bush" | "palm"): THREE.BufferGeometry {
  const g = group();
  if (species === "bush") {
    const m = new THREE.Mesh(ICO, PAINT.leaf);
    m.position.set(0, 0.28, 0);
    m.scale.set(0.55, 0.4, 0.55);
    g.add(m);
  } else if (species === "pine") {
    cyl(g, "trunk", 0, 0.28, 0, 0.1, 0.45, 0.1);
    cone(g, "pine", 0, 0.78, 0, 0.55, 0.75, 0.55);
  } else if (species === "palm") {
    cyl(g, "trunk", 0, 0.5, 0, 0.08, 0.95, 0.08);
    box(g, "palm", 0.24, 0.98, 0, 0.5, 0.04, 0.12);
    box(g, "palm", -0.2, 0.96, 0.14, 0.42, 0.04, 0.1);
    box(g, "palm", 0.06, 1.0, -0.22, 0.4, 0.04, 0.1);
  } else {
    cyl(g, "trunk", 0, 0.3, 0, 0.12, 0.5, 0.12);
    const m = new THREE.Mesh(ICO, PAINT.leaf);
    m.position.set(0, 0.78, 0);
    m.scale.set(0.72, 0.55, 0.72);
    g.add(m);
  }
  return baked(g);
}
