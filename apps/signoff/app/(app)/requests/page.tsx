import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getSession, canReview } from "@/lib/session";
import { listRequests } from "@/lib/data";
import { categoryLabel, date, money } from "@/lib/format";
import { Avatar, ButtonLink, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Requests" };

const filters = [
  ["", "All"],
  ["submitted", "Awaiting review"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["draft", "Drafts"],
  ["withdrawn", "Withdrawn"],
] as const;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; mine?: string }> }) {
  const s = await getSession();
  const sp = await searchParams;
  const status = filters.some(([k]) => k === sp.status) ? sp.status : "";
  const q = (sp.q ?? "").slice(0, 80);
  const mine = sp.mine === "1" || !canReview(s.role);
  const rows = await listRequests({ orgId: s.orgId, status: status || undefined, q: q || undefined, mineOf: mine ? s.userId : undefined });

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(status && { status }), ...(q && { q }), ...(sp.mine === "1" && { mine: "1" }), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/requests${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Requests"
        description={canReview(s.role) ? "Everything your team has asked to buy." : "Requests you have created."}
        action={
          <ButtonLink href="/requests/new">
            <Plus className="size-4" aria-hidden /> New request
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          {filters.map(([key, label]) => (
            <Link
              key={key || "all"}
              href={href({ status: key })}
              aria-current={status === key ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-sm ${status === key ? "bg-ink text-white" : "text-ink-2 hover:bg-canvas"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action="/requests" className="relative ml-auto w-full sm:w-64">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {sp.mine === "1" ? <input type="hidden" name="mine" value="1" /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search titles"
            aria-label="Search titles"
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-brand"
          />
        </form>
        {canReview(s.role) ? (
          <Link href={href({ mine: sp.mine === "1" ? "" : "1" })} className="inline-flex min-h-6 items-center text-sm text-brand hover:underline">
            {sp.mine === "1" ? "Show everyone's" : "Only mine"}
          </Link>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No requests match">Try another filter or clear the search.</EmptyState>
        ) : (
          <>
            {/* Phones and tablets get one card per request, so status and amount are never hidden off to the side. */}
            <ul className="divide-y divide-line lg:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="grid gap-1.5 px-4 py-3.5 active:bg-canvas">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{r.title}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
                      <StatusBadge status={r.status} />
                      <span>{r.requester?.full_name}</span>
                      <span>{categoryLabel[r.category]}</span>
                      <span className="tabular-nums">{date(r.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-canvas/60 text-left text-xs text-mute">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Request</th>
                    <th className="px-3 py-2.5 font-medium">Requester</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="group hover:bg-canvas/60">
                      <td className="px-5 py-3">
                        <Link href={`/requests/${r.id}`} className="inline-flex min-h-6 items-center font-medium group-hover:underline">
                          {r.title}
                        </Link>
                        <p className="text-xs text-mute">{categoryLabel[r.category]}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <Avatar name={r.requester?.full_name ?? "?"} />
                          <span className="truncate">{r.requester?.full_name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-3 text-mute tabular-nums">{date(r.created_at)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-mute">
        {rows.length} request{rows.length === 1 ? "" : "s"}
      </p>
    </>
  );
}
