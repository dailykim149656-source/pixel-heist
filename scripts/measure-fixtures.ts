/**
 * Measures SAM fixture masks the way the game will (PRD §3.3–3.4):
 * principal-axis deskew (only when anisotropic), normalize longest side to 180 game px,
 * then report thickness and the longest unbroken horizontal span (4px gap tolerance).
 *
 *   npm run measure:fixtures            # all fixtures/sam/*
 *   npm run measure:fixtures -- mug     # selected fixtures
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = "fixtures/sam";
const BASE_MAX_SIDE = 180;
const GAP_TOLERANCE = 4;
const MIN_ANISOTROPY = 2;

async function measure(name: string) {
  const { data, info } = await sharp(path.join(ROOT, name, "mask.png"))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const on = (x: number, y: number) => data[(y * info.width + x) * info.channels] > 127;

  const pixels: [number, number][] = [];
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (on(x, y)) pixels.push([x, y]);
  const cx = pixels.reduce((a, p) => a + p[0], 0) / pixels.length;
  const cy = pixels.reduce((a, p) => a + p[1], 0) / pixels.length;
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of pixels) {
    xx += (x - cx) ** 2;
    yy += (y - cy) ** 2;
    xy += (x - cx) * (y - cy);
  }
  // eigenvalues of the covariance matrix → anisotropy (ratio of std devs)
  const tr = xx + yy, det = xx * yy - xy * xy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const anisotropy = Math.sqrt((tr / 2 + disc) / Math.max(1e-9, tr / 2 - disc));
  const axisDeg = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
  const deskewDeg = anisotropy >= MIN_ANISOTROPY ? axisDeg : 0;

  const t = (-deskewDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const rotated = pixels.map(([x, y]) => [(x - cx) * c - (y - cy) * s, (x - cx) * s + (y - cy) * c]);
  const minX = Math.min(...rotated.map((p) => p[0])), maxX = Math.max(...rotated.map((p) => p[0]));
  const minY = Math.min(...rotated.map((p) => p[1])), maxY = Math.max(...rotated.map((p) => p[1]));
  const k = BASE_MAX_SIDE / Math.max(maxX - minX, maxY - minY);
  const w = Math.ceil((maxX - minX) * k) + 1, h = Math.ceil((maxY - minY) * k) + 1;
  // Inverse-sample each game cell back into the mask (scattering leaves holes when upscaling).
  const grid = new Uint8Array(w * h);
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const rx = (gx + 0.5) / k + minX, ry = (gy + 0.5) / k + minY;
      const sx = Math.floor(rx * c + ry * s + cx), sy = Math.floor(-rx * s + ry * c + cy);
      if (sx >= 0 && sy >= 0 && sx < info.width && sy < info.height && on(sx, sy)) grid[gy * w + gx] = 1;
    }
  }

  const longestSpan = (cols: number, rows: number, get: (col: number, row: number) => number) => {
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
  };
  const filled = grid.reduce((a, v) => a + v, 0);
  return {
    name,
    anisotropy: anisotropy.toFixed(1),
    deskewDeg: deskewDeg.toFixed(1),
    game: `${w}×${h}`,
    thickness: Math.min(w, h),
    solidity: `${Math.round((filled / (w * h)) * 100)}%`,
    span0: longestSpan(w, h, (col, r) => grid[r * w + col]),
    span90: longestSpan(h, w, (col, r) => grid[col * w + r]),
  };
}

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name);
console.table(await Promise.all(names.map(measure)));
