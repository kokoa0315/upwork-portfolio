import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { teamOverview } from "@/lib/data";
import { categoryLabel } from "@/lib/format";
import { CLAUDE_MODEL } from "@/lib/triage/claude";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };

// Claude Opus 5.5 list price per million tokens (input, output), for the estimate below.
const PRICE_IN = 4;
const PRICE_OUT = 20;

export default async function Dashboard() {
  const s = await getSession();
  const o = await teamOverview(s.teamId);
  const maxCat = Math.max(1, ...o.byCategory.map(([, n]) => n));
  const cost = (o.claude.inputTokens * PRICE_IN + o.claude.outputTokens * PRICE_OUT) / 1_000_000;

  return (
    <>
      <PageHeader title={`Hi ${s.name.split(" ")[0]}`} description={`${o.byStatus.needs_review ?? 0} messages waiting for review in ${s.teamName}.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Needs review" value={o.byStatus.needs_review ?? 0} href="/inbox" tone="text-wait" />
        <Stat label="Flagged for a person" value={o.flagged} sub="refunds, privacy, injection attempts" tone="text-wait" />
        <Stat label="Replied" value={o.byStatus.replied ?? 0} href="/outbox" tone="text-ok" />
        <Stat label="Triage failed" value={o.byStatus.failed ?? 0} href="/inbox?status=failed" tone="text-no" />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">What came in</h2>
          <p className="mt-1 text-sm text-mute">{o.triaged} messages triaged</p>
          <ul className="mt-4 grid gap-3">
            {o.byCategory.map(([cat, n]) => (
              <li key={cat} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate text-ink-2">{categoryLabel[cat] ?? cat}</span>
                <span className="h-2 rounded-full bg-canvas">
                  <span className="block h-2 rounded-full bg-brand" style={{ width: `${(n / maxCat) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">How the drafts were used</h2>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {o.replies.total === 0 ? "—" : `${Math.round((o.replies.unedited / o.replies.total) * 100)}%`}
          </p>
          <p className="text-sm text-mute">
            of {o.replies.total} approved replies were sent without edits ({o.replies.unedited} as-is, {o.replies.total - o.replies.unedited} edited)
          </p>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-mute">Claude runs</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{o.claude.runs}</dd>
            </div>
            <div>
              <dt className="text-mute">Median time</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{o.claude.runs ? `${(o.claude.medianLatencyMs / 1000).toFixed(1)} s` : "—"}</dd>
            </div>
            <div>
              <dt className="text-mute">Est. cost</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{o.claude.runs ? `$${cost.toFixed(3)}` : "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-mute">
            {o.claude.runs
              ? `${CLAUDE_MODEL} at list price ($${PRICE_IN} / $${PRICE_OUT} per million input / output tokens), from the token counts the API returned.`
              : "No Claude runs yet: this data came from the offline rules provider."}
          </p>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, sub, href, tone }: { label: string; value: number; sub?: string; href?: string; tone: string }) {
  const inner = (
    <>
      <p className="text-sm text-mute">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${value ? tone : "text-ink"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-mute">{sub}</p> : null}
      {href ? <ArrowRight aria-hidden className="absolute top-4 right-4 size-4 text-mute" /> : null}
    </>
  );
  return href ? (
    <Link href={href} className="relative rounded-xl border border-line bg-surface p-4 hover:border-ink/20">
      {inner}
    </Link>
  ) : (
    <div className="relative rounded-xl border border-line bg-surface p-4">{inner}</div>
  );
}
