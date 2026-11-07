import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, who: "olivia" | "marcus" | "priya" | "diego" | "hana" | "sam", next?: string) {
  const domain = who === "sam" ? "contoso.test" : "northwind.test";
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(`${who}@${domain}`);
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** True when the page scrolls sideways — the usual sign of a broken mobile layout. */
export const overflowsX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
