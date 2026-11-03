import { anyOccupied, longestRun, occupiedBounds, type Placement } from "./geometry";
import { CAMERA, FLOOR_Y, FORBIDDEN_RECTS, GAP, SNAP_RANGE, WORLD } from "./stage";

/**
 * Puzzle judging from mask geometry only (PRD §3.4). Nothing here knows what an object is called.
 */

export type Ray = { from: { x: number; y: number }; to: { x: number; y: number }; blockedAt: { x: number; y: number } | null };

export type CameraResult = { blocked: boolean; blockedCount: number; rays: Ray[] };

export type GapResult = {
  bridged: boolean;
  /** Longest continuous run inside the walk band that starts on the left support (game px). */
  span: number;
  spanNeeded: number;
  /** Highest/lowest occupied row above the gap, if any opaque pixels are there. */
  overGap: { top: number; bottom: number } | null;
  tripsLaser: boolean;
  reason: string | null;
  /** Surface the thief walks on, per column over the gap (for the walk animation). */
  surfaceY: (x: number) => number;
};

export type Judgement = { camera: CameraResult; gap: GapResult };

const RAY_STEP = 2;

export function cameraRays(): { x: number; y: number }[] {
  const n = CAMERA.rayCount;
  return Array.from({ length: n }, (_, i) => ({
    x: CAMERA.targetFromX + ((CAMERA.targetToX - CAMERA.targetFromX) * i) / (n - 1),
    y: CAMERA.targetY,
  }));
}

export function judgeCamera(placements: readonly Placement[]): CameraResult {
  const from = { x: CAMERA.x, y: CAMERA.y };
  const rays = cameraRays().map((to): Ray => {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    for (let d = CAMERA.forbiddenRadius; d <= len; d += RAY_STEP) {
      const x = from.x + ((to.x - from.x) * d) / len, y = from.y + ((to.y - from.y) * d) / len;
      if (anyOccupied(placements, x, y)) return { from, to, blockedAt: { x, y } };
    }
    return { from, to, blockedAt: null };
  });
  const blockedCount = rays.filter((r) => r.blockedAt).length;
  return { blocked: blockedCount >= CAMERA.blockedNeeded, blockedCount, rays };
}

export function judgeGap(placements: readonly Placement[]): GapResult {
  const fromX = GAP.left - GAP.support, toX = GAP.right + GAP.support;
  const spanNeeded = toX - fromX;

  // Continuous run starting on the left support, per walk-band row; best row wins.
  let span = 0, bestRow = -1;
  for (let y = FLOOR_Y - GAP.bandAbove; y <= FLOOR_Y + GAP.bandBelow; y++) {
    const run = longestRun(spanNeeded, 1, (col) => anyOccupied(placements, fromX + col + 0.5, y + 0.5));
    const startsOnSupport = anyOccupiedRange(placements, fromX, GAP.left, y);
    const r = startsOnSupport ? run : 0;
    if (r > span) {
      span = r;
      bestRow = y;
    }
  }

  let top = Infinity, bottom = -Infinity;
  for (let y = GAP.laserZoneTop; y <= GAP.laserZoneBottom; y++)
    for (let x = GAP.left; x < GAP.right; x++)
      if (anyOccupied(placements, x + 0.5, y + 0.5)) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  const overGap = top === Infinity ? null : { top, bottom };
  const tripsLaser = overGap !== null && (overGap.top < GAP.slotTop || overGap.bottom >= GAP.slotBottom);
  const spans = span >= spanNeeded;

  let reason: string | null = null;
  if (tripsLaser && overGap) {
    reason = `Too thick — trips the lasers (needs ≤ ${GAP.slotBottom - GAP.slotTop}px, this is ${overGap.bottom - overGap.top + 1}px)`;
  } else if (!spans) {
    reason = span === 0 ? "Nothing spans the gap" : `Doesn't span both ledges (${span}/${spanNeeded}px)`;
  }

  const surfaceY = (x: number) => {
    if (x < GAP.left || x >= GAP.right || bestRow < 0) return FLOOR_Y;
    for (let y = GAP.slotTop; y <= FLOOR_Y + GAP.bandBelow; y++) if (anyOccupied(placements, x + 0.5, y + 0.5)) return y;
    return FLOOR_Y;
  };

  return { bridged: spans && !tripsLaser, span, spanNeeded, overGap, tripsLaser, reason, surfaceY };
}

function anyOccupiedRange(placements: readonly Placement[], x0: number, x1: number, y: number) {
  for (let x = x0; x < x1; x++) if (anyOccupied(placements, x + 0.5, y + 0.5)) return true;
  return false;
}

export function judge(placements: readonly Placement[]): Judgement {
  return { camera: judgeCamera(placements), gap: judgeGap(placements) };
}

/** Why a placement can't be dropped here, or null if it can (PRD §3.2 step 6: red preview). */
export function placementProblem(p: Placement): string | null {
  if (p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height) return "Outside the sketch";
  const g = p.shape.grid;
  // Sample the item's own cells in world space.
  const t = (p.rotationDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  for (let gy = 0; gy < g.height; gy += 2)
    for (let gx = 0; gx < g.width; gx += 2) {
      if (!g.data[gy * g.width + gx]) continue;
      const lx = gx + 0.5 - g.width / 2, ly = gy + 0.5 - g.height / 2;
      const wx = p.x + lx * c - ly * s, wy = p.y + lx * s + ly * c;
      if (Math.hypot(wx - CAMERA.x, wy - CAMERA.y) < CAMERA.forbiddenRadius) return "Too close to the camera";
      for (const r of FORBIDDEN_RECTS)
        if (wx >= r.x && wx < r.x + r.width && wy >= r.y && wy < r.y + r.height) return "Blocks the thief or the vault";
    }
  return null;
}

/**
 * Snap near the gap (PRD §3.2 step 7): rest the item's occupied bottom on the ledges and center
 * it over the gap. Only position changes — whether it bridges is still decided by its mask.
 */
export function snapToLedges(p: Placement): Placement {
  const b = occupiedBounds(p);
  if (b.right < GAP.left - GAP.support || b.left > GAP.right + GAP.support) return p;
  const target = FLOOR_Y + GAP.bandBelow;
  if (Math.abs(b.bottom - target) > SNAP_RANGE + GAP.bandAbove) return p;
  const gapCenter = (GAP.left + GAP.right) / 2, itemCenter = (b.left + b.right) / 2;
  const dx = Math.abs(itemCenter - gapCenter) <= SNAP_CENTER_RANGE ? gapCenter - itemCenter : 0;
  return { ...p, x: p.x + dx, y: p.y + (target - b.bottom) };
}

const SNAP_CENTER_RANGE = 48;
