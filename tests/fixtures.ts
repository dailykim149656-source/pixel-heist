import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { boxShape, maskFromAlpha, normalizeShape, type Shape } from "@/lib/geometry";

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

export { ROTATIONS, placementsIn, first, cameraCandidates, gapPlacements, plateCandidates, hookCandidates } from "@/lib/solver";
