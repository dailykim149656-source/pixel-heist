import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Placement } from "../lib/geometry";
import { judge, judgeBeam, placementProblem, snapPlacement } from "../lib/judge";
import { stageById } from "../lib/stages";
import { cameraCandidates, first, gapPlacements, hookCandidates, loadFixtureShape, plateCandidates } from "../tests/fixtures";
import { compileRoom, type RoomSpec } from "../lib/curator";
import { findPlan } from "../lib/solver";
import { STAGES } from "../lib/stages";

/**
 * Desktop footage for the demo video (docs/DEMO_SCRIPT.md). One test per scene, one video each.
 * Paced for viewers: slow drags, pauses on the moments that matter. Uses recorded SAM cuts only.
 */
const SAMPLE = { width: 1448, height: 1086 };
const A = { mug: { x: 260, y: 410 }, ruler: { x: 330, y: 790 } };
const B = { pen: { x: 688, y: 700 }, calc: { x: 1140, y: 448 }, sticky: { x: 1160, y: 900 }, scissors: { x: 872, y: 860 } };
const shape = {
  mug: loadFixtureShape("mug"), ruler: loadFixtureShape("ruler"), pen: loadFixtureShape("d2-pen"),
  calc: loadFixtureShape("d2-calculator"), sticky: loadFixtureShape("d2-sticky"), scissors: loadFixtureShape("d2-scissors"),
};

/** Headless video has no pointer, so draw one. */
async function withCursor(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const c = document.createElement("div");
      c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:99999;pointer-events:none;transition:transform 60ms linear";
      c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.5 L10.5 20 L13 19 L10 12.5 L16 12.5 Z" fill="#fff" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
      const move = (e: PointerEvent) => (c.style.left = `${e.clientX}px`, c.style.top = `${e.clientY}px`);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerdown", (e) => { move(e); c.style.transform = "scale(0.8)"; }, true);
      window.addEventListener("pointerup", () => (c.style.transform = ""), true);
    });
  });
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

// The video has no sound; the game notes each sound it plays, and make-demo.mjs mixes them back in
// at the same moments. t0 ≈ when the page (and its video) started.
let t0 = 0;
test.beforeEach(async ({ page }) => {
  t0 = Date.now();
  await page.addInitScript(() => ((window as unknown as { __audioLog: unknown[] }).__audioLog = []));
});
test.afterEach(async ({ page }, info) => {
  const log = await page.evaluate(() => (window as unknown as { __audioLog?: unknown[] }).__audioLog ?? []).catch(() => []);
  writeFileSync(info.outputPath("audio.json"), JSON.stringify({ t0, log }));
});

async function glide(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 25 });
}

async function clickEl(page: Page, loc: ReturnType<Page["locator"]>) {
  const b = (await loc.boundingBox())!;
  await glide(page, b.x + b.width / 2, b.y + b.height / 2);
  await pause(page, 250);
  await loc.click();
}

async function photoPoint(page: Page, p: { x: number; y: number }) {
  const b = (await page.locator(".photo-box").boundingBox())!;
  const s = Math.min(b.width / SAMPLE.width, b.height / SAMPLE.height);
  return { x: b.x + (b.width - SAMPLE.width * s) / 2 + (p.x + 0.5) * s, y: b.y + (b.height - SAMPLE.height * s) / 2 + (p.y + 0.5) * s };
}

async function worldPoint(page: Page, x: number, y: number) {
  const b = (await page.locator("canvas.world").boundingBox())!;
  return { x: b.x + (x / 960) * b.width, y: b.y + (y / 540) * b.height };
}

async function openGame(page: Page, stage: number, desk: "A" | "B") {
  await withCursor(page);
  await page.addInitScript(() => localStorage.setItem("pixel-heist.unlocked", "10"));
  await page.goto("/");
  await page.getByRole("button", { name: "▶ Play the Heist" }).click();
  await page.getByRole("button", { name: "Skip ⏭" }).click();
  await page.locator(".stage-chip select").selectOption(String(stage));
  await page.getByRole("button", { name: `Try Sample Desk ${desk}` }).click();
  await expect(page.locator(".photo-box img")).toBeVisible();
  await page.getByRole("radio", { name: "Recorded" }).click();
  await page.mouse.move(800, 450);
  await pause(page, 800);
}

async function steal(page: Page, at: { x: number; y: number }) {
  const p = await photoPoint(page, at);
  await glide(page, p.x, p.y);
  await pause(page, 300);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".geo-card")).toBeVisible();
  await pause(page, 1600); // the mask overlay and geometry card
  await clickEl(page, page.getByRole("button", { name: "Extract ✂" }));
  await expect(page.locator(".geo-card")).toBeHidden();
  await pause(page, 500);
}

