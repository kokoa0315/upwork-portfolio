"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; body?: string; done?: boolean };

const friendly = (message: string) => `${message.charAt(0).toUpperCase()}${message.slice(1)}${/[.!?]$/.test(message) ? "" : "."}`;

export async function approveReply(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const body = String(form.get("body") ?? "");
  if (!body.trim()) return { error: "Write a reply before approving.", body };
  if (body.length > 10_000) return { error: "Keep the reply under 10,000 characters.", body };
  const supabase = await createClient();
  // approve_reply locks the message, so two agents approving at once can't both send.
  const { error } = await supabase.rpc("approve_reply", { p_message: id, p_body: body });
  if (error) return { error: friendly(error.message), body };
  revalidatePath("/", "layout");
  return { done: true };
}

export async function dismissMessage(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_message", { p_message: id, p_reason: "Dismissed from the inbox" });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { done: true };
}

export async function requeueMessage(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("requeue_message", { p_message: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { done: true };
}
