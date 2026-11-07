#!/usr/bin/env node
// usage (from an app folder):
//   node ../../devstack/cli.mjs reset   recreate the database, apply migrations + seed, write .env.local
//   node ../../devstack/cli.mjs up      run PostgREST and the gateway until Ctrl+C
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig, resetDatabase, writeEnvLocal } from "./lib.mjs";

const cfg = loadConfig(process.cwd());
const cmd = process.argv[2];
const here = path.dirname(fileURLToPath(import.meta.url));

if (cmd === "reset") {
  // --wait: return once a running stack serves the new schema (used by test setups).
  const applied = await resetDatabase(cfg, { wait: process.argv.includes("--wait") });
  writeEnvLocal(cfg);
  console.log(`reset ${cfg.APP_DB}: ${applied.join(", ")}`);
} else if (cmd === "up") {
  const conf = path.join(os.tmpdir(), `postgrest-${cfg.APP_DB}.conf`);
  fs.writeFileSync(
    conf,
    [
      `db-uri = "${cfg.authenticatorUrl}"`,
      `db-schemas = "public"`,
      `db-anon-role = "anon"`,
      `db-pool = 6`,
      `jwt-secret = "${cfg.JWT_SECRET}"`,
      `server-host = "127.0.0.1"`,
      `server-port = ${cfg.POSTGREST_PORT}`,
    ].join("\n"),
  );
  // Machine-specific paths live in devstack/local.env (gitignored):
  //   POSTGREST_BIN  the postgrest executable (default: on PATH)
  //   PG_BIN         Postgres' bin folder, which PostgREST needs on PATH for libpq on Windows
  const localEnv = path.join(here, "local.env");
  const local = fs.existsSync(localEnv)
    ? Object.fromEntries([...fs.readFileSync(localEnv, "utf8").matchAll(/^(\w+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]))
    : {};
  const bin = process.env.POSTGREST_BIN ?? local.POSTGREST_BIN ?? "postgrest";
  const childEnv = { ...process.env };
  const pathKey = Object.keys(childEnv).find((k) => k.toUpperCase() === "PATH") ?? "PATH"; // "Path" on Windows
  if (local.PG_BIN) childEnv[pathKey] = `${local.PG_BIN}${path.delimiter}${childEnv[pathKey] ?? ""}`;
  let stopping = false;
  let postgrest;
  let restarting = false;
  const startPostgrest = () => {
    postgrest = spawn(bin, [conf], { stdio: "inherit", env: childEnv });
    postgrest.on("exit", (code) => {
      if (restarting) return;
      shutdown(code);
    });
  };
  const gateway = spawn(process.execPath, [path.join(here, "gateway.mjs")], {
    stdio: "inherit",
    env: { ...process.env, GATEWAY_PORT: cfg.GATEWAY_PORT, POSTGREST_URL: `http://127.0.0.1:${cfg.POSTGREST_PORT}`, JWT_SECRET: cfg.JWT_SECRET, JWT_EXPIRY: cfg.JWT_EXPIRY ?? "3600", DATABASE_URL: cfg.dbUrl },
  });
  gateway.on("exit", (code) => shutdown(code));
  function shutdown(code) {
    if (stopping) return;
    stopping = true;
    postgrest?.kill();
    gateway.kill();
    process.exit(code ?? 0);
  }
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  startPostgrest();

  // PostgREST on Windows never receives LISTEN/NOTIFY, so `notify pgrst` can't refresh its schema cache. Every reset
  // records a request in devstack.reload_requests; restarting PostgREST when one appears works on every platform.
  const pg = (await import("pg")).default;
  const db = new pg.Client({ connectionString: cfg.dbUrl });
  await db.connect();
  db.on("error", () => {}); // a reset may end this session; the poll below reconnects
  const latest = async (client) =>
    (await client.query("select token from devstack.reload_requests order by at desc limit 1").catch(() => ({ rows: [] }))).rows[0]?.token ?? null;
  let seen = await latest(db);
  await db.end();
  setInterval(async () => {
    const poll = new pg.Client({ connectionString: cfg.dbUrl });
    try {
      await poll.connect();
      const token = await latest(poll);
      if (token && token !== seen && !restarting) {
        seen = token;
        restarting = true;
        postgrest.once("exit", () => {
          restarting = false;
          startPostgrest();
        });
        postgrest.kill();
      }
    } catch {
      // database briefly unavailable during a reset
    } finally {
      await poll.end().catch(() => {});
    }
  }, 300);
} else {
  console.error("usage: cli.mjs reset | up");
  process.exit(2);
}
