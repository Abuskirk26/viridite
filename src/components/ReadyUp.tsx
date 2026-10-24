import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dices, Swords } from "lucide-react";
import { FACTION_COLOR, FACTION_NAME, MAP_H, MAP_W, teamStyle, theaterOf, type AiDifficulty, type FactionId, type MapId, type Theater } from "@/game/data";
import { generateMap, MAP_LIST, plantCorners, waterKind } from "@/game/maps";
import { paintDocThumb, paintTeamShape } from "@/game/render";
import { TeamPip } from "@/components/TeamPip";
import {
  CREDIT_CHOICES,
  DIFFICULTY_CHOICES,
  LOBBY_MAPS,
  START_CHOICES,
  START_LABEL,
  aiCount,
  chooseOpponents,
  listMyMaps,
  lobbyBlock,
  orderCorners,
  resolveMyMap,
  withNewBotSkill,
  normalBotDefaults,
  type MyMapRow,
  type OpponentCount,
  type SkirmishSetup,
} from "@/game/lobby";

const IDS: FactionId[] = ["concord", "syndicate", "steel", "prism"];
const DIFF = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;

/** The match. Bots hold the seats until a friend takes one. */
export function ReadyUp({
  setup,
  onChange,
  onBack,
  onStart,
  onPractice,
  onRandomize,
  onFriends,
}: {
  setup: SkirmishSetup;
  onChange: (partial: Partial<SkirmishSetup>) => void;
  onBack: () => void;
  onStart: () => void;
  onPractice: () => void;
  onRandomize: () => void;
  onFriends: () => void;
}) {
  const [maps, setMaps] = useState<MyMapRow[]>([]);
  const [more, setMore] = useState(false);
  const [rules, setRules] = useState(false);
  useEffect(() => setMaps(listMyMaps()), []);
  const block = lobbyBlock(setup);
  const n = aiCount(setup);
  const coOp = setup.teams === "tvt";
  const mapName =
    maps.find((row) => row.id === setup.customId)?.name ??
    MAP_LIST.find((m) => m.id === setup.mapId)?.name ??
    "Field";

  const setBot = (index: 0 | 1 | 2, id: FactionId) => {
    const bots = setup.bots.slice() as SkirmishSetup["bots"];
    bots[index] = id;
    onChange(index === 0 ? { enemy: id, bots, ...normalBotDefaults() } : { bots, ...normalBotDefaults() });
  };
  const addBot = () => {
    if (n >= 3) return;
    const next = (n + 1) as OpponentCount;
    onChange({
      ...chooseOpponents({ ...setup, teams: "ffa" }, next),
      ...withNewBotSkill(setup, next),
    });
  };
  const dropAt = (index: 0 | 1 | 2) => {
    if (n <= 1) return;
    const bots = setup.bots.slice();
    const skills = setup.skills.slice();
    bots.splice(index, 1);
    skills.splice(index, 1);
    bots.push(setup.bots[index]);
    skills.push(setup.skills[index]);
    const nextBots = bots as SkirmishSetup["bots"];
    const nextSkills = skills as SkirmishSetup["skills"];
    onChange({
      ...chooseOpponents({ ...setup, teams: "ffa" }, (n - 1) as OpponentCount),
      bots: nextBots,
      skills: nextSkills,
      enemy: nextBots[0],
      difficulty: nextSkills[0],
    });
  };
  const setSkill = (index: 0 | 1 | 2, id: AiDifficulty) => {
    const skills = setup.skills.slice() as SkirmishSetup["skills"];
    skills[index] = id;
    onChange(index === 0 ? { skills, difficulty: id } : { skills });
  };
  const pick = (row: MyMapRow) => {
    onChange({
      customId: row.id,
      mapId: row.deep ? "coast" : "dry",
      size: row.size,
      ...normalBotDefaults(),
    });
  };

  const seats = [
    { key: "you", label: "You", faction: setup.player },
    { key: "enemy", label: coOp ? "Enemy" : "Bot", faction: setup.bots[0] },
    { key: "b2", label: coOp ? "Ally" : "Bot", faction: setup.bots[1] },
    { key: "b3", label: "Bot", faction: setup.bots[2] },
  ].slice(0, n + 1);

  if (rules) {
    return (
      <OptionsScreen
        setup={setup}
        onChange={onChange}
        onClose={() => setRules(false)}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0e100e] text-ink" data-testid="ready-up">
      <header className="steel flex h-11 shrink-0 items-stretch border-b border-black">
        <button type="button" className="h-11 min-w-11 px-3 font-display text-xs uppercase text-brass" onClick={onBack}>
          Back
        </button>
        <div className="flex h-11 items-center border-b-2 border-crystal bg-[#16301f] px-4 font-display text-xs uppercase tracking-[0.16em] text-crystal">
          Skirmish
        </div>
        <div className="ml-auto flex items-center gap-1 pr-2">
          <Chip on={!coOp} testId="teams-ffa" label="Versus. Each commander fights alone." onClick={() => onChange({ teams: "ffa" })}>
            Versus
          </Chip>
          <Chip on={coOp} testId="teams-tvt" label="Co-op. You and an ally against two enemies." onClick={() => onChange({ ...chooseOpponents({ ...setup, teams: "tvt" }, 2), ...withNewBotSkill(setup, 2) })}>
            Co-op
          </Chip>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden px-2 py-1">
        <section data-testid="ready-seats" className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <div className="flex items-center gap-2">
            <TeamPip team={0} />
            <p className="font-display text-xs uppercase tracking-wide text-muted">P1 · You</p>
          </div>
          <FactionPick label="You" faction={setup.player} onPick={(id) => onChange({ player: id, ...normalBotDefaults() })} />
          <p className="truncate font-display text-xs uppercase tracking-wide text-gold">{mapName}</p>
          <div className="flex gap-1 overflow-x-auto">
            <Chip on={setup.customId === "tpl:fourisles"} testId="map-fourisles" label="Four Isles" onClick={() => onChange({ customId: "tpl:fourisles", mapId: "coast", size: "large", ...normalBotDefaults() })}>
              Isles
            </Chip>
            {LOBBY_MAPS.map((m) => (
              <Chip
                key={m.id}
                on={!setup.customId && setup.mapId === m.id}
                testId={`map-${m.id}`}
                label={MAP_LIST.find((meta) => meta.id === m.id)?.name ?? m.short}
                onClick={() =>
                  onChange(
                    m.id === "michigan"
                      ? { mapId: m.id, customId: "", size: "continent", ...normalBotDefaults() }
                      : { mapId: m.id, customId: "", ...normalBotDefaults() },
                  )
                }
              >
                {m.short}
              </Chip>
            ))}
            <button type="button" className="h-11 min-w-11 shrink-0 px-2 font-display text-xs uppercase text-brass" onClick={() => setMore(true)}>
              Maps
            </button>
          </div>
          <MapPreview setup={setup} name={mapName} />
        </section>

        <section className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <div className="flex h-11 items-center justify-between">
            <p className="font-display text-xs uppercase tracking-wide text-muted">{coOp ? "Enemy" : n === 1 ? "One bot" : "Bots"}</p>
            <button
              type="button"
              data-testid="add-bot"
              disabled={n >= 3}
              className="h-11 min-w-11 px-2 font-display text-xs uppercase text-crystal disabled:text-brass-dim"
              onClick={addBot}
            >
              {n >= 3 ? "Full" : "Add bot"}
            </button>
          </div>
          {seats.slice(1).map((seat, index) => (
            <div key={seat.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <TeamPip team={index + 1} />
                <p className="font-display text-[10px] uppercase tracking-wide text-muted">
                  P{index + 2} · {seat.label}
                </p>
              </div>
              <FactionPick label={seat.label} faction={seat.faction} onPick={(id) => setBot(index as 0 | 1 | 2, id)} />
              <div className="flex gap-1">
                {DIFFICULTY_CHOICES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={`skill-${index}-${id}`}
                    aria-pressed={setup.skills[index] === id}
                    className={`h-11 min-w-11 flex-1 font-display text-xs uppercase ${setup.skills[index] === id ? "steel-inset text-gold" : "border border-[#2a3330] text-ink"}`}
                    onClick={() => setSkill(index as 0 | 1 | 2, id)}
                  >
                    {DIFF[id]}
                  </button>
                ))}
                {n > 1 && (
                  <button type="button" data-testid="drop-bot" className="h-11 w-11 font-display text-xs uppercase text-danger" onClick={() => dropAt(index as 0 | 1 | 2)}>
                    X
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-3 gap-1">
            {CREDIT_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                data-testid={`credits-${c}`}
                aria-pressed={setup.credits === c}
                className={`h-11 font-display text-xs uppercase ${setup.credits === c ? "steel-inset text-gold" : "border border-[#2a3330] text-ink"}`}
                onClick={() => onChange({ credits: c })}
              >
                {c === 10000 ? "10k" : c === 5000 ? "5k" : "2k"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              data-testid="mode-destroy"
              aria-pressed={setup.mode === "destroy"}
              className={`h-11 font-display text-xs uppercase ${setup.mode === "destroy" ? "steel-inset text-gold" : "border border-[#2a3330] text-ink"}`}
              onClick={() => onChange({ mode: "destroy" })}
            >
              Destroy
            </button>
            <button
              type="button"
              data-testid="mode-survive"
              aria-pressed={setup.mode === "survive"}
              className={`h-11 font-display text-xs uppercase ${setup.mode === "survive" ? "steel-inset text-gold" : "border border-[#2a3330] text-ink"}`}
              onClick={() => onChange({ mode: "survive" })}
            >
              Survive
            </button>
          </div>
        </section>
      </div>

      {more && (
        <div className="absolute inset-x-0 bottom-12 top-11 z-20 flex flex-col bg-[#0e100e] px-3 py-2">
          <div className="mb-1 flex h-11 items-center justify-between">
            <p className="font-display text-xs uppercase tracking-wide text-gold">Maps</p>
            <button type="button" className="h-11 min-w-11 font-display text-xs uppercase text-brass" onClick={() => setMore(false)}>
              Done
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1 overflow-y-auto">
            {maps
              .filter((row) => row.id !== "tpl:fourisles")
              .map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`flex h-11 items-center justify-between border px-2 text-left ${setup.customId === row.id ? "border-gold text-gold" : "border-[#2a3330] text-ink"}`}
                  onClick={() => {
                    pick(row);
                    setMore(false);
                  }}
                >
                  <span className="truncate font-display text-xs uppercase">{row.name}</span>
                  <span className="shrink-0 text-xs text-muted">{row.w}×{row.h}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {block && <p className="px-3 text-center text-xs text-danger">{block}</p>}

      <footer className="steel relative z-30 flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-t border-black px-2">
        <button type="button" data-testid="randomize" onClick={onRandomize} className="flex h-11 min-w-11 items-center gap-1 px-2 font-display text-xs uppercase text-brass">
          <Dices className="size-4" />
          Random
        </button>
        <button type="button" data-testid="advanced-rules" className="h-11 min-w-11 px-2 font-display text-xs uppercase text-brass" onClick={() => setRules(true)}>
          Options
        </button>
        <button
          type="button"
          data-testid="practice"
          onClick={onPractice}
          className="flex h-11 min-w-24 shrink-0 items-center justify-center border border-crystal font-display text-xs uppercase text-crystal"
        >
          Practice
        </button>
        <button
          type="button"
          data-testid="start-skirmish"
          disabled={!!block}
          onClick={onStart}
          className={`mx-auto flex h-11 min-w-40 items-center justify-center gap-2 border-2 font-display text-sm uppercase tracking-[0.22em] ${
            block ? "border-brass-dim text-muted" : "border-gold bg-[#14110c] text-gold"
          }`}
        >
          <Swords className="size-4" />
          Battle
        </button>
        <button type="button" data-testid="friends" onClick={onFriends} className="h-11 min-w-11 px-2 font-display text-xs uppercase text-brass">
          Friends
        </button>
      </footer>
    </div>
  );
}

function OptionsScreen({
  setup,
  onChange,
  onClose,
}: {
  setup: SkirmishSetup;
  onChange: (partial: Partial<SkirmishSetup>) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0e100e] text-ink" data-testid="ready-options">
      <header className="steel flex h-11 shrink-0 items-stretch border-b border-black">
        <button type="button" data-testid="advanced-rules" className="h-11 min-w-11 px-3 font-display text-xs uppercase text-brass" onClick={onClose}>
          Back
        </button>
        <div className="flex h-11 items-center border-b-2 border-crystal bg-[#16301f] px-4 font-display text-xs uppercase tracking-[0.16em] text-crystal">
          Options
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 px-3 py-1">
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <Section title="Credits">
            {CREDIT_CHOICES.map((c) => (
              <Wide key={c} on={setup.credits === c} testId={`credits-${c}`} label={`${c} credits`} onClick={() => onChange({ credits: c })}>
                {c === 10000 ? "10k" : c === 5000 ? "5k" : "2k"}
              </Wide>
            ))}
          </Section>
          <Section title="Win">
            <Wide on={setup.mode === "destroy"} testId="mode-destroy" label="Destroy the enemy base" onClick={() => onChange({ mode: "destroy" })}>Destroy</Wide>
            <Wide on={setup.mode === "survive"} testId="mode-survive" label="Survive the clock" onClick={() => onChange({ mode: "survive" })}>Survive</Wide>
          </Section>
          <Section title="Speed">
            {([0.75, 1, 1.5, 2] as const).map((s) => (
              <Wide key={s} on={setup.speed === s} testId={`speed-${s}`} label={`${s}x`} onClick={() => onChange({ speed: s })}>
                {s === 0.75 ? "Slow" : s === 1 ? "1x" : s === 1.5 ? "Fast" : "2x"}
              </Wide>
            ))}
          </Section>
        </div>
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <Section title="Fog">
            <Wide on={setup.fog} testId="fog-on" label="Fog on" onClick={() => onChange({ fog: true })}>On</Wide>
            <Wide on={!setup.fog} testId="fog-off" label="Fog off" onClick={() => onChange({ fog: false })}>Off</Wide>
          </Section>
          <Section title="Walls">
            <Wide on={setup.walls} testId="walls-on" label="Walls on" onClick={() => onChange({ walls: true })}>On</Wide>
            <Wide on={!setup.walls} testId="walls-off" label="Walls off" onClick={() => onChange({ walls: false })}>Off</Wide>
          </Section>
          <Section title="Crates">
            <Wide on={setup.crates} testId="crates-on" label="Crates on" onClick={() => onChange({ crates: true })}>On</Wide>
            <Wide on={!setup.crates} testId="crates-off" label="Crates off" onClick={() => onChange({ crates: false })}>Off</Wide>
          </Section>
          <Section title="Start" cols={3}>
            {START_CHOICES.map((id) => (
              <Wide key={id} on={setup.start === id} testId={`start-${id}`} label={START_LABEL[id]} onClick={() => onChange({ start: id })}>
                {START_LABEL[id]}
              </Wide>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, cols = 2 }: { title: string; children: ReactNode; cols?: 2 | 3 }) {
  return (
    <section>
      <h2 className="mb-1 font-display text-xs uppercase tracking-[0.18em] text-ink">{title}</h2>
      <div className={`grid gap-1 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>
    </section>
  );
}

function Wide({
  on,
  testId,
  label,
  onClick,
  children,
}: {
  on: boolean;
  testId: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      aria-label={label}
      className={`h-11 font-display text-xs uppercase tracking-wide ${on ? "border border-crystal bg-[#16301f] text-crystal" : "bevel-btn"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

type Thumb = {
  w: number;
  h: number;
  theater: Theater;
  terrain: Uint8Array;
  crystal: Uint16Array;
  corners: { x: number; y: number }[];
};

const thumbs = new Map<string, Thumb>();

function builtinThumb(mapId: MapId): Thumb {
  const hit = thumbs.get(mapId);
  if (hit) return hit;
  const map = generateMap(mapId);
  const terrain = map.terrain.slice();
  const crystal = map.crystal.slice();
  const corners = plantCorners(terrain, crystal, MAP_W, waterKind(mapId));
  const next: Thumb = { w: MAP_W, h: MAP_H, theater: theaterOf(mapId), terrain, crystal, corners };
  thumbs.set(mapId, next);
  return next;
}

function seatMarks(setup: SkirmishSetup, corners: { x: number; y: number }[], customStarts: { x: number; y: number }[] | null) {
  const seats = aiCount(setup) + 1;
  const starts = customStarts
    ? customStarts.slice(0, seats)
    : orderCorners(corners, setup.start, seats, () => 0);
  const coOp = setup.teams === "tvt";
  const labels = ["You", coOp ? "Enemy" : "Bot", coOp ? "Ally" : "Bot", "Bot"];
  return starts.map((at, i) => {
    const style = teamStyle(i);
    return {
      x: at.x,
      y: at.y,
      color: style.color,
      shape: style.shape,
      label: labels[i] ?? "Bot",
      you: i === 0,
    };
  });
}

/** Small field thumb, centered between the teams. */
function MapPreview({ setup, name }: { setup: SkirmishSetup; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      if (cancel) return;
      const custom = setup.customId ? resolveMyMap(setup.customId) : null;
      const thumb = custom
        ? { w: custom.w, h: custom.h, theater: custom.theater, terrain: custom.terrain, crystal: custom.crystal, corners: custom.starts }
        : builtinThumb(setup.mapId);
      const painted = seatMarks(setup, thumb.corners, custom ? custom.starts : null);
      paintDocThumb(canvas, { ...thumb, starts: painted });
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const css = canvas.clientWidth || 64;
        const size = (12 * canvas.width) / css;
        const line = Math.max(1, (2 * canvas.width) / css);
        for (const mark of painted) {
          paintTeamShape(ctx, mark.x, mark.y, size, mark.color, mark.shape, line);
        }
      }
    }, 0);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [setup]);

  return (
    <div data-testid="map-preview" className="size-16 shrink-0 border border-[#3a4640] bg-[#0c0e0c] p-px">
      <canvas
        ref={ref}
        aria-label={`${name} map preview`}
        className="size-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

function SeatCard({
  title,
  seat,
  you,
}: {
  title: string;
  seat: { label: string; faction: FactionId };
  you?: boolean;
}) {
  return (
    <div className="border border-[#2c3834] bg-[#1a1e1b]">
      <p className="px-2 pt-1 font-display text-[10px] uppercase tracking-widest text-muted">{title}</p>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="grid size-10 place-items-center font-display text-[10px] uppercase text-[#14110e]" style={{ background: FACTION_COLOR[seat.faction] }}>
          {FACTION_NAME[seat.faction].slice(0, 3)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-xs uppercase text-ink">{you ? "You" : FACTION_NAME[seat.faction]}</p>
          <p className="text-[10px] uppercase text-muted">{you ? "Leader" : "Bot"}</p>
        </div>
      </div>
    </div>
  );
}

function FactionPick({
  label,
  faction,
  onPick,
}: {
  label: string;
  faction: FactionId;
  onPick: (id: FactionId) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {IDS.map((id) => (
        <button
          key={id}
          type="button"
          data-testid={`seat-${label}-${id}`}
          aria-pressed={faction === id}
          aria-label={`${label} ${FACTION_NAME[id]}`}
          className={`h-11 font-display text-xs uppercase ${faction === id ? "outline outline-2 outline-ink" : ""}`}
          style={{ background: FACTION_COLOR[id], color: "#14110e" }}
          onClick={() => onPick(id)}
        >
          {FACTION_NAME[id].slice(0, 3)}
        </button>
      ))}
    </div>
  );
}

function Chip({
  on,
  testId,
  label,
  onClick,
  children,
}: {
  on: boolean;
  testId: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      aria-label={label}
      className={`h-11 shrink-0 px-3 font-display text-xs uppercase ${on ? "steel-inset text-gold" : "border border-brass-dim bg-steel-top text-ink"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
