import { anyOccupied, gridToWorld, holeAt, occupiedBounds, type Placement } from "./geometry";
import { GAP_TOLERANCE, SNAP_RANGE, THIEF, VAULT_SIZE, WORLD } from "./stage";
import type { Beam, Camera, Gap, Hook, Plate, Stage } from "./stages";

/**
 * Puzzle judging from mask geometry only (PRD §3.4). Nothing here knows what an object is called.
 */

export type Ray = { from: { x: number; y: number }; to: { x: number; y: number }; blockedAt: { x: number; y: number } | null };
export type CameraResult = { id: string; blocked: boolean; blockedCount: number; need: number; rays: Ray[] };
export type GapResult = {
  id: string;
  bridged: boolean;
  /** Longest unbroken run along the walk line that starts on the left support (game px). */
  span: number;
  spanNeeded: number;
  tripsLaser: boolean;
  /** Thickest opaque extent over the gap, measured against the walk line. */
  thickness: number;
  reason: string | null;
};
export type PlateResult = { id: string; covered: boolean; coverage: number; need: number };
export type HookResult = { id: string; hung: boolean };
export type BeamResult = { id: string; tripped: boolean; at: { x: number; y: number } | null };
export type Judgement = {
  cameras: CameraResult[];
  gaps: GapResult[];
  plates: PlateResult[];
  hooks: HookResult[];
  beams: BeamResult[];
  /** Door id → open. */
  doors: Record<string, boolean>;
};

const RAY_STEP = 2;
const WALK_ABOVE = 12, WALK_BELOW = 4;
const LASER_REACH_ABOVE = 120, LASER_REACH_BELOW = 90;
const PLATE_BAND = 40;

export function gapLineY(g: Gap, x: number) {
  if (x <= g.left) return g.yLeft;
  if (x >= g.right) return g.yRight;
  return g.yLeft + ((x - g.left) / (g.right - g.left)) * (g.yRight - g.yLeft);
}

export function cameraTargets(c: Camera) {
  return Array.from({ length: c.rays }, (_, i) => ({ x: c.fromX + ((c.toX - c.fromX) * i) / (c.rays - 1), y: c.targetY }));
}

export function judgeCamera(c: Camera, placements: readonly Placement[]): CameraResult {
  const from = { x: c.x, y: c.y };
  const rays = cameraTargets(c).map((to): Ray => {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    for (let d = c.forbiddenRadius; d <= len; d += RAY_STEP) {
      const x = from.x + ((to.x - from.x) * d) / len, y = from.y + ((to.y - from.y) * d) / len;
      if (anyOccupied(placements, x, y)) return { from, to, blockedAt: { x, y } };
    }
    return { from, to, blockedAt: null };
  });
  const blockedCount = rays.filter((r) => r.blockedAt).length;
  return { id: c.id, blocked: blockedCount >= c.need, blockedCount, need: c.need, rays };
}

export function judgeGap(g: Gap, placements: readonly Placement[]): GapResult {
  const fromX = g.left - g.support, toX = g.right + g.support;
  const spanNeeded = toX - fromX;
  const at = (x: number, y: number) => anyOccupied(placements, x + 0.5, y + 0.5);
  const inWalkBand = (x: number) => {
    const line = Math.round(gapLineY(g, x));
    for (let y = line - WALK_ABOVE; y <= line + WALK_BELOW; y++) if (at(x, y)) return true;
    return false;
  };
  // Unbroken run (holes up to GAP_TOLERANCE closed) that starts on the left support.
  const covered = Array.from({ length: spanNeeded }, (_, i) => inWalkBand(fromX + i));
  const start = covered.findIndex(Boolean);
  let span = 0;
  if (start >= 0 && start < g.support) {
    let end = start, holes = 0;
    for (let i = start; i < spanNeeded; i++) {
      if (covered[i]) {
        end = i;
        holes = 0;
      } else if (++holes > GAP_TOLERANCE) break;
    }
    span = end - start + 1;
  }

  // Lasers: over the gap, anything outside the slot around the walk line trips them.
  let thickness = 0, tripsLaser = false;
  for (let x = g.left; x < g.right; x++) {
    const line = Math.round(gapLineY(g, x));
    let top = Infinity, bottom = -Infinity;
    for (let y = line - LASER_REACH_ABOVE; y <= line + LASER_REACH_BELOW; y++)
      if (at(x, y)) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    if (top === Infinity) continue;
    thickness = Math.max(thickness, bottom - top + 1);
    if (top < line - g.slotAbove || bottom >= line + g.slotBelow) tripsLaser = true;
  }

  const spans = span >= spanNeeded;
  let reason: string | null = null;
  if (tripsLaser) reason = `Too thick — trips the lasers (needs ≤ ${g.slotAbove + g.slotBelow}px, this is ${thickness}px)`;
  else if (!spans) reason = span === 0 ? "Nothing spans the gap" : `Doesn't span both ledges (${span}/${spanNeeded}px)`;
  return { id: g.id, bridged: spans && !tripsLaser, span, spanNeeded, tripsLaser, thickness, reason };
}

