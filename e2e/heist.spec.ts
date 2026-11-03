import { expect, test, type Page } from "@playwright/test";
import { stageById } from "../lib/stages";
import { judge, placementProblem, snapPlacement } from "../lib/judge";
import type { Placement } from "../lib/geometry";
import { cameraCandidates, first, gapPlacements, hookCandidates, loadFixtureShape, plateCandidates } from "../tests/fixtures";

/**
 * Sample-mode end-to-end runs (PRD §9, §13). Recorded SAM cuts are used, so no live API calls;
 * error handling stubs /api/segment.
 */

const SAMPLE = { width: 1448, height: 1086 };
const MUG = { x: 260, y: 410 };
const RULER = { x: 330, y: 790 };

/** Image pixel → page coordinates, using the same object-fit: contain math as the app. */
async function photoPoint(page: Page, p: { x: number; y: number }) {
  const b = (await page.locator(".photo-box").boundingBox())!;
  const s = Math.min(b.width / SAMPLE.width, b.height / SAMPLE.height);
  return {
    x: b.x + (b.width - SAMPLE.width * s) / 2 + (p.x + 0.5) * s,
    y: b.y + (b.height - SAMPLE.height * s) / 2 + (p.y + 0.5) * s,
  };
}

async function worldPoint(page: Page, x: number, y: number) {
  const b = (await page.locator("canvas.world").boundingBox())!;
  return { x: b.x + (x / 960) * b.width, y: b.y + (y / 540) * b.height };
}

async function startSample(page: Page, desk: "A" | "B" = "A", stage = 3) {
  // Unlock stages up front so each spec can jump straight to the one it tests.
  await page.addInitScript(() => localStorage.setItem("pixel-heist.unlocked", "10"));
  await page.goto("/");
  await page.getByRole("button", { name: "▶ Play the Heist" }).click();
  await page.getByRole("button", { name: "Skip ⏭" }).click();
  await page.locator(".stage-chip select").selectOption(String(stage));
  await page.getByRole("button", { name: `Try Sample Desk ${desk}` }).click();
  await expect(page.locator(".photo-box img")).toBeVisible();
}

async function steal(page: Page, at: { x: number; y: number }) {
  const p = await photoPoint(page, at);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".geo-card")).toBeVisible();
  await page.getByRole("button", { name: "Extract ✂" }).click();
  await expect(page.locator(".geo-card")).toBeHidden();
}

/** Drag loot slot `index` so the item's center lands at world (cx, cy). Loot drags hold the item near its top edge. */
async function dropLoot(page: Page, index: number, cx: number, cy: number, itemHeight: number) {
  const slot = (await page.locator(".slot-grab").nth(index).boundingBox())!;
  const target = await worldPoint(page, cx, cy - itemHeight / 2 + 10);
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

/** Like dropLoot, but turns the item (R = +15°) mid-drag first. */
async function dropLootTurned(page: Page, index: number, p: Placement) {
  const slot = (await page.locator(".slot-grab").nth(index).boundingBox())!;
  const target = await worldPoint(page, p.x, p.y - p.shape.grid.height / 2 + 10);
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  for (let i = 0; i < p.rotationDeg / 15; i++) await page.keyboard.press("r");
  await page.mouse.move(target.x + 1, target.y, { steps: 2 });
  await page.mouse.move(target.x, target.y, { steps: 2 });
  await page.mouse.up();
}

/** Stage 3's gap has several ways across, so its mission reads "Cross the gap" there. */
const mission = (page: Page, name: string) =>
  page.locator(".checklist li", { hasText: name === "Bridge the gap" ? /Bridge the gap|Cross the gap/ : name });

test("T10: recorded mug + ruler → block camera, bridge gap, escape", async ({ page }) => {
  await startSample(page);
  await page.getByRole("radio", { name: "Recorded" }).click();

  await steal(page, MUG);
  await expect(page.locator(".sam-log .bubble").last()).toContainText("Bagged");
  await steal(page, RULER);

  // Both cuts are labelled as recorded, never as live (T12).
  await expect(page.locator(".slot-origin")).toHaveText(["REC", "REC"]);
  await expect(page.locator(".api-status")).toContainText("Recorded cuts");

  await dropLoot(page, 0, 400, 200, 177);
  await expect(mission(page, "Block the camera")).toHaveClass(/done/);
  await expect(mission(page, "Block the camera")).toContainText(/[5-7]\/7 rays blocked/);

  await dropLoot(page, 1, 495, 418, 25);
  await expect(mission(page, "Bridge the gap")).toHaveClass(/done/);

  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 10_000 });
  await expect(mission(page, "Reach the vault")).toHaveClass(/done/);
  await expect(page.locator(".success-stats")).toContainText("Total extractions 2");
});

