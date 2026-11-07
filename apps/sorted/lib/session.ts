import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Session = { userId: string; name: string; email: string; teamId: string; teamName: string };

// The signed-in user and their team, read once per request.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("memberships")
    .select("teams(id, name), profiles(full_name, email)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (error || !data?.teams || !data.profiles) redirect("/login?error=no-team");
  // Many-to-one embeds come back as objects; the generated-types-free client types them as arrays.
  const team = data.teams as unknown as { id: string; name: string };
  const profile = data.profiles as unknown as { full_name: string; email: string };
  return { userId: user.id, name: profile.full_name, email: profile.email, teamId: team.id, teamName: team.name };
});
