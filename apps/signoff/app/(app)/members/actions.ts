"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

const input = z.object({ userId: z.uuid(), role: z.enum(["owner", "admin", "approver", "member"]) });

export async function setRole(userId: string, role: string): Promise<{ error?: string }> {
  const parsed = input.safeParse({ userId, role });
  if (!parsed.success) return { error: "That role change isn't valid." };
  const s = await getSession();
  const supabase = await createClient();
  // set_member_role enforces who may change what, including "keep at least one owner".
  const { error } = await supabase.rpc("set_member_role", { p_org: s.orgId, p_user: parsed.data.userId, p_role: parsed.data.role });
  if (error) return { error: `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.` };
  revalidatePath("/members");
  return {};
}
