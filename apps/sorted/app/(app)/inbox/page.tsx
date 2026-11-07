import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { listMessages, type Status } from "@/lib/data";
import { categoryLabel, providerLabel, relative } from "@/lib/format";
import { Card, EmptyState, PageHeader, PriorityBadge, StatusBadge, statusText } from "@/components/ui";

export const metadata: Metadata = { title: "Inbox" };

const filters: (Status | "all")[] = ["needs_review", "all", "replied", "dismissed", "failed"];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await getSession();
  const { status: raw } = await searchParams;
  const status = (filters.includes(raw as Status) ? raw : "needs_review") as Status | "all";
  const messages = await listMessages({ teamId: s.teamId, status: status === "all" ? undefined : status });

  return (
    <>
      <PageHeader title="Inbox" description="Sorted by priority. Triage suggests a reply; nothing is sent until a person approves it." />
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1">
        {filters.map((f) => (
          <Link
            key={f}
            href={f === "needs_review" ? "/inbox" : `/inbox?status=${f}`}
            aria-current={status === f ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${status === f ? "bg-ink text-white" : "text-ink-2 hover:bg-surface"}`}
          >
            {f === "all" ? "All" : statusText[f]}
          </Link>
        ))}
      </nav>
      <Card className="overflow-hidden">
        {messages.length === 0 ? (
          <EmptyState title={status === "needs_review" ? "Nothing waiting for review" : "No messages here"}>New email appears here once it has been triaged.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {messages.map((m) => (
              <li key={m.id}>
                <Link href={`/inbox/${m.id}`} className="grid grid-cols-1 gap-1.5 px-5 py-4 hover:bg-canvas sm:grid-cols-[5.5rem_1fr_auto] sm:gap-4">
                  <div className="flex items-center gap-2 sm:block">
                    {m.triage ? <PriorityBadge priority={m.triage.priority} /> : <StatusBadge status={m.status} />}
                  </div>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{m.from_name ?? m.from_email}</span>
                      <span className="truncate text-ink-2">{m.subject}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-mute">{m.triage?.summary ?? "Waiting to be triaged."}</p>
                    {m.triage?.needs_human_reason ? <p className="mt-1 text-xs font-medium text-wait">Flagged: {m.triage.needs_human_reason}</p> : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-mute sm:grid sm:justify-items-end sm:gap-1.5">
                    {m.triage ? <span className="rounded bg-canvas px-1.5 py-0.5 text-ink-2">{categoryLabel[m.triage.category]}</span> : null}
                    {status === "all" && m.triage ? <StatusBadge status={m.status} /> : null}
                    <span>
                      {m.triage?.provider === "rules" ? `${providerLabel.rules} · ` : ""}
                      {relative(m.received_at)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
