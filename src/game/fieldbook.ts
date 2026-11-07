/**
 * Field book. One read of the canonical records.
 * Inclusion here does not put a structure on the build list.
 */

import {
  BUILDINGS,
  BUILD_ORDER,
  DETECT_SCOUT,
  FACTION_IDS,
  FACTION_NAME,
  SIGHT,
  SILO_DRIP,
  SUPPLY_DRIP,
  UNITS,
  UNIT_ORDER,
  YARD_DRIP,
  airTier,
  canBuild,
  canTrain,
  commandCost,
  counterMul,
  matchupTag,
  resolveBuilding,
  resolveUnit,
  supplyShare,
  unitRequires,
  type ArmorClass,
  type BuildingId,
  type FactionId,
  type ResolvedBuilding,
  type ResolvedUnit,
  type UnitId,
} from "./data.ts";
import { buildingUnlocks, unitUnlocks } from "./eras.ts";
import { hallSheetName } from "./hallart.ts";

/**
 * Own isometric sheet in public/art/iso. heli.png is not a unit.
 * Missing ids stay labelled. They do not borrow another unit's picture.
 */
const UNIT_SHEETS = new Set<UnitId>([
  "rifle",
  "rocket",
  "marksman",
  "wader",
  "vanguard",
  "engineer",
  "tank",
  "medium",
  "scout",
  "razor",
  "scatter",
  "artillery",
  "apc",
  "harvester",
  "chinook",
  "attackheli",
  "bomber",
]);

export type PortraitSpec =
  | { kind: "sheet"; file: string; src: string }
  | { kind: "label"; label: string; caption: string };

export type StructureAccess = "menu" | "deploy" | "reference";

export type StatLine = { label: string; value: string; hint?: string };

export type BookUnit = { id: UnitId; u: ResolvedUnit; home: FactionId[]; locked: boolean };
export type BookHall = {
  id: BuildingId;
  b: ResolvedBuilding;
  home: FactionId[];
  access: StructureAccess;
  locked: boolean;
};

/** Deploy unpack in tickDeploy is dt/2 until 1, which is this many seconds. The yard record uses the same number. */
export const MCV_UNPACK_SECONDS = 2;

/**
 * Yard gone and no MCV on the field: tickRebuild starts this countdown.
 * An MCV on the field, not loaded in a transport, freezes the remaining time.
 * Deploying it restores the yard and clears the clock.
 */
export const REBUILD_SECONDS = 60;

export const MCV_NOTE =
  "No weapon. Deploying it takes 2 seconds, removes the vehicle, and leaves a finished Construction Yard. An MCV on the field—not loaded in a transport—freezes the remaining countdown where it is. Gaining that MCV does not clear the clock and does not start it over. Deploying the MCV restores the yard and clears the clock.";

export const YARD_NOTE =
  "Not bought from the build list. An MCV deploys into it. After this side has had a yard, losing every standing yard starts a 60 second rebuild clock when no MCV is on the field. An MCV on the field—not loaded in a transport—freezes the remaining countdown, including one gained during the countdown. Gaining that MCV does not clear the clock and does not start it over. Deploying it restores the yard and clears the clock. At 0, with no yard and no MCV, that side is eliminated. Other buildings and units do not stop the clock. Wiping the army is a separate loss.";

export function bookUnitIds(): UnitId[] {
  const known = Object.keys(UNITS) as UnitId[];
  const ordered = UNIT_ORDER.filter((id) => known.includes(id));
  const rest = known.filter((id) => !ordered.includes(id));
  return [...ordered, ...rest];
}

export function bookBuildingIds(): BuildingId[] {
  const known = Object.keys(BUILDINGS) as BuildingId[];
  const head: BuildingId[] = [];
  if (known.includes("yard")) head.push("yard");
  for (const id of BUILD_ORDER) {
    if (known.includes(id) && !head.includes(id)) head.push(id);
  }
  for (const id of known) {
    if (!head.includes(id)) head.push(id);
  }
  return head;
}

export function ownersOf(kind: "unit" | "building", id: UnitId | BuildingId): FactionId[] {
  return FACTION_IDS.filter((f) => (kind === "unit" ? canTrain(id as UnitId, f) : canBuild(id as BuildingId, f)));
}

