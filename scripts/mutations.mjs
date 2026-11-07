// Mutation check for all three apps: break one rule at a time, run the suite that should catch it, record the
// result, put everything back. Every mutation must make at least one test fail. The logs go into each app's
// evidence folder. Run one app at a time, with its stack running: node scripts/mutations.mjs signoff|sorted|rescue
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const which = process.argv[2];
if (!["signoff", "sorted", "rescue"].includes(which)) {
  console.error("usage: node scripts/mutations.mjs signoff|sorted|rescue");
  process.exit(2);
}
const app = path.join(root, "apps", which);
const cli = path.join(root, "devstack/cli.mjs");

/** The current definition of a function in a migration, turned into `create or replace` with one edit applied. */
function fnEdit(file, name, from, to) {
  const sql = fs.readFileSync(path.join(app, file), "utf8");
  const start = sql.indexOf(`create function public.${name}(`);
  if (start < 0) throw new Error(`no function ${name}`);
  const end = sql.indexOf("end $$;", start) + "end $$;".length;
  const body = sql.slice(start, end).replace("create function", "create or replace function");
  if (!body.includes(from)) throw new Error(`${name}: no match for ${from}`);
  return { sql: body.replace(from, to) };
}
const fileEdit = (file, from, to) => ({ file, from, to });

const db = { signoff: "--project db", sorted: "--project db", rescue: "--project db" }[which];
const sets = {
  signoff: () => ({
    "M1 requests readable by every signed-in user": { sql: `drop policy "requesters and reviewers read requests" on public.requests;\ncreate policy "leak" on public.requests for select to authenticated using (true);` },
    "M2 audit log writable by users": { sql: `grant insert, delete on public.request_events to authenticated;\ncreate policy "w" on public.request_events for insert to authenticated with check (true);\ncreate policy "d" on public.request_events for delete to authenticated using (true);` },
    "M3 state-machine trigger removed": { sql: "drop trigger requests_transition on public.requests;" },
    "M4 members may update their own membership": { sql: `grant update on public.memberships to authenticated;\ncreate policy "self" on public.memberships for update to authenticated using (user_id = auth.uid());` },
    "M5 set_member_role without the organization lock": fnEdit("supabase/migrations/0001_signoff.sql", "set_member_role", "  perform 1 from organizations where id = p_org for update;\n", ""),
    "M6 functions left executable by anon": fileEdit("supabase/migrations/0001_signoff.sql", "revoke execute on all functions in schema public from public, anon;", "-- mutation: no revoke"),
    "M7 row-level security off on requests": { sql: "alter table public.requests disable row level security;" },
    "M8 deleting a draft deletes its audit entries": { sql: "alter table public.request_events drop constraint request_events_request_id_fkey, add constraint request_events_request_id_fkey foreign key (request_id) references public.requests (id) on delete cascade;" },
    "M9 role changes not logged": fnEdit("supabase/migrations/0001_signoff.sql", "set_member_role", "    insert into role_events (org_id, actor_id, user_id, old_role, new_role) values (p_org, auth.uid(), p_user, theirs, p_role);\n", ""),
    "M10 every request column writable again (no column grants)": { sql: "grant insert, update on public.requests to authenticated;" },
  }),
  sorted: () => ({
    "M1 agents may call the worker's queue functions": { sql: "grant execute on function public.claim_triage_jobs(int, int), public.ingest_message(uuid, text, text, text, text, text) to authenticated;" },
    "M2 approve_reply without the row lock": fnEdit("supabase/migrations/0001_sorted.sql", "approve_reply", "where id = p_message for update;", "where id = p_message;"),
    "M3 claim without FOR UPDATE SKIP LOCKED": fnEdit("supabase/migrations/0001_sorted.sql", "claim_triage_jobs", "for update skip locked", ""),
    "M4 messages readable by every team": { sql: `drop policy "members read team messages" on public.messages;\ncreate policy "leak" on public.messages for select to authenticated using (true);` },
    "M5 retries never give up": fnEdit("supabase/migrations/0001_sorted.sql", "fail_triage_job", "final := j.attempts >= p_max_attempts;", "final := false;"),
    "M6 requeue keeps the old result": fnEdit("supabase/migrations/0001_sorted.sql", "requeue_message", "delete from public.triage_results where message_id = m.id;", ""),
    "M7 approve_reply ignores the team check": fnEdit("supabase/migrations/0001_sorted.sql", "approve_reply", "if m.id is null or not public.is_member(m.team_id) then", "if m.id is null then"),
    "M8 crashed jobs reclaimed forever": fnEdit("supabase/migrations/0001_sorted.sql", "claim_triage_jobs", "and j.attempts >= p_max_attempts\n    returning", "and false\n    returning"),
    "M9 a late worker can complete a job that was taken over": fnEdit("supabase/migrations/0001_sorted.sql", "complete_triage_job", " or j.claim_token is distinct from p_claim then", " then"),
    "M13 a reclaimed job keeps its old claim token": fnEdit("supabase/migrations/0001_sorted.sql", "claim_triage_jobs", "claim_token = gen_random_uuid()", "claim_token = coalesce(j.claim_token, gen_random_uuid())"),
    "M10 row-level security off on messages": { sql: "alter table public.messages disable row level security;" },
    "M11 signature without the team id": { ...fileEdit("lib/webhook.ts", "update(`${timestamp}.${team}.${rawBody}`)", "update(`${timestamp}.${rawBody}`)"), suite: "--project unit" },
    "M12 only a lowercase </email> neutralized": { ...fileEdit("lib/triage/prompt.ts", 's.replace(/<\\s*\\/\\s*email\\b[^>]*>/gi, "&lt;/email&gt;")', 's.replace(/<\\/email>/g, "&lt;/email&gt;")'), suite: "--project unit" },
  }),
  rescue: () => ({
    "M1 set_member_role without the client lock": fnEdit("supabase/migrations/0003_fix_tenant_access.sql", "set_member_role", "  perform 1 from public.clients where id = v_client for update;\n", ""),
    "M2 invoices readable by every signed-in user again": { sql: `drop policy "members read their client's invoices" on public.invoices;\ncreate policy "leak" on public.invoices for select to authenticated using (true);` },
    "M3 role column writable again": { sql: "grant update on public.memberships to authenticated;" },
  }),
}[which]();

