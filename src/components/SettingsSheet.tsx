import { useEffect, useState } from "react";
import { getRenderMode, setRenderMode, subscribeRenderMode, type RenderMode } from "@/game/render3d/mode";
import { Check, CircleAlert, RefreshCw } from "lucide-react";
import { AudioBuses } from "@/components/AudioBuses";
import {
  DOCTRINES,
  doctrineOf,
  markPackReady,
  packById,
  packStatus,
  setDoctrine,
  type DoctrineId,
  type DoctrineShape,
  type SheetTab,
} from "@/game/doctrine";

const TABS: { id: SheetTab; label: string }[] = [
  { id: "game", label: "Game" },
  { id: "armies", label: "Armies" },
  { id: "controls", label: "Controls" },
  { id: "video", label: "Video" },
  { id: "sound", label: "Sound" },
];

/** 2D or 3D. The same control is on the skirmish bar, the pause menu, and Video. */
export function VersionPick({ testPrefix = "version" }: { testPrefix?: string }) {
  const [mode, setMode] = useState<RenderMode>(() => getRenderMode());
  useEffect(() => subscribeRenderMode(setMode), []);
  const choice = (id: RenderMode, label: string) => (
    <button
      type="button"
      data-testid={`${testPrefix}-${id}`}
      aria-pressed={mode === id}
      className={`h-11 min-w-14 px-3 font-display text-xs uppercase tracking-wide ${
        mode === id ? "bg-crystal text-crystal-ink" : "bg-field text-ink"
      }`}
      onClick={() => setRenderMode(id)}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center border border-brass-dim" data-testid={`${testPrefix}-pick`} role="group" aria-label="Battlefield version">
      {choice("2d", "2D")}
      {choice("3d", "3D")}
    </div>
  );
}