/** Menu entries are BUILD_ORDER. The yard is the MCV deploy. Anything else is a record, not a purchase. */
export function structureAccess(id: BuildingId): StructureAccess {
  if (id === "yard") return "deploy";
  if ((BUILD_ORDER as readonly string[]).includes(id)) return "menu";
  return "reference";
}

export function bookUnits(faction: FactionId): BookUnit[] {
  return bookUnitIds().map((id) => {
    const home = ownersOf("unit", id);
    return { id, u: resolveUnit(id, faction), home, locked: !home.includes(faction) };
  });
}

export function bookHalls(faction: FactionId): BookHall[] {
  return bookBuildingIds().map((id) => {
    const home = ownersOf("building", id);
    const access = structureAccess(id);
    return {
      id,
      b: resolveBuilding(id, faction),
      home,
      access,
      locked: access === "menu" && !home.includes(faction),
    };
  });
}

export function unitPortrait(id: UnitId): PortraitSpec {
  if (UNIT_SHEETS.has(id)) return { kind: "sheet", file: id, src: `/art/iso/${id}.png` };
  return { kind: "label", label: UNITS[id].short, caption: "No picture" };
}

export function buildingPortrait(id: BuildingId): PortraitSpec {
  const file = hallSheetName(id);
  if (file && file === id) return { kind: "sheet", file, src: `/art/iso/${file}.png` };
  return { kind: "label", label: BUILDINGS[id].short, caption: "No picture" };
}

