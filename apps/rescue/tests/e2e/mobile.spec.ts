import { expect, test } from "@playwright/test";
import { overflowsX, signIn, signOut } from "./helpers";

test("no page scrolls sideways on a phone", async ({ page }) => {
  await page.goto("/login");
  expect(await overflowsX(page), "login").toBe(false);
  await signIn(page, "maya");
  for (const path of ["/invoices", "/invoices/40000000-0000-4000-8000-000000000103", "/team"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await overflowsX(page), path).toBe(false);
  }
});

test("every invoice can be opened from the list on a phone", async ({ page }) => {
  await signIn(page, "maya");
  const viewport = page.viewportSize()!;
  // Every visible link to an invoice (the card list on a phone; the shipped version showed the table instead).
  const links = page.locator('a[href^="/invoices/"]').filter({ visible: true });
  await expect(links).toHaveCount(5);
  for (const link of await links.all()) {
    const box = (await link.boundingBox())!;
    expect(box.x + box.width, "link is inside the screen").toBeLessThanOrEqual(viewport.width);
    expect(box.height, "tap target is at least 24px tall").toBeGreaterThanOrEqual(24);
  }
  await links.nth(2).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a phone user can sign out", async ({ page }) => {
  await signIn(page, "tom");
  await signOut(page);
});
