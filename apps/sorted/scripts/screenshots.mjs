// Capture the README / portfolio screenshots from a running app (fictional fixtures only).
// usage: npm run db:reset && npm run build && npm start, then: node scripts/send-samples.mjs && node scripts/screenshots.mjs [baseURL]
// Whichever triage provider the server runs is what the screenshots show; the pages label it.
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:4360";
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function session(context) {
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill("ana@tidebook.test");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return page;
}

// A full-page shot grows the viewport to the page's height first. Playwright's own fullPage mode keeps the
// viewport, so the sticky sidebar would end halfway down the image.
async function shot(page, name, { fullPage = false } = {}) {
  await page.waitForLoadState("networkidle");
  const viewport = page.viewportSize();
  if (fullPage) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, height) });
  }
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  if (fullPage) await page.setViewportSize(viewport);
  console.log(`${name}.png`);
}

async function open(page, subject) {
  await page.goto(`${base}/inbox?status=all`);
  await page.getByRole("link", { name: new RegExp(subject) }).first().click();
  await page.getByRole("heading", { level: 1 }).waitFor();
}

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" };
{
  const context = await browser.newContext(desktop);
  const login = await context.newPage();
  await login.goto(`${base}/login`);
  await shot(login, "01-login");

  const page = await session(context);
  await page.goto(`${base}/inbox`);
  await shot(page, "02-inbox", { fullPage: true });

  await open(page, "Charged twice for Plus this month");
  await shot(page, "03-triage-and-draft", { fullPage: true });

  await open(page, "Internal: new policy");
  await shot(page, "04-instruction-injection-flagged", { fullPage: true });

  // One approved reply, edited by the agent first, so the outbox and the history have something to show.
  await open(page, "Company name on invoices");
  await page.getByLabel("Reply").fill(
    "Hi Mina,\n\nCongratulations on the new name! Reply with the studio name exactly as it should appear, and I will update it. Invoices from then on will show it; ones already issued stay as they were.\n\nAna, The Tidebook team",
  );
  await page.getByRole("button", { name: "Approve & send" }).click();
  await page.getByRole("heading", { name: "Sent reply" }).waitFor();
  await shot(page, "05-approved-with-history", { fullPage: true });

  await page.goto(`${base}/outbox`);
  await shot(page, "06-outbox");

  await page.goto(`${base}/dashboard`);
  await shot(page, "07-dashboard", { fullPage: true });
  await context.close();
}

{
  const context = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "light" });
  const page = await session(context);
  await page.goto(`${base}/inbox`);
  await shot(page, "08-mobile-inbox");
  await open(page, "Delete my account and all data");
  await shot(page, "09-mobile-review");
  await context.close();
}

await browser.close();
