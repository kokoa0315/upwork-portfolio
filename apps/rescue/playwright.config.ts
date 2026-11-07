import { defineConfig, devices } from "@playwright/test";

// Needs the local stack running (`npm run stack`). The suite resets the database first.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:4370", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/ },
  ],
  webServer: {
    command: "npx next dev --port 4370",
    url: "http://localhost:4370/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
