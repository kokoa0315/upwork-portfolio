import type { Metadata } from "next";
import { getSession, canReview } from "@/lib/session";
import { listEvents } from "@/lib/data";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { EventLine } from "@/components/EventLine";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const s = await getSession();
  const events = await listEvents({ orgId: s.orgId, limit: 200 });
  // A deleted draft's title is kept only on its 'deleted' entry; show it on the draft's earlier entries too.
  const deletedTitles = new Map(events.filter((e) => e.action === "deleted").map((e) => [e.request_ref, e.note]));
  return (
    <>
      <PageHeader
        title="Activity"
        description={
          canReview(s.role)
            ? "Every change to every request, newest first. Entries can't be edited or deleted."
            : "Changes to your requests, newest first."
        }
      />
      <Card>
        {events.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ol className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3.5">
                <EventLine event={e} withTitle deletedTitle={deletedTitles.get(e.request_ref)} />
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
