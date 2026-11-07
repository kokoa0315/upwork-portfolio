import { beforeAll, describe, expect, it } from "vitest";
import { rulesProvider } from "../../lib/triage/rules";
import { runWorker } from "../../lib/triage/worker";
import { anon, as, HARBOR, ingest, onlyReady, service, TIDEBOOK } from "./helpers";

let tidebookMessage: string;

beforeAll(async () => {
  tidebookMessage = (await ingest(TIDEBOOK, { subject: "Private: invoice question" })).message_id;
  const harbor = (await ingest(HARBOR)).message_id;
  await onlyReady([tidebookMessage, harbor]);
  await runWorker(service(), rulesProvider);
});

describe("tenant isolation", () => {
  it("anonymous callers can read nothing and call nothing", async () => {
    // A hosted Supabase project grants every table to anon, so row-level security is what has to hide the rows.
    for (const table of ["teams", "profiles", "memberships", "messages", "triage_jobs", "triage_results", "replies", "message_events"]) {
      const read = await anon().from(table).select("*");
      expect(read.data ?? [], table).toEqual([]);
    }
    expect((await anon().from("messages").insert({ team_id: TIDEBOOK, subject: "x", body: "x", from_email: "a@b.c" })).error, "insert").not.toBeNull();
    expect((await anon().rpc("approve_reply", { p_message: tidebookMessage, p_body: "x" })).error?.code).toBe("42501");
  });

  it("another team sees none of Tidebook's messages, triage, replies or events", async () => {
    const db = await as("cleo");
    for (const table of ["messages", "triage_results", "message_events", "replies", "triage_jobs"]) {
      const { data, error } = await db.from(table).select("*");
      expect(error, table).toBeNull();
      const ids = (data ?? []).map((r: { team_id?: string; message_id?: string; id?: string }) => r.message_id ?? r.id);
      expect(ids, table).not.toContain(tidebookMessage);
    }
    const byId = await db.from("messages").select("id").eq("id", tidebookMessage);
    expect(byId.data).toEqual([]);
  });

  it("another team can't approve, dismiss or requeue Tidebook's message", async () => {
    const db = await as("cleo");
    for (const [fn, args] of [
      ["approve_reply", { p_message: tidebookMessage, p_body: "hijack" }],
      ["dismiss_message", { p_message: tidebookMessage, p_reason: "x" }],
      ["requeue_message", { p_message: tidebookMessage }],
    ] as const) {
      expect((await db.rpc(fn, args)).error, fn).toMatchObject({ code: "P0002" });
    }
  });
});

describe("what signed-in agents can't do", () => {
  it("can't write tables directly, including the AI result and the audit log", async () => {
    const db = await as("ana");
    expect((await db.from("messages").update({ status: "replied" }).eq("id", tidebookMessage)).error?.code).toBe("42501");
    expect((await db.from("triage_results").update({ priority: "low" }).eq("message_id", tidebookMessage)).error?.code).toBe("42501");
    expect((await db.from("message_events").delete().eq("message_id", tidebookMessage)).error?.code).toBe("42501");
    expect(
      (await db.from("replies").insert({ message_id: tidebookMessage, team_id: TIDEBOOK, body: "x", edited: false, approved_by: "00000000-0000-4000-8000-000000000101" })).error?.code,
    ).toBe("42501");
  });

  it("can't call the ingestion or queue functions that the webhook and worker use", async () => {
    const db = await as("ana");
    expect((await db.rpc("claim_triage_jobs", { p_limit: 5 })).error?.code).toBe("42501");
    expect(
      (await db.rpc("ingest_message", { p_team: TIDEBOOK, p_external_id: "x", p_from_email: "a@b.c", p_from_name: null, p_subject: "s", p_body: "b" })).error?.code,
    ).toBe("42501");
  });
});
