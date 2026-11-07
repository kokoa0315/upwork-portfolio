import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getRequest, listEvents } from "@/lib/data";
import { categoryLabel, date, money } from "@/lib/format";
import { Avatar, Card, StatusBadge } from "@/components/ui";
import { EventLine } from "@/components/EventLine";
import { DecisionPanel, RequesterActions } from "./RequestActions";

export const metadata: Metadata = { title: "Request" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await getSession();
  const [r, events] = await Promise.all([getRequest(id), listEvents({ requestId: id })]);
  // RLS returns nothing for requests this user may not see, which looks the same as "does not exist".
  if (!r) notFound();

  const mine = r.requester_id === s.userId;
  const reviewer = s.role !== "member";
  const overLimit = s.role === "approver" && r.amount_cents > s.approverLimitCents;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="min-w-0">
        <Link href="/requests" className="inline-flex min-h-6 items-center text-sm text-mute hover:text-ink">
          ← Requests
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <StatusBadge status={r.status} />
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">{r.title}</h1>
          </div>
          <p className="text-3xl font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</p>
        </div>

        <Card className="mt-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
            <Meta label="Requester">
              <span className="flex items-center gap-2">
                <Avatar name={r.requester?.full_name ?? "?"} />
                {r.requester?.full_name}
              </span>
            </Meta>
            <Meta label="Category">{categoryLabel[r.category]}</Meta>
            <Meta label="Created">{date(r.created_at)}</Meta>
            <Meta label="Submitted">{r.submitted_at ? date(r.submitted_at) : "Not yet"}</Meta>
            {r.decided_at ? (
              <Meta label={r.status === "approved" ? "Approved by" : "Rejected by"}>
                {r.decider?.full_name} · {date(r.decided_at)}
              </Meta>
            ) : null}
          </dl>
          <div className="border-t border-line p-5">
            <h2 className="text-sm font-semibold">Why it&apos;s needed</h2>
            <p className="mt-2 text-sm whitespace-pre-line text-ink-2">{r.description || "No details given."}</p>
          </div>
          {r.decision_note ? (
            <div className={`border-t border-line p-5 ${r.status === "rejected" ? "bg-no-soft/50" : ""}`}>
              <h2 className="text-sm font-semibold">Reviewer&apos;s note</h2>
              <p className="mt-2 text-sm text-ink-2">{r.decision_note}</p>
            </div>
          ) : null}
        </Card>

        <Card className="mt-6">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">History</h2>
          <ol className="grid gap-4 p-5">
            {events.map((e) => (
              <li key={e.id}>
                <EventLine event={e} />
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <aside className="grid content-start gap-4 xl:pt-9">
        {mine && (r.status === "draft" || r.status === "submitted") ? <RequesterActions id={r.id} status={r.status} /> : null}
        {reviewer && r.status === "submitted" && !mine ? <DecisionPanel id={r.id} overLimit={overLimit} limit={money(s.approverLimitCents)} /> : null}
        {reviewer && r.status === "submitted" && mine ? (
          <Card className="p-5 text-sm text-mute">You can&apos;t review your own request. Another approver will decide.</Card>
        ) : null}
        {!mine && !reviewer ? <Card className="p-5 text-sm text-mute">Only approvers can act on this request.</Card> : null}
      </aside>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
