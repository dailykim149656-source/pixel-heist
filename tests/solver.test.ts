import { describe, expect, it } from "vitest";
import { findPlan } from "@/lib/solver";
import { stageById, STAGES } from "@/lib/stages";
import { loadFixtureShape } from "./fixtures";

const deskA = [{ id: "mug", shape: loadFixtureShape("mug") }, { id: "ruler", shape: loadFixtureShape("ruler") }];
const deskB = ["d2-pen", "d2-calculator", "d2-sticky", "d2-scissors"].map((id) => ({ id, shape: loadFixtureShape(id) }));

describe("findPlan: the ground truth behind hints", () => {
  it("finds a winning plan for every stage with both desks' loot", () => {
    for (const s of STAGES) {
      const t0 = performance.now();
      const r = findPlan(s, [...deskA, ...deskB.slice(0, 3)], 20_000);
      console.log(`stage ${s.id}: ${r.plan ? r.plan.map((p) => `${p.item}→${p.job.kind}`).join(", ") : "none"} (${Math.round(performance.now() - t0)}ms)`);
      expect(r.plan, `stage ${s.id}`).not.toBeNull();
    }
  });
  it("says what's missing: desk A has nothing that can hang or bridge the steep stair of stage 10", () => {
    const r = findPlan(stageById(10), deskA, 20_000);
    expect(r.plan).toBeNull();
    expect(r.missing.map((m) => m.id)).toContain("gap");
  });
  it("knows what each item can do in stage 3", () => {
    const r = findPlan(stageById(3), deskA, 20_000);
    expect(r.can.mug.map((j) => j.kind).sort()).toEqual(["camera", "hook", "plate"]);
    expect(r.can.ruler.map((j) => j.kind).sort()).toEqual(["bridge", "camera"]);
  });
});
