import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../../../devstack/lib.mjs";

export const cfg = loadConfig(path.resolve(__dirname, "../.."));

export const FERNWAY = "30000000-0000-4000-8000-000000000001";
export const LUMEN = "30000000-0000-4000-8000-000000000002";
export const LUMEN_INVOICE = "40000000-0000-4000-8000-000000000202";
export const users = {
  maya: { id: "00000000-0000-4000-8000-000000000201", email: "maya@fernway.test" }, // Fernway owner
  tom: { id: "00000000-0000-4000-8000-000000000202", email: "tom@fernway.test" }, // Fernway member
  iris: { id: "00000000-0000-4000-8000-000000000301", email: "iris@lumen.test" }, // Lumen owner
} as const;
export type User = keyof typeof users;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const anon = () => createClient(cfg.supabaseUrl, cfg.anonKey, opts);
/** The studio's back office. Used here only to look at the real state after an attempt. */
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

export async function membershipsOf(name: User) {
  const { data, error } = await service().from("memberships").select("client_id, role, notify_on_invoice").eq("user_id", users[name].id);
  if (error) throw error;
  return data;
}
