"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** What the user typed, so a failed submit doesn't wipe the form (React resets form fields after an action). */
  values?: Record<string, string>;
};

const requestSchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters.").max(120, "Keep it under 120 characters."),
  category: z.enum(["software", "hardware", "travel", "services", "other"], { message: "Pick a category." }),
  amount: z
    .string()
    .transform((v) => v.replace(/[\s,$]/g, ""))
    .pipe(z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 1,250 or 1250.50."))
    .transform((v) => Math.round(Number(v) * 100))
    .refine((c) => c > 0 && c <= 100_000_000, "Amount must be between $0.01 and $1,000,000."),
  description: z.string().trim().max(2000, "Keep it under 2,000 characters.").default(""),
  intent: z.enum(["draft", "submit"]),
});

// The database functions raise short, human-readable messages, so they can be shown to the user.
const friendly = (message: string) => `${message.charAt(0).toUpperCase()}${message.slice(1)}${/[.!?]$/.test(message) ? "" : "."}`;

export async function createRequest(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = requestSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .insert({
      org_id: s.orgId,
      requester_id: s.userId,
      title: parsed.data.title,
      category: parsed.data.category,
      amount_cents: parsed.data.amount,
      description: parsed.data.description,
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message), values };
  if (parsed.data.intent === "submit") {
    const { error: submitError } = await supabase.rpc("submit_request", { p_id: data.id });
    if (submitError) return { error: friendly(submitError.message) };
  }
  revalidatePath("/", "layout");
  redirect(`/requests/${data.id}`);
}

async function runAction(id: string, fn: string, args: Record<string, unknown>): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_id: id, ...args });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  return {};
}

export async function submitRequest(id: string): Promise<FormState> {
  return runAction(id, "submit_request", {});
}

export async function withdrawRequest(id: string): Promise<FormState> {
  return runAction(id, "withdraw_request", {});
}

export async function decideRequest(id: string, _: FormState, form: FormData): Promise<FormState> {
  const decision = form.get("decision");
  const note = String(form.get("note") ?? "").slice(0, 500);
  if (decision !== "approved" && decision !== "rejected") return { error: "Choose approve or reject." };
  if (decision === "rejected" && !note.trim()) return { fieldErrors: { note: "Tell the requester why it was rejected." } };
  const result = await runAction(id, "decide_request", { p_decision: decision, p_note: note });
  return result.error ? { ...result, values: { note } } : result;
}

export async function deleteDraft(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("requests").delete({ count: "exact" }).eq("id", id).eq("status", "draft");
  if (error) return { error: friendly(error.message) };
  if (!count) return { error: "Only your own drafts can be deleted." };
  revalidatePath("/", "layout");
  redirect("/requests?mine=1");
}
