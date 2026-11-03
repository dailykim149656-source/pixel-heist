"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boxPlacement, occupiedAt, type Placement } from "@/lib/geometry";
import { judge, missionList, placementProblem, snapPlacement } from "@/lib/judge";
import { planRun, runDurationMs, RUN_SPEED_PX_PER_S, thiefY, type GameState, type RunPlan } from "@/lib/heist";
import { buildPreview, extractLoot, normalizePhoto, segmentLive, segmentSample, type LootItem, type Photo, type Preview } from "@/lib/loot";
import { SEGMENT_ERROR_TEXT, type PromptPoint, type SegmentErrorCode } from "@/lib/segment-types";
import { samBagged, samError, samGreeting, samRecordedMiss, samReply, yourRequest, type ChatMessage } from "@/lib/sam-voice";
import { MAX_LOOT, ROTATE_STEP_DEG, THIEF, WORLD } from "@/lib/stage";
import { STAGES, stageById } from "@/lib/stages";
import { SAMPLES, type SampleId } from "@/lib/samples";
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

const PROGRESS_KEY = "pixel-heist.unlocked";

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
  const [stageId, setStageId] = useState(1);
  const [unlocked, setUnlocked] = useState(1);
  const stage = stageById(stageId);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(PROGRESS_KEY));
      if (saved > 1) setUnlocked(Math.min(saved, STAGES.length));
    } catch {
      // storage unavailable: progress just isn't remembered
    }
  }, []);
  const [run, setRun] = useState<{ plan: RunPlan; startedAt: number } | null>(null);
  const [now, setNow] = useState(0);
  const [extractions, setExtractions] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const worldRef = useRef<HTMLCanvasElement>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [xray, setXray] = useState(false);
  const chatId = useRef(0);
  const say = useCallback((from: ChatMessage["from"], msg: string | Omit<ChatMessage, "id" | "from">) => {
    const body = typeof msg === "string" ? { text: msg } : msg;
    setChat((c) => [...c, { id: ++chatId.current, from, ...body }].slice(-12));
  }, []);

  const byId = useMemo(() => new Map(loot.map((l) => [l.id, l])), [loot]);

  // ---- photo + segmentation -------------------------------------------------------------
  const loadPhoto = useCallback(async (file: Blob, kind: Photo["kind"], sampleId?: SampleId) => {
    setPhotoError(null);
    setSeg({ kind: "IDLE" });
    try {
      const p = await normalizePhoto(file, kind, sampleId);
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

  const trySample = useCallback(
    async (id: SampleId) => {
      const blob = await (await fetch(`/sample/${SAMPLES[id].image}`)).blob();
      await loadPhoto(blob, "sample", id);
    },
    [loadPhoto],
  );

  const segment = useCallback(
    async (points: PromptPoint[]) => {
      if (!photo) return;
      const refining = points.length > 1;
      setSeg({ kind: "LOADING", points });
      say("you", yourRequest(points, refining));
      const res =
        inference === "LIVE_API" || !photo.sampleId ? await segmentLive(photo, points) : await segmentSample(photo.sampleId, points[0]);
      if (!res.ok) {
        setSeg({ kind: res.code === "NO_OBJECT" ? "EMPTY_RESULT" : "ERROR", code: res.code, message: res.message, points });
        say(
          "sam",
          inference === "PRECOMPUTED_SAMPLE" && res.code === "NO_OBJECT" && photo.sampleId
            ? samRecordedMiss(SAMPLES[photo.sampleId].fixtures.length)
            : samError(res.code, photo.kind === "sample"),
        );
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
    return snapPlacement(stage, raw);
  }, [drag, byId, stage]);

  const placedList = useMemo(
    () => Object.entries(placed).filter(([id]) => id !== drag?.id && byId.has(id)).map(([id, p]) => ({ id, placement: toPlacement(id, p) })),
    [placed, drag, byId, toPlacement],
  );

  const settled = useMemo(() => judge(stage, placedList.map((p) => p.placement)), [stage, placedList]);
  // X-ray: the same placements judged as box-only colliders (what you'd get without SAM's mask).
  const boxes = useMemo(
    () => (xray ? placedList.map(({ id, placement }) => boxPlacement(placement, byId.get(id)!.box)) : []),
    [xray, placedList, byId],
  );
  const boxJudged = useMemo(() => (xray ? judge(stage, boxes) : null), [xray, boxes, stage]);
  const live = useMemo(
    () => (candidate ? judge(stage, [...placedList.map((p) => p.placement), candidate]) : settled),
    [candidate, placedList, settled, stage],
  );
  const candidateProblem = candidate ? placementProblem(stage, candidate) : null;
  const missions = missionList(stage, settled);
  const liveDone = missionList(stage, live).filter((m) => m.done).length;
  const candidateStatus = !candidate
    ? null
    : candidateProblem
      ? "invalid"
      : liveDone > missions.filter((m) => m.done).length
        ? "useful"
        : "neutral";


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
      const next = snapPlacement(stage, { ...toPlacement(selected, p), rotationDeg: (p.rotationDeg + step + 360) % 360 });
      if (!placementProblem(stage, next)) setPlaced({ ...placed, [selected]: { x: next.x, y: next.y, rotationDeg: next.rotationDeg } });
    },
    [drag, selected, placed, toPlacement, editable, stage],
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
    const plan = planRun(stage, settled);
    setSelected(null);
    setGameState("RUNNING");
    setRun({ plan, startedAt: performance.now() });
  }, [settled, stage]);

  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      const done = t - run.startedAt >= runDurationMs(run.plan);
      if (done && gameState === "RUNNING") {
        setGameState(run.plan.outcome);
        if (run.plan.outcome === "WON") {
          setFinishedAt(Date.now());
          const next = Math.min(STAGES.length, stageId + 1);
          setUnlocked((u) => {
            const v = Math.max(u, next);
            try {
              localStorage.setItem(PROGRESS_KEY, String(v));
            } catch {
              // storage unavailable
            }
            return v;
          });
        }
      }
      if (!done || run.plan.outcome !== "WON") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, gameState, stageId]);

  const resetRun = useCallback(() => {
    setRun(null);
    setGameState(placedList.length ? "READY" : "SETUP");
  }, [placedList.length]);

  /** Loot carries over between stages; placements, runs and the clock start fresh. */
  const goToStage = useCallback((id: number) => {
    setStageId(id);
    setPlaced({});
    setRun(null);
    setSelected(null);
    setGameState("SETUP");
    setStartedAt(Date.now());
    setFinishedAt(null);
  }, []);

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
    const placements = placedList.map((p) => p.placement);
    if (!run) return { x: THIEF.startX, y: thiefY(stage, placements, THIEF.startX), pose: "idle", t: 0 };
    const elapsed = now - run.startedAt;
    const total = runDurationMs(run.plan);
    const x = THIEF.startX + Math.min(elapsed, total) * (RUN_SPEED_PX_PER_S / 1000);
    const over = Math.max(0, elapsed - total);
    const pose = elapsed < total ? "run" : run.plan.outcome === "CAUGHT" ? "caught" : run.plan.outcome === "FELL" ? "fell" : run.plan.outcome === "STUCK" ? "stuck" : "won";
    return { x, y: thiefY(stage, placements, x), pose, t: pose === "run" ? elapsed : over };
  }, [run, now, stage, placedList]);

  const scene: Scene = {
    placed: placedList.map(({ id, placement }) => ({ placement, sprite: byId.get(id)!.sprite })),
    candidate: candidate && candidateStatus ? { placement: candidate, sprite: byId.get(drag!.id)!.sprite, status: candidateStatus } : null,
    stage,
    live,
    settled,
    thief,
    xray: boxJudged ? { boxes, judged: boxJudged } : null,
  };

  const usedItems = placedList.map((p) => byId.get(p.id)!);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={onExit} aria-label="Back to title">
          <span className="logo">PIXEL HEIST</span>
        </button>
        <span className="tagline">Steal reality. Escape the sketch.</span>
        <label className="stage-chip">
          <span className="sr-only">Stage</span>
          <select value={stageId} onChange={(e) => goToStage(Number(e.target.value))} disabled={gameState === "RUNNING"}>
            {STAGES.map((st) => (
              <option key={st.id} value={st.id} disabled={st.id > unlocked}>
                Stage {st.id}: {st.name}
                {st.id > unlocked ? " 🔒" : ""}
              </option>
            ))}
          </select>
        </label>
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
          onTrySample={(id) => void trySample(id)}
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
            <button className="btn" onClick={() => rotate(-1)} aria-label="Rotate left" title="Rotate left (Shift+R)" disabled={!editable || (!drag && !(selected && placed[selected]))}>⟲</button>
            <button className="btn" onClick={() => rotate(1)} aria-label="Rotate right" title="Rotate right (R)" disabled={!editable || (!drag && !(selected && placed[selected]))}>⟳</button>
            <button className={`btn btn-xray${xray ? " on" : ""}`} onClick={() => setXray((v) => !v)} aria-pressed={xray} title="Judge the same placements as plain bounding boxes, as if there were no SAM mask">
              X-ray: mask vs box
            </button>
            <span className="kbd-hint">Rotate: R / Shift+R · Del removes</span>
            {gameState === "CAUGHT" || gameState === "FELL" || gameState === "STUCK" ? (
              <button className="btn btn-primary" onClick={resetRun}>Try again ↺</button>
            ) : (
              <button className="btn btn-primary btn-run" onClick={runHeist} disabled={!editable || placedList.length === 0}>
                RUN HEIST ▶
              </button>
            )}
          </div>
        </section>

        <MissionPanel
          stage={stage}
          missions={missions}
          vaultReached={gameState === "WON"}
          settled={settled}
          boxJudged={boxJudged}
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
          stageName={stage.name}
          nextStage={STAGES.find((st) => st.id === stageId + 1) ?? null}
          onNext={() => goToStage(stageId + 1)}
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
