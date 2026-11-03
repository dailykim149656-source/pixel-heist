import { gridToWorld, type Placement, type Shape } from "./geometry";
import { judge, judgeBeam, judgeCamera, judgeGap, judgeHook, judgePlate, placementProblem, snapPlacement } from "./judge";
import { planRun } from "./heist";
import { ROTATE_STEP_DEG } from "./stage";
import type { Camera, Gap, Hook, Plate, Stage } from "./stages";

/**
 * Placement search over the real mask geometry: where a given shape can do a given job. The tests
 * use it to prove every stage is solvable; the hint system uses it so hints are never guesses.
 */
export const ROTATIONS = Array.from({ length: 180 / ROTATE_STEP_DEG }, (_, i) => i * ROTATE_STEP_DEG);
const ALL_ROTATIONS = Array.from({ length: 360 / ROTATE_STEP_DEG }, (_, i) => i * ROTATE_STEP_DEG);

/** Placements on a grid over a region × every rotation step (the "solution space" of PRD FR-16). */
export function* placementsIn(shape: Shape, region: { x0: number; x1: number; y0: number; y1: number }, step = 10): Generator<Placement> {
  for (const rotationDeg of ROTATIONS)
    for (let y = region.y0; y <= region.y1; y += step)
      for (let x = region.x0; x <= region.x1; x += step) yield { shape, x, y, rotationDeg };
}

export function first(gen: Iterable<Placement>, ok: (p: Placement) => boolean = () => true): Placement | null {
  for (const p of gen) if (ok(p)) return p;
  return null;
}

/** Spots that block `cam` without touching any other device. */
export function* cameraCandidates(stage: Stage, cam: Camera, shape: Shape): Generator<Placement> {
  const region = { x0: Math.min(cam.fromX, cam.x) - 40, x1: cam.x + 60, y0: cam.y, y1: cam.targetY };
  for (const p of placementsIn(shape, region))
    if (!placementProblem(stage, p) && judgeCamera(cam, [p]).blocked && quietElsewhere(stage, p)) yield p;
}

/** What a player does at a gap: drop the item over it at every rotation and let it snap. */
export function* gapPlacements(stage: Stage, gap: Gap, shape: Shape, coarse = false): Generator<Placement> {
  // Coarse steps still land every drop: the snap re-centres over the gap and rests on the line.
  const dx = coarse ? 15 : 5, dy = coarse ? 30 : 20;
  for (const rotationDeg of ROTATIONS)
    for (let x = gap.left - 40; x <= gap.right + 40; x += dx)
      for (let y = Math.min(gap.yLeft, gap.yRight) - 120; y <= Math.max(gap.yLeft, gap.yRight) + 60; y += dy)
        yield snapPlacement(stage, { shape, x, y, rotationDeg });
}

export function* plateCandidates(stage: Stage, plate: Plate, shape: Shape): Generator<Placement> {
  for (const rotationDeg of ROTATIONS)
    for (let x = plate.x; x <= plate.x + plate.width; x += 5)
      for (let y = plate.y - 140; y <= plate.y - 10; y += 15) {
        const p = snapPlacement(stage, { shape, x, y, rotationDeg });
        if (!placementProblem(stage, p) && judgePlate(plate, [p]).covered) yield p;
      }
}

/** Hang each of the item's holes on the hook, at every rotation. */
export function* hookCandidates(stage: Stage, hook: Hook, shape: Shape): Generator<Placement> {
  for (const rotationDeg of ALL_ROTATIONS)
    for (const a of shape.holeAnchors) {
      const at = gridToWorld({ shape, x: 0, y: 0, rotationDeg }, a.x, a.y);
      const p = { shape, x: hook.x - at.x, y: hook.y - at.y, rotationDeg };
      if (!placementProblem(stage, p) && judgeHook(hook, [p]).hung && quietElsewhere(stage, p)) yield p;
    }
}

/** The item doesn't intrude on any gap's lasers (so solutions combine cleanly). */
function quietElsewhere(stage: Stage, p: Placement) {
  return stage.gaps.every((g) => judgeGap(g, [p]).thickness === 0);
}

// ---- Plans: which loot does which job -------------------------------------------------------

/** One thing the stage asks for, and the ways it can be done. */
export type Job =
  | { kind: "camera"; id: string }
  | { kind: "bridge"; id: string } // lay something across gap `id`
  | { kind: "plate"; id: string; opens: string } // weigh plate `id`, which opens a door or lowers a drawbridge
  | { kind: "hook"; id: string; opens: string };

/** A requirement is met by any one of its jobs (a gap: bridge, plate or hook; a door: its opener). */
export type Requirement = { id: string; label: string; jobs: Job[] };

