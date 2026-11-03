import { expect, test, type Page } from "@playwright/test";
import { stageById } from "../lib/stages";
import { cameraCandidates, first, hookCandidates, loadFixtureShape, plateCandidates } from "../tests/fixtures";

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
  await page.addInitScript(() => localStorage.setItem("pixel-heist.unlocked", "5"));
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

const mission = (page: Page, name: string) => page.locator(".checklist li", { hasText: name });

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
