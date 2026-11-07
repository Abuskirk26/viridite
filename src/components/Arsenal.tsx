import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { keySprite, sourceSize } from "@/game/art";
import { FACTION_BLURB, FACTION_HUE, FACTION_NAME, type BuildingId, type FactionId, type UnitId } from "@/game/data";
import {
  bookHalls,
  bookUnits,
  boundsOfAlpha,
  buildingPortrait,
  buildingStatLines,
  cardLine,
  factionLockLine,
  fitSheet,
  openGroundHits,
  roleLabel,
  structureBlurb,
  unitBlurb,
  unitPortrait,
  unitStatLines,
  type BookHall,
  type BookUnit,
  type PortraitSpec,
} from "@/game/fieldbook";
import { FACTIONS } from "@/game/lobby";
import { FACTION_SWATCH } from "@/components/faction-style";

const CARD_W = 320;
const CARD_H = 200;
const crops = new Map<string, { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number } | "bad">();

function cropOf(file: string, img: HTMLImageElement) {
  const cached = crops.get(file);
  if (cached) return cached;
  try {
    const keyed = keySprite(img, `book/${file}`);
    const size = sourceSize(keyed);
    const work = document.createElement("canvas");
    work.width = Math.max(1, size.w);
    work.height = Math.max(1, size.h);
    const ctx = work.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      crops.set(file, "bad");
      return "bad" as const;
    }
    ctx.drawImage(keyed, 0, 0, work.width, work.height);
    const box = boundsOfAlpha(ctx.getImageData(0, 0, work.width, work.height).data, work.width, work.height);
    if (!box) {
      crops.set(file, "bad");
      return "bad" as const;
    }
    const crop = { img: keyed, ...box };
    crops.set(file, crop);
    return crop;
  } catch {
    crops.set(file, "bad");
    return "bad" as const;
  }
}

function paintPlaceholder(ctx: CanvasRenderingContext2D, label: string, caption: string) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#8a7048";
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = "#f3ead7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 28px sans-serif";
  ctx.fillText(label, w / 2, h / 2 - 12, w - 36);
  ctx.fillStyle = "#c4a078";
  ctx.font = "16px sans-serif";
  ctx.fillText(caption, w / 2, h / 2 + 22, w - 36);
}

function paintPortrait(ctx: CanvasRenderingContext2D, spec: PortraitSpec) {
  if (spec.kind === "label") {
    paintPlaceholder(ctx, spec.label, spec.caption);
    return;
  }
  const crop = crops.get(spec.file);
  if (!crop) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }
  if (crop === "bad") {
    paintPlaceholder(ctx, spec.file, "No picture");
    return;
  }
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(0, 0, w, h);
  const pad = 12;
  const fit = fitSheet(crop.sw, crop.sh, w - pad * 2, h - pad * 2);
  ctx.drawImage(crop.img, crop.sx, crop.sy, crop.sw, crop.sh, pad + fit.dx, pad + fit.dy, fit.dw, fit.dh);
}

function Portrait({ spec }: { spec: PortraitSpec }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const src = spec.kind === "sheet" ? spec.src : "";
  const file = spec.kind === "sheet" ? spec.file : "";
  useEffect(() => {
    if (!src || !file) return;
    let dead = false;
    const img = new Image();
    img.onload = () => {
      if (dead) return;
      if (img.naturalWidth > 0) cropOf(file, img);
      else crops.set(file, "bad");
      setTick((n) => n + 1);
    };
    img.onerror = () => {
      if (dead) return;
      crops.set(file, "bad");
      setTick((n) => n + 1);
    };
    img.src = src;
    return () => {
      dead = true;
    };
  }, [src, file]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    paintPortrait(ctx, spec);
  }, [tick, spec]);
  return (
    <canvas
      ref={ref}
      width={CARD_W}
      height={CARD_H}
      aria-label={spec.kind === "label" ? `${spec.label}. ${spec.caption}` : spec.file}
      className="block aspect-video h-auto w-full bg-[#1a1612]"
    />
  );
}

