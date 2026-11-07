import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadConfig, resetDatabase } from "../../../../devstack/lib.mjs";

// Start every run from the seed, and afterwards put the seed back and refill the demo inbox, so the app
// doesn't look empty after a test run. The stack (PostgREST + gateway) must already be running: `npm run stack`.
export default async function setup() {
  const app = path.resolve(__dirname, "../..");
  const cfg = loadConfig(app);
  await resetDatabase(cfg, { wait: true });
  return async () => {
    await resetDatabase(cfg, { wait: true });
    try {
      execFileSync(process.execPath, [path.join(app, "scripts/send-samples.mjs")], { cwd: app, stdio: "ignore" });
    } catch {
      console.log("Demo inbox not refilled (is the app running on :4360?). Run `npm run send-samples` to refill it.");
    }
  };
}
