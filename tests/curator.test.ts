import { describe, expect, it } from "vitest";
import { compileRoom, judgeRoom, type RoomSpec } from "@/lib/curator";
import { judge, placementProblem } from "@/lib/judge";
import { findPlan } from "@/lib/solver";
import { loadFixtureShape } from "./fixtures";

/** Curator rooms are compiled from a design, then the engine alone rules on them. */
const deskA = [{ id: "mug", shape: loadFixtureShape("mug") }, { id: "ruler", shape: loadFixtureShape("ruler") }];
const deskB = ["d2-pen", "d2-calculator", "d2-sticky", "d2-scissors"].map((id) => ({ id, shape: loadFixtureShape(id) }));

const spec = (over: Partial<RoomSpec>): RoomSpec => ({
  title: "Test Room",
  curatorLine: "Let's see.",
  camera: { use: false, x: 600, need: 5 },
  gap: { use: false, left: 480, width: 120, rise: 0, drawbridge: "none" },
  door: { use: false, x: 360, opener: "plate" },
  beams: 0,
  ...over,
});

function rule(s: RoomSpec, loot: typeof deskA) {
  const stage = compileRoom(s, 1000);
  const r = findPlan(stage, loot, 20_000);
  const facts = { plan: r.plan?.map((p) => ({ item: p.item, job: p.job, x: p.placement.x, y: p.placement.y, rotationDeg: p.placement.rotationDeg })) ?? null, can: r.can, missing: r.missing };
  return { stage, verdict: judgeRoom(stage, facts, loot.length), plan: r.plan };
}

describe("Curator rooms", () => {
  it("compiles every device inside the sketch, clear of the thief and the vault", () => {
    const s = compileRoom(spec({ camera: { use: true, x: 760, need: 6 }, gap: { use: true, left: 560, width: 140, rise: 50, drawbridge: "both" }, door: { use: true, x: 400, opener: "hook" }, beams: 2 }), 1001);
    const g = s.gaps[0];
    expect(g.right).toBeLessThanOrEqual(700);
    expect(s.doors[0].x).toBeLessThan(g.left);
    for (const p of s.plates) expect(p.x + p.width).toBeLessThan(s.vaultX - 55);
    expect(s.cameras[0].toX).toBeLessThan(g.left);
  });

  it("desk A: a camera and a level gap with drawbridge controls is beatable, with both items", () => {
    const { verdict } = rule(spec({ camera: { use: true, x: 620, need: 5 }, gap: { use: true, left: 480, width: 120, rise: 0, drawbridge: "both" } }), deskA);
    expect(verdict).toEqual({ ok: true, itemsUsed: 2 });
  });

  it("desk A: a hook door and a gap — the mug hangs, the ruler bridges", () => {
    const { verdict, plan } = rule(spec({ door: { use: true, x: 360, opener: "hook" }, gap: { use: true, left: 500, width: 120, rise: 0, drawbridge: "none" } }), deskA);
    expect(verdict.ok).toBe(true);
    expect(plan!.map((p) => `${p.item}:${p.job.kind}`).sort()).toEqual(["mug:hook", "ruler:bridge"]);
  });

  it("desk B: camera, a rising gap and a plate door", () => {
    const { verdict } = rule(spec({ camera: { use: true, x: 640, need: 5 }, gap: { use: true, left: 500, width: 120, rise: 40, drawbridge: "none" }, door: { use: true, x: 360, opener: "plate" } }), deskB);
    expect(verdict).toEqual({ ok: true, itemsUsed: 3 });
  });

  it("refuses a room this loot can't beat, and says why", () => {
    const { verdict } = rule(spec({ gap: { use: true, left: 480, width: 140, rise: 0, drawbridge: "none" }, camera: { use: true, x: 620, need: 5 } }), [deskA[0], deskB[2]]); // mug + sticky note: nothing long
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/cross the gap/);
  });

  it("refuses a room one object can beat when the player brought more", () => {
    const { verdict } = rule(spec({ camera: { use: true, x: 620, need: 4 } }), deskA);
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/Too easy/) });
  });

  it("an accepted room's plan really wins", () => {
    const { stage, plan } = rule(spec({ camera: { use: true, x: 620, need: 5 }, gap: { use: true, left: 480, width: 120, rise: 0, drawbridge: "both" }, beams: 1 }), [...deskA, ...deskB]);
    expect(plan).not.toBeNull();
    for (const p of plan!) expect(placementProblem(stage, p.placement)).toBeNull();
    const j = judge(stage, plan!.map((p) => p.placement));
    expect(j.beams.every((b) => !b.tripped)).toBe(true);
  });
});
