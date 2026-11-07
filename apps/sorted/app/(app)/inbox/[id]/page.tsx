import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessage, listEvents, type EventRow } from "@/lib/data";
import { categoryLabel, dateTime, providerLabel } from "@/lib/format";
import { Avatar, Card, PriorityBadge, StatusBadge } from "@/components/ui";
import { FailedPanel, ReviewPanel } from "./ReviewPanel";

export const metadata: Metadata = { title: "Message" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [m, events] = await Promise.all([getMessage(id), listEvents(id)]);
  // RLS returns nothing for another team's message, so it looks the same as a missing one.
  if (!m) notFound();
  const t = m.triage;

  return (
    <>
      <Link href="/inbox" className="inline-flex min-h-6 items-center text-sm text-mute hover:text-ink">
        ← Inbox
      </Link>
      <div className="mt-3 grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={m.status} />
              {t ? <PriorityBadge priority={t.priority} /> : null}
              {t ? <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-2 ring-1 ring-line">{categoryLabel[t.category]}</span> : null}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance break-words">{m.subject || "(no subject)"}</h1>
          </header>

          {t ? (
            <Card className="border-ai/20 bg-ai-soft/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ai">{t.provider === "claude" ? "AI summary" : "Triage (rules mode)"}</h2>
                <p className="text-xs text-mute">
                  {providerLabel[t.provider] ?? t.provider} · {t.model}
                  {/* The rules mode has no real confidence, so it shows none. */}
                  {t.provider === "claude" ? ` · ${Math.round(t.confidence * 100)}% confident · ${t.input_tokens + t.output_tokens} tokens · ${(t.latency_ms / 1000).toFixed(1)} s` : ""}
                </p>
              </div>
              {/* The rules mode's "summary" is only the email's first line, already shown below; it explains itself instead. */}
              <p className="mt-2 text-sm text-pretty">
                {t.provider === "claude"
                  ? t.summary
                  : "Category and priority come from keyword rules, and the draft is a template. With a Claude API key, Claude writes the summary and the draft."}
              </p>
              {t.needs_human_reason ? (
                <p className="mt-3 rounded-lg bg-wait-soft px-3 py-2 text-sm text-wait">
                  <span className="font-medium">Needs a careful look:</span> {t.needs_human_reason}
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Avatar name={m.from_name ?? m.from_email} size="md" />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{m.from_name ?? m.from_email}</p>
                <p className="truncate text-mute">
                  {m.from_email} · {dateTime(m.received_at)}
                </p>
              </div>
            </div>
            {/* Rendered as plain text: email content is untrusted. */}
            <p className="px-5 py-4 text-sm leading-relaxed break-words whitespace-pre-wrap">{m.body}</p>
          </Card>

          <Card>
            <h2 className="border-b border-line px-5 py-4 text-sm font-semibold">History</h2>
            <ol className="grid gap-3 px-5 py-4">
              {events.map((e) => (
                <EventItem key={e.id} event={e} />
              ))}
            </ol>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:sticky xl:top-10">
          {m.status === "needs_review" && t ? <ReviewPanel id={m.id} draft={t.draft_reply} provider={providerLabel[t.provider] ?? t.provider} /> : null}
          {m.status === "failed" ? <FailedPanel id={m.id} error={m.job?.last_error ?? null} /> : null}
          {m.status === "queued" || m.status === "triaging" ? (
            <Card className="p-5 text-sm">
              <p className="font-medium">Waiting to be triaged</p>
              <p className="mt-1 text-mute">
                {m.job && m.job.attempts > 0 ? `Attempt ${m.job.attempts} failed; it will retry automatically.` : "This usually takes a few seconds. Refresh to check."}
              </p>
            </Card>
          ) : null}
          {m.reply ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Sent reply</h2>
              <p className="mt-1 text-xs text-mute">
                Approved by {m.reply.approver?.full_name ?? "a teammate"} · {dateTime(m.reply.approved_at)} · {m.reply.edited ? "edited before sending" : "draft sent as-is"}
              </p>
              <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">{m.reply.body}</p>
            </Card>
          ) : null}
          {m.status === "dismissed" ? (
            <Card className="p-5 text-sm text-mute">Dismissed. No reply was sent.</Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

const verbs: Record<string, string> = {
  received: "Email received via webhook",
  triaged: "Triaged",
  triage_retry: "Triage failed, will retry",
  triage_failed: "Triage gave up, handed to a person",
  requeued: "asked for a new draft",
  approved: "approved the reply",
  dismissed: "dismissed it",
};

function EventItem({ event: e }: { event: EventRow }) {
  const who = e.actor?.full_name;
  const detail =
    e.action === "triaged"
      ? `${categoryLabel[String(e.detail.category)] ?? e.detail.category}, ${e.detail.priority} · ${e.detail.model}`
      : e.action === "approved"
        ? e.detail.edited
          ? "edited the draft first"
          : "sent the draft as-is"
        : e.action === "triage_retry" || e.action === "triage_failed"
          ? String(e.detail.error ?? "")
          : null;
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-3 text-sm">
      {who ? <Avatar name={who} /> : <span aria-hidden className="mt-1.5 size-2 justify-self-center rounded-full bg-line" />}
      <div className="min-w-0">
        <p>
          {who ? <span className="font-medium">{who} </span> : null}
          {verbs[e.action] ?? e.action}
        </p>
        {detail ? <p className="text-xs break-words text-mute">{detail}</p> : null}
        <p className="text-xs text-mute">{dateTime(e.created_at)}</p>
      </div>
    </li>
  );
}
