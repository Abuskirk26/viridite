import { BUILDINGS, UNITS, type BuildingId, type UnitId } from "@/game/data";
import { ERAS, eraForYear } from "@/game/eras";

function pieceLabel(id: string): string {
  if (id in UNITS) return UNITS[id as UnitId].short;
  if (id in BUILDINGS) return BUILDINGS[id as BuildingId].short;
  return id;
}

/** Host pick for the match year. Stops are the eras in eras.json. WW1 is the first stop. */
export function YearSlider({
  year,
  onChange,
  locked = false,
  dense = false,
}: {
  year: number;
  onChange?: (year: number) => void;
  locked?: boolean;
  dense?: boolean;
}) {
  const era = eraForYear(year);
  const index = Math.max(0, ERAS.findIndex((row) => row.id === era.id));
  const setIndex = (n: number) => {
    const next = ERAS[Math.max(0, Math.min(ERAS.length - 1, n))];
    if (next && !locked) onChange?.(next.year);
  };
  return (
    <section className="flex flex-col gap-2" data-testid="year-slider">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-[10px] uppercase tracking-widest text-brass">Starting year</p>
        <p className="font-display text-sm tabular-nums text-gold" data-testid="year-readout">
          {era.year}
        </p>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, ERAS.length - 1)}
        step={1}
        value={index}
        disabled={locked || !onChange}
        aria-label="Starting year"
        data-testid="year-range"
        className="h-11 w-full cursor-pointer accent-[#3dcc6e] disabled:cursor-default"
        onChange={(e) => setIndex(Number(e.target.value))}
      />
      <div className="grid grid-cols-4 gap-1" role="group" aria-label="Era">
        {ERAS.map((row, i) => (
          <button
            key={row.id}
            type="button"
            data-testid={`year-${row.id}`}
            aria-pressed={row.id === era.id}
            disabled={locked || !onChange}
            className={`h-11 px-1 font-display text-[10px] uppercase leading-tight ${
              row.id === era.id ? "bg-crystal text-crystal-ink" : "border border-brass-dim text-ink"
            }`}
            onClick={() => setIndex(i)}
          >
            {row.label}
          </button>
        ))}
      </div>
      <p className="font-display text-xs uppercase tracking-wide text-crystal">{era.name}</p>
      <p className="text-sm text-pretty text-muted">{era.blurb}</p>
      {dense ? null : (
        <div className="grid grid-cols-3 gap-1" data-testid="year-signatures">
          {era.signatures.slice(0, 3).map((id) => (
            <div key={id} className="flex min-h-11 flex-col justify-center border border-brass-dim px-2 py-1">
              <span className="font-display text-[11px] uppercase text-ink">{pieceLabel(id)}</span>
              <span className="text-[10px] uppercase tracking-wide text-brass">In this era</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-pretty text-muted">You deploy an MCV. The bar lists this era and anything older.</p>
    </section>
  );
}
