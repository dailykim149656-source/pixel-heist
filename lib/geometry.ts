import { BASE_MAX_SIDE, GAP_TOLERANCE } from "./stage";

/** Binary mask in its own pixel grid (1 = object). Row-major. */
export type Mask = { width: number; height: number; data: Uint8Array };

/**
 * An extracted object normalized for the game (PRD §3.3): deskewed when elongated, scaled so the
 * longest side is BASE_MAX_SIDE, rasterized to a game-px occupancy grid. `toSource` maps grid
 * space back to mask space so the renderer can draw the photo pixels with the same transform.
 */
export type Shape = {
  grid: Mask;
  deskewDeg: number;
  anisotropy: number;
  toSource: { scale: number; minX: number; minY: number; cx: number; cy: number; thetaRad: number };
  metrics: ShapeMetrics;
};

export type ShapeMetrics = {
  lengthPx: number;
  thicknessPx: number;
  solidity: number;
  aspect: number;
  longestUnbrokenSpanPx: number;
};

const MIN_ANISOTROPY = 2;

export function maskFromAlpha(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array, channels = 4): Mask {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * channels] > 127 ? 1 : 0;
  return { width, height, data };
}

export function normalizeShape(mask: Mask, baseMaxSide = BASE_MAX_SIDE): Shape {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++)
      if (mask.data[y * mask.width + x]) {
        n++;
        sx += x + 0.5;
        sy += y + 0.5;
      }
  if (n === 0) throw new Error("empty mask");
  const cx = sx / n, cy = sy / n;
  let xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++)
      if (mask.data[y * mask.width + x]) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
      }
  const tr = xx + yy, det = xx * yy - xy * xy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const anisotropy = Math.sqrt((tr / 2 + disc) / Math.max(1e-9, tr / 2 - disc));
  const axisDeg = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
  const deskewDeg = anisotropy >= MIN_ANISOTROPY ? axisDeg : 0;

  // Rotate by -deskew around the centroid; bounds come from the rotated pixel corners.
  const thetaRad = (-deskewDeg * Math.PI) / 180;
  const c = Math.cos(thetaRad), s = Math.sin(thetaRad);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++)
      if (mask.data[y * mask.width + x])
        for (const [px, py] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
          const rx = (px - cx) * c - (py - cy) * s, ry = (px - cx) * s + (py - cy) * c;
          if (rx < minX) minX = rx;
          if (rx > maxX) maxX = rx;
          if (ry < minY) minY = ry;
          if (ry > maxY) maxY = ry;
        }
  const scale = baseMaxSide / Math.max(maxX - minX, maxY - minY);
  const width = Math.max(1, Math.round((maxX - minX) * scale));
  const height = Math.max(1, Math.round((maxY - minY) * scale));

  // Inverse-sample each game cell back into the mask.
  const data = new Uint8Array(width * height);
  for (let gy = 0; gy < height; gy++)
    for (let gx = 0; gx < width; gx++) {
      const rx = (gx + 0.5) / scale + minX, ry = (gy + 0.5) / scale + minY;
      const mx = Math.floor(rx * c + ry * s + cx), my = Math.floor(-rx * s + ry * c + cy);
      if (mx >= 0 && my >= 0 && mx < mask.width && my < mask.height && mask.data[my * mask.width + mx]) {
        data[gy * width + gx] = 1;
      }
    }
  const grid = { width, height, data };
  return {
    grid,
    deskewDeg,
    anisotropy,
    toSource: { scale, minX, minY, cx, cy, thetaRad },
    metrics: shapeMetrics(grid),
  };
}

export function shapeMetrics(grid: Mask): ShapeMetrics {
  let filled = 0;
  for (const v of grid.data) filled += v;
  const at = (x: number, y: number) => grid.data[y * grid.width + x];
  return {
    lengthPx: Math.max(grid.width, grid.height),
    thicknessPx: Math.min(grid.width, grid.height),
    solidity: filled / (grid.width * grid.height),
    aspect: Math.max(grid.width, grid.height) / Math.min(grid.width, grid.height),
    longestUnbrokenSpanPx: Math.max(
      longestRun(grid.width, grid.height, (x, y) => at(x, y) === 1),
      longestRun(grid.height, grid.width, (x, y) => at(y, x) === 1),
    ),
  };
}

