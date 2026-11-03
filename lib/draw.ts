"use client";

import rough from "roughjs";
import type { Drawable } from "roughjs/bin/core";
import { occupiedBounds, type Placement } from "./geometry";
import type { Judgement } from "./judge";
import { SPRITE_RES } from "./loot";
import { CAMERA, FLOOR_Y, GAP, THIEF, VAULT, WORLD } from "./stage";

export const INK = "#3f3a34";
export const PAPER = "#f7f1e6";
export const ALERT = "#d8372b";
export const OK = "#5fae3c";
export const PICK = "#8c52ff";
export const XRAY = "#ff8c00";

type Sprite = { placement: Placement; sprite: HTMLCanvasElement };

export type Scene = {
  placed: Sprite[];
  candidate: (Sprite & { status: "invalid" | "useful" | "neutral" }) | null;
  live: Judgement; // includes the candidate
  missions: { cameraBlocked: boolean; gapBridged: boolean };
  thief: { x: number; y: number; pose: "idle" | "run" | "caught" | "fell" | "won"; t: number };
  /** X-ray: box-only colliders for the same placements, and how they'd be judged. */
  xray: { boxes: Placement[]; judged: Judgement } | null;
};

let statics: Drawable[] | null = null;

function staticDrawables(): Drawable[] {
  if (statics) return statics;
  const g = rough.generator();
  const pencil = { stroke: INK, strokeWidth: 1.4, roughness: 1.3, seed: 7 };
  const faint = { ...pencil, stroke: "#8b8378", strokeWidth: 1 };
  const d: Drawable[] = [];
  // Museum: two arches and a cornice.
  d.push(g.line(0, 70, WORLD.width, 70, faint));
  for (const cx of [190, 760]) {
    d.push(g.rectangle(cx - 70, 150, 22, FLOOR_Y - 150, faint));
    d.push(g.rectangle(cx + 48, 150, 22, FLOOR_Y - 150, faint));
    d.push(g.arc(cx, 150, 140, 120, Math.PI, Math.PI * 2, false, faint));
  }
  // Floor ledges with hatching.
  const ledge = { ...pencil, fill: "#d9cfbf", fillStyle: "hachure", hachureGap: 9, fillWeight: 0.8 };
  d.push(g.rectangle(-10, FLOOR_Y, GAP.left + 10, WORLD.height - FLOOR_Y + 10, ledge));
  d.push(g.rectangle(GAP.right, FLOOR_Y, WORLD.width - GAP.right + 10, WORLD.height - FLOOR_Y + 10, ledge));
  // Gap: cross-hatched darkness.
  d.push(
    g.rectangle(GAP.left + 4, FLOOR_Y + 14, GAP.right - GAP.left - 8, WORLD.height - FLOOR_Y, {
      ...pencil, stroke: "none", fill: "#5c544a", fillStyle: "cross-hatch", hachureGap: 7,
    }),
  );
  // Laser posts.
  const post = { ...pencil, fill: "#bdb3a4", fillStyle: "solid" };
  for (const x of [GAP.left - 8, GAP.right + 2]) d.push(g.rectangle(x, GAP.slotTop - 10, 6, GAP.slotBottom - GAP.slotTop + 20, post));
  // Vault pedestal and diamond.
  const vx = VAULT.x;
  d.push(g.rectangle(vx - 45, FLOOR_Y - 80, 90, 80, { ...pencil, fill: "#e6dccb", fillStyle: "hachure", hachureGap: 8 }));
  d.push(g.rectangle(vx - 52, FLOOR_Y - 88, 104, 10, pencil));
  d.push(g.polygon([[vx - 26, FLOOR_Y - 120], [vx + 26, FLOOR_Y - 120], [vx + 36, FLOOR_Y - 108], [vx, FLOOR_Y - 92], [vx - 36, FLOOR_Y - 108]], { ...pencil, fill: "#cfe9f5", fillStyle: "solid" }));
  // Camera on its bracket, aimed down-left.
  d.push(g.line(CAMERA.x + 34, 70, CAMERA.x + 20, CAMERA.y - 6, { ...pencil, strokeWidth: 3 }));
  statics = d;
  return d;
}

