/**
 * Stage 1 — Museum Sketch Escape. Single source of truth for both drawing and judging
 * (PRD §3.4): every line the player sees is drawn from these numbers.
 * Logical world is 960×540; all values are game px.
 */
export const WORLD = { width: 960, height: 540 } as const;

/** Top surface of the floor the thief walks on. */
export const FLOOR_Y = 430;

export const GAP = {
  left: 430,
  right: 560, // 130px gap
  support: 12, // bridge must reach this far onto each ledge
  bandAbove: 12, // walk band: rows FLOOR_Y - bandAbove … FLOOR_Y + bandBelow
  bandBelow: 4,
  /** Laser slot: over the gap, opaque pixels are only allowed between these rows (48px). */
  slotTop: FLOOR_Y - 40,
  slotBottom: FLOOR_Y + 8,
  /** Laser beams only exist in this vertical range; anything outside it is ignored. */
  laserZoneTop: FLOOR_Y - 120,
  laserZoneBottom: FLOOR_Y + 90,
} as const;

export const CAMERA = {
  x: 600,
  y: 92,
  forbiddenRadius: 80,
  rayCount: 7,
  blockedNeeded: 5,
  /** Rays aim at the thief's torso along the guarded stretch of floor. */
  targetY: FLOOR_Y - 46,
  targetFromX: 150,
  targetToX: 390,
} as const;

export const THIEF = { startX: 60, height: 70 } as const;
export const VAULT = { x: 830, width: 110, height: 150 } as const;

/** Areas an item may not overlap (PRD §3.2 step 6: red preview). */
export const FORBIDDEN_RECTS = [
  { x: THIEF.startX - 40, y: FLOOR_Y - THIEF.height - 10, width: 80, height: THIEF.height + 10 },
  { x: VAULT.x - VAULT.width / 2, y: FLOOR_Y - VAULT.height, width: VAULT.width, height: VAULT.height },
] as const;

export const BASE_MAX_SIDE = 180;
export const GAP_TOLERANCE = 4;
export const ROTATE_STEP_DEG = 15;
export const SNAP_RANGE = 24;
export const MAX_LOOT = 5;
