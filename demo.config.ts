import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/** Records the desktop demo footage (npx playwright test -c demo.config.ts). Recorded cuts only. */
export default defineConfig({
  ...base,
  testMatch: "demo.rec.ts",
  timeout: 180_000,
  outputDir: "recordings/raw",
  use: {
    ...base.use,
    ...devices["Desktop Chrome"],
    viewport: { width: 1600, height: 900 },
    video: { mode: "on", size: { width: 1600, height: 900 } },
  },
});
