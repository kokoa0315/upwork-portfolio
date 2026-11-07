import { expect, test } from "@playwright/test";
import { saving, signIn, signOut } from "./helpers";

const LUMEN_INVOICE = "/invoices/40000000-0000-4000-8000-000000000202";

test.describe("session", () => {
  // The local stack issues 100-second access tokens (devstack.env); in production the same happens after an hour.
  test("stays signed in after the access token expires", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, "maya");
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();

    // Past the token's expiry: this load has to refresh the session.
    await page.waitForTimeout(102_000);
    await page.goto("/team");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Team");
    // Past the 10-second window in which a used refresh token is still accepted: this load needs the new one.
    await page.waitForTimeout(12_000);
    await page.goto("/invoices");
    await expect(page, "still signed in").toHaveURL(/\/invoices$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invoices");
  });

  test("signing out ends the session", async ({ page }) => {
    await signIn(page, "tom");
    await signOut(page);
    await page.goto("/invoices");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("tenant isolation in the UI", () => {
  test("Fernway sees only Fernway's invoices", async ({ page }) => {
    await signIn(page, "tom");
    await expect(page.getByText("CB-1052").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("CB-1050").filter({ visible: true })).toHaveCount(0); // Lumen's
    await expect(page.getByText("Clinic signage")).toHaveCount(0);
  });

  test("opening another client's invoice URL shows not found", async ({ page }) => {
    await signIn(page, "tom");
    await page.goto(LUMEN_INVOICE);
    await expect(page.getByRole("heading", { name: "Invoice not found" })).toBeVisible();
    await expect(page.getByText("Clinic signage")).toHaveCount(0);
  });
});

test.describe("team", () => {
  test("an owner changes a teammate's role and it sticks", async ({ page }) => {
    await signIn(page, "maya");
    await page.goto("/team");
    await saving(page, () => page.getByLabel("Role for Tom Reyes").selectOption("owner"));
    await page.reload();
    await expect(page.getByLabel("Role for Tom Reyes")).toHaveValue("owner");
    await saving(page, () => page.getByLabel("Role for Tom Reyes").selectOption("member"));
    await page.reload();
    await expect(page.getByLabel("Role for Tom Reyes")).toHaveValue("member");
  });

  test("a member sees no role menu and can change their own emails", async ({ page }) => {
    await signIn(page, "tom");
    await page.goto("/team");
    await expect(page.getByRole("combobox")).toHaveCount(0);
    const box = page.getByLabel("Email me when a new invoice is posted");
    await saving(page, () => box.uncheck());
    await page.reload();
    await expect(box).not.toBeChecked();
    await saving(page, () => box.check());
    await page.reload();
    await expect(box).toBeChecked();
  });
});

// Both reach the browser as "//evil.invalid", another host: a backslash reads as a slash, and "/./" collapses.
// More cases, including encoded dots, are in tests/unit/safe-next.test.ts.
for (const next of ["/\\evil.invalid/x", "/.//evil.invalid/x"]) {
  test(`signing in never sends people to another site: ${next}`, async ({ page }) => {
    await signIn(page, "maya", next);
    await expect(page).toHaveURL("/invoices");
  });
}
