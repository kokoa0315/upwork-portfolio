import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InboundEmail, MAX_BODY_BYTES, verify } from "@/lib/webhook";
import { getProvider } from "@/lib/triage/provider";
import { runWorker } from "@/lib/triage/worker";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Receives one email from the mail provider. Verifies the signature before parsing anything, stores the
// email idempotently, answers 202 at once, and starts triage after the response is sent.
export async function POST(request: Request, ctx: { params: Promise<{ team: string }> }) {
  const { team } = await ctx.params;
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  const verdict = verify(secret, team, raw, request.headers.get("x-sorted-timestamp"), request.headers.get("x-sorted-signature"));
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 401 });
  if (!UUID.test(team)) return NextResponse.json({ error: "unknown team" }, { status: 404 });

  let email: InboundEmail;
  try {
    const parsed = InboundEmail.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 422 });
    email = parsed.data;
  } catch {
    return NextResponse.json({ error: "body is not JSON" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .rpc("ingest_message", {
      p_team: team,
      p_external_id: email.id,
      p_from_email: email.from.email,
      p_from_name: email.from.name ?? null,
      p_subject: email.subject,
      p_body: email.text,
    })
    .single<{ message_id: string; duplicate: boolean }>();
  if (error) {
    // 23503: the team id doesn't exist.
    if (error.code === "23503") return NextResponse.json({ error: "unknown team" }, { status: 404 });
    console.error("ingest_message failed", error);
    // PGRST0xx: the database connection dropped. Ask the sender to retry rather than reporting a hard failure.
    if (error.code?.startsWith("PGRST0")) return NextResponse.json({ error: "temporarily unavailable" }, { status: 503, headers: { "retry-after": "5" } });
    return NextResponse.json({ error: "could not store message" }, { status: 500 });
  }

  if (!data.duplicate) {
    after(async () => {
      try {
        await runWorker(db, getProvider(), { limit: 3 });
      } catch (err) {
        // The job stays queued; the next worker tick picks it up.
        console.error("triage after ingest failed", err);
      }
    });
  }
  return NextResponse.json({ id: data.message_id, duplicate: data.duplicate }, { status: data.duplicate ? 200 : 202 });
}
