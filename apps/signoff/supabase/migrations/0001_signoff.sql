-- Signoff: purchase and expense approvals for small teams.
--
-- Rules that must hold even if the web app has a bug live here, in the database:
--   * tenants are isolated by Row Level Security
--   * a request moves through a fixed set of states (trigger)
--   * nobody approves their own request, and approvers have a spending limit (decide_request)
--   * every request state change and every role change is written to an append-only log in the same transaction
--   * users write only the request fields a draft owns; status, dates and decisions change only through the functions

create type public.member_role as enum ('owner', 'admin', 'approver', 'member');
create type public.request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'withdrawn');
create type public.request_category as enum ('software', 'hardware', 'travel', 'services', 'other');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  approver_limit_cents bigint not null default 500000 check (approver_limit_cents > 0),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  email text not null
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  requester_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category public.request_category not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency char(3) not null default 'USD',
  status public.request_status not null default 'draft',
  submitted_at timestamptz,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decision_fields_match_status
    check ((status in ('approved', 'rejected')) = (decided_by is not null and decided_at is not null))
);
create index requests_org_status_idx on public.requests (org_id, status, created_at desc);
create index requests_requester_idx on public.requests (requester_id, created_at desc);

create table public.request_events (
  id bigint generated always as identity primary key,
  -- Deleting a draft keeps its entries (and adds a 'deleted' one): the log outlives the request. request_id is the
  -- link while the request exists; request_ref keeps its id for good, so a deleted draft's entries still group together.
  request_id uuid references public.requests (id) on delete set null,
  request_ref uuid not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Removing a person keeps their entries, with the actor left blank, like the request link above.
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('created', 'submitted', 'withdrawn', 'approved', 'rejected', 'deleted')),
  note text,
  created_at timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (request_ref, created_at);

create function public.fill_request_ref() returns trigger
language plpgsql as $$
begin
  new.request_ref := coalesce(new.request_ref, new.request_id);
  return new;
end $$;

create trigger request_events_ref before insert on public.request_events
  for each row execute function public.fill_request_ref();
create index request_events_org_idx on public.request_events (org_id, created_at desc);

-- Who changed whose role, from what to what. Written only by set_member_role(). Removing a person keeps the
-- entries about them, with their name left blank.
create table public.role_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  old_role public.member_role not null,
  new_role public.member_role not null,
  created_at timestamptz not null default now()
);
create index role_events_org_idx on public.role_events (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so policies on memberships do not recurse.

create function public.my_role(p_org uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from memberships where org_id = p_org and user_id = auth.uid()
$$;

create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid())
$$;

create function public.can_review(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role(p_org) in ('owner', 'admin', 'approver'), false)
$$;

create function public.can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role(p_org) in ('owner', 'admin'), false)
$$;

create function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships a join memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.requests enable row level security;
alter table public.request_events enable row level security;
alter table public.role_events enable row level security;

create policy "members read their organization" on public.organizations
  for select to authenticated using (public.is_member(id));

create policy "read own and teammates' profiles" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_org_with(id));

create policy "members read the member list" on public.memberships
  for select to authenticated using (public.is_member(org_id));

create policy "requesters and reviewers read requests" on public.requests
  for select to authenticated
  using (requester_id = auth.uid() or public.can_review(org_id));

create policy "members create their own drafts" on public.requests
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'draft' and decided_by is null and public.is_member(org_id));

create policy "requesters edit their own drafts" on public.requests
  for update to authenticated
  using (requester_id = auth.uid() and status = 'draft')
  with check (requester_id = auth.uid() and status = 'draft');

create policy "requesters delete their own drafts" on public.requests
  for delete to authenticated
  using (requester_id = auth.uid() and status = 'draft');

-- Entries of a deleted draft are read by the same people who could read the draft: its author and reviewers.
create policy "read events of visible requests" on public.request_events
  for select to authenticated
  using (
    exists (select 1 from public.requests r where r.id = request_id)
    or (request_id is null and public.is_member(org_id) and (actor_id = auth.uid() or public.can_review(org_id)))
  );

-- The people who can change roles read the history of role changes.
create policy "owners and admins read role changes" on public.role_events
  for select to authenticated using (public.can_manage(org_id));

-- No insert/update/delete policies on memberships or the two logs:
-- they change only through the functions below.
revoke insert, update, delete on public.memberships, public.request_events, public.role_events, public.organizations from authenticated, anon;

-- A draft's author writes only what a draft is made of. Without this, the policies above would also let them set
-- created_at, or submitted_at, decided_at and decision_note on a draft, and a request would carry dates and a
-- decision that no function wrote. Status still has its trigger; it simply isn't writable any more.
revoke insert, update on public.requests from authenticated, anon;
grant insert (org_id, requester_id, title, description, category, amount_cents, currency) on public.requests to authenticated;
grant update (title, description, category, amount_cents, currency) on public.requests to authenticated;

-- ---------------------------------------------------------------------------
-- State machine

