import { describe, expect, it } from "vitest";
import { planRun } from "@/lib/heist";
import { judge, judgeBeam, judgeGap, judgePlate, placementProblem, snapPlacement } from "@/lib/judge";
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

describe("Stage 3 — The Gallery (camera + gap, three ways across)", () => {
  const s = stageById(3);
  const plate = s.plates[0], hook = s.hooks[0];
  const across = (p: Placement[]) => judge(s, p).gaps[0];
  it("an empty gallery: caught first; with the camera blocked, you fall", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.mug))!;
    expect(win(3, []).outcome).toBe("CAUGHT");
    expect(win(3, [cam]).outcome).toBe("FELL");
  });
  it("way 1 — a thin bar over the gap: mug on the camera, ruler across", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.mug))!;
    const bridge = first(gapPlacements(s, s.gaps[0], A.ruler), bridges(3))!;
    expect(across([bridge])).toMatchObject({ bridged: true, lowered: false });
    expect(win(3, [cam, bridge]).outcome).toBe("WON");
  });
  it("way 2 — something heavy on the far plate lowers the drawbridge: ruler on the camera, mug on the plate", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.ruler))!;
    const weight = first(plateCandidates(s, plate, A.mug))!;
    expect(across([weight])).toMatchObject({ bridged: false, lowered: true });
    expect(win(3, [cam, weight]).outcome).toBe("WON");
  });
  it("way 3 — something with a hole on the hook lowers it too: ruler on the camera, mug by its handle", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.ruler))!;
    const hung = first(hookCandidates(s, hook, A.mug))!;
    expect(across([hung])).toMatchObject({ bridged: false, lowered: true });
    expect(win(3, [cam, hung]).outcome).toBe("WON");
  });
  it("each way still asks for the right shape", () => {
    for (const shape of [A.ruler, B.pen]) expect(first(plateCandidates(s, plate, shape))).toBeNull(); // too thin to weigh
    for (const shape of [A.ruler, B.pen, B.calculator, B.sticky]) expect(first(hookCandidates(s, hook, shape))).toBeNull(); // no hole
    for (const p of gapPlacements(s, s.gaps[0], A.mug)) expect(judgeGap(s.gaps[0], [p]).bridged).toBe(false); // too thick
  });
  it("desk B finds all three as well", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], B.calculator))!;
    expect(win(3, [cam, first(gapPlacements(s, s.gaps[0], B.pen), bridges(3))!]).outcome).toBe("WON");
    expect(win(3, [cam, first(plateCandidates(s, plate, B.sticky))!]).outcome).toBe("WON");
    expect(win(3, [cam, first(hookCandidates(s, hook, B.scissors))!]).outcome).toBe("WON");
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

/** Camera spots that also keep every sensor beam clear. */
const clearOfBeams = (stageId: number) => (p: Placement) => stageById(stageId).beams.every((b) => !judgeBeam(b, [p]).tripped);

describe("Stage 6 — The Split Level (sloped gap)", () => {
  const s = stageById(6);
  it("a flat bar can't climb: every unrotated bridge fails, a turned one works", () => {
    for (const shape of [A.ruler, B.pen]) {
      expect(first(gapPlacements(s, s.gaps[0], shape), (p) => p.rotationDeg === 0 && bridges(6)(p))).toBeNull();
      const p = first(gapPlacements(s, s.gaps[0], shape), bridges(6));
      expect(p).not.toBeNull();
      expect(p!.rotationDeg).not.toBe(0);
    }
  });
  it("desk A: mug on the camera, ruler turned to match the slope", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.mug))!;
    const bridge = first(gapPlacements(s, s.gaps[0], A.ruler), bridges(6))!;
    expect(win(6, [cam]).outcome).toBe("FELL");
    expect(win(6, [cam, bridge]).outcome).toBe("WON");
  });
});

describe("Stage 7 — The Twin Watch (two cameras + gap)", () => {
  const s = stageById(7);
  it("one blocked camera isn't enough", () => {
    const cam1 = first(cameraCandidates(s, s.cameras[0], A.mug))!;
    const bridge = first(gapPlacements(s, s.gaps[0], A.ruler), bridges(7))!;
    expect(win(7, [cam1, bridge]).outcome).toBe("CAUGHT");
  });
  it("mixing desks: mug and calculator on the cameras, ruler over the gap", () => {
    const cam1 = first(cameraCandidates(s, s.cameras[0], A.mug))!;
    const cam2 = first(cameraCandidates(s, s.cameras[1], B.calculator))!;
    const bridge = first(gapPlacements(s, s.gaps[0], A.ruler), bridges(7))!;
    expect(win(7, [cam1, cam2, bridge]).outcome).toBe("WON");
  });
});

