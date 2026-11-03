import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { boxShape, maskFromAlpha, normalizeShape, type Placement, type Shape } from "@/lib/geometry";
import { snapToLedges } from "@/lib/judge";
import { GAP, FLOOR_Y, ROTATE_STEP_DEG, WORLD } from "@/lib/stage";

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

/** Every placement on a coarse grid × every rotation step (the "solution space" of PRD FR-16). */
export function* allPlacements(shape: Shape, step = 10): Generator<Placement> {
  for (const rotationDeg of ROTATIONS)
    for (let y = 0; y <= WORLD.height; y += step)
      for (let x = 0; x <= WORLD.width; x += step) yield { shape, x, y, rotationDeg };
}

/** Placements a player would try at the gap: centered over it, every rotation, snapped to the ledges. */
export function* gapPlacements(shape: Shape): Generator<Placement> {
  for (const rotationDeg of ROTATIONS)
    for (let x = GAP.left - 40; x <= GAP.right + 40; x += 5)
      for (let y = FLOOR_Y - 120; y <= FLOOR_Y + 60; y += 20) yield snapToLedges({ shape, x, y, rotationDeg });
}
