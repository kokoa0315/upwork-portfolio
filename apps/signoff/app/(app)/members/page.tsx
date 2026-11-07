import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, canManage } from "@/lib/session";
import { listMembers, listRoleEvents } from "@/lib/data";
import { date, dateTime, money } from "@/lib/format";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { RoleSelect } from "./RoleSelect";

export const metadata: Metadata = { title: "Members" };

const roleHelp = [
  ["Owner", "Everything, including granting or removing the owner role."],
  ["Admin", "Approves any amount and manages roles, except owners."],
  ["Approver", "Approves requests up to the approval limit."],
  ["Member", "Creates requests and sees only their own."],
];

export default async function MembersPage() {
  const s = await getSession();
  if (!canManage(s.role)) redirect("/dashboard");
  const [members, roleEvents] = await Promise.all([
    listMembers(s.orgId),
    listRoleEvents(s.orgId),
  ]);
  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} people in ${s.orgName}. Approval limit for approvers: ${money(s.approverLimitCents)}.`}
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_18rem]">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li
                key={m.profile.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <Avatar name={m.profile.full_name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.profile.full_name}{" "}
                    {m.profile.id === s.userId ? (
                      <span className="font-normal text-mute">(you)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-mute">
                    {m.profile.email} · joined {date(m.created_at)}
                  </p>
                </div>
                <RoleSelect
                  userId={m.profile.id}
                  role={m.role}
                  locked={
                    m.profile.id === s.userId ||
                    (s.role === "admin" && m.role === "owner")
                  }
                  canGrantOwner={s.role === "owner"}
                />
              </li>
            ))}
          </ul>
        </Card>
        <div className="grid gap-6">
          <Card className="h-fit p-5">
            <h2 className="text-sm font-semibold">What each role can do</h2>
            <dl className="mt-3 grid gap-3 text-sm">
              {roleHelp.map(([role, help]) => (
                <div key={role}>
                  <dt className="font-medium">{role}</dt>
                  <dd className="text-mute">{help}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="h-fit p-5">
            <h2 className="text-sm font-semibold">Role changes</h2>
            {roleEvents.length === 0 ? (
              <p className="mt-2 text-sm text-mute">
                No role changes yet. Each one is recorded here.
              </p>
            ) : (
              <ul className="mt-3 grid gap-3 text-sm">
                {roleEvents.map((e) => (
                  <li key={e.id}>
                    <p className="text-pretty">
                      <span className="font-medium">
                        {e.actor?.full_name ?? "Someone"}
                      </span>{" "}
                      changed{" "}
                      <span className="font-medium">
                        {e.member?.full_name ?? "a former member"}
                      </span>{" "}
                      from {e.old_role} to {e.new_role}
                    </p>
                    <p className="mt-0.5 text-xs text-mute">
                      {dateTime(e.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
