import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { listReplies } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Outbox" };

export default async function OutboxPage() {
  const s = await getSession();
  const replies = await listReplies(s.teamId);
  return (
    <>
      <PageHeader title="Outbox" description="Replies a person approved. This demo records them instead of emailing anyone." />
      <Card className="overflow-hidden">
        {replies.length === 0 ? (
          <EmptyState title="No replies yet" />
        ) : (
          <ul className="divide-y divide-line">
            {replies.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <Link href={`/inbox/${r.message.id}`} className="inline-flex min-h-6 min-w-0 items-center font-medium break-words hover:underline">
                    Re: {r.message.subject}
                  </Link>
                  <span className="text-xs text-mute">{dateTime(r.approved_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-mute">
                  To {r.message.from_name ?? r.message.from_email} · approved by {r.approver?.full_name ?? "a teammate"} ·{" "}
                  <span className={r.edited ? "text-ink-2" : "text-ok"}>{r.edited ? "edited draft" : "draft as-is"}</span>
                </p>
                <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap text-ink-2">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
