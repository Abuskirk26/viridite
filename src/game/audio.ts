/**
 * Original WebAudio score, advisor, and effects for VIRIDITE.
 * No sampled Westwood / EA audio. Three buses — Music, Voice, SFX —
 * plus a master mute that zeroes all of them (speech included).
 *
 * Music ducks while the advisor talks. The first pointer or key
 * resumes the AudioContext (mobile browsers stay silent until then)
 * and starts the menu theme if nothing else is playing.
 */

export type SfxName =
  | "select"
  | "move"
  | "attack"
  | "build"
  | "deploy"
  | "win"
  | "lose"
  | "error"
  | "place"
  | "rifle"
  | "rocket"
  | "cannon"
  | "explosion"
  | "tower"
  | "unload"
  | "harvest";

export type EvaId =
  | "constructDone"
  | "unitReady"
  | "building"
  | "funds"
  | "lowPower"
  | "baseAttack"
  | "unitLost"
  | "harvester"
  | "win"
  | "lose";

export type BarkClass = "infantry" | "vehicle" | "harvester" | "air" | "naval";
export type BarkAct = "select" | "move" | "attack";
export type BedId = "construct" | "brownout";
export type ScoreId = "menu" | "combatA" | "combatB" | "victory" | "defeat";
export type BusName = "music" | "voice" | "sfx";

export type Cue =
  | { t: "sfx"; id: SfxName; x?: number; y?: number }
  | { t: "voice"; id: EvaId }
  | { t: "bark"; cls: BarkClass; act: BarkAct }
  | { t: "bed"; id: BedId; on: boolean };

export interface Mix {
  music: number;
  voice: number;
  sfx: number;
}

/** Exact advisor copy. Short, military, and not a licensed recording. */
export const EVA_LINE: Record<EvaId, string> = {
  constructDone: "Construction complete.",
  unitReady: "Unit ready.",
  building: "Building.",
  funds: "Insufficient funds.",
  lowPower: "Low power.",
  baseAttack: "Our base is under attack.",
  unitLost: "Unit lost.",
  harvester: "Harvester under attack.",
  win: "Mission accomplished.",
  lose: "Mission failed.",
};

/** 3–4 original acknowledgements per class. Cycled, not random, so two phones can differ without touching the sim. */
export const BARKS: Record<BarkClass, Record<BarkAct, readonly string[]>> = {
  infantry: {
    select: ["Rifles up.", "Squad listening.", "Holding this spot.", "Give us a lane."],
    move: ["On the march.", "Shifting up.", "Feet moving.", "New position."],
    attack: ["Contact front.", "Pour it on.", "Shoot the line.", "They're in the open."],
  },
  vehicle: {
    select: ["Crew aboard.", "Armor set.", "Driver waiting.", "Hull is yours."],
    move: ["Rolling now.", "Treads hot.", "Taking that grid.", "Relocate."],
    attack: ["Gun on target.", "Punch through.", "Main gun free.", "Break their line."],
  },
  harvester: {
    select: ["Rig standing by.", "Crystal bay empty.", "Hauler ready.", "Where do I dig?"],
    move: ["Hauler moving.", "Taking the field road.", "Rig relocating.", "On the haul."],
    attack: ["We're unarmed.", "Can't trade shots.", "Pulling the rig clear.", "Get me an escort."],
  },
  air: {
    select: ["Blades are spinning.", "Flight deck copies.", "Sky lane open.", "Holding altitude."],
    move: ["New vector.", "Crossing the field.", "Airborne shift.", "Heading locked."],
    attack: ["Making the pass.", "Guns down.", "Run is hot.", "Target from above."],
  },
  naval: {
    select: ["Bridge copies.", "Watch is set.", "Hull on the tide.", "Helm awaiting."],
    move: ["Making way.", "New heading.", "Under engine.", "Leaving the shore."],
    attack: ["Battery free.", "Solution set.", "Firing seaward.", "Salvo on the way."],
  },
};

export const BUS_STEPS = [
  { id: "off", label: "Off", v: 0 },
  { id: "low", label: "Low", v: 0.45 },
  { id: "on", label: "On", v: 0.78 },
  { id: "loud", label: "Loud", v: 1 },
] as const;

const MIX_KEY = "viridite-audio-mix-v2";
const DEFAULT_MIX: Mix = { music: 0.78, voice: 0.78, sfx: 0.78 };

const EVA_COOL: Record<EvaId, number> = {
  constructDone: 0.8,
  unitReady: 1.4,
  building: 2.5,
  funds: 1.1,
  lowPower: 12,
  baseAttack: 9,
  unitLost: 3,
  harvester: 7,
  win: 0,
  lose: 0,
};

const EVA_PRI: Record<EvaId, number> = {
  constructDone: 0,
  unitReady: 0,
  building: 0,
  funds: 0,
  lowPower: 1,
  baseAttack: 2,
  unitLost: 0,
  harvester: 2,
  win: 3,
  lose: 3,
};

export function barkClass(kind: string): BarkClass {
  if (kind === "harvester") return "harvester";
  if (kind === "attackheli" || kind === "bomber" || kind === "chinook") return "air";
  if (kind === "gunboat" || kind === "frigate" || kind === "missile" || kind === "transport") return "naval";
  if (kind === "rifle" || kind === "rocket" || kind === "vanguard" || kind === "engineer") return "infantry";
  return "vehicle";
}

export function combatTrack(faction: string): "combatA" | "combatB" {
  return faction === "syndicate" ? "combatB" : "combatA";
}

