import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { listTeam } from "@/lib/data";
import { roleLabel } from "@/lib/format";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { NotifyToggle, RoleSelect } from "./TeamControls";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const s = await getSession();
  const team = await listTeam(s.clientId);
  const me = team.find((m) => m.user_id === s.userId);

  return (
    <>
      <PageHeader title="Team" description={`People at ${s.clientName} who can see these invoices.`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Card>
          <ul className="divide-y divide-line">
            {team.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <Avatar name={m.profile.full_name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.profile.full_name}
                    {m.user_id === s.userId ? <span className="text-mute"> (you)</span> : null}
                  </p>
                  <p className="truncate text-sm text-mute">{m.profile.email}</p>
                </div>
                {s.role === "owner" && m.user_id !== s.userId ? (
                  <RoleSelect userId={m.user_id} name={m.profile.full_name} role={m.role} />
                ) : (
                  <span className="text-sm text-ink-2">{roleLabel[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Your notifications</h2>
          <div className="mt-3">
            <NotifyToggle on={me?.notify_on_invoice ?? true} />
          </div>
          <p className="mt-4 text-xs text-mute">Owners can change who is an owner. Only owners see a role menu.</p>
        </Card>
      </div>
    </>
  );
}