const vitest = (args) => {
  try {
    return execSync(`node ../../node_modules/vitest/vitest.mjs run ${args}`, { cwd: app, encoding: "utf8", stdio: "pipe", timeout: 600_000 });
  } catch (err) {
    return (err.stdout ?? "") + (err.stderr ?? "");
  }
};
const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const reset = () => execSync(`node ${cli} reset --wait`, { cwd: app, stdio: "pipe" });

const migDir = path.join(app, "supabase/migrations");
const tmp = path.join(migDir, "0099_mutation.sql");
const baseline = clean(vitest(db)).match(/Tests\s+([^\n]+)/)?.[1]?.trim();
const lines = [`${which}: mutation check, ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} JST, Windows 11, local stack`, `Baseline (nothing broken): ${baseline}`, ""];
console.log("baseline", baseline);
let survived = 0;
for (const [label, m] of Object.entries(sets)) {
  let restore = null;
  try {
    if (m.sql) fs.writeFileSync(tmp, m.sql + "\n");
    if (m.file) {
      const f = path.join(app, m.file);
      const before = fs.readFileSync(f, "utf8");
      if (!before.includes(m.from)) throw new Error(`${label}: no match in ${m.file}`);
      restore = () => fs.writeFileSync(f, before);
      fs.writeFileSync(f, before.replace(m.from, m.to));
    }
    const out = clean(vitest(m.suite ?? db));
    const summary = out.match(/Tests\s+([^\n]+)/)?.[1]?.trim() ?? "no summary";
    const failed = [...out.matchAll(/FAIL\s+(?:\|\w+\|\s+)?([^\n]+)/g)].map((x) => x[1].trim());
    if (!failed.length) survived++;
    lines.push(`${label}: ${summary}`, ...[...new Set(failed)].map((f) => `    caught by: ${f}`));
    console.log(label, "->", summary);
  } finally {
    fs.rmSync(tmp, { force: true });
    restore?.();
  }
}
reset();
lines.push("", survived ? `${survived} mutation(s) were NOT caught.` : "Every mutation was caught by at least one test. All files were restored and the database rebuilt afterwards.");
const out = which === "rescue" ? path.join(app, "case/evidence/mutations.txt") : path.join(app, "docs/evidence/mutations.txt");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(lines.at(-1), "->", out);