test("T09/T15: mug over the gap trips the lasers; running unguarded gets caught", async ({ page }) => {
  await startSample(page);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, MUG);

  await dropLoot(page, 0, 495, 380, 177);
  await expect(mission(page, "Bridge the gap")).not.toHaveClass(/done/);
  await expect(mission(page, "Bridge the gap")).toContainText("Trips the lasers");
  await expect(page.locator(".why")).toContainText("Too thick");

  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.locator(".mission [role=alert]")).toContainText("Caught!", { timeout: 10_000 });
  // Loot stays where it was so the player can adjust (PRD §3.2 step 9).
  await page.getByRole("button", { name: /Try again/ }).click();
  await expect(page.locator(".slot.placed")).toHaveCount(1);
});

test("T06: moving the mug out of the rays un-checks the camera mission", async ({ page }) => {
  await startSample(page);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, MUG);
  await dropLoot(page, 0, 400, 200, 177);
  await expect(mission(page, "Block the camera")).toHaveClass(/done/);

  const from = await worldPoint(page, 400, 200);
  const to = await worldPoint(page, 860, 150);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect(mission(page, "Block the camera")).not.toHaveClass(/done/);
  await expect(mission(page, "Block the camera")).toContainText("0/7");
});

test("T04/T11: Sam explains API failures and the game keeps going", async ({ page }) => {
  const replies = [
    { status: 429, body: { ok: false, code: "RATE_LIMIT", message: "SAM rate limit" } },
    { status: 200, body: { ok: false, code: "NO_OBJECT", message: "no object at that point" } },
  ];
  await page.route("**/api/segment", (route) => {
    const r = replies.shift()!;
    return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });

  await startSample(page); // Live Sam is the default
  const p = await photoPoint(page, MUG);

  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".sam-log .bubble").last()).toContainText("Too many requests");
  await expect(page.getByRole("button", { name: "Ask again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use recorded cuts" })).toBeVisible();

  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".sam-log .bubble").last()).toContainText("Couldn't find anything there");

  // Recovery: switch to recorded cuts and steal the mug anyway.
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, MUG);
  await expect(page.locator(".slot-grab")).toHaveCount(1);
});

test("X-ray: the winning ruler bridge is a laser-tripping slab as a bounding box", async ({ page }) => {
  await startSample(page);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, RULER);
  await dropLoot(page, 0, 495, 418, 25);
  await expect(mission(page, "Bridge the gap")).toHaveClass(/done/);

  await page.getByRole("button", { name: "X-ray: mask vs box" }).click();
  const gapRow = page.locator(".xray-card tr", { hasText: "Gap" });
  await expect(gapRow.locator("td").nth(0)).toContainText("✓");
  await expect(gapRow.locator("td").nth(1)).toContainText("✗");
  await expect(gapRow.locator("td").nth(1)).toContainText("Trips the lasers");
  // The real game still uses the mask: the mission stays done.
  await expect(mission(page, "Bridge the gap")).toHaveClass(/done/);
});

test("Desk B: a different photo, a different solution — calculator on the camera, pen over the gap", async ({ page }) => {
  await startSample(page, "B");
  await page.getByRole("radio", { name: "Recorded" }).click();

  // The scissors are a decoy: their open handles make them too thick for the lasers.
  await steal(page, { x: 872, y: 860 });
  await dropLoot(page, 0, 495, 400, 73);
  await expect(mission(page, "Bridge the gap")).not.toHaveClass(/done/);
  await expect(page.locator(".why")).toContainText("Too thick");
  await page.locator(".slot-x").first().click();

  await steal(page, { x: 1140, y: 448 }); // calculator
  await steal(page, { x: 688, y: 700 }); // pen
  await dropLoot(page, 0, 410, 200, 180);
  await expect(mission(page, "Block the camera")).toHaveClass(/done/);
  await dropLoot(page, 1, 495, 418, 19);
  await expect(mission(page, "Bridge the gap")).toHaveClass(/done/);

  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 10_000 });
});