/** Longest run along the first axis, closing holes of up to GAP_TOLERANCE cells. */
export function longestRun(cols: number, rows: number, get: (col: number, row: number) => boolean): number {
  let best = 0;
  for (let r = 0; r < rows; r++) {
    let start = -1, gap = 0;
    for (let col = 0; col < cols; col++) {
      if (get(col, r)) {
        if (start < 0) start = col;
        gap = 0;
        best = Math.max(best, col - start + 1);
      } else if (start >= 0 && ++gap > GAP_TOLERANCE) {
        start = -1;
        gap = 0;
      }
    }
  }
  return best;
}

/** A shape placed in the world: (x, y) is the grid center, rotation is clockwise degrees. */
export type Placement = { shape: Shape; x: number; y: number; rotationDeg: number };

export function occupiedAt(p: Placement, wx: number, wy: number): boolean {
  const t = (-p.rotationDeg * Math.PI) / 180;
  const dx = wx - p.x, dy = wy - p.y;
  const lx = dx * Math.cos(t) - dy * Math.sin(t) + p.shape.grid.width / 2;
  const ly = dx * Math.sin(t) + dy * Math.cos(t) + p.shape.grid.height / 2;
  const gx = Math.floor(lx), gy = Math.floor(ly);
  const g = p.shape.grid;
  return gx >= 0 && gy >= 0 && gx < g.width && gy < g.height && g.data[gy * g.width + gx] === 1;
}

export function anyOccupied(placements: readonly Placement[], wx: number, wy: number): boolean {
  for (const p of placements) if (occupiedAt(p, wx, wy)) return true;
  return false;
}

/** World-space bounding box of the rotated grid rectangle. */
export function worldBounds(p: Placement) {
  const t = (p.rotationDeg * Math.PI) / 180;
  const hw = p.shape.grid.width / 2, hh = p.shape.grid.height / 2;
  const ex = Math.abs(hw * Math.cos(t)) + Math.abs(hh * Math.sin(t));
  const ey = Math.abs(hw * Math.sin(t)) + Math.abs(hh * Math.cos(t));
  return { left: p.x - ex, right: p.x + ex, top: p.y - ey, bottom: p.y + ey };
}

/** World-space extent of actually occupied cells (tighter than worldBounds). */
export function occupiedBounds(p: Placement) {
  const t = (p.rotationDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const g = p.shape.grid;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let gy = 0; gy < g.height; gy++)
    for (let gx = 0; gx < g.width; gx++)
      if (g.data[gy * g.width + gx])
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const lx = gx + ox - g.width / 2, ly = gy + oy - g.height / 2;
          const wx = p.x + lx * c - ly * s, wy = p.y + lx * s + ly * c;
          if (wx < left) left = wx;
          if (wx > right) right = wx;
          if (wy < top) top = wy;
          if (wy > bottom) bottom = wy;
        }
  return { left, right, top, bottom };
}

/**
 * What a box-only detector would give us: the mask's axis-aligned bounding box in photo space,
 * fully solid and never straightened (without a mask there is no shape to find an axis from).
 * It uses the cut-out's own scale, so in the world it encloses exactly the same pixels.
 */
export function boxShape(mask: Mask, scale: number): Shape {
  const width = Math.max(1, Math.round(mask.width * scale));
  const height = Math.max(1, Math.round(mask.height * scale));
  const grid = { width, height, data: new Uint8Array(width * height).fill(1) };
  return {
    grid,
    deskewDeg: 0,
    anisotropy: Math.max(width, height) / Math.min(width, height),
    toSource: { scale, minX: -mask.width / 2, minY: -mask.height / 2, cx: mask.width / 2, cy: mask.height / 2, thetaRad: 0 },
    metrics: shapeMetrics(grid),
  };
}

/** Where the bounding box sits in the world when the cut-out `shape` is placed at `p`. */
export function boxPlacement(p: Placement, box: Shape): Placement {
  const t = p.shape.toSource;
  // Box center in mask coords → the cut-out's grid (see normalizeShape) → world.
  const dx = box.toSource.cx - t.cx, dy = box.toSource.cy - t.cy;
  const c = Math.cos(t.thetaRad), s = Math.sin(t.thetaRad);
  const gx = t.scale * (dx * c - dy * s - t.minX) - p.shape.grid.width / 2;
  const gy = t.scale * (dx * s + dy * c - t.minY) - p.shape.grid.height / 2;
  const r = (p.rotationDeg * Math.PI) / 180;
  return {
    shape: box,
    x: p.x + gx * Math.cos(r) - gy * Math.sin(r),
    y: p.y + gx * Math.sin(r) + gy * Math.cos(r),
    rotationDeg: p.rotationDeg + (t.thetaRad * 180) / Math.PI,
  };
}
