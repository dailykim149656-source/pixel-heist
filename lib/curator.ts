import { describeShape, NEEDS } from "./hints";
import type { Shape } from "./geometry";
import type { PlanFacts } from "./hints";
import { requirements } from "./solver";
import { PRIZES, THEMES, type Beam, type Camera, type Door, type Floor, type Gap, type Hook, type Plate, type Prize, type Stage, type Theme } from "./stages";

/**
 * The Curator's Challenge: Muse designs a room for the loot the player brought, inside the
 * parameters the engine supports. The engine compiles the design, then the plan search decides
 * whether this loot can actually beat it. Muse never gets to say a room is solvable.
 */
export type Section =
  | { kind: "camera"; need: number; beams: number }
  | { kind: "gap"; width: number; rise: number; drawbridge: "none" | "plate" | "hook" | "both" }
  | { kind: "door"; opener: "plate" | "hook" };

/** A room is up to three sections, left to right, in a museum wing of Muse's choosing. */
export type RoomSpec = { title: string; curatorLine: string; theme: Theme; prize: Prize; sections: Section[] };

/** The parameters the compiler can lay out safely, in one line for the prompt. */
export const ROOM_SHAPE =
  '{"title":string,"curatorLine":string,"theme":"classic"|"egypt"|"space"|"dino"|"modern","prize":"diamond"|"crown"|"golden egg"|"painting","sections":[1 to 3 of: {"kind":"camera","need":4..6,"beams":0..2} | {"kind":"gap","width":100..140,"rise":-40..50,"drawbridge":"none"|"plate"|"hook"|"both"} | {"kind":"door","opener":"plate"|"hook"}]}';

/** Read whatever Muse sent into a RoomSpec: odd fields fall back to defaults, unknown sections are dropped. */
export function normalizeSpec(raw: unknown): RoomSpec {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const pick = <T extends string>(v: unknown, opts: readonly T[], d: T) => (opts.includes(v as T) ? (v as T) : d);
  const sections: Section[] = (Array.isArray(o.sections) ? o.sections : [])
    .map((x: any): Section | null =>
      x?.kind === "camera"
        ? { kind: "camera", need: num(x.need, 5), beams: num(x.beams, 0) }
        : x?.kind === "gap"
          ? { kind: "gap", width: num(x.width, 120), rise: num(x.rise, 0), drawbridge: pick(x.drawbridge, ["none", "plate", "hook", "both"] as const, "none") }
          : x?.kind === "door"
            ? { kind: "door", opener: pick(x.opener, ["plate", "hook"] as const, "plate") }
            : null,
    )
    .filter((x: Section | null): x is Section => x !== null)
    .slice(0, 3);
  return {
    title: typeof o.title === "string" ? o.title : "The Curator's Room",
    curatorLine: typeof o.curatorLine === "string" ? o.curatorLine : "Let's see what reality is worth.",
    theme: pick(o.theme, THEMES, "classic"),
    prize: pick(o.prize, PRIZES, "diamond"),
    sections,
  };
}

const FLOOR = 430, VAULT_X = 890, START = 140, END = 830;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/**
 * Lay the sections out left to right in equal zones between the thief and the vault, clamping
 * every number into a safe range. Gaps change the floor height for everything after them.
 */
export function compileRoom(spec: RoomSpec, id: number): Stage {
  const floors: Floor[] = [], cameras: Camera[] = [], gaps: Gap[] = [], plates: Plate[] = [], hooks: Hook[] = [], doors: Door[] = [], beams: Beam[] = [];
  const zone = (END - START) / Math.max(1, spec.sections.length);
  let y = FLOOR, floorFrom = -10;
  spec.sections.forEach((sec, i) => {
    const a = START + i * zone, b = a + zone, n = i + 1;
    if (sec.kind === "camera") {
      // Mounted just past its own zone, so it never crowds the next section's hook.
      const x = clamp(b + 40, 300, 900), fromX = Math.round(a + 15), toX = Math.round(b - 45), targetY = y - 46;
      cameras.push({ id: `cam-${n}`, x, y: 92, fromX, toX, targetY, rays: 7, need: clamp(sec.need, 4, 6), forbiddenRadius: 80 });
      const at = [[], [0.5], [0.47, 0.81]][clamp(sec.beams, 0, 2)];
      at.forEach((f, k) => {
        const by = Math.round(92 + (targetY - 92) * f);
        beams.push({ id: `beam-${n}-${k + 1}`, x0: Math.round(a - 20), y0: by, x1: x - 40, y1: by });
      });
    } else if (sec.kind === "gap") {
      const width = clamp(sec.width, 100, Math.min(140, zone - 40));
      const withPlate = sec.drawbridge === "plate" || sec.drawbridge === "both";
      // Centred in its zone, but shifted left when its far-side plate would run into the vault.
      const left = Math.round(Math.min(a + (zone - width) / 2, withPlate ? END - 100 - width : Infinity)), right = left + width;
      const yNext = clamp(y - sec.rise, 340, 470);
      floors.push({ x0: floorFrom, x1: left, y });
      gaps.push({ id: `gap-${n}`, left, right, yLeft: y, yRight: yNext, support: 12, slotAbove: 40, slotBelow: 8 });
      // Drawbridge controls on the far ledge: a plate on the floor, a hook up high.
      if (withPlate) plates.push({ id: `gap-${n}-plate`, x: right + 10, width: 90, y: yNext, cover: 0.7, opens: `gap-${n}` });
      if (sec.drawbridge === "hook" || sec.drawbridge === "both") hooks.push({ id: `gap-${n}-hook`, x: Math.min(right + 70, 800), y: 200, opens: `gap-${n}` });
      y = yNext;
      floorFrom = right;
    } else {
      // A door at the far end of its zone, with its opener before it.
      const x = Math.round(a + zone * 0.72);
      doors.push({ id: `door-${n}`, x });
      if (sec.opener === "plate") plates.push({ id: `door-${n}-plate`, x: Math.round(a + 10), width: Math.min(120, x - Math.round(a + 10) - 40), y, cover: 0.7, opens: `door-${n}` });
      else hooks.push({ id: `door-${n}-hook`, x: x - 30, y: 190, opens: `door-${n}` });
    }
  });
  floors.push({ x0: floorFrom, x1: 970, y });
  const name = spec.title.trim().slice(0, 40) || "The Curator's Room";
  return {
    id, name, teaser: spec.curatorLine.trim().slice(0, 200),
    floors, cameras, gaps, plates, hooks, doors, beams, vaultX: VAULT_X,
    look: { theme: spec.theme, prize: spec.prize },
  };
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
