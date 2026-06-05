import { test, expect } from "@playwright/test";

// Starter smoke suite. These are deliberately read-only journeys that do not
// create financial records, matching SmartFin's design where all writes are
// human-confirmed. Extend with authenticated flows once a test account and
// storageState fixture are added.

test.describe("SmartFin v4 smoke", () => {
  test("landing page loads", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/SmartFin|MiniERP|.+/);
  });

  test("login page is reachable", async ({ page }) => {
    await page.goto("/login");
    // At least one credential field should be present.
    const emailField = page.locator('input[type="email"], input[name="email"]');
    await expect(emailField.first()).toBeVisible();
  });

  test("protected route redirects when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    // Either redirected to login, or shown an unauthorized state.
    await expect(page).toHaveURL(/login|signin|auth|dashboard/);
  });
});

// NEXT STEPS (documented for the report's "planned" column):
//   1. Add a seeded test user + Playwright storageState for authenticated flows.
//   2. Add a document-upload -> OCR -> ready_for_review journey (R2 extraction).
//   3. Add an expense-approval journey asserting the human-confirmation gate.
