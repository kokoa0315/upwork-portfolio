// Run the database tests against the schema as it shipped (migrations up to 0002, without the 0003 fix).
// They are expected to fail: that is the reproduction. The fixed schema is rebuilt afterwards.
import { spawnSync } from "node:child_process";
import path from "node:path";

const app = path.resolve(import.meta.dirname, "..");
const vitest = path.resolve(app, "../../node_modules/vitest/vitest.mjs");
const cli = path.resolve(app, "../../devstack/cli.mjs");
const { status } = spawnSync(process.execPath, [vitest, "run", "--project", "db"], {
  cwd: app,
  stdio: "inherit",
  env: { ...process.env, DEVSTACK_UNTIL: "0002_policies.sql" },
});
spawnSync(process.execPath, [cli, "reset", "--wait"], { cwd: app, stdio: "inherit", env: { ...process.env, DEVSTACK_UNTIL: "" } });
console.log(status === 0 ? "\nUnexpected: the shipped schema passed." : "\nAs expected, the shipped schema fails the tests above.");
