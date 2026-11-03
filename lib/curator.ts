import { describeShape, NEEDS } from "./hints";
import type { Shape } from "./geometry";
import type { PlanFacts } from "./hints";
import { requirements } from "./solver";
import type { Beam, Camera, Door, Floor, Gap, Hook, Plate, Stage } from "./stages";

/**
 * The Curator's Challenge: Muse designs a room for the loot the player brought, inside the
 * parameters the engine supports. The engine compiles the design, then the plan search decides
 * whether this loot can actually beat it. Muse never gets to say a room is solvable.
 */
export type RoomSpec = {
  title: string;
  curatorLine: string;
  camera: { use: boolean; x: number; need: number };
  gap: { use: boolean; left: number; width: number; rise: number; drawbridge: "none" | "plate" | "hook" | "both" };
  door: { use: boolean; x: number; opener: "plate" | "hook" };
  beams: number;
};

/** The parameters the compiler can lay out safely, in one line for the prompt. */
export const ROOM_SHAPE =
  '{"title":string,"curatorLine":string,"camera":{"use":bool,"x":560..760,"need":4..6},"gap":{"use":bool,"left":440..560,"width":100..140,"rise":0..50,"drawbridge":"none"|"plate"|"hook"|"both"},"door":{"use":bool,"x":300..400,"opener":"plate"|"hook"},"beams":0..2}';

/** Read whatever Muse sent into a RoomSpec: missing or odd fields fall back to "not used". */
export function normalizeSpec(raw: unknown): RoomSpec {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const pick = <T extends string>(v: unknown, opts: readonly T[], d: T) => (opts.includes(v as T) ? (v as T) : d);
  return {
    title: typeof o.title === "string" ? o.title : "The Curator's Room",
    curatorLine: typeof o.curatorLine === "string" ? o.curatorLine : "Let's see what reality is worth.",
    camera: { use: o.camera?.use === true, x: num(o.camera?.x, 640), need: num(o.camera?.need, 5) },
    gap: {
      use: o.gap?.use === true,
      left: num(o.gap?.left, 480),
      width: num(o.gap?.width, 120),
      rise: num(o.gap?.rise, 0),
      drawbridge: pick(o.gap?.drawbridge, ["none", "plate", "hook", "both"] as const, "none"),
    },
    door: { use: o.door?.use === true, x: num(o.door?.x, 360), opener: pick(o.door?.opener, ["plate", "hook"] as const, "plate") },
    beams: num(o.beams, 0),
  };
}

const FLOOR = 430, VAULT_X = 890;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Lay the design out on the 960×540 sketch, clamping everything into safe ranges. */
export function compileRoom(spec: RoomSpec, id: number): Stage {
  const floors: Floor[] = [], cameras: Camera[] = [], gaps: Gap[] = [], plates: Plate[] = [], hooks: Hook[] = [], doors: Door[] = [], beams: Beam[] = [];
  let farY = FLOOR;
  let gapLeft = 970;
  if (spec.gap.use) {
    const left = clamp(spec.gap.left, 440, 560), right = left + clamp(spec.gap.width, 100, 140);
    farY = FLOOR - clamp(spec.gap.rise, 0, 50);
    gapLeft = left;
    floors.push({ x0: -10, x1: left, y: FLOOR }, { x0: right, x1: 970, y: farY });
    gaps.push({ id: "gap", left, right, yLeft: FLOOR, yRight: farY, support: 12, slotAbove: 40, slotBelow: 8 });
    // Drawbridge controls sit on the far ledge, past the gap, short of the vault.
    if (spec.gap.drawbridge === "plate" || spec.gap.drawbridge === "both") plates.push({ id: "bridge-plate", x: right + 25, width: 100, y: farY, cover: 0.7, opens: "gap" });
    if (spec.gap.drawbridge === "hook" || spec.gap.drawbridge === "both") hooks.push({ id: "bridge-hook", x: Math.min(right + 120, 790), y: 200, opens: "gap" });
  } else floors.push({ x0: -10, x1: 970, y: FLOOR });

  if (spec.door.use) {
    const x = clamp(spec.door.x, 300, Math.min(400, gapLeft - 70));
    doors.push({ id: "door", x });
    if (spec.door.opener === "plate") plates.push({ id: "door-plate", x: 110, width: Math.min(120, x - 150), y: FLOOR, cover: 0.7, opens: "door" });
    else hooks.push({ id: "door-hook", x: x - 130, y: 170, opens: "door" });
  }

  if (spec.camera.use) {
    const x = clamp(spec.camera.x, 560, 760);
    const toX = Math.min(x - 210, gapLeft - 40), fromX = Math.max(110, toX - 240);
    cameras.push({ id: "cam", x, y: 92, fromX, toX, targetY: FLOOR - 46, rays: 7, need: clamp(spec.camera.need, 4, 6), forbiddenRadius: 80 });
    const ys = [[], [280], [230, 330]][clamp(spec.beams, 0, 2)];
    ys.forEach((y, i) => beams.push({ id: `beam-${i + 1}`, x0: fromX - 20, y0: y, x1: x - 40, y1: y }));
  }

  const name = spec.title.trim().slice(0, 40) || "The Curator's Room";
  return { id, name, teaser: spec.curatorLine.trim().slice(0, 200), floors, cameras, gaps, plates, hooks, doors, beams, vaultX: VAULT_X };
}

/** What Muse is told about the loot: shapes and measurements only, never names. */
export function lootForCurator(loot: { shape: Shape }[]) {
  return loot.map((l, i) => ({
    ref: `cut-out ${i + 1}`,
    shape: describeShape(l.shape),
    lengthPx: l.shape.metrics.lengthPx,
    thicknessPx: l.shape.metrics.thicknessPx,
    holes: l.shape.holeAnchors.length,
  }));
}

export type Verdict = { ok: true; itemsUsed: number } | { ok: false; reason: string };

/**
 * The engine's ruling on a compiled room: it must be beatable with this loot, and (when the
 * player brought more than one thing) not by a single object.
 */
export function judgeRoom(stage: Stage, facts: PlanFacts, lootCount: number): Verdict {
  const reqs = requirements(stage);
  if (!reqs.length) return { ok: false, reason: "The room has nothing in it to beat. Use at least a camera, a gap or a door." };
  if (reqs.length > lootCount)
    return { ok: false, reason: `It has ${reqs.length} obstacles (${reqs.map((r) => r.label).join(", ")}) but the thief only has ${lootCount} cut-out${lootCount > 1 ? "s" : ""}, one per job. Remove obstacles.` };
  if (facts.missing.length)
    return { ok: false, reason: `This loot can't ${facts.missing.map((m) => `${m.label} (it would need ${m.jobs.map((j) => NEEDS[j.kind]).join(" or ")})`).join("; ")}.` };
  if (!facts.plan) return { ok: false, reason: "Each job can be done, but not all at once with this loot: the pieces get in each other's way. Make it less crowded." };
  if (lootCount >= 2 && facts.plan.length < 2) return { ok: false, reason: "Too easy: a single cut-out beats it. Add a second obstacle that needs a different shape." };
  return { ok: true, itemsUsed: facts.plan.length };
}
