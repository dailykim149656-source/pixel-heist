"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { occupiedAt, type Placement } from "@/lib/geometry";
import { judge, placementProblem, snapToLedges } from "@/lib/judge";
import { planRun, runDurationMs, RUN_SPEED_PX_PER_S, type GameState, type RunPlan } from "@/lib/heist";
import { buildPreview, extractLoot, normalizePhoto, segmentLive, segmentSample, type LootItem, type Photo, type Preview } from "@/lib/loot";
import { SEGMENT_ERROR_TEXT, type PromptPoint, type SegmentErrorCode } from "@/lib/segment-types";
import { samBagged, samError, samGreeting, samRecordedMiss, samReply, yourRequest, type ChatMessage } from "@/lib/sam-voice";
import { FLOOR_Y, MAX_LOOT, ROTATE_STEP_DEG, THIEF, WORLD } from "@/lib/stage";
import type { Scene } from "@/lib/draw";
import { LootBar } from "./LootBar";
import { MissionPanel } from "./MissionPanel";
import { PhotoPanel } from "./PhotoPanel";
import { SketchWorld } from "./SketchWorld";
import { SuccessCard } from "./SuccessCard";

export type Inference = "LIVE_API" | "PRECOMPUTED_SAMPLE";
export type SegmentState =
  | { kind: "IDLE" }
  | { kind: "LOADING"; points: PromptPoint[] }
  | { kind: "PREVIEW"; preview: Preview; pending: PromptPoint[] }
  | { kind: "EMPTY_RESULT" | "ERROR"; code: SegmentErrorCode; message: string; points: PromptPoint[] };

type Placed = { x: number; y: number; rotationDeg: number };
type Drag = { id: string; rotationDeg: number; grab: { dx: number; dy: number }; world: { x: number; y: number } | null };

