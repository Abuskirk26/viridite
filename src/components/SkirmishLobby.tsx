import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Dices, Swords } from "lucide-react";
import { AudioBuses } from "@/components/AudioBuses";
import { Arsenal } from "@/components/Arsenal";
import { FACTION_SWATCH } from "@/components/faction-style";
import { FACTION_HUE, FACTION_NAME, SEAT_NAME, BUILDINGS, DUMP_PER_SEC, HARVEST_PER_SEC, UNITS, resolveBuilding, type AiDifficulty, type AiProfile, type BuildingId, type FactionId, type ModeId, type UnitId } from "@/game/data";
import {
  AI_CHOICES,
  CREDIT_CHOICES,
  DIFFICULTY_CHOICES,
  FACTIONS,
  LOBBY_MAPS,
  OPPONENT_CHOICES,
  SIZE_CHOICES,
  SIZE_LABEL,
  SPEED_CHOICES,
  START_CHOICES,
  START_LABEL,
  TEAM_LABEL,
  aiCount,
  applyDifficulty,
  chooseOpponents,
  dockRequired,
  factionCanDock,
  listMyMaps,
  lobbyBlock,
  placeGridOn,
  setPlaceGrid,
  withNewBotSkill,
  normalBotDefaults,
  type MyMapRow,
  type SkirmishSetup,
} from "@/game/lobby";
import { MAP_LIST } from "@/game/maps";

const AI_LABEL: Record<AiProfile, string> = {
  passive: "Passive",
  raider: "Raider",
  builder: "Builder",
};

const DIFF_LABEL: Record<AiDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

const CONTROLS: { how: string; what: string }[] = [
  { how: "Two fingers", what: "Drag to pan the field. Pinch to zoom." },
  { how: "Tap", what: "Select a unit or building. Tap empty ground to deselect." },
  { how: "Drag", what: "Box-select your units." },
  { how: "Order", what: "With units selected, tap ground to move. Tap an enemy to attack." },
  { how: "Double-tap", what: "Attack-move. Or tap A-Move on the pad, then the map or the minimap." },
  { how: "Minimap", what: "Below the top bar. Enemy camps stay hidden until you scout them. Tap or drag to jump. Tap while A-Move is on to send troops." },
  { how: "Build", what: "Landscape: right-hand column. Portrait: bottom drawer. Ghost is green if legal, red if blocked." },
  { how: "Orders", what: "Stop, Guard, Attack-Move, and Scatter sit on the bottom bar." },
  { how: "Pause", what: "Restart uses this same lobby setup." },
  { how: "Sound", what: "Music, advisor, and guns. Lobby sets each bus. Mute kills all of them." },
];