/** Drag loot slot `index` to placement p, turning it (R) on the way when p is rotated. */
async function place(page: Page, index: number, p: Placement) {
  const slot = (await page.locator(".slot-grab").nth(index).boundingBox())!;
  const target = await worldPoint(page, p.x, p.y - p.shape.grid.height / 2 + 10);
  await glide(page, slot.x + slot.width / 2, slot.y + slot.height / 2);
  await page.mouse.down();
  await page.mouse.move((slot.x + target.x) / 2, (slot.y + target.y) / 2 - 60, { steps: 25 });
  for (let i = 0; i < p.rotationDeg / 15; i++) {
    await page.keyboard.press("r");
    await pause(page, 90);
  }
  await page.mouse.move(target.x, target.y, { steps: 30 });
  await pause(page, 500);
  await page.mouse.up();
  await pause(page, 900);
}

async function run(page: Page, outcome: "win" | "fail") {
  await clickEl(page, page.getByRole("button", { name: /RUN HEIST/ }));
  if (outcome === "win") await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 15_000 });
  else await expect(page.locator(".mission [role=alert]")).toBeVisible({ timeout: 15_000 });
  await pause(page, 2200);
}

const stays = (stageId: number) => (p: Placement) => { const q = snapPlacement(stageById(stageId), p); return q.x === p.x && q.y === p.y; };
const bridgeFor = (stageId: number, s: typeof shape.pen) =>
  first(gapPlacements(stageById(stageId), stageById(stageId).gaps[0], s), (p) => !placementProblem(stageById(stageId), p) && judge(stageById(stageId), [p]).gaps[0].bridged)!;

test("01 landing and prologue", async ({ page }) => {
  await withCursor(page);
  await page.goto("/");
  await page.mouse.move(1500, 120);
  await pause(page, 9000); // one full hero loop
  await clickEl(page, page.getByRole("button", { name: "▶ Play the Heist" }));
  for (let i = 0; i < 5; i++) {
    await pause(page, 2600);
    await page.keyboard.press("ArrowRight");
  }
  await pause(page, 3000);
});

test("02 stage 3: three ways across, and Muse", async ({ page }) => {
  const s = stageById(3);
  const mugCam = first(cameraCandidates(s, s.cameras[0], shape.mug), (p) => p.rotationDeg === 0 && stays(3)(p))!;
  const rulerCam = first(cameraCandidates(s, s.cameras[0], shape.ruler), stays(3))!;
  const bridge = bridgeFor(3, shape.ruler);
  const weight = first(plateCandidates(s, s.plates[0], shape.mug))!;
  const hung = first(hookCandidates(s, s.hooks[0], shape.mug))!;
  await openGame(page, 3, "A");
  await steal(page, A.mug);
  await steal(page, A.ruler);
  await place(page, 0, { ...bridge, shape: shape.mug, rotationDeg: 0 }); // mug over the gap: too thick
  await pause(page, 1800);
  await place(page, 0, mugCam);
  // Ask Muse (live Meta Muse Spark 1.3) for a clue; the engine's facts show first.
  await clickEl(page, page.locator(".muse").getByRole("button", { name: "Clue" }));
  await expect(page.locator(".muse-say", { hasText: "“" })).toBeVisible({ timeout: 30_000 });
  await pause(page, 3500);
  // Way 1: the ruler as a bridge.
  await place(page, 1, bridge);
  await run(page, "win");
  await pause(page, 1200);
  await clickEl(page, page.getByRole("button", { name: "Retry ↺" }));
  // Way 2: ruler on the camera, mug on the far plate lowers the drawbridge.
  await place(page, 1, rulerCam);
  await place(page, 0, weight);
  await pause(page, 1200);
  await run(page, "win");
  await pause(page, 1200);
  await clickEl(page, page.getByRole("button", { name: "Retry ↺" }));
  // Way 3: the mug hangs by its handle.
  await place(page, 1, rulerCam);
  await place(page, 0, hung);
  await pause(page, 1200);
  await run(page, "win");
  await pause(page, 1500);
});

test("02b stage 3: X-ray", async ({ page }) => {
  const s = stageById(3);
  await openGame(page, 3, "A");
  await steal(page, A.mug);
  await steal(page, A.ruler);
  await place(page, 0, first(cameraCandidates(s, s.cameras[0], shape.mug), (p) => p.rotationDeg === 0 && stays(3)(p))!);
  await place(page, 1, bridgeFor(3, shape.ruler));
  await clickEl(page, page.getByRole("button", { name: "X-ray: mask vs box" }));
  await page.mouse.move(1450, 420, { steps: 25 });
  await pause(page, 5000);
});

test("03 stage 5: only a real hole hangs", async ({ page }) => {
  const s = stageById(5);
  const hung = first(hookCandidates(s, s.hooks[0], shape.mug))!;
  await openGame(page, 5, "A");
  await steal(page, A.mug);
  await steal(page, A.ruler);
  await place(page, 1, bridgeFor(5, shape.ruler));
  await place(page, 0, hung);
  await pause(page, 1500);
  await clickEl(page, page.getByRole("button", { name: "X-ray: mask vs box" }));
  await pause(page, 3500);
  await clickEl(page, page.getByRole("button", { name: "X-ray: mask vs box" }));
  await run(page, "win");
});

