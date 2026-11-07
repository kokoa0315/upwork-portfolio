// Screenshots for the case study, taken the same way before and after the fix.
// usage: node scripts/case-shots.mjs <before|after>   (needs the stack and the app on :4370)
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const label = process.argv[2];
if (!["before", "after"].includes(label)) throw new Error("usage: case-shots.mjs <before|after>");
const base = "http://localhost:4370";
const out = path.resolve(import.meta.dirname, "../case/shots");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function signedIn(contextOptions, email) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/invoices$/);
  return { context, page };
}
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(out, `${label}-${name}.png`), fullPage });

// 1. Tom (Fernway) on the invoice list: does Lumen's work show up?
{
  const { context, page } = await signedIn({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, "tom@fernway.test");
  await shot(page, "invoices-desktop", true);
  // 2. Lumen's invoice opened by URL.
  await page.goto(`${base}/invoices/40000000-0000-4000-8000-000000000202`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await shot(page, "other-client-invoice");
  await context.close();
}

// 3. The invoice list on a phone.
{
  const { context, page } = await signedIn({ ...devices["iPhone 13"] }, "maya@fernway.test");
  await shot(page, "invoices-mobile");
  await context.close();
}

// 4. Past the 100-second token expiry, two page loads 12 seconds apart (the same steps as the E2E test).
{
  const { context, page } = await signedIn({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, "maya@fernway.test");
  await page.waitForTimeout(102_000);
  await page.goto(`${base}/team`);
  await page.waitForTimeout(12_000);
  await page.goto(`${base}/invoices`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await shot(page, "after-token-expiry");
  await context.close();
}

await browser.close();
console.log(`saved ${label} shots to ${out}`);
