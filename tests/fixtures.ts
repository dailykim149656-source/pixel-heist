import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { boxShape, gridToWorld, maskFromAlpha, normalizeShape, type Placement, type Shape } from "@/lib/geometry";
import { judgeCamera, judgeGap, judgeHook, judgePlate, placementProblem, snapPlacement } from "@/lib/judge";
import { ROTATE_STEP_DEG } from "@/lib/stage";
import type { Camera, Gap, Hook, Plate, Stage } from "@/lib/stages";

function loadFixtureMask(name: string) {
  const png = PNG.sync.read(readFileSync(path.join("fixtures/sam", name, "mask.png")));
  return maskFromAlpha(png.width, png.height, png.data, 4);
}

export function loadFixtureShape(name: string): Shape {
  return normalizeShape(loadFixtureMask(name));
}

/** The cut-out plus the bounding box a box-only detector would give for the same pixels (X-ray). */
export function loadFixtureWithBox(name: string): { shape: Shape; box: Shape } {
  const mask = loadFixtureMask(name);
  const shape = normalizeShape(mask);
  return { shape, box: boxShape(mask, shape.toSource.scale) };
}

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
export function* gapPlacements(stage: Stage, gap: Gap, shape: Shape): Generator<Placement> {
  for (const rotationDeg of ROTATIONS)
    for (let x = gap.left - 40; x <= gap.right + 40; x += 5)
      for (let y = Math.min(gap.yLeft, gap.yRight) - 120; y <= Math.max(gap.yLeft, gap.yRight) + 60; y += 20)
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
