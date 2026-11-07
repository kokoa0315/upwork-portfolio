import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../../../devstack/lib.mjs";

export const cfg = loadConfig(path.resolve(__dirname, "../.."));

export const NORTHWIND = "10000000-0000-4000-8000-000000000001";
export const CONTOSO = "10000000-0000-4000-8000-000000000009";
export const users = {
  olivia: { id: "00000000-0000-4000-8000-000000000001", email: "olivia@northwind.test" }, // owner
  marcus: { id: "00000000-0000-4000-8000-000000000002", email: "marcus@northwind.test" }, // approver
  priya: { id: "00000000-0000-4000-8000-000000000003", email: "priya@northwind.test" }, // member
  diego: { id: "00000000-0000-4000-8000-000000000004", email: "diego@northwind.test" }, // member
  hana: { id: "00000000-0000-4000-8000-000000000005", email: "hana@northwind.test" }, // admin
  sam: { id: "00000000-0000-4000-8000-000000000009", email: "sam@contoso.test" }, // owner of another org
} as const;
export type User = keyof typeof users;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const anon = () => createClient(cfg.supabaseUrl, cfg.anonKey, opts);
/** Bypasses RLS. Only for reading back what really happened. */
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

/** A fresh submitted request owned by `who`, so tests don't depend on each other. */
export async function submitted(who: User, amountCents = 25_000, title = "Test request") {
  const db = await as(who);
  const { data, error } = await db
    .from("requests")
    .insert({ org_id: NORTHWIND, requester_id: users[who].id, title, category: "software", amount_cents: amountCents })
    .select("id")
    .single();
  if (error) throw error;
  const sub = await db.rpc("submit_request", { p_id: data.id });
  if (sub.error) throw sub.error;
  return data.id as string;
}
