-- Sorted: inbound support email -> AI triage (category, priority, summary, draft reply) -> human approval.
-- Users read through RLS. Writes that change state go through functions. The webhook and the
-- worker run server-side with the service role and only call the queue functions below.

create type public.message_status as enum ('queued', 'triaging', 'needs_review', 'replied', 'dismissed', 'failed');
create type public.job_status as enum ('queued', 'running', 'done', 'failed');
create type public.triage_category as enum ('billing', 'bug', 'account', 'how_to', 'feature_request', 'other');
create type public.triage_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null
);

create table public.memberships (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  -- The sender system's message id. Retried webhook deliveries carry the same one.
  external_id text not null,
  from_email text not null,
  from_name text,
  subject text not null,
  body text not null,
  received_at timestamptz not null default now(),
  status public.message_status not null default 'queued',
  unique (team_id, external_id),
  check (length(body) <= 20000 and length(subject) <= 300)
);
create index messages_team_status on public.messages (team_id, status, received_at desc);

create table public.triage_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages (id) on delete cascade,
  status public.job_status not null default 'queued',
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  claim_token uuid, -- new on every claim; only the worker holding the current one may complete or fail the job
  last_error text,
  created_at timestamptz not null default now()
);
create index triage_jobs_ready on public.triage_jobs (run_after) where status = 'queued';

create table public.triage_results (
  message_id uuid primary key references public.messages (id) on delete cascade,
  category public.triage_category not null,
  priority public.triage_priority not null,
  summary text not null,
  draft_reply text not null,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  -- Set when the model thinks a person must look closer (legal threats, refunds above policy, unclear asks).
  needs_human_reason text,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int not null default 0,
  created_at timestamptz not null default now()
);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 10000),
  edited boolean not null,
  approved_by uuid not null references public.profiles (id),
  approved_at timestamptz not null default now(),
  -- This demo never sends email. A real deployment would hand the row to an email provider here.
  delivery text not null default 'simulated' check (delivery = 'simulated')
);

create table public.message_events (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.messages (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  -- received, triaged, triage_retry, triage_failed, approved, dismissed, requeued
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index message_events_message on public.message_events (message_id, created_at);

-- ---------------------------------------------------------------- access helpers

create function public.is_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where team_id = p_team and user_id = auth.uid())
$$;

create function public.shares_team_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.messages enable row level security;
alter table public.triage_jobs enable row level security;
alter table public.triage_results enable row level security;
alter table public.replies enable row level security;
alter table public.message_events enable row level security;

create policy "members read their team" on public.teams for select to authenticated using (public.is_member(id));
create policy "read own and teammates' profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));
create policy "members read the member list" on public.memberships for select to authenticated using (public.is_member(team_id));
create policy "members read team messages" on public.messages for select to authenticated using (public.is_member(team_id));
create policy "members read team jobs" on public.triage_jobs for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.team_id)));
create policy "members read team triage" on public.triage_results for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.team_id)));
create policy "members read team replies" on public.replies for select to authenticated using (public.is_member(team_id));
create policy "members read team events" on public.message_events for select to authenticated using (public.is_member(team_id));

-- Users never write tables directly; every change below goes through a function.
revoke insert, update, delete on all tables in schema public from authenticated, anon;

-- ---------------------------------------------------------------- user actions

-- Approve (optionally edited) reply. Exactly one approval per message, even if two agents click at once.
create function public.approve_reply(p_message uuid, p_body text) returns public.replies
language plpgsql security definer set search_path = public as $$
declare
  m public.messages;
  draft text;
  r public.replies;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'the reply is empty' using errcode = '22023';
  end if;
  select * into m from public.messages where id = p_message for update;
  if m.id is null or not public.is_member(m.team_id) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  if m.status <> 'needs_review' then
    raise exception 'message is already %', replace(m.status::text, '_', ' ') using errcode = '55000';
  end if;
  select draft_reply into draft from public.triage_results where message_id = m.id;
  insert into public.replies (message_id, team_id, body, edited, approved_by)
  values (m.id, m.team_id, trim(p_body), trim(p_body) is distinct from trim(coalesce(draft, '')), auth.uid())
  returning * into r;
  update public.messages set status = 'replied' where id = m.id;
  insert into public.message_events (message_id, team_id, actor_id, action, detail)
  values (m.id, m.team_id, auth.uid(), 'approved', jsonb_build_object('edited', r.edited));
  return r;
