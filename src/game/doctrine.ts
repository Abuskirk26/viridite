/** Host lock for a match. One doctrine for both sides. Original names only. */

export type DoctrineId = "manual_96" | "manual_00" | "aftershock" | "kane_line" | "open_lattice";
export type DoctrineShape = "square" | "diamond" | "bolt" | "hex" | "ring";
export type PackStatus = "Bundled" | "Ready" | "Update" | "Missing";
export type SheetTab = "game" | "armies" | "controls" | "video" | "sound";

export interface DoctrinePack {
  id: DoctrineId;
  name: string;
  shape: DoctrineShape;
  feel: string;
  card: string;
  rules: [string, string, string];
  status: PackStatus;
  action: "View" | "Update" | "Restore";
  hash: string;
}

export const DOCTRINES: DoctrinePack[] = [
  {
    id: "manual_96",
    name: "Manual 96",
    shape: "square",
    feel: "Early war. Rifle, tank, harvester. Few tricks.",
    card: "Tactical doctrine and unit doctrine archive.",
    rules: ["No garrison.", "No support powers.", "Tanks crush infantry."],
    status: "Bundled",
    action: "View",
    hash: "7f3a9c2b4d1e6f809a7b3c2d1e4f5a6b",
  },
  {
    id: "manual_00",
    name: "Manual 00",
    shape: "diamond",
    feel: "Special weapons. Air matters. Bases have answers.",
    card: "Field reference and baseline doctrines.",
    rules: ["Fighter and bomber.", "Three chevrons.", "Two support powers."],
    status: "Ready",
    action: "View",
    hash: "b21c04e8a9d07f55c1e6aa308d4b7712",
  },
  {
    id: "aftershock",
    name: "Aftershock",
    shape: "bolt",
    feel: "Shock infantry, deploy denial, phase raids.",
    card: "Rapid assault doctrine pack.",
    rules: ["Shock class ignores crush.", "Wrecks block for 25s.", "No husk revive."],
    status: "Update",
    action: "Update",
    hash: "c90e11aa47b2d6f018335e9c0ab14d77",
  },
  {
    id: "kane_line",
    name: "Kane Line",
    shape: "hex",
    feel: "Walkers, husks, viridite corruption.",
    card: "Frontline defensive doctrine suite.",
    rules: ["Garrison on.", "Husks last 60s.", "Viridite creeps from rich fields."],
    status: "Missing",
    action: "Restore",
    hash: "18de4402f6ab91c3e750aa19b2c88e04",
  },
  {
    id: "open_lattice",
    name: "Open Lattice",
    shape: "ring",
    feel: "Call-ins, promotions, sub-doctrines.",
    card: "Infiltration and network disruption pack.",
    rules: ["Four promotion ranks.", "Power tray.", "Radial sidebar."],
    status: "Missing",
    action: "Restore",
    hash: "55a0c7e1d39b8042f6aa10c9e2714bb8",
  },
];

const KEY = "viridite-doctrine";
const PACK_KEY = "viridite-packs";

export function doctrineOf(): DoctrineId {
  try {
    const raw = localStorage.getItem(KEY);
    if (DOCTRINES.some((d) => d.id === raw)) return raw as DoctrineId;
  } catch {
    /* private mode */
  }
  return "manual_96";
}

export function setDoctrine(id: DoctrineId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
}

export function packById(id: DoctrineId): DoctrinePack {
  return DOCTRINES.find((d) => d.id === id) ?? DOCTRINES[0]!;
}

export function packStatus(id: DoctrineId): PackStatus {
  const base = packById(id).status;
  if (id === "manual_96") return "Bundled";
  try {
    const raw = localStorage.getItem(PACK_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Record<DoctrineId, PackStatus>>;
    return saved[id] ?? base;
  } catch {
    return base;
  }
}

export function markPackReady(id: DoctrineId) {
  if (id === "manual_96") return;
  try {
    const raw = localStorage.getItem(PACK_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Record<DoctrineId, PackStatus>>) : {};
    saved[id] = "Ready";
    localStorage.setItem(PACK_KEY, JSON.stringify(saved));
  } catch {
    /* private mode */
  }
}
