import type { SupabaseClient } from "@supabase/supabase-js";
import { TriageError, type TriageProvider } from "./schema";

type ClaimedJob = { job_id: string; message_id: string; attempts: number; claim_token: string; subject: string; body: string; from_email: string; from_name: string | null };
export type JobOutcome = { jobId: string; messageId: string; outcome: "done" | "queued" | "failed" | "taken_over"; error?: string };

const MAX_ATTEMPTS = 3;

/**
 * Claim up to `limit` ready jobs and triage them in parallel. Safe to run from several processes at once:
 * the database hands each job to exactly one caller. `db` must be a service-role client.
 */
export async function runWorker(db: SupabaseClient, provider: TriageProvider, { limit = 5, timeoutMs = 90_000 } = {}): Promise<JobOutcome[]> {
  const { data, error } = await db.rpc("claim_triage_jobs", { p_limit: limit, p_max_attempts: MAX_ATTEMPTS });
  if (error) throw new Error(`claim_triage_jobs: ${error.message}`);
  const jobs = (data ?? []) as ClaimedJob[];

  return Promise.all(
    jobs.map(async (job): Promise<JobOutcome> => {
      try {
        const result = await provider.triage(
          { subject: job.subject, body: job.body, fromEmail: job.from_email, fromName: job.from_name },
          AbortSignal.timeout(timeoutMs),
        );
        const done = await db.rpc("complete_triage_job", { p_job: job.job_id, p_claim: job.claim_token, p_result: result });
        // The job was claimed again while this worker was busy (after 5 minutes, or a new draft was asked for): the newer claim owns it.
        if (done.error?.code === "55000") return { jobId: job.job_id, messageId: job.message_id, outcome: "taken_over" };
        if (done.error) throw new Error(`complete_triage_job: ${done.error.message}`);
        return { jobId: job.job_id, messageId: job.message_id, outcome: "done" };
      } catch (err) {
        // Outages and malformed answers are worth retrying; a refusal or a 4xx won't change on retry.
        const retryable = err instanceof TriageError ? err.retryable : true;
        const message = err instanceof Error ? err.message : String(err);
        const failed = await db.rpc("fail_triage_job", { p_job: job.job_id, p_claim: job.claim_token, p_error: message, p_max_attempts: retryable ? MAX_ATTEMPTS : 1 });
        if (failed.error?.code === "55000") return { jobId: job.job_id, messageId: job.message_id, outcome: "taken_over", error: message };
        if (failed.error) throw new Error(`fail_triage_job: ${failed.error.message}`);
        return { jobId: job.job_id, messageId: job.message_id, outcome: failed.data as "queued" | "failed", error: message };
      }
    }),
  );
}
