import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/triage/provider";
import { runWorker } from "@/lib/triage/worker";

// Called on a schedule (cron, or `npm run worker` locally) to pick up retries and anything the
// post-ingest run missed. Protected by a bearer secret.
export async function POST(request: Request) {
  const secret = process.env.WORKER_SECRET;
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  // Compare byte lengths, not string lengths: "é" and "e" are one character each but not the same number of bytes.
  if (!secret || given.length !== Buffer.byteLength(secret) || !timingSafeEqual(given, Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcomes = await runWorker(createAdminClient(), getProvider(), { limit: 10 });
  return NextResponse.json({ processed: outcomes.length, outcomes });
}
