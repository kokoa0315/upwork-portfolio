// HS256 JWTs, the same format Supabase Auth issues and PostgREST verifies.
import crypto from "node:crypto";

export function sign(payload, secret) {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verify(token, secret) {
  const [head, body, sig] = String(token).split(".");
  if (!sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

// Long-lived API keys for the local stack, like the anon / service_role keys of a Supabase project.
export const apiKey = (role, secret) => sign({ role, iss: "local-devstack", iat: 1700000000, exp: 2000000000 }, secret);
