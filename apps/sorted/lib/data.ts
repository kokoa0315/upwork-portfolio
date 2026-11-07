import { createClient } from "@/lib/supabase/server";

export type Status = "queued" | "triaging" | "needs_review" | "replied" | "dismissed" | "failed";

export type Triage = {
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  summary: string;
  draft_reply: string;
  confidence: number;
  needs_human_reason: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  created_at: string;
};

export type MessageRow = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string;
  received_at: string;
  status: Status;
  triage: Pick<Triage, "category" | "priority" | "summary" | "needs_human_reason" | "provider"> | null;
};

export type MessageDetail = MessageRow & {
  body: string;
  triage: Triage | null;
  job: { attempts: number; last_error: string | null; status: string; run_after: string } | null;
  reply: { body: string; edited: boolean; approved_at: string; approver: { full_name: string } | null } | null;
};

export type EventRow = {
  id: number;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string } | null;
};

const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/** Inbox order: what needs a person first, most urgent first, then newest. */
export async function listMessages({ teamId, status }: { teamId: string; status?: Status }) {
  const supabase = await createClient();
  let q = supabase
    .from("messages")
    .select("id, from_email, from_name, subject, received_at, status, triage:triage_results(category, priority, summary, needs_human_reason, provider)")
    .eq("team_id", teamId)
    .order("received_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as MessageRow[];
  return rows.sort((a, b) => (a.triage && b.triage ? priorityRank[a.triage.priority] - priorityRank[b.triage.priority] : 0));
}

export async function getMessage(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(
      `id, from_email, from_name, subject, body, received_at, status,
       triage:triage_results(*),
       job:triage_jobs(attempts, last_error, status, run_after),
       reply:replies(body, edited, approved_at, approver:profiles(full_name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as MessageDetail | null;
}

export async function listEvents(messageId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_events")
    .select("id, action, detail, created_at, actor:profiles(full_name)")
    .eq("message_id", messageId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EventRow[];
}

export async function listReplies(teamId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("replies")
    .select("id, body, edited, approved_at, approver:profiles(full_name), message:messages(id, subject, from_email, from_name)")
    .eq("team_id", teamId)
    .order("approved_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as {
    id: string;
    body: string;
    edited: boolean;
    approved_at: string;
    approver: { full_name: string } | null;
    message: { id: string; subject: string; from_email: string; from_name: string | null };
  }[];
}

/** Counts by status, and how the AI's work was used: approved as-is vs edited, by provider. */
export async function teamOverview(teamId: string) {
  const supabase = await createClient();
  const [stats, triage, replies] = await Promise.all([
    supabase.rpc("team_stats", { p_team: teamId }),
    supabase.from("triage_results").select("category, priority, provider, model, input_tokens, output_tokens, latency_ms, needs_human_reason, message:messages!inner(team_id)").eq("message.team_id", teamId),
    supabase.from("replies").select("edited").eq("team_id", teamId),
  ]);
  for (const r of [stats, triage, replies]) if (r.error) throw new Error(r.error.message);
  const byStatus = Object.fromEntries(((stats.data ?? []) as { status: Status; n: number }[]).map((r) => [r.status, Number(r.n)])) as Partial<Record<Status, number>>;
  const results = (triage.data ?? []) as unknown as Omit<Triage, "summary" | "draft_reply" | "confidence" | "created_at">[];
  const byCategory = new Map<string, number>();
  for (const r of results) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  const claude = results.filter((r) => r.provider === "claude");
  return {
    byStatus,
    triaged: results.length,
    flagged: results.filter((r) => r.needs_human_reason).length,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    claude: {
      runs: claude.length,
      inputTokens: claude.reduce((s, r) => s + r.input_tokens, 0),
      outputTokens: claude.reduce((s, r) => s + r.output_tokens, 0),
      medianLatencyMs: median(claude.map((r) => r.latency_ms)),
    },
    replies: { total: (replies.data ?? []).length, unedited: (replies.data ?? []).filter((r) => !r.edited).length },
  };
}

function median(xs: number[]) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
