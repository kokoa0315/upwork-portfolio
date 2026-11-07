import { expect, test } from "@playwright/test";
import { signIn, signOut } from "./helpers";

test("signed-out visitors are sent to the login page and back", async ({ page }) => {
  await page.goto("/requests");
  await expect(page).toHaveURL(/\/login\?next=%2Frequests/);
  await signIn(page, "priya", "/requests");
  await expect(page).toHaveURL(/\/requests$/);
});

test("wrong password shows an error and stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("priya@northwind.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("a member submits a request, an approver approves it, the member sees the result", async ({ page }) => {
  const title = `Figma seats ${Date.now()}`;

  await signIn(page, "priya");
  await page.goto("/requests/new");
  await page.getByLabel("What do you need?").fill(title);
  await page.getByLabel("Category").selectOption("software");
  await page.getByLabel("Amount (USD)").fill("1,250.00");
  await page.getByLabel("Why is it needed?").fill("Two more editors join the design team in December.");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Awaiting review").first()).toBeVisible();
  const url = page.url();
  await signOut(page);

  await signIn(page, "marcus");
  // It's in Marcus's review queue on the overview.
  await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
  await page.goto(url);
  await page.getByLabel("Note to the requester").fill("Approved. Use the team plan.");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await signOut(page);

  await signIn(page, "priya");
  await page.goto(url);
  await expect(page.getByText("Approved").first()).toBeVisible();
  await expect(page.getByText("Approved. Use the team plan.").first()).toBeVisible();
  await expect(page.getByText(/Marcus .* approved/)).toBeVisible();
});

test("a rejection needs a note", async ({ page }) => {
  await signIn(page, "marcus");
  await page.goto("/requests?status=submitted");
  const row = page.getByRole("row").filter({ hasText: /Priya|Diego/ }).first();
  await row.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Tell the requester why it was rejected.")).toBeVisible();
  await expect(page.getByText("Awaiting review").first()).toBeVisible();
});

test("above the approval limit, an approver can't approve", async ({ page }) => {
  await signIn(page, "priya");
  await page.goto("/requests/new");
  await page.getByLabel("What do you need?").fill(`Workstation ${Date.now()}`);
  await page.getByLabel("Category").selectOption("hardware");
  await page.getByLabel("Amount (USD)").fill("7500");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Awaiting review").first()).toBeVisible();
  const url = page.url();
  await signOut(page);

  await signIn(page, "marcus");
  await page.goto(url);
  await expect(page.getByText(/above your .* approval limit/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  await signOut(page);

  await signIn(page, "hana");
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
});

test("members don't get admin pages, and can't open other people's requests", async ({ page }) => {
  await signIn(page, "marcus");
  await page.goto("/requests?status=submitted");
  const diegos = page.getByRole("row").filter({ hasText: "Diego" }).first();
  await diegos.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const diegoTitle = await page.getByRole("heading", { level: 1 }).innerText();
  const diegoUrl = page.url();
  await signOut(page);

  await signIn(page, "priya");
  await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
  await page.goto("/members");
  await expect(page).toHaveURL(/\/dashboard/);
  // RLS hides the row, so the page can't tell "someone else's" from "doesn't exist".
  await page.goto(diegoUrl);
  await expect(page.getByRole("heading", { name: "Request not found" })).toBeVisible();
  await expect(page.getByText(diegoTitle)).toHaveCount(0);
});

test("another organization sees none of this one", async ({ page }) => {
  await signIn(page, "sam");
  await expect(page.getByText("Contoso Labs").first()).toBeVisible();
  await page.goto("/requests");
  await expect(page.getByText("Northwind")).toHaveCount(0);
  await expect(page.getByRole("row")).toHaveCount(2); // header + Contoso's one draft
});

test("an admin changes a role and the change is enforced", async ({ page }) => {
  await signIn(page, "hana");
  await page.goto("/members");
  const diego = page.getByRole("listitem").filter({ hasText: "diego@northwind.test" });
  await diego.getByLabel("Role").selectOption("approver");
  await expect(diego.getByLabel("Role")).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "diego@northwind.test" }).getByLabel("Role")).toHaveValue("approver");
  await expect(page.getByText(/^Hana \S+ changed Diego \S+ from member to approver$/).first()).toBeVisible();
  // Admins can't demote an owner: Olivia's row is locked.
  await expect(page.getByRole("listitem").filter({ hasText: "olivia@northwind.test" }).getByLabel("Role")).toBeDisabled();
  await page.getByRole("listitem").filter({ hasText: "diego@northwind.test" }).getByLabel("Role").selectOption("member");
});

// Both reach the browser as "//evil.invalid", another host: a backslash reads as a slash, and "/./" collapses.
// More cases, including encoded dots, are in tests/unit/safe-next.test.ts.
for (const next of ["/\\evil.invalid/x", "/.//evil.invalid/x"]) {
  test(`signing in never sends people to another site: ${next}`, async ({ page }) => {
    await signIn(page, "priya", next);
    await expect(page).toHaveURL("/dashboard");
  });
}
