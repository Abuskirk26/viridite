/**
 * One static mesh for the ground: plateaus, ramp slopes, cliff skirts,
 * a water plane, shoreline foam, and a dirt decal on the roads.
 * Vertex colour is the splat (grass, sand, dirt, ore). A repeating noise
 * map breaks up the flats. Trees are instanced and never rebuilt per frame.
 */

import * as THREE from "three";
import type { Sim } from "../sim.ts";
import {
  TILE_BRIDGE,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_FORD,
  TILE_HIGH,
  TILE_RAMP,
  TILE_ROAD,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SCRUB,
  TILE_SHALLOW,
  TILE_SHORE,
  TILE_STUMP,
  TILE_VALLEY,
  TILE_WRECK,
} from "../data.ts";
import { treeGeometry } from "./models.ts";

type RGB = [number, number, number];
type Pt = [number, number, number];

export function surfaceY(tile: number): number {
  if (tile === TILE_CLIFF) return 1.7;
  if (tile === TILE_HIGH) return 1.22;
  if (tile === TILE_ROCK) return 0.96;
  if (tile === TILE_BRIDGE) return 0.5;
  if (tile === TILE_RAMP) return 0.58;
  if (tile === TILE_DEEP || tile === TILE_WRECK) return -0.16;
  if (tile === TILE_SHALLOW) return -0.08;
  return 0.02;
}

export function sampleHeight(terrain: Uint8Array, gw: number, gh: number, x: number, y: number): number {
  const tx = Math.max(0, Math.min(gw - 1, x | 0));
  const ty = Math.max(0, Math.min(gh - 1, y | 0));
  return Math.max(0.02, surfaceY(terrain[ty * gw + tx] ?? 0));
}

function hash(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function waterTile(t: number): boolean {
  return t === TILE_DEEP || t === TILE_SHALLOW || t === TILE_WRECK;
}

function tint(tile: number, x: number, y: number): RGB {
  const j = (hash(x, y) - 0.5) * 0.05;
  const c = (r: number, g: number, b: number): RGB => [r + j, g + j * 0.85, b + j * 0.4];
  if (tile === TILE_CRYSTAL) return c(0.46, 0.4, 0.26);
  if (tile === TILE_SAND || tile === TILE_SHORE) return c(0.74, 0.62, 0.42);
  if (tile === TILE_FORD) return c(0.55, 0.48, 0.32);
  if (tile === TILE_ROAD) return c(0.4, 0.3, 0.18);
  if (tile === TILE_ROCK || tile === TILE_CLIFF) return c(0.45, 0.42, 0.38);
  if (tile === TILE_HIGH) return c(0.4, 0.55, 0.3);
  if (tile === TILE_RAMP) return c(0.42, 0.46, 0.3);
  if (tile === TILE_SCRUB || tile === TILE_STUMP) return c(0.26, 0.4, 0.2);
  if (tile === TILE_ROUGH || tile === TILE_VALLEY) return c(0.38, 0.36, 0.24);
  if (tile === TILE_BRIDGE) return c(0.42, 0.32, 0.2);
  return c(0.3, 0.48, 0.24);
}

interface Corners {
  sw: number;
  se: number;
  ne: number;
  nw: number;
}

function flat(t: number): number {
  if (waterTile(t)) return -0.12;
  return surfaceY(t);
}

function cornersOf(terrain: Uint8Array, gw: number, gh: number, x: number, y: number): Corners {
  const at = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= gw || ty >= gh) return 0;
    return flat(terrain[ty * gw + tx] ?? 0);
  };
  const t = terrain[y * gw + x] ?? 0;
  if (t !== TILE_RAMP) {
    const h = flat(t);
    return { sw: h, se: h, ne: h, nw: h };
  }
  const n = at(x, y - 1);
  const s = at(x, y + 1);
  const w = at(x - 1, y);
  const e = at(x + 1, y);
  const high = (v: number) => v >= 0.9;
  const top = 1.22;
  const low = 0.04;
  if (high(n) && !high(s)) return { nw: top, ne: top, sw: low, se: low };
  if (high(s) && !high(n)) return { sw: top, se: top, nw: low, ne: low };
  if (high(w) && !high(e)) return { nw: top, sw: top, ne: low, se: low };
  if (high(e) && !high(w)) return { ne: top, se: top, nw: low, sw: low };
  const mid = 0.58;
  return { sw: mid, se: mid, ne: mid, nw: mid };
}

