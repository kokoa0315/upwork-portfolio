// Capture the README / portfolio screenshots from a running app (seed data only).
// usage: npm run db:reset && npm run build && npm start, then: node scripts/screenshots.mjs [baseURL]
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:4340";
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function session(who, context) {
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(`${who}@northwind.test`);
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  return page;
}

async function shot(page, name, { fullPage = false } = {}) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
  console.log(`${name}.png`);
}

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" };

{
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await shot(page, "01-login");
  await ctx.close();
}
{
  const ctx = await browser.newContext(desktop);
  const page = await session("marcus", ctx);
  await shot(page, "02-dashboard-approver");
  await page.goto(`${base}/requests?status=submitted`);
  await shot(page, "03-review-queue");
  // The largest open request is above Marcus's limit, which shows the limit rule in the UI.
  await page.getByRole("link", { name: "Motion design freelancer (2 weeks)" }).first().click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
  await shot(page, "04-request-decision");
  await ctx.close();
}
{
  const ctx = await browser.newContext(desktop);
  const page = await session("olivia", ctx);
  await page.goto(`${base}/requests`);
  await shot(page, "05-all-requests");
  await page.goto(`${base}/members`);
  await shot(page, "06-members-roles");
  await page.goto(`${base}/activity`);
  await shot(page, "07-audit-log");
  await ctx.close();
}
{
  const ctx = await browser.newContext(desktop);
  const page = await session("priya", ctx);
  await page.goto(`${base}/requests/new`);
  await shot(page, "08-new-request-member");
  await ctx.close();
}
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "light" });
  const page = await session("marcus", ctx);
  await shot(page, "09-mobile-dashboard"); // one phone screen, the size Upwork shows well
  await page.goto(`${base}/requests?status=submitted`);
  await page.locator('a[href^="/requests/"]:not([href="/requests/new"])').filter({ visible: true }).first().click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
  await shot(page, "10-mobile-decision");
  await ctx.close();
}

await browser.close();
