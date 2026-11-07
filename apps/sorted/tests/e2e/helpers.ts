import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import samples from "../../fixtures/emails.json";

export const TIDEBOOK = "20000000-0000-4000-8000-000000000001";
export const HARBOR = "20000000-0000-4000-8000-000000000009";
const domains = { ana: "tidebook.test", ben: "tidebook.test", cleo: "harbor.test" } as const;

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

export const overflowsX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

// The local test secret from .env.local, the same one the dev server reads.
const secret = /^INBOUND_WEBHOOK_SECRET=(.+)$/m.exec(fs.readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8"))![1].trim();

export function signed(body: string, { team = TIDEBOOK, ts = Math.floor(Date.now() / 1000), key = secret } = {}) {
  return {
    "content-type": "application/json",
    "x-sorted-timestamp": String(ts),
    "x-sorted-signature": `sha256=${createHmac("sha256", key).update(`${ts}.${team}.${body}`).digest("hex")}`,
  };
}

let n = 0;
/** Deliver one of the fixture emails through the signed webhook, under a fresh id. Returns the subject. */
export async function deliver(request: APIRequestContext, sampleId: string, team = TIDEBOOK) {
  const sample = samples.find((s) => s.id === sampleId)!;
  const subject = `${sample.subject} #${Date.now()}-${n++}`;
  const body = JSON.stringify({ id: `e2e-${Date.now()}-${n}`, from: sample.from, subject, text: sample.text });
  const res = await request.post(`/api/inbound/${team}`, { data: body, headers: signed(body, { team }) });
  expect(res.status()).toBe(202);
  return subject;
}

/** Open a delivered message from the inbox once the worker has triaged it. */
export async function openTriaged(page: Page, subject: string) {
  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByRole("link", { name: subject })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("link", { name: subject }).click();
  await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
}