export function requirements(stage: Stage): Requirement[] {
  const openers = (target: string): Job[] => [
    ...stage.plates.filter((p) => p.opens === target).map((p): Job => ({ kind: "plate", id: p.id, opens: target })),
    ...stage.hooks.filter((h) => h.opens === target).map((h): Job => ({ kind: "hook", id: h.id, opens: target })),
  ];
  return [
    ...stage.doors.map((d) => ({ id: d.id, label: "open the door", jobs: openers(d.id) })),
    ...stage.cameras.map((c) => ({ id: c.id, label: "block the camera", jobs: [{ kind: "camera", id: c.id } as Job] })),
    ...stage.gaps.map((g) => ({ id: g.id, label: "cross the gap", jobs: [{ kind: "bridge", id: g.id } as Job, ...openers(g.id)] })),
  ];
}

export type Item = { id: string; shape: Shape };
export type Step = { item: string; job: Job; placement: Placement };

/** First placement where `shape` does `job` without upsetting another device; null if none in budget. */
export function placementFor(stage: Stage, job: Job, shape: Shape, deadline = Infinity): Placement | null {
  if (!couldDo(stage, job, shape)) return null;
  const clearOfBeams = (p: Placement) => stage.beams.every((b) => !judgeBeam(b, [p]).tripped);
  const gen: Iterable<Placement> =
    job.kind === "camera"
      ? cameraCandidates(stage, stage.cameras.find((c) => c.id === job.id)!, shape)
      : job.kind === "bridge"
        ? gapPlacements(stage, stage.gaps.find((g) => g.id === job.id)!, shape, true)
        : job.kind === "plate"
          ? plateCandidates(stage, stage.plates.find((p) => p.id === job.id)!, shape)
          : hookCandidates(stage, stage.hooks.find((h) => h.id === job.id)!, shape);
  const ok = (p: Placement) => {
    if (placementProblem(stage, p) || !clearOfBeams(p)) return false;
    if (job.kind === "bridge") return judgeGap(stage.gaps.find((g) => g.id === job.id)!, [p]).bridged;
    return true;
  };
  let n = 0;
  for (const p of gen) {
    if (ok(p)) return p;
    if (++n % 64 === 0 && performance.now() > deadline) return null;
  }
  return null;
}

/**
 * Cheap necessary conditions from the shape's measurements, so the full search only runs where it
 * might succeed (a mug is never a bridge; a bar never weighs a plate; no hole, no hook).
 */
function couldDo(stage: Stage, job: Job, shape: Shape) {
  const m = shape.metrics;
  if (job.kind === "hook") return shape.holeAnchors.length > 0;
  if (job.kind === "plate") return m.thicknessPx >= 24;
  if (job.kind === "bridge") {
    const g = stage.gaps.find((x) => x.id === job.id)!;
    return m.thicknessPx <= g.slotAbove + g.slotBelow && m.longestUnbrokenSpanPx >= g.right - g.left + 2 * g.support - 8;
  }
  return true;
}

export type PlanResult = {
  /** A full plan the judge accepts and the thief survives, if the loot allows one. */
  plan: Step[] | null;
  /** For each item, the jobs it can do on its own (by real mask geometry). */
  can: Record<string, Job[]>;
  /** Requirements nothing in the loot can meet. */
  missing: Requirement[];
};

/**
 * Search for a winning plan with this loot: work out which item can do which job, then assign
 * distinct items to every requirement and check the whole plan with the judge and the run.
 */
export function findPlan(stage: Stage, items: Item[], budgetMs = 4000): PlanResult {
  const deadline = performance.now() + budgetMs;
  const reqs = requirements(stage);
  const spot = new Map<string, Placement | null>();
  const key = (item: string, j: Job) => `${item}|${j.kind}|${j.id}`;
  const can: Record<string, Job[]> = {};
  for (const it of items) {
    can[it.id] = [];
    for (const r of reqs)
      for (const j of r.jobs) {
        const p = placementFor(stage, j, it.shape, deadline);
        spot.set(key(it.id, j), p);
        if (p) can[it.id].push(j);
      }
  }
  const missing = reqs.filter((r) => !items.some((it) => r.jobs.some((j) => spot.get(key(it.id, j)))));
  if (missing.length) return { plan: null, can, missing };

  const steps: Step[] = [];
  const used = new Set<string>();
  const search = (i: number): boolean => {
    if (performance.now() > deadline) return false;
    if (i === reqs.length) {
      const j = judge(stage, steps.map((s) => s.placement));
      return planRun(stage, j).outcome === "WON";
    }
    for (const job of reqs[i].jobs)
      for (const it of items) {
        const p = !used.has(it.id) && spot.get(key(it.id, job));
        if (!p) continue;
        used.add(it.id);
        steps.push({ item: it.id, job, placement: p });
        if (search(i + 1)) return true;
        steps.pop();
        used.delete(it.id);
      }
    return false;
  };
  return { plan: search(0) ? [...steps] : null, can, missing };
}
