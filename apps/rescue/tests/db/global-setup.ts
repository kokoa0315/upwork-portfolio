import path from "node:path";
import { loadConfig, resetDatabase } from "../../../../devstack/lib.mjs";

// Start every run from the seed, and put the seed back afterwards so the demo shows no test rows.
// The stack (PostgREST + gateway) must already be running: `npm run stack`.
export default async function setup() {
  const cfg = loadConfig(path.resolve(__dirname, "../.."));
  await resetDatabase(cfg, { wait: true });
  return () => resetDatabase(cfg, { wait: true });
}
