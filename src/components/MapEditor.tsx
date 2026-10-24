import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Expand, Grid3x3, Redo2, Undo2 } from "lucide-react";
import { onArt } from "@/game/art";
import { TILE_BRIDGE, TILE_CRYSTAL, TILE_SAND, TILE_SCRUB, TILE_SPENT, TILE_STUMP, type MapId, type MapSizeId } from "@/game/data";
import { MAP_LIST } from "@/game/maps";
import { bakeTerrain, frameScale, paintCrossings, paintDocTiles, paintRelief, tileColor } from "@/game/render";
import { isShell, paintOre, paintShell, paintTree, paintWaterSheen } from "@/game/tileset";
import { deleteMap, saveMap, shareCode } from "@/game/custom";
import { duplicateMap, resolveMyMap } from "@/game/lobby";
import { FEATURED, buildFeatured, featuredById, suggestLabel } from "@/game/featured";
import {
  MAP_PRESETS,
  PIECE_PAGES,
  audit,
  auditFocus,
  brushCells,
  cellLegal,
  clampEditorCam,
  clearGems,
  cloneDoc,
  copyRect,
  docFromField,
  emptyDoc,
  fairnessNotes,
  fitEditorCam,
  moveStart,
  pasteClip,
  pieceAt,
  pieceLayer,
  presetById,
  resizeDoc,
  stampSymmetric,
  type Brush,
  type EditorClip,
  type EditorDoc,
  type EditorLayer,
  type Piece,
  type Symmetry,
} from "@/game/editor";
import { TEMPLATES, buildTemplate, type TemplateCard } from "@/game/templates";
import type { Camera } from "@/game/view";

const LIFT = 68;

/**
 * One finger stamps above the fingertip. A mouse paints on the cursor.
 * Two fingers, or the right button, pan. The wheel zooms out to the whole field.
 */
