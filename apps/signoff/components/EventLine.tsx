import Link from "next/link";
import type { EventRow } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { Avatar } from "@/components/ui";

const verb: Record<EventRow["action"], string> = {
  created: "created",
  submitted: "submitted",
  withdrawn: "withdrew",
  approved: "approved",
  rejected: "rejected",
  deleted: "deleted the draft",
};

const tone: Record<EventRow["action"], string> = {
  created: "text-ink-2",
  submitted: "text-wait",
  withdrawn: "text-mute",
  approved: "text-ok",
  rejected: "text-no",
  deleted: "text-mute",
};

export function EventLine({ event: e, withTitle = false, deletedTitle }: { event: EventRow; withTitle?: boolean; deletedTitle?: string | null }) {
  const who = e.actor?.full_name ?? "Someone";
  // A deleted draft keeps its entries; its title lives in the note of the 'deleted' entry.
  const deleted = e.action === "deleted";
  return (
    <div className="flex gap-3">
      <Avatar name={who} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-pretty">
          <span className="font-medium">{who}</span> <span className={tone[e.action]}>{verb[e.action]}</span>{" "}
          {deleted ? (
            <span className="font-medium">{e.note}</span>
          ) : withTitle && e.request ? (
            <Link href={`/requests/${e.request_id}`} className="font-medium hover:underline">
              {e.request.title}
            </Link>
          ) : withTitle && deletedTitle ? (
            <>
              <span className="font-medium">{deletedTitle}</span> <span className="text-mute">(draft, later deleted)</span>
            </>
          ) : withTitle ? (
            <span className="text-mute">a draft that was later deleted</span>
          ) : (
            "this request"
          )}
        </p>
        {e.note && !deleted ? <p className="mt-1 rounded-md bg-canvas px-2.5 py-1.5 text-ink-2">“{e.note}”</p> : null}
        <p className="mt-0.5 text-xs text-mute">{dateTime(e.created_at)}</p>
      </div>
    </div>
  );
}