end $$;

create function public.dismiss_message(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message for update;
  if m.id is null or not public.is_member(m.team_id) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  if m.status not in ('needs_review', 'failed') then
    raise exception 'message is already %', replace(m.status::text, '_', ' ') using errcode = '55000';
  end if;
  update public.messages set status = 'dismissed' where id = m.id;
  insert into public.message_events (message_id, team_id, actor_id, action, detail)
  values (m.id, m.team_id, auth.uid(), 'dismissed', jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
end $$;

-- Put a message back in the queue (after a failure, or to get a fresh draft).
create function public.requeue_message(p_message uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message for update;
  if m.id is null or not public.is_member(m.team_id) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  if m.status not in ('needs_review', 'failed') then
    raise exception 'message is already %', replace(m.status::text, '_', ' ') using errcode = '55000';
  end if;
  delete from public.triage_results where message_id = m.id;
  update public.triage_jobs set status = 'queued', attempts = 0, run_after = now(), locked_at = null, claim_token = null, last_error = null
  where message_id = m.id;
  update public.messages set status = 'queued' where id = m.id;
  insert into public.message_events (message_id, team_id, actor_id, action) values (m.id, m.team_id, auth.uid(), 'requeued');
end $$;

-- ---------------------------------------------------------------- ingestion and queue (service role only)

-- Idempotent: a retried delivery with the same external id returns the existing row.
create function public.ingest_message(p_team uuid, p_external_id text, p_from_email text, p_from_name text, p_subject text, p_body text)
returns table (message_id uuid, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into public.messages (team_id, external_id, from_email, from_name, subject, body)
  values (p_team, p_external_id, p_from_email, p_from_name, p_subject, p_body)
  on conflict (team_id, external_id) do nothing
  returning id into new_id;
  if new_id is null then
    return query select id, true from public.messages where team_id = p_team and external_id = p_external_id;
    return;
  end if;
  insert into public.triage_jobs (message_id) values (new_id);
  insert into public.message_events (message_id, team_id, action) values (new_id, p_team, 'received');
  return query select new_id, false;
end $$;

-- Hand out up to p_limit ready jobs. SKIP LOCKED lets several workers run without taking the same job.
-- A job stuck in 'running' for 5 minutes (a crashed worker) becomes claimable again, unless it has used
-- all its attempts: an email that crashes the worker every time goes to a person instead of looping forever.
create function public.claim_triage_jobs(p_limit int, p_max_attempts int default 3)
returns table (job_id uuid, message_id uuid, attempts int, claim_token uuid, subject text, body text, from_email text, from_name text)
language plpgsql security definer set search_path = public as $$
begin
  with given_up as (
    update public.triage_jobs j
    set status = 'failed', locked_at = null, last_error = 'The worker stopped responding on every attempt.'
    where j.status = 'running' and j.locked_at < now() - interval '5 minutes' and j.attempts >= p_max_attempts
    returning j.message_id, j.attempts
  ), marked as (
    update public.messages m set status = 'failed'
    from given_up g where m.id = g.message_id
    returning m.id, m.team_id, g.attempts
  )
  insert into public.message_events (message_id, team_id, action, detail)
  select mk.id, mk.team_id, 'triage_failed', jsonb_build_object('attempt', mk.attempts, 'error', 'The worker stopped responding on every attempt.')
  from marked mk;

  return query
  with ready as (
    select j.id from public.triage_jobs j
    where (j.status = 'queued' and j.run_after <= now())
       or (j.status = 'running' and j.locked_at < now() - interval '5 minutes')
    order by j.run_after
    limit greatest(p_limit, 0)
    for update skip locked
  ), claimed as (
    update public.triage_jobs j set status = 'running', attempts = j.attempts + 1, locked_at = now(), claim_token = gen_random_uuid()
    from ready where j.id = ready.id
    returning j.id, j.message_id, j.attempts, j.claim_token
  ), marked as (
    update public.messages m set status = 'triaging'
    from claimed c where m.id = c.message_id
    returning m.id, m.subject, m.body, m.from_email, m.from_name
  )
  select c.id, c.message_id, c.attempts, c.claim_token, mk.subject, mk.body, mk.from_email, mk.from_name
  from claimed c join marked mk on mk.id = c.message_id;
end $$;

-- p_claim is the token the worker got from claim_triage_jobs. Every claim makes a new one, so after the job is
-- reclaimed (5 minutes) or requeued for a new draft, a worker that comes back late can't overwrite or fail it.
-- (An attempt number wouldn't do: a requeue starts the count again, so an old number can come round again.)
create function public.complete_triage_job(p_job uuid, p_claim uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare j public.triage_jobs; m public.messages;
begin
  select * into j from public.triage_jobs where id = p_job for update;
  if j.id is null or j.status <> 'running' or j.claim_token is distinct from p_claim then
    raise exception 'job is not running, or another worker has taken it over' using errcode = '55000';
  end if;
  select * into m from public.messages where id = j.message_id;
  insert into public.triage_results (message_id, category, priority, summary, draft_reply, confidence, needs_human_reason,
                                     provider, model, input_tokens, output_tokens, latency_ms)
  values (j.message_id, (p_result ->> 'category')::public.triage_category, (p_result ->> 'priority')::public.triage_priority,
          p_result ->> 'summary', p_result ->> 'draft_reply', (p_result ->> 'confidence')::numeric,
          nullif(p_result ->> 'needs_human_reason', ''), p_result ->> 'provider', p_result ->> 'model',
          coalesce((p_result ->> 'input_tokens')::int, 0), coalesce((p_result ->> 'output_tokens')::int, 0),
          coalesce((p_result ->> 'latency_ms')::int, 0));
  update public.triage_jobs set status = 'done', locked_at = null, claim_token = null, last_error = null where id = j.id;
  update public.messages set status = 'needs_review' where id = j.message_id;
  insert into public.message_events (message_id, team_id, action, detail)
  values (j.message_id, m.team_id, 'triaged', jsonb_build_object(
    'category', p_result ->> 'category', 'priority', p_result ->> 'priority',
    'model', p_result ->> 'model', 'attempt', j.attempts));
end $$;

-- Record a failure. Retries with exponential backoff (30 s, 2 min, ...) until p_max_attempts, then gives up
-- and leaves the message for a person.
create function public.fail_triage_job(p_job uuid, p_claim uuid, p_error text, p_max_attempts int default 3) returns public.job_status
language plpgsql security definer set search_path = public as $$
declare j public.triage_jobs; m public.messages; final boolean;
begin
  select * into j from public.triage_jobs where id = p_job for update;
  if j.id is null or j.status <> 'running' or j.claim_token is distinct from p_claim then
    raise exception 'job is not running, or another worker has taken it over' using errcode = '55000';
  end if;
  select * into m from public.messages where id = j.message_id;
  final := j.attempts >= p_max_attempts;
  update public.triage_jobs
  set status = case when final then 'failed'::public.job_status else 'queued'::public.job_status end,
      run_after = now() + make_interval(secs => 30 * power(4, j.attempts - 1)),
      locked_at = null,
      claim_token = null,
      last_error = left(p_error, 500)
  where id = j.id;
  update public.messages set status = case when final then 'failed'::public.message_status else 'queued'::public.message_status end
  where id = j.message_id;
  insert into public.message_events (message_id, team_id, action, detail)
  values (j.message_id, m.team_id, case when final then 'triage_failed' else 'triage_retry' end,
          jsonb_build_object('attempt', j.attempts, 'error', left(p_error, 200)));
  return case when final then 'failed'::public.job_status else 'queued'::public.job_status end;
end $$;

create function public.team_stats(p_team uuid)
returns table (status public.message_status, n bigint)
language sql stable security invoker set search_path = public as $$
  select status, count(*) from public.messages where team_id = p_team group by status
$$;

-- Supabase's default privileges grant every new function to anon and authenticated, so start from nothing.
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on function public.is_member(uuid), public.shares_team_with(uuid) to authenticated, service_role;
grant execute on function public.approve_reply(uuid, text), public.dismiss_message(uuid, text),
  public.requeue_message(uuid), public.team_stats(uuid) to authenticated;
grant execute on function public.ingest_message(uuid, text, text, text, text, text), public.claim_triage_jobs(int, int),
  public.complete_triage_job(uuid, uuid, jsonb), public.fail_triage_job(uuid, uuid, text, int) to service_role;
