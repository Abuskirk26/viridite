/**
 * One static mesh for the ground: plateaus, ramp slopes, cliff skirts,
 * a water plane, shoreline foam, and a dirt decal on the roads.
 * Vertex colour is the splat (grass, sand, dirt, ore). A repeating noise
 * map breaks up the flats. Trees are instanced and never rebuilt per frame.
 */

import * as THREE from "three";
import type { Sim } from "../sim.ts";
import { TILE_BRIDGE, TILE_CLIFF, TILE_ROAD, TILE_SCRUB, TILE_STUMP } from "../data.ts";
import { sampleCorner, surfaceOf, tintOf, waterTile, type RGB } from "./ground.ts";
import { treeGeometry } from "./models.ts";

type Pt = [number, number, number];

export function surfaceY(tile: number): number {
  return surfaceOf(tile);
}

export function sampleHeight(terrain: Uint8Array, gw: number, gh: number, x: number, y: number): number {
  const tx = Math.max(0, Math.min(gw - 1, Math.floor(x)));
  const ty = Math.max(0, Math.min(gh - 1, Math.floor(y)));
  const here = terrain[ty * gw + tx] ?? 0;
  if (waterTile(here)) return 0.02;
  const self = surfaceOf(here);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
    const next = terrain[ny * gw + nx] ?? 0;
    if (waterTile(next)) continue;
    if (Math.abs(surfaceOf(next) - self) > 0.7) return Math.max(0.02, self);
  }
  const at = (ix: number, iy: number) => (ix < 0 || iy < 0 || ix >= gw || iy >= gh ? -1 : (terrain[iy * gw + ix] ?? 0));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const h00 = sampleCorner(at, x0, y0).y;
  const h10 = sampleCorner(at, x0 + 1, y0).y;
  const h01 = sampleCorner(at, x0, y0 + 1).y;
  const h11 = sampleCorner(at, x0 + 1, y0 + 1).y;
  return Math.max(0.02, (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy);
}

