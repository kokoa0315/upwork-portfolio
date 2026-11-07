import { expect, type Page } from "@playwright/test";

const domains = { maya: "fernway.test", tom: "fernway.test", iris: "lumen.test" } as const;

export async function signIn(page: Page, who: keyof typeof domains, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(`${who}@${domains[who]}`);
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

/** Run a UI change that calls a server action, and wait for the action's response before going on. */
export async function saving(page: Page, change: () => Promise<unknown>) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined), change()]);
}
