import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { getSession, canReview } from "@/lib/session";
import { approvedSpendByCategory, dashboardStats, listEvents, listRequests } from "@/lib/data";
import { categoryLabel, money, relative } from "@/lib/format";
import { Avatar, ButtonLink, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { EventLine } from "@/components/EventLine";

export const metadata: Metadata = { title: "Overview" };

export default async function Dashboard() {
  const s = await getSession();
  const reviewer = canReview(s.role);
  const [stats, queue, mine, events, categories] = await Promise.all([
    dashboardStats(s.orgId),
    reviewer ? listRequests({ orgId: s.orgId, status: "submitted", limit: 6 }) : Promise.resolve([]),
    listRequests({ orgId: s.orgId, mineOf: s.userId, limit: 5 }),
    listEvents({ orgId: s.orgId, limit: 6 }),
    approvedSpendByCategory(s.orgId, 90),
  ]);
  const toReview = queue.filter((r) => r.requester_id !== s.userId);

  const maxCat = Math.max(1, ...categories.map(([, v]) => v));
  const approvedTotal = categories.reduce((sum, [, v]) => sum + v, 0);

  return (
    <>
      <PageHeader
        title={`Good to see you, ${s.name.split(" ")[0]}`}
        description={reviewer ? `${toReview.length} request${toReview.length === 1 ? "" : "s"} waiting for your review.` : "Track what you've asked for and what's been decided."}
        action={
          <ButtonLink href="/requests/new">
            <Plus className="size-4" aria-hidden /> New request
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Awaiting review" value={stats.submitted?.n ?? 0} sub={money(stats.submitted?.total ?? 0)} tone="wait" />
        <Stat label="Approved" value={stats.approved?.n ?? 0} sub={money(stats.approved?.total ?? 0)} tone="ok" />
        <Stat label="Rejected" value={stats.rejected?.n ?? 0} sub={money(stats.rejected?.total ?? 0)} tone="no" />
        <Stat label="Drafts" value={stats.draft?.n ?? 0} sub={reviewer ? "across the team" : "only you can see these"} tone="mute" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        {reviewer ? (
          <Card>
            <SectionTitle title="Needs your review" href="/requests?status=submitted" />
            {toReview.length === 0 ? (
              <EmptyState title="You're all caught up">New requests will appear here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {toReview.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas/60">
                      <Avatar name={r.requester?.full_name ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-mute">
                          {r.requester?.full_name} · {categoryLabel[r.category]} · submitted {relative(r.submitted_at ?? r.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</p>
                        {s.role === "approver" && r.amount_cents > s.approverLimitCents ? <p className="text-[11px] text-wait">Above your limit</p> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card>
            <SectionTitle title="Your requests" href="/requests?mine=1" />
            {mine.length === 0 ? (
              <EmptyState title="No requests yet">Create one when you need to buy something for work.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {mine.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas/60">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-mute">{relative(r.created_at)}</p>
                      </div>
                      <StatusBadge status={r.status} />
                      <p className="w-20 text-right text-sm font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card>
          <div className="px-5 pt-4">
            <h2 className="text-sm font-semibold">Approved spend, last 90 days</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{money(approvedTotal)}</p>
          </div>
          {categories.length === 0 ? (
            <EmptyState title="Nothing approved yet" />
          ) : (
            <ul className="grid gap-3 px-5 pt-4 pb-5">
              {categories.map(([cat, cents]) => (
                <li key={cat} className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-3 text-sm">
                  <span className="text-ink-2">{categoryLabel[cat]}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-canvas">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(cents / maxCat) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{money(cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <SectionTitle title="Recent activity" href="/activity" />
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className="px-5 py-3">
              <EventLine event={e} withTitle />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "wait" | "ok" | "no" | "mute" }) {
  const dot = { wait: "bg-wait", ok: "bg-ok", no: "bg-no", mute: "bg-mute/40" }[tone];
  return (
    <Card className="px-5 py-4">
      <p className="flex items-center gap-2 text-sm text-mute">
        <span aria-hidden className={`size-2 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-mute tabular-nums">{sub}</p>
    </Card>
  );
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link href={href} className="inline-flex min-h-6 items-center gap-1 text-sm text-brand hover:underline">
        View all <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
