import { describe, expect, it } from "vitest";
import { planRun } from "@/lib/heist";
import { judge, judgeGap, judgePlate, placementProblem } from "@/lib/judge";
import { stageById } from "@/lib/stages";
import type { Placement } from "@/lib/geometry";
import { cameraCandidates, first, gapPlacements, hookCandidates, loadFixtureShape, plateCandidates } from "./fixtures";

/**
 * Every stage is solvable with real SAM cuts from the sample desks, and the wrong shapes fail.
 * Names below are for readers only; the judge never sees them.
 */
const A = { mug: loadFixtureShape("mug"), ruler: loadFixtureShape("ruler") };
const B = {
  pen: loadFixtureShape("d2-pen"),
  calculator: loadFixtureShape("d2-calculator"),
  sticky: loadFixtureShape("d2-sticky"),
  scissors: loadFixtureShape("d2-scissors"),
};

const bridges = (stageId: number) => (p: Placement) => !placementProblem(stageById(stageId), p) && judge(stageById(stageId), [p]).gaps[0].bridged;
const win = (stageId: number, placements: Placement[]) => planRun(stageById(stageId), judge(stageById(stageId), placements));

describe("fixture shapes", () => {
  it("straightens the diagonal ruler into a thin bar and leaves the mug upright", () => {
    expect(A.ruler.metrics.thicknessPx).toBeLessThan(30);
    expect(A.mug.deskewDeg).toBe(0);
  });

  it("finds real holes: the mug handle and the scissor loops; none in solid things", () => {
    expect(A.mug.holeAnchors.length).toBe(1);
    expect(B.scissors.holeAnchors.length).toBeGreaterThanOrEqual(2);
    for (const s of [A.ruler, B.pen, B.calculator, B.sticky]) expect(s.holeAnchors).toHaveLength(0);
  });
});

describe("Stage 1 — The Lobby (camera)", () => {
  const s = stageById(1);
  it("an empty hall gets you caught", () => expect(win(1, []).outcome).toBe("CAUGHT"));
  it("any big object on the rays wins", () => {
    for (const shape of [A.mug, B.calculator, B.sticky]) {
      const cam = first(cameraCandidates(s, s.cameras[0], shape));
      expect(cam).not.toBeNull();
      expect(win(1, [cam!]).outcome).toBe("WON");
    }
  });
});

describe("Stage 2 — The Broken Corridor (gap)", () => {
  const s = stageById(2);
  it("the ruler or the pen bridges it", () => {
    for (const shape of [A.ruler, B.pen]) {
      const p = first(gapPlacements(s, s.gaps[0], shape), bridges(2));
      expect(p).not.toBeNull();
      expect(win(2, [p!]).outcome).toBe("WON");
    }
  });
  it("thick or hollow things never bridge, and the reason is the lasers when they're long enough", () => {
    for (const shape of [A.mug, B.calculator, B.sticky, B.scissors])
      for (const p of gapPlacements(s, s.gaps[0], shape)) expect(judgeGap(s.gaps[0], [p]).bridged).toBe(false);
    const longMug = first(gapPlacements(s, s.gaps[0], A.mug), (p) => judgeGap(s.gaps[0], [p]).span >= judgeGap(s.gaps[0], [p]).spanNeeded);
    expect(longMug).not.toBeNull();
    expect(judgeGap(s.gaps[0], [longMug!]).reason).toMatch(/Too thick/);
  });
});

describe("Stage 3 — The Gallery (camera + gap)", () => {
  const s = stageById(3);
  it("desk A: mug on the camera, ruler over the gap", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.mug))!;
    const bridge = first(gapPlacements(s, s.gaps[0], A.ruler), bridges(3))!;
    expect(win(3, [])).toMatchObject({ outcome: "CAUGHT" });
    expect(win(3, [cam]).outcome).toBe("FELL");
    expect(win(3, [cam, bridge]).outcome).toBe("WON");
  });
  it("desk B: calculator on the camera, pen over the gap", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], B.calculator))!;
    const bridge = first(gapPlacements(s, s.gaps[0], B.pen), bridges(3))!;
    expect(win(3, [cam, bridge]).outcome).toBe("WON");
  });
  it("swapping roles fails: with the ruler on the camera, the mug can't bridge", () => {
    expect(first(cameraCandidates(s, s.cameras[0], A.ruler))).not.toBeNull();
    for (const p of gapPlacements(s, s.gaps[0], A.mug)) expect(judgeGap(s.gaps[0], [p]).bridged).toBe(false);
  });
});

describe("Stage 4 — The Weigh Station (plate + camera)", () => {
  const s = stageById(4);
  const plate = s.plates[0];
  it("chunky solid shapes hold the plate down; thin bars and the scissors' loops don't", () => {
    for (const shape of [B.sticky, B.calculator, A.mug]) expect(first(plateCandidates(s, plate, shape))).not.toBeNull();
    expect(first(plateCandidates(s, plate, B.scissors))).toBeNull();
    for (const shape of [A.ruler, B.pen]) expect(first(plateCandidates(s, plate, shape))).toBeNull();
  });
  it("without the plate the door stays shut", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], B.calculator))!;
    expect(win(4, [cam])).toMatchObject({ outcome: "STUCK" });
  });
  it("desk B: sticky note on the plate, calculator on the camera", () => {
    const pl = first(plateCandidates(s, plate, B.sticky))!;
    const cam = first(cameraCandidates(s, s.cameras[0], B.calculator), (p) => !judgePlate(plate, [p]).coverage)!;
    expect(win(4, [pl, cam]).outcome).toBe("WON");
  });
  it("desk A: mug on the plate, ruler on the camera", () => {
    const pl = first(plateCandidates(s, plate, A.mug))!;
    const cam = first(cameraCandidates(s, s.cameras[0], A.ruler), (p) => !judgePlate(plate, [p]).coverage)!;
    expect(cam).not.toBeNull();
    expect(win(4, [pl, cam]).outcome).toBe("WON");
  });
});

describe("Stage 5 — The Hook Hall (hook + gap)", () => {
  const s = stageById(5);
  const hook = s.hooks[0];
  it("only shapes with a real hole can hang", () => {
    expect(first(hookCandidates(s, hook, A.mug))).not.toBeNull();
    expect(first(hookCandidates(s, hook, B.scissors))).not.toBeNull();
    for (const shape of [A.ruler, B.pen, B.calculator, B.sticky]) expect(first(hookCandidates(s, hook, shape))).toBeNull();
  });
  it("desk A: mug on the hook, ruler over the gap", () => {
    const hung = first(hookCandidates(s, hook, A.mug))!;
    const bridge = first(gapPlacements(s, s.gaps[0], A.ruler), bridges(5))!;
    expect(win(5, [bridge]).outcome).toBe("STUCK");
    expect(win(5, [hung, bridge]).outcome).toBe("WON");
  });
  it("desk B: scissors on the hook, pen over the gap — the decoy finally earns its keep", () => {
    const hung = first(hookCandidates(s, hook, B.scissors))!;
    const bridge = first(gapPlacements(s, s.gaps[0], B.pen), bridges(5))!;
    expect(win(5, [hung, bridge]).outcome).toBe("WON");
  });
});
