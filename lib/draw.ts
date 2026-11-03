"use client";

import rough from "roughjs";
import type { Drawable } from "roughjs/bin/core";
import { occupiedBounds, type Placement } from "./geometry";
import { gapLineY, type Judgement } from "./judge";
import { SPRITE_RES } from "./loot";
import { WORLD } from "./stage";
import type { Camera, Gap, Stage } from "./stages";

export const INK = "#3f3a34";
export const PAPER = "#f7f1e6";
export const ALERT = "#d8372b";
export const OK = "#5fae3c";
export const PICK = "#8c52ff";
export const XRAY = "#ff8c00";

type Sprite = { placement: Placement; sprite: HTMLCanvasElement };

export type Scene = {
  stage: Stage;
  placed: Sprite[];
  candidate: (Sprite & { status: "invalid" | "useful" | "neutral" }) | null;
  live: Judgement; // includes the candidate
  settled: Judgement; // placed items only
  thief: { x: number; y: number; pose: "idle" | "run" | "caught" | "fell" | "stuck" | "won"; t: number };
  /** X-ray: box-only colliders for the same placements, and how they'd be judged. */
  xray: { boxes: Placement[]; judged: Judgement } | null;
};

const statics = new Map<number, Drawable[]>();

function floorY(stage: Stage, x: number) {
  return stage.floors.find((f) => x >= f.x0 && x <= f.x1)?.y ?? stage.floors[0].y;
}

function staticDrawables(stage: Stage): Drawable[] {
  const cached = statics.get(stage.id);
  if (cached) return cached;
  const g = rough.generator();
  const pencil = { stroke: INK, strokeWidth: 1.4, roughness: 1.3, seed: 7 + stage.id };
  const faint = { ...pencil, stroke: "#8b8378", strokeWidth: 1 };
  const d: Drawable[] = [];
  // Museum backdrop: cornice and two arches.
  d.push(g.line(0, 70, WORLD.width, 70, faint));
  for (const cx of [190, 760]) {
    const fy = floorY(stage, cx);
    d.push(g.rectangle(cx - 70, 150, 22, fy - 150, faint));
    d.push(g.rectangle(cx + 48, 150, 22, fy - 150, faint));
    d.push(g.arc(cx, 150, 140, 120, Math.PI, Math.PI * 2, false, faint));
  }
  // Floors with hatching.
  const ledge = { ...pencil, fill: "#d9cfbf", fillStyle: "hachure", hachureGap: 9, fillWeight: 0.8 };
  for (const f of stage.floors) d.push(g.rectangle(f.x0, f.y, f.x1 - f.x0, WORLD.height - f.y + 10, ledge));
  // Gaps: cross-hatched darkness and laser posts.
  const post = { ...pencil, fill: "#bdb3a4", fillStyle: "solid" };
  for (const gp of stage.gaps) {
    const top = Math.max(gp.yLeft, gp.yRight) + 14;
    d.push(g.rectangle(gp.left + 4, top, gp.right - gp.left - 8, WORLD.height - top, { ...pencil, stroke: "none", fill: "#5c544a", fillStyle: "cross-hatch", hachureGap: 7 }));
    d.push(g.rectangle(gp.left - 8, gp.yLeft - gp.slotAbove - 10, 6, gp.slotAbove + gp.slotBelow + 20, post));
    d.push(g.rectangle(gp.right + 2, gp.yRight - gp.slotAbove - 10, 6, gp.slotAbove + gp.slotBelow + 20, post));
  }
  // Vault pedestal and diamond.
  const vx = stage.vaultX, vy = floorY(stage, vx);
  d.push(g.rectangle(vx - 45, vy - 80, 90, 80, { ...pencil, fill: "#e6dccb", fillStyle: "hachure", hachureGap: 8 }));
  d.push(g.rectangle(vx - 52, vy - 88, 104, 10, pencil));
  d.push(g.polygon([[vx - 26, vy - 120], [vx + 26, vy - 120], [vx + 36, vy - 108], [vx, vy - 92], [vx - 36, vy - 108]], { ...pencil, fill: "#cfe9f5", fillStyle: "solid" }));
  // Camera brackets.
  for (const c of stage.cameras) d.push(g.line(c.x + 34, 70, c.x + 20, c.y - 6, { ...pencil, strokeWidth: 3 }));
  // Door frames.
  for (const door of stage.doors) {
    const fy = floorY(stage, door.x);
    d.push(g.rectangle(door.x - 16, fy - 150, 32, 150, { ...pencil, strokeWidth: 2 }));
  }
  statics.set(stage.id, d);
  return d;
}