test("Landing → prologue comic → Stage 1: a fresh game starts in the Lobby with only a camera to beat", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PIXEL HEIST" })).toBeVisible();
  await page.getByRole("button", { name: "▶ Play the Heist" }).click();
  // Six panels; Sam is labelled as the model on the first call.
  await expect(page.locator(".comic-panel.on")).toHaveCount(1);
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next ▸" }).click();
  await expect(page.locator(".comic-panel.on")).toHaveCount(6);
  await page.getByRole("button", { name: "▶ Start the heist" }).click();
  await expect(page.locator(".stage-chip select")).toHaveValue("1");
  await expect(page.locator(".checklist li")).toHaveText([/Block the camera/, /Reach the vault/]);
  // Later stages stay locked until earlier ones are cleared.
  await expect(page.locator('.stage-chip option[value="2"]')).toHaveAttribute("disabled", "");
});

test("Stage 4: the scissors can't hold the plate; the sticky note can, and the door opens", async ({ page }) => {
  const s = stageById(4);
  const sticky = loadFixtureShape("d2-sticky"), calculator = loadFixtureShape("d2-calculator");
  const plateSpot = first(plateCandidates(s, s.plates[0], sticky))!;
  const camSpot = first(cameraCandidates(s, s.cameras[0], calculator))!;

  await startSample(page, "B", 4);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, { x: 1160, y: 900 }); // sticky note
  await steal(page, { x: 1140, y: 448 }); // calculator
  await dropLoot(page, 0, plateSpot.x, plateSpot.y, sticky.grid.height);
  await expect(mission(page, "Weigh down the plate")).toHaveClass(/done/);
  await dropLoot(page, 1, camSpot.x, camSpot.y, calculator.grid.height);
  await expect(mission(page, "Block the camera")).toHaveClass(/done/);

  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Next: The Hook Hall/ })).toBeVisible();
});

test("Stage 5: the mug hangs on the hook by its handle; without it the thief is stuck at the gate", async ({ page }) => {
  const s = stageById(5);
  const mug = loadFixtureShape("mug");
  const hookSpot = first(hookCandidates(s, s.hooks[0], mug), (p) => p.rotationDeg === 0)!;

  await startSample(page, "A", 5);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, MUG);
  await steal(page, RULER);
  await dropLoot(page, 1, 585, 418, 25); // ruler over the gap
  await expect(mission(page, "Bridge the gap")).toHaveClass(/done/);

  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.locator(".mission [role=alert]")).toContainText("Stuck!", { timeout: 10_000 });
  await page.getByRole("button", { name: /Try again/ }).click();

  await dropLoot(page, 0, hookSpot.x, hookSpot.y, mug.grid.height);
  await expect(mission(page, "Hang something on the hook")).toHaveClass(/done/);
  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 10_000 });
});

test("Watch Prologue replays the comic and Skip returns to the landing page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Watch Prologue" }).click();
  await expect(page.getByText("Pencil cameras, pencil lasers", { exact: false })).toBeHidden();
  await expect(page.locator(".comic-panel.on")).toHaveCount(1);
  await page.getByRole("button", { name: "Skip ⏭" }).click();
  await expect(page.getByRole("button", { name: "▶ Play the Heist" })).toBeVisible();
});

