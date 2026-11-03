import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  testIgnore: "**/._*", // macOS AppleDouble files on exFAT
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 }, // PRD T13
    trace: "retain-on-failure",
  },
  // Production build, so the e2e run exercises what we deploy. Live SAM is never called:
  // the specs use recorded cuts or stub /api/segment.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