describe("Stage 8 — The Tripwire (beams + camera + gap)", () => {
  const s = stageById(8);
  it("between the beams, chunky shapes almost never fit; thin bars fit easily", () => {
    const spots = (shape: typeof A.mug) => [...cameraCandidates(s, s.cameras[0], shape)].filter(clearOfBeams(8)).length;
    for (const shape of [A.mug, B.calculator, B.sticky]) expect(spots(shape)).toBeLessThan(20);
    for (const shape of [A.ruler, B.pen]) expect(spots(shape)).toBeGreaterThan(200);
  });
  it("touching a beam sets off the alarm", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.mug), (p) => !clearOfBeams(8)(p))!;
    const bridge = first(gapPlacements(s, s.gaps[0], B.pen), bridges(8))!;
    expect(win(8, [cam, bridge])).toMatchObject({ outcome: "CAUGHT", reason: expect.stringMatching(/sensor beam/) });
  });
  it("two thin bars from two desks: ruler threads the beams, pen bridges the gap", () => {
    const cam = first(cameraCandidates(s, s.cameras[0], A.ruler), clearOfBeams(8))!;
    const bridge = first(gapPlacements(s, s.gaps[0], B.pen), bridges(8))!;
    expect(win(8, [cam, bridge]).outcome).toBe("WON");
  });
});

describe("Stage 9 — The Counterweight (plate + steep gap + camera)", () => {
  const s = stageById(9);
  it("only the slimmest bar makes the steep climb", () => {
    expect(first(gapPlacements(s, s.gaps[0], B.pen), bridges(9))).not.toBeNull();
    expect(first(gapPlacements(s, s.gaps[0], A.ruler), bridges(9))).toBeNull();
  });
  it("mug on the plate, calculator on the camera, pen up the stair", () => {
    const pl = first(plateCandidates(s, s.plates[0], A.mug))!;
    const cam = first(cameraCandidates(s, s.cameras[0], B.calculator), (p) => !judgePlate(s.plates[0], [p]).coverage)!;
    const bridge = first(gapPlacements(s, s.gaps[0], B.pen), bridges(9))!;
    expect(win(9, [cam, bridge]).outcome).toBe("STUCK");
    expect(win(9, [pl, cam, bridge]).outcome).toBe("WON");
  });
});

describe("Stage 10 — The Grand Vault (hook + two cameras + steep gap)", () => {
  const s = stageById(10);
  it("desk B alone: scissors on the hook, calculator and sticky note on the cameras, pen up the stair", () => {
    const hung = first(hookCandidates(s, s.hooks[0], B.scissors))!;
    const cam1 = first(cameraCandidates(s, s.cameras[0], B.calculator))!;
    const cam2 = first(cameraCandidates(s, s.cameras[1], B.sticky))!;
    const bridge = first(gapPlacements(s, s.gaps[0], B.pen), bridges(10))!;
    expect(win(10, [cam1, cam2, bridge]).outcome).toBe("STUCK");
    expect(win(10, [hung, cam1, cam2, bridge]).outcome).toBe("WON");
  });
  it("both desks: mug on the hook, ruler and calculator on the cameras, pen up the stair", () => {
    const hung = first(hookCandidates(s, s.hooks[0], A.mug))!;
    const cam1 = first(cameraCandidates(s, s.cameras[0], A.ruler))!;
    const cam2 = first(cameraCandidates(s, s.cameras[1], B.calculator))!;
    const bridge = first(gapPlacements(s, s.gaps[0], B.pen), bridges(10))!;
    expect(win(10, [hung, cam1, cam2, bridge]).outcome).toBe("WON");
  });
});

describe("dropping a bar over a gap", () => {
  it("settles onto the ledges even from 100px above (phones), and says why when it can't", () => {
    for (const id of [2, 8]) {
      const s = stageById(id), g = s.gaps[0], mid = (g.left + g.right) / 2;
      for (const shape of [A.ruler, B.pen])
        for (const [dx, dy] of [[0, -100], [40, -60], [-60, -20], [0, 15]]) {
          const p = snapPlacement(s, { shape, x: mid + dx, y: g.yLeft + dy, rotationDeg: 0 });
          expect(judgeGap(g, [p]), `stage ${id} drop ${dx},${dy}`).toMatchObject({ bridged: true });
        }
    }
  });
  it("a thin bar left hovering isn't called too thick", () => {
    const g = stageById(2).gaps[0];
    const r = judgeGap(g, [{ shape: A.ruler, x: 495, y: g.yLeft - 60, rotationDeg: 0 }]);
    expect(r.tripsLaser).toBe(true);
    expect(r.reason).toMatch(/off the walk line/);
  });
});

describe("steep gaps (stages 9 and 10)", () => {
  it("one press of ⟲ (345°) is enough for the pen: the drop tries the bar flipped too", () => {
    for (const id of [9, 10]) {
      const s = stageById(id), g = s.gaps[0];
      for (const rotationDeg of [345, 165]) {
        const p = snapPlacement(s, { shape: B.pen, x: (g.left + g.right) / 2, y: (g.yLeft + g.yRight) / 2 - 40, rotationDeg });
        expect(judgeGap(g, [p]).bridged, `stage ${id} at ${rotationDeg}°`).toBe(true);
      }
    }
  });
  it("an unturned bar is told to turn, not that it's too thick", () => {
    const s = stageById(9), g = s.gaps[0];
    const p = snapPlacement(s, { shape: B.pen, x: (g.left + g.right) / 2, y: g.yLeft - 20, rotationDeg: 0 });
    expect(judgeGap(g, [p]).reason).toMatch(/turn it/);
  });
});