/** Opaque content box. A null result is an empty plate. */
export function boundsOfAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 16,
): { sx: number; sy: number; sw: number; sh: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if ((data[row + x * 4 + 3] ?? 0) <= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}

/**
 * Fit a cropped sheet inside the card. Aspect stays. The ground contact sits on the bottom, centered.
 * That is the same pivot the battlefield uses for these sheets.
 */
export function fitSheet(
  sw: number,
  sh: number,
  boxW: number,
  boxH: number,
): { dw: number; dh: number; dx: number; dy: number } {
  const aspect = sh / Math.max(1, sw);
  let dw = boxW;
  let dh = dw * aspect;
  if (dh > boxH) {
    dh = boxH;
    dw = dh / Math.max(0.0001, aspect);
  }
  return { dw, dh, dx: (boxW - dw) / 2, dy: boxH - dh };
}

function pace(speed: number): string {
  if (speed >= 4.2) return "Very fast";
  if (speed >= 3) return "Fast";
  if (speed >= 2) return "Medium";
  if (speed >= 1.3) return "Slow";
  return "Very slow";
}

function locoLabel(u: ResolvedUnit): string {
  if (u.loco === "air") return "Aircraft";
  if (u.loco === "sea") return "Ship";
  if (u.loco === "amphib") return "Amphibious";
  if (u.armor === "infantry") return "Infantry";
  return "Vehicle";
}

export function unitBlurb(u: ResolvedUnit): string {
  if (u.id === "mcv") return MCV_NOTE;
  if (u.id === "harvester") return `No gun. Pulls crystal into a ${u.cargo} bay and dumps it at a refinery.`;
  if (u.id === "engineer") {
    return "No gun. It captures a neutral or enemy building and is spent. On a wrecked bridge it repairs the deck instead.";
  }
  const tag = matchupTag(u.id);
  const match = tag ? ` ${tag.detail[0]!.toUpperCase()}${tag.detail.slice(1)}.` : "";
  const air = u.hitsAir || (u.vsAir ?? 0) > 0 ? " Can hit aircraft." : "";
  const rearm = u.magazine ? " Returns to a pad to rearm." : "";
  const cloak = u.id === "scout" ? ` Spots cloaked infantry inside ${DETECT_SCOUT}.` : "";
  const hidden = u.stealth ? " Hidden until it fires." : "";
  return `${locoLabel(u)}.${match}${air}${rearm}${cloak}${hidden}`;
}

export function siloBlurb(): string {
  return `Not on the build list. Maps may plant it neutral, and it pays nothing while neutral. After a side captures it, it adds ${SILO_DRIP} credits per second while that side's grid is on. Its storage field is not a credit cap. Numbers here are the record. A scenario may plant a renamed copy with its own power draw.`;
}

export function spanBlurb(): string {
  return "Placed with the map. It is not built or sold, and it stays neutral. Wrecking it drops the deck. An engineer repairs the wreck. It does not keep a side in the match.";
}

export function structureBlurb(id: BuildingId, b: ResolvedBuilding): string {
  if (id === "yard") return YARD_NOTE;
  if (structureAccess(id) === "reference") {
    if (b.cost === 0 && b.time === 0) return spanBlurb();
    if (b.storage > 0) return siloBlurb();
    return "In the records. Not on the build list.";
  }
  if (b.trains === "infantry") return "Trains infantry.";
  if (b.trains === "vehicle") return "Trains vehicles, including the harvester and the MCV.";
  if (b.trains === "navy") return "Trains ships. Sits in the water, along the coast.";
  if (b.trains === "air") return "Trains aircraft and rearms the ones that land.";
  if (b.powerOut > 0) return `Feeds the base ${b.powerOut} power.`;
  if (b.special === "aa") return "Shoots aircraft. The shot pauses when power is low.";
  if (b.special === "radar") return "Reveals with its sight while the grid is up. A powered mast also shows enemy aircraft on the minimap.";
  if (b.special === "stealth") return "Cloaks nearby friendly infantry while it has power.";
  if (b.id === "tower") return "A standing gun. Concord and Steel records hit harder and see farther.";
  if (b.id === "refinery") return "Harvesters dump crystal here.";
  if (b.id === "supply") {
    return `While the grid is on, the first one adds ${SUPPLY_DRIP} credits per second. Each later one pays a smaller share (${supplyShare(1)} then ${supplyShare(2)}). It is not a credit cap.`;
  }
  if (b.id === "wall" || b.id === "gate" || b.id === "sandbag") return "A fence. Steel records have more hit points.";
  return b.name;
}

export function cardLine(row: BookUnit | BookHall): string {
  if ("u" in row) {
    if (row.id === "mcv") {
      return "60s clock. An MCV on the field—not loaded in a transport—freezes the remaining countdown; deploying restores the Yard and clears it.";
    }
    if (row.u.damage <= 0) return "No gun";
    return `${row.u.damage} base damage`;
  }
  if (row.access === "reference") {
    if (row.b.cost === 0 && row.b.time === 0) return "Map structure";
    if (row.b.storage > 0) return "Neutral until captured";
    return "Not on the build list";
  }
  if (row.access === "deploy") return "60s rebuild clock";
  if (row.b.powerOut > 0) return `+${row.b.powerOut} power`;
  if (row.b.powerUse > 0) return `${row.b.powerUse} power use`;
  if (row.b.damage > 0) return `${row.b.damage} base damage`;
  return "No power draw";
}

export function roleLabel(row: BookHall): string | null {
  if (row.access === "reference") return "Not buildable";
  if (row.access === "deploy") return "From MCV";
  if (row.locked) return row.home.map((id) => FACTION_NAME[id]).join(" · ");
  return null;
}

const TRAIN_AT: Record<string, string> = {
  barracks: "Barracks",
  factory: "War Factory",
  dock: "Dock",
  helipad: "Helipad",
};

export function unitStatLines(u: ResolvedUnit): StatLine[] {
  const lines: StatLine[] = [
    { label: "Hit points", value: `${u.hp}` },
    { label: "Sight", value: `${u.sight}`, hint: "How far it sees. Not weapon range." },
  ];
  if (u.id === "marksman") {
    const bonus = SIGHT.marksmanStill - SIGHT.marksmanMove;
    const still = u.sight === UNITS.marksman.sight ? SIGHT.marksmanStill : Math.round((u.sight + bonus) * 10) / 10;
    lines.push({
      label: "Still sight",
      value: `${still}`,
      hint: `After standing ${SIGHT.marksmanSettle}s. Moving sight is the sight line above.`,
    });
  }
  if (u.damage > 0) {
    lines.push({ label: "Weapon range", value: `${u.range}`, hint: "How far the shot reaches. Not sight." });
    if ((u.minRange ?? 0) > 0) {
      lines.push({ label: "Min range", value: `${u.minRange}`, hint: "It will not fire closer than this." });
    }
    lines.push({
      label: "Base damage",
      value: `${u.damage}`,
      hint: "One shot before target multipliers, the armor table, height, and cover.",
    });
    if (u.rof > 0 && u.rof < 30) {
      lines.push({
        label: "Base damage / s",
        value: (u.damage / u.rof).toFixed(1),
        hint: "Base damage divided by the shot interval. Not the damage a target takes.",
      });
    }
    lines.push({ label: "Shot every", value: `${u.rof}s` });
    lines.push({ label: "Vs infantry", value: `×${u.vsInf}`, hint: "Multiplier on base damage. The armor table applies after this." });
    lines.push({ label: "Vs vehicles", value: `×${u.vsVeh}`, hint: "Multiplier on base damage. Light and armored plates differ." });
    lines.push({ label: "Vs buildings", value: `×${u.vsBld}`, hint: "Multiplier on base damage. The armor table applies after this." });
    if ((u.vsAir ?? 0) > 0) {
      lines.push({ label: "Vs aircraft", value: `×${u.vsAir}`, hint: "Aircraft use this multiplier and skip the ground armor table." });
    }
  } else {
    lines.push({ label: "Base damage", value: "No weapon" });
    lines.push({ label: "Weapon range", value: "—" });
  }
  const tag = matchupTag(u.id);
  if (tag) lines.push({ label: "Matchup", value: tag.detail });
  lines.push({ label: "Command points", value: `${commandCost(u)}`, hint: "Points this unit occupies." });
  if ((u.capInf ?? 0) > 0) {
    lines.push({ label: "Infantry seats", value: `${u.capInf}`, hint: "Riders it can carry. Not a capture score." });
  }
  if ((u.capLight ?? 0) > 0) {
    lines.push({ label: "Light vehicle seats", value: `${u.capLight}`, hint: "Light vehicles it can carry." });
  }
  const tech = unitRequires(u.id);
  if (tech) lines.push({ label: "Train gate", value: BUILDINGS[tech].name, hint: "Training waits until this building is finished." });
  const tier = airTier(u.id);
  if (tier > 0) lines.push({ label: "HQ tier", value: `${tier}`, hint: "The helipad will not train this below that headquarters tier." });
  const era = unitUnlocks()[u.id];
  if (typeof era === "number") lines.push({ label: "Era", value: `${era}`, hint: "Offered when the match year is this year or later." });
  lines.push({ label: "Armor", value: u.armor });
  lines.push({ label: "Move", value: `${pace(u.speed)} · ${u.speed}` });
  lines.push({ label: "Move type", value: u.loco === "air" ? "Air" : u.loco === "sea" ? "Sea" : u.loco === "amphib" ? "Amphibious" : "Ground" });
  lines.push({ label: "Cost", value: u.cost.toLocaleString("en-US") });
  lines.push({ label: "Train time", value: `${u.time}s` });
  lines.push({ label: "Trained at", value: TRAIN_AT[u.trainedAt] ?? u.trainedAt });
  if (u.damage > 0) lines.push({ label: "Shot", value: u.shot });
  if (u.cargo > 0) lines.push({ label: "Cargo", value: `${u.cargo}` });
  if (u.stealth) lines.push({ label: "Special", value: "Stealth" });
  if (u.magazine != null) lines.push({ label: "Magazine", value: `${u.magazine} shots` });
  if (u.rearmFor != null) lines.push({ label: "Rearm", value: `${u.rearmFor}s` });
  return lines;
}

/** One direct hit on open ground, before height and cover. Not a rate. */
export function openGroundHits(u: ResolvedUnit): StatLine[] {
  if (u.damage <= 0) return [];
  const hit = (label: string, vs: number, plate: ArmorClass, hint: string): StatLine => ({
    label,
    value: `${Math.round(u.damage * vs * counterMul(u.id, plate))}`,
    hint,
  });
  const rows: StatLine[] = [
    hit("Light infantry", u.vsInf, "light", "Base damage × vs infantry × the light armor column."),
    hit("Armored plate", u.vsVeh, "armored", "Base damage × vs vehicles × the armored column. Light vehicles use the light column instead."),
    hit("Building", u.vsBld, "building", "Base damage × vs buildings × the building column. Walls use a separate factor."),
  ];
  if ((u.vsAir ?? 0) > 0) {
    rows.push({
      label: "Aircraft",
      value: `${Math.round(u.damage * (u.vsAir ?? 0))}`,
      hint: "Base damage × vs aircraft. The ground armor table is not applied.",
    });
  }
  return rows;
}

export function buildingStatLines(b: ResolvedBuilding): StatLine[] {
  const access = structureAccess(b.id);
  const lines: StatLine[] = [
    { label: "Hit points", value: `${b.hp}` },
    { label: "Sight", value: `${b.sight}`, hint: "How far it reveals. Not weapon range." },
  ];
  if (b.damage > 0) {
    lines.push({ label: "Weapon range", value: `${b.range}`, hint: "How far the shot reaches. Not sight." });
    lines.push({
      label: "Base damage",
      value: `${b.damage}`,
      hint: "One shot before target multipliers. Building shots are not retallied here as dealt damage.",
    });
    if (b.rof > 0 && b.rof < 30) {
      lines.push({
        label: "Base damage / s",
        value: (b.damage / b.rof).toFixed(1),
        hint: "Base damage divided by the shot interval. Not the damage a target takes.",
      });
    }
    lines.push({ label: "Shot every", value: `${b.rof}s` });
    lines.push({ label: "Vs infantry", value: `×${b.vsInf}`, hint: "Multiplier stored on the record." });
    lines.push({ label: "Vs vehicles", value: `×${b.vsVeh}`, hint: "Multiplier stored on the record." });
    lines.push({ label: "Vs buildings", value: `×${b.vsBld}`, hint: "Multiplier stored on the record." });
    if ((b.vsAir ?? 0) > 0) lines.push({ label: "Vs aircraft", value: `×${b.vsAir}`, hint: "Multiplier stored on the record." });
  } else if (b.special === "stealth" && b.range > 0) {
    lines.push({
      label: "Cloak radius",
      value: `${b.range}`,
      hint: "Friendly infantry inside this radius hide while the building has power. Not a weapon range.",
    });
    lines.push({ label: "Weapon range", value: "—" });
    lines.push({ label: "Base damage", value: "No weapon" });
  } else {
    lines.push({ label: "Weapon range", value: "—" });
    lines.push({ label: "Base damage", value: "No weapon" });
  }
  if (b.powerOut > 0) lines.push({ label: "Power out", value: `+${b.powerOut}` });
  if (b.powerUse > 0) lines.push({ label: "Power use", value: `${b.powerUse}` });
  if (access === "menu") {
    lines.push({ label: "Cost", value: b.cost.toLocaleString("en-US") });
    lines.push({ label: "Build time", value: `${b.time}s` });
    const era = buildingUnlocks()[b.id];
    if (typeof era === "number") lines.push({ label: "Era", value: `${era}`, hint: "Offered when the match year is this year or later." });
    lines.push({
      label: "Requires",
      value: b.requires ? BUILDINGS[b.requires].name : "Nothing",
    });
  }
  if (idPays(b) ) {
    lines.push({
      label: "Powered income",
      value: b.id === "yard" ? `+${YARD_DRIP}/s` : b.id === "supply" ? `+${SUPPLY_DRIP}/s first` : `+${SILO_DRIP}/s`,
      hint:
        b.id === "silo"
          ? "Only after capture, and only while the grid is on. Not a purchase."
          : "While the grid is on, after a plant has run.",
    });
  }
  lines.push({ label: "Footprint", value: `${b.w}×${b.h}` });
  if (access === "menu" && b.storage > 0) lines.push({ label: "Storage", value: b.storage.toLocaleString("en-US") });
  if (b.shore) lines.push({ label: "Placement", value: "Waterline" });
  if (b.special) lines.push({ label: "Special", value: b.special });
  return lines;
}

function idPays(b: ResolvedBuilding): boolean {
  return b.id === "yard" || b.id === "supply" || (b.id === "silo" && b.storage > 0);
}

export function factionLockLine(kind: "unit" | "building", faction: FactionId, home: FactionId[]): string | null {
  if (home.includes(faction)) return null;
  if (home.length === 0) return `${FACTION_NAME[faction]} does not field this.`;
  const verb = kind === "unit" ? "train" : "build";
  return `${FACTION_NAME[faction]} does not ${verb} this. Fielded by ${home.map((id) => FACTION_NAME[id]).join(" and ")}.`;
}
