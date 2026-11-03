import { crossable, type Judgement } from "./judge";
import type { Shape } from "./geometry";
import type { Job, Requirement } from "./solver";
import type { Stage } from "./stages";

/**
 * Hints grounded in the engine. The facts below come from the judge (what's done) and the plan
 * search over the player's real cut-outs (what would work). Muse only words them; the game's own
 * fallback text says the same thing plainly.
 */
export type HintLevel = 1 | 2 | 3;
export const LEVEL_NAME: Record<HintLevel, string> = { 1: "Nudge", 2: "Clue", 3: "Solution" };

export type PlanStep = { item: string; job: Job; x: number; y: number; rotationDeg: number };
export type PlanFacts = { plan: PlanStep[] | null; can: Record<string, Job[]>; missing: Requirement[] };

export type HintFacts = {
  stage: string;
  level: HintLevel;
  done: string[];
  todo: string[];
  items: { ref: string; shape: string; canDo: string[] }[];
  /** What to do next, at the requested level of detail. Empty when everything is set. */
  next: string[];
  /** Jobs no cut-out in the bag can do, with the shape that would. */
  needs: string[];
};

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th"];
const ref = (i: number) => `the ${ORDINAL[i]} cut-out in your bag`;

export function describeShape(s: Shape) {
  const m = s.metrics;
  const form = m.aspect >= 4 ? "long and thin" : m.solidity >= 0.85 ? "solid and chunky" : "chunky";
  const holes = s.holeAnchors.length ? `, with ${s.holeAnchors.length === 1 ? "a hole" : `${s.holeAnchors.length} holes`}` : "";
  return `${form}${holes} (${m.lengthPx}×${m.thicknessPx}px)`;
}

export function jobText(stage: Stage, j: Job) {
  const target = (id: string) => (stage.gaps.some((g) => g.id === id) ? "lower the drawbridge" : "open the door");
  switch (j.kind) {
    case "camera":
      return stage.cameras.length > 1 ? `block camera ${stage.cameras.findIndex((c) => c.id === j.id) + 1}` : "block the camera";
    case "bridge":
      return "lie across the gap as a bridge";
    case "plate":
      return `weigh down the plate to ${target(j.opens)}`;
    case "hook":
      return `hang on the hook by its hole to ${target(j.opens)}`;
  }
}

export const NEEDS: Record<Job["kind"], string> = {
  camera: "something big enough to cover the red rays",
  bridge: "something long and thin (a bar, a pen, a ruler)",
  plate: "something solid and heavy-looking",
  hook: "something with a real hole in it (a handle, a loop)",
};

function where(stage: Stage, s: PlanStep) {
  const turn = s.rotationDeg ? `, turned ${s.rotationDeg > 180 ? `${360 - s.rotationDeg}° left` : `${s.rotationDeg}° right`}` : "";
  if (s.job.kind === "camera") {
    const c = stage.cameras.find((x) => x.id === s.job.id)!;
    return `${s.x < c.x ? "just left of" : "right under"} the camera, across its red rays${turn}`;
  }
  if (s.job.kind === "bridge") return `over the gap — it snaps onto the ledges${turn}`;
  if (s.job.kind === "plate") return `on the plate — let it rest flat${turn}`;
  return `with its hole right on the hook — it snaps on${turn}`;
}

export function hintFacts(
  stage: Stage,
  j: Judgement,
  loot: { id: string; shape: Shape }[],
  facts: PlanFacts,
  level: HintLevel,
): HintFacts {
  const done: string[] = [], todo: string[] = [];
  stage.cameras.forEach((c, i) => (j.cameras[i].blocked ? done : todo).push(jobText(stage, { kind: "camera", id: c.id })));
  stage.doors.forEach((d) => (j.doors[d.id] ? done : todo).push("open the door"));
  stage.gaps.forEach((g, i) => (crossable(j.gaps[i]) ? done : todo).push("cross the gap"));
  stage.beams.forEach((b, i) => j.beams[i].tripped && todo.push("get your loot off the sensor beam"));

  const idx = new Map(loot.map((l, i) => [l.id, i]));
  const items = loot.map((l, i) => ({ ref: ref(i), shape: describeShape(l.shape), canDo: (facts.can[l.id] ?? []).map((x) => jobText(stage, x)) }));
  const needs = facts.missing.map((r) => `${r.label}: needs ${r.jobs.map((x) => NEEDS[x.kind]).join(", or ")}`);

  // Only the steps for what isn't done yet.
  const open = (facts.plan ?? []).filter((s) => {
    if (s.job.kind === "camera") return !j.cameras[stage.cameras.findIndex((c) => c.id === s.job.id)].blocked;
    if (s.job.kind === "bridge") return !crossable(j.gaps[stage.gaps.findIndex((g) => g.id === s.job.id)]);
    const target = s.job.opens;
    const gi = stage.gaps.findIndex((g) => g.id === target);
    return gi >= 0 ? !crossable(j.gaps[gi]) : !j.doors[target];
  });
  const next = open.map((s) => {
    const who = ref(idx.get(s.item) ?? 0);
    if (level === 1) return `${todo[0] ?? jobText(stage, s.job)} — something in your bag can do it`;
    if (level === 2) return `${who} can ${jobText(stage, s.job)}`;
    return `${who}: ${jobText(stage, s.job)}, placed ${where(stage, s)}`;
  });
  return { stage: stage.name, level, done, todo, items, next: level === 1 ? next.slice(0, 1) : next, needs };
}

/** The game's own wording of the same facts, shown at once and whenever Muse can't answer. */
export function plainHint(f: HintFacts): string {
  if (!f.todo.length) return "Everything's set. Run the heist!";
  if (f.needs.length) return `Nothing in your bag fits yet. ${f.needs[0]}. Steal one from a photo.`;
  if (!f.next.length) return "Your bag has what you need, but the pieces get in each other's way. Try moving things apart.";
  return f.next.map((s) => s[0].toUpperCase() + s.slice(1)).join(". ") + ".";
}