export function nearestStep(v: number): (typeof BUS_STEPS)[number]["id"] {
  let best: (typeof BUS_STEPS)[number] = BUS_STEPS[2];
  let dist = 99;
  for (const step of BUS_STEPS) {
    const d = Math.abs(step.v - v);
    if (d < dist) {
      dist = d;
      best = step;
    }
  }
  return best.id;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function loadMix(): Mix {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_MIX };
    const raw = localStorage.getItem(MIX_KEY);
    if (!raw) return { ...DEFAULT_MIX };
    const parsed = JSON.parse(raw) as Partial<Mix>;
    return {
      music: clamp01(parsed.music ?? DEFAULT_MIX.music),
      voice: clamp01(parsed.voice ?? DEFAULT_MIX.voice),
      sfx: clamp01(parsed.sfx ?? DEFAULT_MIX.sfx),
    };
  } catch {
    return { ...DEFAULT_MIX };
  }
}

let mix: Mix = loadMix();
let muted = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicVol: GainNode | null = null;
let musicDuck: GainNode | null = null;
let trackGain: GainNode | null = null;
let voiceGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let noiseBuf: AudioBuffer | null = null;

let wanted: ScoreId | null = null;
let playing: ScoreId | null = null;
let scoreAlive = false;
let scoreGen = 0;
let scoreTimer = 0;
const drones: OscillatorNode[] = [];

const bedOn: Record<BedId, boolean> = { construct: false, brownout: false };
let constructTimer = 0;
let motor: OscillatorNode | null = null;
let brownNodes: OscillatorNode[] = [];
let brownGain: GainNode | null = null;
let brownTimer = 0;

let voiceGen = 0;
let voicePri = -1;
let voiceClosed = true;
const voiceQueue: { id: EvaId; pri: number }[] = [];
const evaAt = new Map<EvaId, number>();
const barkAt: Record<string, number> = {};
let voicePick: SpeechSynthesisVoice | null | undefined;
let speechKeep = 0;
let primedSpeech = false;
let gestureBound = false;
/** True after a real tap or key. Mobile browsers stay silent until then. */
let heardGesture = false;
let needsGesture = true;
let queuedSfx: SfxName | null = null;
let pendingLine: string | null = null;
const gateListeners = new Set<(needs: boolean) => void>();
const muteListeners = new Set<(on: boolean) => void>();

function setGate(needs: boolean) {
  if (needsGesture === needs) return;
  needsGesture = needs;
  for (const fn of gateListeners) fn(needs && !muted);
}

export function audioNeedsGesture(): boolean {
  return needsGesture && !muted;
}

export function subscribeAudioGate(fn: (needs: boolean) => void): () => void {
  gateListeners.add(fn);
  fn(audioNeedsGesture());
  return () => gateListeners.delete(fn);
}

export function isMuted(): boolean {
  return muted;
}

export function subscribeMute(fn: (on: boolean) => void): () => void {
  muteListeners.add(fn);
  fn(muted);
  return () => muteListeners.delete(fn);
}

export function getMix(): Mix {
  return { ...mix };
}

export function setMix(partial: Partial<Mix>) {
  mix = {
    music: clamp01(partial.music ?? mix.music),
    voice: clamp01(partial.voice ?? mix.voice),
    sfx: clamp01(partial.sfx ?? mix.sfx),
  };
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify(mix));
  } catch {
    /* private mode */
  }
  applyBuses();
  if (mix.voice <= 0) cancelTalk();
  if (!muted && mix.music > 0 && wanted) playScore(wanted);
}

export function setMuted(v: boolean) {
  muted = v;
  applyMaster();
  if (v) {
    cancelTalk();
    setGate(false);
  } else if (!heardGesture) setGate(true);
  else if (wanted) playScore(wanted);
  for (const fn of muteListeners) fn(muted);
}

/** Call from a tap or key. Creates and resumes the context in that gesture. */
export function unlockAudio() {
  heardGesture = true;
  const ac = ensureGraph();
  if (!ac) return;
  try {
    const buf = ac.createBuffer(1, 1, ac.sampleRate);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start();
  } catch {
    /* a suspended context may refuse the buffer until resume */
  }
  const go = () => {
    if (ac.state === "running") {
      setGate(false);
      primeSpeech();
      armSpeechKeepalive();
      if (!muted && mix.music > 0) startScore(wanted ?? "menu");
      flushSfx();
      flushVoice();
    } else setGate(true);
  };
  if (ac.state === "suspended") void ac.resume().then(go).catch(() => setGate(true));
  else go();
}

export function playScore(id: ScoreId) {
  wanted = id;
  if (muted || mix.music <= 0) return;
  if (!heardGesture) {
    setGate(true);
    return;
  }
  const ac = ensureGraph();
  if (!ac) return;
  if (ac.state !== "running") {
    void ac.resume().then(() => {
      if (wanted === id && !muted && mix.music > 0 && ac.state === "running") startScore(id);
    });
    return;
  }
  startScore(id);
}

export function stopBeds() {
  bedOn.construct = false;
  bedOn.brownout = false;
  haltConstruct();
  haltBrown();
}

export function bed(id: BedId, on: boolean) {
  if (bedOn[id] === on) return;
  bedOn[id] = on;
  ensureGraph();
  if (id === "construct") {
    if (on) startConstruct();
    else haltConstruct();
  } else if (on) startBrown();
  else haltBrown();
}