export function drawScene(canvas: HTMLCanvasElement, scene: Scene) {
  const { stage } = scene;
  const ctx = canvas.getContext("2d")!;
  const k = canvas.width / WORLD.width;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  paperTexture(ctx);

  const rc = rough.canvas(canvas);
  for (const d of staticDrawables(stage)) rc.draw(d);

  stage.plates.forEach((p, i) => drawPlate(ctx, p, scene.live.plates[i].covered));
  stage.hooks.forEach((h) => drawHook(ctx, h, stage));
  stage.doors.forEach((d) => drawDoor(ctx, d.x, floorY(stage, d.x), scene.live.doors[d.id]));
  stage.gaps.forEach((g, i) => drawLasers(ctx, g, scene.live.gaps[i].tripsLaser));
  stage.beams.forEach((b, i) => drawBeam(ctx, b, scene.live.beams[i]));
  stage.cameras.forEach((c, i) => {
    drawRays(ctx, c, scene.live.cameras[i].rays);
    drawCamera(ctx, c);
  });

  for (const s of scene.placed) drawSprite(ctx, s, 1);
  if (scene.candidate) {
    drawSprite(ctx, scene.candidate, 0.85);
    outline(ctx, scene.candidate.placement, scene.candidate.status);
  }
  stage.gaps.forEach((g, i) => drawWalkSpan(ctx, g, scene.live.gaps[i]));
  if (scene.xray) drawXray(ctx, scene.xray);
  drawThief(ctx, scene.thief);
  stickers(ctx, scene);
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

function drawCamera(ctx: CanvasRenderingContext2D, c: Camera) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.atan2(c.targetY - c.y, (c.fromX + c.toX) / 2 - c.x));
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

