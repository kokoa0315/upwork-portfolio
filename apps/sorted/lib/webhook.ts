import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Signature scheme (the same shape Stripe and GitHub use):
//   x-sorted-timestamp: unix seconds
//   x-sorted-signature: sha256=<hex HMAC-SHA256 of `${timestamp}.${team id}.${raw body}` with the shared secret>
// The timestamp is part of the signed text, so an old delivery can't be replayed with a fresh timestamp. So is the
// team from the URL, so a delivery meant for one team can't be replayed into another team's inbox.

export const TOLERANCE_SECONDS = 300;

export function sign(secret: string, timestamp: number, team: string, rawBody: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${team}.${rawBody}`).digest("hex")}`;
}

export type Verdict = { ok: true } | { ok: false; reason: "missing headers" | "stale timestamp" | "bad signature" };

export function verify(secret: string, team: string, rawBody: string, timestampHeader: string | null, signatureHeader: string | null, nowSeconds = Math.floor(Date.now() / 1000)): Verdict {
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing headers" };
  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return { ok: false, reason: "stale timestamp" };
  const expected = Buffer.from(sign(secret, timestamp, team, rawBody));
  const given = Buffer.from(signatureHeader);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad signature" };
  return { ok: true };
}

export const InboundEmail = z.object({
  id: z.string().min(1).max(200),
  from: z.object({ email: z.email(), name: z.string().max(200).optional() }),
  subject: z.string().max(300).default(""),
  text: z.string().min(1).max(20_000),
});
export type InboundEmail = z.infer<typeof InboundEmail>;

export const MAX_BODY_BYTES = 64 * 1024;