export function eva(id: EvaId) {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const cool = EVA_COOL[id] * 1000;
  const prev = evaAt.get(id) ?? -1e9;
  if (now - prev < cool) return;
  evaAt.set(id, now);
  const pri = EVA_PRI[id];
  if (!voiceClosed && pri > voicePri) {
    voiceQueue.length = 0;
    sayEva(id, pri);
    return;
  }
  if (!voiceClosed) {
    if (voiceQueue.length < 2) voiceQueue.push({ id, pri });
    return;
  }
  sayEva(id, pri);
}

export function bark(cls: BarkClass, act: BarkAct) {
  if (!voiceClosed) return;
  const lines = BARKS[cls][act];
  const key = `${cls}:${act}`;
  const i = barkAt[key] ?? 0;
  barkAt[key] = (i + 1) % lines.length;
  sayText(lines[i] ?? lines[0], 0);
}

/** Lobby tap so the voice bus is obviously alive before a battle. */
export function previewVoice() {
  sayText("Advisor online.", 0);
}

let hearX = 0;
let hearY = 0;

/** Camera center in tiles. Weapon sounds pan and fade against this. */
export function hearAt(x: number, y: number) {
  hearX = x;
  hearY = y;
}

function placed(x?: number, y?: number): { pan: number; gain: number } {
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return { pan: 0, gain: 1 };
  const dx = x - hearX;
  const dy = y - hearY;
  const dist = Math.hypot(dx, dy);
  return {
    pan: Math.max(-0.85, Math.min(0.85, dx / 14)),
    gain: Math.max(0.2, Math.min(1, 1.05 - dist / 26)),
  };
}

export function sfx(name: SfxName, x?: number, y?: number) {
  if (muted || mix.sfx <= 0) return;
  const place = placed(x, y);
  if (!ctx || ctx.state !== "running") {
    queuedSfx = name;
    if (heardGesture) unlockAudio();
    return;
  }
  playSfx(name, place.pan, place.gain);
}

function flushSfx() {
  if (!queuedSfx || !ctx || ctx.state !== "running" || muted || mix.sfx <= 0) return;
  const name = queuedSfx;
  queuedSfx = null;
  playSfx(name);
}

function playSfx(name: SfxName, pan = 0, gain = 1) {
  if (!ctx || !sfxGain) return;
  let dest: AudioNode = sfxGain;
  if (Math.abs(pan) > 0.02 || gain < 0.98) {
    const g = ctx.createGain();
    g.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    g.connect(panner);
    panner.connect(sfxGain);
    dest = g;
  }
  const now = ctx.currentTime;
  switch (name) {
    case "select":
      noiseAt(now, 0.045, 880, "bandpass", 0.1, dest);
      toneAt(now, 196, 0.07, "sawtooth", 0.1, dest);
      break;
    case "move":
      toneAt(now, 174, 0.1, "triangle", 0.16, dest);
      toneAt(now + 0.07, 220, 0.11, "triangle", 0.12, dest);
      break;
    case "attack":
      toneAt(now, 146, 0.09, "sawtooth", 0.2, dest);
      noiseAt(now, 0.05, 420, "bandpass", 0.12, dest);
      break;
    case "place":
      noiseAt(now, 0.09, 700, "bandpass", 0.4, dest);
      toneAt(now, 180, 0.09, "square", 0.32, dest);
      toneAt(now + 0.06, 90, 0.16, "triangle", 0.36, dest);
      break;
    case "build":
      noiseAt(now, 0.12, 180, "lowpass", 0.28, dest);
      toneAt(now, 110, 0.16, "sawtooth", 0.18, dest, 74);
      break;
    case "deploy":
      noiseAt(now, 0.35, 140, "lowpass", 0.5, dest);
      toneAt(now, 55, 0.42, "sawtooth", 0.55, dest);
      toneAt(now + 0.16, 110, 0.22, "square", 0.18, dest);
      toneAt(now + 0.28, 82, 0.2, "triangle", 0.22, dest);
      break;
    case "rifle":
      noiseAt(now, 0.045, 2400, "highpass", 0.42, dest);
      toneAt(now, 1680, 0.03, "square", 0.12, dest);
      break;
    case "rocket":
      sweepNoise(now, 0.28, 380, 1900, 0.42, dest);
      toneAt(now, 140, 0.18, "sawtooth", 0.16, dest);
      break;
    case "cannon":
      toneAt(now, 62, 0.22, "sine", 0.55, dest);
      noiseAt(now, 0.14, 220, "lowpass", 0.45, dest);
      toneAt(now + 0.02, 130, 0.08, "square", 0.16, dest);
      break;
    case "explosion":
      toneAt(now, 42, 0.4, "sine", 0.58, dest);
      noiseAt(now, 0.38, 160, "lowpass", 0.55, dest);
      toneAt(now, 90, 0.12, "triangle", 0.2, dest);
      break;
    case "tower":
      toneSlide(now, 1480, 420, 0.1, "square", 0.28, dest);
      noiseAt(now, 0.05, 3200, "highpass", 0.18, dest);
      break;
    case "harvest":
      toneAt(now, 96, 0.1, "triangle", 0.18, dest, 54);
      noiseAt(now, 0.08, 220, "lowpass", 0.22, dest);
      break;
    case "unload":
      noiseAt(now, 0.1, 220, "lowpass", 0.26, dest);
      toneAt(now, 128, 0.12, "triangle", 0.16, dest, 64);
      break;
    case "error":
      toneAt(now, 110, 0.12, "square", 0.3, dest);
      toneAt(now + 0.09, 92, 0.16, "square", 0.24, dest);
      break;
    case "win":
      playScore("victory");
      break;
    case "lose":
      playScore("defeat");
      break;
    default:
      break;
  }
}