export function SheetHead({
  tab,
  onTab,
  onBack,
}: {
  tab: SheetTab;
  onTab: (tab: SheetTab) => void;
  onBack?: () => void;
}) {
  return (
    <header className="shrink-0 bg-field px-3 pt-3 pb-2">
      <div className="mx-auto flex w-full max-w-lg items-center justify-center gap-3">
        <span className="h-px flex-1 bg-crystal/70" />
        <h1 className="font-display text-3xl tracking-[0.18em] text-crystal">VIRIDITE</h1>
        <span className="h-px flex-1 bg-crystal/70" />
      </div>
      {onBack ? (
        <button type="button" className="mt-2 font-display text-xs uppercase tracking-widest text-brass" onClick={onBack}>
          Back to match
        </button>
      ) : null}
      <div className="mx-auto mt-3 grid w-full max-w-lg grid-cols-5 border border-brass-dim" data-testid="settings-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`sheet-${item.id}`}
            aria-pressed={tab === item.id}
            className={`h-11 font-display text-[11px] uppercase tracking-wide ${
              tab === item.id ? "bg-crystal text-crystal-ink" : "bg-field text-ink"
            }`}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
}

export function SheetBody({
  tab,
  locked,
  onDoctrine,
}: {
  tab: SheetTab;
  locked?: boolean;
  onDoctrine?: (id: DoctrineId) => void;
}) {
  const [rev, setRev] = useState(0);
  const [open, setOpen] = useState<DoctrineId | null>(null);
  const current = doctrineOf();
  const picked = packById(current);
  void rev;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3 pb-6">
      {tab === "game" && (
        <section className="flex flex-col gap-2">
          <p className="font-display text-[10px] uppercase tracking-widest text-brass">Doctrine</p>
          <p className="text-sm text-pretty text-muted">{locked ? "Locked for this match." : "The host pick. Both sides use it."}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {DOCTRINES.map((pack) => (
              <button
                key={pack.id}
                type="button"
                data-testid={`doctrine-${pack.id}`}
                disabled={locked}
                aria-pressed={current === pack.id}
                className={`flex h-11 shrink-0 items-center gap-2 border px-3 font-display text-xs uppercase ${
                  current === pack.id ? "border-crystal bg-crystal text-crystal-ink" : "border-brass-dim text-ink"
                }`}
                onClick={() => {
                  setDoctrine(pack.id);
                  onDoctrine?.(pack.id);
                  setRev((n) => n + 1);
                }}
              >
                <Mark shape={pack.shape} small />
                {pack.name}
              </button>
            ))}
          </div>
          <p className="text-sm text-pretty text-brass">{picked.feel}</p>
          <p className="text-xs text-muted">The skirmish is the match. Set the map and seats, then start, or bring friends into that same fight.</p>
        </section>
      )}
      {tab === "armies" && (
        <>
          {DOCTRINES.map((pack) => {
            const status = packStatus(pack.id);
            const ready = status === "Bundled" || status === "Ready";
            return (
              <article key={pack.id} className="flex items-center gap-3 border border-brass-dim bg-field p-3" data-testid={`army-${pack.id}`}>
                <span className="grid size-14 shrink-0 place-items-center border border-brass-dim">
                  <Mark shape={pack.shape} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg leading-none text-ink">{pack.name}</h2>
                  <p className="mt-1 text-xs text-pretty text-muted">{pack.card}</p>
                </div>
                <div className={`flex shrink-0 flex-col items-center text-xs ${ready ? "text-crystal" : status === "Update" ? "text-gold" : "text-danger"}`}>
                  <span className="font-display uppercase">{status}</span>
                  {ready ? <Check className="size-4" /> : status === "Update" ? <RefreshCw className="size-4" /> : <CircleAlert className="size-4" />}
                </div>
                <button
                  type="button"
                  data-testid={`army-action-${pack.id}`}
                  className={`h-11 shrink-0 border px-3 font-display text-xs uppercase ${
                    ready ? "border-brass-dim text-crystal" : "border-crystal bg-crystal/20 text-crystal"
                  }`}
                  onClick={() => {
                    if (pack.action === "View" || ready) setOpen(pack.id);
                    else {
                      markPackReady(pack.id);
                      setRev((n) => n + 1);
                    }
                  }}
                >
                  {ready ? "View" : pack.action}
                </button>
              </article>
            );
          })}
          <p className="pt-2 text-center font-display text-[11px] tracking-wide text-muted" data-testid="content-hash">
            Content Hash: {picked.hash}
          </p>
        </>
      )}
      {tab === "controls" && (
        <Note
          title="Controls"
          lines={["Pinch to zoom. Drag to pan. The field has no plus or minus buttons.", "Double-tap still means stop.", "Sidebar stays tabs unless Open Lattice is the doctrine."]}
        />
      )}
      {tab === "video" && (
        <>
          <Note
            title="Video"
            lines={["Sharp is the 4K bake. The phone draws a slice, not the whole sheet.", "Walker camera pulls back only on Kane Line.", "Reduced flash keeps the ring and drops the strobe.", "2D is the painted map. 3D is the Art of War view. Switch any time."]}
          />
          <div className="flex items-center justify-between gap-3 px-2">
            <p className="font-display text-xs uppercase tracking-wide text-brass">Battlefield</p>
            <VersionPick testPrefix="render" />
          </div>
          <label className="flex items-center gap-2 px-2 text-sm text-ink">
            <input
              type="checkbox"
              defaultChecked={localStorage.getItem("viridite-dmg-numbers") === "1"}
              onChange={(e) => localStorage.setItem("viridite-dmg-numbers", e.target.checked ? "1" : "0")}
            />
            Floating damage numbers
          </label>
        </>
      )}
      {tab === "sound" && (
        <section className="flex flex-col gap-3" data-testid="sound-settings">
          <p className="text-sm text-pretty text-muted">
            {locked
              ? "Applies now, while the match is paused. This phone only. Off on a row is silent. All off mutes everything."
              : "Music, advisor, and guns. Off on a row is silent. All off mutes everything."}
          </p>
          <AudioBuses live={!!locked} showMute />
          <Note
            title="Voice pack"
            lines={["Voice follows the doctrine pack.", "A missing line falls back to the Manual 96 bark."]}
          />
        </section>
      )}
      {open && (
        <div className="border border-crystal bg-field p-3" data-testid="army-preview">
          <p className="font-display text-sm uppercase text-crystal">{packById(open).name}</p>
          <p className="mt-1 text-sm text-pretty text-brass">{packById(open).feel}</p>
          <ul className="mt-2 list-disc pl-4 text-sm text-ink">
            {packById(open).rules.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">This changes the army, not the map.</p>
          <button type="button" className="mt-2 h-11 px-3 font-display text-xs uppercase text-gold" onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function Note({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="border border-brass-dim p-3">
      <h2 className="font-display text-sm uppercase tracking-widest text-crystal">{title}</h2>
      <ul className="mt-2 flex flex-col gap-2 text-sm text-pretty text-ink">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function Mark({ shape, small }: { shape: DoctrineShape; small?: boolean }) {
  const size = small ? 14 : 28;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="text-crystal">
      {shape === "square" && <rect x="5" y="5" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" />}
      {shape === "diamond" && <polygon points="14,3 25,14 14,25 3,14" fill="none" stroke="currentColor" strokeWidth="1.6" />}
      {shape === "bolt" && <polygon points="16,2 6,16 13,16 11,26 22,11 15,11" fill="currentColor" />}
      {shape === "hex" && <polygon points="14,3 24,8.5 24,19.5 14,25 4,19.5 4,8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />}
      {shape === "ring" && <circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}
