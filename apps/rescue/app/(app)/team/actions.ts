"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export type Result = { error?: string };

export async function setRole(userId: string, role: "owner" | "member"): Promise<Result> {
  const s = await getSession();
  if (s.role !== "owner") return { error: "Only owners can change roles." };
  // The database checks this again: only an owner of the same client, and never on their own row.
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { p_client: s.clientId, p_user: userId, p_role: role });
  if (error) return { error: error.code === "42501" ? "You can't change this person's role." : "Couldn't change the role. Try again." };
  revalidatePath("/team");
  return {};
}

export async function setNotify(on: boolean): Promise<Result> {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("memberships").update({ notify_on_invoice: on }).eq("client_id", s.clientId).eq("user_id", s.userId);
  if (error) return { error: "Couldn't save that setting. Try again." };
  revalidatePath("/team");
  return {};
}
