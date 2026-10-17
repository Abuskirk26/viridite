import type { FactionId } from "@/game/data";

/** Chip and stripe classes. Colors live in the theme, matching FACTION_COLOR. */
export const FACTION_SWATCH: Record<FactionId, string> = {
  concord: "bg-concord",
  syndicate: "bg-syndicate",
  steel: "bg-faction-steel",
  prism: "bg-prism",
};
