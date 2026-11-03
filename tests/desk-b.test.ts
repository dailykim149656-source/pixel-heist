import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/geometry";
import { planRun } from "@/lib/heist";
import { judge, judgeCamera, judgeGap, placementProblem } from "@/lib/judge";
import { allPlacements, gapPlacements, loadFixtureShape } from "./fixtures";

/** Desk B (a different AI-generated desk): different objects, same rules, a different solution. */
const pen = loadFixtureShape("d2-pen");
const calculator = loadFixtureShape("d2-calculator");
const sticky = loadFixtureShape("d2-sticky");
const scissors = loadFixtureShape("d2-scissors");

const first = (gen: Iterable<Placement>, ok: (p: Placement) => boolean) => {
  for (const p of gen) if (ok(p)) return p;
  return null;
};
const bridges = (p: Placement) => !placementProblem(p) && judgeGap([p]).bridged;
const guardsCamera = (p: Placement) => !placementProblem(p) && judgeCamera([p]).blocked && judgeGap([p]).overGap === null;

describe("desk B solution", () => {
  it("the pen bridges the gap", () => expect(first(gapPlacements(pen), bridges)).not.toBeNull());

  it("calculator, sticky note and scissors never bridge (too thick for the lasers)", () => {
    for (const shape of [calculator, sticky, scissors]) for (const p of gapPlacements(shape)) expect(judgeGap([p]).bridged).toBe(false);
  });

  it("the calculator and the sticky note can each block the camera", () => {
    expect(first(allPlacements(calculator), guardsCamera)).not.toBeNull();
    expect(first(allPlacements(sticky), guardsCamera)).not.toBeNull();
  });

  it("calculator on the camera + pen over the gap escapes", () => {
    const cam = first(allPlacements(calculator), guardsCamera)!;
    const bridge = first(gapPlacements(pen), bridges)!;
    expect(planRun(judge([cam, bridge])).outcome).toBe("WON");
  });
});
