import { describe, expect, it } from "vitest";
import { boxPlacement, occupiedAt, occupiedBounds } from "@/lib/geometry";
import { judgeGap, placementProblem } from "@/lib/judge";
import { gapPlacements, loadFixtureWithBox } from "./fixtures";

const ruler = loadFixtureWithBox("ruler");
const mug = loadFixtureWithBox("mug");

describe("X-ray: SAM mask vs bounding box (the claim shown on screen)", () => {
  it("the diagonal ruler's box is a fat slab; its mask is a thin bar", () => {
    expect(ruler.box.metrics.thicknessPx).toBeGreaterThan(100);
    expect(ruler.shape.metrics.thicknessPx).toBeLessThan(30);
  });

  it("the box encloses every pixel of the placed cut-out", () => {
    for (const { shape, box } of [ruler, mug])
      for (const rotationDeg of [0, 30, 90]) {
        const p = { shape, x: 480, y: 270, rotationDeg };
        const b = boxPlacement(p, box);
        const o = occupiedBounds(p);
        for (let y = Math.ceil(o.top); y < o.bottom; y += 3)
          for (let x = Math.ceil(o.left); x < o.right; x += 3)
            if (occupiedAt(p, x + 0.5, y + 0.5)) expect(occupiedAt(b, x + 0.5, y + 0.5)).toBe(true);
      }
  });

  it("where the SAM-masked ruler bridges the gap, its box trips the lasers", () => {
    const bridging = [...gapPlacements(ruler.shape)].filter((p) => !placementProblem(p) && judgeGap([p]).bridged);
    expect(bridging.length).toBeGreaterThan(0);
    for (const p of bridging) {
      const g = judgeGap([boxPlacement(p, ruler.box)]);
      expect(g.bridged).toBe(false);
      expect(g.tripsLaser).toBe(true);
    }
  });

  it("with bounding boxes the gap can never be bridged — the level is unsolvable", () => {
    for (const { box } of [ruler, mug]) for (const p of gapPlacements(box)) expect(judgeGap([p]).bridged).toBe(false);
  });
});