function hash(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

class Soup {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  uv: number[] = [];

  tri(a: Pt, b: Pt, c: Pt, color: RGB, colors?: [RGB, RGB, RGB]) {
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
    const cols = colors ?? [color, color, color];
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const p = pts[i]!;
      const tint = cols[i]!;
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(tint[0], tint[1], tint[2]);
      this.uv.push(p[0] * 0.25, p[2] * 0.25);
    }
  }

  quad(a: Pt, b: Pt, c: Pt, d: Pt, color: RGB) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** Horizontal deck. `quad` winds downward; this one faces the sun. */
  deck(a: Pt, b: Pt, c: Pt, d: Pt, color: RGB, colors?: [RGB, RGB, RGB, RGB]) {
    const cols = colors ?? [color, color, color, color];
    this.tri(a, d, c, color, [cols[0]!, cols[3]!, cols[2]!]);
    this.tri(a, c, b, color, [cols[0]!, cols[2]!, cols[1]!]);
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
  cx: number;
  cz: number;
}

function shoreTexture(terrain: Uint8Array, gw: number, gh: number): THREE.DataTexture {
  const dist = new Uint8Array(gw * gh);
  dist.fill(255);
  const queue: number[] = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const tile = terrain[i] ?? 0;
      if (!waterTile(tile)) {
        dist[i] = 0;
        continue;
      }
      let beach = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        if (!waterTile(terrain[ny * gw + nx] ?? 0)) beach = true;
      }
      if (beach) {
        dist[i] = 1;
        queue.push(i);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const d = dist[i] ?? 255;
    if (d >= 14) continue;
    const x = i % gw;
    const y = (i / gw) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const j = ny * gw + nx;
      if ((dist[j] ?? 255) <= d + 1) continue;
      dist[j] = d + 1;
      queue.push(j);
    }
  }
  const data = new Uint8Array(gw * gh * 4);
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i] ?? 255;
    const v = d === 0 ? 0 : Math.min(255, Math.round((d / 14) * 255));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, gw, gh);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function buildGround(sim: Sim): GroundPack {
  const { terrain, gw, gh } = sim;
  const bins = new Map<number, Bin>();
  const binAt = (x: number, y: number): Bin => {
    const id = ((y / CHUNK) | 0) * 512 + ((x / CHUNK) | 0);
    let bin = bins.get(id);
    if (!bin) {
      bin = {
        land: new Soup(),
        skirts: new Soup(),
        roads: new Soup(),
        cx: ((x / CHUNK) | 0) * CHUNK + CHUNK / 2,
        cz: ((y / CHUNK) | 0) * CHUNK + CHUNK / 2,
      };
      bins.set(id, bin);
    }
    return bin;
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gw || y >= gh ? -1 : (terrain[y * gw + x] ?? 0));
  const corner = (x: number, z: number) => sampleCorner(at, x, z);
  const face = (c: ReturnType<typeof corner>, top: number, gx: number, gz: number, tile: number): { p: Pt; rgb: RGB } => {
    const raised = c.cliff && top > c.low + 0.45;
    const rockMix = raised ? 0.62 : 0;
    const base = raised ? tintOf(tile) : c.rgb;
    const rgb: RGB = raised
      ? [base[0] * (1 - rockMix) + 0.43 * rockMix, base[1] * (1 - rockMix) + 0.4 * rockMix, base[2] * (1 - rockMix) + 0.36 * rockMix]
      : c.rgb;
    return { p: [raised ? gx : c.x, raised ? Math.max(top, c.high) : c.y, raised ? gz : c.z], rgb };
  };

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = at(x, y);
      if (t < 0 || waterTile(t)) continue;
      const bin = binAt(x, y);
      const top = surfaceOf(t);
      const sw = face(corner(x, y), top, x, y, t);
      const se = face(corner(x + 1, y), top, x + 1, y, t);
      const ne = face(corner(x + 1, y + 1), top, x + 1, y + 1, t);
      const nw = face(corner(x, y + 1), top, x, y + 1, t);
      bin.land.deck(sw.p, se.p, ne.p, nw.p, sw.rgb, [sw.rgb, se.rgb, ne.rgb, nw.rgb]);

      const skirt = (ax: number, az: number, bx: number, bz: number, topA: number, topB: number) => {
        if (topA < 0.55 && topB < 0.55) return;
        const steps = 3;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const jitter = (hash(x * 3 + s, y * 5 + s) - 0.5) * 0.08;
          const ox = ax === bx ? jitter : 0;
          const oz = az === bz ? jitter : 0;
          const a: Pt = [ax + ox, topA * (1 - t0), az + oz];
          const b: Pt = [bx + ox, topB * (1 - t0), bz + oz];
          const c: Pt = [bx + ox * 0.4, topB * (1 - t1), bz + oz * 0.4];
          const d: Pt = [ax + ox * 0.4, topA * (1 - t1), az + oz * 0.4];
          const shade = 0.72 - s * 0.12;
          bin.skirts.quad(a, d, c, b, [0.4 * shade, 0.37 * shade, 0.33 * shade]);
        }
      };
      if (top > 0.7) {
        const east = at(x + 1, y);
        const south = at(x, y + 1);
        if (east < 0 || waterTile(east) || surfaceOf(east) < top - 0.7) skirt(x + 1, y, x + 1, y + 1, top, top);
        if (south < 0 || waterTile(south) || surfaceOf(south) < top - 0.7) skirt(x, y + 1, x + 1, y + 1, top, top);
      }

      if (t === TILE_ROAD || t === TILE_BRIDGE) {
        const horiz = at(x - 1, y) === TILE_ROAD || at(x + 1, y) === TILE_ROAD || at(x - 1, y) === TILE_BRIDGE || at(x + 1, y) === TILE_BRIDGE;
        const vert = at(x, y - 1) === TILE_ROAD || at(x, y + 1) === TILE_ROAD || at(x, y - 1) === TILE_BRIDGE || at(x, y + 1) === TILE_BRIDGE;
        const y0 = Math.max(sw.p[1], se.p[1], ne.p[1], nw.p[1]) + 0.035;
        let x0 = x + 0.28;
        let x1 = x + 0.72;
        let z0 = y + 0.28;
        let z1 = y + 0.72;
        if (horiz && !vert) {
          x0 = x + 0.02;
          x1 = x + 0.98;
        } else if (vert && !horiz) {
          z0 = y + 0.02;
          z1 = y + 0.98;
        } else {
          x0 = x + 0.16;
          x1 = x + 0.84;
          z0 = y + 0.16;
          z1 = y + 0.84;
        }
        const dirt: RGB = [0.36, 0.26, 0.16];
        bin.roads.deck([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], dirt);
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
  const add = (soup: Soup, mat: THREE.Material, bin: Bin, role: string | null) => {
    if (!soup.pos.length) return;
    const mesh = new THREE.Mesh(soup.geo(), mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (role) {
      mesh.userData.role = role;
      mesh.userData.cx = bin.cx;
      mesh.userData.cz = bin.cz;
    }
    root.add(mesh);
  };
  for (const bin of bins.values()) {
    add(bin.land, landMat, bin, null);
    add(bin.skirts, skirtMat, bin, "skirt");
    add(bin.roads, roadMat, bin, null);
  }

  const shore = shoreTexture(terrain, gw, gh);
  const waterUni = { value: 0 };
  const foamUni = { value: 0 };
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: waterUni,
      uFoam: foamUni,
      uShore: { value: shore },
      uSize: { value: new THREE.Vector2(gw, gh) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        world.y += sin(world.x * 0.55 + uTime * 0.7) * 0.045 + sin(world.z * 0.42 - uTime * 0.55) * 0.03;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFoam;
      uniform sampler2D uShore;
      uniform vec2 uSize;
      varying vec3 vWorld;
      void main() {
        vec2 uv = clamp(vWorld.xz / uSize, 0.0, 1.0);
        float shore = texture2D(uShore, uv).r;
        float wave = sin(vWorld.x * 1.7 + uTime * 1.3) * sin(vWorld.z * 1.3 - uTime) * 0.5 + 0.5;
        vec3 deep = vec3(0.04, 0.16, 0.26);
        vec3 shallow = vec3(0.16, 0.42, 0.42);
        vec3 col = mix(shallow, deep, smoothstep(0.02, 0.55, shore));
        col += vec3(0.03, 0.05, 0.05) * wave;
        float foam = smoothstep(0.22, 0.0, shore) * (0.45 + 0.55 * sin(uTime * 2.2 + uFoam + vWorld.x * 6.0 + vWorld.z * 4.0));
        col = mix(col, vec3(0.86, 0.94, 0.93), clamp(foam, 0.0, 0.85));
        gl_FragColor = vec4(col, 0.9);
      }
    `,
  });
  const seg = Math.min(20, Math.max(10, Math.round(gw / 3)));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh, seg, seg), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(gw / 2, -0.12, gh / 2);
  water.receiveShadow = true;
  root.add(water);
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
  const chunks = new Map<number, { cx: number; cz: number; bag: Record<Species, { x: number; y: number }[]> }>();
  for (let y = 0; y < sim.gh; y++) {
    for (let x = 0; x < sim.gw; x++) {
      const t = sim.terrain[y * sim.gw + x] ?? 0;
      if (t !== TILE_SCRUB && t !== TILE_STUMP) continue;
      const id = ((y / CHUNK) | 0) * 512 + ((x / CHUNK) | 0);
      let chunk = chunks.get(id);
      if (!chunk) {
        chunk = {
          cx: ((x / CHUNK) | 0) * CHUNK + CHUNK / 2,
          cz: ((y / CHUNK) | 0) * CHUNK + CHUNK / 2,
          bag: { broad: [], pine: [], bush: [], palm: [] },
        };
        chunks.set(id, chunk);
      }
      chunk.bag[speciesAt(x, y, kind)].push({ x, y });
    }
  }
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const geos: Partial<Record<Species, THREE.BufferGeometry>> = {};
  const mats: Partial<Record<Species, THREE.MeshStandardMaterial>> = {};
  for (const chunk of chunks.values()) {
    const bag = chunk.bag;
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
      mesh.userData.role = "tree";
      mesh.userData.species = species;
      mesh.userData.cx = chunk.cx;
      mesh.userData.cz = chunk.cz;
      mesh.userData.plain = geos[species];
      mesh.castShadow = false;
      mesh.receiveShadow = true;
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
