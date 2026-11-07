import { createClient } from "@/lib/supabase/server";

export type InvoiceStatus = "open" | "overdue" | "paid";
export type Invoice = {
  id: string;
  number: string;
  title: string;
  issued_on: string;
  due_on: string;
  amount_cents: number;
  status: InvoiceStatus;
  memo: string;
};

const columns = "id, number, title, issued_on, due_on, amount_cents, status, memo";

// Row Level Security decides which invoices come back; the query doesn't filter by client itself.
export async function listInvoices(): Promise<Invoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").select(columns).order("issued_on", { ascending: false });
  if (error) throw error;
  return data as Invoice[];
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").select(columns).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Invoice | null;
}

export type Member = { user_id: string; role: "owner" | "member"; notify_on_invoice: boolean; profile: { full_name: string; email: string } };

export async function listTeam(clientId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, notify_on_invoice, profile:profiles(full_name, email)")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) throw error;
  return data as unknown as Member[];
}