export function SkirmishLobby({
  setup,
  hasSave,
  onChange,
  onStart,
  onPractice,
  onRandomize,
  onContinue,
  onFriends,
  onEdit,
  onRemix,
  bare,
}: {
  setup: SkirmishSetup;
  hasSave: boolean;
  onChange: (partial: Partial<SkirmishSetup>) => void;
  onStart: () => void;
  onPractice: () => void;
  onRandomize: () => void;
  onContinue: () => void;
  onFriends: () => void;
  onEdit: () => void;
  onRemix: (id: string) => void;
  bare?: boolean;
}) {
  const block = lobbyBlock(setup);
  const map = MAP_LIST.find((m) => m.id === setup.mapId);
  const [deviceMaps, setDeviceMaps] = useState(false);
  const [book, setBook] = useState(false);
  const [placeGrid, setPlaceGridOn] = useState(false);
  useEffect(() => setPlaceGridOn(placeGridOn()), []);
  useEffect(() => {
    setDeviceMaps(true);
  }, []);
  const mine = listMyMaps().filter((row) => deviceMaps || row.group !== "saved");
  const picked = mine.find((row) => row.id === setup.customId) ?? null;
  const seated = aiCount(setup);
  const note = block
    ? block
    : picked?.line
      ? `${picked.line} Suggested: ${picked.credits?.toLocaleString("en-US")} credits, fog ${picked.fog ? "on" : "off"}${picked.walls ? ", walls on" : ""}.`
      : picked
        ? picked.deep
          ? `${picked.name}. Deep water. Dock and boats are in.`
          : `${picked.name}. No deep water. Dock and boats stay hidden.`
        : setup.mapId === "dry"
        ? "Dry Basin hides the Dock and every naval unit."
        : setup.mapId === "isles"
          ? "Island Chain requires a Dock. Every corner has a shore."
          : setup.mapId === "river"
            ? "River Split. Every corner sits on a shore so a Dock is legal."
            : map
              ? `${map.name}. ${map.blurb}`
              : "";
  const sizeNote = picked
    ? ` ${picked.w}×${picked.h}, ${picked.starts} starts.`
    : setup.size === "skirmish"
      ? " Skirmish, 64²."
      : setup.size === "large"
        ? " Large, 96²."
        : setup.size === "warzone"
          ? " Warzone, 128²."
          : " Continent, 192².";
  const teamNote =
    setup.teams === "tvt"
      ? " Co-op: you and East versus North and South."
      : seated === 1
        ? " One opponent, starting farthest from you."
        : seated === 2
          ? " Two opponents: North, then East."
          : " Three opponents: North, East, and South.";
  const teamOk = !picked || picked.starts >= 4;

  if (book) {
    return <Arsenal faction={setup.player} onBack={() => setBook(false)} />;
  }

  return (
    <main className={`${bare ? "" : "h-dvh"} touch-pan-y overflow-y-auto bg-field`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 lg:h-dvh lg:flex-row lg:overflow-hidden">
        <section className="steel flex flex-col gap-2 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {bare ? (
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="open-arsenal"
                onClick={() => setBook(true)}
                className="bevel-btn flex h-11 items-center gap-1 px-2 font-display text-xs uppercase"
              >
                <BookOpen className="size-4" />
                Troops
              </button>
            </div>
          ) : (
          <header className="flex items-center gap-3">
            <CrystalMark />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs uppercase tracking-widest text-crystal">Skirmish lobby</p>
              <h1 className="font-display text-3xl leading-none tracking-wide text-ink">VIRIDITE</h1>
            </div>
            <button
              type="button"
              data-testid="open-arsenal"
              onClick={() => setBook(true)}
              className="bevel-btn ml-auto flex h-11 items-center gap-1 px-2 font-display text-xs uppercase"
            >
              <BookOpen className="size-4" />
              Troops
            </button>
          </header>
          )}

          <div className="flex flex-col gap-2">
            <SegmentRow label="Opponents" testId="lobby-opponents">
              {OPPONENT_CHOICES.map((n) => (
                <Segment
                  key={n}
                  testId={`opponents-${n}`}
                  active={setup.teams === "tvt" ? n === 2 : setup.opponents === n}
                  label={`${n} ${n === 1 ? "opponent" : "opponents"}`}
                  onClick={() => onChange({ ...chooseOpponents(setup, n), ...withNewBotSkill(setup, n) })}
                >
                  {n}
                </Segment>
              ))}
            </SegmentRow>
            <p className="text-xs text-pretty text-muted">2 grows the map to Large. 3 grows it to Warzone.</p>
            <SegmentRow label="Map size" testId="lobby-size">
              {SIZE_CHOICES.map((id) => (
                <Segment
                  key={id}
                  testId={`size-${id}`}
                  active={setup.size === id}
                  label={`${SIZE_LABEL[id]} map`}
                  onClick={() => onChange({ size: id })}
                >
                  {SIZE_LABEL[id]}
                </Segment>
              ))}
            </SegmentRow>
            {teamOk && (
              <SegmentRow label="Teams" testId="lobby-teams">
                <Segment
                  testId="teams-ffa"
                  active={setup.teams === "ffa"}
                  label={TEAM_LABEL.ffa}
                  onClick={() => onChange({ teams: "ffa" })}
                >
                  Versus
                </Segment>
                <Segment
                  testId="teams-tvt"
                  active={setup.teams === "tvt"}
                  label="Co-op. You and East against North and South."
                  onClick={() => onChange({ ...chooseOpponents({ ...setup, teams: "tvt" }, 2), ...withNewBotSkill(setup, 2) })}
                >
                  Co-op
                </Segment>
              </SegmentRow>
            )}
            <SegmentRow label="Start" testId="lobby-start">
              {START_CHOICES.map((id) => (
                <Segment
                  key={id}
                  testId={`start-${id}`}
                  active={setup.start === id}
                  label={`${START_LABEL[id]} start`}
                  onClick={() => onChange({ start: id })}
                >
                  {START_LABEL[id]}
                </Segment>
              ))}
            </SegmentRow>
            <SegmentRow label="Difficulty" testId="lobby-difficulty">
              {DIFFICULTY_CHOICES.map((id) => (
                <Segment
                  key={id}
                  testId={`diff-${id}`}
                  active={setup.difficulty === id}
                  label={`${DIFF_LABEL[id]} difficulty`}
                  onClick={() => onChange(applyDifficulty(setup, id))}
                >
                  {DIFF_LABEL[id]}
                </Segment>
              ))}
            </SegmentRow>
            <p className="text-xs text-muted">
              Easy scouts until 6:00 and attacks after 8:00. Normal harasses at 4:00 and pushes at 6:30. Hard attacks at 3:00. Those times are the in-game clock.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <FactionRow label="You">
              {FACTIONS.map((id) => (
                <FactionChip
                  key={id}
                  id={id}
                  testId={`you-${id}`}
                  active={setup.player === id}
                  illegal={dockRequired(setup.mapId) && !factionCanDock(id)}
                  onClick={() => onChange({ player: id, ...normalBotDefaults() })}
                />
              ))}
            </FactionRow>
            <FactionRow label="Enemy">
              {FACTIONS.map((id) => (
                <FactionChip
                  key={id}
                  id={id}
                  testId={`enemy-${id}`}
                  active={setup.enemy === id}
                  illegal={dockRequired(setup.mapId) && !factionCanDock(id)}
                  onClick={() => onChange({ enemy: id, bots: [id, setup.bots[1], setup.bots[2]], ...normalBotDefaults() })}
                />
              ))}
            </FactionRow>
            <Row label="Credits">
              {CREDIT_CHOICES.map((n) => (
                <Chip
                  key={n}
                  testId={`credits-${n}`}
                  active={setup.credits === n}
                  label={`${n.toLocaleString("en-US")} starting credits`}
                  onClick={() => onChange({ credits: n })}
                >
                  {n === 10000 ? "10k" : n === 5000 ? "5k" : "2k"}
                </Chip>
              ))}
            </Row>
            <div>
            <div className="flex items-start gap-2">
              <span className="w-16 shrink-0 pt-3 font-display text-xs uppercase text-brass">Map</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                <Chip
                  testId="map-fourisles"
                  active={setup.customId === "tpl:fourisles"}
                  label="Four Isles. Four islands, beaches, and viridite."
                  onClick={() => onChange({ customId: "tpl:fourisles", mapId: "coast", size: "large", ...normalBotDefaults() })}
                >
                  Isles
                </Chip>
                {LOBBY_MAPS.map((m) => (
                  <Chip
                    key={m.id}
                    testId={`map-${m.id}`}
                    active={!setup.customId && setup.mapId === m.id}
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
              </div>
            </div>
              <div className="sticky top-0 z-10 mt-2 flex flex-col gap-2 border-y border-brass-dim bg-field py-2">
                <p
                  data-testid="lobby-note"
                  className={`text-sm text-pretty ${block ? "text-danger" : "text-muted"}`}
                >
                  {block ? block : `${note}${sizeNote}${teamNote}`}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="randomize"
                    onClick={onRandomize}
                    className="bevel-btn flex h-14 items-center justify-center gap-2 font-display text-base uppercase tracking-widest"
                  >
                    <Dices className="size-5" />
                    Randomize
                  </button>
                  <button
                    type="button"
                    data-testid="practice"
                    onClick={onPractice}
                    className="bevel-btn flex h-14 items-center justify-center gap-2 font-display text-base uppercase tracking-widest"
                  >
                    Practice
                  </button>
                  <button
                    type="button"
                    data-testid="start-skirmish"
                    disabled={!!block}
                    onClick={onStart}
                    className={`flex h-14 items-center justify-center gap-2 font-display text-base uppercase tracking-widest ${
                      block ? "bg-brass-dim text-muted" : "bg-crystal text-crystal-ink"
                    }`}
                  >
                    <Swords className="size-5" />
                    Start Battle
                  </button>
                </div>
                {hasSave && (
                  <button
                    type="button"
                    data-testid="continue-match"
                    onClick={onContinue}
                    className="bevel-btn flex h-12 items-center justify-center font-display text-sm uppercase tracking-widest"
                  >
                    Continue last match
                  </button>
                )}
                <button
                  type="button"
                  data-testid="friends"
                  onClick={onFriends}
                  className="bevel-btn flex h-12 items-center justify-center font-display text-sm uppercase tracking-widest"
                >
                  Play with friends
                </button>
                <p className="text-xs text-pretty text-muted">
                  Host a room, join with a code, or play local on this phone. Same base and units. No unlocks.
                </p>
              </div>
              <div className="mt-2" data-testid="my-maps">
                <span className="font-display text-[10px] uppercase tracking-wide text-gold">Featured</span>
                <div className="mt-1">
                  {mine
                    .filter((row) => row.group === "featured")
                    .map((row) => (
                      <FeaturedRow key={row.id} row={row} active={setup.customId === row.id} onPick={() => pickMap(onChange, setup, row)} onRemix={() => onRemix(row.id)} />
                    ))}
                </div>
              </div>
              <Fold title="Classic and saved maps" testId="more-maps">
                <p className="font-display text-[10px] uppercase tracking-wide text-brass">Classic</p>
                {mine
                  .filter((row) => row.group === "classic")
                  .map((row) => (
                    <MapRow key={row.id} row={row} active={setup.customId === row.id} onPick={() => pickMap(onChange, setup, row)} />
                  ))}
                {mine.some((row) => row.group === "saved") && (
                  <p className="mt-2 font-display text-[10px] uppercase tracking-wide text-brass">On this device</p>
                )}
                {mine
                  .filter((row) => row.group === "saved")
                  .map((row) => (
                    <MapRow key={row.id} row={row} active={setup.customId === row.id} onPick={() => pickMap(onChange, setup, row)} />
                  ))}
              </Fold>
              <button type="button" data-testid="open-editor" className="bevel-btn mt-2 h-12 w-full font-display text-sm uppercase" onClick={onEdit}>
                Map editor
              </button>
            </div>
          </div>

          <Fold title="More rules" testId="more-rules">
            <Row label="AI">
              {AI_CHOICES.map((id) => (
                <Chip
                  key={id}
                  testId={`ai-${id}`}
                  active={setup.ai === id}
                  label={`${AI_LABEL[id]} stance`}
                  onClick={() => onChange({ ai: id })}
                >
                  {AI_LABEL[id]}
                </Chip>
              ))}
            </Row>
            <p className="text-xs text-pretty text-muted">
              Easy and Normal start as Builder. Raider is the Hard personality. You can still tap Raider yourself on Easy or Normal. The attack clock does not move.
            </p>
            <SegmentRow label="AI stance" testId="lobby-stance-mode">
              <Segment
                testId="stance-global"
                active={setup.stanceMode === "global"}
                label="One stance for every opponent"
                onClick={() => onChange({ stanceMode: "global" })}
              >
                Global
              </Segment>
              <Segment
                testId="stance-seat"
                active={setup.stanceMode === "seat"}
                label="A stance for each seat"
                onClick={() => onChange({ stanceMode: "seat" })}
              >
                Each seat
              </Segment>
            </SegmentRow>
            {setup.stanceMode === "seat" &&
              ([0, 1, 2] as const).slice(0, seated).map((seat) => (
                <SegmentRow key={seat} label={SEAT_NAME[seat + 1] ?? "Seat"} testId={`lobby-seat-${seat}`}>
                  {AI_CHOICES.map((id) => (
                    <Segment
                      key={id}
                      testId={`seat-${seat}-${id}`}
                      active={setup.stances[seat] === id}
                      label={`${SEAT_NAME[seat + 1]} ${AI_LABEL[id]}`}
                      onClick={() => {
                        const stances = setup.stances.slice() as SkirmishSetup["stances"];
                        stances[seat] = id;
                        onChange({ stances, stanceMode: "seat" });
                      }}
                    >
                      {AI_LABEL[id]}
                    </Segment>
                  ))}
                </SegmentRow>
              ))}
            {setup.teams === "tvt" && (
              <SegmentRow label="Shared vision" testId="lobby-shared">
                <Segment
                  testId="shared-on"
                  active={setup.shared}
                  label="Shared vision on. Allies see what you see."
                  onClick={() => onChange({ shared: true })}
                >
                  On
                </Segment>
                <Segment
                  testId="shared-off"
                  active={!setup.shared}
                  label="Shared vision off."
                  onClick={() => onChange({ shared: false })}
                >
                  Off
                </Segment>
              </SegmentRow>
            )}
            <SegmentRow label="Walls" testId="lobby-walls">
              <Segment
                testId="walls-on"
                active={setup.walls}
                label="Walls on. Sandbags and concrete are buildable."
                onClick={() => onChange({ walls: true })}
              >
                On
              </Segment>
              <Segment
                testId="walls-off"
                active={!setup.walls}
                label="Walls off. Sandbags and concrete leave the bar."
                onClick={() => onChange({ walls: false })}
              >
                Off
              </Segment>
            </SegmentRow>
            <Row label="Fog">
              <Chip testId="fog-on" active={setup.fog} label="Fog of war on" onClick={() => onChange({ fog: true })}>
                On
              </Chip>
              <Chip testId="fog-off" active={!setup.fog} label="Fog of war off" onClick={() => onChange({ fog: false })}>
                Off
              </Chip>
            </Row>
            <Row label="Grid">
              <Chip
                testId="place-grid-off"
                active={!placeGrid}
                label="Place grid off. No range squares while building."
                onClick={() => {
                  setPlaceGrid(false);
                  setPlaceGridOn(false);
                }}
              >
                Off
              </Chip>
              <Chip
                testId="place-grid-on"
                active={placeGrid}
                label="Place grid on. Shows where a building can go."
                onClick={() => {
                  setPlaceGrid(true);
                  setPlaceGridOn(true);
                }}
              >
                On
              </Chip>
            </Row>
            <Row label="Crates">
              <Chip testId="crates-on" active={setup.crates} label="Crates on" onClick={() => onChange({ crates: true })}>
                On
              </Chip>
              <Chip testId="crates-off" active={!setup.crates} label="Crates off" onClick={() => onChange({ crates: false })}>
                Off
              </Chip>
            </Row>
            <Row label="Speed">
              {SPEED_CHOICES.map((n) => (
                <Chip
                  key={n}
                  testId={`speed-${n}`}
                  active={setup.speed === n}
                  label={`${n} times speed`}
                  onClick={() => onChange({ speed: n })}
                >
                  {n}×
                </Chip>
              ))}
            </Row>
            <Row label="Win">
              <Chip
                testId="mode-destroy"
                active={setup.mode === "destroy"}
                label="Destroy the enemy yard"
                onClick={() => onChange({ mode: "destroy" satisfies ModeId })}
              >
                Yard
              </Chip>
              <Chip
                testId="mode-survive"
                active={setup.mode === "survive"}
                label="Hold for ten minutes"
                onClick={() => onChange({ mode: "survive" })}
              >
                Hold
              </Chip>
            </Row>
            <SegmentRow label="Show AI intent" testId="lobby-ai-intent">
              <Segment
                testId="ai-intent-on"
                active={setup.showAi}
                label="Show AI intent. Host only."
                onClick={() => onChange({ showAi: true })}
              >
                On
              </Segment>
              <Segment
                testId="ai-intent-off"
                active={!setup.showAi}
                label="Hide AI intent"
                onClick={() => onChange({ showAi: false })}
              >
                Off
              </Segment>
            </SegmentRow>
            <AudioBuses />
          </Fold>
        </section>

        <section className="steel flex flex-col gap-3 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <h2 className="font-display text-xl uppercase tracking-widest text-gold">Field manual</h2>
          <EconomyTable />
          <ul className="flex flex-col gap-2 text-sm">
            {CONTROLS.map((row) => (
              <li key={row.how} className="flex gap-2 border-b border-brass-dim pb-2">
                <span className="w-24 shrink-0 font-display text-xs uppercase tracking-wide text-crystal">{row.how}</span>
                <span className="text-pretty text-ink">{row.what}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-pretty text-muted">
            Destroy the enemy Construction Yard, or hold the clock. You lose only if the yard is gone and no MCV is left
            to deploy. Best played sideways.
          </p>
        </section>
      </div>
    </main>
  );
}

function EconomyTable() {
  const structures: BuildingId[] = [
    "power",
    "advpower",
    "yard",
    "refinery",
    "supply",
    "barracks",
    "factory",
    "tower",
    "aa",
    "helipad",
    "dock",
    "radar",
    "stealth",
  ];
  const units: UnitId[] = ["rifle", "rocket", "scout", "tank", "harvester"];
  const plant = resolveBuilding("power", "concord").powerOut;
  const base = BUILDINGS.yard.powerUse + BUILDINGS.refinery.powerUse + BUILDINGS.barracks.powerUse;
  return (
    <div className="flex flex-col gap-2" data-testid="economy-table">
      <h3 className="font-display text-xs uppercase tracking-widest text-brass">Cost and power</h3>
      <p className="text-xs text-pretty text-muted">
        One Concord plant (+{plant}) runs the Yard, a Supply Center, the Refinery, and Barracks ({base + BUILDINGS.supply.powerUse}) plus room for a tower or two. A second plant is for the War Factory. Supply Centers drip credits while powered. Build the hall, then the units it trains.
      </p>
      <p className="text-xs text-pretty text-ink">
        2,000 is Tiny — Power, Refinery, and Barracks, then crystal pays the rest. 5,000 is Normal — a second plant, a War
        Factory, a scout, and a tank before the first big haul. 10,000 is Huge — Advanced Power and a platoon. The field still
        matters.
      </p>
      <p className="text-xs text-pretty text-muted">
        Harvesters pull {HARVEST_PER_SEC} a second into a {UNITS.harvester.cargo} bay and dump at {DUMP_PER_SEC}. Replacing the
        first one costs {UNITS.harvester.cost.toLocaleString("en-US")} and takes {UNITS.harvester.time}s. Sandbag {BUILDINGS.sandbag.cost},
        gate {BUILDINGS.gate.cost}, concrete {BUILDINGS.wall.cost}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="font-display uppercase tracking-wide text-brass">
              <th className="py-1 pr-2">Structure</th>
              <th className="py-1 pr-2">Cost</th>
              <th className="py-1 pr-2">Time</th>
              <th className="py-1">Power</th>
            </tr>
          </thead>
          <tbody>
            {structures.map((id) => {
              const concord = resolveBuilding(id, "concord");
              const syndicate = resolveBuilding(id, "syndicate");
              const power =
                concord.powerOut > 0
                  ? `+${concord.powerOut} / +${syndicate.powerOut}`
                  : concord.powerUse > 0
                    ? `−${concord.powerUse}`
                    : "0";
              return (
                <tr key={id} className="border-t border-brass-dim text-ink">
                  <td className="py-1 pr-2">{concord.name}</td>
                  <td className="py-1 pr-2 tabular-nums">{concord.cost.toLocaleString("en-US")}</td>
                  <td className="py-1 pr-2 tabular-nums">{concord.time}s</td>
                  <td className="py-1 whitespace-nowrap">{power}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] uppercase tracking-wide text-brass">Power is Concord / Syndicate on the plants.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="font-display uppercase tracking-wide text-brass">
              <th className="py-1 pr-2">Unit</th>
              <th className="py-1 pr-2">Cost</th>
              <th className="py-1">Time</th>
            </tr>
          </thead>
          <tbody>
            {units.map((id) => {
              const u = UNITS[id];
              return (
                <tr key={id} className="border-t border-brass-dim text-ink">
                  <td className="py-1 pr-2">{u.name}</td>
                  <td className="py-1 pr-2 tabular-nums">{u.cost.toLocaleString("en-US")}</td>
                  <td className="py-1 tabular-nums">{u.time}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pickMap(onChange: (partial: Partial<SkirmishSetup>) => void, _setup: SkirmishSetup, row: MyMapRow) {
  onChange({
    customId: row.id,
    mapId: row.deep ? "coast" : "dry",
    size: row.size,
    ...(row.credits != null ? { credits: row.credits } : {}),
    ...(row.fog != null ? { fog: row.fog } : {}),
    ...(row.walls != null ? { walls: row.walls } : {}),
    ...normalBotDefaults(),
  });
}

function FeaturedRow({ row, active, onPick, onRemix }: { row: MyMapRow; active: boolean; onPick: () => void; onRemix: () => void }) {
  const suggest = row.credits != null ? `${row.credits.toLocaleString("en-US")} · Fog ${row.fog ? "on" : "off"}${row.walls ? " · Walls on" : ""}` : "";
  return (
    <div className={`mb-1 flex items-stretch ${active ? "steel-inset" : "border border-brass-dim bg-steel-top"}`}>
      <button type="button" data-testid={`my-map-${row.id}`} aria-pressed={active} className="min-h-11 min-w-0 flex-1 px-2 py-1.5 text-left" onClick={onPick}>
        <span className={`block font-display text-sm uppercase ${active ? "text-gold" : "text-ink"}`}>{row.name}</span>
        <span className={`block text-xs text-pretty ${active ? "text-ink" : "text-ink"}`}>{row.line}</span>
        <span className={`block font-display text-[10px] uppercase ${active ? "text-brass" : "text-brass-dim"}`}>
          {row.w}×{row.h} · {row.starts} starts · {row.deep ? "Naval" : "Dry"} · {suggest}
        </span>
      </button>
      <button
        type="button"
        data-testid={`remix-${row.id}`}
        className={`h-11 shrink-0 self-center px-2 font-display text-xs uppercase ${active ? "text-gold" : "text-ink"}`}
        onClick={onRemix}
      >
        Remix
      </button>
    </div>
  );
}

function MapRow({ row, active, onPick }: { row: MyMapRow; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      data-testid={`my-map-${row.id}`}
      aria-pressed={active}
      className={`mb-1 flex h-11 w-full items-center gap-2 px-2 text-left ${active ? "steel-inset text-gold" : "border border-brass-dim bg-steel-top text-ink"}`}
      onClick={onPick}
    >
      <span className="min-w-0 flex-1 truncate font-display text-sm uppercase">{row.name}</span>
      <span className={`shrink-0 font-display text-[11px] tabular-nums ${active ? "text-brass" : "text-brass-dim"}`}>
        {row.w}×{row.h}
      </span>
      <span className={`shrink-0 font-display text-[11px] ${active ? "text-brass" : "text-brass-dim"}`}>{row.starts} starts</span>
      <span className={`w-12 shrink-0 text-right font-display text-[11px] uppercase ${active ? "text-crystal" : "text-brass-dim"}`}>
        {row.deep ? "Naval" : "Dry"}
      </span>
    </button>
  );
}

function Fold({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <details className="mt-2 border border-brass-dim bg-steel-top" data-testid={testId}>
      <summary className="flex h-11 cursor-pointer list-none items-center px-2 font-display text-sm uppercase tracking-wide text-gold [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="flex flex-col gap-2 border-t border-brass-dim p-2">{children}</div>
    </details>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-display text-xs uppercase text-brass">{label}</span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">{children}</div>
    </div>
  );
}

function Chip({
  children,
  active,
  label,
  onClick,
  testId,
}: {
  children: ReactNode;
  active: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={`flex h-12 min-w-14 flex-1 shrink-0 items-center justify-center px-2 font-display text-sm whitespace-nowrap uppercase ${
        active ? "steel-inset text-gold" : "bevel-btn"
      }`}
    >
      {children}
    </button>
  );
}

function FactionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display text-[10px] uppercase tracking-wide text-brass">{label}</span>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

function FactionChip({
  id,
  active,
  illegal,
  testId,
  onClick,
}: {
  id: FactionId;
  active: boolean;
  illegal: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={illegal ? `${FACTION_NAME[id]}, ${FACTION_HUE[id]}, no dock` : `${FACTION_NAME[id]}, ${FACTION_HUE[id]}`}
      aria-pressed={active}
      disabled={illegal}
      data-testid={testId}
      onClick={onClick}
      className={`flex h-12 items-stretch overflow-hidden ${illegal ? "bg-danger text-ink" : active ? "steel-inset" : "bevel-btn"}`}
    >
      <span className={`w-2 shrink-0 ${illegal ? "bg-ink" : FACTION_SWATCH[id]}`} />
      <span className="flex min-w-0 flex-1 flex-col items-start justify-center px-2">
        <span className={`truncate font-display text-sm uppercase leading-none ${active && !illegal ? "text-gold" : "text-ink"}`}>{FACTION_NAME[id]}</span>
        <span className={`font-display text-[10px] uppercase ${active && !illegal ? "text-brass" : "text-brass-dim"}`}>{FACTION_HUE[id]}</span>
      </span>
    </button>
  );
}

function SegmentRow({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1" data-testid={testId}>
      <span className="font-display text-[10px] uppercase tracking-wide text-brass">{label}</span>
      <div role="group" aria-label={label} className="flex w-full">
        {children}
      </div>
    </div>
  );
}

function Segment({
  children,
  active,
  label,
  onClick,
  testId,
}: {
  children: ReactNode;
  active: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={`h-[44px] min-h-[44px] min-w-[44px] flex-1 border border-brass-dim px-1 font-display text-sm uppercase ${
        active ? "steel-inset text-gold" : "bevel-btn"
      }`}
    >
      {children}
    </button>
  );
}

function CrystalMark() {
  return (
    <svg viewBox="0 0 64 64" className="size-11 shrink-0" aria-hidden>
      <polygon points="32,4 54,26 32,60 10,26" className="fill-crystal opacity-70" />
      <polygon points="32,4 54,26 32,60" className="fill-crystal" />
      <polygon points="32,8 42,24 32,20" className="fill-ink" />
    </svg>
  );
}
