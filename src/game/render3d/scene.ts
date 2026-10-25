/**
 * WebGL view of the same sim the 2D canvas draws.
 * Terrain is one static mesh. Units and halls are pooled placeholders
 * (or a glTF of the same file name, once it has loaded). Team colour
 * stays on the mesh named "team".
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BUILDINGS, teamStyle, type BuildingId, type Team } from "../data.ts";
import type { Sim } from "../sim.ts";
import type { Camera, View } from "../view.ts";
import { CAM_FOV, eyeOf } from "./camera.ts";
import { modelUrl, paintTeam, placeholder } from "./models.ts";
import { buildGround, sampleHeight, terrainHash, type GroundPack } from "./terrain.ts";

export interface SceneUi {
  selected: number[];
  buildingId: number | null;
  placing: BuildingId | null;
  hover: { tx: number; ty: number } | null;
  ghost?: { tx: number; ty: number } | null;
  wallRun: { tx: number; ty: number; ok: boolean }[] | null;
  viewer: number;
}

const RING = new THREE.TorusGeometry(0.42, 0.028, 5, 16);
const BARS = new Map<number, THREE.SpriteMaterial>();

function barMaterial(pct: number): THREE.SpriteMaterial {
  const bucket = Math.max(0, Math.min(16, Math.round(pct * 16)));
  const hit = BARS.get(bucket);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1a140e";
    ctx.fillRect(0, 0, 64, 8);
    const p = bucket / 16;
    ctx.fillStyle = p > 0.55 ? "#3dcc6e" : p > 0.28 ? "#e6b325" : "#e23b32";
    ctx.fillRect(1, 1, Math.max(1, Math.round(62 * p)), 6);
  }
  const map = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map, transparent: true, depthTest: true });
  BARS.set(bucket, mat);
  return mat;
}

function teamMat(team: number): THREE.MeshStandardMaterial {
  const color = teamStyle(team).color;
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.45 });
}

const TEAM_MAT = [0, 1, 2, 3].map((t) => teamMat(t));

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.15, 420);
  fps = 0;
  private samples: number[] = [];
  private sun: THREE.DirectionalLight;
  private pack: GroundPack | null = null;
  private hash = 0;
  private units = new Map<number, THREE.Group>();
  private halls = new Map<number, THREE.Group>();
  private sources = new Map<string, THREE.Object3D>();
  private gen = new Map<string, number>();
  private tried = new Set<string>();
  private loader = new GLTFLoader();
  private ghost: THREE.Mesh;
  private walls: THREE.Mesh[] = [];
  private pGeo: THREE.BufferGeometry;
  private pPos: Float32Array;
  private pCol: Float32Array;
  private readonly pMax = 420;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x8eafc4, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xc5d4e0, 0x3d3428, 0.62));
    this.scene.add(new THREE.AmbientLight(0x66707c, 0.22));
    this.sun = new THREE.DirectionalLight(0xfff1d4, 1.65);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.camera.left = -36;
    this.sun.shadow.camera.right = 36;
    this.sun.shadow.camera.top = 36;
    this.sun.shadow.camera.bottom = -36;
    this.sun.shadow.bias = -0.00045;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x3dcc6e,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 1), ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 3;
    this.scene.add(this.ghost);
    this.pPos = new Float32Array(this.pMax * 3);
    this.pCol = new Float32Array(this.pMax * 3);
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3));
    const points = new THREE.Points(
      this.pGeo,
      new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }),
    );
    points.frustumCulled = false;
    this.scene.add(points);
  }

  resize(w: number, h: number) {
    const pr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
  }

  /** Drop the static ground so the next frame rebuilds it. Screenshot scripts call this after editing tiles. */
  rebuild() {
    this.hash = 0;
  }

  sync(sim: Sim, cam: Camera, view: View, ui: SceneUi, alpha: number) {
    const hash = terrainHash(sim.terrain);
    if (!this.pack || hash !== this.hash) {
      if (this.pack) {
        this.scene.remove(this.pack.root);
        disposeTree(this.pack.root);
      }
      this.pack = buildGround(sim);
      this.hash = hash;
      this.scene.add(this.pack.root);
    }
    const eye = eyeOf(cam, view);
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(cam.x, 0, cam.y);
    this.camera.fov = (CAM_FOV * 180) / Math.PI;
    this.camera.aspect = view.w / Math.max(1, view.h);
    this.camera.updateProjectionMatrix();
    this.sun.position.set(cam.x - 34, 62, cam.y - 22);
    this.sun.target.position.set(cam.x, 0, cam.y);
    if (this.pack) {
      this.pack.water.value = sim.time;
      this.pack.foam.value = sim.time;
    }
    this.syncUnits(sim, ui, alpha);
    this.syncHalls(sim, ui);
    this.syncGhost(sim, ui);
    this.syncFx(sim, alpha);
    this.renderer.render(this.scene, this.camera);
    const now = performance.now();
    this.samples.push(now);
    const cutoff = now - 1000;
    while (this.samples.length && this.samples[0]! < cutoff) this.samples.shift();
    this.fps = this.samples.length;
  }

  private take(kind: string): THREE.Group {
    const src = this.sources.get(kind);
    const g = src ? (src.clone(true) as THREE.Group) : placeholder(kind);
    g.userData.kind = kind;
    g.userData.gen = this.gen.get(kind) ?? 0;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.name === "team" && mesh.material instanceof THREE.Material) mesh.material = mesh.material.clone();
      }
    });
    this.tryFile(kind);
    return g;
  }

  private tryFile(kind: string) {
    if (this.tried.has(kind)) return;
    this.tried.add(kind);
    this.loader.load(
      modelUrl(kind),
      (gltf) => {
        const src = gltf.scene;
        const box = new THREE.Box3().setFromObject(src);
        const size = box.getSize(new THREE.Vector3());
        const span = Math.max(size.x, size.y, size.z, 0.001);
        src.scale.multiplyScalar(1 / span);
        const fitted = new THREE.Box3().setFromObject(src);
        src.position.sub(fitted.getCenter(new THREE.Vector3()));
        src.position.y += (fitted.max.y - fitted.min.y) * 0.5 * src.scale.y;
        this.sources.set(kind, src);
        this.gen.set(kind, (this.gen.get(kind) ?? 0) + 1);
      },
      undefined,
      () => {
        /* missing file keeps the placeholder */
      },
    );
  }

  private adorn(g: THREE.Group, team: number, barY: number) {
    const ring = new THREE.Mesh(RING, TEAM_MAT[team] ?? TEAM_MAT[0]!);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    ring.name = "mark";
    ring.castShadow = false;
    g.add(ring);
    const hp = new THREE.Sprite(barMaterial(1));
    hp.scale.set(0.72, 0.08, 1);
    hp.position.y = barY;
    hp.name = "hp";
    hp.visible = false;
    g.add(hp);
  }

  private syncUnits(sim: Sim, ui: SceneUi, alpha: number) {
    const viewer = ui.viewer as Team;
    const live = new Set<number>();
    for (const u of sim.units) {
      if (!sim.visibleUnit(viewer, u)) continue;
      live.add(u.id);
      let g = this.units.get(u.id);
      const gen = this.gen.get(u.kind) ?? 0;
      if (!g || g.userData.kind !== u.kind || g.userData.gen !== gen) {
        if (g) this.scene.remove(g);
        g = this.take(u.kind);
        this.adorn(g, u.team, u.loco === "air" ? 0.7 : 0.85);
        this.units.set(u.id, g);
        this.scene.add(g);
      }
      const x = u.px + (u.x - u.px) * alpha;
      const y = u.py + (u.y - u.py) * alpha;
      const ground = sampleHeight(sim.terrain, sim.gw, sim.gh, x, y);
      const alt = u.loco === "air" ? ground + 2.5 : u.loco === "sea" ? 0.18 : ground;
      g.position.set(x, alt, y);
      g.rotation.y = -u.facing;
      paintTeam(g, u.team);
      const mark = g.getObjectByName("mark") as THREE.Mesh | undefined;
      if (mark) mark.material = TEAM_MAT[u.team] ?? TEAM_MAT[0]!;
      const selected = ui.selected.includes(u.id);
      const damaged = u.maxHp > 0 && u.hp < u.maxHp - 0.5;
      const hp = g.getObjectByName("hp") as THREE.Sprite | undefined;
      if (hp) {
        hp.visible = damaged || selected;
        if (hp.visible) {
          hp.material = barMaterial(u.maxHp > 0 ? u.hp / u.maxHp : 1);
          hp.position.y = u.loco === "air" ? 0.85 : 0.95;
        }
      }
      const spin = sim.time * 16;
      g.traverse((o) => {
        if (o.name === "rotor") o.rotation.y = spin;
      });
    }
    for (const [id, g] of this.units) {
      if (live.has(id)) continue;
      this.scene.remove(g);
      this.units.delete(id);
    }
  }

  private syncHalls(sim: Sim, ui: SceneUi) {
    const viewer = ui.viewer as Team;
    const live = new Set<number>();
    for (const b of sim.buildings) {
      if (b.hp <= 0 || b.rubble > 0) continue;
      if (b.kind !== "span" && !sim.buildingVisible(viewer, b) && b.team !== viewer) continue;
      live.add(b.id);
      let g = this.halls.get(b.id);
      const gen = this.gen.get(b.kind) ?? 0;
      if (!g || g.userData.kind !== b.kind || g.userData.gen !== gen) {
        if (g) this.scene.remove(g);
        g = this.take(b.kind);
        this.adorn(g, b.team, 1.4);
        this.halls.set(b.id, g);
        this.scene.add(g);
      }
      const h = sampleHeight(sim.terrain, sim.gw, sim.gh, b.tx + b.w / 2, b.ty + b.h / 2);
      g.position.set(b.tx + b.w / 2, b.kind === "span" ? Math.max(h, 0.42) : h, b.ty + b.h / 2);
      paintTeam(g, b.team);
      const mark = g.getObjectByName("mark") as THREE.Mesh | undefined;
      if (mark) {
        mark.material = TEAM_MAT[b.team] ?? TEAM_MAT[0]!;
        const s = Math.max(b.w, b.h) * 0.85;
        mark.scale.set(s, 1, s);
      }
      const picked = ui.buildingId === b.id;
      const damaged = b.maxHp > 0 && b.hp < b.maxHp - 0.5;
      const hp = g.getObjectByName("hp") as THREE.Sprite | undefined;
      if (hp) {
        hp.visible = (damaged || picked) && b.kind !== "span";
        if (hp.visible) {
          hp.material = barMaterial(b.maxHp > 0 ? b.hp / b.maxHp : 1);
          hp.position.y = 1.35;
          hp.scale.set(Math.min(1.4, 0.45 * Math.max(b.w, b.h)), 0.09, 1);
        }
      }
    }
    for (const [id, g] of this.halls) {
      if (live.has(id)) continue;
      this.scene.remove(g);
      this.halls.delete(id);
    }
  }

  private syncGhost(sim: Sim, ui: SceneUi) {
    const mat = this.ghost.material as THREE.MeshStandardMaterial;
    if (ui.placing && ui.hover && ui.placing !== "wall" && ui.placing !== "sandbag" && ui.placing !== "gate") {
      const spot = ui.ghost ?? ui.hover;
      const def = BUILDINGS[ui.placing];
      const ok = sim.canPlace(ui.viewer as Team, ui.placing, ui.hover.tx, ui.hover.ty).ok;
      this.ghost.visible = true;
      this.ghost.scale.set(def.w, 1, def.h);
      const h = sampleHeight(sim.terrain, sim.gw, sim.gh, spot.tx, spot.ty);
      this.ghost.position.set(spot.tx + def.w / 2, h + 0.2, spot.ty + def.h / 2);
      mat.color.set(ok ? 0x3dcc6e : 0xd25a48);
    } else this.ghost.visible = false;
    const run = ui.wallRun ?? [];
    while (this.walls.length < run.length) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.2, 0.86),
        new THREE.MeshStandardMaterial({ color: 0x3dcc6e, transparent: true, opacity: 0.45, depthWrite: false }),
      );
      this.scene.add(mesh);
      this.walls.push(mesh);
    }
    for (let i = 0; i < this.walls.length; i++) {
      const mesh = this.walls[i]!;
      const step = run[i];
      mesh.visible = !!step;
      if (!step) continue;
      const h = sampleHeight(sim.terrain, sim.gw, sim.gh, step.tx, step.ty);
      mesh.position.set(step.tx + 0.5, h + 0.16, step.ty + 0.5);
      (mesh.material as THREE.MeshStandardMaterial).color.set(step.ok ? 0x3dcc6e : 0xd25a48);
    }
  }

  private syncFx(sim: Sim, alpha: number) {
    let n = 0;
    const put = (x: number, y: number, z: number, r: number, g: number, b: number) => {
      if (n >= this.pMax) return;
      const i = n * 3;
      this.pPos[i] = x;
      this.pPos[i + 1] = y;
      this.pPos[i + 2] = z;
      this.pCol[i] = r;
      this.pCol[i + 1] = g;
      this.pCol[i + 2] = b;
      n++;
    };
    for (const f of sim.fx) {
      const k = 1 - f.ttl / Math.max(0.05, f.max);
      const ground = sampleHeight(sim.terrain, sim.gw, sim.gh, f.x, f.y);
      if (f.kind === "boom") {
        const bits = 5;
        for (let i = 0; i < bits; i++) {
          const a = (i / bits) * Math.PI * 2 + k;
          const rad = f.r * (0.25 + k) * (0.6 + (i % 3) * 0.2);
          put(f.x + Math.cos(a) * rad, ground + 0.3 + k * 1.3, f.y + Math.sin(a) * rad, 1, 0.55 - k * 0.3, 0.2);
        }
      } else if (f.kind === "debris") {
        put(f.x, ground + 0.4 + k * 0.8, f.y, 0.35, 0.28, 0.22);
      } else if (f.kind === "muzzle" || f.kind === "flash") {
        put(f.x, ground + 0.45, f.y, 1, 0.9, 0.55);
      } else if (f.kind === "beam") {
        put(f.x, ground + 0.5, f.y, 0.7, 0.9, 1);
        put(f.x2, sampleHeight(sim.terrain, sim.gw, sim.gh, f.x2, f.y2) + 0.4, f.y2, 0.7, 0.9, 1);
      }
    }
    for (const s of sim.shots) {
      const x = s.px + (s.x - s.px) * alpha;
      const y = s.py + (s.y - s.py) * alpha;
      const ground = sampleHeight(sim.terrain, sim.gw, sim.gh, x, y);
      const lift = s.arc > 0.6 ? Math.sin(Math.min(1, s.age / Math.max(0.05, s.age + s.ttl)) * Math.PI) * 1.4 : 0.35;
      put(x, ground + lift, y, s.kind === "rocket" ? 1 : 1, s.kind === "rocket" ? 0.62 : 0.95, 0.45);
    }
    for (const b of sim.buildings) {
      if (b.hp <= 0 || b.maxHp <= 0 || b.hp > b.maxHp * 0.72) continue;
      const x = b.tx + b.w / 2;
      const y = b.ty + b.h / 2;
      const ground = sampleHeight(sim.terrain, sim.gw, sim.gh, x, y);
      const rise = (sim.time * 0.7 + b.id) % 1.4;
      put(x + Math.sin(sim.time + b.id) * 0.2, ground + 0.8 + rise, y, 0.25, 0.25, 0.25);
      if (b.hp < b.maxHp * 0.4) put(x, ground + 0.5, y, 1, 0.4, 0.12);
    }
    this.pGeo.setDrawRange(0, n);
    (this.pGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m?.dispose();
  });
}
