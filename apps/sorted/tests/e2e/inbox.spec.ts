import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { deliver, HARBOR, openTriaged, signed, signIn, TIDEBOOK } from "./helpers";

test("a signed email is triaged and waits for a person", async ({ page, request }) => {
  const subject = await deliver(request, "sample-01");
  await signIn(page, "ana");
  await openTriaged(page, subject);

  const summary = page.getByRole("heading", { name: "Triage (rules mode)" }).locator("..").locator("..");
  // Offline runs use the rules provider, and the page says so instead of calling it AI.
  await expect(summary).toContainText("Rules (no AI)");
  await expect(summary).not.toContainText("confident");
  await expect(summary).toContainText("keyword rules");
  await expect(page.getByRole("main")).toContainText("Billing");
  await expect(page.getByText("Email received via webhook")).toBeVisible();
  await expect(page.getByText("Triaged", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Reply")).not.toBeEmpty();
});

test("editing and approving records one reply, in the outbox and the history", async ({ page, request }) => {
  const subject = await deliver(request, "sample-10");
  await signIn(page, "ana");
  await openTriaged(page, subject);

  const reply = "Hi Mina, reply with the new studio name and I will update it for future invoices. Ana";
  await page.getByLabel("Reply").fill(reply);
  await page.getByRole("button", { name: "Approve & send" }).click();

  await expect(page.getByRole("heading", { name: "Sent reply" })).toBeVisible();
  await expect(page.getByText(/Approved by Ana Torres .* edited before sending/)).toBeVisible();
  await expect(page.getByText("approved the reply")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve & send" })).toHaveCount(0);

  await page.goto("/outbox");
  await expect(page.getByRole("link", { name: subject })).toBeVisible();
  await expect(page.getByText(reply)).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: subject })).toHaveCount(0);
});

test("dismissing sends nothing", async ({ page, request }) => {
  const subject = await deliver(request, "sample-08");
  await signIn(page, "ben");
  await openTriaged(page, subject);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Dismissed. No reply was sent.")).toBeVisible();
  await page.goto("/outbox");
  await expect(page.getByRole("link", { name: subject })).toHaveCount(0);
});

test("an email that tries to instruct the AI is shown as plain text and flagged", async ({ page, request }) => {
  const subject = await deliver(request, "sample-11");
  await signIn(page, "ana");
  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByRole("link", { name: subject })).toContainText("Flagged:", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("link", { name: subject }).click();
  // Rendered as text, never as markup.
  await expect(page.getByText(/ignore/i).first()).toBeVisible();
  await expect(page.locator("main script")).toHaveCount(0);
});

test("another team can't see or open Tidebook's message", async ({ page, request, browser }) => {
  const subject = await deliver(request, "sample-03");
  await signIn(page, "ana");
  await openTriaged(page, subject);
  const url = page.url();

  const other = await browser.newPage();
  await signIn(other, "cleo");
  await other.goto("/inbox?status=all");
  await expect(other.getByRole("link", { name: subject })).toHaveCount(0);
  await other.goto(url);
  await expect(other.getByRole("heading", { name: "Message not found" })).toBeVisible();
  await expect(other.getByText(subject)).toHaveCount(0);
  await other.close();
});

test("the webhook rejects unsigned, tampered, stale, wrong-team, unknown-team and malformed deliveries", async ({ request }) => {
  const body = JSON.stringify({ id: `e2e-hook-${Date.now()}`, from: { email: "x@example.com" }, subject: "Hi", text: "Hello" });
  const url = `/api/inbound/${TIDEBOOK}`;

  expect((await request.post(url, { data: body, headers: { "content-type": "application/json" } })).status()).toBe(401);
  expect((await request.post(url, { data: body.replace("Hello", "Hi!!"), headers: signed(body) })).status()).toBe(401);
  expect((await request.post(url, { data: body, headers: signed(body, { ts: Math.floor(Date.now() / 1000) - 3600 }) })).status()).toBe(401);
  expect((await request.post(url, { data: body, headers: signed(body, { key: "wrong-secret" }) })).status()).toBe(401);

  // Signed for Tidebook but posted to another team's URL: the team is part of the signature.
  expect((await request.post(`/api/inbound/${HARBOR}`, { data: body, headers: signed(body) })).status()).toBe(401);

  const ghost = "20000000-0000-4000-8000-0000000000ff";
  const unknownTeam = await request.post(`/api/inbound/${ghost}`, { data: body, headers: signed(body, { team: ghost }) });
  expect(unknownTeam.status()).toBe(404);
  const bad = JSON.stringify({ id: "x", from: { email: "not-an-email" }, text: "" });
  expect((await request.post(url, { data: bad, headers: signed(bad) })).status()).toBe(422);

  // A retried delivery is accepted once.
  expect((await request.post(url, { data: body, headers: signed(body) })).status()).toBe(202);
  const again = await request.post(url, { data: body, headers: signed(body) });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ duplicate: true });
});

test("the worker endpoint needs its secret", async ({ request }) => {
  expect((await request.post("/api/worker")).status()).toBe(401);
  expect((await request.post("/api/worker", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
  // Same number of characters as the real secret, more bytes: still a plain 401, not a crash.
  const length = /^WORKER_SECRET=(.+)$/m.exec(fs.readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8"))![1].trim().length;
  expect((await request.post("/api/worker", { headers: { authorization: `Bearer ${"é".repeat(length)}` } })).status()).toBe(401);
});

// Both reach the browser as "//evil.invalid", another host: a backslash reads as a slash, and "/./" collapses.
// More cases, including encoded dots, are in tests/unit/safe-next.test.ts.
for (const next of ["/\\evil.invalid/x", "/.//evil.invalid/x"]) {
  test(`signing in never sends people to another site: ${next}`, async ({ page }) => {
    await signIn(page, "ana", next);
    await expect(page).toHaveURL("/dashboard");
  });
}
