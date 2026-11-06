/**
 * Era unlocks. Edit eras.json to add a year or move a piece.
 * A match offers a piece when its year is this year or earlier.
 */

import type { BuildingId, UnitId } from "./data.ts";
import raw from "./eras.json" with { type: "json" };

export interface EraDef {
  id: string;
  year: number;
  label: string;
  name: string;
  blurb: string;
  signatures: string[];
  opening: string[];
}

interface Catalog {
  note?: string;
  eras: EraDef[];
  units: Record<string, number>;
  buildings: Record<string, number>;
}

const catalog = raw as Catalog;

export const ERAS: readonly EraDef[] = [...catalog.eras].sort((a, b) => a.year - b.year);

/** WW1. The slider does not go earlier than this. */
export const EARLIEST_YEAR = ERAS[0]?.year ?? 1914;

/** Near-future. Missing saves and old rooms keep the full roster. */
export const DEFAULT_YEAR = ERAS[ERAS.length - 1]?.year ?? 2045;

/** Snap to an era stop. Unknown or early values land on WW1. Missing values land on the latest era. */
export function clampYear(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_YEAR;
  const y = Math.round(n);
  let pick = EARLIEST_YEAR;
  for (const era of ERAS) {
    if (era.year <= y) pick = era.year;
  }
  return pick;
}

export function eraForYear(year: number): EraDef {
  const y = clampYear(year);
  let hit = ERAS[0]!;
  for (const era of ERAS) if (era.year <= y) hit = era;
  return hit;
}

export function unitUnlocks(): Record<string, number> {
  return catalog.units;
}

export function buildingUnlocks(): Record<string, number> {
  return catalog.buildings;
}

export function unitInYear(id: UnitId, year: number): boolean {
  const unlock = catalog.units[id];
  return typeof unlock === "number" && clampYear(year) >= unlock;
}

export function buildingInYear(id: BuildingId, year: number): boolean {
  const unlock = catalog.buildings[id];
  return typeof unlock === "number" && clampYear(year) >= unlock;
}

/** What each seat deploys at the start. The JSON list is the army. Later eras still open with an MCV. */
export function startingArmy(year: number): UnitId[] {
  const era = eraForYear(year);
  const out: UnitId[] = [];
  for (const id of era.opening) {
    if (unitInYear(id as UnitId, year)) out.push(id as UnitId);
  }
  return out;
}
