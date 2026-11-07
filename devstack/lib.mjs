// Shared helpers for the local stack: read an app's devstack.env, reset its database, write .env.local.
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { apiKey } from "./jwt.mjs";

export function loadConfig(appDir) {
  const file = path.join(appDir, "devstack.env");
  const env = Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  for (const k of ["APP_DB", "PG_PORT", "POSTGREST_PORT", "GATEWAY_PORT", "JWT_SECRET"]) {
    if (!env[k]) throw new Error(`${file}: ${k} is missing`);
  }
  const pgBase = `postgres://postgres@127.0.0.1:${env.PG_PORT}`;
  return {
    ...env,
    appDir,
    adminUrl: `${pgBase}/postgres`,
    dbUrl: `${pgBase}/${env.APP_DB}`,
    authenticatorUrl: `postgres://authenticator@127.0.0.1:${env.PG_PORT}/${env.APP_DB}`,
    supabaseUrl: `http://127.0.0.1:${env.GATEWAY_PORT}`,
    anonKey: apiKey("anon", env.JWT_SECRET),
    serviceKey: apiKey("service_role", env.JWT_SECRET),
  };
}

// `until`: apply migrations up to and including this file name (to reproduce an earlier schema).
// `wait`: return only once the running PostgREST serves the new schema (test setups need this).
export async function resetDatabase(cfg, { seed = true, until = process.env.DEVSTACK_UNTIL, wait = false } = {}) {
  const admin = new pg.Client({ connectionString: cfg.adminUrl });
  await admin.connect();
  const exists = (await admin.query("select 1 from pg_database where datname = $1", [cfg.APP_DB])).rowCount;
  if (!exists) await admin.query(`create database ${cfg.APP_DB}`);
  await admin.end();

  const db = new pg.Client({ connectionString: cfg.dbUrl });
  await db.connect();
  // Rebuild the schemas instead of dropping the database, so PostgREST's pooled connections stay valid.
  await db.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public authorization pg_database_owner;
    grant usage on schema public to public;
  `);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = [path.join(here, "bootstrap.sql")];
  const migDir = path.join(cfg.appDir, "supabase", "migrations");
  files.push(...fs.readdirSync(migDir).filter((f) => f.endsWith(".sql") && (!until || f <= until)).sort().map((f) => path.join(migDir, f)));
  if (seed && fs.existsSync(path.join(cfg.appDir, "supabase", "seed.sql"))) files.push(path.join(cfg.appDir, "supabase", "seed.sql"));
  for (const f of files) {
    try {
      await db.query(fs.readFileSync(f, "utf8"));
    } catch (err) {
      throw new Error(`${path.basename(f)}: ${err.message}`);
    }
  }
  // A function whose name is new on every reset: once PostgREST can call it, its schema cache is the new one.
  // (The OpenAPI root is read live from the database, so it can't tell whether the cache has caught up.)
  const marker = `devstack_ready_${crypto.randomBytes(6).toString("hex")}`;
  await db.query(`create function public.${marker}() returns boolean language sql as 'select true';
    revoke execute on function public.${marker}() from public, anon, authenticated;`);
  // Ask `cli.mjs up` to restart PostgREST: that drops pooled connections whose cached plans point at the dropped
  // types ("cache lookup failed for type") and reloads the schema cache. NOTIFY alone doesn't reach PostgREST on Windows.
  await db.query(`
    create schema if not exists devstack;
    create table if not exists devstack.reload_requests (token text primary key, at timestamptz not null default clock_timestamp());
    insert into devstack.reload_requests (token) values ('${marker}');
    notify pgrst, 'reload schema';
  `);
  await db.end();
  if (wait) await waitForMarker(cfg, marker);
  return files.map((f) => path.basename(f));
}

export function writeEnvLocal(cfg, extra = {}) {
  const file = path.join(cfg.appDir, ".env.local");
  const keep = fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l && !/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=/.test(l))
    : [];
  const lines = [
    `NEXT_PUBLIC_SUPABASE_URL=${cfg.supabaseUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${cfg.anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${cfg.serviceKey}`,
    ...Object.entries(extra).map(([k, v]) => `${k}=${v}`),
    ...keep,
  ];
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

async function waitForMarker(cfg, marker, timeoutMs = 20_000) {
  const headers = { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, "content-type": "application/json" };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${marker}`, { method: "POST", headers, body: "{}" }).catch(() => null);
    if (res?.ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("PostgREST didn't load the new schema within 20 s. Is the stack running (npm run stack)?");
}