class Soup {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  uv: number[] = [];

  tri(a: Pt, b: Pt, c: Pt, color: RGB) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
      this.uv.push(p[0] * 0.25, p[2] * 0.25);
    }
  }

  quad(a: Pt, b: Pt, c: Pt, d: Pt, color: RGB) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** Horizontal deck. `quad` winds downward; this one faces the sun. */
  deck(a: Pt, b: Pt, c: Pt, d: Pt, color: RGB) {
    this.tri(a, d, c, color);
    this.tri(a, c, b, color);
  }

  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

function splat(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const n = hash(x * 3, y * 5);
      const v = 168 + ((n * 80) | 0);
      const i = (y * 128 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v - 4;
      img.data[i + 2] = v - 10;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rock(): RGB {
  return [0.4, 0.37, 0.33];
}

export interface GroundPack {
  root: THREE.Group;
  water: { value: number };
  foam: { value: number };
}

const CHUNK = 16;

interface Bin {
  land: Soup;
  skirts: Soup;
  roads: Soup;
  foam: Soup;
}

export function buildGround(sim: Sim): GroundPack {
  const { terrain, gw, gh } = sim;
  const bins = new Map<number, Bin>();
  const binAt = (x: number, y: number): Bin => {
    const id = ((y / CHUNK) | 0) * 512 + ((x / CHUNK) | 0);
    let bin = bins.get(id);
    if (!bin) {
      bin = { land: new Soup(), skirts: new Soup(), roads: new Soup(), foam: new Soup() };
      bins.set(id, bin);
    }
    return bin;
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gw || y >= gh ? 0 : (terrain[y * gw + x] ?? 0));

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = at(x, y);
      if (waterTile(t)) continue;
      const bin = binAt(x, y);
      const c = cornersOf(terrain, gw, gh, x, y);
      const z = y;
      const sw: Pt = [x, c.sw, z];
      const se: Pt = [x + 1, c.se, z];
      const ne: Pt = [x + 1, c.ne, z + 1];
      const nw: Pt = [x, c.nw, z + 1];
      bin.land.deck(sw, se, ne, nw, tint(t, x, y));

      const edge = (ax: number, az: number, bx: number, bz: number, topA: number, topB: number, botA: number, botB: number) => {
        if (topA < botA + 0.4 && topB < botB + 0.4) return;
        const a: Pt = [ax, topA, az];
        const b: Pt = [bx, topB, bz];
        const c: Pt = [bx, botB, bz];
        const d: Pt = [ax, botA, az];
        bin.skirts.quad(a, d, c, b, rock());
      };
      if (t !== TILE_RAMP) {
        if (x + 1 < gw && !waterTile(at(x + 1, y))) {
          const east = cornersOf(terrain, gw, gh, x + 1, y);
          edge(x + 1, z, x + 1, z + 1, c.se, c.ne, east.sw, east.nw);
        } else edge(x + 1, z, x + 1, z + 1, c.se, c.ne, 0, 0);
        if (y + 1 < gh && !waterTile(at(x, y + 1))) {
          const south = cornersOf(terrain, gw, gh, x, y + 1);
          edge(x, z + 1, x + 1, z + 1, c.nw, c.ne, south.sw, south.se);
        } else edge(x, z + 1, x + 1, z + 1, c.nw, c.ne, 0, 0);
      }

      if (t === TILE_ROAD || t === TILE_BRIDGE) {
        const horiz = at(x - 1, y) === TILE_ROAD || at(x + 1, y) === TILE_ROAD || at(x - 1, y) === TILE_BRIDGE || at(x + 1, y) === TILE_BRIDGE;
        const vert = at(x, y - 1) === TILE_ROAD || at(x, y + 1) === TILE_ROAD || at(x, y - 1) === TILE_BRIDGE || at(x, y + 1) === TILE_BRIDGE;
        const y0 = Math.max(c.sw, c.se, c.ne, c.nw) + 0.035;
        let x0 = x + 0.28;
        let x1 = x + 0.72;
        let z0 = z + 0.28;
        let z1 = z + 0.72;
        if (horiz && !vert) {
          x0 = x + 0.02;
          x1 = x + 0.98;
        } else if (vert && !horiz) {
          z0 = z + 0.02;
          z1 = z + 0.98;
        } else {
          x0 = x + 0.16;
          x1 = x + 0.84;
          z0 = z + 0.16;
          z1 = z + 0.84;
        }
        const dirt: RGB = [0.36, 0.26, 0.16];
        bin.roads.deck([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], dirt);
      }

      const foamEdge = (nx: number, ny: number, x0: number, z0: number, x1: number, z1: number) => {
        if (!waterTile(at(nx, ny))) return;
        const lift = 0.03;
        bin.foam.deck([x0, lift, z0], [x1, lift, z0], [x1, lift, z1], [x0, lift, z1], [0.85, 0.93, 0.94]);
      };
      if (!waterTile(t)) {
        foamEdge(x, y - 1, x, z + 0.02, x + 1, z + 0.16);
        foamEdge(x, y + 1, x, z + 0.84, x + 1, z + 0.98);
        foamEdge(x - 1, y, x + 0.02, z, x + 0.16, z + 1);
        foamEdge(x + 1, y, x + 0.84, z, x + 0.98, z + 1);
      }
    }
  }

  const tex = splat();
  const landMat = new THREE.MeshStandardMaterial({
    map: tex,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  });
  const skirtMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const roadMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const root = new THREE.Group();
  const add = (soup: Soup, mat: THREE.Material) => {
    if (!soup.pos.length) return;
    const mesh = new THREE.Mesh(soup.geo(), mat);
    // Ground chunks only receive. A cast from every patch would fill the shadow map.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  for (const bin of bins.values()) {
    add(bin.land, landMat);
    add(bin.skirts, skirtMat);
    add(bin.roads, roadMat);
  }

  const waterUni = { value: 0 };
  const foamUni = { value: 0 };
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: waterUni },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float n = sin(vUv.x * 46.0 + uTime * 0.8) * sin(vUv.y * 38.0 - uTime * 0.6);
        vec3 col = mix(vec3(0.07, 0.24, 0.34), vec3(0.16, 0.42, 0.5), n * 0.5 + 0.5);
        gl_FragColor = vec4(col, 0.92);
      }
    `,
  });
  const foamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: foamUni },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float a = 0.28 + 0.28 * sin(uTime * 2.0 + vUv.x * 22.0 + vUv.y * 14.0);
        gl_FragColor = vec4(0.88, 0.96, 0.97, a);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(gw / 2, -0.12, gh / 2);
  water.receiveShadow = true;
  root.add(water);
  for (const bin of bins.values()) {
    if (!bin.foam.pos.length) continue;
    const foamMesh = new THREE.Mesh(bin.foam.geo(), foamMat);
    foamMesh.renderOrder = 2;
    foamMesh.castShadow = false;
    root.add(foamMesh);
  }
  root.add(buildTrees(sim));
  root.add(buildOre(sim));
  return { root, water: waterUni, foam: foamUni };
}

type Species = "broad" | "pine" | "bush" | "palm";

function biome(sim: Sim): "temperate" | "snow" | "desert" | "tropic" {
  if (sim.theater === "snow") return "snow";
  if (sim.theater === "desert") return "desert";
  return sim.mapId === "palm" || sim.mapId === "coast" || sim.mapId === "isles" ? "tropic" : "temperate";
}

function speciesAt(x: number, y: number, kind: ReturnType<typeof biome>): Species {
  const h = hash(x * 3 + 1, y * 5 + 2);
  if (kind === "tropic" && h > 0.62) return "palm";
  if (kind === "desert" && h > 0.55) return "bush";
  if (h < 0.16) return "bush";
  if (h < 0.48) return "pine";
  return "broad";
}

function buildTrees(sim: Sim): THREE.Group {
  const kind = biome(sim);
  const chunks = new Map<number, Record<Species, { x: number; y: number }[]>>();
  for (let y = 0; y < sim.gh; y++) {
    for (let x = 0; x < sim.gw; x++) {
      const t = sim.terrain[y * sim.gw + x] ?? 0;
      if (t !== TILE_SCRUB && t !== TILE_STUMP) continue;
      const id = ((y / CHUNK) | 0) * 512 + ((x / CHUNK) | 0);
      let bag = chunks.get(id);
      if (!bag) {
        bag = { broad: [], pine: [], bush: [], palm: [] };
        chunks.set(id, bag);
      }
      bag[speciesAt(x, y, kind)].push({ x, y });
    }
  }
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const geos: Partial<Record<Species, THREE.BufferGeometry>> = {};
  const mats: Partial<Record<Species, THREE.MeshStandardMaterial>> = {};
  for (const bag of chunks.values()) {
    (Object.keys(bag) as Species[]).forEach((species) => {
      const list = bag[species];
      if (!list.length) return;
      if (!geos[species]) geos[species] = treeGeometry(species);
      if (!mats[species]) {
        mats[species] = new THREE.MeshStandardMaterial({
          color: species === "pine" ? 0x24563a : species === "palm" ? 0x3c8a40 : species === "bush" ? 0x4a7a32 : 0x2f6a34,
          roughness: 0.9,
        });
      }
      const mesh = new THREE.InstancedMesh(geos[species], mats[species], list.length);
      // Trees stay out of the shadow pass. A continent of instances would redraw every one.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const h = hash(p.x + 4, p.y + 9);
      const s = species === "bush" ? 0.7 + h * 0.45 : 0.82 + h * 0.55;
      const stump = (sim.terrain[p.y * sim.gw + p.x] ?? 0) === TILE_STUMP;
      dummy.position.set(p.x + 0.5 + (hash(p.x, p.y + 2) - 0.5) * 0.3, sampleHeight(sim.terrain, sim.gw, sim.gh, p.x, p.y), p.y + 0.5);
      dummy.rotation.set(0, h * Math.PI * 2, 0);
      dummy.scale.set(s, stump ? 0.25 : s * (0.85 + hash(p.x + 1, p.y) * 0.35), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.28 + (h - 0.5) * 0.05, 0.4, 0.28 + h * 0.12);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    });
  }
  return group;
}

function buildOre(sim: Sim): THREE.Group {
  const group = new THREE.Group();
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < sim.crystal.length; i++) {
    if ((sim.crystal[i] ?? 0) <= 0) continue;
    const t = sim.terrain[i] ?? 0;
    if (waterTile(t) || t === TILE_CLIFF) continue;
    spots.push({ x: i % sim.gw, y: (i / sim.gw) | 0 });
    if (spots.length >= 360) break;
  }
  if (!spots.length) return group;
  const geo = new THREE.OctahedronGeometry(0.22, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8d8a55, roughness: 0.35, metalness: 0.15, emissive: 0x3a3a20, emissiveIntensity: 0.2 });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < spots.length; i++) {
    const p = spots[i]!;
    const h = hash(p.x + 8, p.y + 3);
    dummy.position.set(p.x + 0.5, sampleHeight(sim.terrain, sim.gw, sim.gh, p.x, p.y) + 0.2, p.y + 0.5);
    dummy.rotation.set(0, h * 3, 0);
    dummy.scale.setScalar(0.7 + h * 0.8);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}

export function terrainHash(terrain: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < terrain.length; i++) h = Math.imul(h ^ (terrain[i] ?? 0), 16777619);
  return h >>> 0;
}
