// Run the browser tests against the code as it shipped: a temporary copy of this app with the files in
// case/before/ restored and the schema built only up to 0002 (without the 0003 fix). Production build on :4370.
// They are expected to fail: that is the reproduction. The copy is removed and the fixed schema rebuilt afterwards.
//
// usage: node scripts/reproduce-before-e2e.mjs [--shots]   (needs `npm run stack`; :4370 must be free)
//   --shots   also saves the "before" screenshots into case/shots/
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const app = path.resolve(import.meta.dirname, "..");
const copy = path.resolve(app, "../rescue-before-tmp");
const root = path.resolve(app, "../..");
const next = path.join(root, "node_modules/next/dist/bin/next");
const cli = path.join(root, "devstack/cli.mjs");
const shipped = { ...process.env, DEVSTACK_UNTIL: "0002_policies.sql" };
const skip = new Set([".next", "node_modules", "test-results", "playwright-report", "shots"]);

const run = (args, opts) => spawnSync(process.execPath, args, { stdio: "inherit", ...opts });
const portFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false));
    s.listen(port, () => s.close(() => resolve(true)));
  });

if (!(await portFree(4370))) {
  console.error("Port 4370 is in use. Stop the running app first (the tests would otherwise hit the fixed version).");
  process.exit(2);
}

fs.rmSync(copy, { recursive: true, force: true });
fs.cpSync(app, copy, { recursive: true, filter: (src) => !skip.has(path.basename(src)) });
fs.cpSync(path.join(app, "case/before"), copy, { recursive: true });
const pkg = path.join(copy, "package.json");
fs.writeFileSync(pkg, fs.readFileSync(pkg, "utf8").replace('"name": "rescue"', '"name": "rescue-before-tmp"'));

let server;
let status = 1;
try {
  run([cli, "reset", "--wait"], { cwd: copy, env: shipped });
  if (run([next, "build"], { cwd: copy, stdio: ["ignore", "ignore", "inherit"] }).status !== 0) throw new Error("build failed");
  server = spawn(process.execPath, [next, "start", "--port", "4370"], { cwd: copy, stdio: "ignore" });
  for (let i = 0; i < 60 && (await portFree(4370)); i++) await new Promise((r) => setTimeout(r, 500));

  const playwright = path.join(root, "node_modules/@playwright/test/cli.js");
  status = run([playwright, "test", "--reporter=line"], { cwd: copy, env: shipped }).status;

  if (process.argv.includes("--shots")) {
    run([cli, "reset", "--wait"], { cwd: copy, env: shipped });
    run([path.join(copy, "scripts/case-shots.mjs"), "before"], { cwd: copy });
    for (const f of fs.readdirSync(path.join(copy, "case/shots"))) {
      if (f.startsWith("before-")) fs.copyFileSync(path.join(copy, "case/shots", f), path.join(app, "case/shots", f));
    }
  }
} finally {
  server?.kill();
  await new Promise((r) => setTimeout(r, 1500));
  fs.rmSync(copy, { recursive: true, force: true });
  run([cli, "reset", "--wait"], { cwd: app, env: { ...process.env, DEVSTACK_UNTIL: "" } });
}
console.log(status === 0 ? "\nUnexpected: the shipped code passed." : "\nAs expected, the shipped code fails the tests above.");
