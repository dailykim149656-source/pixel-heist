/** Global game constants. Per-stage layouts live in lib/stages.ts. All values are game px. */
export const WORLD = { width: 960, height: 540 } as const;

export const BASE_MAX_SIDE = 180;
export const GAP_TOLERANCE = 4;
export const ROTATE_STEP_DEG = 15;
export const SNAP_RANGE = 24;
export const MAX_LOOT = 5;

export const THIEF = { startX: 60, height: 70 } as const;
export const VAULT_SIZE = { width: 110, height: 150 } as const;