export function MapEditor({
  onClose,
  onSaved,
  skirmish,
  remixId = "",
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
  skirmish?: { mapId: MapId; size: MapSizeId; customId: string };
  /** Open this map as a copy. Save stores a new one. */
  remixId?: string;
}) {
  const remixSeed = useRef<EditorDoc | null | undefined>(undefined);
  if (remixSeed.current === undefined) remixSeed.current = remixId ? duplicateMap(remixId) : null;
  const [remixLabel, setRemixLabel] = useState(
    remixSeed.current && !remixSeed.current.id ? (featuredById(remixSeed.current.template)?.name ?? "") : "",
  );
  const [stage, setStage] = useState<"new" | "edit">(remixSeed.current ? "edit" : "new");
  const [name, setName] = useState(remixSeed.current?.name ?? "Island Hoppers");
  const [picked, setPicked] = useState("hoppers");
  const [nudge, setNudge] = useState(0);
  const [sizeId, setSizeId] = useState("64");
  const [sizeLocked, setSizeLocked] = useState(true);
  const [piece, setPiece] = useState<Piece>("crystal");
  const [page, setPage] = useState(0);
  const [brush, setBrush] = useState<Brush>(3);
  const [grid, setGrid] = useState(true);
  const [symmetry, setSymmetry] = useState<Symmetry>("off");
  const [layers, setLayers] = useState({ terrain: true, resources: true, starts: true, objects: true });
  const [tool, setTool] = useState<"paint" | "select" | "paste">("paint");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [hasClip, setHasClip] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [fair, setFair] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [rev, setRev] = useState(0);
  const docRef = useRef<EditorDoc | null>(remixSeed.current);
  const fitPending = useRef(!!remixSeed.current);
  const undoRef = useRef<EditorDoc[]>([]);
  const redoRef = useRef<EditorDoc[]>([]);
  const camRef = useRef<Camera>({ x: 32, y: 32, zoom: 8 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ w: 1, h: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const painting = useRef(false);
  const pinch = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  const spaceRef = useRef(false);
  const stroke = useRef<{ x: number; y: number }[]>([]);
  const ghost = useRef<{ x: number; y: number; ok: boolean } | null>(null);
  const marquee = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const clipRef = useRef<EditorClip | null>(null);
  const dragFlag = useRef<{ index: number; moved: boolean; pushed: boolean } | null>(null);
  const holdFlag = useRef(0);
  const symmetryRef = useRef(symmetry);
  symmetryRef.current = symmetry;

  const doc = docRef.current;
  const square = !doc || doc.w === doc.h;

  useEffect(() => {
    const canvas = canvasRef.current;
    const live = docRef.current;
    if (!canvas || !live || stage !== "edit") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    viewRef.current = { w, h };
    const dpr = frameScale();
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cam = camRef.current;
    if (fitPending.current) {
      fitPending.current = false;
      fitEditorCam(cam, w, h, live.w, live.h);
    }
    clampEditorCam(cam, live.w, live.h);
    ctx.fillStyle = "#12100c";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    const x0 = Math.max(0, Math.floor(cam.x - w / (2 * cam.zoom)) - 1);
    const y0 = Math.max(0, Math.floor(cam.y - h / (2 * cam.zoom)) - 1);
    const x1 = Math.min(live.w - 1, Math.ceil(cam.x + w / (2 * cam.zoom)) + 1);
    const y1 = Math.min(live.h - 1, Math.ceil(cam.y + h / (2 * cam.zoom)) + 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const painted = layers.terrain && paintDocTiles(ctx, live.terrain, live.w, live.h, live.theater, x0, y0, x1, y1, performance.now() / 1000);
    if (!painted) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * live.w + x;
          const t = live.terrain[i] ?? 0;
          const res = layers.resources && t === TILE_CRYSTAL;
          const obj = layers.objects && t === TILE_BRIDGE;
          if (!layers.terrain && !res && !obj) {
            ctx.fillStyle = "#2c2822";
          } else {
            const shown = !layers.resources && t === TILE_CRYSTAL ? TILE_SAND : !layers.objects && t === TILE_BRIDGE ? TILE_SAND : t;
            ctx.fillStyle = tileColor(shown, x, y, live.theater);
          }
          ctx.fillRect(x, y, 1, 1);
          if (cam.zoom >= 8 && (layers.terrain || res || obj)) paintRelief(ctx, live.terrain, x, y, live.w, live.h);
        }
      }
    }
    const clock = performance.now() / 1000;
    if (cam.zoom >= 6) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * live.w + x;
          const t = live.terrain[i] ?? 0;
          if (layers.terrain) {
            paintWaterSheen(ctx, t, x, y, clock);
            if (t === TILE_SCRUB || t === TILE_STUMP) paintTree(ctx, x, y, t === TILE_STUMP);
            if (isShell(t)) paintShell(ctx, t, x, y, 0);
          }
          if (layers.resources) {
            const gem = live.crystal[i] ?? 0;
            if (gem > 0 || t === TILE_SPENT) paintOre(ctx, x, y, gem, t === TILE_SPENT, clock);
          }
        }
      }
    }
    if (layers.resources && cam.zoom >= 6) {
      const seen = new Uint8Array(live.w * live.h);
      ctx.fillStyle = "#f4e2b0";
      ctx.font = "0.62px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let y = 0; y < live.h; y++) {
        for (let x = 0; x < live.w; x++) {
          const start = y * live.w + x;
          if (seen[start] || (live.crystal[start] ?? 0) <= 0) continue;
          const stack = [start];
          seen[start] = 1;
          let total = 0;
          let sx = 0;
          let sy = 0;
          let n = 0;
          while (stack.length) {
            const i = stack.pop()!;
            total += live.crystal[i] ?? 0;
            const cx = i % live.w;
            const cy = (i / live.w) | 0;
            sx += cx;
            sy += cy;
            n += 1;
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= live.w || ny >= live.h) continue;
              const ni = ny * live.w + nx;
              if (seen[ni] || (live.crystal[ni] ?? 0) <= 0) continue;
              seen[ni] = 1;
              stack.push(ni);
            }
          }
          if (n > 0) ctx.fillText(total.toLocaleString("en-US"), sx / n + 0.5, sy / n + 0.5);
        }
      }
      ctx.textAlign = "left";
    }
    if (grid && cam.zoom >= 8) {
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 1 / cam.zoom;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1 + 1);
      }
      for (let y = y0; y <= y1; y++) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1 + 1, y);
      }
      ctx.stroke();
    }
    if (symmetry !== "off") {
      ctx.strokeStyle = "rgba(228,193,90,0.45)";
      ctx.lineWidth = 1 / cam.zoom;
      ctx.beginPath();
      if (symmetry === "x" || symmetry === "rot2" || symmetry === "rot4") {
        ctx.moveTo(live.w / 2, 0);
        ctx.lineTo(live.w / 2, live.h);
      }
      if (symmetry === "y" || symmetry === "rot2" || symmetry === "rot4") {
        ctx.moveTo(0, live.h / 2);
        ctx.lineTo(live.w, live.h / 2);
      }
      ctx.stroke();
    }
    if (layers.starts) {
      const seatFill = ["#9aa35a", "#d4653a", "#9aa3ae", "#46d0d0"];
      const seatName = ["Player 1", "Player 2", "Player 3", "Player 4"];
      live.starts.forEach((s, n) => {
        ctx.fillStyle = seatFill[n] ?? "#d7b56a";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = seatFill[n] ?? "#d7b56a";
        ctx.lineWidth = 0.08;
        ctx.stroke();
        ctx.fillRect(s.x - 0.08, s.y - 1.15, 0.12, 1.05);
        ctx.fillStyle = "#14120e";
        ctx.font = "0.28px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(seatName[n] ?? String(n + 1), s.x + 0.08, s.y - 1.15);
      });
    }
    if (layers.objects) {
      paintCrossings(ctx, live.terrain, live.w, live.h, x0, y0, x1, y1);
      ctx.strokeStyle = "#c45c32";
      ctx.lineWidth = 0.12;
      for (const d of live.docks) ctx.strokeRect(d.tx, d.ty, 2, 2);
      ctx.fillStyle = "#e4c15a";
      for (const s of live.spans) ctx.fillRect(s.tx + 0.25, s.ty + 0.25, 0.5, 0.5);
    }
    const box = marquee.current;
    if (box) {
      const bx = Math.min(box.x0, box.x1);
      const by = Math.min(box.y0, box.y1);
      ctx.strokeStyle = "#e4c15a";
      ctx.lineWidth = 1.5 / cam.zoom;
      ctx.strokeRect(bx, by, Math.abs(box.x1 - box.x0) + 1, Math.abs(box.y1 - box.y0) + 1);
    }
    const g = ghost.current;
    const clip = clipRef.current;
    if (g && tool === "paste" && clip) {
      ctx.globalAlpha = 0.45;
      for (let ly = 0; ly < clip.h; ly++) {
        for (let lx = 0; lx < clip.w; lx++) {
          ctx.fillStyle = tileColor(clip.terrain[ly * clip.w + lx] ?? 0, g.x + lx, g.y + ly, live.theater);
          ctx.fillRect(g.x + lx, g.y + ly, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    } else if (g && tool === "paint" && piece !== "pick") {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = g.ok ? "#d7b56a" : "#e15b48";
      const stampBrush = piece === "start" || piece === "dock" || piece === "bridge" ? 1 : brush;
      for (const p of brushCells(g.x, g.y, stampBrush, live.w, live.h)) ctx.fillRect(p.x, p.y, 1, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    paintMini(miniRef.current, live, cam, w, h, layers);
  }, [stage, rev, grid, piece, brush, layers, symmetry, tool, toolsOpen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stage !== "edit") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const live = docRef.current;
      if (!live) return;
      const cam = camRef.current;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wx = (sx - rect.width / 2) / cam.zoom + cam.x;
      const wy = (sy - rect.height / 2) / cam.zoom + cam.y;
      cam.zoom = Math.max(2, Math.min(72, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
      cam.x = wx - (sx - rect.width / 2) / cam.zoom;
      cam.y = wy - (sy - rect.height / 2) / cam.zoom;
      clampEditorCam(cam, live.w, live.h);
      redraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [stage]);

  useEffect(() => {
    if (stage !== "edit") return;
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        spaceRef.current = true;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (meta && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySel();
      } else if (meta && e.key.toLowerCase() === "v") {
        e.preventDefault();
        setTool("paste");
      } else if (e.key === "f" || e.key === "Home") {
        fitNow();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    const blur = () => {
      spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [stage]);

  const cellOf = (sx: number, sy: number, lift: boolean) => {
    const canvas = canvasRef.current;
    const live = docRef.current;
    if (!canvas || !live) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = camRef.current;
    const x = sx - rect.left;
    const y = sy - rect.top - (lift ? LIFT : 0);
    const tx = Math.floor((x - rect.width / 2) / cam.zoom + cam.x);
    const ty = Math.floor((y - rect.height / 2) / cam.zoom + cam.y);
    return { x: tx, y: ty };
  };

  const redraw = () => setRev((n) => n + 1);
  useEffect(() => onArt(redraw), []);

  const paintCells = (live: EditorDoc, cells: { x: number; y: number }[]) => {
    if (piece === "erase" && PIECE_PAGES[page]?.id === "resources") return clearGems(live, cells, brush);
    return stampSymmetric(live, piece, cells, brush, symmetryRef.current);
  };

  const fitNow = () => {
    fitPending.current = true;
    redraw();
  };

  const choosePiece = (id: Piece) => {
    setPiece(id);
    setTool("paint");
    const layer = pieceLayer(id);
    if (layer) setLayers((prev) => ({ ...prev, [layer]: true }));
  };

  const begin = () => {
    const titled = name.trim() || "Untitled";
    const spec = presetById(sizeId);
    let next: EditorDoc;
    if (picked === "field" && skirmish) {
      const saved = skirmish.customId ? resolveMyMap(skirmish.customId) : null;
      next = saved ? cloneDoc(saved) : docFromField(skirmish.mapId, skirmish.size, titled);
      next.id = "";
      next.name = titled;
      if (!sizeLocked) next = resizeDoc(next, spec.w, spec.h);
    } else if (picked === "blank") {
      next = emptyDoc(spec.w, titled, "desert", "", spec.h);
    } else if (picked.startsWith("feat:")) {
      next = buildFeatured(picked.slice(5), titled);
      next.id = "";
    } else {
      next = buildTemplate(picked, nudge, titled);
      if (!sizeLocked && (next.w !== spec.w || next.h !== spec.h)) next = resizeDoc(next, spec.w, spec.h);
    }
    docRef.current = next;
    undoRef.current = [];
    redoRef.current = [];
    camRef.current = { x: next.w / 2, y: next.h / 2, zoom: 8 };
    fitPending.current = true;
    setNotes(null);
    setFair([]);
    setRemixLabel(picked.startsWith("feat:") ? (featuredById(picked.slice(5))?.name ?? "") : "");
    setCode("");
    setTool("paint");
    setStage("edit");
    redraw();
  };

  const applySize = (id: string) => {
    const spec = presetById(id);
    const live = docRef.current;
    if (!live || (live.w === spec.w && live.h === spec.h)) return;
    undoRef.current.push(cloneDoc(live));
    redoRef.current = [];
    docRef.current = resizeDoc(live, spec.w, spec.h);
    fitPending.current = true;
    redraw();
  };

  const copySel = () => {
    const live = docRef.current;
    const box = marquee.current;
    if (!live || !box) {
      setNotes(["Drag Select around tiles, then Copy."]);
      return;
    }
    const clip = copyRect(live, box.x0, box.y0, box.x1, box.y1);
    clipRef.current = clip;
    setHasClip(!!clip);
    setNotes(clip ? [`Copied ${clip.w}×${clip.h}.`] : ["That selection is empty."]);
    setFair([]);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a lost touch should still paint */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.button === 1 || e.button === 2 || spaceRef.current) {
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, midX: (a!.x + b!.x) / 2, midY: (a!.y + b!.y) / 2 };
      painting.current = false;
      return;
    }
    if (pointers.current.size > 1) return;
    const live = docRef.current;
    if (!live) return;
    const lift = e.pointerType === "touch";
    const cell = cellOf(e.clientX, e.clientY, lift);
    if (!cell) return;
    if (tool === "select") {
      marquee.current = { x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y };
      painting.current = true;
      redraw();
      return;
    }
    if (tool === "paste") {
      const clip = clipRef.current;
      if (!clip) return;
      undoRef.current.push(cloneDoc(live));
      if (undoRef.current.length > 30) undoRef.current.shift();
      redoRef.current = [];
      pasteClip(live, clip, cell.x, cell.y, symmetryRef.current);
      painting.current = false;
      redraw();
      return;
    }
    painting.current = true;
    undoRef.current.push(cloneDoc(live));
    if (undoRef.current.length > 30) undoRef.current.shift();
    redoRef.current = [];
    stroke.current = [];
    if (piece === "pick") {
      setPiece(pieceAt(live, cell.x, cell.y));
      undoRef.current.pop();
      painting.current = false;
      return;
    }
    if (piece === "start") {
      const idx = live.starts.findIndex((s) => Math.floor(s.x) === cell.x && Math.floor(s.y) === cell.y);
      if (idx >= 0) {
        undoRef.current.pop();
        dragFlag.current = { index: idx, moved: false, pushed: false };
        window.clearTimeout(holdFlag.current);
        holdFlag.current = window.setTimeout(() => {
          const doc = docRef.current;
          const drag = dragFlag.current;
          if (!doc || !drag || drag.moved) return;
          undoRef.current.push(cloneDoc(doc));
          if (undoRef.current.length > 30) undoRef.current.shift();
          redoRef.current = [];
          doc.starts.splice(drag.index, 1);
          dragFlag.current = null;
          redraw();
        }, 480);
        painting.current = false;
        return;
      }
    }
    const layer = pieceLayer(piece);
    if (layer && !layers[layer]) {
      undoRef.current.pop();
      painting.current = false;
      setNotes([`Turn the ${layer} layer on to paint that.`]);
      return;
    }
    stroke.current.push(cell);
    paintCells(live, [cell]);
    ghost.current = { ...cell, ok: cellLegal(live, piece, cell.x, cell.y) };
    redraw();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan.current && pan.current.id === e.pointerId) {
      const cam = camRef.current;
      const live = docRef.current;
      cam.x -= (e.clientX - pan.current.x) / cam.zoom;
      cam.y -= (e.clientY - pan.current.y) / cam.zoom;
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (live) clampEditorCam(cam, live.w, live.h);
      redraw();
      return;
    }
    if (pointers.current.size >= 2 && pinch.current && prev) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
      const midX = (a!.x + b!.x) / 2;
      const midY = (a!.y + b!.y) / 2;
      const cam = camRef.current;
      const live = docRef.current;
      cam.zoom = Math.max(2, Math.min(72, cam.zoom * (dist / pinch.current.dist)));
      cam.x -= (midX - pinch.current.midX) / cam.zoom;
      cam.y -= (midY - pinch.current.midY) / cam.zoom;
      if (live) clampEditorCam(cam, live.w, live.h);
      pinch.current = { dist, midX, midY };
      redraw();
      return;
    }
    const lift = e.pointerType === "touch";
    const cell = cellOf(e.clientX, e.clientY, lift);
    const live = docRef.current;
    const drag = dragFlag.current;
    if (drag && cell && live) {
      if (!drag.moved) {
        drag.moved = true;
        window.clearTimeout(holdFlag.current);
        undoRef.current.push(cloneDoc(live));
        if (undoRef.current.length > 30) undoRef.current.shift();
        redoRef.current = [];
        drag.pushed = true;
      }
      moveStart(live, drag.index, cell.x, cell.y);
      redraw();
      return;
    }
    if (tool === "select" && painting.current && cell) {
      const box = marquee.current;
      if (box) marquee.current = { ...box, x1: cell.x, y1: cell.y };
      redraw();
      return;
    }
    if (cell && live) ghost.current = { ...cell, ok: cellLegal(live, piece, cell.x, cell.y) || piece === "erase" || tool === "paste" };
    if (!painting.current || !live || !cell || tool !== "paint" || piece === "pick" || piece === "start" || piece === "dock" || piece === "bridge") {
      redraw();
      return;
    }
    const last = stroke.current[stroke.current.length - 1];
    if (last && last.x === cell.x && last.y === cell.y) return;
    const cells: { x: number; y: number }[] = [];
    if (!last) cells.push(cell);
    else {
      const steps = Math.max(Math.abs(cell.x - last.x), Math.abs(cell.y - last.y));
      for (let i = 1; i <= steps; i++) {
        cells.push({
          x: Math.round(last.x + ((cell.x - last.x) * i) / steps),
          y: Math.round(last.y + ((cell.y - last.y) * i) / steps),
        });
      }
    }
    stroke.current.push(cell);
    paintCells(live, cells);
    redraw();
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pan.current?.id === e.pointerId) pan.current = null;
    if (pointers.current.size < 2) pinch.current = null;
    if (dragFlag.current) {
      window.clearTimeout(holdFlag.current);
      dragFlag.current = null;
      painting.current = false;
      redraw();
      return;
    }
    if (tool === "select") {
      painting.current = false;
      redraw();
      return;
    }
    if (painting.current && tool === "paint" && (piece === "bridge" || piece === "start" || piece === "dock")) {
      const live = docRef.current;
      const cell = cellOf(e.clientX, e.clientY, e.pointerType === "touch");
      if (live && cell) paintCells(live, [cell]);
    }
    painting.current = false;
    redraw();
  };

  const undo = () => {
    const live = docRef.current;
    const prev = undoRef.current.pop();
    if (!live || !prev) return;
    redoRef.current.push(cloneDoc(live));
    docRef.current = prev;
    redraw();
  };

  const redo = () => {
    const live = docRef.current;
    const next = redoRef.current.pop();
    if (!live || !next) return;
    undoRef.current.push(cloneDoc(live));
    docRef.current = next;
    redraw();
  };

  const check = () => {
    const live = docRef.current;
    if (!live) return;
    const found = audit(live);
    const purse = fairnessNotes(live);
    setNotes(found);
    setFair(purse);
    if (!found.length) setCode(shareCode(live));
  };

  const fix = () => {
    const live = docRef.current;
    if (!live) return;
    const found = audit(live);
    setNotes(found);
    setFair(fairnessNotes(live));
    const spot = auditFocus(live);
    if (!spot) return;
    camRef.current.x = spot.x;
    camRef.current.y = spot.y;
    clampEditorCam(camRef.current, live.w, live.h);
    redraw();
  };

  const save = () => {
    const live = docRef.current;
    if (!live) return;
    const result = saveMap(live);
    if (!result.ok) {
      setNotes(result.notes);
      return;
    }
    live.id = result.id;
    onSaved(result.id);
  };

  const jumpMini = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mini = miniRef.current;
    const live = docRef.current;
    if (!mini || !live) return;
    const r = mini.getBoundingClientRect();
    camRef.current.x = Math.max(0, Math.min(live.w, ((e.clientX - r.left) / r.width) * live.w));
    camRef.current.y = Math.max(0, Math.min(live.h, ((e.clientY - r.top) / r.height) * live.h));
    redraw();
  };

  if (stage === "new") {
    const pinIds = ["fourisles", "hoppers", "pond", "ridge", "treasure", "alley", "coastal", "dugout", "normandy"];
    const pinned = pinIds.map((id) => TEMPLATES.find((card) => card.id === id)).filter((card): card is TemplateCard => !!card);
    const rest = TEMPLATES.filter((card) => !pinIds.includes(card.id));
    const card = TEMPLATES.find((t) => t.id === picked);
    const spec = presetById(sizeId);
    const openW = picked === "blank" || !sizeLocked ? spec.w : card?.w ?? spec.w;
    const openH = picked === "blank" || !sizeLocked ? spec.h : card?.h ?? spec.h;
    const fieldLabel = skirmish
      ? skirmish.customId
        ? (resolveMyMap(skirmish.customId)?.name ?? "Saved map")
        : (MAP_LIST.find((m) => m.id === skirmish.mapId)?.name ?? "Skirmish")
      : "";
    return (
      <div className="flex h-dvh min-h-0 flex-col bg-field">
        <header className="flex items-center justify-between px-3 pt-3">
          <h2 className="font-display text-xl uppercase tracking-widest text-gold">New map</h2>
          <button type="button" className="h-11 border border-brass-dim bg-steel-top px-3 font-display text-xs uppercase text-ink" onClick={onClose}>
            Back
          </button>
        </header>
        <label className="mx-3 mt-2 flex flex-col gap-1 font-display text-xs uppercase text-brass">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 28))}
            className="steel-inset h-12 px-3 font-display text-base text-ink outline-none"
          />
        </label>
        <div className="mx-3 mt-2">
          <p className="mb-1 font-display text-[10px] uppercase tracking-widest text-brass">Map size</p>
          <div className="flex gap-1 overflow-x-auto" data-testid="editor-sizes">
            {MAP_PRESETS.map((s) => {
              const on = !sizeLocked && sizeId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`size-${s.id}`}
                  className={`h-11 min-w-11 shrink-0 px-2 font-display text-xs uppercase ${on ? "steel-inset text-gold" : "border border-brass-dim bg-steel-top text-ink"}`}
                  onClick={() => {
                    setSizeId(s.id);
                    setSizeLocked(false);
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-sm text-brass">
            Opens at {openW}×{openH}. A template keeps its own size until you pick a grid.
          </p>
        </div>
        <div className="mt-2 min-h-0 flex-1 touch-pan-y overflow-y-auto px-3 pb-3">
          <p className="mb-1 font-display text-[10px] uppercase tracking-widest text-gold">Featured</p>
          <p className="mb-1 text-xs text-pretty text-brass">Mountain blocks tanks. Rich is the prize. A Dock ruin marks a harbor. Remix copies a map. Save stores a new one.</p>
          <div className="grid grid-cols-1 gap-2 landscape:grid-cols-2">
            {FEATURED.map((card) => {
              const id = `feat:${card.id}`;
              const on = picked === id;
              return (
                <button
                  key={card.id}
                  type="button"
                  data-testid={`featured-${card.id}`}
                  onClick={() => {
                    setPicked(id);
                    setName(card.name);
                    setSizeLocked(true);
                  }}
                  className={`flex items-stretch gap-2 px-2 py-2 text-left ${on ? "steel-inset" : "border border-brass-dim bg-steel-top"}`}
                >
                  <LayoutThumb id={id} w={card.w} h={card.h} />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-display text-sm uppercase tracking-wide ${on ? "text-gold" : "text-ink"}`}>{card.name}</span>
                    <span className={`block font-display text-[10px] uppercase ${on ? "text-brass" : "text-brass-dim"}`}>
                      {card.players} · {card.w}×{card.h} · {suggestLabel(card)}
                    </span>
                    <span className={`block text-xs text-pretty ${on ? "text-ink" : "text-ink"}`}>{card.line}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 mb-1 font-display text-[10px] uppercase tracking-widest text-brass">Basic set</p>
          <div className="grid grid-cols-1 gap-2 landscape:grid-cols-2">
            {pinned.map((item) => (
              <TemplateButton
                key={item.id}
                card={item}
                active={picked === item.id}
                onPick={() => {
                  setPicked(item.id);
                  setName(item.name);
                  setSizeLocked(true);
                }}
              />
            ))}
            {rest.map((item) => (
              <TemplateButton
                key={item.id}
                card={item}
                active={picked === item.id}
                onPick={() => {
                  setPicked(item.id);
                  setName(item.name);
                  setSizeLocked(true);
                }}
              />
            ))}
            <button
              type="button"
              data-testid="template-blank"
              onClick={() => {
                setPicked("blank");
                setName("Blank");
                setSizeLocked(false);
              }}
              className={`flex items-stretch gap-2 px-2 py-2 text-left ${picked === "blank" ? "steel-inset" : "border border-brass-dim bg-steel-top"}`}
            >
              <LayoutThumb id="blank" w={64} h={64} />
              <span className="min-w-0 flex-1">
                <span className={`block font-display text-sm uppercase tracking-wide ${picked === "blank" ? "text-gold" : "text-ink"}`}>Blank</span>
                <span className={`block font-display text-[10px] uppercase ${picked === "blank" ? "text-brass" : "text-brass-dim"}`}>Uses the size above · desert</span>
                <span className={`block text-xs text-pretty ${picked === "blank" ? "text-ink" : "text-ink"}`}>Open sand and a crystal heart. Paint the rest yourself.</span>
              </span>
            </button>
            {skirmish && (
              <button
                type="button"
                data-testid="template-field"
                onClick={() => {
                  setPicked("field");
                  setName(fieldLabel);
                  setSizeLocked(true);
                }}
                className={`flex items-stretch gap-2 px-2 py-2 text-left ${picked === "field" ? "steel-inset" : "border border-brass-dim bg-steel-top"}`}
              >
                <span className="flex size-16 shrink-0 items-center justify-center bg-well font-display text-xs uppercase text-gold">Field</span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-display text-sm uppercase tracking-wide ${picked === "field" ? "text-gold" : "text-ink"}`}>From current skirmish map</span>
                  <span className={`block font-display text-[10px] uppercase ${picked === "field" ? "text-brass" : "text-brass-dim"}`}>{fieldLabel}</span>
                  <span className={`block text-xs text-pretty ${picked === "field" ? "text-ink" : "text-ink"}`}>Copies the lobby field so you can paint over it.</span>
                </span>
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 bg-well p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="h-14 flex-1 border border-brass-dim bg-steel-top font-display text-sm uppercase text-ink"
            onClick={() => setNudge(1 + Math.floor(Math.random() * 6))}
          >
            Randomize{nudge ? ` ${nudge}` : ""}
          </button>
          <button type="button" className="h-14 flex-[2] bg-crystal font-display text-base uppercase text-crystal-ink" onClick={begin}>
            {picked.startsWith("feat:") ? "Remix" : "Open editor"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-field">
      <header className="flex h-12 shrink-0 items-center gap-1 bg-well px-1">
        <button type="button" aria-label="Back" className="grid h-11 shrink-0 place-items-center border border-brass-dim bg-steel-top px-2 font-display text-xs uppercase text-ink" onClick={onClose}>
          Back
        </button>
        <span className="min-w-0 flex-1 truncate font-display text-xs uppercase text-gold">{doc?.name}</span>
        <span className="shrink-0 font-display text-[10px] uppercase text-brass">
          {doc && doc.starts.length > 2 ? `You enemy +${doc.starts.length - 2}` : PIECE_SHORT[piece]}
        </span>
        <button type="button" data-testid="editor-undo" aria-label="Undo" className="grid size-11 shrink-0 place-items-center border border-brass-dim bg-steel-top text-ink" onClick={undo}>
          <Undo2 className="size-5" />
        </button>
        <button type="button" data-testid="editor-redo" aria-label="Redo" className="grid size-11 shrink-0 place-items-center border border-brass-dim bg-steel-top text-ink" onClick={redo}>
          <Redo2 className="size-5" />
        </button>
        <button type="button" data-testid="editor-fit" aria-label="Fit map" className="grid size-11 shrink-0 place-items-center border border-brass-dim bg-steel-top text-ink" onClick={fitNow}>
          <Expand className="size-5" />
        </button>
        <button
          type="button"
          aria-label={grid ? "Hide grid" : "Show grid"}
          aria-pressed={grid}
          className={`grid size-11 shrink-0 place-items-center border border-brass-dim ${grid ? "steel-inset text-gold" : "bg-steel-top text-ink"}`}
          onClick={() => setGrid((v) => !v)}
        >
          <Grid3x3 className="size-5" />
        </button>
        <button type="button" aria-label="Check map" className="grid size-11 shrink-0 place-items-center bg-crystal text-crystal-ink" onClick={check}>
          <Check className="size-5" />
        </button>
        <button type="button" data-testid="editor-fix" aria-label="Fix map" className="grid h-11 shrink-0 place-items-center border border-brass-dim bg-steel-top px-2 font-display text-[10px] uppercase text-ink" onClick={fix}>
          Fix
        </button>
      </header>
      {remixLabel ? (
        <p data-testid="remix-banner" className="shrink-0 bg-well px-2 py-1 text-xs text-pretty text-brass">
          Remix of {remixLabel}. Save stores a new map. Featured stays as it is.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col min-[900px]:flex-row">
        <aside
          className={`${toolsOpen ? "flex" : "hidden"} order-2 max-h-[38vh] min-h-0 w-full flex-col gap-2 overflow-y-auto bg-well p-2 touch-pan-y min-[900px]:order-1 min-[900px]:flex min-[900px]:max-h-none min-[900px]:w-52 min-[900px]:shrink-0`}
        >
          <EditorTools
            symmetry={symmetry}
            square={square}
            layers={layers}
            tool={tool}
            hasClip={hasClip}
            onSymmetry={setSymmetry}
            onLayer={(id) => setLayers((prev) => ({ ...prev, [id]: !prev[id] }))}
            onTool={setTool}
            onCopy={copySel}
            onSize={applySize}
            docW={doc?.w ?? 0}
            docH={doc?.h ?? 0}
          />
        </aside>
        <div className="relative order-1 min-h-0 min-w-0 flex-1 min-[900px]:order-2">
          <canvas
            ref={canvasRef}
            data-testid="editor-canvas"
            className="h-full w-full touch-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          <canvas
            ref={miniRef}
            data-testid="editor-minimap"
            className="absolute top-2 right-2 z-10 touch-none border-2 border-brass bg-well"
            onPointerDown={(e) => {
              e.stopPropagation();
              jumpMini(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons) jumpMini(e);
            }}
          />
        </div>
      </div>
      {notes && (
        <div className="shrink-0 bg-well px-2 py-1">
          {notes.length === 0 ? (
            <p className="text-sm text-crystal">{fair.length === 0 ? "Ready to save. Purses within 15%." : "Ready to save."}</p>
          ) : (
            <ul className="text-sm text-danger">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {fair.length > 0 && (
            <ul className="text-sm text-brass">
              {fair.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex gap-1">
            <button type="button" className="h-12 flex-1 bg-crystal font-display text-sm uppercase text-crystal-ink" onClick={save}>
              Save on device
            </button>
            {doc?.id && (
              <button
                type="button"
                className="h-12 border border-brass-dim bg-steel-top px-3 font-display text-xs uppercase text-ink"
                onClick={() => {
                  deleteMap(doc.id);
                  onClose();
                }}
              >
                Delete
              </button>
            )}
          </div>
          {code && <textarea readOnly value={code} className="steel-inset mt-1 h-16 w-full p-1 text-xs text-ink" />}
        </div>
      )}
      <PieceDock
        page={page}
        piece={piece}
        brush={brush}
        tool={tool}
        toolsOpen={toolsOpen}
        onPage={(n) => {
          setPage(n);
          const first = PIECE_PAGES[n]?.pieces[0]?.id;
          if (first) setPiece(first);
        }}
        onPiece={choosePiece}
        onBrush={setBrush}
        onTools={() => setToolsOpen((v) => !v)}
      />
    </div>
  );
}

function paintMini(
  mini: HTMLCanvasElement | null,
  live: EditorDoc,
  cam: Camera,
  viewW: number,
  viewH: number,
  layers: { terrain: boolean; resources: boolean; starts: boolean; objects: boolean },
) {
  if (!mini) return;
  const long = viewW < 720 ? 84 : 128;
  const cssW = live.w >= live.h ? long : Math.max(72, Math.round((long * live.w) / live.h));
  const cssH = live.h >= live.w ? long : Math.max(72, Math.round((long * live.h) / live.w));
  mini.style.width = `${cssW}px`;
  mini.style.height = `${cssH}px`;
  const dpr = frameScale();
  const bw = Math.max(1, Math.floor(cssW * dpr));
  const bh = Math.max(1, Math.floor(cssH * dpr));
  if (mini.width !== bw) mini.width = bw;
  if (mini.height !== bh) mini.height = bh;
  const ctx = mini.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let y = 0; y < cssH; y++) {
    for (let x = 0; x < cssW; x++) {
      const tx = Math.min(live.w - 1, Math.floor((x / cssW) * live.w));
      const ty = Math.min(live.h - 1, Math.floor((y / cssH) * live.h));
      const t = live.terrain[ty * live.w + tx] ?? 0;
      const shown = !layers.resources && t === TILE_CRYSTAL ? TILE_SAND : t;
      ctx.fillStyle = layers.terrain || t === TILE_CRYSTAL ? tileColor(shown, tx, ty, live.theater) : "#2c2822";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  if (layers.starts) {
    ctx.fillStyle = "#e4c15a";
    for (const s of live.starts) {
      const x = (s.x / live.w) * cssW;
      const y = (s.y / live.h) * cssH;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  const halfW = viewW / (2 * cam.zoom);
  const halfH = viewH / (2 * cam.zoom);
  ctx.strokeStyle = "#e4c15a";
  ctx.lineWidth = 2;
  ctx.strokeRect(((cam.x - halfW) / live.w) * cssW, ((cam.y - halfH) / live.h) * cssH, ((halfW * 2) / live.w) * cssW, ((halfH * 2) / live.h) * cssH);
}

function EditorTools({
  symmetry,
  square,
  layers,
  tool,
  hasClip,
  docW,
  docH,
  onSymmetry,
  onLayer,
  onTool,
  onCopy,
  onSize,
}: {
  symmetry: Symmetry;
  square: boolean;
  layers: Record<EditorLayer, boolean>;
  tool: "paint" | "select" | "paste";
  hasClip: boolean;
  docW: number;
  docH: number;
  onSymmetry: (s: Symmetry) => void;
  onLayer: (id: EditorLayer) => void;
  onTool: (t: "paint" | "select" | "paste") => void;
  onCopy: () => void;
  onSize: (id: string) => void;
}) {
  const off = "h-11 min-w-11 border border-brass-dim bg-steel-top px-2 font-display text-xs uppercase text-ink";
  const on = "h-11 min-w-11 steel-inset px-2 font-display text-xs uppercase text-gold";
  return (
    <>
      <Tray label="Symmetry">
        {(
          [
            ["off", "Off"],
            ["x", "X"],
            ["y", "Y"],
            ["rot2", "180"],
            ["rot4", "90"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`symmetry-${id}`}
            disabled={id === "rot4" && !square}
            className={`${symmetry === id ? on : off} disabled:opacity-40`}
            onClick={() => onSymmetry(id)}
          >
            {label}
          </button>
        ))}
      </Tray>
      <p className="text-xs text-brass">Paint once. Starts and rich fields mirror. 90 needs a square map.</p>
      <Tray label="Layers">
        {(
          [
            ["terrain", "Terrain"],
            ["resources", "Resources"],
            ["starts", "Starts"],
            ["objects", "Objects"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" data-testid={`layer-${id}`} className={layers[id] ? on : off} onClick={() => onLayer(id)}>
            {label}
          </button>
        ))}
      </Tray>
      <Tray label="Select">
        <button type="button" data-testid="editor-select" className={tool === "select" ? on : off} onClick={() => onTool("select")}>
          Select
        </button>
        <button type="button" data-testid="editor-copy" className={off} onClick={onCopy}>
          Copy
        </button>
        <button type="button" data-testid="editor-paste" className={tool === "paste" ? on : off} disabled={!hasClip} onClick={() => onTool("paste")}>
          Paste
        </button>
      </Tray>
      <Tray label={`Size ${docW}×${docH}`}>
        {MAP_PRESETS.map((s) => (
          <button key={s.id} type="button" className={docW === s.w && docH === s.h ? on : off} onClick={() => onSize(s.id)}>
            {s.label}
          </button>
        ))}
      </Tray>
      <p className="text-xs text-pretty text-brass">One finger paints. Pinch to zoom. Two fingers pan. Undo is the arrow in the bar.</p>
    </>
  );
}

const PIECE_SHORT: Record<Piece, string> = {
  land: "Clear",
  rough: "Rough",
  sand: "Sand",
  shallow: "Shallow",
  deep: "Deep",
  shore: "Shore",
  mountain: "Mount",
  valley: "Rough",
  cliff: "Cliff",
  rock: "Rock",
  ramp: "Ramp",
  road: "Road",
  bridge: "Bridge",
  ford: "Ford",
  crystal: "Ore",
  rich: "Rich",
  gems: "Gems",
  spawn: "Spawn",
  start: "Start",
  dock: "Dock",
  erase: "Erase",
  pick: "Pick",
};

const PIECE_ART: Partial<Record<Piece, string>> = {
  sand: "/art/sand.png",
  shallow: "/art/shallow.png",
  deep: "/art/deep.png",
  shore: "/art/shore.png",
  rock: "/art/rock.png",
  mountain: "/art/rock.png",
  cliff: "/art/rock.png",
  crystal: "/art/crystal.png",
  rich: "/art/crystal.png",
  gems: "/art/crystal.png",
  ford: "/art/shallow.png",
  spawn: "/art/sand.png",
  start: "/art/sand.png",
  dock: "/art/shallow.png",
  erase: "/art/sand.png",
  road: "/art/sand.png",
  bridge: "/art/shore.png",
};

function PieceGlyph({ id }: { id: Piece }) {
  const art = PIECE_ART[id];
  return (
    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden border border-brass-dim bg-[#14384c]">
      {art ? (
        <img src={art} alt="" className="size-full object-cover" style={{ imageRendering: "auto" }} />
      ) : (
        <span className="size-full bg-[#6e5e4c]" />
      )}
      {id === "land" && <span className="absolute inset-0 bg-[#4e7a3c]" />}
      {id === "rough" && <span className="absolute inset-0 bg-[#3d5a30]" />}
      {id === "ramp" && <span className="absolute inset-0 bg-[#6a5c48]" />}
      {id === "mountain" && <span className="absolute inset-x-1 top-1 h-4 bg-[#efe6d4] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />}
      {id === "cliff" && <span className="absolute inset-x-0 bottom-0 h-3 bg-[#2a241c]" />}
      {id === "gems" && <span className="absolute top-1 right-1 size-3 bg-[#b8ffd0] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />}
      {id === "road" && <span className="absolute inset-y-2 right-2 left-2 bg-[#6e5232]" />}
      {id === "bridge" && (
        <span className="absolute inset-x-1 top-2 h-5 bg-[#a07848] shadow-[inset_0_2px_0_#7a5a38,inset_0_-2px_0_#7a5a38]" />
      )}
      {id === "ford" && <span className="absolute bottom-1 left-1 size-2 rounded-full bg-[#e2c48a]" />}
      {id === "rich" && <span className="absolute top-0.5 right-0.5 size-2.5 bg-gold [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />}
      {id === "spawn" && <span className="absolute inset-2 border-2 border-gold" />}
      {id === "start" && (
        <>
          <span className="absolute top-1 left-3 h-6 w-1 bg-gold" />
          <span className="absolute top-1 left-4 h-3 w-4 bg-gold" />
        </>
      )}
      {id === "dock" && <span className="absolute bottom-1 left-1 h-2 w-6 bg-[#a07848]" />}
      {id === "erase" && <span className="absolute inset-1 rotate-45 border-t-2 border-danger" />}
      {id === "pick" && <span className="absolute top-1 right-2 h-6 w-1.5 rotate-45 bg-gold" />}
    </span>
  );
}

function PieceDock({
  page,
  piece,
  brush,
  tool,
  toolsOpen,
  onPage,
  onPiece,
  onBrush,
  onTools,
}: {
  page: number;
  piece: Piece;
  brush: Brush;
  tool: "paint" | "select" | "paste";
  toolsOpen: boolean;
  onPage: (n: number) => void;
  onPiece: (id: Piece) => void;
  onBrush: (n: Brush) => void;
  onTools: () => void;
}) {
  const pieces = PIECE_PAGES[page]?.pieces ?? [];
  const hot = "steel-inset text-gold";
  const cold = "border border-brass-dim bg-steel-top text-ink";
  const tab = "h-11 min-w-0 flex-1 truncate px-1 font-display text-[10px] uppercase";
  return (
    <div className="shrink-0 border-t border-brass-dim bg-well pb-[max(6px,env(safe-area-inset-bottom))]" data-testid="piece-dock">
      <div className="flex gap-1 px-1 pt-1">
        <button
          type="button"
          data-testid="editor-tools"
          className={`h-11 shrink-0 px-3 font-display text-[10px] uppercase min-[900px]:hidden ${toolsOpen ? hot : cold}`}
          onClick={onTools}
        >
          {toolsOpen ? "Hide" : "Tools"}
        </button>
        {PIECE_PAGES.map((p, i) => (
          <button key={p.id} type="button" data-testid={`page-${p.id}`} className={`${tab} ${page === i ? hot : cold}`} onClick={() => onPage(i)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto px-1 py-1">
        {pieces.map((p) => {
          const active = piece === p.id && tool === "paint";
          return (
            <button
              key={p.id}
              type="button"
              data-testid={`piece-${p.id}`}
              aria-label={p.label}
              aria-pressed={active}
              className={`flex h-[4.25rem] w-14 shrink-0 flex-col items-center justify-center gap-0.5 ${active ? hot : cold}`}
              onClick={() => onPiece(p.id)}
            >
              <PieceGlyph id={p.id} />
              <span className="max-w-full truncate px-0.5 font-display text-[10px] uppercase leading-none">{PIECE_SHORT[p.id]}</span>
            </button>
          );
        })}
        {(["erase", "pick"] as const).map((id) => {
          const active = piece === id && tool === "paint";
          return (
            <button
              key={id}
              type="button"
              data-testid={`piece-${id}`}
              aria-label={id === "erase" ? "Erase" : "Pick"}
              aria-pressed={active}
              className={`flex h-[4.25rem] w-14 shrink-0 flex-col items-center justify-center gap-0.5 ${active ? hot : cold}`}
              onClick={() => onPiece(id)}
            >
              <PieceGlyph id={id} />
              <span className="font-display text-[10px] uppercase leading-none">{PIECE_SHORT[id]}</span>
            </button>
          );
        })}
        <span className="flex shrink-0 items-center gap-1 pl-1">
          {([1, 3, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`brush-${n}`}
              aria-label={`Brush ${n}`}
              className={`grid size-11 place-items-center font-display text-sm ${brush === n ? hot : cold}`}
              onClick={() => onBrush(n)}
            >
              {n}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

function Tray({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display text-[10px] uppercase tracking-wide text-brass">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

const previewCache = new Map<string, EditorDoc>();

function previewDoc(id: string): EditorDoc {
  const hit = previewCache.get(id);
  if (hit) return hit;
  const next = id === "blank" ? emptyDoc(64, "Blank", "desert") : id.startsWith("feat:") ? buildFeatured(id.slice(5)) : buildTemplate(id);
  previewCache.set(id, next);
  return next;
}

function cardMeta(card: TemplateCard): string {
  const who = card.flags ? `${card.players} listed · ${card.flags} starts` : `${card.players} players`;
  return `${who} · ${card.w}×${card.h} · ${card.theater}${card.naval ? " · naval" : ""}`;
}

function TemplateButton({
  card,
  active,
  featured,
  onPick,
}: {
  card: TemplateCard;
  active: boolean;
  featured?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`template-${card.id}`}
      onClick={onPick}
      className={`flex w-full items-stretch gap-2 px-2 py-2 text-left ${active ? "steel-inset" : "border border-brass-dim bg-steel-top"}`}
    >
      <LayoutThumb id={card.id} w={card.w} h={card.h} featured={featured} />
      <span className="min-w-0 flex-1">
        <span className={`block font-display text-sm uppercase tracking-wide ${active ? "text-gold" : "text-ink"}`}>{card.name}</span>
        <span className={`block font-display text-[10px] uppercase ${active ? "text-brass" : "text-brass-dim"}`}>{cardMeta(card)}</span>
        <span className={`block text-xs text-pretty ${active ? "text-ink" : "text-ink"}`}>{card.line}</span>
      </span>
    </button>
  );
}

function LayoutThumb({ id, w, h, featured }: { id: string; w: number; h: number; featured?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let n = 0;
    let raf = 0;
    const tick = () => {
      paintThumb(canvas, previewDoc(id));
      n += 1;
      if (canvas.width < 200 && n < 40) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return (
    <span className={`flex shrink-0 items-center justify-center bg-well ${featured ? "size-24" : "size-16"}`}>
      <canvas
        ref={ref}
        width={w}
        height={h}
        aria-hidden
        className="max-h-full max-w-full"
        style={{ imageRendering: "auto", objectFit: "contain", width: "100%", height: "100%" }}
      />
    </span>
  );
}

function paintThumb(canvas: HTMLCanvasElement, doc: EditorDoc) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const gpu = bakeTerrain(doc.terrain, doc.w, doc.h, doc.theater, Math.min(640, Math.max(doc.w, doc.h) * 6));
  if (gpu) {
    canvas.width = gpu.width;
    canvas.height = gpu.height;
    ctx.drawImage(gpu, 0, 0);
    const sx = gpu.width / doc.w;
    const sy = gpu.height / doc.h;
    ctx.fillStyle = "#e4c15a";
    for (const s of doc.starts) {
      ctx.beginPath();
      ctx.arc(s.x * sx, s.y * sy, Math.max(2.5, sx * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  canvas.width = doc.w;
  canvas.height = doc.h;
  const img = ctx.createImageData(doc.w, doc.h);
  const data = img.data;
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      const i = y * doc.w + x;
      const color = tileColor(doc.terrain[i] ?? 0, x, y, doc.theater);
      const n = Number.parseInt(color.slice(1), 16);
      const rich = (doc.crystal[i] ?? 0) >= 1200;
      const o = i * 4;
      data[o] = rich ? 80 : (n >> 16) & 255;
      data[o + 1] = rich ? 210 : (n >> 8) & 255;
      data[o + 2] = rich ? 110 : n & 255;
      data[o + 3] = 255;
    }
  }
  for (const s of doc.starts) {
    const x = Math.min(doc.w - 1, Math.max(0, Math.floor(s.x)));
    const y = Math.min(doc.h - 1, Math.max(0, Math.floor(s.y)));
    const o = (y * doc.w + x) * 4;
    data[o] = 228;
    data[o + 1] = 193;
    data[o + 2] = 90;
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
