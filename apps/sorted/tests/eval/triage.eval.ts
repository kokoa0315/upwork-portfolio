import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import samples from "../../fixtures/emails.json";
import { claudeProvider } from "../../lib/triage/claude";
import { rulesProvider } from "../../lib/triage/rules";
import type { TriageRun } from "../../lib/triage/schema";

// Measures one provider against the expected labels in fixtures/emails.json and writes docs/eval/<provider>.{json,md}.
//   npm run eval            rules provider (offline, free)
//   npm run eval:claude     Claude (needs ANTHROPIC_API_KEY in .env.local; 12 paid requests)
const app = path.resolve(__dirname, "../..");
const which = process.env.EVAL_PROVIDER === "claude" ? "claude" : "rules";
if (which === "claude") process.loadEnvFile(path.join(app, ".env.local"));

// Opus 5.5 list prices, USD per million tokens.
const PRICE = { input: 4, output: 20 };

it(`triage accuracy: ${which}`, { timeout: 15 * 60_000 }, async () => {
  const provider = which === "claude" ? claudeProvider() : rulesProvider;
  const rows: { id: string; expected: (typeof samples)[number]["expected"]; got?: TriageRun; error?: string }[] = [];
  for (const s of samples) {
    try {
      const got = await provider.triage({ subject: s.subject, body: s.text, fromEmail: s.from.email, fromName: s.from.name ?? null });
      rows.push({ id: s.id, expected: s.expected, got });
    } catch (err) {
      rows.push({ id: s.id, expected: s.expected, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const ok = rows.filter((r) => r.got);
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const flagged = rows.filter((r) => r.expected.needs_human);
  const summary = {
    provider: which,
    model: ok[0]?.got?.model ?? null,
    ran_at: new Date().toISOString(),
    emails: rows.length,
    errors: count((r) => !!r.error),
    category_correct: count((r) => r.got?.category === r.expected.category),
    priority_correct: count((r) => r.got?.priority === r.expected.priority),
    needs_human_caught: count((r) => r.expected.needs_human && r.got?.needs_human_reason != null),
    needs_human_expected: flagged.length,
    false_flags: count((r) => !r.expected.needs_human && r.got?.needs_human_reason != null),
    input_tokens: ok.reduce((a, r) => a + r.got!.input_tokens, 0),
    output_tokens: ok.reduce((a, r) => a + r.got!.output_tokens, 0),
    median_latency_ms: median(ok.map((r) => r.got!.latency_ms)),
  };
  const cost = (summary.input_tokens * PRICE.input + summary.output_tokens * PRICE.output) / 1e6;

  const out = path.join(app, "docs/eval");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${which}.json`), JSON.stringify({ summary: { ...summary, cost_usd: round(cost) }, rows }, null, 2) + "\n");
  const md = [
    `# Triage eval: ${which}${summary.model ? ` (${summary.model})` : ""}`,
    "",
    `Run ${summary.ran_at} on the ${rows.length} fictional emails in \`fixtures/emails.json\`. Labels were written by hand before the run.`,
    "",
    "| | Result |",
    "|---|---|",
    `| Category correct | ${summary.category_correct} / ${rows.length} |`,
    `| Priority correct | ${summary.priority_correct} / ${rows.length} |`,
    `| Must-escalate emails flagged for a person | ${summary.needs_human_caught} / ${summary.needs_human_expected} |`,
    `| Flagged without needing it | ${summary.false_flags} |`,
    `| Errors | ${summary.errors} |`,
    `| Tokens in / out | ${summary.input_tokens} / ${summary.output_tokens} |`,
    `| Cost (list price) | $${cost.toFixed(4)} |`,
    `| Median latency | ${summary.median_latency_ms ?? "-"} ms |`,
    "",
    "| Email | Expected | Got | Flag |",
    "|---|---|---|---|",
    ...rows.map((r) => {
      const exp = `${r.expected.category}, ${r.expected.priority}${r.expected.needs_human ? ", escalate" : ""}`;
      if (!r.got) return `| ${r.id} | ${exp} | error: ${r.error} | |`;
      const mark = (a: string, b: string) => (a === b ? a : `**${a}**`);
      return `| ${r.id} | ${exp} | ${mark(r.got.category, r.expected.category)}, ${mark(r.got.priority, r.expected.priority)} | ${r.got.needs_human_reason ?? ""} |`;
    }),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(out, `${which}.md`), md);

  // The one hard requirement: anything that must reach a person (refunds, deletion requests, injection attempts) is flagged.
  expect(summary.errors).toBe(0);
  expect(summary.needs_human_caught).toBe(summary.needs_human_expected);
});

function median(xs: number[]) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
const round = (x: number) => Math.round(x * 10_000) / 10_000;
