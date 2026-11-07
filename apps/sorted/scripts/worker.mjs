// Local stand-in for a cron job: ask the app to process ready triage jobs every 10 seconds.
// usage: node scripts/worker.mjs [baseURL]   (reads WORKER_SECRET from .env.local)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = /^WORKER_SECRET=(.*)$/m.exec(fs.readFileSync(path.join(app, ".env.local"), "utf8"))?.[1];
const base = process.argv[2] ?? "http://localhost:4360";

for (;;) {
  try {
    const res = await fetch(`${base}/api/worker`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    const out = await res.json();
    if (out.processed) console.log(new Date().toISOString(), JSON.stringify(out.outcomes.map((o) => o.outcome)));
  } catch (err) {
    console.error(new Date().toISOString(), err.message);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
