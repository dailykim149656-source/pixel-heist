"use client";

import { useEffect, useRef } from "react";
import { drawScene } from "@/lib/draw";
import { judge } from "@/lib/judge";
import { thiefY } from "@/lib/heist";
import type { Route } from "@/lib/routes";
import { routesFor } from "@/lib/routes";
import { THIEF, WORLD } from "@/lib/stage";
import { STAGES, type Stage } from "@/lib/stages";

type Props = {
  unlocked: number;
  current: number | null;
  routes: Record<number, Route[]>;
  lootCount: number;
  onPick: (id: number) => void;
  onCurator: () => void;
  onClose: (() => void) | null;
};

/** The museum map: every stage as a little sketch, locked until the one before is cleared. */
export function StageSelect({ unlocked, current, routes, lootCount, onPick, onCurator, onClose }: Props) {
  return (
    <div className="stage-select" role="dialog" aria-label="Choose a stage">
      <div className="stage-select-head">
        <h2 className="section-title">The Sketch Museum</h2>
        <span className="muted">Clear a room to open the next. Loot you steal comes with you.</span>
        {onClose && (
          <button className="btn btn-small stage-select-close" onClick={onClose}>
            Back to the heist ✕
          </button>
        )}
      </div>
      <ol className="stage-grid">
        {STAGES.map((st) => {
          const locked = st.id > unlocked;
          const cleared = st.id < unlocked;
          const ways = routesFor(st);
          return (
            <li key={st.id}>
              <button
                className={`stage-card${locked ? " locked" : ""}${cleared ? " cleared" : ""}${current === st.id ? " current" : ""}`}
                onClick={() => onPick(st.id)}
                disabled={locked}
                aria-label={`Stage ${st.id}: ${st.name}${locked ? " (locked)" : cleared ? " (cleared)" : ""}`}
              >
                <Thumb stage={st} />
                <span className="stage-card-title">
                  <b>{st.id}.</b> {st.name}
                </span>
                <span className="stage-card-status">
                  {locked ? "🔒 Locked" : cleared ? "✓ Cleared" : "New"}
                  {ways.length > 0 && !locked && ` · ways ${(routes[st.id] ?? []).length}/${ways.length}`}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button className="stage-card curator" onClick={onCurator} disabled={lootCount === 0}>
            <span className="curator-card-art" aria-hidden>
              ♜
            </span>
            <span className="stage-card-title">
              <b>✦</b> Curator&apos;s Challenge
            </span>
            <span className="stage-card-status">
              {lootCount ? "Muse designs a room for your loot" : "Steal something first"}
            </span>
          </button>
        </li>
      </ol>
    </div>
  );
}

function Thumb({ stage }: { stage: Stage }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = 480;
    c.height = (480 * WORLD.height) / WORLD.width;
    const j = judge(stage, []);
    drawScene(c, {
      stage, placed: [], candidate: null, live: j, settled: j, xray: null,
      thief: { x: THIEF.startX, y: thiefY(stage, [], THIEF.startX), pose: "idle", t: 0 },
    });
  }, [stage]);
  return <canvas ref={ref} className="stage-thumb" aria-hidden />;
}
