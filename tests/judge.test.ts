import { describe, expect, it } from "vitest";
import { judge, judgeCamera, judgeGap, placementProblem, snapToLedges } from "@/lib/judge";
import { planRun } from "@/lib/heist";
import type { Placement } from "@/lib/geometry";
import { allPlacements, gapPlacements, loadFixtureShape } from "./fixtures";

const mug = loadFixtureShape("mug");
const ruler = loadFixtureShape("ruler");

function firstWhere(gen: Iterable<Placement>, ok: (p: Placement) => boolean) {
  for (const p of gen) if (ok(p)) return p;
  return null;
}

const cameraOnly = (p: Placement) =>
  !placementProblem(p) && judgeCamera([p]).blocked && judgeGap([p]).overGap === null;

describe("fixture shapes (PRD §3.3)", () => {
  it("deskews the diagonal ruler into a thin horizontal bar", () => {
    expect(Math.abs(ruler.deskewDeg)).toBeGreaterThan(30);
    expect(ruler.metrics.lengthPx).toBe(180);
    expect(ruler.metrics.thicknessPx).toBeLessThan(30);
  });

  it("leaves the near-square mug upright", () => {
    expect(mug.deskewDeg).toBe(0);
    expect(mug.metrics.thicknessPx).toBeGreaterThan(170);
  });
});

describe("gap (T07, T08, T15)", () => {
  it("ruler laid flat over the gap bridges it (T07)", () => {
    const p = firstWhere(gapPlacements(ruler), (q) => !placementProblem(q) && judgeGap([q]).bridged);
    expect(p).not.toBeNull();
    expect(p!.rotationDeg % 180).toBe(0);
  });

  it("mug never bridges the gap at any rotation, and the reason is the laser (T15)", () => {
    for (const p of gapPlacements(mug)) {
      const g = judgeGap([p]);
      expect(g.bridged).toBe(false);
    }
    // Some rotation makes the mug long enough on the walk line — the laser is what stops it.
    const longEnough = firstWhere(gapPlacements(mug), (q) => {
      const g = judgeGap([q]);
      return g.span >= g.spanNeeded;
    });
    expect(longEnough).not.toBeNull();
    const g = judgeGap([longEnough!]);
    expect(g.tripsLaser).toBe(true);
    expect(g.reason).toMatch(/Too thick/);
  });

  it("ruler too far to one side doesn't span both ledges", () => {
    const g = judgeGap([snapToLedges({ shape: ruler, x: 400, y: 420, rotationDeg: 0 })]);
    expect(g.bridged).toBe(false);
    expect(g.reason).toMatch(/span/);
  });
});

describe("camera (T05, T06, T16)", () => {
  it("mug can block the camera without touching the gap lasers (T05)", () => {
    expect(firstWhere(allPlacements(mug), cameraOnly)).not.toBeNull();
  });

  it("ruler can block the camera too — length, not name (T16)", () => {
    expect(firstWhere(allPlacements(ruler), cameraOnly)).not.toBeNull();
  });

  it("an item off to the side blocks nothing (T06)", () => {
    expect(judgeCamera([{ shape: mug, x: 860, y: 120, rotationDeg: 0 }]).blockedCount).toBe(0);
  });

  it("refuses drops right next to the camera (T17)", () => {
    expect(placementProblem({ shape: mug, x: 620, y: 120, rotationDeg: 0 })).toMatch(/camera/);
  });
});

describe("heist (T09, T10)", () => {
  it("is caught when the camera is unguarded", () => {
    expect(planRun(judge([])).outcome).toBe("CAUGHT");
  });

  it("falls when only the camera is handled", () => {
    const cam = firstWhere(allPlacements(mug), cameraOnly)!;
    const plan = planRun(judge([cam]));
    expect(plan.outcome).toBe("FELL");
  });

  it("escapes with mug on the camera and ruler on the gap", () => {
    const cam = firstWhere(allPlacements(mug), cameraOnly)!;
    const bridge = firstWhere(gapPlacements(ruler), (q) => !placementProblem(q) && judgeGap([q]).bridged)!;
    expect(planRun(judge([cam, bridge])).outcome).toBe("WON");
  });

  it("swapping roles fails: ruler on the camera leaves only the mug for the gap", () => {
    const cam = firstWhere(allPlacements(ruler), cameraOnly)!;
    for (const p of gapPlacements(mug)) expect(judge([cam, p]).gap.bridged).toBe(false);
  });
});