export function Game({ onExit }: { onExit: () => void }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [inference, setInference] = useState<Inference>("LIVE_API");
  const [seg, setSeg] = useState<SegmentState>({ kind: "IDLE" });
  const [loot, setLoot] = useState<LootItem[]>([]);
  const [placed, setPlaced] = useState<Record<string, Placed>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [gameState, setGameState] = useState<GameState>("SETUP");
  const [run, setRun] = useState<{ plan: RunPlan; startedAt: number } | null>(null);
  const [now, setNow] = useState(0);
  const [extractions, setExtractions] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const worldRef = useRef<HTMLCanvasElement>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const chatId = useRef(0);
  const say = useCallback((from: ChatMessage["from"], msg: string | Omit<ChatMessage, "id" | "from">) => {
    const body = typeof msg === "string" ? { text: msg } : msg;
    setChat((c) => [...c, { id: ++chatId.current, from, ...body }].slice(-12));
  }, []);

  const byId = useMemo(() => new Map(loot.map((l) => [l.id, l])), [loot]);

  // ---- photo + segmentation -------------------------------------------------------------
  const loadPhoto = useCallback(async (file: Blob, kind: Photo["kind"]) => {
    setPhotoError(null);
    setSeg({ kind: "IDLE" });
    try {
      const p = await normalizePhoto(file, kind);
      setPhoto((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return p;
      });
      if (kind === "upload") setInference("LIVE_API");
      setChat([]);
      say("sam", samGreeting(kind));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "That image couldn't be read.");
    }
  }, [say]);

  const trySample = useCallback(async () => {
    const blob = await (await fetch("/sample/desk.png")).blob();
    await loadPhoto(blob, "sample");
  }, [loadPhoto]);

  const segment = useCallback(
    async (points: PromptPoint[]) => {
      if (!photo) return;
      const refining = points.length > 1;
      setSeg({ kind: "LOADING", points });
      say("you", yourRequest(points, refining));
      const res = inference === "LIVE_API" ? await segmentLive(photo, points) : await segmentSample(points[0]);
      if (!res.ok) {
        setSeg({ kind: res.code === "NO_OBJECT" ? "EMPTY_RESULT" : "ERROR", code: res.code, message: res.message, points });
        say("sam", inference === "PRECOMPUTED_SAMPLE" && res.code === "NO_OBJECT" ? samRecordedMiss() : samError(res.code, photo.kind === "sample"));
        return;
      }
      try {
        const preview = await buildPreview(photo, res, points);
        setSeg({ kind: "PREVIEW", preview, pending: [] });
        say("sam", samReply(res, preview.shape.metrics, refining));
      } catch {
        setSeg({ kind: "ERROR", code: "MASK_PARSE_ERROR", message: SEGMENT_ERROR_TEXT.MASK_PARSE_ERROR, points });
        say("sam", samError("MASK_PARSE_ERROR", photo.kind === "sample"));
      }
    },
    [photo, inference, say],
  );

  const onPhotoClick = useCallback(
    (pt: { x: number; y: number }, mod: "new" | "add" | "remove") => {
      if (seg.kind === "LOADING") return; // no duplicate calls while one is in flight (FR-02)
      if (mod === "new" || seg.kind !== "PREVIEW") {
        void segment([{ ...pt, label: "positive" }]);
        return;
      }
      if (inference !== "LIVE_API") return;
      const label = mod === "add" ? "positive" : "negative";
      setSeg({ ...seg, pending: [...seg.pending, { ...pt, label }] });
    },
    [seg, segment, inference],
  );

  const refine = useCallback(() => {
    if (seg.kind !== "PREVIEW" || seg.pending.length === 0) return;
    void segment([...seg.preview.points, ...seg.pending]);
  }, [seg, segment]);

  const extract = useCallback(() => {
    if (seg.kind !== "PREVIEW" || loot.length >= MAX_LOOT) return;
    const item = extractLoot(seg.preview);
    setLoot((l) => [...l, item]);
    setSelected(item.id);
    setExtractions((n) => n + 1);
    setSeg({ kind: "IDLE" });
    say("sam", samBagged(loot.length + 1));
  }, [seg, loot.length, say]);

  const discard = useCallback((id: string) => {
    setLoot((l) => l.filter((x) => x.id !== id));
    setPlaced(({ [id]: _, ...rest }) => rest);
    setSelected((s) => (s === id ? null : s));
  }, []);

  // ---- placements + judging -------------------------------------------------------------
  const toPlacement = useCallback(
    (id: string, p: Placed): Placement => ({ shape: byId.get(id)!.shape, x: p.x, y: p.y, rotationDeg: p.rotationDeg }),
    [byId],
  );

  const candidate = useMemo(() => {
    if (!drag?.world) return null;
    const raw = { shape: byId.get(drag.id)!.shape, x: drag.world.x - drag.grab.dx, y: drag.world.y - drag.grab.dy, rotationDeg: drag.rotationDeg };
    return snapToLedges(raw);
  }, [drag, byId]);

  const placedList = useMemo(
    () => Object.entries(placed).filter(([id]) => id !== drag?.id && byId.has(id)).map(([id, p]) => ({ id, placement: toPlacement(id, p) })),
    [placed, drag, byId, toPlacement],
  );

  const settled = useMemo(() => judge(placedList.map((p) => p.placement)), [placedList]);
  const live = useMemo(
    () => (candidate ? judge([...placedList.map((p) => p.placement), candidate]) : settled),
    [candidate, placedList, settled],
  );
  const candidateProblem = candidate ? placementProblem(candidate) : null;
  const candidateStatus = !candidate
    ? null
    : candidateProblem
      ? "invalid"
      : (live.camera.blocked && !settled.camera.blocked) || (live.gap.bridged && !settled.gap.bridged)
        ? "useful"
        : "neutral";

  const missions = { cameraBlocked: settled.camera.blocked, gapBridged: settled.gap.bridged, vaultReached: gameState === "WON" };

  useEffect(() => {
    if (gameState === "SETUP" || gameState === "READY") setGameState(placedList.length > 0 ? "READY" : "SETUP");
  }, [placedList.length, gameState]);

  // ---- drag & rotate --------------------------------------------------------------------
  const worldPoint = useCallback((clientX: number, clientY: number) => {
    const c = worldRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    return { x: ((clientX - r.left) / r.width) * WORLD.width, y: ((clientY - r.top) / r.height) * WORLD.height };
  }, []);

  const editable = gameState === "SETUP" || gameState === "READY";

  const startDragFromLoot = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (!editable) return;
      e.preventDefault();
      setSelected(id);
      const g = byId.get(id)!.shape.grid;
      setDrag({ id, rotationDeg: placed[id]?.rotationDeg ?? 0, grab: { dx: 0, dy: -g.height / 2 + 10 }, world: worldPoint(e.clientX, e.clientY) });
    },
    [byId, placed, worldPoint, editable],
  );

  const startDragFromWorld = useCallback(
    (e: React.PointerEvent) => {
      if (!editable) return;
      const w = worldPoint(e.clientX, e.clientY);
      if (!w) return;
      for (const { id, placement } of [...placedList].reverse()) {
        if (occupiedAt(placement, w.x, w.y)) {
          e.preventDefault();
          setSelected(id);
          setDrag({ id, rotationDeg: placement.rotationDeg, grab: { dx: w.x - placement.x, dy: w.y - placement.y }, world: w });
          return;
        }
      }
      setSelected(null);
    },
    [placedList, worldPoint, editable],
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, world: worldPoint(e.clientX, e.clientY) } : d));
    const up = () => {
      if (candidate && !candidateProblem) {
        setPlaced((p) => ({ ...p, [drag.id]: { x: candidate.x, y: candidate.y, rotationDeg: candidate.rotationDeg } }));
      } else {
        // Off the sketch or on a forbidden spot: back to the loot bar, nothing lost (FR-05).
        setPlaced(({ [drag.id]: _, ...rest }) => rest);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, candidate, candidateProblem, worldPoint]);

  const rotate = useCallback(
    (dir: 1 | -1) => {
      if (!editable) return;
      const step = dir * ROTATE_STEP_DEG;
      if (drag) {
        setDrag({ ...drag, rotationDeg: (drag.rotationDeg + step + 360) % 360 });
        return;
      }
      if (!selected || !placed[selected]) return;
      const p = placed[selected];
      const next = snapToLedges({ ...toPlacement(selected, p), rotationDeg: (p.rotationDeg + step + 360) % 360 });
      if (!placementProblem(next)) setPlaced({ ...placed, [selected]: { x: next.x, y: next.y, rotationDeg: next.rotationDeg } });
    },
    [drag, selected, placed, toPlacement, editable],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "r" || e.key === "R") rotate(e.shiftKey ? -1 : 1);
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !drag) setPlaced(({ [selected]: _, ...rest }) => rest);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [rotate, selected, drag]);

  // ---- RUN HEIST ------------------------------------------------------------------------
  const runHeist = useCallback(() => {
    const plan = planRun(settled);
    setSelected(null);
    setGameState("RUNNING");
    setRun({ plan, startedAt: performance.now() });
  }, [settled]);

  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      const done = t - run.startedAt >= runDurationMs(run.plan);
      if (done && gameState === "RUNNING") {
        setGameState(run.plan.outcome);
        if (run.plan.outcome === "WON") setFinishedAt(Date.now());
      }
      if (!done || run.plan.outcome === "FELL" || run.plan.outcome === "CAUGHT") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, gameState]);

  const resetRun = useCallback(() => {
    setRun(null);
    setGameState(placedList.length ? "READY" : "SETUP");
  }, [placedList.length]);

  const resetAll = useCallback(() => {
    setRun(null);
    setPlaced({});
    setLoot([]);
    setSeg({ kind: "IDLE" });
    setGameState("SETUP");
    setExtractions(0);
    setFinishedAt(null);
  }, []);

  // ---- scene ----------------------------------------------------------------------------
  const thief = useMemo((): Scene["thief"] => {
    if (!run) return { x: THIEF.startX, y: FLOOR_Y, pose: "idle", t: 0 };
    const elapsed = now - run.startedAt;
    const total = runDurationMs(run.plan);
    const x = THIEF.startX + Math.min(elapsed, total) * (RUN_SPEED_PX_PER_S / 1000);
    const over = Math.max(0, elapsed - total);
    const pose = elapsed < total ? "run" : run.plan.outcome === "CAUGHT" ? "caught" : run.plan.outcome === "FELL" ? "fell" : "won";
    return { x, y: settled.gap.surfaceY(x), pose, t: pose === "run" ? elapsed : over };
  }, [run, now, settled]);

  const scene: Scene = {
    placed: placedList.map(({ id, placement }) => ({ placement, sprite: byId.get(id)!.sprite })),
    candidate: candidate && candidateStatus ? { placement: candidate, sprite: byId.get(drag!.id)!.sprite, status: candidateStatus } : null,
    live,
    missions,
    thief,
  };

  const usedItems = placedList.map((p) => byId.get(p.id)!);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={onExit} aria-label="Back to title">
          <span className="logo">PIXEL HEIST</span>
        </button>
        <span className="tagline">Steal reality. Escape the sketch.</span>
        <span className="stage-chip">Stage 1: Museum Sketch Escape</span>
        <button className="icon-btn" onClick={resetAll} title="Start over">↺</button>
      </header>

      <main className="board">
        <PhotoPanel
          photo={photo}
          photoError={photoError}
          inference={inference}
          onInference={setInference}
          seg={seg}
          chat={chat}
          onLoadFile={(f) => void loadPhoto(f, "upload")}
          onTrySample={() => void trySample()}
          onClick={onPhotoClick}
          onRefine={refine}
          onClearPending={() => seg.kind === "PREVIEW" && setSeg({ ...seg, pending: [] })}
          onExtract={extract}
          lootFull={loot.length >= MAX_LOOT}
          onRetry={() => seg.kind === "ERROR" && void segment(seg.points)}
        />

        <section className="world-col">
          <SketchWorld ref={worldRef} scene={scene} onPointerDown={startDragFromWorld} dragging={!!drag} />
          <div className="world-actions">
            <button className="btn" onClick={() => rotate(-1)} disabled={!editable || (!drag && !(selected && placed[selected]))}>⟲ Rotate</button>
            <button className="btn" onClick={() => rotate(1)} disabled={!editable || (!drag && !(selected && placed[selected]))}>Rotate ⟳</button>
            <span className="kbd-hint">R / Shift+R · Del removes</span>
            {gameState === "CAUGHT" || gameState === "FELL" ? (
              <button className="btn btn-primary" onClick={resetRun}>Try again ↺</button>
            ) : (
              <button className="btn btn-primary btn-run" onClick={runHeist} disabled={!editable || placedList.length === 0}>
                RUN HEIST ▶
              </button>
            )}
          </div>
        </section>

        <MissionPanel
          missions={missions}
          settled={settled}
          gameState={gameState}
          failure={run && run.plan.outcome !== "WON" && gameState !== "RUNNING" ? run.plan.reason : null}
          hasLoot={loot.length > 0}
          hasPhoto={!!photo}
          inference={inference}
          photoKind={photo?.kind ?? null}
        />
      </main>

      <LootBar
        loot={loot}
        placedIds={new Set(placedList.map((p) => p.id))}
        selected={selected}
        draggingId={drag?.id ?? null}
        onPointerDown={startDragFromLoot}
        onDiscard={discard}
        disabled={!editable}
      />

      {gameState === "WON" && (
        <SuccessCard
          seconds={Math.round(((finishedAt ?? Date.now()) - startedAt) / 1000)}
          extractions={extractions}
          used={usedItems}
          onRetry={resetRun}
          onNewPhoto={() => {
            resetAll();
            setPhoto(null);
          }}
        />
      )}
    </div>
  );
}
