import { execFileSync } from "node:child_process";
import path from "node:path";

// Playwright loads this as CommonJS, so reset through the CLI rather than importing devstack/lib.mjs.
// --wait returns once the running stack serves the freshly migrated schema.
// Reset before the run; afterwards reset again and refill the demo inbox, so the app doesn't look empty.
export default async function setup() {
  const app = path.resolve(__dirname, "../..");
  const run = (...args: string[]) => execFileSync(process.execPath, args, { cwd: app, stdio: "inherit" });
  run(path.join(app, "../../devstack/cli.mjs"), "reset", "--wait");
  return () => {
    run(path.join(app, "../../devstack/cli.mjs"), "reset", "--wait");
    run(path.join(app, "scripts/send-samples.mjs"));
  };
}
