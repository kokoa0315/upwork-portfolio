import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "member";

export type Session = {
  userId: string;
  name: string;
  email: string;
  clientId: string;
  clientName: string;
  role: Role;
};

// The signed-in user and the client company they belong to, read once per request.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("memberships")
    .select("role, clients(id, name), profiles(full_name, email)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (error || !data?.clients || !data.profiles) redirect("/login?error=no-client");
  const client = data.clients as unknown as { id: string; name: string };
  const profile = data.profiles as unknown as { full_name: string; email: string };

  return { userId: user.id, name: profile.full_name, email: profile.email, clientId: client.id, clientName: client.name, role: data.role as Role };
});