create function public.enforce_request_transition() returns trigger
language plpgsql as $$
begin
  if new.org_id <> old.org_id or new.requester_id <> old.requester_id then
    raise exception 'org and requester cannot change' using errcode = 'check_violation';
  end if;
  if old.status <> 'draft' and (new.title, new.description, new.category, new.amount_cents, new.currency)
     is distinct from (old.title, old.description, old.category, old.amount_cents, old.currency) then
    raise exception 'only drafts can be edited' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status in ('approved', 'rejected', 'withdrawn'))
  ) then
    raise exception 'illegal transition: % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger requests_transition before update on public.requests
  for each row execute function public.enforce_request_transition();

create function public.log_request_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into request_events (request_id, org_id, actor_id, action) values (new.id, new.org_id, new.requester_id, 'created');
  return new;
end $$;

create trigger requests_created after insert on public.requests
  for each row execute function public.log_request_created();

-- The title goes into the note, because the request row it would link to is gone; request_ref ties it to the earlier entries.
-- Skipped when the whole organization is being deleted: its log goes with it.
create function public.log_request_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from organizations where id = old.org_id) then
    insert into request_events (request_id, request_ref, org_id, actor_id, action, note)
    values (null, old.id, old.org_id, coalesce(auth.uid(), old.requester_id), 'deleted', old.title);
  end if;
  return old;
end $$;

create trigger requests_deleted after delete on public.requests
  for each row execute function public.log_request_deleted();

-- ---------------------------------------------------------------------------
-- Actions

create function public.submit_request(p_id uuid) returns public.requests
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  update requests set status = 'submitted', submitted_at = now()
    where id = p_id and requester_id = auth.uid() and status = 'draft'
    returning * into r;
  if r.id is null then raise exception 'request not found or not a draft' using errcode = 'P0002'; end if;
  insert into request_events (request_id, org_id, actor_id, action) values (r.id, r.org_id, auth.uid(), 'submitted');
  return r;
end $$;

create function public.withdraw_request(p_id uuid) returns public.requests
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  update requests set status = 'withdrawn'
    where id = p_id and requester_id = auth.uid() and status = 'submitted'
    returning * into r;
  if r.id is null then raise exception 'request not found or not awaiting review' using errcode = 'P0002'; end if;
  insert into request_events (request_id, org_id, actor_id, action) values (r.id, r.org_id, auth.uid(), 'withdrawn');
  return r;
end $$;

-- Two reviewers clicking at the same moment: the row lock makes the second one
-- see the decided status and fail with "already decided" instead of overwriting.
create function public.decide_request(p_id uuid, p_decision text, p_note text default null)
returns public.requests
language plpgsql security definer set search_path = public as $$
declare
  cur requests;
  r requests;
  role member_role;
  lim bigint;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'a rejection needs a note for the requester' using errcode = '22023';
  end if;

  select * into cur from requests where id = p_id for update;
  if cur.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;

  role := my_role(cur.org_id);
  if role is null or role = 'member' then
    raise exception 'only reviewers can decide requests' using errcode = '42501';
  end if;
  if cur.requester_id = auth.uid() then
    raise exception 'you cannot decide your own request' using errcode = '42501';
  end if;
  if cur.status <> 'submitted' then
    raise exception 'request already %', cur.status using errcode = '55000';
  end if;
  select approver_limit_cents into lim from organizations where id = cur.org_id;
  if p_decision = 'approved' and role = 'approver' and cur.amount_cents > lim then
    raise exception 'amount is above your approval limit' using errcode = '42501';
  end if;

  update requests
    set status = p_decision::request_status, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
    where id = p_id
    returning * into r;
  insert into request_events (request_id, org_id, actor_id, action, note)
    values (r.id, r.org_id, auth.uid(), p_decision, nullif(btrim(p_note), ''));
  return r;
end $$;

create function public.set_member_role(p_org uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = public as $$
declare
  mine member_role;
  theirs member_role;
begin
  -- One role change per organization at a time. Without this, two owners demoting each other at the same
  -- moment each lock only the other row, both count two owners, and the organization ends up with none.
  perform 1 from organizations where id = p_org for update;
  mine := my_role(p_org);
  if mine is null or mine not in ('owner', 'admin') then
    raise exception 'only owners and admins can change roles' using errcode = '42501';
  end if;
  select role into theirs from memberships where org_id = p_org and user_id = p_user for update;
  if theirs is null then raise exception 'not a member' using errcode = 'P0002'; end if;
  if mine = 'admin' and (theirs = 'owner' or p_role = 'owner') then
    raise exception 'only owners can grant or remove the owner role' using errcode = '42501';
  end if;
  if theirs = 'owner' and p_role <> 'owner'
     and (select count(*) from memberships where org_id = p_org and role = 'owner') = 1 then
    raise exception 'an organization needs at least one owner' using errcode = '55000';
  end if;
  update memberships set role = p_role where org_id = p_org and user_id = p_user;
  if theirs <> p_role then
    insert into role_events (org_id, actor_id, user_id, old_role, new_role) values (p_org, auth.uid(), p_user, theirs, p_role);
  end if;
end $$;

-- Dashboard numbers, computed under the caller's RLS (security invoker).
create function public.dashboard_stats(p_org uuid)
returns table (status public.request_status, n bigint, total_cents bigint)
language sql stable security invoker set search_path = public as $$
  select status, count(*), coalesce(sum(amount_cents), 0)
  from requests where org_id = p_org group by status
$$;

-- New functions are executable by PUBLIC by default, which includes anon. Start from nothing, then grant.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
