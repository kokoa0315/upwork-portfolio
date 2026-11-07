import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "approver" | "member";

export type Session = {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  orgName: string;
  approverLimitCents: number;
  role: Role;
};

// The signed-in user and their organization, read once per request.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, approver_limit_cents), profiles(full_name, email)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (error || !data?.organizations || !data.profiles) redirect("/login?error=no-organization");
  // Many-to-one embeds come back as objects; the generated-types-free client types them as arrays.
  const org = data.organizations as unknown as { id: string; name: string; approver_limit_cents: number };
  const profile = data.profiles as unknown as { full_name: string; email: string };

  return {
    userId: user.id,
    name: profile.full_name,
    email: profile.email,
    orgId: org.id,
    orgName: org.name,
    approverLimitCents: org.approver_limit_cents,
    role: data.role as Role,
  };
});

export const canReview = (role: Role) => role !== "member";
export const canManage = (role: Role) => role === "owner" || role === "admin";
