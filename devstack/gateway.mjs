// Minimal Supabase-compatible gateway for local development.
//
//   /rest/v1/*   -> proxied to PostgREST (the real thing)
//   /auth/v1/*   -> a small subset of the GoTrue API: password sign-in, refresh, user, logout
//
// It exists because the full Supabase stack needs Docker. The app code talks to it through
// the normal supabase-js client, so pointing SUPABASE_URL at a hosted project needs no code change.
// Never expose this server beyond 127.0.0.1.

import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";
import { sign, verify } from "./jwt.mjs";

const PORT = Number(process.env.GATEWAY_PORT);
const POSTGREST = process.env.POSTGREST_URL;
const SECRET = process.env.JWT_SECRET;
// Access-token lifetime in seconds. Hosted Supabase defaults to 3600; an app can shorten it to test expiry.
const EXPIRY = Number(process.env.JWT_EXPIRY ?? 3600);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
// A database reset terminates idle connections; the pool reconnects on the next query.
pool.on("error", (err) => console.warn(`gateway: idle connection closed (${err.message})`));

if (!PORT || !POSTGREST || !SECRET || !process.env.DATABASE_URL) {
  console.error("gateway: GATEWAY_PORT, POSTGREST_URL, JWT_SECRET and DATABASE_URL are required");
  process.exit(2);
}

const verifyJwt = (token) => verify(token, SECRET);
const signJwt = (payload) => sign(payload, SECRET);

// refresh token -> { userId, usedAt, next } (in memory; fine for local dev). Like GoTrue, a refresh token is
// single-use, but reusing it within REUSE_SECONDS (two requests refreshing at once) returns the same successor.
const refreshTokens = new Map();
const REUSE_SECONDS = 10;
const logAuth = (...args) => process.env.DEVSTACK_LOG_AUTH && console.log("auth:", ...args);

function toUser(row) {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    app_metadata: { provider: "email" },
    user_metadata: row.raw_user_meta_data ?? {},
    created_at: row.created_at,
  };
}

function session(row, refresh = crypto.randomBytes(24).toString("base64url")) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = EXPIRY;
  const access = signJwt({ sub: row.id, email: row.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + expiresIn });
  if (!refreshTokens.has(refresh)) refreshTokens.set(refresh, { userId: row.id, usedAt: null, next: null });
  return { access_token: access, token_type: "bearer", expires_in: expiresIn, expires_at: now + expiresIn, refresh_token: refresh, user: toUser(row) };
}

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

async function auth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  if (req.method === "POST" && path === "/token") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    const grant = url.searchParams.get("grant_type");
    let row;
    if (grant === "password") {
      const r = await pool.query(
        "select id, email, raw_user_meta_data, created_at from auth.users where lower(email) = lower($1) and encrypted_password = crypt($2, encrypted_password)",
        [body.email ?? "", body.password ?? ""],
      );
      row = r.rows[0];
      if (!row) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials" });
    } else if (grant === "refresh_token") {
      const entry = refreshTokens.get(body.refresh_token);
      const now = Date.now() / 1000;
      if (!entry || (entry.usedAt !== null && now - entry.usedAt > REUSE_SECONDS)) {
        logAuth("refresh rejected", String(body.refresh_token).slice(0, 6), entry ? `reused after ${Math.round(now - entry.usedAt)} s` : "unknown token");
        return send(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token: Already Used", code: "refresh_token_already_used" });
      }
      row = (await pool.query("select id, email, raw_user_meta_data, created_at from auth.users where id = $1", [entry.userId])).rows[0];
      logAuth("refresh ok", String(body.refresh_token).slice(0, 6), entry.usedAt === null ? "first use" : "reused within the window");
      if (entry.usedAt === null) {
        entry.usedAt = now;
        entry.next = crypto.randomBytes(24).toString("base64url");
      }
      return send(res, 200, session(row, entry.next));
    } else {
      return send(res, 400, { error: "unsupported_grant_type" });
    }
    return send(res, 200, session(row));
  }
  if (req.method === "GET" && path === "/user") {
    const claims = verifyJwt((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
    if (!claims?.sub) return send(res, 401, { code: 401, msg: "invalid JWT" });
    const row = (await pool.query("select id, email, raw_user_meta_data, created_at from auth.users where id = $1", [claims.sub])).rows[0];
    return row ? send(res, 200, toUser(row)) : send(res, 404, { msg: "User not found" });
  }
  if (req.method === "POST" && path === "/logout") return send(res, 204);
  return send(res, 404, { msg: `not implemented in local gateway: ${req.method} ${path}` });
}

async function rest(req, res, url) {
  const target = new URL(url.pathname.replace(/^\/rest\/v1/, "") + url.search, POSTGREST);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  const upstream = await fetch(target, { method: req.method, headers, body });
  const out = Buffer.from(await upstream.arrayBuffer());
  const pass = {};
  upstream.headers.forEach((v, k) => {
    if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) pass[k] = v;
  });
  res.writeHead(upstream.status, pass);
  res.end(out);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url);
      if (url.pathname.startsWith("/rest/v1")) return await rest(req, res, url);
      send(res, 404, { msg: "unknown path" });
    } catch (err) {
      console.error(err);
      send(res, 500, { msg: "gateway error" });
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway http://127.0.0.1:${PORT} -> ${POSTGREST}`));
