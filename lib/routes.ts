import { gapOpeners, type Judgement } from "./judge";
import type { Stage } from "./stages";

/**
 * Ways across a gap that has drawbridge controls. A stage can be won by any of them; the game
 * remembers which ones the player has found, so there is a reason to come back with other loot.
 */
export type Route = "bridge" | "plate" | "hook";

export const ROUTE_NAME: Record<Route, string> = { bridge: "Bar across", plate: "Weight on the plate", hook: "Hole on the hook" };

export function routesFor(stage: Stage): Route[] {
  const out = new Set<Route>();
  for (const g of stage.gaps) {
    const o = gapOpeners(stage, g.id);
    if (!o.plates.length && !o.hooks.length) continue;
    out.add("bridge");
    if (o.plates.length) out.add("plate");
    if (o.hooks.length) out.add("hook");
  }
  return [...out];
}

/** Which of the stage's ways across this judgement uses (several can be true at once). */
export function routesUsed(stage: Stage, j: Judgement): Route[] {
  const all = routesFor(stage);
  if (!all.length) return [];
  const used = new Set<Route>();
  stage.gaps.forEach((g, i) => j.gaps[i].bridged && used.add("bridge"));
  stage.plates.forEach((p, i) => j.plates[i].covered && stage.gaps.some((g) => g.id === p.opens) && used.add("plate"));
  stage.hooks.forEach((h, i) => j.hooks[i].hung && stage.gaps.some((g) => g.id === h.opens) && used.add("hook"));
  return all.filter((r) => used.has(r));
}

const KEY = "pixel-heist.routes";

export function loadRoutes(): Record<number, Route[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveRoutes(found: Record<number, Route[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    // storage unavailable: discoveries last for this visit only
  }
}