export function audioSnapshot() {
  let energy = 0;
  if (analyser) {
    const bins = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(bins);
    let acc = 0;
    for (let i = 0; i < bins.length; i++) {
      const v = (bins[i] - 128) / 128;
      acc += v * v;
    }
    energy = Math.sqrt(acc / bins.length);
  }
  return {
    muted,
    state: ctx?.state ?? "none",
    track: playing,
    wanted,
    mix: { ...mix },
    energy,
    beds: { ...bedOn },
  };
}

export function handleCue(c: Cue) {
  if (c.t === "sfx") sfx(c.id, c.x, c.y);
  else if (c.t === "voice") eva(c.id);
  else if (c.t === "bark") bark(c.cls, c.act);
  else bed(c.id, c.on);
}

if (typeof window !== "undefined") {
  const kick = () => unlockAudio();
  if (!gestureBound) {
    gestureBound = true;
    window.addEventListener("pointerdown", kick, true);
    window.addEventListener("keydown", kick, true);
  }
  (window as unknown as { __viriditeAudio?: typeof audioSnapshot }).__viriditeAudio = audioSnapshot;
}

function ensureGraph(): AudioContext | null {
  const AC =
    typeof window !== "undefined"
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    buildGraph(ctx);
  }
  return ctx;
}

function buildGraph(ac: AudioContext) {
  master = ac.createGain();
  master.gain.value = muted ? 0 : 1;
  musicVol = ac.createGain();
  musicVol.gain.value = mix.music;
  musicDuck = ac.createGain();
  musicDuck.gain.value = 1;
  trackGain = ac.createGain();
  trackGain.gain.value = 1;
  voiceGain = ac.createGain();
  voiceGain.gain.value = mix.voice;
  sfxGain = ac.createGain();
  sfxGain.gain.value = mix.sfx;

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 2;
  comp.attack.value = 0.005;
  comp.release.value = 0.25;

  const makeup = ac.createGain();
  makeup.gain.value = 1.6;

  const wet = ac.createGain();
  wet.gain.value = 0.2;
  const delay = ac.createDelay();
  delay.delayTime.value = 0.17;
  const damp = ac.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2400;
  const fb = ac.createGain();
  fb.gain.value = 0.26;

  trackGain.connect(musicVol);
  trackGain.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  damp.connect(wet);
  wet.connect(musicVol);
  musicVol.connect(musicDuck);
  musicDuck.connect(master);
  voiceGain.connect(master);
  sfxGain.connect(master);
  master.connect(comp);
  comp.connect(makeup);
  makeup.connect(ac.destination);
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  makeup.connect(analyser);
}

function applyMaster() {
  if (!master || !ctx) return;
  master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
}

function applyBuses() {
  if (!ctx || !musicVol || !voiceGain || !sfxGain) return;
  const now = ctx.currentTime;
  musicVol.gain.setValueAtTime(mix.music, now);
  voiceGain.gain.setValueAtTime(mix.voice, now);
  sfxGain.gain.setValueAtTime(mix.sfx, now);
}

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function toneAt(time: number, freq: number, dur: number, type: OscillatorType, peak: number, dest: AudioNode, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(freq < 180 ? 480 : 3200, time);
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), time + dur);
  const end = time + Math.max(0.04, dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), time + Math.min(0.012, dur * 0.4));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  o.connect(f);
  f.connect(g);
  g.connect(dest);
  o.start(time);
  o.stop(end + 0.02);
}

function toneSlide(time: number, from: number, to: number, dur: number, type: OscillatorType, peak: number, dest: AudioNode) {
  toneAt(time, from, dur, type, peak, dest, to);
}

function noiseBuffer(): AudioBuffer | null {
  if (!ctx) return null;
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = Math.floor(ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let s = 1;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    data[i] = s / 2147483647 * 2 - 1;
  }
  noiseBuf = buf;
  return buf;
}

