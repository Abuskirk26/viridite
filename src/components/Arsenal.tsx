import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import {
  BUILDINGS,
  BUILD_ORDER,
  FACTION_BLURB,
  FACTION_COLOR,
  FACTION_HUE,
  FACTION_IDS,
  FACTION_NAME,
  UNIT_ORDER,
  canBuild,
  canTrain,
  plateSpin,
  resolveBuilding,
  resolveUnit,
  type BuildingId,
  type FactionId,
  type ResolvedBuilding,
  type ResolvedUnit,
  type UnitId,
} from "@/game/data";
import { FACTIONS } from "@/game/lobby";
import { FACTION_SWATCH } from "@/components/faction-style";

const STRUCTURES: BuildingId[] = ["yard", ...BUILD_ORDER];

const TRAIN_AT: Record<string, string> = {
  barracks: "Barracks",
  factory: "War Factory",
  dock: "Dock",
  helipad: "Helipad",
};

const cache = new Map<string, HTMLImageElement>();

function loadCached(src: string, onload: () => void): void {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    cache.set(src, img);
  }
  if (img.complete && img.naturalWidth > 0) onload();
  else img.addEventListener("load", onload, { once: true });
}

function ready(src: string): HTMLImageElement | null {
  const img = cache.get(src);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

function artFiles(kind: "unit" | "building", id: string): string[] {
  if (kind === "unit") {
    if (id === "rocket") return ["/art/rocket.png"];
    if (id === "rifle" || id === "engineer" || id === "vanguard") return ["/art/infantry.png"];
    if (id === "harvester") return ["/art/harvester.png"];
    if (id === "gunboat" || id === "frigate" || id === "missile" || id === "transport") return ["/art/boat.png"];
    if (id === "chinook" || id === "attackheli" || id === "bomber") return ["/art/heli.png"];
    if (id === "tank" || id === "medium" || id === "artillery") return ["/art/hull.png", "/art/turret.png"];
    return ["/art/hull.png"];
  }
  if (id === "yard") return ["/art/yard.png"];
  if (id === "power" || id === "advpower") return ["/art/power.png"];
  if (id === "barracks" || id === "stealth") return ["/art/barracks.png"];
  if (id === "factory" || id === "dock" || id === "helipad") return ["/art/factory.png"];
  if (id === "tower" || id === "aa" || id === "radar") return ["/art/tower.png"];
  if (id === "refinery" || id === "silo") return ["/art/refinery.png"];
  return [];
}

function paintCard(ctx: CanvasRenderingContext2D, files: string[], color: string, mark: string) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(0, 0, w, h);
  const sand = ready("/art/sand.png");
  if (sand) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(sand, 0, 0, w, h);
    ctx.restore();
    ctx.fillStyle = "rgba(12, 10, 8, 0.35)";
    ctx.fillRect(0, 0, w, h);
  }
  if (mark === "wall" || mark === "sandbag" || mark === "gate") {
    paintFence(ctx, mark, color, w, h);
  } else {
    const sprites = files.map(ready).filter((img): img is HTMLImageElement => !!img);
    if (!sprites.length) {
      ctx.fillStyle = color;
      ctx.fillRect(w * 0.3, h * 0.26, w * 0.4, h * 0.38);
    } else {
      const spin = plateSpin(color);
      sprites.forEach((img, i) => {
        const scale = i === 0 ? 0.7 : 0.38;
        const dw = Math.min(w, h) * scale;
        const dh = dw * (img.height / Math.max(1, img.width));
        ctx.save();
        ctx.filter = `hue-rotate(${spin.toFixed(0)}deg) saturate(1.55) contrast(1.08)`;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 - 10, dw, dh);
        ctx.restore();
      });
    }
    paintMark(ctx, mark, color, w, h);
  }
  ctx.fillStyle = "#140e0a";
  ctx.fillRect(0, h - 18, w, 18);
  ctx.fillStyle = color;
  ctx.fillRect(0, h - 14, w, 10);
}

function paintFence(ctx: CanvasRenderingContext2D, mark: string, color: string, w: number, h: number) {
  const x = w * 0.18;
  const y = h * 0.34;
  const bw = w * 0.64;
  const bh = h * 0.28;
  if (mark === "sandbag") {
    ctx.fillStyle = "#8a5a32";
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = "#c4a078";
    ctx.fillRect(x, y, bw, bh * 0.18);
  } else {
    ctx.fillStyle = mark === "gate" ? "#8d8882" : "#b0aaa4";
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = "#e4dfd8";
    ctx.fillRect(x, y, bw, bh * 0.12);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + bh * 0.42, bw, bh * 0.16);
  }
  if (mark === "gate") {
    ctx.fillStyle = "#242220";
    ctx.fillRect(x, y - 6, 14, bh + 12);
    ctx.fillRect(x + bw - 14, y - 6, 14, bh + 12);
  }
}

