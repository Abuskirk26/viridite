import { useEffect, useState, type ReactNode } from "react";
import { Dices, Swords } from "lucide-react";
import { FACTION_COLOR, FACTION_NAME, type AiDifficulty, type FactionId } from "@/game/data";
import { MAP_LIST } from "@/game/maps";
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
  onRandomize,
  onFriends,
}: {
  setup: SkirmishSetup;
  onChange: (partial: Partial<SkirmishSetup>) => void;
  onBack: () => void;
  onStart: () => void;
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
    onChange(index === 0 ? { enemy: id, bots } : { bots });
  };
  const addBot = () => {
    if (n >= 3) return;
    onChange(chooseOpponents({ ...setup, teams: "ffa" }, (n + 1) as OpponentCount));
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
      opponents: row.starts >= 4 ? 3 : 1,
      teams: "ffa",
    });
  };

  const seats = [
    { key: "you", label: "You", faction: setup.player },
    { key: "enemy", label: coOp ? "Enemy" : "Bot", faction: setup.bots[0] },
    { key: "b2", label: coOp ? "Ally" : "Bot", faction: setup.bots[1] },
    { key: "b3", label: "Bot", faction: setup.bots[2] },
  ].slice(0, n + 1);

  return (
    <div className="flex h-dvh flex-col bg-field" data-testid="ready-up">
      <header className="flex items-center gap-3 px-3 pt-3">
        <button type="button" className="h-11 px-2 font-display text-xs uppercase text-brass" onClick={onBack}>
          Settings
        </button>
        <h1 className="font-display text-2xl tracking-[0.14em] text-crystal">SKIRMISH</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-3">
          <section>
            <p className="font-display text-[10px] uppercase tracking-widest text-brass">Map</p>
            <p className="mt-1 font-display text-sm uppercase text-ink">{mapName}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip on={setup.customId === "tpl:fourisles"} testId="map-fourisles" label="Four Isles" onClick={() => onChange({ customId: "tpl:fourisles", mapId: "coast", size: "large", opponents: 3, teams: "ffa" })}>
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
                        ? { mapId: m.id, customId: "", size: "continent", opponents: 3, teams: "ffa" }
                        : { mapId: m.id, customId: "" },
                    )
                  }
                >
                  {m.short}
                </Chip>
              ))}
            </div>
            <button type="button" className="mt-2 font-display text-xs uppercase text-brass" onClick={() => setMore((v) => !v)}>
              {more ? "Hide maps" : "More maps"}
            </button>
            {more && (
              <div className="mt-2 flex flex-col">
                {maps
                  .filter((row) => row.id !== "tpl:fourisles")
                  .map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`flex h-11 items-center justify-between border-b border-brass-dim text-left ${setup.customId === row.id ? "text-gold" : "text-ink"}`}
                      onClick={() => pick(row)}
                    >
                      <span className="font-display text-sm uppercase">{row.name}</span>
                      <span className="text-xs text-muted">{row.w}×{row.h}</span>
                    </button>
                  ))}
              </div>
            )}
          </section>

          <section>
            <p className="font-display text-[10px] uppercase tracking-widest text-brass">Team</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Chip on={!coOp} testId="teams-ffa" label="Versus. Each commander fights alone." onClick={() => onChange({ teams: "ffa" })}>
                Versus
              </Chip>
              <Chip on={coOp} testId="teams-tvt" label="Co-op. You and an ally against two enemies." onClick={() => onChange(chooseOpponents({ ...setup, teams: "tvt" }, 2))}>
                Co-op
              </Chip>
            </div>
          </section>

          <section data-testid="ready-seats">
            <div className="flex items-center justify-between">
              <p className="font-display text-[10px] uppercase tracking-widest text-brass">Seats</p>
              <button
                type="button"
                data-testid="add-bot"
                disabled={n >= 3}
                className="h-11 px-2 font-display text-xs uppercase text-crystal disabled:text-brass-dim"
                onClick={addBot}
              >
                {n >= 3 ? "Full" : "Add bot"}
              </button>
            </div>
            <p className="text-xs text-pretty text-muted">Bots hold these seats. Play with friends uses this same map and lets a friend take one.</p>
            <div className="mt-1 flex flex-col gap-2">
              {seats.map((seat, index) => (
                <div key={seat.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 font-display text-xs uppercase text-ink">{seat.label}</span>
                    <div className="grid flex-1 grid-cols-4 gap-1">
                      {IDS.map((id) => (
                        <button
                          key={id}
                          type="button"
                          data-testid={`seat-${seat.label}-${id}`}
                          aria-pressed={seat.faction === id}
                          aria-label={`${seat.label} ${FACTION_NAME[id]}`}
                          className={`h-11 font-display text-[10px] uppercase ${seat.faction === id ? "outline outline-2 outline-ink" : ""}`}
                          style={{ background: FACTION_COLOR[id], color: "#14110e" }}
                          onClick={() => (index === 0 ? onChange({ player: id }) : setBot((index - 1) as 0 | 1 | 2, id))}
                        >
                          {FACTION_NAME[id].slice(0, 3)}
                        </button>
                      ))}
                    </div>
                    {index > 0 && n > 1 ? (
                      <button
                        type="button"
                        data-testid="drop-bot"
                        className="h-11 w-12 shrink-0 font-display text-[10px] uppercase text-danger"
                        onClick={() => dropAt((index - 1) as 0 | 1 | 2)}
                      >
                        Drop
                      </button>
                    ) : (
                      <span className="w-12 shrink-0" />
                    )}
                  </div>
                  {index > 0 && (
                    <div className="flex gap-1 pl-14">
                      {DIFFICULTY_CHOICES.map((id) => (
                        <button
                          key={id}
                          type="button"
                          data-testid={`skill-${index - 1}-${id}`}
                          aria-pressed={setup.skills[index - 1] === id}
                          className={`h-9 flex-1 font-display text-[10px] uppercase ${setup.skills[index - 1] === id ? "steel-inset text-gold" : "border border-brass-dim text-ink"}`}
                          onClick={() => setSkill((index - 1) as 0 | 1 | 2, id)}
                        >
                          {DIFF[id]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="font-display text-[10px] uppercase tracking-widest text-brass">Settings</p>
            <p className="mt-1 text-xs text-muted">Each bot starts easy and climbs to the skill you set. Hard is the top.</p>
            <Line label="Credits">
              {CREDIT_CHOICES.map((c) => (
                <Chip key={c} on={setup.credits === c} testId={`credits-${c}`} label={`${c} credits`} onClick={() => onChange({ credits: c })}>
                  {c === 10000 ? "10k" : c === 5000 ? "5k" : "2k"}
                </Chip>
              ))}
            </Line>
            <Line label="Start">
              {START_CHOICES.map((id) => (
                <Chip key={id} on={setup.start === id} testId={`start-${id}`} label={START_LABEL[id]} onClick={() => onChange({ start: id })}>
                  {START_LABEL[id]}
                </Chip>
              ))}
            </Line>
            <Line label="Fog">
              <Chip on={setup.fog} testId="fog-on" label="Fog on" onClick={() => onChange({ fog: true })}>
                On
              </Chip>
              <Chip on={!setup.fog} testId="fog-off" label="Fog off" onClick={() => onChange({ fog: false })}>
                Off
              </Chip>
            </Line>
            <button type="button" data-testid="advanced-rules" className="mt-3 h-11 font-display text-xs uppercase text-brass" onClick={() => setRules((v) => !v)}>
              {rules ? "Hide rules" : "Advanced rules"}
            </button>
            {rules && (
              <>
                <Line label="Win">
                  <Chip on={setup.mode === "destroy"} testId="mode-destroy" label="Destroy the enemy base" onClick={() => onChange({ mode: "destroy" })}>
                    Destroy
                  </Chip>
                  <Chip on={setup.mode === "survive"} testId="mode-survive" label="Survive the clock" onClick={() => onChange({ mode: "survive" })}>
                    Survive
                  </Chip>
                </Line>
                <Line label="Crates">
                  <Chip on={setup.crates} testId="crates-on" label="Crates on" onClick={() => onChange({ crates: true })}>
                    On
                  </Chip>
                  <Chip on={!setup.crates} testId="crates-off" label="Crates off" onClick={() => onChange({ crates: false })}>
                    Off
                  </Chip>
                </Line>
                <Line label="Walls">
                  <Chip on={setup.walls} testId="walls-on" label="Walls on" onClick={() => onChange({ walls: true })}>
                    On
                  </Chip>
                  <Chip on={!setup.walls} testId="walls-off" label="Walls off" onClick={() => onChange({ walls: false })}>
                    Off
                  </Chip>
                </Line>
                <Line label="Speed">
                  {([0.75, 1, 1.5, 2] as const).map((s) => (
                    <Chip key={s} on={setup.speed === s} testId={`speed-${s}`} label={`${s}x`} onClick={() => onChange({ speed: s })}>
                      {s === 0.75 ? "Slow" : s === 1 ? "1x" : s === 1.5 ? "Fast" : "2x"}
                    </Chip>
                  ))}
                </Line>
              </>
            )}
          </section>
        </div>
      </div>
      <footer className="border-t border-brass-dim bg-field px-3 py-2">
        <p className={`mx-auto mb-2 max-w-lg text-sm text-pretty ${block ? "text-danger" : "text-muted"}`}>
          {block ?? `${mapName}. ${coOp ? "You and a friend against bots." : "Versus."} ${n} ${n === 1 ? "seat" : "seats"} besides you.`}
        </p>
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
          <button
            type="button"
            data-testid="start-skirmish"
            disabled={!!block}
            onClick={onStart}
            className={`flex h-14 items-center justify-center gap-2 font-display text-sm uppercase ${block ? "bg-brass-dim text-muted" : "bg-crystal text-crystal-ink"}`}
          >
            <Swords className="size-5" />
            Start Battle
          </button>
          <button type="button" data-testid="friends" onClick={onFriends} className="bevel-btn flex h-14 items-center justify-center font-display text-sm uppercase">
            Play with friends
          </button>
          <button type="button" data-testid="randomize" onClick={onRandomize} className="flex h-11 items-center justify-center gap-2 font-display text-xs uppercase text-brass">
            <Dices className="size-4" />
            Randomize
          </button>
        </div>
      </footer>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-2">
      <span className="w-16 shrink-0 pt-3 font-display text-[10px] uppercase text-brass">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1.5">{children}</div>
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
      className={`h-11 px-3 font-display text-xs uppercase ${on ? "steel-inset text-gold" : "border border-brass-dim bg-steel-top text-ink"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
