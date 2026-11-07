import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { NewRequestForm } from "./NewRequestForm";

export const metadata: Metadata = { title: "New request" };

export default async function NewRequestPage() {
  const s = await getSession();
  return (
    <div className="max-w-2xl">
      <Link href="/requests" className="inline-flex min-h-6 items-center text-sm text-mute hover:text-ink">
        ← Requests
      </Link>
      <div className="mt-3">
        <PageHeader
          title="New request"
          description={`Approvers can sign off up to ${money(s.approverLimitCents)}. Larger amounts go to an admin or owner.`}
        />
      </div>
      <NewRequestForm />
    </div>
  );
}
