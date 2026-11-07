import { createClient } from "@/lib/supabase/server";

export type RequestStatus = "draft" | "submitted" | "approved" | "rejected" | "withdrawn";

export type RequestRow = {
  id: string;
  title: string;
  category: string;
  amount_cents: number;
  currency: string;
  status: RequestStatus;
  created_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  requester_id: string;
  requester: { full_name: string } | null;
};

export type RequestDetail = RequestRow & {
  description: string;
  decision_note: string | null;
  decided_by: string | null;
  decider: { full_name: string } | null;
};

export type EventRow = {
  id: number;
  action: "created" | "submitted" | "withdrawn" | "approved" | "rejected" | "deleted";
  note: string | null;
  created_at: string;
  request_id: string | null;
  request_ref: string;
  actor: { full_name: string } | null;
  request: { title: string } | null;
};

const listColumns =
  "id, title, category, amount_cents, currency, status, created_at, submitted_at, decided_at, requester_id, requester:profiles!requests_requester_id_fkey(full_name)";

// All reads go through the user's own client: Row Level Security decides what comes back.
export async function listRequests(opts: { orgId: string; status?: string; mineOf?: string; q?: string; limit?: number }) {
  const supabase = await createClient();
  let query = supabase.from("requests").select(listColumns).eq("org_id", opts.orgId).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.mineOf) query = query.eq("requester_id", opts.mineOf);
  if (opts.q) query = query.ilike("title", `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RequestRow[];
}

export async function getRequest(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .select(`${listColumns}, description, decision_note, decided_by, decider:profiles!requests_decided_by_fkey(full_name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as RequestDetail | null;
}

export async function listEvents(opts: { requestId?: string; orgId?: string; limit?: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("request_events")
    .select("id, action, note, created_at, request_id, request_ref, actor:profiles(full_name), request:requests(title)")
    .order("created_at", { ascending: !!opts.requestId })
    .limit(opts.limit ?? 100);
  if (opts.requestId) query = query.eq("request_id", opts.requestId);
  if (opts.orgId) query = query.eq("org_id", opts.orgId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EventRow[];
}

export async function dashboardStats(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_stats", { p_org: orgId });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { status: RequestStatus; n: number; total_cents: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, { n: Number(r.n), total: Number(r.total_cents) }])) as Partial<
    Record<RequestStatus, { n: number; total: number }>
  >;
}

/** Approved spend per category over the last `days` days, largest first. */
export async function approvedSpendByCategory(orgId: string, days: number) {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("requests")
    .select("category, amount_cents")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .gte("decided_at", since);
  if (error) throw new Error(error.message);
  const totals = new Map<string, number>();
  for (const r of data ?? []) totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount_cents);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

export async function listMembers(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, created_at, profile:profiles(id, full_name, email)")
    .eq("org_id", orgId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as { role: string; created_at: string; profile: { id: string; full_name: string; email: string } }[];
}

export type RoleEventRow = {
  id: number;
  old_role: string;
  new_role: string;
  created_at: string;
  actor: { full_name: string } | null;
  member: { full_name: string } | null;
};

/** Recent role changes. Only owners and admins can read them (RLS); for others this is empty. */
export async function listRoleEvents(orgId: string, limit = 8) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_events")
    .select("id, old_role, new_role, created_at, actor:profiles!role_events_actor_id_fkey(full_name), member:profiles!role_events_user_id_fkey(full_name)")
    .eq("org_id", orgId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RoleEventRow[];
}
