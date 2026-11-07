import type { Metadata } from "next";
import Link from "next/link";
import { listInvoices } from "@/lib/data";
import { date, money } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  const open = invoices.filter((i) => i.status !== "paid");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const paid = invoices.filter((i) => i.status === "paid");
  const sum = (list: typeof invoices) => money(list.reduce((a, i) => a + i.amount_cents, 0));

  return (
    <>
      <PageHeader title="Invoices" description="Everything Cobalt Studio has billed you, newest first." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Outstanding" value={sum(open)} note={`${open.length} invoices`} />
        <Stat label="Overdue" value={sum(overdue)} note={overdue.length ? "Please pay these first" : "Nothing overdue"} tone={overdue.length ? "no" : undefined} />
        <Stat label="Paid" value={sum(paid)} note={`${paid.length} invoices`} />
      </div>
      <Card>
        {invoices.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <>
            {/* Phones get a list; the table needs about 900px. */}
            <ul className="divide-y divide-line md:hidden">
              {invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`/invoices/${i.id}`} className="grid gap-1.5 px-4 py-4 active:bg-canvas">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium">{i.title}</span>
                      <span className="shrink-0 font-medium tabular-nums">{money(i.amount_cents)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
                      <StatusBadge status={i.status} />
                      <span className="font-mono">{i.number}</span>
                      <span>Due {date(i.due_on)}</span>
                    </span>
                    {i.memo ? <span className="line-clamp-2 text-sm text-mute [overflow-wrap:anywhere]">{i.memo}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-line text-left text-xs text-mute">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-3 py-3 font-medium">Issued</th>
                  <th className="px-3 py-3 font-medium">Due</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Memo</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{i.title}</p>
                      <p className="font-mono text-xs text-mute">{i.number}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-2">{date(i.issued_on)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-2">{date(i.due_on)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="max-w-80 px-3 py-3 text-mute [overflow-wrap:anywhere]">{i.memo || "—"}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{money(i.amount_cents)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/invoices/${i.id}`} aria-label={`View ${i.number}, ${i.title}`} className="inline-flex min-h-6 items-center font-medium text-brand hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "no" }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-mute">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "no" ? "text-no" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-mute">{note}</p>
    </Card>
  );
}
