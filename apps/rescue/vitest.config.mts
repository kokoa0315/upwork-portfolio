import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          // Needs the local stack (`npm run stack`); resets the database first.
          globalSetup: ["tests/db/global-setup.ts"],
          // One database, so files run one after another.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