function drawRays(ctx: CanvasRenderingContext2D, c: Camera, rays: Judgement["cameras"][number]["rays"]) {
  ctx.fillStyle = "rgba(216, 55, 43, 0.08)";
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
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

function drawLasers(ctx: CanvasRenderingContext2D, g: Gap, tripped: boolean) {
  ctx.strokeStyle = tripped ? ALERT : "rgba(216, 55, 43, 0.75)";
  ctx.lineWidth = tripped ? 3 : 2;
  for (const off of [-g.slotAbove, g.slotBelow]) {
    ctx.beginPath();
    ctx.moveTo(g.left - 2, g.yLeft + off);
    ctx.lineTo(g.right + 2, g.yRight + off);
    ctx.stroke();
  }
}

const BEAM = "#d63aa0";

/** Sensor beam: an emitter, a receiver and a dashed wire; flashes where something touches it. */
function drawBeam(ctx: CanvasRenderingContext2D, b: Stage["beams"][number], r: Judgement["beams"][number]) {
  ctx.save();
  ctx.strokeStyle = r.tripped ? ALERT : BEAM;
  ctx.lineWidth = r.tripped ? 3 : 2;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.moveTo(b.x0, b.y0);
  ctx.lineTo(b.x1, b.y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#efe3ea";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y1]]) {
    roundRect(ctx, x - 6, y - 9, 12, 18, 3);
    ctx.fill();
    ctx.stroke();
  }
  if (r.at) {
    ctx.fillStyle = "rgba(216, 55, 43, 0.35)";
    ctx.beginPath();
    ctx.arc(r.at.x, r.at.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `16px ${handFont()}`;
    ctx.fillStyle = ALERT;
    ctx.fillText("ALARM!", r.at.x + 12, r.at.y - 12);
  }
  ctx.restore();
}

function drawWalkSpan(ctx: CanvasRenderingContext2D, g: Gap, r: Judgement["gaps"][number]) {
  if (r.span === 0 || r.tripsLaser) return;
  const from = g.left - g.support, to = from + r.span;
  ctx.strokeStyle = r.span >= r.spanNeeded ? OK : "#e2a400";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from, gapLineY(g, from) - 2);
  ctx.lineTo(to, gapLineY(g, to) - 2);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawPlate(ctx: CanvasRenderingContext2D, p: Stage["plates"][number], covered: boolean) {
  ctx.save();
  ctx.fillStyle = covered ? "#bfe3a6" : "#e9c46a";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, p.x, p.y - (covered ? 3 : 8), p.width, covered ? 6 : 10, 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `13px ${handFont()}`;
  ctx.fillStyle = INK;
  ctx.fillText("PLATE", p.x + p.width / 2 - 18, p.y + 22);
  ctx.restore();
}

function drawHook(ctx: CanvasRenderingContext2D, h: Stage["hooks"][number], stage: Stage) {
  const door = stage.doors.find((d) => d.id === h.opens);
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  // Rope from the ceiling through a pulley to the gate.
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(h.x, 70);
  ctx.lineTo(h.x, h.y - 14);
  if (door) {
    ctx.moveTo(h.x, 70);
    ctx.lineTo(door.x, 70);
    ctx.lineTo(door.x, floorY(stage, door.x) - 150);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // The hook itself: a J that the hole must slip over.
  ctx.beginPath();
  ctx.moveTo(h.x, h.y - 14);
  ctx.lineTo(h.x, h.y + 4);
  ctx.arc(h.x - 7, h.y + 4, 7, 0, Math.PI, false);
  ctx.stroke();
  ctx.restore();
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, fy: number, open: boolean) {
  ctx.save();
  const lift = open ? 120 : 0;
  ctx.strokeStyle = open ? "rgba(63,58,52,0.35)" : INK;
  ctx.lineWidth = 3;
  for (let bx = x - 10; bx <= x + 10; bx += 7) {
    ctx.beginPath();
    ctx.moveTo(bx, fy - 148);
    ctx.lineTo(bx, fy - lift);
    ctx.stroke();
  }
  ctx.restore();
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
  for (const cam of x.judged.cameras)
    for (const r of cam.rays)
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
  line(ctx, 0, -30, -8 - stride, 0);
  line(ctx, 0, -30, 8 + stride, 0);
  line(ctx, 0, -30, 2, -55);
  const armUp = pose === "won" || pose === "caught" ? -22 : 0;
  line(ctx, 1, -50, -14 + stride * 0.6, -36 + armUp);
  line(ctx, 1, -50, 16 - stride * 0.6, -38 + armUp);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(3, -66, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(-8, -70, 22, 6);
  ctx.fillStyle = "#cbbfa9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-12, -48, 9, 11, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (pose === "stuck") {
    ctx.font = `20px ${handFont()}`;
    ctx.fillStyle = INK;
    ctx.fillText("?!", 12, -82);
  }
  ctx.restore();
  if (pose === "caught") {
    ctx.fillStyle = "rgba(216, 55, 43, 0.12)";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }
}

function stickers(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { stage, settled } = scene;
  stage.cameras.forEach((c, i) => settled.cameras[i].blocked && sticker(ctx, c.x - 190, c.y - 50, "Camera blocked ✓"));
  stage.gaps.forEach((g, i) => settled.gaps[i].bridged && sticker(ctx, g.left - 10, Math.max(g.yLeft, g.yRight) + 40, "Bridge ✓"));
  stage.plates.forEach((p, i) => settled.plates[i].covered && sticker(ctx, p.x, p.y + 40, "Plate down ✓"));
  stage.hooks.forEach((h, i) => settled.hooks[i].hung && sticker(ctx, h.x + 20, h.y - 60, "Hooked ✓"));
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