test("Stage 10 with Desk B alone, then the ending comic ends on a cliffhanger", async ({ page }) => {
  const s = stageById(10);
  const shape = { pen: loadFixtureShape("d2-pen"), calc: loadFixtureShape("d2-calculator"), sticky: loadFixtureShape("d2-sticky"), scissors: loadFixtureShape("d2-scissors") };
  // Spots the drop won't re-snap, so the dragged item lands exactly where the solver put it.
  const stays = (p: Placement) => { const q = snapPlacement(s, p); return q.x === p.x && q.y === p.y; };
  const hung = first(hookCandidates(s, s.hooks[0], shape.scissors))!;
  const cam1 = first(cameraCandidates(s, s.cameras[0], shape.calc), stays)!;
  const cam2 = first(cameraCandidates(s, s.cameras[1], shape.sticky), stays)!;
  const bridge = first(gapPlacements(s, s.gaps[0], shape.pen), (p) => !placementProblem(s, p) && judge(s, [p]).gaps[0].bridged)!;

  await startSample(page, "B", 10);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, { x: 872, y: 860 }); // scissors
  await steal(page, { x: 1140, y: 448 }); // calculator
  await steal(page, { x: 1160, y: 900 }); // sticky note
  await steal(page, { x: 688, y: 700 }); // pen
  await dropLootTurned(page, 0, hung);
  await dropLootTurned(page, 1, cam1);
  await dropLootTurned(page, 2, cam2);
  await dropLootTurned(page, 3, bridge);
  await expect(mission(page, "Hang something on the hook")).toHaveClass(/done/);
  await expect(mission(page, "Bridge the gap")).toHaveClass(/done/);
  await expect(page.locator(".checklist li.done", { hasText: "Block the camera" })).toHaveCount(2);

  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Watch the ending ▶" }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next ▸" }).click();
  await expect(page.getByText("To be continued...?")).toBeVisible();
  await expect(page.getByText("The museum hired me first", { exact: false })).toBeVisible();
  if (process.env.SHOT) await page.waitForTimeout(2500), await page.screenshot({ path: process.env.SHOT });
  await page.getByRole("button", { name: "Back to the start ↺" }).click();
  await expect(page.getByRole("button", { name: "▶ Play the Heist" })).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the sketch and the loot bag stay on screen while the photo scrolls; camera and library inputs exist", async ({ page }) => {
    await startSample(page, "A", 1);
    await page.getByRole("radio", { name: "Recorded" }).click();
    const camera = page.locator('input[type=file][capture="environment"]');
    await expect(camera).toHaveAttribute("accept", "image/*");
    await expect(page.locator('input[type=file]:not([capture])')).toHaveAttribute("accept", "image/*");

    await page.locator(".photo-box").scrollIntoViewIfNeeded();
    await steal(page, MUG);
    // Both docks are inside the viewport at the same time, so a drag can go from one to the other.
    const world = (await page.locator("canvas.world").boundingBox())!;
    const bag = (await page.locator(".lootbar").boundingBox())!;
    expect(world.y).toBeGreaterThanOrEqual(0);
    expect(bag.y + bag.height).toBeLessThanOrEqual(844 + 1);

    const s = stageById(1);
    const spot = first(cameraCandidates(s, s.cameras[0], loadFixtureShape("mug")), (p) => p.rotationDeg === 0)!;
    await dropLoot(page, 0, spot.x, spot.y, spot.shape.grid.height);
    await expect(mission(page, "Block the camera")).toHaveClass(/done/);
    await page.getByRole("button", { name: /RUN HEIST/ }).click();
    await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 10_000 });
  });
});

test("Stage 3 has more than one way across: the mug on the far plate lowers the drawbridge", async ({ page }) => {
  const s = stageById(3);
  const ruler = loadFixtureShape("ruler"), mug = loadFixtureShape("mug");
  const stays = (p: Placement) => { const q = snapPlacement(s, p); return q.x === p.x && q.y === p.y; };
  const cam = first(cameraCandidates(s, s.cameras[0], ruler), stays)!;
  const weight = first(plateCandidates(s, s.plates[0], mug))!;

  await startSample(page, "A", 3);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await expect(page.locator(".routes")).toContainText("0/3");
  await steal(page, MUG);
  await steal(page, RULER);
  await dropLootTurned(page, 1, cam);
  await dropLootTurned(page, 0, weight);
  await expect(mission(page, "Block the camera")).toHaveClass(/done/);
  await expect(mission(page, "Cross the gap")).toContainText("Drawbridge down");
  await page.getByRole("button", { name: /RUN HEIST/ }).click();
  await expect(page.getByText("ESCAPE SUCCESS!")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".new-route")).toContainText("Weight on the plate");
  await expect(page.locator(".new-route")).toContainText("2 more hidden");
  await page.getByRole("button", { name: "Retry ↺" }).click();
  await expect(page.locator(".routes")).toContainText("1/3");
});

