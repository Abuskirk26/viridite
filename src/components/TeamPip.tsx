import { teamStyle } from "@/game/data";

/** Seat mark from TEAM_STYLES. Shape is the colorblind tell. At least 12 px. */
export function TeamPip({
  team,
  eliminated = false,
  size = 12,
}: {
  team: number;
  eliminated?: boolean;
  size?: number;
}) {
  const style = teamStyle(team);
  const color = eliminated ? "#8d8478" : style.color;
  const s = Math.max(12, size);
  const inset = 1.5;
  const stroke = "#14110e";
  const sw = 1.25;
  const mid = s / 2;
  const d = s / 2 - inset;
  const common = { fill: color, stroke, strokeWidth: sw, strokeLinejoin: "round" as const };
  let body;
  if (style.shape === "circle") body = <circle cx={mid} cy={mid} r={d} {...common} />;
  else if (style.shape === "square") body = <rect x={inset} y={inset} width={s - inset * 2} height={s - inset * 2} {...common} />;
  else if (style.shape === "diamond") {
    body = <polygon points={`${mid},${mid - d} ${mid + d},${mid} ${mid},${mid + d} ${mid - d},${mid}`} {...common} />;
  } else {
    body = <polygon points={`${mid},${inset} ${mid + d * 0.92},${mid + d * 0.82} ${mid - d * 0.92},${mid + d * 0.82}`} {...common} />;
  }
  return (
    <svg
      data-testid="team-pip"
      data-team={team}
      data-shape={style.shape}
      data-color={color}
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {body}
    </svg>
  );
}