function StatBar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-display text-xs uppercase tracking-wide text-brass">{label}</span>
      <div className="h-2.5 min-w-0 flex-1 bg-well">
        <div className="h-full bg-crystal" style={{ width: `${value > 0 ? pct : 0}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-display text-xs tabular-nums text-ink">{text}</span>
    </div>
  );
}

function Meta({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-brass-dim bg-well px-2 py-1.5" title={hint}>
      <div className="font-display text-xs uppercase tracking-wide text-brass">{label}</div>
      <div className="font-display text-sm text-pretty text-ink">{value}</div>
      {hint ? <p className="text-xs text-pretty text-muted">{hint}</p> : null}
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

  const troops = useMemo(() => bookUnits(face), [face]);
  const halls = useMemo(() => bookHalls(face), [face]);
  const mineTroops = troops.filter((row) => !row.locked);
  const otherTroops = troops.filter((row) => row.locked);
  const mineHalls = halls.filter((row) => row.access !== "reference" && !row.locked);
  const otherHalls = halls.filter((row) => row.locked);
  const reference = halls.filter((row) => row.access === "reference");

  return (
    <main className="h-dvh touch-pan-y overflow-y-auto bg-field" data-testid="arsenal">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 pb-8">
        <header className="steel sticky top-0 z-10 flex items-center gap-2 p-2">
          <button
            type="button"
            data-testid="arsenal-back"
            onClick={onBack}
            className="bevel-btn flex h-12 min-w-12 items-center gap-1 px-3 font-display text-sm uppercase"
          >
            <ChevronLeft className="size-4" />
            Close
          </button>
          <div className="min-w-0">
            <p className="font-display text-xs uppercase tracking-widest text-crystal">Field book</p>
            <h1 className="font-display text-2xl leading-none tracking-wide text-ink">Troop book</h1>
          </div>
        </header>

        <section className="steel flex flex-col gap-2 p-3">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="arsenal-factions">
            {FACTIONS.map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`arsenal-faction-${id}`}
                aria-pressed={face === id}
                onClick={() => {
                  setFace(id);
                  setPick(null);
                }}
                className={`flex h-12 items-stretch overflow-hidden ${face === id ? "steel-inset" : "bevel-btn"}`}
              >
                <span className={`w-2 shrink-0 ${FACTION_SWATCH[id]}`} />
                <span className="flex min-w-0 flex-1 flex-col items-start justify-center px-2">
                  <span className={`font-display text-sm uppercase leading-none ${face === id ? "text-gold" : "text-ink"}`}>
                    {FACTION_NAME[id]}
                  </span>
                  <span className="font-display text-xs uppercase text-brass">{FACTION_HUE[id]}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-sm text-pretty text-muted">{FACTION_BLURB[face]}</p>
          <div className="flex" role="tablist" aria-label="Troop book">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "troops"}
              data-testid="arsenal-tab-troops"
              onClick={() => {
                setTab("troops");
                setPick(null);
              }}
              className={`h-12 min-h-12 flex-1 border border-brass-dim font-display text-sm uppercase ${tab === "troops" ? "steel-inset text-gold" : "bevel-btn"}`}
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
              className={`h-12 min-h-12 flex-1 border border-brass-dim font-display text-sm uppercase ${tab === "buildings" ? "steel-inset text-gold" : "bevel-btn"}`}
            >
              Buildings
            </button>
          </div>
        </section>

        {pick ? (
          <Detail pick={pick} face={face} troops={troops} halls={halls} onBack={() => setPick(null)} />
        ) : tab === "troops" ? (
          <>
            <CardGrid>
              {mineTroops.map((row) => (
                <TroopCard key={row.id} row={row} onOpen={() => setPick({ kind: "unit", id: row.id })} />
              ))}
            </CardGrid>
            {otherTroops.length > 0 && (
              <>
                <h2 className="font-display text-xs uppercase tracking-widest text-brass">Other armies</h2>
                <CardGrid>
                  {otherTroops.map((row) => (
                    <TroopCard key={row.id} row={row} onOpen={() => setPick({ kind: "unit", id: row.id })} />
                  ))}
                </CardGrid>
              </>
            )}
          </>
        ) : (
          <>
            <CardGrid>
              {mineHalls.map((row) => (
                <HallCard key={row.id} row={row} onOpen={() => setPick({ kind: "building", id: row.id })} />
              ))}
            </CardGrid>
            {otherHalls.length > 0 && (
              <>
                <h2 className="font-display text-xs uppercase tracking-widest text-brass">Other armies</h2>
                <CardGrid>
                  {otherHalls.map((row) => (
                    <HallCard key={row.id} row={row} onOpen={() => setPick({ kind: "building", id: row.id })} />
                  ))}
                </CardGrid>
              </>
            )}
            {reference.length > 0 && (
              <section data-testid="arsenal-reference" className="flex flex-col gap-2">
                <h2 className="font-display text-xs uppercase tracking-widest text-brass">Reference</h2>
                <p className="text-sm text-pretty text-muted">In the records. Not on the build list, and not a faction unlock.</p>
                <CardGrid>
                  {reference.map((row) => (
                    <HallCard key={row.id} row={row} onOpen={() => setPick({ kind: "building", id: row.id })} />
                  ))}
                </CardGrid>
              </section>
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

function TroopCard({ row, onOpen }: { row: BookUnit; onOpen: () => void }) {
  return (
    <button type="button" data-testid={`arsenal-card-${row.id}`} onClick={onOpen} className="steel relative flex min-h-12 flex-col overflow-hidden text-left">
      <Portrait spec={unitPortrait(row.id)} />
      <span className="flex flex-col gap-0.5 p-2">
        <span className="font-display text-sm uppercase text-ink">{row.u.short}</span>
        <span className="font-display text-xs tabular-nums text-gold">{row.u.hp} HP</span>
        <span className="text-xs text-pretty text-muted">{cardLine(row)}</span>
        <span data-testid={`arsenal-blurb-${row.id}`} className="absolute size-px overflow-hidden">
          {unitBlurb(row.u)}
        </span>
        {row.locked && (
          <span data-testid={`arsenal-lock-${row.id}`} className="font-display text-xs uppercase text-brass">
            {row.home.map((id) => FACTION_NAME[id]).join(" · ")}
          </span>
        )}
      </span>
    </button>
  );
}

function HallCard({ row, onOpen }: { row: BookHall; onOpen: () => void }) {
  const role = roleLabel(row);
  return (
    <button type="button" data-testid={`arsenal-card-${row.id}`} onClick={onOpen} className="steel relative flex min-h-12 flex-col overflow-hidden text-left">
      <Portrait spec={buildingPortrait(row.id)} />
      <span className="flex flex-col gap-0.5 p-2">
        <span className="font-display text-sm uppercase text-ink">{row.b.short}</span>
        <span className="font-display text-xs tabular-nums text-gold">{row.b.hp} HP</span>
        <span className="text-xs text-pretty text-muted">{cardLine(row)}</span>
        <span data-testid={`arsenal-blurb-${row.id}`} className="absolute size-px overflow-hidden">
          {structureBlurb(row.id, row.b)}
        </span>
        {role && (
          <span data-testid={`arsenal-role-${row.id}`} className="font-display text-xs uppercase text-brass">
            {role}
          </span>
        )}
      </span>
    </button>
  );
}

function Detail({
  pick,
  face,
  troops,
  halls,
  onBack,
}: {
  pick: Pick;
  face: FactionId;
  troops: BookUnit[];
  halls: BookHall[];
  onBack: () => void;
}) {
  if (pick.kind === "unit") {
    const row = troops.find((t) => t.id === pick.id);
    if (!row) return null;
    const u = row.u;
    const maxHp = Math.max(...troops.map((t) => t.u.hp), 1);
    const maxDmg = Math.max(...troops.map((t) => t.u.damage), 1);
    const hits = openGroundHits(u);
    const lock = row.locked ? factionLockLine("unit", face, row.home) : null;
    return (
      <article className="steel flex flex-col gap-3 p-3" data-testid="arsenal-detail">
        <button type="button" data-testid="arsenal-detail-back" onClick={onBack} className="bevel-btn h-12 font-display text-sm uppercase">
          All troops
        </button>
        <Portrait spec={unitPortrait(u.id)} />
        <div>
          <h2 className="font-display text-2xl uppercase tracking-wide text-ink" data-testid="arsenal-detail-name">
            {u.name}
          </h2>
          <p className="text-sm text-pretty text-muted" data-testid="arsenal-detail-blurb">
            {unitBlurb(u)}
          </p>
          {lock && <p className="mt-1 text-sm text-pretty text-brass">{lock}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <StatBar label="Health" value={u.hp} max={maxHp} text={`${u.hp}`} />
          <StatBar label="Damage" value={u.damage} max={maxDmg} text={u.damage > 0 ? `${u.damage}` : "—"} />
        </div>
        {hits.length > 0 && (
          <div>
            <h3 className="font-display text-xs uppercase tracking-widest text-brass">Open-ground hit</h3>
            <p className="text-xs text-pretty text-muted">One direct hit before height and cover. Not a damage per second.</p>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {hits.map((line) => (
                <Meta key={line.label} label={line.label} value={line.value} hint={line.hint} />
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {unitStatLines(u).map((line) => (
            <Meta key={line.label} label={line.label} value={line.value} hint={line.hint} />
          ))}
        </div>
      </article>
    );
  }

  const row = halls.find((t) => t.id === pick.id);
  if (!row) return null;
  const b = row.b;
  const maxHp = Math.max(...halls.map((t) => t.b.hp), 1);
  const lock = row.locked ? factionLockLine("building", face, row.home) : null;
  const role = roleLabel(row);
  return (
    <article className="steel flex flex-col gap-3 p-3" data-testid="arsenal-detail">
      <button type="button" data-testid="arsenal-detail-back" onClick={onBack} className="bevel-btn h-12 font-display text-sm uppercase">
        All buildings
      </button>
      <Portrait spec={buildingPortrait(b.id)} />
      <div>
        <h2 className="font-display text-2xl uppercase tracking-wide text-ink" data-testid="arsenal-detail-name">
          {b.name}
        </h2>
        {role && (
          <p className="font-display text-xs uppercase text-brass" data-testid="arsenal-detail-role">
            {role}
          </p>
        )}
        <p className="text-sm text-pretty text-muted" data-testid="arsenal-detail-blurb">
          {structureBlurb(row.id, b)}
        </p>
        {lock && <p className="mt-1 text-sm text-pretty text-brass">{lock}</p>}
      </div>
      <StatBar label="Health" value={b.hp} max={maxHp} text={`${b.hp}`} />
      <div className="grid grid-cols-2 gap-1.5">
        {buildingStatLines(b).map((line) => (
          <Meta key={line.label} label={line.label} value={line.value} hint={line.hint} />
        ))}
      </div>
    </article>
  );
}