function noiseAt(time: number, dur: number, freq: number, type: BiquadFilterType, peak: number, dest: AudioNode) {
  if (!ctx) return;
  const buf = noiseBuffer();
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(Math.max(40, freq), time);
  f.Q.value = type === "bandpass" ? 0.8 : 0.7;
  const g = ctx.createGain();
  const end = time + Math.max(0.04, dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), time + Math.min(0.01, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(time);
  src.stop(end + 0.02);
}

function sweepNoise(time: number, dur: number, from: number, to: number, peak: number, dest: AudioNode) {
  if (!ctx) return;
  const buf = noiseBuffer();
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.7;
  f.frequency.setValueAtTime(from, time);
  f.frequency.exponentialRampToValueAtTime(to, time + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), time + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(time);
  src.stop(time + dur + 0.02);
}

interface NoteEv {
  s: number;
  midi: number;
  d: number;
  wave: OscillatorType;
  v: number;
}
interface DrumEv {
  s: number;
  k: "kick" | "snare" | "hat" | "tom";
  v: number;
}
interface Score {
  bpm: number;
  steps: number;
  loop: boolean;
  drone?: number;
  notes: NoteEv[];
  drums: DrumEv[];
}

/** Original beds. Long brass and low strings, not short beeps. Menu is slow and minor. Combat A marches. Combat B stays tense. */
const SCORES: Record<ScoreId, Score> = {
  menu: {
    bpm: 72,
    steps: 64,
    loop: true,
    drone: 41,
    notes: [
      { s: 0, midi: 41, d: 16, wave: "triangle", v: 0.22 },
      { s: 0, midi: 48, d: 16, wave: "triangle", v: 0.12 },
      { s: 16, midi: 36, d: 16, wave: "sawtooth", v: 0.18 },
      { s: 16, midi: 43, d: 16, wave: "triangle", v: 0.12 },
      { s: 32, midi: 38, d: 16, wave: "triangle", v: 0.2 },
      { s: 32, midi: 45, d: 16, wave: "triangle", v: 0.11 },
      { s: 48, midi: 41, d: 16, wave: "sawtooth", v: 0.2 },
      { s: 48, midi: 48, d: 16, wave: "triangle", v: 0.12 },
      { s: 0, midi: 65, d: 8, wave: "sawtooth", v: 0.12 },
      { s: 8, midi: 68, d: 8, wave: "triangle", v: 0.14 },
      { s: 16, midi: 63, d: 10, wave: "sawtooth", v: 0.12 },
      { s: 28, midi: 60, d: 8, wave: "triangle", v: 0.12 },
      { s: 36, midi: 63, d: 8, wave: "sawtooth", v: 0.13 },
      { s: 48, midi: 68, d: 10, wave: "triangle", v: 0.14 },
      { s: 58, midi: 65, d: 6, wave: "sawtooth", v: 0.12 },
    ],
    drums: [
      { s: 0, k: "kick", v: 0.45 },
      { s: 16, k: "kick", v: 0.4 },
      { s: 32, k: "tom", v: 0.32 },
      { s: 48, k: "kick", v: 0.48 },
    ],
  },
  combatA: {
    bpm: 132,
    steps: 64,
    loop: true,
    drone: 33,
    notes: [
      ...[0, 16, 32, 48].flatMap((b, i) => [
        { s: b, midi: 33, d: 8, wave: "sawtooth" as const, v: 0.26 },
        { s: b + 8, midi: i === 2 ? 31 : 28, d: 4, wave: "sawtooth" as const, v: 0.24 },
        { s: b + 12, midi: 33, d: 4, wave: "sawtooth" as const, v: 0.24 },
      ]),
      { s: 0, midi: 45, d: 16, wave: "triangle", v: 0.1 },
      { s: 16, midi: 48, d: 16, wave: "triangle", v: 0.1 },
      { s: 32, midi: 43, d: 16, wave: "triangle", v: 0.1 },
      { s: 48, midi: 45, d: 16, wave: "triangle", v: 0.1 },
      { s: 0, midi: 57, d: 6, wave: "sawtooth", v: 0.15 },
      { s: 0, midi: 64, d: 6, wave: "sawtooth", v: 0.11 },
      { s: 8, midi: 69, d: 6, wave: "triangle", v: 0.16 },
      { s: 16, midi: 67, d: 6, wave: "sawtooth", v: 0.15 },
      { s: 24, midi: 64, d: 8, wave: "triangle", v: 0.16 },
      { s: 32, midi: 60, d: 6, wave: "sawtooth", v: 0.14 },
      { s: 40, midi: 64, d: 6, wave: "triangle", v: 0.16 },
      { s: 48, midi: 67, d: 8, wave: "sawtooth", v: 0.15 },
      { s: 56, midi: 69, d: 8, wave: "triangle", v: 0.17 },
    ],
    drums: [0, 16, 32, 48].flatMap((b) => [
      { s: b, k: "kick" as const, v: 0.72 },
      { s: b + 4, k: "snare" as const, v: 0.48 },
      { s: b + 8, k: "kick" as const, v: 0.62 },
      { s: b + 12, k: "snare" as const, v: 0.5 },
      { s: b + 14, k: "tom" as const, v: 0.28 },
    ]),
  },
  combatB: {
    bpm: 90,
    steps: 64,
    loop: true,
    drone: 34,
    notes: [
      { s: 0, midi: 34, d: 12, wave: "sawtooth", v: 0.24 },
      { s: 16, midi: 29, d: 12, wave: "triangle", v: 0.22 },
      { s: 32, midi: 34, d: 10, wave: "sawtooth", v: 0.24 },
      { s: 44, midi: 31, d: 8, wave: "triangle", v: 0.2 },
      { s: 52, midi: 34, d: 12, wave: "sawtooth", v: 0.22 },
      { s: 0, midi: 58, d: 10, wave: "triangle", v: 0.12 },
      { s: 12, midi: 61, d: 8, wave: "sine", v: 0.1 },
      { s: 24, midi: 63, d: 10, wave: "triangle", v: 0.12 },
      { s: 36, midi: 58, d: 8, wave: "sine", v: 0.1 },
      { s: 48, midi: 56, d: 12, wave: "triangle", v: 0.12 },
      { s: 0, midi: 46, d: 32, wave: "triangle", v: 0.08 },
      { s: 32, midi: 41, d: 32, wave: "triangle", v: 0.08 },
    ],
    drums: [
      { s: 0, k: "kick", v: 0.55 },
      { s: 8, k: "kick", v: 0.32 },
      { s: 16, k: "snare", v: 0.36 },
      { s: 24, k: "tom", v: 0.3 },
      { s: 32, k: "kick", v: 0.58 },
      { s: 40, k: "kick", v: 0.28 },
      { s: 48, k: "snare", v: 0.4 },
      { s: 56, k: "tom", v: 0.42 },
    ],
  },
  victory: {
    bpm: 108,
    steps: 32,
    loop: false,
    notes: [
      { s: 0, midi: 36, d: 8, wave: "sawtooth", v: 0.26 },
      { s: 8, midi: 43, d: 8, wave: "sawtooth", v: 0.26 },
      { s: 16, midi: 48, d: 14, wave: "triangle", v: 0.28 },
      { s: 0, midi: 60, d: 6, wave: "sawtooth", v: 0.16 },
      { s: 6, midi: 64, d: 6, wave: "triangle", v: 0.16 },
      { s: 12, midi: 67, d: 6, wave: "sawtooth", v: 0.16 },
      { s: 18, midi: 72, d: 12, wave: "triangle", v: 0.18 },
    ],
    drums: [
      { s: 0, k: "kick", v: 0.6 },
      { s: 8, k: "snare", v: 0.45 },
      { s: 16, k: "kick", v: 0.65 },
      { s: 24, k: "tom", v: 0.4 },
    ],
  },
  defeat: {
    bpm: 64,
    steps: 40,
    loop: false,
    notes: [
      { s: 0, midi: 33, d: 16, wave: "sawtooth", v: 0.24 },
      { s: 16, midi: 29, d: 22, wave: "triangle", v: 0.22 },
      { s: 0, midi: 57, d: 10, wave: "triangle", v: 0.14 },
      { s: 10, midi: 53, d: 10, wave: "sine", v: 0.12 },
      { s: 20, midi: 50, d: 10, wave: "triangle", v: 0.12 },
      { s: 30, midi: 45, d: 10, wave: "sawtooth", v: 0.12 },
    ],
    drums: [
      { s: 0, k: "kick", v: 0.4 },
      { s: 16, k: "tom", v: 0.32 },
      { s: 32, k: "kick", v: 0.28 },
    ],
  },
};

export function scoreHasBody(id: ScoreId): boolean {
  const s = SCORES[id];
  return s.notes.length >= 6 && s.steps >= 16 && (id === "victory" || id === "defeat" ? !s.loop : s.loop);
}

function startScore(id: ScoreId) {
  if (!ctx || !trackGain) return;
  if (playing === id && scoreAlive) return;
  const had = playing;
  playing = id;
  scoreAlive = true;
  scoreGen += 1;
  const gen = scoreGen;
  if (scoreTimer) {
    clearInterval(scoreTimer);
    scoreTimer = 0;
  }
  stopDrone();
  const now = ctx.currentTime;
  if (!had) {
    trackGain.gain.cancelScheduledValues(now);
    trackGain.gain.setValueAtTime(1, now);
    armScore(id, gen);
    return;
  }
  trackGain.gain.cancelScheduledValues(now);
  trackGain.gain.setValueAtTime(Math.max(0.0001, trackGain.gain.value), now);
  trackGain.gain.linearRampToValueAtTime(0.0001, now + 0.18);
  window.setTimeout(() => {
    if (gen !== scoreGen || !ctx || !trackGain) return;
    const t = ctx.currentTime;
    trackGain.gain.cancelScheduledValues(t);
    trackGain.gain.setValueAtTime(0.0001, t);
    trackGain.gain.linearRampToValueAtTime(1, t + 0.28);
    armScore(id, gen);
  }, 190);
}

function armScore(id: ScoreId, gen: number) {
  const score = SCORES[id];
  if (!ctx) return;
  stopDrone();
  if (score.drone) startDrone(score.drone);
  let step = 0;
  let next = ctx.currentTime + 0.04;
  const stepDur = 60 / score.bpm / 4;
  const run = () => {
    if (gen !== scoreGen || !ctx) return;
    if (muted || mix.music <= 0) {
      next = ctx.currentTime + 0.05;
      return;
    }
    if (next < ctx.currentTime - 0.05) next = ctx.currentTime + 0.02;
    const horizon = ctx.currentTime + 0.3;
    let guard = 0;
    while (next < horizon && guard < 64) {
      guard += 1;
      fireStep(score, step, next);
      step += 1;
      next += stepDur;
      if (step >= score.steps) {
        if (!score.loop) {
          if (scoreTimer) {
            clearInterval(scoreTimer);
            scoreTimer = 0;
          }
          return;
        }
        step = 0;
      }
    }
  };
  run();
  scoreTimer = window.setInterval(run, 50);
}

function fireStep(score: Score, step: number, time: number) {
  if (!trackGain || !ctx) return;
  const stepDur = 60 / score.bpm / 4;
  for (const n of score.notes) {
    if (n.s !== step || n.v <= 0) continue;
    playTone(time, n.midi, Math.max(0.05, n.d * stepDur * 0.92), n.wave, Math.min(0.72, n.v * 1.7), trackGain);
  }
  for (const d of score.drums) {
    if (d.s !== step) continue;
    drum(d.k, time, d.v, trackGain);
  }
}

function playTone(time: number, midi: number, dur: number, wave: OscillatorType, vel: number, dest: AudioNode) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  const open = midi < 48 ? 480 : midi < 64 ? 1280 : 1700;
  const closed = Math.max(80, open * 0.28);
  f.frequency.setValueAtTime(closed, time);
  f.frequency.exponentialRampToValueAtTime(open, time + Math.min(0.16, Math.max(0.04, dur * 0.22)));
  f.Q.value = 0.85;
  o.type = wave;
  o2.type = wave === "sine" ? "triangle" : wave;
  const hz = midiHz(midi);
  o.frequency.setValueAtTime(hz, time);
  o2.frequency.setValueAtTime(hz, time);
  o2.detune.setValueAtTime(8, time);
  const end = time + Math.max(0.12, dur);
  const attack = Math.min(0.07, Math.max(0.02, dur * 0.14));
  const release = Math.min(0.26, Math.max(0.08, dur * 0.26));
  const sustainAt = Math.min(end - 0.02, Math.max(time + attack + 0.03, end - release));
  const peak = Math.max(0.001, vel);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.linearRampToValueAtTime(peak * 0.82, sustainAt);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  const body = ctx.createGain();
  body.gain.value = 0.68;
  const twin = ctx.createGain();
  twin.gain.value = 0.36;
  o.connect(body);
  o2.connect(twin);
  body.connect(f);
  twin.connect(f);
  f.connect(g);
  g.connect(dest);
  o.start(time);
  o2.start(time);
  o.stop(end + 0.03);
  o2.stop(end + 0.03);
}

