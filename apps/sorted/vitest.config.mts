import { defineConfig } from "vitest/config";

// The Claude eval makes paid API calls, so it exists only when asked for by name: `npm run eval:claude`.
const paidEval = process.argv.includes("eval-claude");

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
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
      // Not part of `npm test`: measures a provider against the labelled fixtures (see tests/eval).
      { test: { name: "eval", include: ["tests/eval/**/*.eval.ts"] } },
      ...(paidEval ? [{ test: { name: "eval-claude", include: ["tests/eval/**/*.eval.ts"], env: { EVAL_PROVIDER: "claude" } } }] : []),
    ],
  },
});
