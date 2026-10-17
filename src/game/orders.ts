/**
 * Lockstep orders. The phone still uses the same taps; online, the tap becomes
 * one of these commands and every client applies it on the same sim tick.
 * Coordinates are 1/16 of a tile so both sides feed pathfinding the same numbers.
 */

import { BUILDINGS, UNITS, type BuildingId, type Team, type UnitId } from "./data.ts";
import type { Sim } from "./sim.ts";

export type CmdKind =
  | "move"
  | "attack"
  | "attackMove"
  | "build"
  | "train"
  | "cancel"
  | "placeWall"
  | "rally"
  | "pause"
  | "stop"
  | "guard"
  | "scatter"
  | "harvest"
  | "return"
  | "deploy"
  | "sell"
  | "repair"
  | "gate"
  | "load"
  | "unload"
  | "boost"
  | "raise"
  | "chat";

export interface Cmd {
  tick: number;
  seat: number;
  seq: number;
  kind: CmdKind;
  payload: {
    ids?: number[];
    x?: number;
    y?: number;
    id?: number;
    kind?: string;
    tx?: number;
    ty?: number;
    tiles?: { tx: number; ty: number }[];
    unit?: string;
    on?: boolean;
    mark?: string;
    /** Seat an AI should take over. Host-stamped, not a unit order. */
    who?: number;
  };
}

export function quant(n: number): number {
  return Math.round(n * 16) / 16;
}

/** How the local seat should read a match that is scored from seat 0's alliance. */
export function seatResult(sim: Sim, seat: number): "win" | "lose" | "playing" | "out" {
  if (sim.outcome === "playing") return sim.eliminated[seat] ? "out" : "playing";
  const allianceWon = sim.outcome === "win";
  return allianceWon === sim.allied(0, seat) ? "win" : "lose";
}

function asTeam(n: number): Team | null {
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return null;
}

function ownUnits(sim: Sim, seat: Team, ids: number[] | undefined): number[] {
  if (!ids) return [];
  const out: number[] = [];
  for (const id of ids) {
    const u = sim.unitById(id);
    if (u && u.team === seat && u.hp > 0) out.push(id);
  }
  return out;
}

function buildingId(id: string): BuildingId | null {
  if (Object.prototype.hasOwnProperty.call(BUILDINGS, id)) return id as BuildingId;
  return null;
}

function unitId(id: string): UnitId | null {
  if (Object.prototype.hasOwnProperty.call(UNITS, id)) return id as UnitId;
  return null;
}

/**
 * Apply one relayed order. Commands that name another seat's units are dropped
 * here as well as on the relay — a cheated client cannot move a foreign tank.
 */
export function applyOrder(sim: Sim, cmd: Cmd): void {
  const seat = asTeam(cmd.seat);
  if (seat == null) return;
  if (sim.eliminated[seat] && cmd.kind !== "chat" && cmd.kind !== "pause") return;
  const p = cmd.payload ?? {};
  if (cmd.kind === "move" || cmd.kind === "attackMove") {
    const ids = ownUnits(sim, seat, p.ids);
    if (typeof p.x !== "number" || typeof p.y !== "number") return;
    sim.issueMove(ids, p.x, p.y, cmd.kind === "attackMove");
    return;
  }
  if (cmd.kind === "attack") {
    if (typeof p.id !== "number") return;
    sim.issueAttack(ownUnits(sim, seat, p.ids), p.id);
    return;
  }
  if (cmd.kind === "stop") {
    sim.issueStop(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "guard") {
    sim.issueGuard(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "scatter") {
    sim.issueScatter(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "harvest") {
    sim.issueHarvest(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "return") {
    sim.issueReturn(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "deploy") {
    sim.issueDeploy(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "load") {
    sim.issueLoad(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "unload") {
    sim.issueUnload(ownUnits(sim, seat, p.ids));
    return;
  }
  if (cmd.kind === "build") {
    const kind = p.kind ? buildingId(p.kind) : null;
    if (!kind || typeof p.tx !== "number" || typeof p.ty !== "number") return;
    sim.tryPlace(seat, kind, p.tx | 0, p.ty | 0);
    return;
  }
  if (cmd.kind === "placeWall") {
    const kind = p.kind ? buildingId(p.kind) : null;
    if (!kind || !p.tiles) return;
    const tiles = p.tiles
      .filter((t) => t && typeof t.tx === "number" && typeof t.ty === "number")
      .map((t) => ({ tx: t.tx | 0, ty: t.ty | 0 }));
    sim.placeFence(seat, kind, tiles);
    return;
  }
  if (cmd.kind === "train") {
    const unit = p.unit ? unitId(p.unit) : null;
    if (!unit || typeof p.id !== "number") return;
    const b = sim.buildingById(p.id);
    if (!b || b.team !== seat) return;
    sim.queueUnit(p.id, unit);
    return;
  }
  if (cmd.kind === "cancel") {
    if (typeof p.id !== "number") return;
    sim.cancelTrain(p.id, seat);
    return;
  }
  if (cmd.kind === "rally") {
    if (typeof p.id !== "number" || typeof p.x !== "number" || typeof p.y !== "number") return;
    sim.setRally(p.id, p.x, p.y, seat);
    return;
  }
  if (cmd.kind === "sell") {
    if (typeof p.id !== "number") return;
    sim.sellBuilding(p.id, seat);
    return;
  }
  if (cmd.kind === "repair") {
    if (typeof p.id !== "number") return;
    sim.issueRepair(p.id, seat);
    return;
  }
  if (cmd.kind === "gate") {
    if (typeof p.id !== "number") return;
    sim.toggleGate(p.id, seat);
    return;
  }
  if (cmd.kind === "boost") {
    sim.useBoost(seat, p.mark === "march" ? "march" : "works");
    return;
  }
  if (cmd.kind === "raise") {
    sim.raiseCommand(seat);
    return;
  }
  if (cmd.kind === "pause") {
    sim.setPause(seat, p.on !== false);
    return;
  }
  if (cmd.kind === "chat") {
    if (typeof p.x !== "number" || typeof p.y !== "number" || !p.mark) return;
    sim.addMark(seat, p.x, p.y, p.mark);
  }
}