function drum(kind: DrumEv["k"], time: number, vel: number, dest: AudioNode) {
  if (kind === "kick") {
    toneAt(time, 140, 0.16, "sine", vel * 0.95, dest, 42);
    toneAt(time, 52, 0.22, "sine", vel * 0.8, dest);
  } else if (kind === "snare") {
    noiseAt(time, 0.16, 1400, "bandpass", vel * 0.5, dest);
    toneAt(time, 168, 0.1, "triangle", vel * 0.32, dest, 90);
  } else if (kind === "tom") {
    toneAt(time, 220, 0.18, "sine", vel * 0.7, dest, 70);
  } else {
    noiseAt(time, 0.03, 5000, "highpass", vel * 0.28, dest);
  }
}

function startDrone(midi: number) {
  if (!ctx || !trackGain) return;
  for (const det of [0, 8]) {
    const o = ctx.createOscillator();
    o.type = det === 0 ? "triangle" : "sine";
    o.frequency.value = midiHz(midi);
    o.detune.value = det;
    const g = ctx.createGain();
    g.gain.value = det === 0 ? 0.16 : 0.08;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    o.connect(f);
    f.connect(g);
    g.connect(trackGain);
    o.start();
    drones.push(o);
  }
}

function stopDrone() {
  for (const o of drones) {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  }
  drones.length = 0;
}

