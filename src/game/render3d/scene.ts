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
import { CAM_FOV, eyeOf, projectGround } from "./camera.ts";
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

const MARK = new THREE.TorusGeometry(1, 0.045, 8, 28);
const SELECT = new THREE.TorusGeometry(1.05, 0.075, 8, 36);
const SELECT_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const INFANTRY = new Set(["rifle", "rocket", "marksman", "wader", "engineer", "vanguard"]);
const VEHICLE = new Set(["scout", "tank", "scatter", "medium", "artillery", "apc", "razor", "harvester", "mcv"]);
const SEA = new Set(["gunboat", "frigate", "missile", "transport"]);
const AIR = new Set(["chinook", "attackheli", "bomber"]);
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

function softPuff(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const glow = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    glow.addColorStop(0, "rgba(255,255,255,0.95)");
    glow.addColorStop(0.35, "rgba(255,255,255,0.45)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  private smokeGeo: THREE.BufferGeometry;
  private flameGeo: THREE.BufferGeometry;
  private sPos: Float32Array;
  private sCol: Float32Array;
  private fPos: Float32Array;
  private fCol: Float32Array;
  private readonly pMax = 420;
  private treeLib = new Map<string, THREE.BufferGeometry>();
  private fogGeo: THREE.BufferGeometry;
  private fogPos: Float32Array;
  private fogCol: Float32Array;
  private fogMesh: THREE.Mesh;
  private readonly fogC = 36;
  private readonly fogR = 22;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x8eafc4, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.fog = new THREE.FogExp2(0x9eb6c8, 0.011);
    this.scene.add(new THREE.HemisphereLight(0xc5d4e0, 0x3d3428, 0.62));
    this.scene.add(new THREE.AmbientLight(0x66707c, 0.22));
    this.sun = new THREE.DirectionalLight(0xfff1d4, 1.65);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(256, 256);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
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
    const puff = softPuff();
    this.sPos = new Float32Array(this.pMax * 3);
    this.sCol = new Float32Array(this.pMax * 3);
    this.fPos = new Float32Array(this.pMax * 3);
    this.fCol = new Float32Array(this.pMax * 3);
    this.smokeGeo = new THREE.BufferGeometry();
    this.smokeGeo.setAttribute("position", new THREE.BufferAttribute(this.sPos, 3));
    this.smokeGeo.setAttribute("color", new THREE.BufferAttribute(this.sCol, 3));
    this.flameGeo = new THREE.BufferGeometry();
    this.flameGeo.setAttribute("position", new THREE.BufferAttribute(this.fPos, 3));
    this.flameGeo.setAttribute("color", new THREE.BufferAttribute(this.fCol, 3));
    const smoke = new THREE.Points(
      this.smokeGeo,
      new THREE.PointsMaterial({
        map: puff,
        size: 1.7,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
        alphaTest: 0.04,
      }),
    );
    const flame = new THREE.Points(
      this.flameGeo,
      new THREE.PointsMaterial({
        map: puff,
        size: 0.95,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        alphaTest: 0.05,
      }),
    );
    smoke.frustumCulled = false;
    flame.frustumCulled = false;
    this.scene.add(smoke);
    this.scene.add(flame);
    this.loadTree("broad", "/art/models/tree-broad.glb");
    this.loadTree("pine", "/art/models/tree-pine.glb");
    this.loadTree("palm", "/art/models/tree-palm.glb");
    this.loadTree("bush", "/art/models/tree-bush.glb");
    const verts = (this.fogC + 1) * (this.fogR + 1);
    this.fogPos = new Float32Array(verts * 3);
    this.fogCol = new Float32Array(verts * 4);
    this.fogGeo = new THREE.BufferGeometry();
    this.fogGeo.setAttribute("position", new THREE.BufferAttribute(this.fogPos, 3));
    this.fogGeo.setAttribute("fogColor", new THREE.BufferAttribute(this.fogCol, 4));
    const index: number[] = [];
    for (let y = 0; y < this.fogR; y++) {
      for (let x = 0; x < this.fogC; x++) {
        const i = y * (this.fogC + 1) + x;
        const row = this.fogC + 1;
        index.push(i, i + 1, i + row + 1, i, i + row + 1, i + row);
      }
    }
    this.fogGeo.setIndex(index);
    const fogMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec4 fogColor;
        varying vec4 vColor;
        void main() {
          vColor = fogColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          if (vColor.a < 0.02) discard;
          gl_FragColor = vColor;
        }
      `,
    });
    this.fogMesh = new THREE.Mesh(this.fogGeo, fogMat);
    this.fogMesh.frustumCulled = false;
    this.fogMesh.renderOrder = 4;
    this.fogMesh.visible = false;
    this.scene.add(this.fogMesh);
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
      this.applyTrees(cam);
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
    this.shade(cam);
    this.applyTrees(cam);
    if (this.pack) {
      this.pack.water.value = sim.time;
      this.pack.foam.value = sim.time;
    }
    this.syncUnits(sim, ui, alpha);
    this.syncHalls(sim, ui);
    this.syncGhost(sim, ui);
    this.syncFx(sim, alpha);
    this.syncFog(sim, cam, view, ui.viewer);
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
    g.userData.fitted = !!src?.userData.fitted;
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
        src.rotation.y = Math.PI / 2;
        this.sit(src);
        const box = new THREE.Box3().setFromObject(src);
        const size = box.getSize(new THREE.Vector3());
        src.scale.multiplyScalar(this.targetSpan(kind, size));
        this.sit(src);
        this.pennant(src);
        src.userData.fitted = true;
        this.sources.set(kind, src);
        this.gen.set(kind, (this.gen.get(kind) ?? 0) + 1);
      },
      undefined,
      () => {
        /* missing file keeps the placeholder */
      },
    );
  }

  private sit(src: THREE.Object3D) {
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    const center = box.getCenter(new THREE.Vector3());
    src.position.x -= center.x;
    src.position.z -= center.z;
    src.position.y -= box.min.y;
  }

  private targetSpan(kind: string, size: THREE.Vector3): number {
    const def = BUILDINGS[kind as BuildingId];
    const horizontal = Math.max(size.x, size.z, 0.001);
    const height = Math.max(size.y, 0.001);
    if (def) return (Math.max(def.w, def.h) * 0.9) / horizontal;
    if (kind === "span") return 2.4 / horizontal;
    if (AIR.has(kind)) return 2.05 / horizontal;
    if (SEA.has(kind)) return 2.15 / horizontal;
    if (VEHICLE.has(kind)) return 1.65 / horizontal;
    if (INFANTRY.has(kind)) return 0.95 / height;
    return 1.2 / horizontal;
  }

  private pennant(src: THREE.Object3D) {
    let has = false;
    src.traverse((o) => {
      if (o.name === "team") has = true;
    });
    if (has) return;
    const box = new THREE.Box3().setFromObject(src);
    const size = box.getSize(new THREE.Vector3());
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0.12 }),
    );
    mesh.name = "team";
    mesh.scale.set(Math.max(0.08, size.x * 0.14), Math.max(0.05, size.y * 0.08), Math.max(0.08, size.z * 0.14));
    mesh.position.set(0, size.y * 0.72, 0);
    src.add(mesh);
  }

  private loadTree(species: string, url: string) {
    this.loader.load(
      url,
      (gltf) => {
        let geo: THREE.BufferGeometry | null = null;
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!geo && mesh.isMesh) geo = mesh.geometry;
        });
        if (!geo) return;
        this.treeLib.set(species, geo);
        this.applyTrees();
      },
      undefined,
      () => {
        /* procedural trees stay until the file arrives */
      },
    );
  }

  private applyTrees(cam?: Camera) {
    if (!this.pack) return;
    this.pack.root.traverse((o) => {
      const species = o.userData.species as string | undefined;
      const mesh = o as THREE.InstancedMesh;
      if (!species || !mesh.isInstancedMesh) return;
      const fancy = this.treeLib.get(species);
      const plain = o.userData.plain as THREE.BufferGeometry | undefined;
      const dx = ((o.userData.cx as number) ?? 0) - (cam?.x ?? 0);
      const dz = ((o.userData.cz as number) ?? 0) - (cam?.y ?? 0);
      const near = !!cam && dx * dx + dz * dz < 14 * 14;
      const useFancy = !!(fancy && near && mesh.count <= 36);
      const next = useFancy ? fancy : plain;
      if (!next || mesh.geometry === next) return;
      mesh.geometry = next;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;
      mat.vertexColors = useFancy;
      if (!useFancy) mat.color?.set(species === "pine" ? 0x24563a : species === "palm" ? 0x3c8a40 : species === "bush" ? 0x4a7a32 : 0x2f6a34);
      else mat.color?.set(0xffffff);
      const white = new THREE.Color(1, 1, 1);
      if (useFancy) {
        for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, white);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    });
  }

  private shade(cam: Camera) {
    this.scene.traverse((o) => {
      const role = o.userData.role;
      if (role !== "skirt" && role !== "tree") return;
      const dx = (o.userData.cx as number) - cam.x;
      const dz = (o.userData.cz as number) - cam.y;
      const dist = dx * dx + dz * dz;
      if (role === "skirt") {
        (o as THREE.Mesh).castShadow = dist < 18 * 18;
        return;
      }
      const count = (o as THREE.InstancedMesh).count ?? 1;
      (o as THREE.Mesh).castShadow = count <= 8 && dist < 10 * 10;
    });
  }

  private adorn(g: THREE.Group, team: number, barY: number) {
    const ring = new THREE.Mesh(MARK, TEAM_MAT[team] ?? TEAM_MAT[0]!);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    ring.name = "mark";
    ring.castShadow = false;
    ring.renderOrder = 2;
    g.add(ring);
    const pick = new THREE.Mesh(SELECT, SELECT_MAT);
    pick.rotation.x = Math.PI / 2;
    pick.position.y = 0.12;
    pick.name = "select";
    pick.visible = false;
    pick.castShadow = false;
    pick.renderOrder = 3;
    g.add(pick);
    const hp = new THREE.Sprite(barMaterial(1));
    hp.scale.set(0.7, 0.086, 1);
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
      if (!g.userData.fitted) g.scale.setScalar(1.7);
      g.position.set(x, alt, y);
      g.rotation.y = -u.facing;
      paintTeam(g, u.team);
      const world = 1 / Math.max(0.001, g.scale.x);
      const mark = g.getObjectByName("mark") as THREE.Mesh | undefined;
      if (mark) {
        mark.material = TEAM_MAT[u.team] ?? TEAM_MAT[0]!;
        const markR = INFANTRY.has(u.kind) ? 0.52 : AIR.has(u.kind) ? 1.15 : 0.95;
        mark.scale.set(world * markR, world * markR, world * markR);
        mark.position.y = 0.05 * world;
      }
      const selected = ui.selected.includes(u.id);
      const pick = g.getObjectByName("select");
      if (pick) {
        pick.visible = selected;
        pick.scale.set(world, world, world);
        pick.position.y = 0.12 * world;
      }
      const damaged = u.maxHp > 0 && u.hp < u.maxHp - 0.5;
      const hp = g.getObjectByName("hp") as THREE.Sprite | undefined;
      if (hp) {
        hp.visible = damaged || selected;
        if (hp.visible) {
          hp.material = barMaterial(u.maxHp > 0 ? u.hp / u.maxHp : 1);
          hp.position.y = (u.loco === "air" ? 1.7 : 1.25) * world;
          hp.scale.set(0.72 * world, 0.09 * world, 1);
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
      const world = 1 / Math.max(0.001, g.scale.x);
      const mark = g.getObjectByName("mark") as THREE.Mesh | undefined;
      if (mark) {
        mark.material = TEAM_MAT[b.team] ?? TEAM_MAT[0]!;
        mark.scale.set(world * 0.62, world * 0.62, world * 0.62);
        mark.position.y = 0.06 * world;
      }
      const picked = ui.buildingId === b.id;
      const pick = g.getObjectByName("select");
      if (pick) {
        pick.visible = picked && b.kind !== "span";
        const s = Math.max(b.w, b.h) * 0.55 * world;
        pick.scale.set(s, s, s);
        pick.position.y = 0.14 * world;
      }
      const damaged = b.maxHp > 0 && b.hp < b.maxHp - 0.5;
      const hp = g.getObjectByName("hp") as THREE.Sprite | undefined;
      if (hp) {
        hp.visible = (damaged || picked) && b.kind !== "span";
        if (hp.visible) {
          hp.material = barMaterial(b.maxHp > 0 ? b.hp / b.maxHp : 1);
          hp.position.y = Math.max(1.3, Math.max(b.w, b.h) * 0.7) * world;
          hp.scale.set(Math.min(1.2, 0.42 * Math.max(b.w, b.h)) * world, 0.086 * world, 1);
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
    let smokeN = 0;
    let flameN = 0;
    const smoke = (x: number, y: number, z: number, r: number, g: number, b: number) => {
      if (smokeN >= this.pMax) return;
      const i = smokeN * 3;
      this.sPos[i] = x;
      this.sPos[i + 1] = y;
      this.sPos[i + 2] = z;
      this.sCol[i] = r;
      this.sCol[i + 1] = g;
      this.sCol[i + 2] = b;
      smokeN++;
    };
    const flame = (x: number, y: number, z: number, r: number, g: number, b: number) => {
      if (flameN >= this.pMax) return;
      const i = flameN * 3;
      this.fPos[i] = x;
      this.fPos[i + 1] = y;
      this.fPos[i + 2] = z;
      this.fCol[i] = r;
      this.fCol[i + 1] = g;
      this.fCol[i + 2] = b;
      flameN++;
    };
    for (const f of sim.fx) {
      const k = 1 - f.ttl / Math.max(0.05, f.max);
      const ground = sampleHeight(sim.terrain, sim.gw, sim.gh, f.x, f.y);
      if (f.kind === "boom") {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + k;
          const rad = f.r * (0.2 + k) * (0.55 + (i % 3) * 0.2);
          flame(f.x + Math.cos(a) * rad * 0.45, ground + 0.2 + k * 0.7, f.y + Math.sin(a) * rad * 0.45, 1, 0.55 - k * 0.25, 0.12);
          smoke(f.x + Math.cos(a) * rad, ground + 0.45 + k * 1.5, f.y + Math.sin(a) * rad, 0.55, 0.52, 0.48);
        }
      } else if (f.kind === "debris") {
        smoke(f.x, ground + 0.35 + k * 0.9, f.y, 0.4, 0.34, 0.28);
      } else if (f.kind === "muzzle" || f.kind === "flash") {
        flame(f.x, ground + 0.4, f.y, 1, 0.82, 0.35);
      } else if (f.kind === "beam") {
        flame(f.x, ground + 0.45, f.y, 0.75, 0.9, 1);
        flame(f.x2, sampleHeight(sim.terrain, sim.gw, sim.gh, f.x2, f.y2) + 0.4, f.y2, 0.75, 0.9, 1);
      }
    }
    for (const s of sim.shots) {
      const x = s.px + (s.x - s.px) * alpha;
      const y = s.py + (s.y - s.py) * alpha;
      const ground = sampleHeight(sim.terrain, sim.gw, sim.gh, x, y);
      const lift = s.arc > 0.6 ? Math.sin(Math.min(1, s.age / Math.max(0.05, s.age + s.ttl)) * Math.PI) * 1.4 : 0.35;
      flame(x, ground + lift, y, 1, s.kind === "rocket" ? 0.55 : 0.9, 0.28);
      smoke(x, ground + lift + 0.25, y, 0.45, 0.42, 0.4);
    }
    for (const b of sim.buildings) {
      if (b.hp <= 0 || b.maxHp <= 0 || b.hp > b.maxHp * 0.72) continue;
      const x = b.tx + b.w / 2;
      const y = b.ty + b.h / 2;
      const ground = sampleHeight(sim.terrain, sim.gw, sim.gh, x, y);
      const burning = b.hp < b.maxHp * 0.4;
      for (let i = 0; i < 4; i++) {
        const k = (sim.time * 0.55 + b.id * 0.17 + i * 0.25) % 1;
        const spread = 0.15 + k * 0.45;
        const ang = b.id + i * 1.7;
        smoke(x + Math.cos(ang) * spread, ground + 0.35 + k * 1.8, y + Math.sin(ang) * spread, 0.42 + k * 0.2, 0.4 + k * 0.15, 0.38);
        if (burning && k < 0.62) {
          flame(
            x + Math.cos(ang) * spread * 0.35,
            ground + 0.15 + k * 0.9,
            y + Math.sin(ang) * spread * 0.35,
            1,
            0.42 + (1 - k) * 0.4,
            0.08,
          );
        }
      }
    }
    this.smokeGeo.setDrawRange(0, smokeN);
    this.flameGeo.setDrawRange(0, flameN);
    (this.smokeGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.smokeGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.flameGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.flameGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Screen-draped veil. Unexplored ground is dark and covers the trees. Explored ground is a tint. */
  private syncFog(sim: Sim, cam: Camera, view: View, viewer: number) {
    const fog = sim.fogOn ? sim.fog[viewer as Team] : undefined;
    if (!fog || fog.length < sim.gw * sim.gh) {
      this.fogMesh.visible = false;
      return;
    }
    const cols = this.fogC;
    const rows = this.fogR;
    let any = false;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const n = j * (cols + 1) + i;
        const hit = projectGround(cam, view, (i / cols) * view.w, (j / rows) * view.h);
        const o3 = n * 3;
        const o4 = n * 4;
        const inside = !!hit && hit.x >= -1 && hit.y >= -1 && hit.x <= sim.gw + 1 && hit.y <= sim.gh + 1;
        if (!hit || !inside) {
          this.fogPos[o3] = cam.x;
          this.fogPos[o3 + 1] = -6;
          this.fogPos[o3 + 2] = cam.y;
          this.fogCol[o4 + 3] = 0;
          continue;
        }
        const tx = Math.max(0, Math.min(sim.gw - 1, hit.x | 0));
        const ty = Math.max(0, Math.min(sim.gh - 1, hit.y | 0));
        const state = fog[ty * sim.gw + tx] ?? 0;
        const h = sampleHeight(sim.terrain, sim.gw, sim.gh, hit.x, hit.y);
        const shroud = state !== 2 && state !== 1;
        this.fogPos[o3] = hit.x;
        this.fogPos[o3 + 1] = h + (shroud ? 1.55 : 0.08);
        this.fogPos[o3 + 2] = hit.y;
        const alpha = state === 2 ? 0 : state === 1 ? 58 / 255 : 220 / 255;
        this.fogCol[o4] = 18 / 255;
        this.fogCol[o4 + 1] = 22 / 255;
        this.fogCol[o4 + 2] = 28 / 255;
        this.fogCol[o4 + 3] = alpha;
        if (alpha > 0) any = true;
      }
    }
    for (let j = rows; j >= 0; j--) {
      for (let i = 0; i <= cols; i++) {
        const n = j * (cols + 1) + i;
        if (this.fogPos[n * 3 + 1] > -5) continue;
        const below = j < rows ? (j + 1) * (cols + 1) + i : -1;
        if (below >= 0 && this.fogPos[below * 3 + 1] > -5) {
          this.fogPos[n * 3] = this.fogPos[below * 3]!;
          this.fogPos[n * 3 + 1] = this.fogPos[below * 3 + 1]!;
          this.fogPos[n * 3 + 2] = this.fogPos[below * 3 + 2]!;
        }
        this.fogCol[n * 4 + 3] = 0;
      }
    }
    this.fogMesh.visible = any;
    (this.fogGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.fogGeo.getAttribute("fogColor") as THREE.BufferAttribute).needsUpdate = true;
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
