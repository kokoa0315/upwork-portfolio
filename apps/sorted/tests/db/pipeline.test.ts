import { describe, expect, it } from "vitest";
import { rulesProvider } from "../../lib/triage/rules";
import { TriageError, type TriageProvider } from "../../lib/triage/schema";
import { runWorker } from "../../lib/triage/worker";
import { as, ingest, onlyReady, service, TIDEBOOK } from "./helpers";

const failing = (retryable: boolean): TriageProvider => ({
  name: "claude",
  async triage() {
    throw new TriageError(retryable ? "Claude API unavailable: 529" : "The model declined this email (cyber).", retryable);
  },
});

const statusOf = async (id: string) => (await service().from("messages").select("status").eq("id", id).single()).data!.status;

describe("ingestion", () => {
  it("is idempotent: a retried delivery doesn't create a second message or job", async () => {
    const first = await ingest(TIDEBOOK, { externalId: "dup-1" });
    const again = await ingest(TIDEBOOK, { externalId: "dup-1" });
    expect(first.duplicate).toBe(false);
    expect(again).toMatchObject({ duplicate: true, message_id: first.message_id });
    const rows = await service().from("messages").select("id").eq("external_id", "dup-1");
    expect(rows.data).toHaveLength(1);
    const jobs = await service().from("triage_jobs").select("id").eq("message_id", first.message_id);
    expect(jobs.data).toHaveLength(1);
  });

  it("the same external id in another team is a different message", async () => {
    const a = await ingest(TIDEBOOK, { externalId: "shared-id" });
    const b = await ingest("20000000-0000-4000-8000-000000000009", { externalId: "shared-id" });
    expect(b.duplicate).toBe(false);
    expect(b.message_id).not.toBe(a.message_id);
  });
});

