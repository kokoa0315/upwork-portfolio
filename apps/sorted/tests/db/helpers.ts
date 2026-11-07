import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../../../devstack/lib.mjs";

export const cfg = loadConfig(path.resolve(__dirname, "../.."));

export const TIDEBOOK = "20000000-0000-4000-8000-000000000001";
export const HARBOR = "20000000-0000-4000-8000-000000000009";
export const users = {
  ana: { id: "00000000-0000-4000-8000-000000000101", email: "ana@tidebook.test" },
  ben: { id: "00000000-0000-4000-8000-000000000102", email: "ben@tidebook.test" },
  cleo: { id: "00000000-0000-4000-8000-000000000109", email: "cleo@harbor.test" }, // another team
} as const;
export type User = keyof typeof users;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const anon = () => createClient(cfg.supabaseUrl, cfg.anonKey, opts);
/** What the webhook and the worker use. */
export const service = () => createClient(cfg.supabaseUrl, cfg.serviceKey, opts);

const sessions = new Map<User, SupabaseClient>();
export async function as(name: User) {
  const cached = sessions.get(name);
  if (cached) return cached;
  const client = createClient(cfg.supabaseUrl, cfg.anonKey, opts);
  const { error } = await client.auth.signInWithPassword({ email: users[name].email, password: "demo-password-123" });
  if (error) throw error;
  sessions.set(name, client);
  return client;
}

let n = 0;
/** Ingest a fresh email through the same function the webhook uses. */
export async function ingest(team = TIDEBOOK, over: Partial<{ subject: string; body: string; externalId: string }> = {}) {
  const externalId = over.externalId ?? `test-${Date.now()}-${n++}`;
  const { data, error } = await service()
    .rpc("ingest_message", {
      p_team: team,
      p_external_id: externalId,
      p_from_email: "customer@example.com",
      p_from_name: "Customer",
      p_subject: over.subject ?? "Charged twice",
      p_body: over.body ?? "I was charged twice this month.",
    })
    .single<{ message_id: string; duplicate: boolean }>();
  if (error) throw error;
  return { ...data, externalId };
}

/** Make every queued job ready now, so retry tests don't wait for the backoff. */
export async function makeJobsReady() {
  const { error } = await service().from("triage_jobs").update({ run_after: new Date(Date.now() - 1000).toISOString() }).eq("status", "queued");
  if (error) throw error;
}

/** Leave only these messages' jobs claimable, so a test's worker run touches nothing else. */
export async function onlyReady(messageIds: string[]) {
  const db = service();
  const park = await db.from("triage_jobs").update({ run_after: "2999-01-01T00:00:00Z" }).eq("status", "queued").not("message_id", "in", `(${messageIds.join(",")})`);
  if (park.error) throw park.error;
  const ready = await db.from("triage_jobs").update({ run_after: new Date(Date.now() - 1000).toISOString() }).in("message_id", messageIds);
  if (ready.error) throw ready.error;
}
