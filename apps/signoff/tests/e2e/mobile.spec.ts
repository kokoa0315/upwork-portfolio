import { expect, test } from "@playwright/test";
import { overflowsX, signIn, signOut } from "./helpers";

test("no page scrolls sideways on a phone", async ({ page }) => {
  await page.goto("/login");
  expect(await overflowsX(page)).toBe(false);

  await signIn(page, "olivia");
  for (const path of ["/dashboard", "/requests", "/requests/new", "/activity", "/members"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await overflowsX(page), path).toBe(false);
  }
  // On a phone the list is one card per request: the whole card is on screen and shows the status and amount.
  await page.goto("/requests");
  const cards = page.locator('a[href^="/requests/"]:not([href="/requests/new"])').filter({ visible: true });
  expect(await cards.count()).toBeGreaterThan(0);
  const width = page.viewportSize()!.width;
  for (const card of await cards.all()) {
    const box = (await card.boundingBox())!;
    expect(box.x + box.width, "card is inside the screen").toBeLessThanOrEqual(width);
    await expect(card).toContainText(/\$[\d,]+/);
    await expect(card).toContainText(/Draft|Awaiting review|Approved|Rejected|Withdrawn/);
  }
  await cards.first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await overflowsX(page), "request detail").toBe(false);
});

test("a phone user can sign out", async ({ page }) => {
  await signIn(page, "priya");
  await signOut(page);
});