describe("worker", () => {
  it("triages a queued message and records the result and an audit event", async () => {
    const { message_id } = await ingest();
    await onlyReady([message_id]);
    const out = await runWorker(service(), rulesProvider);
    expect(out).toEqual([expect.objectContaining({ messageId: message_id, outcome: "done" })]);
    expect(await statusOf(message_id)).toBe("needs_review");
    const result = await service().from("triage_results").select("category, provider").eq("message_id", message_id).single();
    expect(result.data).toEqual({ category: "billing", provider: "rules" });
    const events = await service().from("message_events").select("action").eq("message_id", message_id).order("id");
    expect(events.data!.map((e) => e.action)).toEqual(["received", "triaged"]);
  });

  it("three workers running at once never take the same job (10 races)", async () => {
    for (let round = 0; round < 10; round++) {
      const ids = await Promise.all(Array.from({ length: 8 }, () => ingest().then((r) => r.message_id)));
      await onlyReady(ids);
      const runs = await Promise.all([1, 2, 3].map(() => service().rpc("claim_triage_jobs", { p_limit: 8 })));
      const claimed = runs.flatMap((r) => r.data as { message_id: string }[]).map((j) => j.message_id);
      expect(new Set(claimed).size, `round ${round}`).toBe(claimed.length);
      expect(new Set(claimed), `round ${round}`).toEqual(new Set(ids));
    }
  });

  it("retries a temporary failure with backoff, then hands the message to a person after 3 attempts", async () => {
    const { message_id } = await ingest();
    for (const attempt of [1, 2]) {
      await onlyReady([message_id]);
      const [out] = await runWorker(service(), failing(true));
      expect(out.outcome, `attempt ${attempt}`).toBe("queued");
      const job = await service().from("triage_jobs").select("attempts, run_after, last_error").eq("message_id", message_id).single();
      expect(job.data!.attempts).toBe(attempt);
      expect(new Date(job.data!.run_after).getTime()).toBeGreaterThan(Date.now() + 20_000);
      expect(job.data!.last_error).toContain("529");
    }
    await onlyReady([message_id]);
    const [last] = await runWorker(service(), failing(true));
    expect(last.outcome).toBe("failed");
    expect(await statusOf(message_id)).toBe("failed");
  });

  it("doesn't retry a refusal: it goes straight to a person", async () => {
    const { message_id } = await ingest();
    await onlyReady([message_id]);
    const [out] = await runWorker(service(), failing(false));
    expect(out.outcome).toBe("failed");
    const events = await service().from("message_events").select("action").eq("message_id", message_id).order("id");
    expect(events.data!.map((e) => e.action)).toEqual(["received", "triage_failed"]);
  });

  it("a crashed worker's job is picked up again after 5 minutes", async () => {
    const { message_id } = await ingest();
    await onlyReady([message_id]);
    await service().rpc("claim_triage_jobs", { p_limit: 1 }); // claimed, then "crashes"
    expect((await service().rpc("claim_triage_jobs", { p_limit: 1 })).data).toEqual([]);
    await service().from("triage_jobs").update({ locked_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("message_id", message_id);
    const again = await service().rpc("claim_triage_jobs", { p_limit: 1 });
    expect(again.data).toEqual([expect.objectContaining({ message_id, attempts: 2 })]);
  });

  it("a worker that comes back after its job was taken over can't overwrite the newer attempt", async () => {
    const { message_id } = await ingest();
    await onlyReady([message_id]);
    // The first worker is so slow that its job is reclaimed (attempt 2) while it is still waiting on the model.
    let newer: { job_id: string; claim_token: string } | undefined;
    const slow: TriageProvider = {
      name: "rules",
      async triage(email, signal) {
        await service().from("triage_jobs").update({ locked_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("message_id", message_id);
        const again = await service().rpc("claim_triage_jobs", { p_limit: 1 });
        expect(again.data).toEqual([expect.objectContaining({ message_id, attempts: 2 })]);
        newer = again.data![0];
        return rulesProvider.triage(email, signal);
      },
    };
    const [late] = await runWorker(service(), slow);
    expect(late.outcome).toBe("taken_over");
    const job = (await service().from("triage_jobs").select("status, attempts").eq("message_id", message_id).single()).data;
    expect(job).toEqual({ status: "running", attempts: 2 });
    expect((await service().from("triage_results").select("message_id").eq("message_id", message_id)).data).toEqual([]);
    expect((await service().rpc("fail_triage_job", { p_job: newer!.job_id, p_claim: crypto.randomUUID(), p_error: "late" })).error).toMatchObject({ code: "55000" });
    expect((await service().rpc("complete_triage_job", { p_job: newer!.job_id, p_claim: newer!.claim_token, p_result: await rulesProvider.triage({ subject: "s", body: "b", fromEmail: "a@b.c", fromName: null }) })).error).toBeNull();
  });

  it("a worker from before 'New draft' can't save its stale draft over the new attempt", async () => {
    const { message_id } = await ingest();
    await onlyReady([message_id]);
    // While the first worker is stuck, the job is reclaimed and finished, an agent asks for a new draft, and the
    // new attempt starts. The attempt count starts again at 1 after a new draft, the same number the stuck worker holds.
    let fresh: { job_id: string; claim_token: string; attempts: number } | undefined;
    const stuck: TriageProvider = {
      name: "rules",
      async triage(email, signal) {
        await service().from("triage_jobs").update({ locked_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("message_id", message_id);
        expect((await runWorker(service(), rulesProvider))[0]).toMatchObject({ messageId: message_id, outcome: "done" });
        expect((await (await as("ana")).rpc("requeue_message", { p_message: message_id })).error).toBeNull();
        await onlyReady([message_id]);
        fresh = (await service().rpc("claim_triage_jobs", { p_limit: 1 })).data![0];
        return { ...(await rulesProvider.triage(email, signal)), summary: "STALE" };
      },
    };
    const [late] = await runWorker(service(), stuck);
    expect(fresh).toMatchObject({ message_id, attempts: 1 });
    expect(late.outcome).toBe("taken_over");
    expect(await statusOf(message_id)).toBe("triaging");
    expect((await service().from("triage_results").select("summary").eq("message_id", message_id)).data).toEqual([]);
    const result = await rulesProvider.triage({ subject: "s", body: "b", fromEmail: "a@b.c", fromName: null });
    expect((await service().rpc("complete_triage_job", { p_job: fresh!.job_id, p_claim: fresh!.claim_token, p_result: result })).error).toBeNull();
  });

  it("an email that crashes the worker on every attempt goes to a person instead of looping", async () => {
    const { message_id } = await ingest();
    await onlyReady([message_id]);
    const stale = () => service().from("triage_jobs").update({ locked_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("message_id", message_id);
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await stale();
      const claimed = await service().rpc("claim_triage_jobs", { p_limit: 1 });
      expect(claimed.data).toEqual([expect.objectContaining({ message_id, attempts: attempt })]);
    }
    await stale(); // the third worker crashes too
    expect((await service().rpc("claim_triage_jobs", { p_limit: 1 })).data).toEqual([]);
    expect((await service().from("messages").select("status").eq("id", message_id).single()).data).toEqual({ status: "failed" });
    const events = (await service().from("message_events").select("action").eq("message_id", message_id)).data!.map((e) => e.action);
    expect(events).toContain("triage_failed");
  });
});

describe("review", () => {
  async function triaged() {
    const { message_id } = await ingest();
    await onlyReady([message_id]);
    await runWorker(service(), rulesProvider);
    return message_id;
  }

  it("approving records the reply, whether it was edited, and who approved it", async () => {
    const id = await triaged();
    const draft = (await service().from("triage_results").select("draft_reply").eq("message_id", id).single()).data!.draft_reply;
    const { data, error } = await (await as("ana")).rpc("approve_reply", { p_message: id, p_body: draft });
    expect(error).toBeNull();
    expect(data).toMatchObject({ edited: false, delivery: "simulated" });
    const id2 = await triaged();
    const edited = await (await as("ana")).rpc("approve_reply", { p_message: id2, p_body: "Hi, we've refunded the duplicate charge." });
    expect(edited.data).toMatchObject({ edited: true });
    expect(await statusOf(id2)).toBe("replied");
  });

  it("two agents approving at the same moment: exactly one reply is recorded", async () => {
    for (let round = 0; round < 5; round++) {
      const id = await triaged();
      const results = await Promise.all([
        (await as("ana")).rpc("approve_reply", { p_message: id, p_body: "Reply from Ana" }),
        (await as("ben")).rpc("approve_reply", { p_message: id, p_body: "Reply from Ben" }),
      ]);
      expect(results.filter((r) => !r.error)).toHaveLength(1);
      expect(results.find((r) => r.error)!.error).toMatchObject({ code: "55000", message: "message is already replied" });
      expect((await service().from("replies").select("id").eq("message_id", id)).data).toHaveLength(1);
    }
  });

  it("an empty reply is rejected, and a dismissed message can't be approved", async () => {
    const id = await triaged();
    expect((await (await as("ana")).rpc("approve_reply", { p_message: id, p_body: "   " })).error).toMatchObject({ code: "22023" });
    expect((await (await as("ana")).rpc("dismiss_message", { p_message: id, p_reason: "spam" })).error).toBeNull();
    expect((await (await as("ana")).rpc("approve_reply", { p_message: id, p_body: "Hello" })).error).toMatchObject({ code: "55000" });
  });

  it("asking for a new draft clears the old one and queues the message again", async () => {
    const id = await triaged();
    expect((await (await as("ben")).rpc("requeue_message", { p_message: id })).error).toBeNull();
    expect(await statusOf(id)).toBe("queued");
    expect((await service().from("triage_results").select("message_id").eq("message_id", id)).data).toEqual([]);
  });
});
