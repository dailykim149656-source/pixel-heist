/// <reference lib="webworker" />
import { findPlan, type Item } from "./solver";
import { stageById, type Stage } from "./stages";

/** Runs the plan search off the main thread so the sketch keeps animating while hints are worked out. */
self.onmessage = (e: MessageEvent<{ stage?: Stage; stageId?: number; items: Item[]; budgetMs: number }>) => {
  const { stage, stageId, items, budgetMs } = e.data;
  const r = findPlan(stage ?? stageById(stageId!), items, budgetMs);
  // Shapes stay on the main thread; send back where things go, not the grids.
  const plan = r.plan?.map((s) => ({ item: s.item, job: s.job, x: s.placement.x, y: s.placement.y, rotationDeg: s.placement.rotationDeg })) ?? null;
  self.postMessage({ plan, can: r.can, missing: r.missing });
};
