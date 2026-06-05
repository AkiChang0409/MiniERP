import { defineConfig, devices } from "@playwright/test";

// Minimal Playwright setup for SmartFin v4. Targets the deployed worker by
// default; override with E2E_BASE_URL for a preview environment.
export default defineConfig({
  testDir: "./src/test/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://smartfin-v4.aki-wang.workers.dev",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
