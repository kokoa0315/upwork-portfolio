// Deliver the fictional sample emails to the local webhook, signed the way a mail provider would sign them.
// usage: node scripts/send-samples.mjs [baseURL] [teamId]   (reads INBOUND_WEBHOOK_SECRET from .env.local)
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(app, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const base = process.argv[2] ?? "http://localhost:4360";
const team = process.argv[3] ?? "20000000-0000-4000-8000-000000000001";
const emails = JSON.parse(fs.readFileSync(path.join(app, "fixtures", "emails.json"), "utf8"));

for (const sample of emails) {
  const email = { id: sample.id, from: sample.from, subject: sample.subject, text: sample.text };
  const body = JSON.stringify(email);
  const ts = Math.floor(Date.now() / 1000);
  const sig = `sha256=${createHmac("sha256", env.INBOUND_WEBHOOK_SECRET).update(`${ts}.${team}.${body}`).digest("hex")}`;
  const res = await fetch(`${base}/api/inbound/${team}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sorted-timestamp": String(ts), "x-sorted-signature": sig },
    body,
  });
  console.log(email.id, res.status, await res.text());
}
