import { describe, expect, it } from "vitest";
import { compileRoom, judgeRoom, normalizeSpec, type RoomSpec, type Section } from "@/lib/curator";
import { judge, placementProblem } from "@/lib/judge";
import { findPlan } from "@/lib/solver";
import { loadFixtureShape } from "./fixtures";

/** Curator rooms are compiled from a design, then the engine alone rules on them. */
const deskA = [{ id: "mug", shape: loadFixtureShape("mug") }, { id: "ruler", shape: loadFixtureShape("ruler") }];
const deskB = ["d2-pen", "d2-calculator", "d2-sticky", "d2-scissors"].map((id) => ({ id, shape: loadFixtureShape(id) }));

const room = (sections: Section[], over: Partial<RoomSpec> = {}): RoomSpec => ({ title: "Test Room", curatorLine: "Let's see.", theme: "classic", prize: "diamond", sections, ...over });
const cam = (need = 5, beams = 0): Section => ({ kind: "camera", need, beams });
const gapS = (rise = 0, drawbridge: "none" | "plate" | "hook" | "both" = "none", width = 120): Section => ({ kind: "gap", width, rise, drawbridge });
const door = (opener: "plate" | "hook"): Section => ({ kind: "door", opener });

function rule(s: RoomSpec, loot: typeof deskA) {
  const stage = compileRoom(s, 1000);
  const r = findPlan(stage, loot, 20_000);
  const facts = { plan: r.plan?.map((p) => ({ item: p.item, job: p.job, x: p.placement.x, y: p.placement.y, rotationDeg: p.placement.rotationDeg })) ?? null, can: r.can, missing: r.missing };
  return { stage, verdict: judgeRoom(stage, facts, loot.length), plan: r.plan };
}

describe("Curator rooms", () => {
  it("lays up to three sections out in order, with floors that follow every rise and drop", () => {
    const s = compileRoom(room([gapS(40, "hook"), cam(6, 2), gapS(-40, "plate")]), 1001);
    expect(s.gaps.map((g) => g.left)).toEqual([...s.gaps.map((g) => g.left)].sort((x, y) => x - y));
    expect(s.gaps[0].right).toBeLessThan(s.cameras[0].fromX);
    expect(s.cameras[0].toX).toBeLessThan(s.gaps[1].left);
    expect(s.gaps[0].yRight).toBe(390);
    expect(s.gaps[1].yLeft).toBe(390);
    expect(s.gaps[1].yRight).toBe(430);
    expect(s.beams).toHaveLength(2);
    for (const f of s.floors) expect(f.y).toBeGreaterThanOrEqual(340);
    for (const p of s.plates) expect(p.x + p.width).toBeLessThan(s.vaultX - 55);
    expect(s.look).toEqual({ theme: "classic", prize: "diamond" });
  });

  it("desk A: a camera then a gap with drawbridge controls is beatable, with both items", () => {
    expect(rule(room([cam(), gapS(0, "both")]), deskA).verdict).toEqual({ ok: true, itemsUsed: 2 });
  });

  it("order is up to the Curator: a gap first, then the camera", () => {
    const { stage, verdict } = rule(room([gapS(0), cam()]), deskA);
    expect(stage.gaps[0].right).toBeLessThan(stage.cameras[0].fromX);
    expect(verdict.ok).toBe(true);
  });

  it("desk A: a hook door, then a gap — the mug hangs, the ruler bridges", () => {
    const { verdict, plan } = rule(room([door("hook"), gapS(0)]), deskA);
    expect(verdict.ok).toBe(true);
    expect(plan!.map((p) => `${p.item}:${p.job.kind}`).sort()).toEqual(["mug:hook", "ruler:bridge"]);
  });

  it("desk B: a plate door, a camera, then a rising gap", () => {
    expect(rule(room([door("plate"), cam(), gapS(40)]), deskB).verdict).toEqual({ ok: true, itemsUsed: 3 });
  });

  it("refuses a room this loot can't beat, and says why", () => {
    const { verdict } = rule(room([cam(), gapS(0, "none", 140)]), [deskA[0], deskB[2]]); // mug + sticky note: nothing long
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/cross the gap/);
  });

  it("refuses a room one object can beat when the player brought more", () => {
    expect(rule(room([cam(4)]), deskA).verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/Too easy/) });
  });

  it("an accepted room's plan really wins, beams and all", () => {
    const { stage, plan } = rule(room([cam(5, 1), gapS(0, "both")]), [...deskA, ...deskB]);
    expect(plan).not.toBeNull();
    for (const p of plan!) expect(placementProblem(stage, p.placement)).toBeNull();
    expect(judge(stage, plan!.map((p) => p.placement)).beams.every((b) => !b.tripped)).toBe(true);
  });

  it("reads whatever Muse sends: unknown sections dropped, at most three, odd values defaulted", () => {
    const s = normalizeSpec({ theme: "volcano", prize: "crown", sections: [{ kind: "camera", need: 9 }, { kind: "moat" }, { kind: "gap" }, { kind: "door", opener: "x" }, { kind: "camera" }] });
    expect(s.theme).toBe("classic");
    expect(s.prize).toBe("crown");
    expect(s.sections.map((x) => x.kind)).toEqual(["camera", "gap", "door"]);
    expect(compileRoom(s, 1).cameras[0].need).toBe(6);
  });
});