test("Ask Muse: hints come from the engine's facts, and skip what's already done", async ({ page }) => {
  const s = stageById(3);
  const cam = first(cameraCandidates(s, s.cameras[0], loadFixtureShape("mug")), (p) => p.rotationDeg === 0)!;
  const sent: { level: number; done: string[]; todo: string[]; next: string[] }[] = [];
  // LIVE_MUSE=1 lets the request through to Meta Muse Spark 1.3; otherwise Muse is stubbed.
  await page.route("**/api/hint", async (route) => {
    sent.push(route.request().postDataJSON());
    if (process.env.LIVE_MUSE) return route.continue();
    await route.fulfill({ json: { ok: true, text: "Your 2nd cut-out has the reach for that gap.", latencyMs: 2900 } });
  });

  await startSample(page, "A", 3);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, MUG);
  await steal(page, RULER);
  await dropLoot(page, 0, cam.x, cam.y, cam.shape.grid.height);
  await expect(mission(page, "Block the camera")).toHaveClass(/done/);

  await page.locator(".muse").getByRole("button", { name: "Clue" }).click();
  const said = page.locator(".muse-say", { hasText: "“" });
  await expect(said).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".muse-facts")).toContainText("2nd cut-out");
  expect(sent[0]).toMatchObject({ level: 2, done: ["block the camera"], todo: ["cross the gap"] });
  expect(sent[0].next.join(" ")).not.toMatch(/camera/);
  if (process.env.SHOT) await page.locator(".mission").screenshot({ path: process.env.SHOT });
  console.log("Muse:", await said.textContent());
  console.log("Engine:", await page.locator(".muse-facts").textContent());
});

test("Curator's Challenge: Muse designs a room for this loot, the engine rejects an unfair one and accepts the redraw", async ({ page }) => {
  const base = { title: "Hall of Echoes", curatorLine: "A long bar and something with a hole. Cute.", camera: { use: true, x: 620, need: 5 }, door: { use: false, x: 360, opener: "plate" }, beams: 0 };
  // First design: a steep gap with no drawbridge and a door that needs a plate (desk A can't do both). Second: fair.
  const designs = [
    { ...base, gap: { use: true, left: 480, width: 140, rise: 0, drawbridge: "none" }, door: { use: true, x: 360, opener: "hook" }, camera: { use: true, x: 620, need: 6 }, beams: 2 },
    { ...base, gap: { use: true, left: 480, width: 120, rise: 0, drawbridge: "both" } },
  ];
  const sent: { feedback?: string; loot: { ref: string; holes: number }[] }[] = [];
  await page.route("**/api/curator", async (route) => {
    sent.push(route.request().postDataJSON());
    if (process.env.LIVE_MUSE) return route.continue();
    await route.fulfill({ json: { ok: true, spec: designs[Math.min(sent.length - 1, 1)], latencyMs: 9000 } });
  });

  await startSample(page, "A", 1);
  await page.getByRole("radio", { name: "Recorded" }).click();
  await steal(page, MUG);
  await steal(page, RULER);
  await page.getByRole("button", { name: "✦ Curator's Challenge" }).click();
  const card = page.getByRole("dialog", { name: "The Curator's Challenge" });
  await expect(card.getByRole("button", { name: "Enter the room ▶" })).toBeVisible({ timeout: 90_000 });
  console.log((await card.locator(".curator-log").innerText()).replace(/\n+/g, " | "));
  if (process.env.SHOT) await card.screenshot({ path: process.env.SHOT });
  expect(sent[0].loot).toEqual([expect.objectContaining({ ref: "cut-out 1", holes: 1 }), expect.objectContaining({ ref: "cut-out 2", holes: 0 })]);
  if (!process.env.LIVE_MUSE) {
    await expect(card.locator(".curator-log")).toContainText("rejected");
    expect(sent[1].feedback).toBeTruthy();
  }
  await card.getByRole("button", { name: "Enter the room ▶" }).click();
  await expect(page.locator(".stage-teaser")).toContainText("✦");
  await expect(page.locator(".checklist li")).not.toHaveCount(0);
});