function sayEva(id: EvaId, pri: number) {
  sayText(EVA_LINE[id], pri);
}

function flushVoice() {
  if (!pendingLine || !ctx || ctx.state !== "running" || muted || mix.voice <= 0) return;
  const text = pendingLine;
  pendingLine = null;
  sayText(text, 0);
}

function sayText(text: string, pri: number) {
  if (muted || mix.voice <= 0) {
    voiceClosed = true;
    voicePri = -1;
    return;
  }
  if (!ctx || ctx.state !== "running") {
    pendingLine = text;
    voiceClosed = true;
    if (heardGesture) unlockAudio();
    return;
  }
  voiceGen += 1;
  const gen = voiceGen;
  voicePri = pri;
  voiceClosed = false;
  duck(true);
  if (voiceGain && ctx && ctx.state === "running") {
    noiseAt(ctx.currentTime, 0.04, 480, "bandpass", 0.08, voiceGain);
    toneAt(ctx.currentTime, 146, 0.08, "sawtooth", 0.1, voiceGain);
  }
  const dur = ctx && ctx.state === "running" ? formantPhrase(text) : 0.6;
  let started = false;
  let closed = false;
  const finish = () => {
    if (closed || gen !== voiceGen) return;
    closed = true;
    voiceClosed = true;
    voicePri = -1;
    duck(false);
    const next = voiceQueue.shift();
    if (next && !muted && mix.voice > 0) sayEva(next.id, next.pri);
  };
  const spoken = trySpeech(text, () => {
    started = true;
  }, finish);
  if (!spoken) {
    window.setTimeout(finish, Math.max(500, dur * 1000 + 80));
    return;
  }
  window.setTimeout(() => {
    if (gen !== voiceGen || started || muted) return;
    if (ctx && ctx.state === "running") formantPhrase(text);
  }, 420);
  window.setTimeout(() => {
    if (gen === voiceGen) finish();
  }, 5200);
}

function trySpeech(text: string, onStart: () => void, onEnd: () => void): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.volume = clamp01(mix.voice);
    u.rate = 0.98;
    u.pitch = 0.74;
    u.lang = "en-US";
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.onstart = () => onStart();
    u.onend = () => onEnd();
    u.onerror = () => onEnd();
    const gen = voiceGen;
    window.speechSynthesis.cancel();
    window.setTimeout(() => {
      if (gen !== voiceGen || muted || mix.voice <= 0) return;
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(u);
      } catch {
        onEnd();
      }
    }, 30);
    return true;
  } catch {
    return false;
  }
}

function cancelTalk() {
  voiceGen += 1;
  voiceQueue.length = 0;
  pendingLine = null;
  voiceClosed = true;
  voicePri = -1;
  duck(false);
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* no speech */
  }
}