test("04 montage: plate, slope, beams", async ({ page }) => {
  // Stage 4: the sticky note weighs the plate, the calculator blocks the camera.
  let s = stageById(4);
  await openGame(page, 4, "B");
  await steal(page, B.sticky);
  await steal(page, B.calc);
  await place(page, 0, first(plateCandidates(s, s.plates[0], shape.sticky))!);
  await place(page, 1, first(cameraCandidates(s, s.cameras[0], shape.calc), (p) => p.rotationDeg === 0 && stays(4)(p))!);
  await run(page, "win");
  await clickEl(page, page.getByRole("button", { name: "Retry ↺" }));

  // Stage 6: the ruler has to be turned to climb.
  await page.locator(".stage-chip select").selectOption("6");
  s = stageById(6);
  await clickEl(page, page.getByRole("button", { name: "Desk A" }));
  await steal(page, A.mug);
  await steal(page, A.ruler);
  await place(page, 2, first(cameraCandidates(s, s.cameras[0], shape.mug), (p) => p.rotationDeg === 0 && stays(6)(p))!);
  await place(page, 3, bridgeFor(6, shape.ruler));
  await run(page, "win");
  await clickEl(page, page.getByRole("button", { name: "Retry ↺" }));

  // Stage 8: chunky on the beam → alarm; the thin ruler threads between the beams.
  await page.locator(".stage-chip select").selectOption("8");
  s = stageById(8);
  const clear = (p: Placement) => s.beams.every((b) => !judgeBeam(b, [p]).tripped);
  await place(page, 2, first(cameraCandidates(s, s.cameras[0], shape.mug), (p) => p.rotationDeg === 0 && !clear(p) && stays(8)(p))!);
  await pause(page, 1500);
  await place(page, 3, first(cameraCandidates(s, s.cameras[0], shape.ruler), (p) => clear(p) && stays(8)(p))!);
  await place(page, 2, { ...first(cameraCandidates(s, s.cameras[0], shape.mug))!, x: 1100 }); // off the sketch → back to the bag
  await clickEl(page, page.getByRole("button", { name: "Desk B" }));
  await steal(page, B.pen);
  await place(page, 4, bridgeFor(8, shape.pen));
  await run(page, "win");
});

test("05 stage 10 and the ending", async ({ page }) => {
  const s = stageById(10);
  await openGame(page, 10, "B");
  await steal(page, B.scissors);
  await steal(page, B.calc);
  await steal(page, B.sticky);
  await steal(page, B.pen);
  await place(page, 0, first(hookCandidates(s, s.hooks[0], shape.scissors))!);
  await place(page, 1, first(cameraCandidates(s, s.cameras[0], shape.calc), stays(10))!);
  await place(page, 2, first(cameraCandidates(s, s.cameras[1], shape.sticky), stays(10))!);
  await place(page, 3, bridgeFor(10, shape.pen));
  await run(page, "win");
  await clickEl(page, page.getByRole("button", { name: "Watch the ending ▶" }));
  // Let it play by itself: each panel advances once its lines have been spoken.
  await page.mouse.move(1500, 860, { steps: 10 });
  await expect(page.locator(".comic-panel.on")).toHaveCount(6, { timeout: 90_000 });
  await pause(page, 6000);
});

/**
 * The Curator's Challenge with live Muse: the design it returns is captured on its way to the page,
 * compiled the same way the game does, and solved by the engine, so the scene can play it out.
 */
async function curatorScene(page: Page, desk: "A" | "B", steals: { at: { x: number; y: number }; shape: typeof shape.mug }[]) {
  let spec: RoomSpec | null = null;
  await page.route("**/api/curator", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    if (json.ok) spec = json.spec;
    await route.fulfill({ response: res, json });
  });
  await openGame(page, 1, desk);
  for (const s of steals) await steal(page, s.at);
  await clickEl(page, page.getByRole("button", { name: "✦ Curator's Challenge" }));
  const card = page.getByRole("dialog", { name: "The Curator's Challenge" });
  await expect(card.getByRole("button", { name: "Enter the room ▶" })).toBeVisible({ timeout: 120_000 });
  await pause(page, 5000);
  const log = await card.locator(".curator-log").innerText();
  const title = (await card.locator(".curator-title").innerText()).trim();
  const room = log.includes("falling back") ? STAGES.find((st) => st.name === title)! : compileRoom(spec!, 1);
  await clickEl(page, card.getByRole("button", { name: "Enter the room ▶" }));
  await pause(page, 1500);
  const items = steals.map((s, i) => ({ id: String(i), shape: s.shape }));
  const plan = findPlan(room, items, 30_000).plan!;
  for (const step of plan) await place(page, Number(step.item), step.placement);
  await run(page, "win");
}

test("06 curator, desk A loot", async ({ page }) => {
  await curatorScene(page, "A", [{ at: A.mug, shape: shape.mug }, { at: A.ruler, shape: shape.ruler }]);
});

test("07 curator, desk B loot", async ({ page }) => {
  await curatorScene(page, "B", [{ at: B.pen, shape: shape.pen }, { at: B.calc, shape: shape.calc }, { at: B.scissors, shape: shape.scissors }]);
});
