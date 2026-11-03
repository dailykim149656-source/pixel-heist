import { bridgeSurfaceY, type Judgement } from "./judge";
import type { Placement } from "./geometry";
import { THIEF } from "./stage";
import type { Stage } from "./stages";

/**
 * RUN HEIST as a deterministic script (PRD §3.4 "이동"): no physics. The thief walks right and
 * the first unmet obstacle on the way decides where they stop and why.
 */
export type GameState = "SETUP" | "READY" | "RUNNING" | "CAUGHT" | "FELL" | "STUCK" | "WON";
export type Outcome = "CAUGHT" | "FELL" | "STUCK" | "WON";
export type RunPlan = { outcome: Outcome; stopX: number; reason: string | null };

export function planRun(stage: Stage, j: Judgement): RunPlan {
  const events: { x: number; fail: RunPlan | null }[] = [];
  stage.cameras.forEach((c, i) => {
    const r = j.cameras[i];
    events.push({
      x: c.fromX,
      fail: r.blocked ? null : { outcome: "CAUGHT", stopX: c.fromX, reason: `Spotted! ${r.blockedCount}/${c.rays} rays blocked, need ${c.need}` },
    });
  });
  stage.gaps.forEach((g, i) => {
    const r = j.gaps[i];
    events.push({ x: g.left + 10, fail: r.bridged ? null : { outcome: "FELL", stopX: g.left + 10, reason: r.reason ?? "The gap isn't bridged" } });
  });
  for (const d of stage.doors) {
    const opener = stage.plates.some((p) => p.opens === d.id) ? "weigh down the plate" : "hang something on the hook";
    events.push({ x: d.x - 26, fail: j.doors[d.id] ? null : { outcome: "STUCK", stopX: d.x - 26, reason: `The door is shut — ${opener} to open it` } });
  }
  events.sort((a, b) => a.x - b.x);
  for (const e of events) if (e.fail) return e.fail;
  return { outcome: "WON", stopX: stage.vaultX - 40, reason: null };
}

export const RUN_SPEED_PX_PER_S = 180;

export function runDurationMs(plan: RunPlan) {
  return ((plan.stopX - THIEF.startX) / RUN_SPEED_PX_PER_S) * 1000;
}

/** Height of the thief's feet at x: the floor, or whatever bridges a gap. */
export function thiefY(stage: Stage, placements: readonly Placement[], x: number) {
  for (const g of stage.gaps) if (x >= g.left && x < g.right) return bridgeSurfaceY(g, placements, x);
  return stage.floors.find((f) => x >= f.x0 && x <= f.x1)?.y ?? stage.floors[0].y;
}
