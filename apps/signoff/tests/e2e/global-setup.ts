import { execFileSync } from "node:child_process";
import path from "node:path";

// Playwright loads this as CommonJS, so reset through the CLI rather than importing devstack/lib.mjs.
// --wait returns once the running stack serves the freshly migrated schema.
// Reset before the run, and again afterwards so the demo shows no test rows.
export default async function setup() {
  const app = path.resolve(__dirname, "../..");
  const reset = () => execFileSync(process.execPath, [path.join(app, "../../devstack/cli.mjs"), "reset", "--wait"], { cwd: app, stdio: "inherit" });
  reset();
  return reset;
}
