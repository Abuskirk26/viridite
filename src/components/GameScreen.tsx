import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Anchor,
  ArrowDownToLine,
  Castle,
  Database,
  Crosshair,
  DoorOpen,
  EyeOff,
  Factory,
  Fence,
  Gem,
  Landmark,
  LayoutGrid,
  Move,
  Star,
  Timer,
  Box,
  Pause,
  Plane,
  Play,
  Radar,
  RotateCcw,
  Shield,
  Package,
  Square,
  UnfoldHorizontal,
  Users,
  Volume2,
  VolumeX,
  Warehouse,
  Wrench,
  X,
  Zap,
  Ban,
  Hand,
  Route,
} from "lucide-react";
import { Sim, DEPLOY_SECS, footprintOrigin, ghostPlaceReason, traceTiles, type Building, type SimSave } from "@/game/sim";
import { combatTrack, handleCue, isMuted, playScore, setMuted, sfx, stopBeds, unlockAudio, bark, barkClass, subscribeAudioGate, subscribeMute } from "@/game/audio";
import {
  BUILDINGS,
  BUILD_ORDER,
  FACTION_NAME,
  SEAT_NAME,
  SURVIVE_SECONDS,
  commandCost,
  isFence,
  resolveBuilding,
  resolveUnit,
  trainedList,
  unitRequires,
  type BuildingId,
  type FactionId,
  type Team,
  type TrainAt,
  type UnitId,
  wideField,
} from "@/game/data";
import {
  DEFAULT_SETUP,
  SIZE_LABEL,
  START_LABEL,
  TEAM_LABEL,
  buildingOffered,
  clampSetup,
  loadSetup,
  lobbyBlock,
  normalBotDefaults,
  saveSetup,
  toNewGame,
  trainOffered,
  randomSetup,
  warnSkirmishDefaults,
  type SkirmishSetup,
} from "@/game/lobby";
import { attachInput, type PointerDraft } from "@/game/input";
import { ensureArt } from "@/game/art";
import { bakeTerrain, drawGame, ensureGround, frameScale, groundSettled, placeChrome, sheetLong } from "@/game/render";
import { ensureIso, iso } from "@/game/iso";
import { SheetBody, SheetHead } from "@/components/SettingsSheet";
import { AudioBuses } from "@/components/AudioBuses";
import { ReadyUp } from "@/components/ReadyUp";
import { TeamPip } from "@/components/TeamPip";
import { SkirmishLobby } from "@/components/SkirmishLobby";
import { doctrineOf, packById, type SheetTab } from "@/game/doctrine";
import { MapEditor } from "@/components/MapEditor";
import { NetLobby } from "@/components/NetLobby";
import { loadMap } from "@/game/custom";
import { lobbySize, offersNavy } from "@/game/editor";
import { NetPlay, parseRoomCode } from "@/game/netplay";
import { seatStatusLabel } from "@/game/relay-room";
import { quant, seatResult, type CmdKind, type Cmd } from "@/game/orders";
import { clampCamera, minimapHit, openingZoom, screenToWorld, setViewPitch, stepInertia, stepZoom, tacticalHome, viewPitch, worldToScreen, zoomAtBias, zoomBias, type Camera, type View } from "@/game/view";

const SAVE_KEY = "viridite-last-match";

interface MatchFile {
  v: 1;
  sim: SimSave;
  cam: Camera;
}

const FINGER_LIFT = 72;

/** World point above the finger so the ghost is not hidden by the hand. */
function liftedWorld(cam: Camera, view: View, sx: number, sy: number, lift: boolean) {
  return screenToWorld(cam, sx, lift ? sy - FINGER_LIFT : sy, view);
}

/** Enemy hall under a finger. A touch also samples above the contact, where the picture sits. */
function pickStrike(sim: Sim, cam: Camera, view: View, sx: number, sy: number, touch: boolean, viewer: 0) {
  const lifts = touch ? [0, 44, 72] : [0];
  for (const lift of lifts) {
    const at = screenToWorld(cam, sx, sy - lift, view);
    const b = sim.pickBuilding(at.x, at.y, cam.zoom, viewer);
    if (b && b.hp > 0 && b.rubble <= 0) return b;
  }
  return null;
}

function aimedCell(sim: Sim, cam: Camera, view: View, kind: BuildingId, sx: number, sy: number, lift = false) {
  const world = liftedWorld(cam, view, sx, sy, lift);
  return footprintOrigin(kind, world.x, world.y);
}

type Phase = "menu" | "net" | "play" | "over" | "editor";
type ProdTab = "build" | "barracks" | "factory" | "dock" | "helipad";

const BUILD_ICON: Record<BuildingId, typeof Landmark> = {
  yard: Landmark,
  power: Zap,
  advpower: Zap,
  refinery: Factory,
  barracks: Users,
  factory: Warehouse,
  dock: Anchor,
  helipad: Plane,
  tower: Castle,
  aa: Shield,
  radar: Radar,
  stealth: EyeOff,
  wall: Fence,
  sandbag: Fence,
  gate: DoorOpen,
  silo: Database,
  supply: Package,
  span: Square,
};

function WarStrip({
  sim,
  team,
  compact,
  overlay,
  onBoost,
  onRaise,
}: {
  sim: Sim;
  team: number;
  compact: boolean;
  overlay?: boolean;
  onBoost: (which: "works" | "march") => void;
  onRaise: () => void;
}) {
  const seat = (team === 1 || team === 2 || team === 3 ? team : 0) as 0 | 1 | 2 | 3;
  const cap = sim.commandCap(seat);
  const used = sim.commandUsed(seat);
  const per = Math.round(sim.supplyPerSec(seat));
  const tight = used >= cap;
  const haulIn = sim.cratesOn && !sim.haulLanded ? Math.max(0, 210 - sim.time) : 0;
  const worksOn = sim.worksLeft[team]! > 0;
  const marchOn = sim.marchLeft[team]! > 0;
  const worksWait = !worksOn && sim.worksCd[team]! > 0;
  const marchWait = !marchOn && sim.marchCd[team]! > 0;
  const raising = sim.commandLeft[team]! > 0;
  const maxed = sim.commandLv[team]! >= 3;
  const raiseCost = 600 + (sim.commandLv[team] ?? 0) * 450;
  const h = compact ? "h-8" : "h-11";
  return (
    <div
      data-testid="war-strip"
      className={`flex items-center gap-1 overflow-x-auto border-b border-brass-dim bg-field/92 px-1 ${compact ? "py-0.5" : "py-1"} ${overlay ? "absolute top-8 left-0 z-30" : "shrink-0"}`}
      style={overlay ? { right: "7.5rem" } : undefined}
    >
      <div className={`steel-inset flex shrink-0 items-center px-2 font-display uppercase tracking-wide ${h} ${tight ? "text-danger" : "text-gold"} ${compact ? "text-[10px]" : "text-xs"}`}>
        CP <span className="ml-1 tabular-nums text-ink">{used}/{cap}</span>
      </div>
      <div className={`steel-inset flex shrink-0 items-center px-2 font-display uppercase text-crystal tabular-nums ${h} ${compact ? "text-[10px]" : "text-xs"}`}>
        +{per}/s
      </div>
      <div className={`steel-inset flex shrink-0 items-center px-2 font-display tracking-wide text-brass ${h} text-[13px]`}>
        {climbLabel(sim)}
      </div>
      {haulIn > 0 && (
        <div className={`steel-inset flex shrink-0 items-center px-2 font-display uppercase text-brass tabular-nums ${h} ${compact ? "text-[10px]" : "text-xs"}`}>
          Haul {clock(haulIn)}
        </div>
      )}
      <button
        type="button"
        data-testid="boost-works"
        className={`${h} shrink-0 px-2 font-display uppercase ${worksOn ? "bg-crystal text-crystal-ink" : "bevel-btn"} ${compact ? "text-[10px]" : "text-xs"} ${worksWait ? "text-muted" : ""}`}
        onClick={() => onBoost("works")}
      >
        {worksOn ? `Works ${Math.ceil(sim.worksLeft[team]!)}s` : worksWait ? `Works ${Math.ceil(sim.worksCd[team]!)}s` : "Works"}
      </button>
      <button
        type="button"
        data-testid="boost-march"
        className={`${h} shrink-0 px-2 font-display uppercase ${marchOn ? "bg-crystal text-crystal-ink" : "bevel-btn"} ${compact ? "text-[10px]" : "text-xs"} ${marchWait ? "text-muted" : ""}`}
        onClick={() => onBoost("march")}
      >
        {marchOn ? `March ${Math.ceil(sim.marchLeft[team]!)}s` : marchWait ? `March ${Math.ceil(sim.marchCd[team]!)}s` : "March"}
      </button>
      <button
        type="button"
        data-testid="raise-command"
        disabled={raising || maxed}
        className={`${h} shrink-0 px-2 font-display uppercase bevel-btn disabled:text-muted ${compact ? "text-[10px]" : "text-xs"}`}
        onClick={onRaise}
      >
        {maxed ? "Cmd max" : raising ? `Cmd ${Math.ceil(sim.commandLeft[team]!)}s` : `Cmd ${raiseCost}`}
      </button>
    </div>
  );
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** How much of the canvas the HUD, host banner, or command bar is covering. */
function battleChrome(canvas: HTMLCanvasElement): { top: number; bottom: number } {
  const c = canvas.getBoundingClientRect();
  let top = 0;
  let bottom = 0;
  const takeTop = (el: Element | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom <= c.top + 0.5 || r.top >= c.bottom) return;
    top = Math.max(top, r.bottom - c.top);
  };
  const takeBottom = (el: Element | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.top >= c.bottom - 0.5 || r.bottom <= c.top) return;
    bottom = Math.max(bottom, c.bottom - r.top);
  };
  takeTop(document.querySelector("[data-testid='resource-bar']"));
  takeTop(document.querySelector("[data-testid='seat-pings']"));
  takeBottom(document.querySelector("[data-testid='battle-footer']"));
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement) || el.contains(canvas)) continue;
    const pos = getComputedStyle(el).position;
    if (pos !== "fixed" && pos !== "sticky") continue;
    const r = el.getBoundingClientRect();
    if (r.height < 6 || r.height > c.height * 0.45 || r.width < 24) continue;
    const wide = r.width > c.width * 0.55;
    const hitsMinimap = r.right > c.right - 180 && r.left < c.right;
    if (!wide && !hitsMinimap) continue;
    if (r.bottom > c.top + 1 && r.top < c.top + 96) top = Math.max(top, r.bottom - c.top);
  }
  return { top: Math.max(0, top), bottom: Math.max(0, bottom) };
}

function botBrief(sim: Sim): string {
  const rows: string[] = [];
  for (let t = 1; t <= sim.opponents; t++) {
    if (!sim.cpu[t]) continue;
    const who = SEAT_NAME[t] ?? "Bot";
    const diff = sim.difficultyOf(t as Team);
    const stance = sim.stanceOf(t as Team);
    const d = diff === "hard" ? "Hard" : diff === "easy" ? "Easy" : "Normal";
    const s = stance === "raider" ? "Raider" : stance === "passive" ? "Passive" : "Builder";
    rows.push(`${who} · ${d} · ${s}`);
  }
  return rows.length ? rows.join(" · ") : "No bot in this match";
}

function climbLabel(sim: Sim): string {
  const minute = Math.floor(sim.time / 60);
  let rank = -1;
  let name = "";
  for (let t = 1; t <= sim.opponents; t++) {
    if (!sim.cpu[t] || sim.eliminated[t]) continue;
    const seat = (t === 2 || t === 3 ? t : 1) as 0 | 1 | 2 | 3;
    const d = sim.difficultyOf(seat);
    const r = d === "hard" ? 2 : d === "normal" ? 1 : 0;
    if (r < rank) continue;
    rank = r;
    name = d === "hard" ? "Hard" : d === "normal" ? "Normal" : "Easy";
  }
  if (!name) return `${minute}m`;
  return `${name} · ${minute}m`;
}

const SPEED_STEPS = [0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];