export function drawScene(canvas: HTMLCanvasElement, scene: Scene) {
  const ctx = canvas.getContext("2d")!;
  const k = canvas.width / WORLD.width;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  paperTexture(ctx);

  const rc = rough.canvas(canvas);
  for (const d of staticDrawables()) rc.draw(d);

  drawLasers(ctx, scene);
  drawRays(ctx, scene.live);
  drawCamera(ctx);

  for (const s of scene.placed) drawSprite(ctx, s, 1);
  if (scene.candidate) {
    drawSprite(ctx, scene.candidate, 0.85);
    outline(ctx, scene.candidate.placement, scene.candidate.status);
  }
  drawWalkSpan(ctx, scene.live);
  if (scene.xray) drawXray(ctx, scene.xray);
  drawThief(ctx, scene.thief);
  stickers(ctx, scene.missions);
}

function paperTexture(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(120, 150, 190, 0.12)";
  ctx.lineWidth = 1;
  for (let y = 28; y < WORLD.height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }
}

function drawCamera(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(CAMERA.x, CAMERA.y);
  const aim = Math.atan2(CAMERA.targetY - CAMERA.y, (CAMERA.targetFromX + CAMERA.targetToX) / 2 - CAMERA.x);
  ctx.rotate(aim);
  ctx.fillStyle = "#ece4d6";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, -6, -14, 50, 28, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ALERT;
  ctx.beginPath();
  ctx.arc(-6, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRays(ctx: CanvasRenderingContext2D, j: Judgement) {
  const rays = j.camera.rays;
  // Soft fan behind the rays.
  ctx.fillStyle = "rgba(216, 55, 43, 0.08)";
  ctx.beginPath();
  ctx.moveTo(CAMERA.x, CAMERA.y);
  for (const r of rays) ctx.lineTo(r.blockedAt?.x ?? r.to.x, r.blockedAt?.y ?? r.to.y);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.6;
  for (const r of rays) {
    ctx.strokeStyle = ALERT;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(r.from.x, r.from.y);
    ctx.lineTo(r.blockedAt?.x ?? r.to.x, r.blockedAt?.y ?? r.to.y);
    ctx.stroke();
    if (r.blockedAt) {
      ctx.strokeStyle = "rgba(63, 58, 52, 0.3)";
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(r.blockedAt.x, r.blockedAt.y);
      ctx.lineTo(r.to.x, r.to.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function drawLasers(ctx: CanvasRenderingContext2D, scene: Scene) {
  const tripped = scene.live.gap.tripsLaser;
  ctx.strokeStyle = tripped ? ALERT : "rgba(216, 55, 43, 0.75)";
  ctx.lineWidth = tripped ? 3 : 2;
  for (const y of [GAP.slotTop, GAP.slotBottom]) {
    ctx.beginPath();
    ctx.moveTo(GAP.left - 2, y);
    ctx.lineTo(GAP.right + 2, y);
    ctx.stroke();
  }
}

function drawWalkSpan(ctx: CanvasRenderingContext2D, j: Judgement) {
  if (j.gap.span === 0 || j.gap.tripsLaser) return;
  const from = GAP.left - GAP.support;
  ctx.strokeStyle = j.gap.span >= j.gap.spanNeeded ? OK : "#e2a400";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from, FLOOR_Y - 2);
  ctx.lineTo(from + j.gap.span, FLOOR_Y - 2);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawXray(ctx: CanvasRenderingContext2D, x: NonNullable<Scene["xray"]>) {
  ctx.save();
  for (const b of x.boxes) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate((b.rotationDeg * Math.PI) / 180);
    const w = b.shape.grid.width, h = b.shape.grid.height;
    ctx.fillStyle = "rgba(255, 140, 0, 0.16)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = XRAY;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Where the box would stop each ray.
  ctx.fillStyle = XRAY;
  for (const r of x.judged.camera.rays)
    if (r.blockedAt) {
      ctx.beginPath();
      ctx.arc(r.blockedAt.x, r.blockedAt.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.font = `18px ${handFont()}`;
  ctx.fillStyle = "#b35c00";
  ctx.fillText("X-RAY — orange = bounding box only", 14, 26);
  ctx.restore();
}

function drawSprite(ctx: CanvasRenderingContext2D, { placement: p, sprite }: Sprite, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rotationDeg * Math.PI) / 180);
  const w = sprite.width / SPRITE_RES, h = sprite.height / SPRITE_RES;
  // Cream cut edge + soft paper shadow (PRD §4.3). The photo pixels themselves stay untouched.
  ctx.filter = "drop-shadow(0 0 1.5px #fffaf0) drop-shadow(0 0 1px #fffaf0) drop-shadow(3px 4px 3px rgba(40,30,20,0.28))";
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  ctx.filter = "none";
  // Masking tape (why nothing falls: it's taped to the page).
  ctx.fillStyle = "rgba(240, 222, 150, 0.75)";
  ctx.rotate(-0.12);
  ctx.fillRect(-16, -h / 2 - 7, 32, 13);
  ctx.restore();
}

function outline(ctx: CanvasRenderingContext2D, p: Placement, status: "invalid" | "useful" | "neutral") {
  const b = occupiedBounds(p);
  ctx.save();
  ctx.strokeStyle = status === "invalid" ? ALERT : status === "useful" ? OK : "rgba(63,58,52,0.5)";
  ctx.lineWidth = status === "neutral" ? 1.5 : 3;
  ctx.setLineDash([7, 5]);
  roundRect(ctx, b.left - 5, b.top - 5, b.right - b.left + 10, b.bottom - b.top + 10, 8);
  ctx.stroke();
  ctx.restore();
}

function drawThief(ctx: CanvasRenderingContext2D, thief: Scene["thief"]) {
  const { x, pose, t } = thief;
  let y = thief.y;
  if (pose === "fell") y += Math.min(160, t * 0.5);
  ctx.save();
  ctx.translate(x, y);
  if (pose === "fell") ctx.rotate(Math.min(1.2, t / 300));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  const stride = pose === "run" ? Math.sin(t / 70) * 14 : 0;
  // legs, body, arms
  line(ctx, 0, -30, -8 - stride, 0);
  line(ctx, 0, -30, 8 + stride, 0);
  line(ctx, 0, -30, 2, -55);
  const armUp = pose === "won" || pose === "caught" ? -22 : 0;
  line(ctx, 1, -50, -14 + stride * 0.6, -36 + armUp);
  line(ctx, 1, -50, 16 - stride * 0.6, -38 + armUp);
  // head + mask band
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(3, -66, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(-8, -70, 22, 6);
  // loot sack
  ctx.fillStyle = "#cbbfa9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-12, -48, 9, 11, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (pose === "caught") {
    ctx.fillStyle = "rgba(216, 55, 43, 0.12)";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }
}

function stickers(ctx: CanvasRenderingContext2D, m: Scene["missions"]) {
  if (m.cameraBlocked) sticker(ctx, CAMERA.x - 190, CAMERA.y - 50, "Camera blocked ✓");
  if (m.gapBridged) sticker(ctx, GAP.left - 10, FLOOR_Y + 40, "Bridge ✓");
}

function sticker(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.06);
  ctx.font = `17px ${handFont()}`;
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = "#e8f7d8";
  ctx.strokeStyle = OK;
  ctx.lineWidth = 2;
  roundRect(ctx, 0, 0, w, 30, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2f6d17";
  ctx.fillText(text, 11, 21);
  ctx.restore();
}

let resolvedHand: string | null = null;
/** Canvas can't read CSS variables, so resolve next/font's family name once. */
function handFont() {
  resolvedHand ??= getComputedStyle(document.documentElement).getPropertyValue("--font-hand").trim() || "cursive";
  return resolvedHand;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export const THIEF_START = { x: THIEF.startX, y: FLOOR_Y };