/** Where the thief stands over a gap: the top of whatever bridges it near the walk line. */
export function bridgeSurfaceY(g: Gap, placements: readonly Placement[], x: number) {
  const line = gapLineY(g, x);
  for (let y = Math.round(line - g.slotAbove); y <= line + WALK_BELOW; y++) if (anyOccupied(placements, x + 0.5, y + 0.5)) return y;
  return line;
}

export function judgePlate(pl: Plate, placements: readonly Placement[]): PlateResult {
  let hit = 0, total = 0;
  for (let y = pl.y - PLATE_BAND; y < pl.y; y += 2)
    for (let x = pl.x; x < pl.x + pl.width; x += 2) {
      total++;
      if (anyOccupied(placements, x + 0.5, y + 0.5)) hit++;
    }
  const coverage = hit / total;
  return { id: pl.id, covered: coverage >= pl.cover, coverage, need: pl.cover };
}

export function judgeHook(h: Hook, placements: readonly Placement[]): HookResult {
  return { id: h.id, hung: placements.some((p) => holeAt(p, h.x, h.y)) };
}

export function judgeBeam(b: Beam, placements: readonly Placement[]): BeamResult {
  const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  for (let d = 0; d <= len; d += RAY_STEP) {
    const x = b.x0 + ((b.x1 - b.x0) * d) / len, y = b.y0 + ((b.y1 - b.y0) * d) / len;
    if (anyOccupied(placements, x, y)) return { id: b.id, tripped: true, at: { x, y } };
  }
  return { id: b.id, tripped: false, at: null };
}

export function judge(stage: Stage, placements: readonly Placement[]): Judgement {
  const plates = stage.plates.map((p) => judgePlate(p, placements));
  const hooks = stage.hooks.map((h) => judgeHook(h, placements));
  const doors: Record<string, boolean> = {};
  for (const d of stage.doors) doors[d.id] = false;
  stage.plates.forEach((p, i) => plates[i].covered && (doors[p.opens] = true));
  stage.hooks.forEach((h, i) => hooks[i].hung && (doors[h.opens] = true));
  return {
    cameras: stage.cameras.map((c) => judgeCamera(c, placements)),
    gaps: stage.gaps.map((g) => judgeGap(g, placements)),
    plates,
    hooks,
    beams: stage.beams.map((b) => judgeBeam(b, placements)),
    doors,
  };
}

export type Mission = { id: string; label: string; done: boolean; detail: string; hint: string };

/** The stage's checklist, in the order the thief meets them. */
export function missionList(stage: Stage, j: Judgement): Mission[] {
  const m: Mission[] = [];
  stage.plates.forEach((p, i) =>
    m.push({
      id: p.id,
      label: "Weigh down the plate",
      done: j.plates[i].covered,
      detail: `${Math.round(j.plates[i].coverage * 100)}% covered (need ${Math.round(p.cover * 100)}%)`,
      hint: "The plate needs bulk: the 40px strip above it must be mostly filled. Thin bars and loops don't weigh enough.",
    }),
  );
  stage.hooks.forEach((h, i) =>
    m.push({
      id: h.id,
      label: "Hang something on the hook",
      done: j.hooks[i].hung,
      detail: j.hooks[i].hung ? "Hanging" : "Needs an object with a real hole",
      hint: "Only a loop or a handle can catch the hook. Drop the hole right onto it.",
    }),
  );
  stage.beams.forEach((b, i) =>
    m.push({
      id: b.id,
      label: "Keep the beam clear",
      done: !j.beams[i].tripped,
      detail: j.beams[i].tripped ? "Something is touching the beam" : "Nothing touches it",
      hint: "The sensor beam sounds the alarm if anything touches it. Fit your blocker above or below it.",
    }),
  );
  stage.cameras.forEach((c, i) =>
    m.push({
      id: c.id,
      label: "Block the camera",
      done: j.cameras[i].blocked,
      detail: `${j.cameras[i].blockedCount}/${c.rays} rays blocked (need ${c.need})`,
      hint: "Anything that crosses the red rays blocks the view.",
    }),
  );
  stage.gaps.forEach((g, i) =>
    m.push({
      id: g.id,
      label: "Bridge the gap",
      done: j.gaps[i].bridged,
      detail: j.gaps[i].tripsLaser ? "Trips the lasers" : `Span ${j.gaps[i].span}/${j.gaps[i].spanNeeded}px`,
      hint: "Needs one unbroken span across both ledges — and thin enough to slip between the lasers.",
    }),
  );
  return m;
}