function readSave(): MatchFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as MatchFile;
    if (!data || data.v !== 1 || !data.sim) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSave(sim: Sim, cam: Camera) {
  try {
    const file: MatchFile = { v: 1, sim: sim.toSave(), cam: { ...cam } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    /* private mode or quota — the match still runs */
  }
}

function hintFor(sim: Sim, team: Team = 0): string {
  const yard = sim.buildings.some((b) => b.team === team && b.kind === "yard" && b.hp > 0);
  const mcv = sim.units.some((u) => u.team === team && u.kind === "mcv" && u.hp > 0);
  const has = (k: BuildingId) => sim.buildings.some((b) => b.team === team && b.kind === k && b.hp > 0);
  const done = (k: BuildingId) => sim.buildings.some((b) => b.team === team && b.kind === k && b.complete && b.hp > 0);
  if (!yard && mcv) return "Deploy the MCV a few tiles toward the center. The yard is your headquarters.";
  if (!yard) return "Yard lost. Train an MCV at the War Factory, then deploy it.";
  if (!has("power")) return "Power Plant first. Low power stops supply income and shuts the base down.";
  if (!done("power")) return "Plant spinning up. Supply Centers wait on power.";
  if (!has("supply")) return "Build a Supply Center. It drips war material every second. Two of them win the opening.";
  if (!done("supply")) return "Supply Center rising. Hit Works to finish the opening faster.";
  if (!has("refinery")) return "Refinery still hauls crystal. Supply is the steady income; crystal is the burst.";
  if (!has("barracks")) return "Barracks next. Rally toward the green field caches and grab them with rifles.";
  if (sim.cratesOn && !sim.haulLanded) return `Heavy field haul hits the center in ${clock(Math.max(0, 210 - sim.time))}.`;
  if (!has("factory")) return "War Factory for armor. Tanks cost more command points than rifles.";
  if (sim.commandUsed(team) >= sim.commandCap(team) - 2) return "The field is full. Spend what you have before you train more.";
  if (sim.mode === "survive") return "Hold the clock, or flatten their Construction Yard.";
  return "Infantry in the woods stay hidden until a ground unit walks up beside them. Your own troops show a leaf mark.";
}

export function GameScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const sheetRef = useRef<{ small: HTMLCanvasElement; mid: HTMLCanvasElement | null; full: HTMLCanvasElement | null; key: string } | null>(null);
  const camRef = useRef<Camera>({ x: 32, y: 32, zoom: 48 });
  const viewRef = useRef<View>({ w: 1, h: 1 });
  const phaseRef = useRef<Phase>("menu");
  const pausedRef = useRef(false);
  const selRef = useRef<number[]>([]);
  const selBRef = useRef<number | null>(null);
  const placingRef = useRef<BuildingId | null>(null);
  const rallyRef = useRef(false);
  const shakeRef = useRef(0);
  const fittedRef = useRef(false);
  const fittedH = useRef(0);
  const fittedW = useRef(0);
  const lastSave = useRef(0);
  const speedRef = useRef(1);
  const optsRef = useRef<SkirmishSetup>(DEFAULT_SETUP);
  const draftRef = useRef<PointerDraft>({ box: null, hoverX: 0, hoverY: 0, hovering: false, wallPts: [], lift: false });
  const touchPlaceRef = useRef(false);
  const shiftPlaceRef = useRef(false);
  const netRef = useRef<NetPlay | null>(null);
  const viewerRef = useRef(0);
  const chatRef = useRef<string | null>(null);
  const actRef = useRef<(kind: CmdKind, payload: Cmd["payload"], offline: () => void) => void>(() => {});
  const stallShown = useRef("");
  const awayShown = useRef("");
  const pingShown = useRef("");

  const [phase, setPhase] = useState<Phase>("menu");
  const [menuTab, setMenuTab] = useState<SheetTab>("game");
  const [ready, setReady] = useState(true);
  const [pauseSheet, setPauseSheet] = useState(false);
  const [pauseTab, setPauseTab] = useState<SheetTab>("game");
  const [invite, setInvite] = useState("");
  const [paused, setPaused] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [phone, setPhone] = useState(false);
  const [short, setShort] = useState(false);
  const [hostBar, setHostBar] = useState(0);
  const [trayUp, setTrayUp] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [muted, setMutedUi] = useState(() => isMuted());
  const [soundGate, setSoundGate] = useState(false);
  const [setup, setSetup] = useState<SkirmishSetup>(DEFAULT_SETUP);
  const [sel, setSel] = useState<number[]>([]);
  const [selB, setSelB] = useState<number | null>(null);
  const [placing, setPlacing] = useState<BuildingId | null>(null);
  const [rally, setRally] = useState(false);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [viewer, setViewer] = useState(0);
  const [online, setOnline] = useState(false);
  const [stall, setStall] = useState("");
  const [away, setAway] = useState("");
  const [pingLine, setPingLine] = useState("");
  const [delayTicks, setDelayTicks] = useState(8);
  const [desync, setDesync] = useState(false);
  const [rejoinNote, setRejoinNote] = useState("");
  const [chat, setChat] = useState<string | null>(null);
  const [arming, setArming] = useState(false);
  const [strike, setStrike] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [prodTab, setProdTab] = useState<ProdTab>("build");
  const [remixId, setRemixId] = useState("");
  const [squadOn, setSquadOn] = useState<[boolean, boolean, boolean, boolean]>([false, false, false, false]);
  const groupsRef = useRef<number[][]>([[], [], [], []]);
  const alarmTap = useRef(0);
  const saveGroupRef = useRef<(i: number) => void>(() => {});
  const recallGroupRef = useRef<(i: number) => void>(() => {});
  const [prep, setPrep] = useState({ on: false, map: false, figs: false });
  const prepRun = useRef(0);
  const armRef = useRef(false);
  const strikeRef = useRef(false);
  const selectRef = useRef(false);
  const samePick = useRef({ kind: "", t: 0 });

  phaseRef.current = phase;
  pausedRef.current = paused;

  useEffect(() => {
    ensureArt();
    ensureIso();
    ensureGround();
  }, []);

  useEffect(() => {
    const code = parseRoomCode(window.location.search);
    if (!code) return;
    setInvite(code);
    setPhase("net");
  }, []);

  useEffect(() => subscribeAudioGate(setSoundGate), []);
  useEffect(() => subscribeMute(setMutedUi), []);

  useEffect(() => {
    if (isMuted()) return;
    if (phase === "menu" || phase === "net") {
      stopBeds();
      playScore("menu");
      return;
    }
    const sim = simRef.current;
    if (!sim) return;
    if (phase === "play") playScore(combatTrack(sim.factionOf(viewer as 0)));
    else if (phase === "over") {
      const result = online ? seatResult(sim, viewer) : sim.outcome;
      playScore(result === "win" ? "victory" : "defeat");
    }
  }, [phase, muted, viewer, online]);

  selRef.current = sel;
  selBRef.current = selB;
  placingRef.current = placing;
  rallyRef.current = rally;
  speedRef.current = speed;
  viewerRef.current = viewer;
  chatRef.current = chat;
  armRef.current = arming;
  strikeRef.current = strike;
  selectRef.current = selecting;

  useEffect(() => {
    if (!arming && strike) setStrike(false);
  }, [arming, strike]);

  useEffect(() => {
    if (phase !== "play") return;
    const blockMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", blockMenu, true);
    return () => window.removeEventListener("contextmenu", blockMenu, true);
  }, [phase]);

  useEffect(() => {
    if (sel.length > 0 || selB != null || placing) setTrayUp(false);
  }, [sel, selB, placing]);

  useEffect(() => {
    setHasSave(!!readSave());
    warnSkirmishDefaults();
    const rules = loadSetup();
    if (rules) {
      setSetup(rules);
      setSpeed(rules.speed);
    }
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onVis = () => {
      if (phaseRef.current !== "play") return;
      const net = netRef.current;
      if (!net) {
        if (document.hidden) setPaused(true);
        return;
      }
      net.setHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", onVis);
    const onResize = () => {
      const vv = window.visualViewport;
      const h = vv?.height ?? window.innerHeight;
      const w = vv?.width ?? window.innerWidth;
      const top = vv?.offsetTop ?? 0;
      document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
      document.documentElement.style.setProperty("--app-top", `${Math.round(top)}px`);
      setPortrait(h > w + 40);
      setPhone(Math.min(w, h) < 520 || w < 800);
      setShort(h < 500);
      let bar = 0;
      const root = document.querySelector("[data-testid='game-root']");
      for (const el of Array.from(document.body.children)) {
        if (!(el instanceof HTMLElement)) continue;
        if (root && (el === root || el.contains(root))) continue;
        const pos = getComputedStyle(el).position;
        if (pos !== "fixed" && pos !== "sticky") continue;
        const r = el.getBoundingClientRect();
        if (r.top > 4 || r.height < 8 || r.height > 96 || r.width < w * 0.5) continue;
        bar = Math.max(bar, Math.round(r.bottom));
      }
      setHostBar((prev) => (prev === bar ? prev : bar));
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, []);

  const holdForArt = () => {
    if (netRef.current) return;
    const run = ++prepRun.current;
    pausedRef.current = true;
    setPaused(true);
    setPrep({ on: true, map: false, figs: false });
    ensureArt();
    ensureIso();
    ensureGround();
    const started = performance.now();
    const step = () => {
      if (prepRun.current !== run) return;
      const figs = !!iso();
      const map = !!sheetRef.current?.full;
      const settled = groundSettled();
      const waited = performance.now() - started;
      setPrep((prev) => (prev.on && prev.map === map && prev.figs === figs ? prev : { on: true, map, figs }));
      const ready = figs && map && settled;
      if (ready || waited > 8000 || phaseRef.current !== "play") {
        setPrep({ on: false, map, figs });
        if (phaseRef.current === "play" && prepRun.current === run) {
          pausedRef.current = false;
          setPaused(false);
        }
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const boot = (sim: Sim, cam?: Camera) => {
    stopBeds();
    sim.ear = viewerRef.current as 0;
    sim.onCue = handleCue;
    simRef.current = sim;
    sheetRef.current = null;
    camRef.current = cam ?? {
      x: sim.starts.player.x,
      y: sim.starts.player.y - 1,
      zoom: openingZoom(sim.mapSize),
    };
    clampCamera(camRef.current, sim.gw, sim.gh, viewRef.current);
    fittedRef.current = !!cam;
    fittedH.current = 0;
    fittedW.current = 0;
    lastSave.current = sim.time;
    const mcv = sim.units.find((u) => u.team === viewerRef.current && u.kind === "mcv" && u.hp > 0);
    setSel(mcv ? [mcv.id] : []);
    setSelB(null);
    setPlacing(null);
    setRally(false);
    groupsRef.current = [[], [], [], []];
    setSquadOn([false, false, false, false]);
    setPaused(false);
    draftRef.current.hovering = false;
    draftRef.current.box = null;
    draftRef.current.wallPts = [];
    setPhase(sim.outcome === "playing" ? "play" : "over");
    unlockAudio();
    if (sim.outcome === "playing") holdForArt();
    if (!isMuted()) {
      if (sim.outcome === "playing") {
        playScore(combatTrack(sim.factionOf(viewerRef.current as 0)));
        sfx("deploy");
      } else playScore(sim.outcome === "win" ? "victory" : "defeat");
    }
  };

  const patchSetup = (partial: Partial<SkirmishSetup>) => {
    setSetup((prev) => {
      const next = clampSetup({ ...prev, ...partial });
      if (partial.opponents == null && partial.teams == null) {
        next.opponents = prev.opponents;
        next.teams = prev.teams;
      }
      saveSetup(next);
      return next;
    });
  };

  const restartSame = () => {
    const rules = optsRef.current;
    setSpeed(rules.speed);
    boot(new Sim(toNewGame(rules)));
  };

  const startFresh = () => {
    if (lobbyBlock(setup)) return;
    saveSetup(setup);
    optsRef.current = setup;
    setSpeed(setup.speed);
    netRef.current?.leave();
    netRef.current = null;
    setOnline(false);
    setViewer(0);
    boot(new Sim(toNewGame(setup)));
  };

  const beginNet = (sim: Sim, seat: number, net: NetPlay) => {
    netRef.current = net;
    setViewer(seat);
    viewerRef.current = seat;
    setOnline(true);
    setSpeed(1);
    speedRef.current = 1;
    const at = sim.starts.slots[seat] ?? sim.starts.player;
    net.onStart = (next, nextSeat) => {
      setDesync(false);
      setRejoinNote("");
      setViewer(nextSeat);
      viewerRef.current = nextSeat;
      const spot = next.starts.slots[nextSeat] ?? next.starts.player;
      boot(next, { x: spot.x, y: spot.y - 1, zoom: openingZoom(next.mapSize) });
    };
    boot(sim, { x: at.x, y: at.y - 1, zoom: openingZoom(sim.mapSize) });
  };

  /** Online orders go to the relay. Skirmish still applies on the tap. */
  const act = (kind: CmdKind, payload: Cmd["payload"], offline: () => void) => {
    const lock = netRef.current;
    const sim = simRef.current;
    if (lock) {
      if (sim?.eliminated[viewerRef.current] && kind !== "chat" && kind !== "pause") return;
      lock.command(kind, payload);
      return;
    }
    offline();
  };
  actRef.current = act;

  useEffect(() => {
    if (phase !== "play") return;
    const panKeys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        if (placingRef.current) {
          e.preventDefault();
          setPlacing(null);
        }
        return;
      }
      if (e.key === "Shift") {
        shiftPlaceRef.current = true;
        return;
      }
      const k = e.key.toLowerCase();
      if (k >= "1" && k <= "4") {
        e.preventDefault();
        const i = Number(k) - 1;
        if (e.ctrlKey || e.metaKey || e.shiftKey) saveGroupRef.current(i);
        else recallGroupRef.current(i);
        return;
      }
      if (k === "h" || e.key === "Home") {
        e.preventDefault();
        const sim = simRef.current;
        if (!sim) return;
        const home = sim.starts.slots[viewerRef.current] ?? sim.starts.player;
        camRef.current.x = home.x;
        camRef.current.y = home.y;
        camRef.current.vx = 0;
        camRef.current.vy = 0;
        clampCamera(camRef.current, sim.gw, sim.gh, viewRef.current, wideField(sim.mapSize));
        return;
      }
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        panKeys.add(k);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftPlaceRef.current = false;
      panKeys.delete(e.key.toLowerCase());
    };
    const applyKeys = () => {
      if (phaseRef.current !== "play") return;
      const cam = camRef.current;
      const speed = 14;
      let vx = 0;
      let vy = 0;
      if (panKeys.has("arrowleft") || panKeys.has("a")) vx -= speed;
      if (panKeys.has("arrowright") || panKeys.has("d")) vx += speed;
      if (panKeys.has("arrowup") || panKeys.has("w")) vy -= speed;
      if (panKeys.has("arrowdown") || panKeys.has("s")) vy += speed;
      if (vx || vy) {
        cam.vx = vx;
        cam.vy = vy;
      }
    };
    const id = setInterval(applyKeys, 16);
    const onMouse = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || placingRef.current) return;
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      if (mx < 0 || my < 0 || mx > r.width || my > r.height) return;
      const edge = 28;
      const cam = camRef.current;
      const speed = 12;
      if (mx < edge) cam.vx = -speed;
      else if (mx > r.width - edge) cam.vx = speed;
      if (my < edge) cam.vy = -speed;
      else if (my > r.height - edge) cam.vy = speed;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouse);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [phase]);

  const rollSetup = () => {
    const next = randomSetup();
    saveSetup(next);
    setSetup(next);
    unlockAudio();
    sfx("select");
  };

  const continueMatch = () => {
    const file = readSave();
    if (!file) return;
    const sim = Sim.fromSave(file.sim);
    if (!sim) return;
    const credits: SkirmishSetup["credits"] =
      sim.startCredits === 2000 || sim.startCredits === 5000 || sim.startCredits === 10000 ? sim.startCredits : 5000;
    const speedNow = speedRef.current;
    const lobbySpeed: SkirmishSetup["speed"] =
      speedNow === 0.75 || speedNow === 1 || speedNow === 1.5 || speedNow === 2 ? speedNow : 1;
    const remembered: SkirmishSetup = {
      mapId: sim.mapId,
      player: sim.playerFaction,
      enemy: sim.enemyFaction,
      mode: sim.mode,
      credits,
      ai: sim.ai,
      difficulty: sim.difficulty,
      showAi: optsRef.current.showAi,
      fog: sim.fogOn,
      crates: sim.cratesOn,
      speed: lobbySpeed,
      size: sim.mapSize,
      opponents: sim.teamMode === "tvt" ? 2 : sim.opponents,
      teams: sim.teamMode,
      start: sim.startPos,
      shared: sim.sharedVision,
      stanceMode: sim.stanceEach ? "seat" : "global",
      stances: sim.stances,
      walls: sim.wallsOn,
      customId: optsRef.current.customId,
      bots: [sim.seatChart[1], sim.seatChart[2], sim.seatChart[3]],
      skills: sim.skills,
    };
    optsRef.current = remembered;
    setSetup(remembered);
    boot(sim, file.cam);
  };

  useEffect(() => {
    if (phase === "menu" || phase === "editor") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHud = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const sim = simRef.current;
      const ctx = canvas.getContext("2d");
      if (!sim || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const dpr = frameScale();
      const bw = Math.floor(w * dpr);
      const bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      const chrome = battleChrome(canvas);
      viewRef.current = { w, h, chromeTop: chrome.top, chromeBottom: chrome.bottom };
      const nowLand = w > h + 40;
      const wasLand = fittedW.current > fittedH.current + 40;
      if (h > 40 && (fittedH.current === 0 || (fittedW.current > 0 && nowLand !== wasLand))) {
        const palm = sim.mapId === "palm";
        setViewPitch(palm ? 1 : 0.68);
        if (palm && fittedH.current === 0) {
          const home = sim.starts.slots[viewerRef.current] ?? sim.starts.player;
          camRef.current.x = home.x;
          camRef.current.y = home.y;
        }
        const view = viewRef.current;
        if (fittedH.current === 0 && !fittedRef.current) {
          camRef.current.zoom = tacticalHome(view);
        } else if (fittedH.current === 0) {
          camRef.current.zoom = zoomAtBias(view, zoomBias(camRef.current.zoom, { w: 915, h: 412 }));
        } else {
          const bias = zoomBias(camRef.current.zoom, { w: fittedW.current, h: fittedH.current });
          camRef.current.zoom = zoomAtBias(view, bias);
        }
        camRef.current.aim = camRef.current.zoom;
        clampCamera(camRef.current, sim.gw, sim.gh, view, wideField(sim.mapSize));
        camRef.current.aim = camRef.current.zoom;
        fittedRef.current = true;
        fittedH.current = h;
        fittedW.current = w;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setViewPitch(sim.mapId === "palm" ? 1 : 0.68);
      stepZoom(camRef.current, dt, viewRef.current, sim.gw, sim.gh, wideField(sim.mapSize));
      stepInertia(camRef.current, dt, sim.gw, sim.gh, viewRef.current, wideField(sim.mapSize));
      if (!pausedRef.current && phaseRef.current === "play" && sim.outcome === "playing") {
        const net = netRef.current;
        if (net) {
          net.pump(dt);
          if (net.waiting !== stallShown.current) {
            stallShown.current = net.waiting;
            setStall(net.waiting);
          }
          if (net.awayNote !== awayShown.current) {
            awayShown.current = net.awayNote;
            setAway(net.awayNote);
          }
          const line = net.vitals
            .filter((s) => s.fill === "human")
            .map((s) => {
              const who = s.seat === net.seat ? `${s.name} (you)` : s.name;
              const ping = s.rtt == null ? "—" : `${Math.round(s.rtt)} ms`;
              return `${who} ${ping} ${seatStatusLabel(s.status)}`;
            })
            .join(" · ");
          if (line !== pingShown.current) {
            pingShown.current = line;
            setPingLine(line);
          }
          if (net.delay !== delayTicks) setDelayTicks(net.delay);
          if (net.desynced !== desync) setDesync(net.desynced);
          if (net.reconnecting) {
            const note = "Reconnecting… seat held for 60 seconds.";
            if (rejoinNote !== note) setRejoinNote(note);
          } else if (rejoinNote) setRejoinNote("");
          if (sim.time - lastSave.current > 15) lastSave.current = sim.time;
        } else {
          acc += dt * speedRef.current;
          let steps = 0;
          const cap = Math.min(40, Math.ceil(speedRef.current) + 4);
          while (acc >= 0.1 && steps < cap) {
            sim.tick(0.1);
            acc -= 0.1;
            steps++;
          }
          if (steps >= cap) acc = Math.min(acc, 0.1);
          if (sim.time - lastSave.current > 15) {
            lastSave.current = sim.time;
            writeSave(sim, camRef.current);
          }
        }
      }
      shakeRef.current = Math.max(0, shakeRef.current * 0.86) + sim.impulse;
      sim.impulse = 0;
      const fingerX = draftRef.current.hovering ? draftRef.current.hoverX : viewRef.current.w / 2;
      const fingerY = draftRef.current.hovering ? draftRef.current.hoverY : viewRef.current.h / 2;
      const hover = placingRef.current
        ? aimedCell(sim, camRef.current, viewRef.current, placingRef.current, fingerX, fingerY, false)
        : null;
      const ghost =
        placingRef.current && draftRef.current.lift
          ? aimedCell(sim, camRef.current, viewRef.current, placingRef.current, fingerX, fingerY, true)
          : hover;
      let wallRun: { tx: number; ty: number; ok: boolean; reason?: string }[] | null = null;
      if (placingRef.current && isFence(placingRef.current)) {
        const dragged = draftRef.current.wallPts;
        const kind = placingRef.current;
        const me = viewerRef.current as 0;
        const liftWall = dragged.length > 1;
        let tiles = dragged.length
          ? traceTiles(dragged.map((p) => liftedWorld(camRef.current, viewRef.current, p.x, p.y, liftWall)))
          : hover
            ? [hover]
            : [];
        if (kind === "gate" && tiles.length) {
          const stuck: { tx: number; ty: number }[] = [];
          for (const t of tiles) {
            const snap = sim.snapFootprint(me, "gate", t.tx, t.ty, 3);
            const last = stuck[stuck.length - 1];
            if (last && last.tx === snap.tx && last.ty === snap.ty) continue;
            stuck.push(snap);
          }
          tiles = stuck;
        }
        wallRun = tiles.length ? sim.previewFence(me, kind, tiles) : null;
      }
      const alpha = pausedRef.current ? 1 : Math.max(0, Math.min(1, acc / 0.1));
      const sheetKey = `b31:${sim.mapId}:${sim.gw}x${sim.gh}:${sim.theater}:${sim.groundRev}`;
      const had = sheetRef.current?.key === sheetKey;
      let pack = sheetRef.current;
      const big = Math.max(sim.gw, sim.gh);
      if (!had) {
        const full = bakeTerrain(
          sim.terrain,
          sim.gw,
          sim.gh,
          sim.theater,
          sheetLong(sim.gw, sim.gh, big > 96 ? 2560 : 3840, 16_000_000),
        );
        pack = full ? { small: full, mid: null, full, key: sheetKey } : null;
        sheetRef.current = pack;
      }
      const image = pack?.full ?? pack?.small ?? null;
      const sheet = image ? { image, tw: image.width, th: image.height } : null;
      drawGame(
        ctx,
        sim,
        camRef.current,
        viewRef.current,
        {
          selected: selRef.current,
          buildingId: selBRef.current,
          placing: placingRef.current,
          hover,
          ghost,
          wallRun,
          box: draftRef.current.box,
          shake: shakeRef.current,
          viewer: viewerRef.current,
          placeGrid: true,
          touchPlace: touchPlaceRef.current,
        },
        alpha,
        null,
        null,
        sheet,
        image,
      );
      if (now - lastHud > 200) {
        lastHud = now;
        const live = selRef.current.filter((id) => sim.unitById(id));
        if (live.length !== selRef.current.length) setSel(live);
        if (selBRef.current && !sim.buildingById(selBRef.current)) setSelB(null);
        if (sim.outcome !== "playing" && phaseRef.current === "play") {
          writeSave(sim, camRef.current);
          window.setTimeout(() => {
            if (phaseRef.current === "play") setPhase("over");
          }, 2000);
        }
        setFrame((n) => (n + 1) % 100000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    return attachInput(canvas, {
      camera: camRef.current,
      draft: draftRef.current,
      getView: () => viewRef.current,
      grid: () => ({ w: simRef.current?.gw ?? 64, h: simRef.current?.gh ?? 64 }),
      warzone: () => wideField(simRef.current?.mapSize ?? "skirmish"),
      selectMode: () => selectRef.current,
      suppressBox: () => armRef.current,
      onZoom: () => {},
      classify: (sx, sy) => {
        const sim = simRef.current;
        if (!sim || placingRef.current || rallyRef.current) return "immediate";
        if (minimapHit(sx, sy, viewRef.current, sim.gw, sim.gh, wideField(sim.mapSize))) return "immediate";
        const world = screenToWorld(camRef.current, sx, sy, viewRef.current);
        if (sim.pickAt(world.x, world.y, camRef.current.zoom, viewerRef.current as 0)) return "immediate";
        if (armRef.current || selectRef.current) return "immediate";
        return selRef.current.length ? "delay" : "immediate";
      },
      onMinimap: (wx, wy) => {
        camRef.current.x = wx;
        camRef.current.y = wy;
        camRef.current.vx = 0;
        camRef.current.vy = 0;
        clampCamera(camRef.current, simRef.current?.gw ?? 64, simRef.current?.gh ?? 64, viewRef.current, wideField(simRef.current?.mapSize ?? "skirmish"));
      },
      onMinimapTap: (wx, wy) => {
        const sim = simRef.current;
        if (!sim || !armRef.current || pausedRef.current) return;
        const ids = selRef.current.filter((id) => {
          const u = sim.unitById(id);
          return !!u && u.hp > 0 && u.team === viewerRef.current && u.damage > 0;
        });
        if (!ids.length) return;
        const x = quant(wx);
        const y = quant(wy);
        setArming(false);
        actRef.current("attackMove", { ids, x, y }, () => sim.issueMove(ids, x, y, true));
        setFrame((n) => n + 1);
      },
      onJumpBase: () => {
        const sim = simRef.current;
        if (!sim) return;
        const home = sim.starts.slots[viewerRef.current] ?? sim.starts.player;
        camRef.current.x = home.x;
        camRef.current.y = home.y;
        camRef.current.vx = 0;
        camRef.current.vy = 0;
        clampCamera(camRef.current, sim.gw, sim.gh, viewRef.current, wideField(sim.mapSize));
      },
      placing: () => !!placingRef.current,
      placingWall: () => !!placingRef.current && isFence(placingRef.current),
      onPointerKind: (touch) => {
        touchPlaceRef.current = touch;
      },
      placeUi: (sx, sy) => {
        const sim = simRef.current;
        const kind = placingRef.current;
        if (!sim || !kind || isFence(kind) || !touchPlaceRef.current || !draftRef.current.hovering) return null;
        const show = aimedCell(
          sim,
          camRef.current,
          viewRef.current,
          kind,
          draftRef.current.hoverX,
          draftRef.current.hoverY,
          draftRef.current.lift,
        );
        const box = placeChrome(camRef.current, viewRef.current, show.tx, show.ty, BUILDINGS[kind].w);
        const hit = (r: { x: number; y: number; w: number; h: number }) => sx >= r.x && sy >= r.y && sx <= r.x + r.w && sy <= r.y + r.h;
        if (hit(box.confirm)) return "confirm";
        if (hit(box.cancel)) return "cancel";
        return null;
      },
      onPlaceUi: (action) => {
        const sim = simRef.current;
        const kind = placingRef.current;
        if (action === "cancel" || !sim || !kind) {
          setPlacing(null);
          return;
        }
        const origin = aimedCell(
          sim,
          camRef.current,
          viewRef.current,
          kind,
          draftRef.current.hoverX,
          draftRef.current.hoverY,
        );
        const me = viewerRef.current as 0;
        actRef.current("build", { kind, tx: origin.tx, ty: origin.ty }, () => {
          const res = sim.tryPlace(me, kind, origin.tx, origin.ty);
          if (res.ok) setPlacing(null);
        });
        if (netRef.current) setPlacing(null);
        setFrame((n) => n + 1);
      },
      onWall: (screenPts) => {
        const sim = simRef.current;
        const kind = placingRef.current;
        if (!sim || !kind || pausedRef.current) return;
        unlockAudio();
        const me = viewerRef.current as 0;
        let tiles = traceTiles(screenPts.map((p) => liftedWorld(camRef.current, viewRef.current, p.x, p.y, false)));
        if (kind === "gate") {
          const stuck: { tx: number; ty: number }[] = [];
          for (const t of tiles) {
            const snap = sim.snapFootprint(me, "gate", t.tx, t.ty, 3);
            const last = stuck[stuck.length - 1];
            if (last && last.tx === snap.tx && last.ty === snap.ty) continue;
            stuck.push(snap);
          }
          tiles = stuck;
        }
        actRef.current("placeWall", { kind, tiles }, () => {
          const n = sim.placeFence(me, kind, tiles);
          if (n > 0) setPlacing(null);
        });
        setFrame((f) => f + 1);
      },
      onBox: (box) => {
        const sim = simRef.current;
        setSelecting(false);
        selectRef.current = false;
        if (!sim || pausedRef.current || placingRef.current || armRef.current) return;
        const a = screenToWorld(camRef.current, box.x0, box.y0, viewRef.current);
        const b = screenToWorld(camRef.current, box.x1, box.y1, viewRef.current);
        const ids = sim.unitsInRect(a.x, a.y, b.x, b.y, viewerRef.current as 0);
        setSel(ids);
        setSelB(null);
        setPlacing(null);
        if (ids.length) {
          sfx("select");
          const u = sim.unitById(ids[0]);
          if (u) bark(barkClass(u.kind), "select");
        }
      },
      onTap: (sx, sy, isDouble, shift) => {
        const sim = simRef.current;
        setSelecting(false);
        selectRef.current = false;
        if (!sim || pausedRef.current || phaseRef.current !== "play") return;
        unlockAudio();
        const world = screenToWorld(camRef.current, sx, sy, viewRef.current);
        const me = viewerRef.current as 0;
        if (chatRef.current) {
          const mark = chatRef.current;
          setChat(null);
          actRef.current("chat", { x: quant(world.x), y: quant(world.y), mark }, () => {
            sim.addMark(me, world.x, world.y, mark);
          });
          setFrame((n) => n + 1);
          return;
        }
        if (placingRef.current) {
          const kind = placingRef.current;
          if (isFence(kind)) return;
          const origin = aimedCell(sim, camRef.current, viewRef.current, kind, sx, sy);
          const keep = shift;
          actRef.current("build", { kind, tx: origin.tx, ty: origin.ty }, () => {
            const res = sim.tryPlace(me, kind, origin.tx, origin.ty);
            if (res.ok && !keep) setPlacing(null);
          });
          if (netRef.current && !keep) setPlacing(null);
          setFrame((n) => n + 1);
          return;
        }
        if (rallyRef.current && selBRef.current) {
          const id = selBRef.current;
          actRef.current("rally", { id, x: quant(world.x), y: quant(world.y) }, () => {
            sim.setRally(id, world.x, world.y, me);
          });
          setRally(false);
          sfx("move");
          setFrame((n) => n + 1);
          return;
        }
        const strike = pickStrike(sim, camRef.current, viewRef.current, sx, sy, touchPlaceRef.current, me);
        if (selRef.current.length && strike && strike.hp > 0 && strike.rubble <= 0 && (strike.neutral || !sim.allied(me, strike.team))) {
          const ids = selRef.current.slice();
          const id = sim.strikeTarget(me, strike.id, world.x, world.y);
          armRef.current = false;
          strikeRef.current = false;
          selectRef.current = false;
          setArming(false);
          setSelecting(false);
          actRef.current("attack", { ids, id }, () => sim.issueAttack(ids, id));
          setFrame((n) => n + 1);
          return;
        }
        const hit = sim.pickAt(world.x, world.y, camRef.current.zoom, me);
        if (hit?.kind === "unit") {
          const unit = sim.unitById(hit.id);
          if (unit && !sim.allied(me, unit.team) && selRef.current.length) {
            const ids = selRef.current.slice();
            setArming(false);
            setSelecting(false);
            actRef.current("attack", { ids, id: hit.id }, () => sim.issueAttack(ids, hit.id));
            setFrame((n) => n + 1);
            return;
          }
          if (unit && unit.team === me) {
            const now = performance.now();
            if (samePick.current.kind === unit.kind && now - samePick.current.t < 320) {
              const cam = camRef.current;
              const view = viewRef.current;
              const ids = sim.units
                .filter((u) => {
                  if (u.team !== me || u.hp <= 0 || u.kind !== unit.kind || u.aboard) return false;
                  const at = worldToScreen(cam, u.x, u.y, view);
                  return at.x >= 0 && at.y >= 0 && at.x <= view.w && at.y <= view.h;
                })
                .map((u) => u.id);
              setSel(ids.length ? ids : [unit.id]);
              samePick.current = { kind: "", t: 0 };
            } else {
              samePick.current = { kind: unit.kind, t: now };
              setSel([unit.id]);
            }
            setSelB(null);
            setPlacing(null);
            setRally(false);
            setArming(false);
            sfx("select");
            bark(barkClass(unit.kind), "select");
            return;
          }
        }
        if (hit?.kind === "building") {
          const b = sim.buildingById(hit.id);
          const eng = selRef.current.map((id) => sim.unitById(id)).find((u) => u && u.kind === "engineer" && u.hp > 0);
          if (b && eng && (b.neutral || !sim.allied(me, b.team)) && b.hp > 0 && b.rubble <= 0) {
            const ids = [eng.id];
            setArming(false);
            setSelecting(false);
            actRef.current("attack", { ids, id: b.id }, () => sim.issueAttack(ids, b.id));
            setFrame((n) => n + 1);
            return;
          }
          if (b && !sim.allied(me, b.team) && !b.neutral && selRef.current.length) {
            const ids = selRef.current.slice();
            const id = sim.strikeTarget(me, b.id, world.x, world.y);
            setArming(false);
            setSelecting(false);
            actRef.current("attack", { ids, id }, () => sim.issueAttack(ids, id));
            setFrame((n) => n + 1);
            return;
          }
          if (b && b.team === me) {
            if (b.kind === "gate" && selBRef.current === b.id && b.complete && b.rubble <= 0) {
              actRef.current("gate", { id: b.id }, () => sim.toggleGate(b.id, me));
              sfx("select");
              setFrame((n) => n + 1);
              return;
            }
            setSel([]);
            setSelB(b.id);
            setPlacing(null);
            setRally(false);
            sfx("select");
            return;
          }
        }
        if (selRef.current.length) {
          if (armRef.current && strikeRef.current) return;
          const ids = selRef.current.slice();
          const x = quant(world.x);
          const y = quant(world.y);
          const attackMove = isDouble || armRef.current;
          armRef.current = false;
          strikeRef.current = false;
          selectRef.current = false;
          setArming(false);
          setStrike(false);
          setSelecting(false);
          actRef.current(attackMove ? "attackMove" : "move", { ids, x, y }, () => sim.issueMove(ids, world.x, world.y, attackMove));
          setFrame((n) => n + 1);
          return;
        }
        armRef.current = false;
        strikeRef.current = false;
        selectRef.current = false;
        setArming(false);
        setStrike(false);
        setSelecting(false);
        setSel([]);
        setSelB(null);
      },
    });
  }, [phase]);

  useEffect(() => {
    window.__viridite = {
      get sim() {
        return simRef.current;
      },
      get camera() {
        return camRef.current;
      },
    };
  }, []);

  const sim = simRef.current;
  const ghostReason = (() => {
    if (!sim || !placing) return "";
    const origin = aimedCell(
      sim,
      camRef.current,
      viewRef.current,
      placing,
      draftRef.current.hovering ? draftRef.current.hoverX : viewRef.current.w / 2,
      draftRef.current.hovering ? draftRef.current.hoverY : viewRef.current.h / 2,
    );
    if (isFence(placing)) {
      const step = sim.previewFence(viewer as 0, placing, [origin])[0];
      if (!step) return "Drag a line";
      return step.ok ? "Drag a line" : ghostPlaceReason(step.reason);
    }
    const check = sim.canPlace(viewer as 0, placing, origin.tx, origin.ty);
    if (!check.ok) return ghostPlaceReason(check.reason);
    const def = resolveBuilding(placing, sim.factionOf(viewer as 0));
    const power = def.powerUse > 0 ? `Power −${def.powerUse}` : def.powerOut > 0 ? `Power +${def.powerOut}` : "No power draw";
    return `${def.cost} credits · ${power}`;
  })();

  const placeKind = (kind: BuildingId) => {
    unlockAudio();
    setPlacing(kind);
    setSel([]);
    setSelB(null);
    setRally(false);
    setArming(false);
    setBuildOpen(false);
    sfx("select");
  };
  const trainAt = (kind: BuildingId, unit: UnitId) => {
    const building = producerBuilding(kind);
    if (!building || !sim) return;
    setSel([]);
    setSelB(building.id);
    unlockAudio();
    act("train", { id: building.id, unit }, () => {
      sim.queueUnit(building.id, unit);
    });
    setFrame((n) => n + 1);
  };
  const cancelOne = (kind: BuildingId, unit: UnitId) => {
    const building = producerBuilding(kind);
    if (!building || !sim) return;
    const id = building.id;
    act("cancel", { id, unit }, () => sim.cancelQueued(id, viewer as 0, unit));
    setFrame((n) => n + 1);
  };
  const sellSelected = () => {
    if (!sim || selB == null) return;
    const id = selB;
    act("sell", { id }, () => sim.sellBuilding(id, viewer as 0));
    setSelB(null);
    setFrame((n) => n + 1);
  };
  const producerBuilding = (kind: BuildingId) => {
    if (!sim) return undefined;
    const selected = selB ? sim.buildingById(selB) : undefined;
    if (selected && selected.team === viewer && selected.kind === kind && selected.complete && selected.hp > 0 && selected.rubble <= 0) {
      return selected;
    }
    return sim.buildings.find((b) => b.team === viewer && b.kind === kind && b.complete && b.hp > 0 && b.rubble <= 0);
  };
  const orderStop = () => {
    const ids = sel.slice();
    act("stop", { ids }, () => sim?.issueStop(ids));
    selectRef.current = false;
    armRef.current = false;
    strikeRef.current = false;
    setSelecting(false);
    setArming(false);
    setStrike(false);
    sfx("select");
  };
  const orderAttack = () => {
    if (!sim) return;
    const ids = selRef.current.filter((id) => {
      const u = sim.unitById(id);
      return !!u && u.hp > 0 && u.damage > 0 && !u.aboard;
    });
    const engineers = selRef.current.some((id) => {
      const u = sim.unitById(id);
      return !!u && u.hp > 0 && u.kind === "engineer";
    });
    if (!ids.length && !engineers) return;
    const next = !(armRef.current && strikeRef.current);
    strikeRef.current = next;
    armRef.current = next;
    selectRef.current = false;
    setStrike(next);
    setSelecting(false);
    setArming(next);
    sfx("select");
    setFrame((n) => n + 1);
  };
  const orderAttackMove = () => {
    const next = !(armRef.current && !strikeRef.current);
    strikeRef.current = false;
    armRef.current = next;
    selectRef.current = false;
    setStrike(false);
    setSelecting(false);
    setArming(next);
  };
  const orderGuard = () => {
    const ids = sel.slice();
    act("guard", { ids }, () => sim?.issueGuard(ids));
    selectRef.current = false;
    armRef.current = false;
    strikeRef.current = false;
    setSelecting(false);
    setArming(false);
    setStrike(false);
  };
  const orderScatter = () => {
    const ids = sel.slice();
    act("scatter", { ids }, () => sim?.issueScatter(ids));
    setSelecting(false);
    selectRef.current = false;
    setArming(false);
  };
  const orderHarvest = () => {
    const ids = sel.slice();
    act("harvest", { ids }, () => sim?.issueHarvest(ids));
  };
  const orderReturn = () => {
    const ids = sel.slice();
    act("return", { ids }, () => sim?.issueReturn(ids));
  };
  const orderDeploy = () => {
    if (!sim) return;
    const ids = sim.units.filter((u) => u.team === viewer && u.kind === "mcv").map((u) => u.id);
    const use = ids.length ? ids : sel.slice();
    act("deploy", { ids: use }, () => sim.issueDeploy(use));
    setFrame((n) => n + 1);
  };
  const orderRepair = () => {
    if (!sim || selB == null) return;
    const id = selB;
    act("repair", { id }, () => sim.issueRepair(id, viewer as 0));
    sfx("select");
    setFrame((n) => n + 1);
  };
  const saveGroup = (i: number) => {
    const live = simRef.current;
    if (!live) return;
    const ids = selRef.current.filter((id) => {
      const u = live.unitById(id);
      return !!u && u.hp > 0 && u.team === viewerRef.current;
    });
    if (!ids.length) return;
    groupsRef.current[i] = ids.slice();
    setSquadOn((prev) => {
      const next: [boolean, boolean, boolean, boolean] = [...prev];
      next[i] = true;
      return next;
    });
    sfx("select");
  };
  const recallGroup = (i: number) => {
    const live = simRef.current;
    if (!live) return;
    const ids = (groupsRef.current[i] ?? []).filter((id) => {
      const u = live.unitById(id);
      return !!u && u.hp > 0 && u.team === viewerRef.current;
    });
    groupsRef.current[i] = ids;
    setSquadOn((prev) => {
      const next: [boolean, boolean, boolean, boolean] = [...prev];
      next[i] = ids.length > 0;
      return next;
    });
    if (!ids.length) return;
    setSel(ids);
    setSelB(null);
    setPlacing(null);
    selectRef.current = false;
    armRef.current = false;
    strikeRef.current = false;
    setSelecting(false);
    setArming(false);
    setStrike(false);
    const units = ids.map((id) => live.unitById(id)!);
    const x = units.reduce((sum, u) => sum + u.x, 0) / units.length;
    const y = units.reduce((sum, u) => sum + u.y, 0) / units.length;
    const cam = camRef.current;
    const view = viewRef.current;
    const halfW = view.w / (2 * Math.max(0.01, cam.zoom));
    const halfH = view.h / (2 * Math.max(0.01, cam.zoom * viewPitch()));
    if (Math.abs(x - cam.x) > halfW * 0.75 || Math.abs(y - cam.y) > halfH * 0.75) {
      cam.x = x;
      cam.y = y;
      cam.vx = 0;
      cam.vy = 0;
      clampCamera(cam, live.gw, live.gh, view);
    }
    sfx("select");
    setFrame((n) => n + 1);
  };
  saveGroupRef.current = saveGroup;
  recallGroupRef.current = recallGroup;

  const selectArmy = () => {
    const live = simRef.current;
    if (!live) return;
    const me = viewerRef.current;
    const ids = live.units
      .filter((u) => u.team === me && u.hp > 0 && !u.aboard && u.kind !== "harvester" && u.kind !== "mcv")
      .map((u) => u.id);
    setSel(ids);
    setSelB(null);
    setPlacing(null);
    selectRef.current = false;
    armRef.current = false;
    strikeRef.current = false;
    setSelecting(false);
    setArming(false);
    setStrike(false);
    if (ids.length) {
      sfx("select");
      const u = live.unitById(ids[0]!);
      if (u) bark(barkClass(u.kind), "select");
    }
    setFrame((n) => n + 1);
  };
  const openBuild = () => {
    const id = selBRef.current;
    const live = simRef.current;
    const b = id != null && live ? live.buildingById(id) : undefined;
    if (b && b.team === viewerRef.current && isTrainHall(b.kind) && selRef.current.length === 0 && !placingRef.current) {
      setBuildOpen(false);
      const kind = b.kind;
      requestAnimationFrame(() => {
        document.querySelector(`[data-roster-group="${kind}"]`)?.scrollIntoView({ inline: "start", block: "nearest", behavior: "auto" });
      });
      return;
    }
    setBuildOpen((v) => !v);
    setProdTab("build");
  };

  const land = short && !portrait;
  const trainHallOnly = (() => {
    if (!sim || placing || buildOpen || sel.length > 0 || selB == null) return false;
    const b = sim.buildingById(selB);
    return !!b && b.team === viewer && isTrainHall(b.kind);
  })();

  return (
    <div
      className="fixed inset-x-0 z-0 flex flex-col bg-field text-ink"
      data-testid="game-root"
      style={{
        top: hostBar,
        height: `calc(var(--app-h, 100dvh) - ${hostBar}px)`,
      }}
    >
      {soundGate && !muted && (
        <button
          type="button"
          data-testid="tap-for-sound"
          className="fixed top-2 right-2 z-50 h-10 px-3 steel font-display text-xs uppercase tracking-wide text-gold"
          onClick={() => unlockAudio()}
        >
          Tap for sound
        </button>
      )}
      {phase === "editor" ? (
        <MapEditor
          remixId={remixId}
          onClose={() => {
            setRemixId("");
            setPhase("menu");
          }}
          skirmish={{ mapId: setup.mapId, size: setup.size, customId: setup.customId }}
          onSaved={(id) => {
            const doc = loadMap(id);
            if (doc) patchSetup({ customId: id, size: lobbySize(doc), mapId: offersNavy(doc) ? "coast" : "dry" });
            setRemixId("");
            setPhase("menu");
          }}
        />
      ) : phase === "menu" && ready ? (
        <ReadyUp
          setup={setup}
          onChange={patchSetup}
          onBack={() => setReady(false)}
          onStart={startFresh}
          onPractice={() => {
            const sim = new Sim(toNewGame(setup));
            sim.startPractice();
            boot(sim);
          }}
          onRandomize={rollSetup}
          onFriends={() => setPhase("net")}
        />
      ) : phase === "menu" ? (
        <div className="flex h-full min-h-0 flex-col bg-field">
          <SheetHead tab={menuTab} onTab={setMenuTab} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {menuTab === "game" ? (
              <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3 pb-6">
                <SheetBody tab="game" />
                <button
                  type="button"
                  data-testid="open-ready"
                  className="h-14 bg-crystal font-display text-base uppercase tracking-widest text-crystal-ink"
                  onClick={() => setReady(true)}
                >
                  Skirmish
                </button>
              </div>
            ) : (
              <SheetBody tab={menuTab} />
            )}
          </div>
        </div>
      ) : phase === "net" ? (
        <NetLobby
          invite={invite}
          setup={setup}
          onBack={() => {
            setInvite("");
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.has("room") || url.searchParams.has("relay")) {
                url.searchParams.delete("room");
                url.searchParams.delete("relay");
                const search = url.searchParams.toString();
                window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
              }
            } catch {
              /* ignore */
            }
            setPhase("menu");
          }}
          onMatch={beginNet}
          showAi={setup.showAi}
          onShowAi={(on) => patchSetup({ showAi: on })}
        />
      ) : (
        sim && (
          <div className="flex min-h-0 flex-1 flex-col" style={{ WebkitTouchCallout: "none", userSelect: "none" }} onContextMenu={(e) => e.preventDefault()} data-testid="battle-shell">
            <header
              className={`flex items-center gap-1 bg-field/90 px-1 ${
                portrait
                  ? "h-11 shrink-0"
                  : short
                    ? "z-30 h-8 shrink-0 overflow-x-auto"
                    : "absolute top-0 left-0 z-30 h-8 overflow-x-auto"
              }`}
              style={portrait || short ? undefined : { right: "7.5rem" }}
              data-testid="resource-bar"
            >
              <ResourcePill
                label="Credits"
                value={String(Math.floor(sim.credits[viewer] ?? 0))}
                tone="text-gold"
                compact={!portrait}
              >
                <Box className="size-3.5 text-gold" />
              </ResourcePill>
              <PowerPill sim={sim} team={viewer} compact={!portrait} />
              {short && !portrait && (
                <ResourcePill
                  label="Command points"
                  value={`${Math.floor(sim.commandLoad(viewer as 0, false))}/${sim.commandCap(viewer as 0)}`}
                  tone="text-ink"
                  compact
                >
                  <span className="font-display text-xs text-brass">CP</span>
                </ResourcePill>
              )}
              <ResourcePill
                label="Time"
                value={sim.mode === "survive" ? clock(SURVIVE_SECONDS - sim.time) : clock(sim.time)}
                tone="text-crystal"
                compact={!portrait}
              >
                <Timer className="size-3.5 text-crystal" />
              </ResourcePill>
              <span
                data-testid="pace-label"
                className="shrink-0 font-display text-[13px] leading-none tracking-wide text-brass"
              >
                {climbLabel(sim)}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {online ? null : <SpeedControl speed={speed} onChange={setSpeed} compact />}
                <IconButton
                  label={muted ? "Unmute" : "Mute"}
                  compact
                  onClick={() => {
                    const next = !isMuted();
                    setMuted(next);
                    setMutedUi(next);
                    if (!next) sfx("select");
                  }}
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </IconButton>
                <IconButton
                  label="Pause"
                  testId="pause"
                  compact
                  onClick={() => {
                    if (netRef.current) netRef.current.command("pause", { on: true });
                    else setPaused(true);
                  }}
                >
                  <Pause className="size-4" />
                </IconButton>
              </div>
            </header>
            {online && (
              <div
                className="flex items-center justify-between gap-2 border-b border-brass-dim bg-field px-2 py-1"
                data-testid="seat-pings"
              >
                <p className="min-w-0 flex-1 truncate font-display text-xs uppercase tracking-wide text-gold">
                  {pingLine || "Seats"}
                </p>
                <p className="shrink-0 font-display text-xs uppercase text-brass" data-testid="match-delay">
                  Delay {delayTicks}
                </p>
              </div>
            )}
            <div className="flex min-h-0 flex-1">
            <div className="relative min-h-0 min-w-0 flex-1">
              <canvas ref={canvasRef} className="h-full w-full touch-none" data-testid="battlefield" />
              {sim.powerOf(viewer as 0).low && (
                <div
                  data-testid="low-power"
                  className="pulse pointer-events-none absolute top-1 left-1 z-20 flex h-11 max-w-[58%] items-center bg-danger px-2 font-display text-xs uppercase tracking-wide text-ink"
                >
                  Low power — supply stopped
                </div>
              )}
              {land && buildOpen && phase === "play" && (
                <BuildColumn
                  sim={sim}
                  team={viewer}
                  placing={placing}
                  onPlace={placeKind}
                  onCancel={() => setPlacing(null)}
                  onClose={() => setBuildOpen(false)}
                />
              )}
              {prep.on && phase === "play" && (
                <div
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-field/94 px-6 text-center"
                  data-testid="field-prep"
                >
                  <p className="font-display text-sm uppercase tracking-widest text-gold">Preparing the field</p>
                  <p className="text-sm text-ink">{prep.map ? "Map ready" : "Loading the map"}</p>
                  <p className="text-sm text-ink">{prep.figs ? "Troops and buildings ready" : "Loading troops and buildings"}</p>
                </div>
              )}
              {phase === "play" && selB != null && (
                <PlantPlate sim={sim} id={selB} team={viewer} cam={camRef.current} view={viewRef.current} />
              )}
              {phase === "play" && !paused && (
                <FieldPad
                  buildOn={buildOpen || !!placing}
                  moveOn={sel.length > 0 && !selecting}
                  selecting={selecting}
                  armed={arming}
                  strike={strike && arming}
                  raised={!portrait}
                  dock={land ? "bottom-2" : undefined}
                  onArmy={selectArmy}
                  onBuild={openBuild}
                  onMove={() => {
                    selectRef.current = false;
                    armRef.current = false;
                    strikeRef.current = false;
                    setSelecting(false);
                    setArming(false);
                    setStrike(false);
                  }}
                  onAttackMove={orderAttackMove}
                  onSelect={() => {
                    const next = !selectRef.current;
                    selectRef.current = next;
                    if (next) {
                      armRef.current = false;
                      strikeRef.current = false;
                      setArming(false);
                      setStrike(false);
                    }
                    setSelecting(next);
                  }}
                />
              )}
              {phase === "play" && sim.time < DEPLOY_SECS && (
                <p
                  data-testid="deploy-countdown"
                  className={`pointer-events-none absolute left-2 z-20 border border-brass-dim bg-field/92 px-3 py-1 font-display text-sm tracking-wide text-gold ${land ? "top-1 max-w-[58%]" : "top-2"}`}
                >
                  Deployment {clock(DEPLOY_SECS - sim.time)} — hold fire
                </p>
              )}
              {sim.alarm[viewer] && sim.time < sim.alarm[viewer]!.until && phase === "play" && (
                <button
                  type="button"
                  data-testid="base-alarm"
                  className={`pulse absolute left-2 z-20 flex h-11 max-w-[58%] items-center steel px-3 font-display text-xs uppercase tracking-wide text-danger ${
                    land ? (sim.time < DEPLOY_SECS || sim.powerOf(viewer as 0).low ? "top-12" : "top-1") : "top-2"
                  }`}
                  onClick={() => {
                    const at = sim.alarm[viewer];
                    if (!at) return;
                    camRef.current.x = at.x;
                    camRef.current.y = at.y;
                    camRef.current.vx = 0;
                    camRef.current.vy = 0;
                    clampCamera(camRef.current, sim.gw, sim.gh, viewRef.current, wideField(sim.mapSize));
                    setFrame((n) => n + 1);
                  }}
                >
                  Our base is under attack
                </button>
              )}
              {setup.showAi && viewer === 0 && phase === "play" && sim && (
                <p
                  data-testid="ai-intent"
                  className="pointer-events-none absolute top-2 left-2 z-10 steel-inset px-2 py-1 font-display text-xs uppercase tracking-wide text-gold"
                >
                  {Array.from({ length: sim.opponents }, (_, i) => i + 1)
                    .filter((t) => sim.cpu[t])
                    .map((t) => `${SEAT_NAME[t] ?? "AI"} ${sim.aiIntent[t] ?? "idle"}`)
                    .join(" · ") || "AI idle"}
                </p>
              )}
              {stall && phase === "play" && (
                <p className="pointer-events-none absolute top-2 right-2 steel-inset px-2 py-1 text-xs text-gold" data-testid="net-stall">
                  {stall}
                </p>
              )}
              {rejoinNote && phase === "play" && (
                <p className="pointer-events-none absolute top-10 left-2 z-10 steel-inset px-2 py-1 text-xs text-brass" data-testid="net-rejoin-note">
                  {rejoinNote}
                </p>
              )}
              {online && desync && phase === "play" && (
                <Overlay title="Out of sync">
                  <p className="max-w-xs text-center text-sm text-pretty text-muted" data-testid="desync-note">
                    The battle diverged. Rematch starts again in this room with a new seed.
                  </p>
                  <BarButton
                    label="Rematch"
                    testId="desync-rematch"
                    onClick={() => netRef.current?.rematch()}
                  >
                    <RotateCcw className="size-5" /> Rematch
                  </BarButton>
                </Overlay>
              )}
              {away && phase === "play" && !sim.frozen && (
                <p className="pointer-events-none absolute top-10 right-2 z-10 max-w-[70%] steel-inset px-2 py-1 text-xs text-pretty text-brass" data-testid="net-away">
                  {away}. The match keeps going.
                </p>
              )}
              {!portrait && (
                <p className="pointer-events-none absolute bottom-1 left-16 z-10 max-w-[62%] truncate steel-inset px-1.5 py-0.5 text-xs text-gold">
                  {stall || sim.logs[sim.logs.length - 1] || hintFor(sim, viewer as Team)}
                </p>
              )}
              {online && sim.frozen && phase === "play" && (
                <Overlay title="Paused">
                  <p className="max-w-xs text-center text-sm text-pretty text-muted">
                    The room is paused. Switching apps does not pause anyone. Only Pause does.
                  </p>
                  <p data-testid="pause-ai" className="max-w-xs text-center text-sm text-pretty text-gold">
                    {botBrief(sim)}
                  </p>
                  <PauseSound />
                  <BarButton
                    label="Resume"
                    onClick={() => netRef.current?.command("pause", { on: false })}
                  >
                    <Play className="size-5" /> Resume
                  </BarButton>
                </Overlay>
              )}
              {online && sim.eliminated[viewer] && sim.outcome === "playing" && !sim.frozen && (
                <p className="pointer-events-none absolute bottom-2 left-2 steel-inset px-2 py-1 text-xs text-gold">
                  Eliminated. The room plays on.
                </p>
              )}
              {paused && phase === "play" && pauseSheet && (
                <div className="absolute inset-0 z-40 flex flex-col overflow-y-auto bg-field" data-testid="pause-sheet">
                  <SheetHead tab={pauseTab} onTab={setPauseTab} onBack={() => setPauseSheet(false)} />
                  <SheetBody tab={pauseTab} locked />
                  {pauseTab === "game" && (
                    <p className="mx-auto w-full max-w-lg px-3 pb-6 text-sm text-pretty text-muted">
                      {sim.mapName} · {SIZE_LABEL[sim.mapSize]} · {sim.fogOn ? "fog" : "no fog"} ·{" "}
                      {sim.wallsOn ? "walls" : "no walls"} · {sim.startCredits.toLocaleString("en-US")} credits ·{" "}
                      {packById(doctrineOf()).feel}
                    </p>
                  )}
                </div>
              )}
              {paused && phase === "play" && !pauseSheet && (
                <Overlay title="Paused">
                  <PauseSound />
                  <p data-testid="pause-ai" className="max-w-xs text-center text-sm text-pretty text-gold">
                    {botBrief(sim)}
                  </p>
                  <BarButton
                    label="Resume"
                    onClick={() => {
                      unlockAudio();
                      setPaused(false);
                    }}
                  >
                    <Play className="size-5" /> Resume
                  </BarButton>
                  <p data-testid="pause-rules" className="max-w-xs text-center text-sm text-pretty text-gold">
                    {SIZE_LABEL[sim.mapSize]} · {sim.gw}² · {TEAM_LABEL[sim.teamMode]} ·{" "}
                    {sim.sharedVision ? "shared sight" : "own sight"}
                  </p>
                  <p className="max-w-xs text-center text-xs text-pretty text-muted">
                    {sim.mapName} · {FACTION_NAME[sim.playerFaction]} vs {FACTION_NAME[sim.enemyFaction]}
                    {sim.opponents >= 2 ? ` · East ${FACTION_NAME[sim.factionOf(2)]}` : ""}
                    {sim.opponents >= 3 ? ` · South ${FACTION_NAME[sim.factionOf(3)]}` : ""} ·{" "}
                    {sim.startCredits.toLocaleString("en-US")} each · {sim.stanceEach ? "per-seat AI" : `${sim.ai} AI`} ·{" "}
                    {sim.difficulty} · {sim.fogOn ? "fog" : "no fog"} · {sim.cratesOn ? "crates" : "no crates"} ·{" "}
                    {sim.wallsOn ? "walls" : "no walls"} · {START_LABEL[sim.startPos]} · {optsRef.current.speed}×
                  </p>
                  <p className="max-w-xs text-center text-xs text-pretty text-brass">
                    {packById(doctrineOf()).name}. Restart same rules. Doctrine stays locked.
                  </p>
                  <BarButton label="Match settings" testId="pause-settings" onClick={() => setPauseSheet(true)}>
                    Settings
                  </BarButton>
                  <BarButton
                    label="Resume"
                    onClick={() => {
                      unlockAudio();
                      setPaused(false);
                    }}
                  >
                    <Play className="size-5" /> Resume
                  </BarButton>
                  <BarButton label="Restart with these rules" testId="restart-skirmish" onClick={restartSame}>
                    <RotateCcw className="size-5" /> Restart
                  </BarButton>
                  <BarButton
                    label="Save and leave"
                    onClick={() => {
                      if (simRef.current) writeSave(simRef.current, camRef.current);
                      setHasSave(true);
                      setPhase("menu");
                    }}
                  >
                    Menu
                  </BarButton>
                </Overlay>
              )}
              {phase === "over" && (
                <Overlay
                  wide
                  title={(online ? seatResult(sim, viewer) : sim.outcome) === "win" ? "Victory" : "Defeat"}
                >
                  <Scoreboard sim={sim} viewer={viewer} />
                  <p className="max-w-xs text-center text-sm text-pretty text-muted">{sim.reason}</p>
                  <div className="flex w-full shrink-0 gap-2">
                    <BarButton
                      label="Rematch"
                      testId="rematch"
                      block
                      onClick={() => {
                        if (netRef.current) netRef.current.rematch();
                        else {
                          const next = { ...optsRef.current, ...normalBotDefaults() };
                          optsRef.current = next;
                          setSetup(next);
                          restartSame();
                        }
                      }}
                    >
                      <RotateCcw className="size-5" /> Rematch
                    </BarButton>
                    <BarButton
                      label="Menu"
                      block
                      onClick={() => {
                        netRef.current?.leave();
                        netRef.current = null;
                        setOnline(false);
                        setPhase("menu");
                      }}
                    >
                      Menu
                    </BarButton>
                  </div>
                </Overlay>
              )}
            </div>
            {!phone && (
              <ProductionColumn
                sim={sim}
                team={viewer}
                tab={prodTab}
                onTab={setProdTab}
                selB={selB}
                placing={placing}
                rally={rally}
                placeReason={ghostReason}
                onPlace={placeKind}
                onTrain={trainAt}
                onCancelPlace={() => setPlacing(null)}
                onRally={() => setRally((v) => !v)}
                onSell={sellSelected}
                onCancel={() => {
                  if (!selB || !sim) return;
                  const id = selB;
                  act("cancel", { id }, () => sim.cancelTrain(id, viewer as 0));
                  setFrame((n) => n + 1);
                }}
                onDeploy={orderDeploy}
              />
            )}
            </div>
            {phase !== "over" && (
            <footer data-testid="battle-footer" className={`steel ${portrait ? "shrink-0 px-2 pt-1 pb-[max(8px,env(safe-area-inset-bottom))]" : short ? "cmd-dock z-30 shrink-0" : "absolute inset-x-0 bottom-0 z-30 bg-field/94 px-1 py-0.5 pb-[max(2px,env(safe-area-inset-bottom))]"}`}>
              {short && !portrait ? (
                <ShortDock
                  open={buildOpen}
                  onToggle={() => setBuildOpen((v) => !v)}
                  busy={sel.length > 0 || selB != null || !!placing}
                  sim={sim}
                  team={viewer}
                  sel={sel}
                  selB={selB}
                  placing={placing}
                  rally={rally}
                  armed={arming}
                  placeReason={ghostReason}
                  squadOn={squadOn}
                  onSave={saveGroup}
                  onRecall={recallGroup}
                  onPlace={placeKind}
                  onCancelPlace={() => setPlacing(null)}
                  onTrain={trainAt}
                  onCancelOne={cancelOne}
                  onStop={orderStop}
                  onAttack={orderAttack}
                  onGuard={orderGuard}
                  onAttackMove={orderAttackMove}
                  onScatter={orderScatter}
                  onHarvest={orderHarvest}
                  onReturn={orderReturn}
                  onDeploy={orderDeploy}
                  onRally={() => setRally((v) => !v)}
                  onRepair={orderRepair}
                  onClear={() => {
                    setSel([]);
                    setSelB(null);
                    setPlacing(null);
                    setArming(false);
                  }}
                  onOpenBuild={openBuild}
                  onSell={sellSelected}
                  onToggleGate={() => {
                    if (!selB) return;
                    const id = selB;
                    act("gate", { id }, () => sim.toggleGate(id, viewer as 0));
                    setFrame((n) => n + 1);
                  }}
                  onLoad={() => {
                    const ids = sel.slice();
                    act("load", { ids }, () => sim.issueLoad(ids));
                    setFrame((n) => n + 1);
                  }}
                  onUnload={() => {
                    const ids = sel.slice();
                    act("unload", { ids }, () => sim.issueUnload(ids));
                    setFrame((n) => n + 1);
                  }}
                  onCancel={() => {
                    if (!selB) return;
                    const id = selB;
                    act("cancel", { id }, () => sim.cancelTrain(id, viewer as 0));
                    setFrame((n) => n + 1);
                  }}
                />
              ) : (
              <>
              {portrait && (
                <p className="truncate px-1 text-xs text-gold">
                  {stall || sim.logs[sim.logs.length - 1] || hintFor(sim, viewer as Team)}
                </p>
              )}
              {portrait && <QueueStrip sim={sim} team={viewer} />}
              {online && (
                <div className="mt-1 flex gap-2">
                  {(
                    [
                      ["attack", "Attack here"],
                      ["defend", "Defend"],
                      ["way", "On my way"],
                      ["crystal", "Crystal"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      data-testid={`ping-${id}`}
                      onClick={() => setChat(id)}
                      className={`h-11 min-w-[44px] flex-1 font-display text-xs uppercase ${
                        chat === id ? "steel-inset text-gold" : "bevel-btn"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {phone && !trainHallOnly && (buildOpen || !!placing || sel.length > 0 || selB != null) ? (
              <div className="mt-1 flex gap-2 overflow-x-auto" data-testid="portrait-drawer" data-frame={frame}>
                <CommandBar
                  sim={sim}
                  team={viewer}
                  sel={buildOpen ? [] : sel}
                  selB={buildOpen ? null : selB}
                  placing={placing}
                  rally={rally}
                  armed={arming}
                  placeReason={ghostReason}
                  onPlace={placeKind}
                  onCancelPlace={() => setPlacing(null)}
                  onTrain={(id) => {
                    const building = selB ? sim.buildingById(selB) : undefined;
                    if (!building) return;
                    trainAt(building.kind, id);
                  }}
                  onStop={orderStop}
                  onAttack={orderAttack}
                  onGuard={orderGuard}
                  onAttackMove={orderAttackMove}
                  onScatter={orderScatter}
                  onHarvest={orderHarvest}
                  onReturn={orderReturn}
                  onDeploy={orderDeploy}
                  onRally={() => setRally((v) => !v)}
                  onRepair={orderRepair}
                  onClear={() => {
                    setSel([]);
                    setSelB(null);
                    setPlacing(null);
                    setArming(false);
                  }}
                  onOpenBuild={openBuild}
                  onSell={sellSelected}
                  onToggleGate={() => {
                    if (!selB) return;
                    const id = selB;
                    act("gate", { id }, () => sim.toggleGate(id, viewer as 0));
                    setFrame((n) => n + 1);
                  }}
                  onLoad={() => {
                    const ids = sel.slice();
                    act("load", { ids }, () => sim.issueLoad(ids));
                    setFrame((n) => n + 1);
                  }}
                  onUnload={() => {
                    const ids = sel.slice();
                    act("unload", { ids }, () => sim.issueUnload(ids));
                    setFrame((n) => n + 1);
                  }}
                  onCancel={() => {
                    if (!selB) return;
                    const id = selB;
                    act("cancel", { id }, () => sim.cancelTrain(id, viewer as 0));
                    setFrame((n) => n + 1);
                  }}
                />
              </div>
              ) : portrait ? (
                <CommandStrip
                  sim={sim}
                  team={viewer}
                  sel={sel}
                  selB={selB}
                  placing={placing}
                  rally={rally}
                  armed={arming}
                  placeReason={ghostReason}
                  onStop={orderStop}
                  onAttack={orderAttack}
                  onGuard={orderGuard}
                  onAttackMove={orderAttackMove}
                  onScatter={orderScatter}
                  onHarvest={orderHarvest}
                  onReturn={orderReturn}
                  onDeploy={orderDeploy}
                  onRally={() => setRally((v) => !v)}
                  onRepair={orderRepair}
                  onCancelPlace={() => setPlacing(null)}
                  onToggleGate={() => {
                    if (!selB) return;
                    const id = selB;
                    act("gate", { id }, () => sim.toggleGate(id, viewer as 0));
                    setFrame((n) => n + 1);
                  }}
                  onLoad={() => {
                    const ids = sel.slice();
                    act("load", { ids }, () => sim.issueLoad(ids));
                    setFrame((n) => n + 1);
                  }}
                  onUnload={() => {
                    const ids = sel.slice();
                    act("unload", { ids }, () => sim.issueUnload(ids));
                    setFrame((n) => n + 1);
                  }}
                />
              ) : null}
              <div className={portrait ? "mt-1 flex flex-col gap-1" : "flex items-center gap-1 overflow-x-auto"}>
                <SquadKeys tight={!portrait} marks={squadOn} onSave={saveGroup} onRecall={recallGroup} />
                <TroopRoster tight={!portrait} sim={sim} team={viewer} selB={selB} onTrain={trainAt} onCancelOne={cancelOne} />
                {(portrait || phone) && (
                  <SellButton
                    buildingId={selB}
                    disabled={(() => {
                      if (selB == null) return true;
                      const b = sim.buildingById(selB);
                      return !b || b.team !== viewer || b.rubble > 0 || !b.complete || b.kind === "span";
                    })()}
                    onConfirm={sellSelected}
                  />
                )}
              </div>
              </>
              )}
            </footer>
            )}
          </div>
        )
      )}
    </div>
  );
}

function unmetNeed(sim: Sim, team: number, id: BuildingId): string | null {
  const req = resolveBuilding(id, sim.factionOf(team as 0)).requires;
  if (!req) return null;
  const has = sim.buildings.some((b) => b.team === team && b.kind === req && b.complete && b.hp > 0 && b.rubble <= 0);
  return has ? null : `Needs ${BUILDINGS[req].name}`;
}

function isTrainHall(kind: string | undefined): kind is TrainAt {
  return kind === "barracks" || kind === "factory" || kind === "dock" || kind === "helipad";
}

function producerOf(sim: Sim, team: number, kind: BuildingId, selB: number | null): Building | undefined {
  const selected = selB ? sim.buildingById(selB) : undefined;
  if (
    selected &&
    selected.team === team &&
    selected.kind === kind &&
    selected.complete &&
    selected.hp > 0 &&
    selected.rubble <= 0
  ) {
    return selected;
  }
  return sim.buildings.find((b) => b.team === team && b.kind === kind && b.complete && b.hp > 0 && b.rubble <= 0);
}

function ProductionColumn({
  sim,
  team,
  tab,
  onTab,
  selB,
  placing,
  rally,
  placeReason,
  onPlace,
  onTrain,
  onCancelPlace,
  onRally,
  onSell,
  onCancel,
  onDeploy,
}: {
  sim: Sim;
  team: number;
  tab: ProdTab;
  onTab: (tab: ProdTab) => void;
  selB: number | null;
  placing: BuildingId | null;
  rally: boolean;
  placeReason: string;
  onPlace: (kind: BuildingId) => void;
  onTrain: (kind: BuildingId, unit: UnitId) => void;
  onCancelPlace: () => void;
  onRally: () => void;
  onSell: () => void;
  onCancel: () => void;
  onDeploy: () => void;
}) {
  const faction = sim.factionOf(team as 0);
  const power = sim.powerOf(team as 0);
  const cap = Math.max(power.supply, power.use, 1);
  const yard = sim.buildings.some((b) => b.team === team && b.kind === "yard" && b.complete && b.hp > 0);
  const mcv = sim.units.some((u) => u.team === team && u.kind === "mcv" && u.hp > 0);
  const tabs: { id: ProdTab; label: string }[] = [{ id: "build", label: "Build" }];
  if (buildingOffered(sim.mapId, faction, "barracks", sim.wallsOn)) tabs.push({ id: "barracks", label: "Infantry" });
  if (buildingOffered(sim.mapId, faction, "factory", sim.wallsOn)) tabs.push({ id: "factory", label: "Vehicles" });
  if (buildingOffered(sim.mapId, faction, "dock", sim.wallsOn)) tabs.push({ id: "dock", label: "Navy" });
  if (buildingOffered(sim.mapId, faction, "helipad", sim.wallsOn)) tabs.push({ id: "helipad", label: "Air" });
  const active = tabs.some((t) => t.id === tab) ? tab : "build";
  const hall = active === "build" ? undefined : producerOf(sim, team, active, selB);
  const hasDock = sim.buildings.some((b) => b.team === team && b.kind === "dock" && b.complete && b.hp > 0);

  return (
    <aside
      data-testid="rts-column"
      className="steel flex w-32 shrink-0 flex-col"
      style={{ paddingRight: "env(safe-area-inset-right)" }}
    >
      <div className="flex min-h-0 flex-1">
        <div className="relative w-2 shrink-0 bg-field" aria-hidden>
          <div
            className={`absolute inset-x-0 bottom-0 ${power.low ? "bg-danger" : "bg-crystal"}`}
            style={{ height: `${Math.min(100, (power.supply / cap) * 100)}%` }}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-2 gap-0.5 p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`prod-tab-${t.id}`}
                onClick={() => onTab(t.id)}
                className={`h-8 font-display text-[9px] uppercase tracking-wide ${
                  active === t.id ? "steel-inset text-gold" : "bevel-btn text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {placing && (
            <p className="px-2 text-xs text-gold">
              {BUILDINGS[placing].name}. {placeReason}
            </p>
          )}
          {!yard && mcv && (
            <button
              type="button"
              data-testid="deploy-mcv"
              onClick={onDeploy}
              className="pulse mx-1 mb-1 flex h-9 items-center justify-center gap-1 bg-crystal font-display text-[10px] uppercase text-crystal-ink"
            >
              <ArrowDownToLine className="size-4" /> Deploy MCV
            </button>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-0.5">
            {active === "build" ? (
              <div className="grid grid-cols-2 gap-0.5">
                {BUILD_ORDER.filter((id) => buildingOffered(sim.mapId, faction, id, sim.wallsOn)).map((id) => {
                  const def = BUILDINGS[id];
                  const need = unmetNeed(sim, team, id);
                  const broke = sim.credits[team] < def.cost;
                  const low = power.low && !isFence(id) && id !== "power" && id !== "advpower";
                  const Icon = BUILD_ICON[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`build-${id}`}
                      aria-disabled={need ? true : undefined}
                      onClick={() => {
                        if (!need) onPlace(id);
                      }}
                      className={`bevel-btn flex min-h-11 flex-col items-center justify-center px-0.5 ${need || broke || low ? "text-muted" : "text-ink"}`}
                    >
                      <span className="flex items-center gap-1 font-display text-[11px] uppercase">
                        <Icon className="size-3.5" />
                        {def.short}
                      </span>
                      <span className={`whitespace-normal text-center text-[11px] leading-tight ${need ? "normal-case text-muted" : "text-gold tabular-nums"}`}>
                        {need ?? `${def.cost}${def.powerOut > 0 ? ` +${def.powerOut}` : def.powerUse > 0 ? ` −${def.powerUse}` : ""}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : hall ? (
              <div className="flex flex-col gap-1">
                <TrainProgress sim={sim} team={team} building={hall} faction={faction} />
                <div className="grid grid-cols-2 gap-1">
                  {trainedList(active, faction)
                    .filter((id) => trainOffered(sim.mapId, faction, id, hasDock))
                    .map((id) => (
                      <TrainButton key={id} sim={sim} team={team} building={hall} unitId={id} onTrain={(unit) => onTrain(active, unit)} />
                    ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  <BarButton label={rally ? "Tap the field" : "Set rally"} onClick={onRally}>
                    {rally ? "Tap" : "Rally"}
                  </BarButton>
                  {hall.queue.length > 0 && (
                    <BarButton label="Cancel last order" onClick={onCancel}>
                      <X className="size-4" />
                    </BarButton>
                  )}
                </div>
              </div>
            ) : (
              <p className="px-1 text-xs text-muted">Build a {BUILDINGS[active].name} first. It unlocks this tab.</p>
            )}
          </div>
          {placing && (
            <button type="button" onClick={onCancelPlace} className="bevel-btn mx-0.5 mb-0.5 h-8 font-display text-[10px] uppercase">
              Cancel place
            </button>
          )}
        </div>
        <div className="shrink-0 border-t border-brass-dim p-1" data-testid="column-sell">
          <SellButton
            buildingId={selB}
            disabled={(() => {
              const b = selB != null ? sim.buildingById(selB) : undefined;
              return !b || b.team !== team || b.rubble > 0 || !b.complete || b.kind === "span";
            })()}
            onConfirm={onSell}
          />
        </div>
      </div>
    </aside>
  );
}

function CommandStrip({
  sim,
  team,
  sel,
  selB,
  placing,
  rally,
  armed,
  placeReason,
  onStop,
  onAttack,
  onGuard,
  onAttackMove,
  onScatter,
  onHarvest,
  onReturn,
  onDeploy,
  onRally,
  onRepair,
  onCancelPlace,
  onToggleGate,
  onLoad,
  onUnload,
}: {
  sim: Sim;
  team: number;
  sel: number[];
  selB: number | null;
  placing: BuildingId | null;
  rally: boolean;
  armed: boolean;
  placeReason: string;
  onStop: () => void;
  onAttack: () => void;
  onGuard: () => void;
  onAttackMove: () => void;
  onScatter: () => void;
  onHarvest: () => void;
  onReturn: () => void;
  onDeploy: () => void;
  onRally: () => void;
  onRepair: () => void;
  onCancelPlace: () => void;
  onToggleGate: () => void;
  onLoad: () => void;
  onUnload: () => void;
}) {
  const units = sel.map((id) => sim.unitById(id)).filter((u): u is NonNullable<typeof u> => !!u);
  const harvester = units.find((u) => u.kind === "harvester");
  const building = selB ? sim.buildingById(selB) : undefined;
  const idle = units.length === 0;
  const fighters = units.some((u) => u.hp > 0 && (u.damage > 0 || u.kind === "engineer") && !u.aboard);
  const cargo =
    harvester && harvester.cargoMax > 0
      ? `${Math.min(100, Math.round((harvester.cargo / harvester.cargoMax) * 100))}%`
      : "";
  return (
    <div className="flex items-center gap-1 overflow-x-auto" data-testid="command-strip">
      {placing && (
        <>
          <BarButton label="Cancel placement" dense onClick={onCancelPlace}>
            <X className="size-4" /> Cancel
          </BarButton>
          <p className="shrink-0 text-xs text-muted">{placeReason}</p>
        </>
      )}
      <BarButton label={armed ? "Tap an enemy building" : "Attack"} testId="cmd-attack" dense disabled={!fighters} onClick={onAttack}>
        <Crosshair className="size-4" /> {armed ? "Tap" : "Attack"}
      </BarButton>
      <BarButton label="Stop" testId="cmd-stop" disabled={idle} onClick={onStop}>
        <Square className="size-4" /> Stop
      </BarButton>
      <BarButton label="Hold position" testId="cmd-guard" disabled={idle} onClick={onGuard}>
        <Shield className="size-4" /> Hold
      </BarButton>
      <BarButton label={armed ? "Tap ground to attack-move" : "Attack-move"} testId="cmd-attack-move" dense disabled={idle} onClick={onAttackMove}>
        <Crosshair className="size-4" /> {armed ? "Armed" : "A-Move"}
      </BarButton>
      <BarButton label="Scatter" testId="cmd-scatter" dense disabled={idle} onClick={onScatter}>
        <UnfoldHorizontal className="size-4" /> Scatter
      </BarButton>
      {harvester && (
        <>
          <BarButton label="Harvest" testId="cmd-harvest" dense onClick={onHarvest}>
            <Gem className="size-4" /> Harvest {cargo}
          </BarButton>
          <BarButton label="Return to refinery" testId="cmd-return" dense onClick={onReturn}>
            Return
          </BarButton>
        </>
      )}
      {units.some((u) => u.kind === "mcv") && (
        <BarButton label="Deploy" dense onClick={onDeploy}>
          <ArrowDownToLine className="size-4" /> Deploy
        </BarButton>
      )}
      {units.some((u) => u.capInf + u.capLight > 0) && (
        <>
          <BarButton label="Load nearby" dense onClick={onLoad}>
            Load
          </BarButton>
          <BarButton label="Unload" dense onClick={onUnload}>
            Unload
          </BarButton>
        </>
      )}
      {building && building.team === team && building.complete && building.rubble <= 0 && (building.mending || building.hp < building.maxHp) && (
        <BarButton label={building.mending ? "Stop repair" : "Repair"} testId="cmd-repair" dense onClick={onRepair}>
          <Wrench className="size-4" /> {building.mending ? "Stop" : "Repair"}
        </BarButton>
      )}
      {building && building.team === team && (building.kind === "barracks" || building.kind === "factory" || building.kind === "dock" || building.kind === "helipad") && (
        <BarButton label={rally ? "Tap the field" : "Set rally"} dense onClick={onRally}>
          {rally ? "Tap field" : "Rally"}
        </BarButton>
      )}
      {building && building.team === team && building.kind === "gate" && building.complete && building.rubble <= 0 && (
        <BarButton label={building.open ? "Lock gate" : "Open gate"} testId="cmd-gate" dense onClick={onToggleGate}>
          {building.open ? "Lock" : "Open"}
        </BarButton>
      )}
    </div>
  );
}

function SquadKeys({
  marks,
  onSave,
  onRecall,
  tight = false,
}: {
  marks: [boolean, boolean, boolean, boolean];
  onSave: (i: number) => void;
  onRecall: (i: number) => void;
  tight?: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-1" data-testid="squad-keys">
      {([0, 1, 2, 3] as const).map((i) => (
        <button
          key={i}
          type="button"
          data-testid={`squad-${i + 1}`}
          aria-label={marks[i] ? `Recall group ${i + 1}. Hold to replace it.` : `Group ${i + 1}. Hold to save the selection.`}
      className={`grid place-items-center border font-display text-sm ${tight ? "h-11 w-11" : "h-11 w-11"} ${
            marks[i] ? "border-gold text-gold" : "border-brass-dim text-muted"
          }`}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            const el = e.currentTarget;
            el.dataset.held = "";
            const timer = window.setTimeout(() => {
              el.dataset.held = "1";
              onSave(i);
            }, 420);
            el.dataset.timer = String(timer);
          }}
          onPointerUp={(e) => {
            const el = e.currentTarget;
            window.clearTimeout(Number(el.dataset.timer));
            if (el.dataset.held === "1") return;
            onRecall(i);
          }}
          onPointerCancel={(e) => window.clearTimeout(Number(e.currentTarget.dataset.timer))}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

function ShortDock({
  open,
  onToggle,
  busy,
  sim,
  team,
  sel,
  selB,
  placing,
  rally,
  armed,
  placeReason,
  squadOn,
  onSave,
  onRecall,
  onPlace,
  onCancelPlace,
  onTrain,
  onCancelOne,
  onStop,
  onAttack,
  onGuard,
  onAttackMove,
  onScatter,
  onHarvest,
  onReturn,
  onDeploy,
  onRally,
  onRepair,
  onClear,
  onOpenBuild,
  onSell,
  onToggleGate,
  onLoad,
  onUnload,
  onCancel,
}: {
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  sim: Sim;
  team: number;
  sel: number[];
  selB: number | null;
  placing: BuildingId | null;
  rally: boolean;
  armed: boolean;
  placeReason: string;
  squadOn: [boolean, boolean, boolean, boolean];
  onSave: (i: number) => void;
  onRecall: (i: number) => void;
  onPlace: (k: BuildingId) => void;
  onCancelPlace: () => void;
  onTrain: (kind: BuildingId, unit: UnitId) => void;
  onCancelOne: (kind: BuildingId, unit: UnitId) => void;
  onStop: () => void;
  onAttack: () => void;
  onGuard: () => void;
  onAttackMove: () => void;
  onScatter: () => void;
  onHarvest: () => void;
  onReturn: () => void;
  onDeploy: () => void;
  onRally: () => void;
  onRepair: () => void;
  onClear: () => void;
  onOpenBuild: () => void;
  onSell: () => void;
  onToggleGate: () => void;
  onLoad: () => void;
  onUnload: () => void;
  onCancel: () => void;
}) {
  const commands = (
    <CommandBar
      sim={sim}
      team={team}
      sel={sel}
      selB={selB}
      placing={placing}
      rally={rally}
      armed={armed}
      placeReason={placeReason}
      onPlace={onPlace}
      onCancelPlace={onCancelPlace}
      onTrain={(id) => {
        const building = selB ? sim.buildingById(selB) : undefined;
        if (!building) return;
        onTrain(building.kind, id);
      }}
      onStop={onStop}
      onAttack={onAttack}
      onGuard={onGuard}
      onAttackMove={onAttackMove}
      onScatter={onScatter}
      onHarvest={onHarvest}
      onReturn={onReturn}
      onDeploy={onDeploy}
      onRally={onRally}
      onRepair={onRepair}
      onClear={onClear}
      onOpenBuild={onOpenBuild}
      onSell={onSell}
      onToggleGate={onToggleGate}
      onLoad={onLoad}
      onUnload={onUnload}
      onCancel={onCancel}
    />
  );
  const building = selB != null ? sim.buildingById(selB) : undefined;
  const unitOrders = sel.length > 0 && selB == null;
  const ownBuilding =
    building && building.team === team && building.hp > 0 && building.rubble <= 0 && building.kind !== "span" && building.complete
      ? building
      : undefined;
  const producer = !!ownBuilding && isTrainHall(ownBuilding.kind);
  const hurt = !!ownBuilding && (ownBuilding.mending || ownBuilding.hp < ownBuilding.maxHp);
  const gate = !!ownBuilding && ownBuilding.kind === "gate";
  const slot = "bevel-btn grid h-11 w-14 shrink-0 place-items-center font-display text-[11px] uppercase leading-none disabled:text-muted";
  return (
    <div
      className="flex h-16 items-center gap-1 px-1"
      data-testid="short-dock"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none", userSelect: "none" }}
    >
      <SquadKeys tight marks={squadOn} onSave={onSave} onRecall={onRecall} />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={{ touchAction: "pan-x" }}>
        {unitOrders ? (
          commands
        ) : (
          <TroopRoster tight sim={sim} team={team} selB={selB} onTrain={onTrain} onCancelOne={onCancelOne} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1" data-testid="dock-utility">
        <button
          type="button"
          data-testid="tray-toggle"
          aria-pressed={producer ? false : open}
          aria-label={producer ? `Show ${ownBuilding.kind} units` : open ? "Hide build list" : "Show build list"}
          onClick={onOpenBuild}
          className={`${slot} ${!producer && open ? "bg-crystal text-crystal-ink" : "text-gold"}`}
        >
          Build
        </button>
        <button
          type="button"
          data-testid={gate ? "cmd-gate" : "cmd-rally"}
          disabled={!producer && !gate}
          aria-label={gate ? (ownBuilding.open ? "Lock gate" : "Open gate") : rally ? "Tap the field" : "Set rally"}
          onClick={gate ? onToggleGate : onRally}
          className={`${slot} ${producer || gate ? "" : "invisible"}`}
        >
          {gate ? (ownBuilding.open ? "Lock" : "Open") : rally ? "Tap" : "Rally"}
        </button>
        <button
          type="button"
          data-testid="cmd-repair"
          disabled={!hurt}
          aria-label={ownBuilding?.mending ? "Stop repair" : "Repair"}
          onClick={onRepair}
          className={`${slot} ${hurt ? "" : "invisible"}`}
        >
          {ownBuilding?.mending ? "Stop" : "Repair"}
        </button>
        <SellButton buildingId={selB} disabled={!ownBuilding} onConfirm={onSell} />
      </div>
    </div>
  );
}

function TroopRoster({
  sim,
  team,
  onTrain,
  onCancelOne,
  selB = null,
  tight = false,
  icons = false,
}: {
  sim: Sim;
  team: number;
  onTrain: (kind: BuildingId, unit: UnitId) => void;
  onCancelOne?: (kind: BuildingId, unit: UnitId) => void;
  selB?: number | null;
  tight?: boolean;
  icons?: boolean;
}) {
  const faction = sim.factionOf(team as 0);
  const hasDock = sim.buildings.some((b) => b.team === team && b.kind === "dock" && b.complete && b.hp > 0 && b.rubble <= 0);
  const groups: { id: TrainAt; label: string }[] = [
    { id: "barracks", label: "Infantry" },
    { id: "factory", label: "Vehicles" },
  ];
  if (buildingOffered(sim.mapId, faction, "dock", sim.wallsOn)) groups.push({ id: "dock", label: "Navy" });
  if (buildingOffered(sim.mapId, faction, "helipad", sim.wallsOn)) groups.push({ id: "helipad", label: "Air" });
  const picked = selB != null ? sim.buildingById(selB) : undefined;
  return (
    <div
      className={`flex min-w-0 flex-1 items-center overflow-x-auto ${icons ? "gap-1" : "gap-2"}`}
      data-testid="troop-roster"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none", userSelect: "none", touchAction: "pan-x" }}
    >
      {groups.map((group) => {
        const list = trainedList(group.id, faction).filter((id) => trainOffered(sim.mapId, faction, id, hasDock || group.id !== "dock"));
        if (!list.length) return null;
        const hall = producerOf(sim, team, group.id, selB);
        const hot = !!picked && picked.kind === group.id && picked.team === team;
        return (
          <div
            key={group.id}
            data-roster-group={group.id}
            className={`flex shrink-0 items-center gap-1 ${hot ? "outline outline-1 outline-gold" : ""}`}
          >
            {icons ? null : (
              <span className="shrink-0 whitespace-nowrap px-1 font-display text-[11px] uppercase leading-none tracking-wide text-gold">
                {group.label}
              </span>
            )}
            {list.map((id) =>
              hall ? (
                <TrainButton
                  key={id}
                  tight={tight}
                  icons={icons}
                  sim={sim}
                  team={team}
                  building={hall}
                  unitId={id}
                  onTrain={(unit) => onTrain(group.id, unit)}
                  onCancelOne={onCancelOne ? () => onCancelOne(group.id, id) : undefined}
                />
              ) : (
                <button
                  key={id}
                  type="button"
                  disabled
                  data-testid={`train-${id}`}
                  aria-label={`${resolveUnit(id, faction).name}. Build a ${BUILDINGS[group.id].name} first.`}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`bevel-btn flex shrink-0 items-center justify-center gap-1 px-1.5 text-muted ${
                    icons ? "h-11 min-w-11" : tight ? "h-12 min-h-11 min-w-[8.75rem] flex-row" : "h-16 w-16 flex-col"
                  }`}
                >
                  <span className="whitespace-nowrap font-display text-[11px] uppercase leading-none">{resolveUnit(id, faction).short}</span>
                  {icons ? null : <span className="whitespace-nowrap text-[11px] leading-none text-muted">Locked</span>}
                </button>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

function QueueStrip({ sim, team }: { sim: Sim; team: number }) {
  const faction = sim.factionOf(team as 0);
  const low = sim.powerOf(team as 0).low;
  const rows = sim.buildings.filter(
    (b) => b.team === team && b.hp > 0 && b.rubble <= 0 && !isFence(b.kind) && (!b.complete || b.queue.length > 0),
  );
  if (!rows.length) return null;
  return (
    <div className="mt-1 flex gap-2 overflow-x-auto" data-testid="queue-strip">
      {rows.map((b) => {
        const plant = b.kind === "power" || b.kind === "advpower";
        const brown = !low ? 1 : plant ? 0.8 : 0.5;
        const works = sim.worksLeft[team]! > 0 ? 1.65 : 1;
        const rate = !b.complete ? brown * 1.25 * works : brown * works;
        let label = b.name;
        let p = 0;
        if (!b.complete) {
          p = 1 - b.buildLeft / Math.max(0.01, b.buildTotal);
          label = `${b.name} ${Math.ceil(Math.max(0, b.buildLeft) / rate)}s`;
        } else {
          const spec = resolveUnit(b.queue[0], faction);
          p = spec.time > 0 ? b.prod / spec.time : 0;
          const left = Math.ceil(Math.max(0, spec.time - b.prod) / rate);
          label = `${spec.short} ${left}s`;
          if (b.queue.length > 1) label += ` +${b.queue.length - 1}`;
        }
        return (
          <div key={b.id} className="steel-inset flex h-11 min-w-28 shrink-0 flex-col justify-center px-2">
            <span className="truncate font-display text-[10px] uppercase tracking-wide text-gold">{label}</span>
            <div className="mt-1 h-2 bg-field">
              <div
                className={`h-full ${rate < 1 ? "bg-danger" : "bg-crystal"}`}
                style={{ width: `${Math.max(0, Math.min(100, Math.floor(p * 100)))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResourcePill({
  label,
  value,
  tone,
  children,
  compact = false,
}: {
  label: string;
  value: string;
  tone: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-1 border border-brass-dim bg-field ${compact ? "h-7 px-1" : "h-9 px-1.5"}`}
      aria-label={label}
    >
      {children}
      <span className={`truncate font-display tabular-nums ${tone} text-xs`}>{value}</span>
    </div>
  );
}

function PowerPill({ sim, team, compact = false }: { sim: Sim; team: number; compact?: boolean }) {
  const p = sim.powerOf((team === 1 || team === 2 || team === 3 ? team : 0) as 0);
  return (
    <ResourcePill label="Power" value={`${p.supply}/${p.use}`} tone={p.low ? "text-danger" : "text-crystal"} compact={compact}>
      <Zap className={`${compact ? "size-3" : "size-3.5"} ${p.low ? "text-danger" : "text-crystal"}`} />
    </ResourcePill>
  );
}

function CraneMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M5 20h9M8 20V7M8 7h12M20 7v7M17 14h3" />
    </svg>
  );
}

function BuildColumn({
  sim,
  team,
  placing,
  onPlace,
  onCancel,
  onClose,
}: {
  sim: Sim;
  team: number;
  placing: BuildingId | null;
  onPlace: (kind: BuildingId) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const faction = sim.factionOf(team as 0);
  const power = sim.powerOf(team as 0);
  const yard = sim.buildings.some((b) => b.team === team && b.kind === "yard" && b.complete && b.hp > 0);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ y: 0, top: 0, moved: false, active: false, swallow: false, kind: "" as BuildingId | "" });
  return (
    <aside
      data-testid="build-column"
      className={`absolute top-1 right-[104px] z-30 flex w-44 flex-col border border-brass-dim bg-field/94 ${placing ? "bottom-[108px]" : "bottom-1"}`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between px-1">
        <p className="font-display text-[11px] uppercase tracking-wide text-gold">Build</p>
        <button type="button" aria-label="Close build list" className="bevel-btn h-11 min-w-11 font-display text-[11px] uppercase" onClick={onClose}>
          Close
        </button>
      </div>
      <div
        ref={scroller}
        data-testid="build-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-none p-1"
        style={{ touchAction: "none", WebkitTouchCallout: "none", minHeight: placing ? undefined : 144 }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const el = scroller.current;
          if (!el) return;
          el.setPointerCapture(e.pointerId);
          const hit = (e.target as HTMLElement).closest("[data-build]");
          drag.current = {
            y: e.clientY,
            top: el.scrollTop,
            moved: false,
            active: true,
            swallow: false,
            kind: (hit?.getAttribute("data-build") ?? "") as BuildingId | "",
          };
        }}
        onPointerMove={(e) => {
          const el = scroller.current;
          const d = drag.current;
          if (!el || !d.active) return;
          const dy = e.clientY - d.y;
          if (Math.abs(dy) > 8) d.moved = true;
          el.scrollTop = d.top - dy;
        }}
        onPointerUp={() => {
          const d = drag.current;
          d.active = false;
          d.swallow = true;
          if (!d.moved && d.kind && !unmetNeed(sim, team, d.kind)) onPlace(d.kind);
        }}
        onPointerCancel={() => {
          drag.current.active = false;
        }}
      >
        {!yard && (
          <p className="px-1 py-2 text-[11px] text-muted">No Construction Yard.</p>
        )}
        {BUILD_ORDER.filter((id) => buildingOffered(sim.mapId, faction, id, sim.wallsOn)).map((id) => {
          const def = BUILDINGS[id];
          const need = unmetNeed(sim, team, id);
          const broke = sim.credits[team] < def.cost;
          const low = power.low && !isFence(id) && id !== "power" && id !== "advpower";
          const Icon = BUILD_ICON[id];
          return (
            <button
              key={id}
              type="button"
              data-testid={`build-${id}`}
              data-build={id}
              aria-disabled={need ? true : undefined}
              onClick={() => {
                if (need) return;
                if (drag.current.swallow || drag.current.moved) {
                  drag.current.swallow = false;
                  drag.current.moved = false;
                  return;
                }
                onPlace(id);
              }}
              className={`bevel-btn mb-1 flex min-h-11 w-full items-center gap-2 px-2 font-display text-xs uppercase ${need || broke || low ? "text-muted" : "text-ink"} ${placing === id ? "bg-crystal text-crystal-ink" : ""}`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 text-left">
                <span className="block whitespace-normal text-[11px] leading-tight">{def.short}</span>
                {need ? <span className="block whitespace-normal text-[11px] leading-tight normal-case">{need}</span> : null}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-gold">{def.cost}</span>
            </button>
          );
        })}
      </div>
      {placing && (
        <button type="button" onClick={onCancel} className="bevel-btn m-1 h-11 shrink-0 font-display text-[11px] uppercase">
          Cancel place
        </button>
      )}
    </aside>
  );
}

function FieldPad({
  buildOn,
  moveOn,
  selecting,
  armed,
  strike = false,
  raised = false,
  dock,
  edge,
  onBuild,
  onMove,
  onAttackMove,
  onSelect,
  onArmy,
}: {
  buildOn: boolean;
  moveOn: boolean;
  selecting: boolean;
  armed: boolean;
  strike?: boolean;
  raised?: boolean;
  dock?: string;
  edge?: string;
  onBuild: () => void;
  onMove: () => void;
  onAttackMove: () => void;
  onSelect: () => void;
  onArmy?: () => void;
}) {
  const spot = dock ?? (raised ? "bottom-16" : "bottom-3");
  const key = "grid size-11 min-h-11 min-w-11 place-items-center border border-crystal/80 bg-field/85 text-xs text-crystal";
  const right = edge ?? "right-2";
  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-testid="field-pad">
      {selecting && !armed && (
        <p className="pointer-events-none absolute top-14 left-1/2 max-w-[70%] -translate-x-1/2 bg-field/80 px-3 py-1 text-center text-xs text-pretty text-ink">
          Drag a rectangle to select.
        </p>
      )}
      {armed && (
        <p className="pointer-events-none absolute top-14 left-1/2 max-w-[80%] -translate-x-1/2 bg-field/90 px-3 py-1 text-center text-xs text-pretty text-gold">
          {strike ? "Tap an enemy building." : "Tap the ground to attack-move."}
        </p>
      )}
      <div className={`pointer-events-auto absolute left-2 flex flex-col gap-2 ${spot}`}>
        {onArmy && (
          <button
            type="button"
            data-testid="select-army"
            aria-label="Select all army"
            className={`${key} px-2 font-display text-xs uppercase`}
            onClick={onArmy}
          >
            Army
          </button>
        )}
        <button
          type="button"
          data-testid="pad-build"
          aria-pressed={buildOn}
          aria-label="Build"
          className={`${key} ${buildOn ? "bg-crystal text-crystal-ink" : ""}`}
          onClick={onBuild}
        >
          <CraneMark />
        </button>
      </div>
      <div className={`pointer-events-auto absolute flex flex-col gap-2 ${right} ${spot}`}>
        <button
          type="button"
          data-testid="pad-attack-move"
          aria-pressed={armed}
          aria-label={armed ? "Tap the map or minimap to attack-move" : "Attack-move"}
          className={`${key} px-1 font-display text-[10px] uppercase leading-none ${armed ? "border-danger bg-danger text-ink" : ""}`}
          onClick={onAttackMove}
        >
          {armed ? "Tap" : "A-Move"}
        </button>
        <button
          type="button"
          data-testid="pad-move"
          aria-pressed={moveOn}
          aria-label="Move"
          className={`${key} ${moveOn ? "bg-crystal text-crystal-ink" : ""}`}
          onClick={onMove}
        >
          <Move className="size-6" />
        </button>
        <button
          type="button"
          data-testid="pad-select"
          aria-pressed={selecting}
          aria-label={selecting ? "Cancel select" : "Select units with a rectangle"}
          className={`${key} ${selecting ? "border-danger bg-danger text-ink" : ""}`}
          onClick={onSelect}
        >
          {selecting ? <X className="size-6" /> : <LayoutGrid className="size-6" />}
        </button>
      </div>
    </div>
  );
}

function CommandBar({
  sim,
  team,
  sel,
  selB,
  placing,
  rally,
  armed,
  placeReason,
  onPlace,
  onCancelPlace,
  onTrain,
  onStop,
  onAttack,
  onGuard,
  onAttackMove,
  onScatter,
  onHarvest,
  onReturn,
  onDeploy,
  onRally,
  onRepair,
  onClear,
  onOpenBuild,
  onToggleGate,
  onLoad,
  onUnload,
  onCancel,
  list = false,
}: {
  sim: Sim;
  team: number;
  sel: number[];
  selB: number | null;
  placing: BuildingId | null;
  rally: boolean;
  armed: boolean;
  placeReason: string;
  onPlace: (k: BuildingId) => void;
  onCancelPlace: () => void;
  onTrain: (id: UnitId) => void;
  onStop: () => void;
  onAttack: () => void;
  onGuard: () => void;
  onAttackMove: () => void;
  onScatter: () => void;
  onHarvest: () => void;
  onReturn: () => void;
  onDeploy: () => void;
  onRally: () => void;
  onRepair: () => void;
  onClear: () => void;
  onOpenBuild?: () => void;
  list?: boolean;
  onSell: () => void;
  onToggleGate: () => void;
  onLoad: () => void;
  onUnload: () => void;
  onCancel: () => void;
}) {
  const faction = sim.factionOf(team as 0);
  const yard = sim.buildings.some((b) => b.team === team && b.kind === "yard" && b.complete && b.hp > 0);
  const mcv = sim.units.find((u) => u.team === team && u.kind === "mcv" && u.hp > 0);
  const building = selB ? sim.buildingById(selB) : undefined;
  const selectedUnits = sel.map((id) => sim.unitById(id)).filter((u): u is NonNullable<typeof u> => !!u);

  if (placing) {
    return (
      <>
        <BarButton tile label="Cancel placement" onClick={onCancelPlace}>
          <X className="size-5" /> Cancel
        </BarButton>
        <p className="flex items-center px-2 text-sm whitespace-nowrap text-ink">{BUILDINGS[placing].name}</p>
        <p className="flex items-center px-2 text-xs whitespace-nowrap text-muted">{placeReason}</p>
      </>
    );
  }

  if (!yard && mcv) {
    const deploying = mcv.order.t === "deploy";
    return (
      <button
        type="button"
        data-testid="deploy-mcv"
        disabled={deploying}
        onClick={onDeploy}
        className="pulse flex h-12 min-w-44 items-center justify-center gap-2 bg-crystal px-4 font-display text-sm uppercase tracking-wide text-crystal-ink"
      >
        <ArrowDownToLine className="size-5" />
        {deploying ? "Deploying…" : "Deploy MCV"}
      </button>
    );
  }

  if (!list && selectedUnits.length) {
    const harvester = selectedUnits.find((u) => u.kind === "harvester");
    const cargoNote =
      harvester && harvester.cargoMax > 0
        ? ` · ${Math.min(100, Math.round((harvester.cargo / harvester.cargoMax) * 100))}%`
        : "";
    const deployable = selectedUnits.some((u) => u.kind === "mcv");
    const air = selectedUnits.find((u) => u.ammoMax > 0);
    const airNote = !air
      ? ""
      : air.rearm > 0
        ? ` · pad ${Math.ceil(air.rearm)}s`
        : air.order.t === "rearm"
          ? " · returning"
          : ` · ${air.ammo}/${air.ammoMax}`;
    const label =
      selectedUnits.length === 1
        ? `${selectedUnits[0].name}${airNote}${cargoNote}`
        : `${selectedUnits.length} units${airNote}${cargoNote}`;
    const fighters = selectedUnits.some((u) => u.hp > 0 && (u.damage > 0 || u.kind === "engineer") && !u.aboard);
    return (
      <>
        <span className="cmd-count" title={label}>
          {selectedUnits.length}
        </span>
        {fighters && (
          <CmdTile label={armed ? "Tap an enemy building" : "Attack"} testId="cmd-attack" armed={armed} onClick={onAttack}>
            <Crosshair />
          </CmdTile>
        )}
        <CmdTile label="Stop" testId="cmd-stop" onClick={onStop}>
          <Ban className="text-[#ff6b5a]" />
        </CmdTile>
        <CmdTile label="Hold position" testId="cmd-guard" onClick={onGuard}>
          <Hand />
        </CmdTile>
        <CmdTile label={armed ? "Tap ground to attack-move" : "Attack-move"} testId="cmd-attack-move" armed={armed} onClick={onAttackMove}>
          <Route />
        </CmdTile>
        <CmdTile label="Scatter" testId="cmd-scatter" onClick={onScatter}>
          <UnfoldHorizontal />
        </CmdTile>
        {harvester && (
          <>
            <CmdTile label="Harvest" testId="cmd-harvest" onClick={onHarvest}>
              <Gem />
            </CmdTile>
            <CmdTile label="Return to refinery" testId="cmd-return" onClick={onReturn}>
              <Warehouse />
            </CmdTile>
          </>
        )}
        {selectedUnits.some((u) => u.capInf + u.capLight > 0) && (
          <>
            <CmdTile label="Load nearby" onClick={onLoad}>
              <Package />
            </CmdTile>
            <CmdTile label="Unload" onClick={onUnload}>
              <ArrowDownToLine />
            </CmdTile>
          </>
        )}
        {deployable && (
          <CmdTile label="Deploy" onClick={onDeploy}>
            <ArrowDownToLine />
          </CmdTile>
        )}
        <CmdTile label="Clear selection" testId="cmd-clear" hot onClick={onClear}>
          <X />
        </CmdTile>
      </>
    );
  }

  if (!list && building && (building.kind === "barracks" || building.kind === "factory" || building.kind === "dock" || building.kind === "helipad")) {
    return (
      <>
        <TrainProgress sim={sim} team={team} building={building} faction={faction} />
        {building.hp < building.maxHp && (
          <p className="flex items-center px-2 text-sm whitespace-nowrap text-ink">
            {Math.ceil(building.hp)}/{Math.ceil(building.maxHp)}
          </p>
        )}
        {building.queue.length > 0 && (
          <BarButton tile label="Cancel last order" onClick={onCancel}>
            <X className="size-5" /> Cancel
          </BarButton>
        )}
        {building.complete && building.rubble <= 0 && (building.mending || building.hp < building.maxHp) && (
          <BarButton tile label={building.mending ? "Stop repair" : "Repair"} testId="cmd-repair" onClick={onRepair}>
            <Wrench className="size-5" /> {building.mending ? "Stop" : "Repair"}
          </BarButton>
        )}
        <BarButton tile label={rally ? "Tap the field" : "Set rally"} onClick={onRally}>
          {rally ? "Tap field" : "Rally"}
        </BarButton>
        <BarButton tile label="Build menu" onClick={() => (onOpenBuild ?? onClear)()}>
          Build
        </BarButton>
      </>
    );
  }

  if (!list && building && building.team === team && building.kind !== "span") {
    const rubble = building.rubble > 0;
    return (
      <>
        <p className="flex items-center px-2 text-sm whitespace-nowrap text-ink">
          {rubble ? "Rubble" : building.name}
          {!rubble && building.hp < building.maxHp ? ` · ${Math.ceil(building.hp)}/${Math.ceil(building.maxHp)}` : ""}
        </p>
        {building.kind === "gate" && building.complete && !rubble && (
          <BarButton tile label={building.open ? "Lock gate" : "Open gate"} testId="cmd-gate" onClick={onToggleGate}>
            {building.open ? "Lock" : "Open"}
          </BarButton>
        )}
        {!rubble && building.complete && (building.mending || building.hp < building.maxHp) && (
          <BarButton tile label={building.mending ? "Stop repair" : "Repair"} testId="cmd-repair" onClick={onRepair}>
            <Wrench className="size-5" /> {building.mending ? "Stop" : "Repair"}
          </BarButton>
        )}
        <BarButton tile label="Build menu" onClick={() => (onOpenBuild ?? onClear)()}>
          Build
        </BarButton>
      </>
    );
  }

  if (!yard) {
    return <p className="flex items-center px-2 text-sm text-muted">No Construction Yard.</p>;
  }

  return (
    <>
      {BUILD_ORDER.filter((id) => buildingOffered(sim.mapId, faction, id, sim.wallsOn)).map((id) => {
        const def = BUILDINGS[id];
        const need = unmetNeed(sim, team, id);
        const broke = sim.credits[team] < def.cost;
        const low = sim.powerOf(team as 0).low && !isFence(id) && id !== "power" && id !== "advpower";
        const Icon = BUILD_ICON[id];
        return (
          <button
            key={id}
            type="button"
            data-testid={`build-${id}`}
            aria-disabled={need ? true : undefined}
            onClick={() => {
              if (!need) onPlace(id);
            }}
            className={`bevel-btn flex min-h-11 w-16 shrink-0 flex-col items-center justify-center gap-0.5 px-1 ${
              need || broke || low ? "text-muted" : "text-ink"
            }`}
          >
            <Icon className="size-6" />
            <span className="max-w-full whitespace-normal text-center font-display text-[11px] uppercase leading-tight">{need ? need : def.short}</span>
            {need ? null : (
              <span className="text-[11px] text-gold tabular-nums">
                {def.cost}
                {def.powerOut > 0 ? ` +${def.powerOut}` : def.powerUse > 0 ? ` −${def.powerUse}` : ""}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function TrainProgress({
  sim,
  team,
  building,
  faction,
}: {
  sim: Sim;
  team: number;
  building: Building;
  faction: FactionId;
}) {
  const low = sim.powerOf(team as 0).low;
  const plant = building.kind === "power" || building.kind === "advpower";
  const brown = !low ? 1 : plant ? 0.8 : 0.5;
  const rush = sim.worksLeft[team]! > 0 ? 1.65 : 1;
  const buildRate = brown * 1.25 * rush;
  const trainRate = brown * rush;
  if (!building.complete) {
    const p = Math.max(0, Math.min(1, 1 - building.buildLeft / Math.max(0.01, building.buildTotal)));
    const left = Math.ceil(Math.max(0, building.buildLeft) / buildRate);
    return (
      <div className="flex h-12 min-w-36 flex-col justify-center px-2" data-testid="build-progress">
        <div className="flex justify-between text-xs text-muted">
          <span>Rising</span>
          <span className="tabular-nums">{left}s</span>
        </div>
        <div className="mt-1 h-2 bg-field">
          <div className="h-full bg-gold" style={{ width: `${Math.floor(p * 100)}%` }} />
        </div>
      </div>
    );
  }
  if (!building.queue.length) return <p className="flex items-center px-2 text-xs text-muted">Idle</p>;
  const id = building.queue[0];
  const spec = resolveUnit(id, faction);
  const p = Math.max(0, Math.min(1, building.prod / Math.max(0.01, spec.time)));
  const left = Math.ceil(Math.max(0, spec.time - building.prod) / trainRate);
  const rest = building.queue
    .slice(1)
    .map((q) => resolveUnit(q, faction).short)
    .join(" ");
  return (
    <div className="flex h-12 min-w-40 flex-col justify-center px-2" data-testid="train-progress">
      <div className="flex justify-between gap-2 text-xs text-crystal">
        <span className="truncate">
          {spec.short}
          {low && !plant ? " · half speed" : low ? " · slower" : ""}
        </span>
        <span className="tabular-nums">{left}s</span>
      </div>
      <div className="mt-1 h-2 bg-field">
        <div className={`h-full ${low ? "bg-danger" : "bg-crystal"}`} style={{ width: `${Math.floor(p * 100)}%` }} />
      </div>
      {rest ? <span className="truncate text-xs text-muted">{rest}</span> : null}
    </div>
  );
}

const UNIT_MARK: Partial<Record<UnitId, string>> = {
  rifle: "/art/iso/rifle.png",
  rocket: "/art/iso/rocket.png",
  marksman: "/art/iso/marksman.png",
  wader: "/art/iso/wader.png",
  scout: "/art/iso/scout.png",
  engineer: "/art/iso/engineer.png",
  tank: "/art/iso/tank.png",
  medium: "/art/iso/medium.png",
  scatter: "/art/iso/scatter.png",
  artillery: "/art/iso/artillery.png",
  vanguard: "/art/iso/vanguard.png",
  razor: "/art/iso/razor.png",
  apc: "/art/iso/apc.png",
  harvester: "/art/iso/harvester.png",
  mcv: "/art/iso/yard.png",
  gunboat: "/art/boat.png",
  frigate: "/art/boat.png",
  missile: "/art/boat.png",
  transport: "/art/boat.png",
  chinook: "/art/iso/chinook.png",
  attackheli: "/art/iso/attackheli.png",
  bomber: "/art/iso/bomber.png",
};

function TrainButton({
  sim,
  team,
  building,
  unitId,
  onTrain,
  onCancelOne,
  tight = false,
  icons = false,
}: {
  sim: Sim;
  team: number;
  building: Building;
  unitId: UnitId;
  onTrain: (id: UnitId) => void;
  onCancelOne?: () => void;
  tight?: boolean;
  icons?: boolean;
}) {
  const spec = resolveUnit(unitId, sim.factionOf(team as 0));
  const need = unitRequires(unitId);
  const unlocked = !need || sim.buildings.some((b) => b.team === team && b.kind === need && b.complete && b.hp > 0 && b.rubble <= 0);
  const afford = unlocked && sim.credits[team] >= spec.cost && building.queue.length < 5;
  const mark = UNIT_MARK[unitId];
  const queued = building.queue.filter((id) => id === unitId).length;
  const head = building.queue[0] === unitId;
  const p = head && spec.time > 0 ? Math.max(0, Math.min(1, building.prod / spec.time)) : 0;
  const trainRef = useRef(onTrain);
  trainRef.current = onTrain;
  const hold = useRef<{ timer: number; fired: boolean; x: number; y: number; id: number } | null>(null);
  const skipClick = useRef(false);
  useEffect(() => () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
  }, []);
  const queue = (n: number) => {
    if (!building.complete || !unlocked) return;
    for (let i = 0; i < n; i++) trainRef.current(unitId);
  };
  return (
    <div className="relative w-max shrink-0" style={{ WebkitTouchCallout: "none", userSelect: "none" }}>
      <button
        type="button"
        data-testid={`train-${unitId}`}
        aria-label={unlocked ? `${spec.name}, ${spec.cost} credits, ${commandCost(spec)} command` : `${spec.name}. Needs ${BUILDINGS[need!].name}.`}
        disabled={!building.complete || !unlocked}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: "none", userSelect: "none", touchAction: "manipulation" }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !building.complete || !unlocked) return;
          const timer = window.setTimeout(() => {
            if (!hold.current) return;
            hold.current.fired = true;
            queue(5);
          }, 500);
          hold.current = { timer, fired: false, x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const s = hold.current;
          if (!s || s.id !== e.pointerId || s.fired) return;
          if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) {
            window.clearTimeout(s.timer);
            s.fired = true;
          }
        }}
        onPointerUp={(e) => {
          const s = hold.current;
          if (!s || s.id !== e.pointerId) return;
          window.clearTimeout(s.timer);
          hold.current = null;
          skipClick.current = true;
          if (!s.fired) queue(1);
        }}
        onPointerCancel={() => {
          if (hold.current) window.clearTimeout(hold.current.timer);
          hold.current = null;
        }}
        onClick={() => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          queue(1);
        }}
        className={`bevel-btn relative flex shrink-0 items-center px-1.5 ${
          icons ? "h-11 min-h-11 min-w-11 justify-center" : tight ? "h-12 min-h-11 w-max min-w-[8.75rem] flex-row gap-1 pr-12" : "h-16 w-20 flex-col justify-center gap-0.5 pr-8"
        } ${afford ? "text-ink" : "text-muted"}`}
      >
        {mark ? (
          <img src={mark} alt="" draggable={false} className={`${icons ? "size-6" : tight ? "size-7" : "size-8"} shrink-0 object-contain`} />
        ) : (
          <span className={`grid shrink-0 place-items-center bg-well font-display uppercase text-gold ${icons ? "size-6 text-xs" : "size-7 text-[11px]"}`}>
            {spec.short.slice(0, 2)}
          </span>
        )}
        {icons ? null : (
          <span className={`flex min-w-0 flex-col leading-none ${tight ? "items-start" : "items-center"}`}>
            <span className="whitespace-nowrap font-display text-[11px] uppercase">{spec.short}</span>
            <span className="whitespace-nowrap text-[11px] tabular-nums text-gold">
              {unlocked ? (
                <>
                  {spec.cost}
                  <span className="text-brass"> · {commandCost(spec)}</span>
                </>
              ) : (
                BUILDINGS[need!].short
              )}
            </span>
          </span>
        )}
        {head && (
          <span className="pointer-events-none absolute right-11 bottom-0 left-0 h-1 bg-well">
            <span className="block h-full bg-crystal" style={{ width: `${Math.floor(p * 100)}%` }} />
          </span>
        )}
      </button>
      {!icons && queued > 0 && (
        <span
          role="button"
          tabIndex={0}
          data-testid={`queue-badge-${unitId}`}
          aria-label={`Cancel one ${spec.short}. ${queued} queued.`}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onCancelOne?.();
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            onCancelOne?.();
          }}
          className={`absolute top-0 right-0 z-10 flex w-11 flex-col items-center justify-center bg-field/92 font-display text-[11px] leading-none text-gold tabular-nums ${
            tight ? "bottom-0" : "h-11"
          }`}
          style={{ WebkitTouchCallout: "none", userSelect: "none", touchAction: "manipulation" }}
        >
          {queued}
          {head ? (
            <span className="mt-0.5 h-1 w-8 bg-well">
              <span className="block h-full bg-crystal" style={{ width: `${Math.floor(p * 100)}%` }} />
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

function SellButton({
  disabled,
  onConfirm,
  buildingId,
  tile = false,
}: {
  disabled?: boolean;
  onConfirm: () => void;
  buildingId: number | null;
  tile?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    setArmed(false);
    window.clearTimeout(timer.current);
  }, [buildingId, disabled]);
  const press = () => {
    if (disabled) return;
    if (armed) {
      window.clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setArmed(false), 2000);
  };
  return (
    <button
      type="button"
      data-testid="cmd-sell"
      disabled={disabled}
      aria-label={armed ? "Confirm sell" : "Sell for half. Tap again to confirm."}
      onClick={press}
      onContextMenu={(e) => e.preventDefault()}
      className={`bevel-btn shrink-0 font-display text-[11px] uppercase leading-none disabled:text-muted ${
        tile ? "h-12 min-h-11 min-w-12 px-2" : "grid h-11 w-14 place-items-center"
      } ${armed ? "bg-danger text-ink" : ""}`}
    >
      {armed ? "Sell?" : "Sell"}
    </button>
  );
}

function PlantPlate({
  sim,
  id,
  team,
  cam,
  view,
}: {
  sim: Sim;
  id: number;
  team: number;
  cam: Camera;
  view: View;
}) {
  const b = sim.buildingById(id);
  if (!b || b.team !== team || b.hp <= 0 || b.kind === "span" || view.w < 2) return null;
  const at = worldToScreen(cam, b.tx + b.w / 2, b.ty, view);
  if (at.x < -80 || at.y < -40 || at.x > view.w + 80 || at.y > view.h + 40) return null;
  const low = sim.powerOf(team as 0).low && b.kind !== "power" && b.kind !== "advpower";
  const rate = ((low ? 0.5 : 1) * (sim.worksLeft[team]! > 0 ? 1.65 : 1));
  let timer = "";
  if (!b.complete) timer = clock(b.buildLeft / rate);
  else if (b.queue[0]) {
    const spec = resolveUnit(b.queue[0], sim.factionOf(team as 0));
    timer = clock(Math.max(0, spec.time - b.prod) / rate);
  }
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
      style={{ left: at.x, top: Math.max(8, at.y) }}
      data-testid="plant-plate"
    >
      <div className="bg-field/90 px-2 py-1 text-center shadow-none">
        <p className="font-display text-xs uppercase tracking-wide text-ink">{b.name}</p>
        {timer ? <p className="font-display text-sm tabular-nums text-gold">{timer}</p> : null}
        {b.queue.length > 1 ? <p className="text-xs text-muted">+{b.queue.length - 1} in line</p> : null}
      </div>
    </div>
  );
}

function CmdTile({
  children,
  label,
  onClick,
  testId,
  armed = false,
  hot = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
  armed?: boolean;
  hot?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      className={`cmd-tile${armed ? " cmd-tile-armed" : ""}${hot ? " cmd-tile-hot" : ""}`}
    >
      {children}
    </button>
  );
}

function BarButton({
  children,
  label,
  onClick,
  testId,
  disabled,
  dense = false,
  tile = false,
  block = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
  dense?: boolean;
  tile?: boolean;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`bevel-btn flex shrink-0 items-center justify-center font-display uppercase tracking-wide disabled:text-muted ${
        block ? "h-11 min-h-11 min-w-11 flex-1 gap-1 px-2 text-xs" : dense
          ? "h-11 min-h-11 min-w-11 gap-1 px-2 text-xs"
          : tile
            ? "h-12 min-h-12 min-w-12 gap-1.5 px-2.5 text-sm"
            : "h-11 min-h-11 min-w-11 gap-1 px-3 text-xs"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
  testId,
  compact = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={`bevel-btn flex items-center justify-center ${compact ? "size-8" : "size-11"}`}
    >
      {children}
    </button>
  );
}

function Overlay({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-field/80 p-2" data-testid="match-end">
      <div className={`steel flex max-h-full w-full flex-col items-center gap-2 overflow-y-auto p-3 ${wide ? "max-w-lg" : "max-w-sm"}`}>
        <h2 data-testid="match-end-title" className="font-display text-2xl uppercase tracking-widest text-gold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Scoreboard({ sim, viewer }: { sim: Sim; viewer: number }) {
  const seats = Array.from({ length: sim.opponents + 1 }, (_, t) => t);
  const live = new Set<number>();
  for (const t of seats) if (!sim.eliminated[t]) live.add(sim.alliance[t] ?? t);
  const wonSide = live.size === 1 ? ([...live][0] ?? -1) : sim.outcome === "win" ? (sim.alliance[0] ?? 0) : -1;
  const rows = seats
    .map((t) => ({ t, card: sim.scorecard((t === 1 || t === 2 || t === 3 ? t : 0) as 0), side: sim.alliance[t] ?? t }))
    .sort(
      (a, b) =>
        Number(b.side === wonSide) - Number(a.side === wonSide) || b.card.kills - a.card.kills || b.card.razed - a.card.razed,
    );
  return (
    <div className="w-full" data-testid="scoreboard">
      <p className="mb-2 text-center font-display text-xs uppercase tracking-widest text-brass">
        {sim.mapName} · {sim.mode === "survive" ? "Survive" : "Skirmish"}
      </p>
      <div className="grid grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr_0.55fr] items-center gap-x-1 px-1 text-xs text-muted">
        <span className="font-display text-xs uppercase">Commander</span>
        <span className="text-center" title="Time lasted">
          <Timer className="mx-auto size-3.5" />
        </span>
        <span className="text-center" title="Units destroyed / lost">
          <Users className="mx-auto size-3.5" />
        </span>
        <span className="text-center" title="Buildings destroyed / lost">
          <Factory className="mx-auto size-3.5" />
        </span>
        <span className="text-center" title="Share of the match the power stayed on">
          <Zap className="mx-auto size-3.5" />
        </span>
      </div>
      {rows.map((row) => {
        const you = row.t === viewer;
        const champ = wonSide >= 0 && row.side === wonSide;
        return (
          <div
            key={row.t}
            data-testid={`score-row-${row.t}`}
            className={`mt-1 grid grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr_0.55fr] items-center gap-x-1 border px-1 py-1.5 ${you ? "border-gold bg-field" : "border-brass-dim"}`}
          >
            <div className="flex min-w-0 items-center gap-1">
              <TeamPip team={row.t} eliminated={!!sim.eliminated[row.t]} />
              {champ ? <Star className="size-3.5 shrink-0 text-gold" aria-label="Winner" /> : null}
              <span className="truncate font-display text-xs uppercase text-ink">{you ? "You" : (SEAT_NAME[row.t] ?? "Bot")}</span>
            </div>
            <span className="text-center font-display text-xs tabular-nums text-ink">{clock(row.card.lasted)}</span>
            <span className="text-center font-display text-xs tabular-nums text-ink">
              {row.card.kills}/{row.card.lost}
            </span>
            <span className="text-center font-display text-xs tabular-nums text-ink">
              {row.card.razed}/{row.card.plants}
            </span>
            <span className="text-center font-display text-xs tabular-nums text-gold">{row.card.power}%</span>
          </div>
        );
      })}
      <p className="mt-1 text-center text-xs text-pretty text-muted">
        Units and buildings are destroyed / lost. The bolt is how long power stayed on.
      </p>
    </div>
  );
}

function PauseSound() {
  return (
    <div className="flex w-full flex-col gap-2" data-testid="pause-audio">
      <p className="text-center font-display text-[10px] uppercase tracking-widest text-brass">Sound</p>
      <AudioBuses live showMute />
    </div>
  );
}


function SpeedControl({ speed, onChange, compact = false }: { speed: number; onChange: (n: number) => void; compact?: boolean }) {
  const i = Math.max(0, SPEED_STEPS.findIndex((n) => Math.abs(n - speed) < 0.01));
  const label = Number.isInteger(speed) ? `${speed}×` : `${speed}×`;
  return (
    <div className="steel-inset flex shrink-0 items-center" data-testid="game-speed">
      <button
        type="button"
        aria-label="Slower"
        data-testid="speed-down"
        disabled={i <= 0}
        onClick={() => onChange(SPEED_STEPS[Math.max(0, i - 1)])}
        className={`flex items-center justify-center font-display text-ink disabled:text-brass-dim ${compact ? "h-8 w-7 text-base" : "h-11 w-11 text-xl"}`}
      >
        −
      </button>
      <span className={`whitespace-nowrap text-center font-display tabular-nums text-gold ${compact ? "px-1 text-[11px]" : "px-2 text-sm"}`}>
        Speed {label}
      </span>
      <button
        type="button"
        aria-label="Faster"
        data-testid="speed-up"
        disabled={i >= SPEED_STEPS.length - 1}
        onClick={() => onChange(SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, i + 1)])}
        className={`flex items-center justify-center font-display text-ink disabled:text-brass-dim ${compact ? "h-8 w-7 text-base" : "h-11 w-11 text-xl"}`}
      >
        +
      </button>
    </div>
  );
}

declare global {
  interface Window {
    __viridite?: { sim: Sim | null; camera: Camera };
  }
}
