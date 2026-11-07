import { expect, test } from "@playwright/test";
import { deliver, openTriaged, overflowsX, signIn, signOut } from "./helpers";

test("no page scrolls sideways on a phone, including a long email", async ({ page, request }) => {
  await page.goto("/login");
  expect(await overflowsX(page)).toBe(false);

  const subject = await deliver(request, "sample-07");
  await signIn(page, "ana");
  for (const path of ["/dashboard", "/inbox", "/inbox?status=all", "/outbox"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await overflowsX(page), path).toBe(false);
  }
  await openTriaged(page, subject);
  expect(await overflowsX(page), "message").toBe(false);
  await expect(page.getByRole("button", { name: "Approve & send" })).toBeVisible();
});

test("a phone user can sign out", async ({ page }) => {
  await signIn(page, "ben");
  await signOut(page);
});
