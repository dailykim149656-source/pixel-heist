"use client";

import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import { ALERT, INK, PAPER, PICK } from "./draw";

/** Pencil doodles for the prologue and ending comics (one 480×320 panel each). Speech is HTML, not canvas. */
export const PANEL = { width: 480, height: 320 } as const;

export type Pen = { ctx: CanvasRenderingContext2D; rc: RoughCanvas; seed: number };
const pencil = (seed: number, more: object = {}) => ({ stroke: INK, strokeWidth: 1.6, roughness: 1.4, seed, ...more });

export function drawPanel(canvas: HTMLCanvasElement, draw: (pen: Pen) => void, seed: number) {
  const ctx = canvas.getContext("2d")!;
  const k = canvas.width / PANEL.width;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PANEL.width, PANEL.height);
  draw({ ctx, rc: rough.canvas(canvas), seed });
}

/** The thief, matching the in-game figure: beret, round head, loot bag. */
export function thief(pen: Pen, x: number, y: number, s = 1.6, pose: "stand" | "phone" | "point" | "sneak" | "cheer" | "sit" | "hold" = "stand") {
  const { ctx } = pen;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  const legs = pose === "sneak" ? 10 : 7;
  if (pose === "sit") {
    seg(ctx, 0, -30, 16, -28);
    seg(ctx, 16, -28, 18, 0);
    seg(ctx, 0, -30, 12, -26);
    seg(ctx, 12, -26, 10, 0);
  } else {
    seg(ctx, 0, -30, -legs, 0);
    seg(ctx, 0, -30, legs, 0);
  }
  seg(ctx, 0, -30, 2, -55);
  if (pose === "phone") {
    seg(ctx, 1, -50, 10, -58);
    seg(ctx, 10, -58, 12, -66);
    ctx.fillStyle = INK;
    ctx.fillRect(9, -74, 7, 12);
  } else if (pose === "point") {
    seg(ctx, 1, -50, 26, -60);
  } else if (pose === "cheer") {
    seg(ctx, 1, -50, 16, -78);
  } else if (pose === "hold") {
    seg(ctx, 1, -50, 18, -50);
    seg(ctx, 18, -50, 20, -58);
  } else {
    seg(ctx, 1, -50, 14, -36);
  }
  if (pose === "cheer") seg(ctx, 1, -50, -12, -76);
  else seg(ctx, 1, -50, -14, -36);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(3, -66, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(-8, -70, 22, 6);
  ctx.beginPath();
  ctx.arc(7, -64, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cbbfa9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-12, -48, 9, 11, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Sam on a phone screen: the scissors avatar and an honest label. Sam is a model, not a person. */
export function phone(pen: Pen, x: number, y: number, w = 120, h = 200) {
  const { ctx, rc, seed } = pen;
  rc.rectangle(x, y, w, h, pencil(seed, { fill: "#2f2b27", fillStyle: "solid", strokeWidth: 2 }));
  ctx.fillStyle = "#fbf9f4";
  ctx.beginPath();
  ctx.roundRect(x + 7, y + 14, w - 14, h - 28, 6);
  ctx.fill();
  const cx = x + w / 2, cy = y + 14 + (h - 28) * 0.38, r = Math.min(w, h) * 0.2;
  rc.circle(cx, cy, r * 2, { ...pencil(seed + 1), stroke: PICK, fill: "#efe6ff", fillStyle: "solid", strokeWidth: 2 });
  ctx.fillStyle = PICK;
  ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✂", cx, cy + 1);
  ctx.fillStyle = INK;
  ctx.font = `${Math.round(r * 0.75)}px ${hand()}`;
  ctx.fillText("Sam", cx, cy + r + r * 0.7);
  ctx.fillStyle = "#7a7268";
  ctx.font = `${Math.max(9, Math.round(r * 0.36))}px sans-serif`;
  ctx.fillText(w >= 90 ? "AI model · Meta SAM 3.1" : "SAM 3.1", cx, cy + r + r * 1.35);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export function museum(pen: Pen, x: number, y: number, w: number, h: number) {
  const { rc, ctx, seed } = pen;
  const p = pencil(seed);
  rc.polygon([[x - 10, y + 50], [x + w / 2, y], [x + w + 10, y + 50]], { ...p, fill: "#e6dccb", fillStyle: "hachure", hachureGap: 8 });
  rc.rectangle(x - 14, y + 50, w + 28, 12, p);
  const cols = 5;
  for (let i = 0; i < cols; i++) {
    const cx = x + 8 + (i * (w - 16)) / (cols - 1);
    rc.rectangle(cx - 8, y + 62, 16, h - 82, { ...p, strokeWidth: 1.2 });
  }
  rc.rectangle(x - 20, y + h - 20, w + 40, 20, { ...p, fill: "#d9cfbf", fillStyle: "hachure", hachureGap: 7 });
  ctx.fillStyle = INK;
  ctx.font = `15px ${hand()}`;
  ctx.textAlign = "center";
  ctx.fillText("SKETCH MUSEUM", x + w / 2, y + 44);
  ctx.textAlign = "start";
}

export function moon(pen: Pen, x: number, y: number) {
  pen.rc.circle(x, y, 44, pencil(pen.seed, { fill: "#fff3b0", fillStyle: "solid" }));
  for (const [sx, sy] of [[x - 120, y + 10], [x - 60, y + 40], [x + 50, y + 30], [x - 180, y - 10]]) {
    pen.ctx.fillStyle = INK;
    pen.ctx.font = "12px sans-serif";
    pen.ctx.fillText("✦", sx, sy);
  }
}

export function diamond(pen: Pen, x: number, y: number, s = 1, real = false) {
  pen.rc.polygon(
    [[x - 26 * s, y - 28 * s], [x + 26 * s, y - 28 * s], [x + 36 * s, y - 16 * s], [x, y], [x - 36 * s, y - 16 * s]],
    pencil(pen.seed, { fill: real ? "#7fd3f7" : "#cfe9f5", fillStyle: real ? "solid" : "hachure", hachureGap: 5 }),
  );
}

/** Pencil camera with its red cone of rays. */
export function camera(pen: Pen, x: number, y: number, toX: number, toY: number) {
  const { ctx, rc, seed } = pen;
  ctx.strokeStyle = "rgba(216, 55, 43, 0.55)";
  ctx.lineWidth = 1.4;
  for (let i = -3; i <= 3; i++) seg(ctx, x - 20, y + 8, toX + i * 14, toY);
  rc.rectangle(x - 24, y - 8, 50, 26, pencil(seed, { fill: "#d9cfbf", fillStyle: "solid" }));
  rc.circle(x - 24, y + 5, 14, pencil(seed + 1, { fill: ALERT, fillStyle: "solid" }));
}

/** Laser posts and the beams between them. */
export function lasers(pen: Pen, x0: number, x1: number, y: number) {
  const { ctx, rc, seed } = pen;
  rc.rectangle(x0 - 6, y - 60, 8, 70, pencil(seed, { fill: "#bdb3a4", fillStyle: "solid" }));
  rc.rectangle(x1 - 2, y - 60, 8, 70, pencil(seed + 1, { fill: "#bdb3a4", fillStyle: "solid" }));
  ctx.strokeStyle = ALERT;
  ctx.lineWidth = 2;
  for (const dy of [-50, -30, 4]) seg(ctx, x0, y + dy, x1, y + dy);
}

/** A desk strewn with real photos (tinted rectangles with small doodles of what's in them). */
export function photoDesk(pen: Pen, x: number, y: number, w: number) {
  const { ctx, rc, seed } = pen;
  rc.rectangle(x, y, w, 14, pencil(seed, { fill: "#c9b79c", fillStyle: "solid" }));
  rc.line(x + 16, y + 14, x + 16, y + 90, pencil(seed));
  rc.line(x + w - 16, y + 14, x + w - 16, y + 90, pencil(seed));
  const photos: [number, number, number][] = [[x + 20, y - 46, -0.12], [x + 84, y - 52, 0.08], [x + 148, y - 44, -0.04]];
  photos.forEach(([px, py, rot], i) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.fillRect(0, 0, 54, 44);
    ctx.strokeRect(0, 0, 54, 44);
    ctx.fillStyle = ["#b9d7e8", "#e8d3b9", "#d5e8b9"][i];
    ctx.fillRect(4, 4, 46, 30);
    ctx.strokeStyle = "#5c544a";
    if (i === 0) { // mug
      ctx.strokeRect(17, 12, 14, 16);
      ctx.beginPath();
      ctx.arc(33, 20, 5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    } else if (i === 1) { // ruler
      ctx.strokeRect(8, 17, 38, 6);
    } else { // scissors
      ctx.beginPath();
      ctx.arc(18, 24, 4, 0, Math.PI * 2);
      ctx.arc(28, 24, 4, 0, Math.PI * 2);
      ctx.moveTo(20, 20);
      ctx.lineTo(36, 8);
      ctx.moveTo(26, 20);
      ctx.lineTo(14, 8);
      ctx.stroke();
    }
    ctx.restore();
  });
}

/** "Boxes lie": a ruler's real outline next to the brick its bounding box would make (tilted). */
export function maskVsBox(pen: Pen, x: number, y: number) {
  const { ctx, rc, seed } = pen;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5);
  ctx.fillStyle = "#e8c66a";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillRect(-90, -9, 180, 18);
  ctx.strokeRect(-90, -9, 180, 18);
  ctx.lineWidth = 1;
  for (let i = -80; i <= 80; i += 10) seg(ctx, i, -9, i, i % 50 === 0 ? 2 : -3);
  ctx.restore();
  const c = Math.cos(-0.5), s = Math.sin(-0.5);
  const hw = Math.abs(90 * c) + Math.abs(9 * s), hh = Math.abs(90 * s) + Math.abs(9 * c);
  rc.rectangle(x - hw, y - hh, hw * 2, hh * 2, { ...pencil(seed), stroke: "#ff8c00", strokeWidth: 2.2, strokeLineDash: [8, 6] });
}

/** Prison bars across a rectangle, with a crossbar. */
export function bars(pen: Pen, x: number, y: number, w: number, h: number, n = 7) {
  const p = pencil(pen.seed, { strokeWidth: 3 });
  for (let i = 0; i <= n; i++) pen.rc.line(x + (i * w) / n, y, x + (i * w) / n, y + h, p);
  pen.rc.line(x, y + 8, x + w, y + 8, p);
  pen.rc.line(x, y + h * 0.55, x + w, y + h * 0.55, p);
}

/** Alarm lights: red wedges fanning out of a dome. */
export function siren(pen: Pen, x: number, y: number) {
  const { ctx, rc, seed } = pen;
  ctx.fillStyle = "rgba(216, 55, 43, 0.18)";
  for (const a of [-2.4, -0.7]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 160, a - 0.35, a + 0.35);
    ctx.fill();
  }
  rc.arc(x, y + 6, 36, 36, Math.PI, Math.PI * 2, true, pencil(seed, { fill: ALERT, fillStyle: "solid" }));
}

/** The Muse charm: a small star pendant on a cord, glowing faintly. */
export function charm(pen: Pen, x: number, y: number, s = 1, glow = true) {
  const { ctx, rc, seed } = pen;
  if (glow) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 70 * s);
    g.addColorStop(0, "rgba(140, 82, 255, 0.45)");
    g.addColorStop(1, "rgba(140, 82, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 70 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  rc.line(x, y - 22 * s, x - 8 * s, y - 60 * s, pencil(seed, { strokeWidth: 1.2 }));
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 9 : 22) * s, a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
  }
  rc.polygon(pts, pencil(seed + 1, { fill: "#d9c6ff", fillStyle: "solid", stroke: PICK, strokeWidth: 2 }));
}

/** Fill the panel with night: the cliffhanger's last frame. */
export function darkness(pen: Pen) {
  pen.ctx.fillStyle = "#26221e";
  pen.ctx.fillRect(0, 0, PANEL.width, PANEL.height);
}

function seg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

let resolvedHand: string | null = null;
function hand() {
  resolvedHand ??= getComputedStyle(document.documentElement).getPropertyValue("--font-hand").trim() || "cursive";
  return resolvedHand;
}
