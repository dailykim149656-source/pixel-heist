import type { Judgement } from "./judge";
import { CAMERA, GAP, THIEF, VAULT } from "./stage";

/**
 * RUN HEIST as a deterministic script (PRD §3.4 "이동"): no physics, the judgement decides
 * where the thief stops and why.
 */
export type GameState = "SETUP" | "READY" | "RUNNING" | "CAUGHT" | "FELL" | "WON";

export type RunPlan =
  | { outcome: "CAUGHT"; stopX: number; reason: string }
  | { outcome: "FELL"; stopX: number; reason: string }
  | { outcome: "WON"; stopX: number; reason: null };

export function planRun(j: Judgement): RunPlan {
  if (!j.camera.blocked) {
    return {
      outcome: "CAUGHT",
      stopX: CAMERA.targetFromX,
      reason: `Spotted! Rays still reach the path (${j.camera.blockedCount}/${CAMERA.rayCount} blocked, need ${CAMERA.blockedNeeded})`,
    };
  }
  if (!j.gap.bridged) {
    return { outcome: "FELL", stopX: GAP.left + 10, reason: j.gap.reason ?? "The gap isn't bridged" };
  }
  return { outcome: "WON", stopX: VAULT.x - 40, reason: null };
}

export const RUN_SPEED_PX_PER_S = 180;

export function runDurationMs(plan: RunPlan) {
  return ((plan.stopX - THIEF.startX) / RUN_SPEED_PX_PER_S) * 1000;
}