function duck(on: boolean) {
  if (!musicDuck || !ctx) return;
  const now = ctx.currentTime;
  const current = musicDuck.gain.value;
  musicDuck.gain.cancelScheduledValues(now);
  musicDuck.gain.setValueAtTime(Math.max(0.0001, current), now);
  musicDuck.gain.linearRampToValueAtTime(on ? 0.24 : 1, now + (on ? 0.06 : 0.4));
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (voicePick) return voicePick;
  const list = window.speechSynthesis.getVoices();
  if (!list.length) return null;
  const en = list.filter((v) => /^en/i.test(v.lang));
  const pool = en.length ? en : list;
  const male = pool.find((v) => /male|david|daniel|alex|fred|aaron|ralph|rishi|gordon/i.test(v.name) && !/female|samantha|victoria|zira|susan|karen/i.test(v.name));
  voicePick = male ?? pool[0] ?? null;
  return voicePick;
}

function primeSpeech() {
  if (primedSpeech || typeof window === "undefined" || !window.speechSynthesis) return;
  primedSpeech = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0.01;
    u.rate = 2;
    window.speechSynthesis.speak(u);
  } catch {
    primedSpeech = false;
  }
  window.speechSynthesis.onvoiceschanged = () => {
    voicePick = undefined;
  };
}

function armSpeechKeepalive() {
  if (speechKeep || typeof window === "undefined" || !window.speechSynthesis) return;
  speechKeep = window.setInterval(() => {
    const s = window.speechSynthesis;
    if (!s || !s.speaking || s.paused) return;
    s.pause();
    s.resume();
  }, 8000);
}

const VOWEL: Record<string, [number, number]> = {
  a: [760, 1200],
  e: [440, 2100],
  i: [300, 2500],
  o: [500, 880],
  u: [340, 760],
  y: [320, 2200],
};

/** Robotic fallback if the speech engine never starts. Rhythm follows the vowels in the line. */
function formantPhrase(text: string): number {
  if (!ctx || !voiceGain) return 0.4;
  const hits: { f1: number; f2: number }[] = [];
  const re = /[aeiouy]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const ch = m[0][0]?.toLowerCase() ?? "a";
    const pair = VOWEL[ch] ?? VOWEL.a;
    hits.push({ f1: pair[0], f2: pair[1] });
  }
  if (!hits.length) hits.push({ f1: 500, f2: 1400 });
  let t = ctx.currentTime + 0.05;
  const t0 = t;
  for (const hit of hits) {
    formantAt(t, hit.f1, hit.f2, 0.12);
    t += 0.115;
  }
  return t - t0;
}

function formantAt(time: number, f1: number, f2: number, dur: number) {
  if (!ctx || !voiceGain) return;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(118, time);
  const a = ctx.createBiquadFilter();
  a.type = "bandpass";
  a.frequency.value = f1;
  a.Q.value = 7;
  const b = ctx.createBiquadFilter();
  b.type = "bandpass";
  b.frequency.value = f2;
  b.Q.value = 9;
  const g1 = ctx.createGain();
  const g2 = ctx.createGain();
  g1.gain.value = 0.2;
  g2.gain.value = 0.14;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(0.9, time + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(a);
  o.connect(b);
  a.connect(g1);
  b.connect(g2);
  g1.connect(env);
  g2.connect(env);
  env.connect(voiceGain);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function startConstruct() {
  if (!ctx || !sfxGain || motor) return;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = 68;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 220;
  const amp = ctx.createGain();
  amp.gain.value = 0.14;
  o.connect(f);
  f.connect(amp);
  amp.connect(sfxGain);
  o.start();
  motor = o;
  const hit = () => {
    if (!ctx || !sfxGain || muted) return;
    noiseAt(ctx.currentTime, 0.1, 160, "lowpass", 0.32, sfxGain);
    toneAt(ctx.currentTime, 78, 0.12, "sine", 0.22, sfxGain, 40);
  };
  hit();
  constructTimer = window.setInterval(hit, 520);
}

function haltConstruct() {
  if (constructTimer) {
    clearInterval(constructTimer);
    constructTimer = 0;
  }
  try {
    motor?.stop();
  } catch {
    /* stopped */
  }
  motor = null;
}

function startBrown() {
  if (!ctx || !sfxGain || brownNodes.length) return;
  brownGain = ctx.createGain();
  brownGain.gain.value = 0.14;
  brownGain.connect(sfxGain);
  for (const freq of [49, 52, 98]) {
    const o = ctx.createOscillator();
    o.type = freq > 90 ? "square" : "sine";
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = freq > 90 ? 0.04 : 0.2;
    o.connect(g);
    g.connect(brownGain);
    o.start();
    brownNodes.push(o);
  }
  const wobble = () => {
    if (!ctx || !brownGain) return;
    const t = ctx.currentTime;
    brownGain.gain.cancelScheduledValues(t);
    brownGain.gain.setValueAtTime(Math.max(0.04, brownGain.gain.value), t);
    brownGain.gain.linearRampToValueAtTime(0.2, t + 0.45);
    brownGain.gain.linearRampToValueAtTime(0.07, t + 0.95);
  };
  wobble();
  brownTimer = window.setInterval(wobble, 1000);
}

function haltBrown() {
  if (brownTimer) {
    clearInterval(brownTimer);
    brownTimer = 0;
  }
  for (const o of brownNodes) {
    try {
      o.stop();
    } catch {
      /* stopped */
    }
  }
  brownNodes = [];
  brownGain = null;
}

/** Used by tests to prove both combat beds and the menu theme actually contain notes. */
export const SCORE_IDS: ScoreId[] = ["menu", "combatA", "combatB", "victory", "defeat"];