function paintMark(ctx: CanvasRenderingContext2D, mark: string, color: string, w: number, h: number) {
  ctx.save();
  ctx.translate(w * 0.72, h * 0.22);
  ctx.strokeStyle = "#f3ead7";
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  if (mark === "aa") {
    ctx.beginPath();
    ctx.moveTo(-18, 16);
    ctx.lineTo(10, -18);
    ctx.moveTo(-8, 16);
    ctx.lineTo(20, -18);
    ctx.stroke();
  } else if (mark === "radar") {
    ctx.beginPath();
    ctx.arc(0, 8, 22, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(0, 28);
    ctx.stroke();
  } else if (mark === "stealth") {
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(18, 8);
    ctx.lineTo(0, 32);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.stroke();
  } else if (mark === "helipad") {
    ctx.beginPath();
    ctx.arc(0, 6, 24, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mark === "dock") {
    ctx.fillStyle = "#6aa4d0";
    ctx.fillRect(-28, 18, 56, 14);
  } else if (mark === "silo") {
    ctx.fillStyle = "#c6a56a";
    ctx.fillRect(-10, -8, 20, 36);
  } else if (mark === "advpower") {
    ctx.beginPath();
    ctx.arc(16, 20, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (mark === "engineer") {
    ctx.fillStyle = "#e4c15a";
    ctx.fillRect(-16, -6, 32, 8);
  }
  ctx.restore();
}

function Portrait({ files, color, mark, large }: { files: string[]; color: string; mark: string; large?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = files.join("|");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let dead = false;
    const bump = () => {
      if (!dead) setTick((n) => n + 1);
    };
    const list = key ? key.split("|") : [];
    loadCached("/art/sand.png", bump);
    for (const src of list) loadCached(src, bump);
    return () => {
      dead = true;
    };
  }, [key]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    paintCard(ctx, key ? key.split("|") : [], color, mark);
  }, [tick, key, color, mark]);
  return (
    <canvas
      ref={ref}
      width={320}
      height={200}
      className={`block w-full bg-well ${large ? "aspect-video h-auto" : "aspect-video h-auto"}`}
    />
  );
}

function ownersOf(kind: "unit" | "building", id: UnitId | BuildingId): FactionId[] {
  return FACTION_IDS.filter((f) => (kind === "unit" ? canTrain(id as UnitId, f) : canBuild(id as BuildingId, f)));
}

function pace(speed: number): string {
  if (speed >= 4.2) return "Very fast";
  if (speed >= 3) return "Fast";
  if (speed >= 2) return "Medium";
  if (speed >= 1.3) return "Slow";
  return "Very slow";
}

function bestTarget(u: ResolvedUnit): string {
  if (u.damage <= 0) return "No weapon.";
  const rows: [string, number][] = [
    ["infantry", u.vsInf],
    ["vehicles", u.vsVeh],
    ["buildings", u.vsBld],
  ];
  if ((u.vsAir ?? 0) > 0) rows.push(["aircraft", u.vsAir ?? 0]);
  rows.sort((a, b) => b[1] - a[1]);
  const top = rows[0];
  if (!top || top[1] <= 1) return "Even hits against most targets.";
  return `The shot is worth the most against ${top[0]}.`;
}

function unitLine(u: ResolvedUnit): string {
  if (u.id === "mcv") return "Deploys into a Construction Yard. The match ends if the yard is gone and no MCV is left.";
  if (u.id === "harvester") return `No gun. Pulls crystal into a ${u.cargo} bay and dumps it at a refinery.`;
  if (u.id === "engineer") return "Unarmed infantry sent to capture and repair.";
  if (u.stealth) return "Hidden until it fires. The Syndicate scout.";
  const loco = u.loco === "air" ? "Aircraft" : u.loco === "sea" ? "Ship" : u.armor === "infantry" ? "Infantry" : "Vehicle";
  const air = u.hitsAir || (u.vsAir ?? 0) > 0 ? " Can hit aircraft." : "";
  const rearm = u.magazine ? " Returns to a pad to rearm." : "";
  return `${loco}. ${bestTarget(u)}${air}${rearm}`;
}

function buildingLine(b: ResolvedBuilding): string {
  if (b.id === "yard") return "The base. Lose it with no MCV left and the match is over.";
  if (b.trains === "infantry") return "Trains infantry.";
  if (b.trains === "vehicle") return "Trains vehicles, including the harvester and the MCV.";
  if (b.trains === "navy") return "Trains ships. Has to sit on a shore.";
  if (b.trains === "air") return "Trains aircraft and rearms the ones that land.";
  if (b.powerOut > 0) return `Feeds the base ${b.powerOut} power.`;
  if (b.special === "aa") return "Shoots aircraft. Goes dark when power is low.";
  if (b.special === "radar") return "Clears fog in a wide ring. Syndicate and Prism only.";
  if (b.special === "stealth") return "Cloaks nearby friendlies while it has power. Syndicate and Prism only.";
  if (b.id === "tower") return "A standing gun. Concord and Steel towers hit harder and see farther.";
  if (b.id === "refinery") return "Harvesters dump crystal here.";
  if (b.id === "supply") return "Drips war material every second while the base has power. Build two early.";
  if (b.id === "silo") return "A small credit drip while the base has power. It does not cap storage.";
  if (b.id === "wall" || b.id === "gate" || b.id === "sandbag") return "A fence. Steel pours thicker concrete, gates, and sandbags.";
  return b.name;
}

function StatBar({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone: "hp" | "atk" | "spd" }) {
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  const fill = tone === "hp" ? "bg-crystal" : tone === "atk" ? "bg-danger" : "bg-brass";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-display text-[10px] uppercase tracking-wide text-brass">{label}</span>
      <div className="h-2.5 min-w-0 flex-1 bg-well">
        <div className={`h-full ${fill}`} style={{ width: `${value > 0 ? pct : 0}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-display text-xs tabular-nums text-ink">{text}</span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-brass-dim bg-well px-2 py-1.5">
      <div className="font-display text-[10px] uppercase tracking-wide text-brass">{label}</div>
      <div className="font-display text-sm text-pretty text-ink">{value}</div>
    </div>
  );
}

function Worth({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-brass-dim py-1">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-display text-sm tabular-nums text-gold">{n}</span>
    </div>
  );
}

type Pick = { kind: "unit"; id: UnitId } | { kind: "building"; id: BuildingId };

export function Arsenal({
  faction,
  onFaction,
  onBack,
}: {
  faction: FactionId;
  onFaction?: (id: FactionId) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"troops" | "buildings">("troops");
  const [pick, setPick] = useState<Pick | null>(null);
  const [local, setLocal] = useState(faction);
  const face = onFaction ? faction : local;
  const setFace = (id: FactionId) => {
    if (onFaction) onFaction(id);
    else setLocal(id);
  };

  const troops = useMemo(() => UNIT_ORDER.map((id) => ({ id, u: resolveUnit(id, face), home: ownersOf("unit", id) })), [face]);
  const halls = useMemo(
    () => STRUCTURES.map((id) => ({ id, b: resolveBuilding(id, face), home: ownersOf("building", id) })),
    [face],
  );
  const maxUnit = useMemo(
    () => ({
      hp: Math.max(...troops.map((t) => t.u.hp), 1),
      dmg: Math.max(...troops.map((t) => t.u.damage), 1),
      spd: Math.max(...troops.map((t) => t.u.speed), 1),
    }),
    [troops],
  );
  const maxHall = useMemo(
    () => ({
      hp: Math.max(...halls.map((t) => t.b.hp), 1),
      dmg: Math.max(...halls.map((t) => t.b.damage), 1),
      pow: Math.max(...halls.map((t) => Math.max(t.b.powerOut, t.b.powerUse)), 1),
    }),
    [halls],
  );

  const mineTroops = troops.filter((t) => t.home.includes(face));
  const otherTroops = troops.filter((t) => !t.home.includes(face));
  const mineHalls = halls.filter((t) => t.home.includes(face));
  const otherHalls = halls.filter((t) => !t.home.includes(face));

  return (
    <main className="h-dvh touch-pan-y overflow-y-auto bg-field" data-testid="arsenal">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 pb-8">
        <header className="steel flex items-center gap-2 p-2 pr-28">
          <button
            type="button"
            data-testid="arsenal-back"
            onClick={onBack}
            className="bevel-btn flex h-11 items-center gap-1 px-2 font-display text-sm uppercase"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
          <div className="min-w-0">
            <p className="font-display text-[10px] uppercase tracking-widest text-crystal">Field book</p>
            <h1 className="font-display text-2xl leading-none tracking-wide text-ink">Arsenal</h1>
          </div>
        </header>

        <section className="steel flex flex-col gap-2 p-3">
          <div className="grid grid-cols-2 gap-1.5" data-testid="arsenal-factions">
            {FACTIONS.map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`arsenal-faction-${id}`}
                aria-pressed={face === id}
                onClick={() => setFace(id)}
                className={`flex h-12 items-stretch overflow-hidden ${face === id ? "steel-inset" : "bevel-btn"}`}
              >
                <span className={`w-2 shrink-0 ${FACTION_SWATCH[id]}`} />
                <span className="flex min-w-0 flex-1 flex-col items-start justify-center px-2">
                  <span className={`font-display text-sm uppercase leading-none ${face === id ? "text-gold" : "text-ink"}`}>{FACTION_NAME[id]}</span>
                  <span className="font-display text-[10px] uppercase text-brass">{FACTION_HUE[id]}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-pretty text-muted">{FACTION_BLURB[face]}</p>
          <div className="flex" role="tablist" aria-label="Arsenal">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "troops"}
              data-testid="arsenal-tab-troops"
              onClick={() => {
                setTab("troops");
                setPick(null);
              }}
              className={`h-11 flex-1 border border-brass-dim font-display text-sm uppercase ${tab === "troops" ? "steel-inset text-gold" : "bevel-btn"}`}
            >
              Troops
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "buildings"}
              data-testid="arsenal-tab-buildings"
              onClick={() => {
                setTab("buildings");
                setPick(null);
              }}
              className={`h-11 flex-1 border border-brass-dim font-display text-sm uppercase ${tab === "buildings" ? "steel-inset text-gold" : "bevel-btn"}`}
            >
              Buildings
            </button>
          </div>
        </section>

        {pick ? (
          <Detail
            pick={pick}
            face={face}
            troops={troops}
            halls={halls}
            maxUnit={maxUnit}
            maxHall={maxHall}
            onBack={() => setPick(null)}
          />
        ) : tab === "troops" ? (
          <>
            <CardGrid>
              {mineTroops.map((row) => (
                <TroopCard key={row.id} row={row} face={face} onOpen={() => setPick({ kind: "unit", id: row.id })} />
              ))}
            </CardGrid>
            {otherTroops.length > 0 && (
              <>
                <h2 className="font-display text-xs uppercase tracking-widest text-brass">Other armies</h2>
                <CardGrid>
                  {otherTroops.map((row) => (
                    <TroopCard key={row.id} row={row} face={face} locked onOpen={() => setPick({ kind: "unit", id: row.id })} />
                  ))}
                </CardGrid>
              </>
            )}
          </>
        ) : (
          <>
            <CardGrid>
              {mineHalls.map((row) => (
                <HallCard key={row.id} row={row} face={face} onOpen={() => setPick({ kind: "building", id: row.id })} />
              ))}
            </CardGrid>
            {otherHalls.length > 0 && (
              <>
                <h2 className="font-display text-xs uppercase tracking-widest text-brass">Other armies</h2>
                <CardGrid>
                  {otherHalls.map((row) => (
                    <HallCard key={row.id} row={row} face={face} locked onOpen={() => setPick({ kind: "building", id: row.id })} />
                  ))}
                </CardGrid>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

function TroopCard({
  row,
  face,
  locked,
  onOpen,
}: {
  row: { id: UnitId; u: ResolvedUnit; home: FactionId[] };
  face: FactionId;
  locked?: boolean;
  onOpen: () => void;
}) {
  const home = row.home[0] ?? face;
  return (
    <button type="button" data-testid={`arsenal-card-${row.id}`} onClick={onOpen} className="steel flex flex-col overflow-hidden text-left">
      <Portrait files={artFiles("unit", row.id)} color={FACTION_COLOR[locked ? home : face]} mark={row.u.stealth ? "stealth" : row.id} />
      <span className="flex flex-col gap-0.5 p-2">
        <span className="truncate font-display text-sm uppercase text-ink">{row.u.short}</span>
        <span className="font-display text-xs tabular-nums text-gold">{row.u.hp} HP</span>
        <span className="text-xs text-muted">{row.u.damage > 0 ? `${row.u.damage} attack` : "No gun"}</span>
        {locked && <span className="font-display text-[10px] uppercase text-brass">{row.home.map((id) => FACTION_NAME[id]).join(" · ")}</span>}
      </span>
    </button>
  );
}

function HallCard({
  row,
  face,
  locked,
  onOpen,
}: {
  row: { id: BuildingId; b: ResolvedBuilding; home: FactionId[] };
  face: FactionId;
  locked?: boolean;
  onOpen: () => void;
}) {
  const home = row.home[0] ?? face;
  const power = row.b.powerOut > 0 ? `+${row.b.powerOut} power` : row.b.powerUse > 0 ? `−${row.b.powerUse} power` : row.b.damage > 0 ? `${row.b.damage} attack` : "No power";
  return (
    <button type="button" data-testid={`arsenal-card-${row.id}`} onClick={onOpen} className="steel flex flex-col overflow-hidden text-left">
      <Portrait files={artFiles("building", row.id)} color={FACTION_COLOR[locked ? home : face]} mark={row.id} />
      <span className="flex flex-col gap-0.5 p-2">
        <span className="truncate font-display text-sm uppercase text-ink">{row.b.short}</span>
        <span className="font-display text-xs tabular-nums text-gold">{row.b.hp} HP</span>
        <span className="text-xs text-muted">{power}</span>
        {locked && <span className="font-display text-[10px] uppercase text-brass">{row.home.map((id) => FACTION_NAME[id]).join(" · ")}</span>}
      </span>
    </button>
  );
}

function Detail({
  pick,
  face,
  troops,
  halls,
  maxUnit,
  maxHall,
  onBack,
}: {
  pick: Pick;
  face: FactionId;
  troops: { id: UnitId; u: ResolvedUnit; home: FactionId[] }[];
  halls: { id: BuildingId; b: ResolvedBuilding; home: FactionId[] }[];
  maxUnit: { hp: number; dmg: number; spd: number };
  maxHall: { hp: number; dmg: number; pow: number };
  onBack: () => void;
}) {
  if (pick.kind === "unit") {
    const row = troops.find((t) => t.id === pick.id);
    if (!row) return null;
    const u = row.u;
    const home = row.home.includes(face);
    const dps = u.damage > 0 && u.rof > 0 && u.rof < 30 ? u.damage / u.rof : 0;
    const loco = u.loco === "air" ? "Air" : u.loco === "sea" ? "Sea" : u.loco === "amphib" ? "Amphibious" : "Ground";
    return (
      <article className="steel flex flex-col gap-3 p-3" data-testid="arsenal-detail">
        <button type="button" data-testid="arsenal-detail-back" onClick={onBack} className="bevel-btn h-11 font-display text-sm uppercase">
          All troops
        </button>
        <Portrait files={artFiles("unit", u.id)} color={FACTION_COLOR[home ? face : (row.home[0] ?? face)]} mark={u.stealth ? "stealth" : u.id} large />
        <div>
          <h2 className="font-display text-2xl uppercase tracking-wide text-ink" data-testid="arsenal-detail-name">
            {u.name}
          </h2>
          <p className="text-sm text-pretty text-muted">{unitLine(u)}</p>
          {!home && (
            <p className="mt-1 text-sm text-pretty text-brass">{FACTION_NAME[face]} does not train this. Fielded by {row.home.map((id) => FACTION_NAME[id]).join(" and ")}.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <StatBar label="Health" value={u.hp} max={maxUnit.hp} text={`${u.hp}`} tone="hp" />
          <StatBar label="Attack" value={u.damage} max={maxUnit.dmg} text={u.damage > 0 ? `${u.damage}` : "—"} tone="atk" />
          <StatBar label="Speed" value={u.speed} max={maxUnit.spd} text={pace(u.speed)} tone="spd" />
        </div>
        {u.damage > 0 && (
          <div>
            <h3 className="font-display text-[10px] uppercase tracking-widest text-brass">Attack worth</h3>
            <Worth label="Per shot" n={u.damage} />
            <Worth label="Vs infantry" n={Math.round(u.damage * u.vsInf)} />
            <Worth label="Vs vehicles" n={Math.round(u.damage * u.vsVeh)} />
            <Worth label="Vs buildings" n={Math.round(u.damage * u.vsBld)} />
            {(u.vsAir ?? 0) > 0 && <Worth label="Vs aircraft" n={Math.round(u.damage * (u.vsAir ?? 0))} />}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Meta label="Hit points" value={`${u.hp}`} />
          <Meta label="Move" value={`${pace(u.speed)} · ${u.speed}`} />
          <Meta label="Range" value={u.damage > 0 ? `${u.range}` : "—"} />
          <Meta label="Sight" value={`${u.sight}`} />
          <Meta label="Shot every" value={u.damage > 0 ? `${u.rof}s` : "—"} />
          <Meta label="Damage / s" value={dps > 0 ? dps.toFixed(1) : "—"} />
          <Meta label="Armor" value={u.armor} />
          <Meta label="Move type" value={loco} />
          <Meta label="Cost" value={u.cost.toLocaleString("en-US")} />
          <Meta label="Train time" value={`${u.time}s`} />
          <Meta label="Trained at" value={TRAIN_AT[u.trainedAt] ?? u.trainedAt} />
          <Meta label="Shot" value={u.shot} />
          {u.cargo > 0 && <Meta label="Cargo" value={`${u.cargo}`} />}
          {u.stealth && <Meta label="Special" value="Stealth" />}
          {u.hitsAir && <Meta label="Anti-air" value="Yes" />}
          {u.magazine != null && <Meta label="Magazine" value={`${u.magazine} shots`} />}
          {u.rearmFor != null && <Meta label="Rearm" value={`${u.rearmFor}s`} />}
        </div>
      </article>
    );
  }

  const row = halls.find((t) => t.id === pick.id);
  if (!row) return null;
  const b = row.b;
  const def = BUILDINGS[b.id];
  const home = row.home.includes(face);
  const power = b.powerOut > 0 ? `+${b.powerOut}` : b.powerUse > 0 ? `−${b.powerUse}` : "0";
  return (
    <article className="steel flex flex-col gap-3 p-3" data-testid="arsenal-detail">
      <button type="button" data-testid="arsenal-detail-back" onClick={onBack} className="bevel-btn h-11 font-display text-sm uppercase">
        All buildings
      </button>
      <Portrait files={artFiles("building", b.id)} color={FACTION_COLOR[home ? face : (row.home[0] ?? face)]} mark={b.id} large />
      <div>
        <h2 className="font-display text-2xl uppercase tracking-wide text-ink" data-testid="arsenal-detail-name">
          {b.name}
        </h2>
        <p className="text-sm text-pretty text-muted">{buildingLine(b)}</p>
        {!home && (
          <p className="mt-1 text-sm text-pretty text-brass">{FACTION_NAME[face]} does not build this. Fielded by {row.home.map((id) => FACTION_NAME[id]).join(" and ")}.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <StatBar label="Health" value={b.hp} max={maxHall.hp} text={`${b.hp}`} tone="hp" />
        <StatBar label="Attack" value={b.damage} max={maxHall.dmg} text={b.damage > 0 ? `${b.damage}` : "—"} tone="atk" />
        <StatBar label="Power" value={Math.max(b.powerOut, b.powerUse)} max={maxHall.pow} text={power} tone="spd" />
      </div>
      {b.damage > 0 && (
        <div>
          <h3 className="font-display text-[10px] uppercase tracking-widest text-brass">Attack worth</h3>
          <Worth label="Per shot" n={b.damage} />
          <Worth label="Vs infantry" n={Math.round(b.damage * b.vsInf)} />
          <Worth label="Vs vehicles" n={Math.round(b.damage * b.vsVeh)} />
          <Worth label="Vs buildings" n={Math.round(b.damage * b.vsBld)} />
          {(b.vsAir ?? 0) > 0 && <Worth label="Vs aircraft" n={Math.round(b.damage * (b.vsAir ?? 0))} />}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Meta label="Hit points" value={`${b.hp}`} />
        <Meta label="Power" value={power} />
        <Meta label="Cost" value={b.cost.toLocaleString("en-US")} />
        <Meta label="Build time" value={`${b.time}s`} />
        <Meta label="Footprint" value={`${b.w}×${b.h}`} />
        <Meta label="Sight" value={`${b.sight}`} />
        <Meta label="Range" value={b.damage > 0 ? `${b.range}` : "—"} />
        <Meta label="Shot every" value={b.damage > 0 ? `${b.rof}s` : "—"} />
        <Meta label="Storage" value={b.storage > 0 ? b.storage.toLocaleString("en-US") : "—"} />
        <Meta label="Requires" value={b.requires ? BUILDINGS[b.requires].name : def.requires ? BUILDINGS[def.requires].name : "Nothing"} />
        <Meta label="Move" value="Fixed" />
        {b.shore && <Meta label="Placement" value="Shore" />}
        {b.special && <Meta label="Special" value={b.special} />}
      </div>
    </article>
  );
}
