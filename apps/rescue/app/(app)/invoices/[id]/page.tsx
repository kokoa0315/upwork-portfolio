import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoice } from "@/lib/data";
import { getSession } from "@/lib/session";
import { date, money } from "@/lib/format";
import { Card, StatusBadge } from "@/components/ui";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, invoice] = await Promise.all([getSession(), getInvoice(id)]);
  if (!invoice) notFound();

  return (
    <>
      <Link href="/invoices" className="inline-flex min-h-6 items-center text-sm text-mute hover:text-ink">
        ← All invoices
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-xs text-mute">{invoice.number}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{invoice.title}</h1>
              <p className="mt-1 text-sm text-mute">Billed to {s.clientName}</p>
            </div>
            <StatusBadge status={invoice.status} />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-mute">Amount</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{money(invoice.amount_cents)}</dd>
            </div>
            <div>
              <dt className="text-mute">Issued</dt>
              <dd className="mt-0.5">{date(invoice.issued_on)}</dd>
            </div>
            <div>
              <dt className="text-mute">Due</dt>
              <dd className={`mt-0.5 ${invoice.status === "overdue" ? "font-medium text-no" : ""}`}>{date(invoice.due_on)}</dd>
            </div>
          </dl>
          {invoice.memo ? (
            <div className="mt-8 border-t border-line pt-6 text-sm">
              <p className="text-mute">Memo</p>
              <p className="mt-1 leading-relaxed break-words">{invoice.memo}</p>
            </div>
          ) : null}
        </Card>
        <Card className="p-5 text-sm">
          <h2 className="font-semibold">Pay by bank transfer</h2>
          <dl className="mt-3 grid gap-2">
            <div className="flex justify-between gap-3">
              <dt className="text-mute">Reference</dt>
              <dd className="font-mono">{invoice.number}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-mute">Account</dt>
              <dd>Cobalt Studio LLC (demo)</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-mute">This is a demo portal. No real account details are shown.</p>
          <PrintButton />
        </Card>
      </div>
    </>
  );
}