export function forbiddenRects(stage: Stage) {
  const floorAt = (x: number) => stage.floors.find((f) => x >= f.x0 && x <= f.x1)?.y ?? 430;
  const thiefFloor = floorAt(THIEF.startX), vaultFloor = floorAt(stage.vaultX);
  return [
    { x: THIEF.startX - 40, y: thiefFloor - THIEF.height - 10, width: 80, height: THIEF.height + 10 },
    { x: stage.vaultX - VAULT_SIZE.width / 2, y: vaultFloor - VAULT_SIZE.height, width: VAULT_SIZE.width, height: VAULT_SIZE.height },
    ...stage.doors.map((d) => ({ x: d.x - 12, y: floorAt(d.x) - 140, width: 24, height: 140 })),
  ];
}

/** Why a placement can't be dropped here, or null if it can (PRD §3.2 step 6: red preview). */
export function placementProblem(stage: Stage, p: Placement): string | null {
  if (p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height) return "Outside the sketch";
  const g = p.shape.grid;
  const t = (p.rotationDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const rects = forbiddenRects(stage);
  for (let gy = 0; gy < g.height; gy += 2)
    for (let gx = 0; gx < g.width; gx += 2) {
      if (!g.data[gy * g.width + gx]) continue;
      const lx = gx + 0.5 - g.width / 2, ly = gy + 0.5 - g.height / 2;
      const wx = p.x + lx * c - ly * s, wy = p.y + lx * s + ly * c;
      for (const cam of stage.cameras) if (Math.hypot(wx - cam.x, wy - cam.y) < cam.forbiddenRadius) return "Too close to the camera";
      for (const r of rects) if (wx >= r.x && wx < r.x + r.width && wy >= r.y && wy < r.y + r.height) return "Blocks the thief, a door or the vault";
    }
  return null;
}

const HOOK_SNAP = 28;
const GAP_CENTER_SNAP = 48;

/**
 * Snaps (PRD §3.2 step 7). Only position changes — whether the result works is still decided by
 * the mask: a hole near a hook catches it; anything near a gap or plate rests on the surface below.
 */
export function snapPlacement(stage: Stage, p: Placement): Placement {
  for (const h of stage.hooks)
    for (const a of p.shape.holeAnchors) {
      const w = gridToWorld(p, a.x, a.y);
      if (Math.hypot(w.x - h.x, w.y - h.y) <= HOOK_SNAP) return { ...p, x: p.x + (h.x - w.x), y: p.y + (h.y - w.y) };
    }

  const b = occupiedBounds(p);
  let q = p;
  for (const g of stage.gaps) {
    if (b.right < g.left - g.support || b.left > g.right + g.support) continue;
    const gapCenter = (g.left + g.right) / 2, itemCenter = (b.left + b.right) / 2;
    if (Math.abs(itemCenter - gapCenter) <= GAP_CENTER_SNAP) q = { ...q, x: q.x + gapCenter - itemCenter };
    return restOn(q, (x) => (x >= g.left - g.support && x <= g.right + g.support ? gapLineY(g, x) : null));
  }
  for (const pl of stage.plates) {
    if (b.right < pl.x || b.left > pl.x + pl.width) continue;
    return restOn(q, (x) => (x >= pl.x - 40 && x <= pl.x + pl.width + 40 ? pl.y : null));
  }
  return q;
}

/** Move the item vertically so its lowest point rests on `surface`, if it's already close. */
function restOn(p: Placement, surface: (x: number) => number | null): Placement {
  const t = (p.rotationDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const g = p.shape.grid;
  let dy = Infinity;
  for (let gy = 0; gy < g.height; gy++)
    for (let gx = 0; gx < g.width; gx++) {
      if (!g.data[gy * g.width + gx]) continue;
      const lx = gx + 0.5 - g.width / 2, ly = gy + 1 - g.height / 2;
      const wx = p.x + lx * c - ly * s, wy = p.y + lx * s + ly * c;
      const sy = surface(wx);
      if (sy !== null) dy = Math.min(dy, sy - wy);
    }
  if (!Number.isFinite(dy) || Math.abs(dy) > SNAP_RANGE + WALK_ABOVE) return p;
  return { ...p, y: p.y + dy };
}
