-- Cobalt: a client portal where a design studio's clients see their invoices and manage their team.
-- Each client company is a tenant. Access rules live in 0002 (as shipped) and 0003 (the fix).

create type public.member_role as enum ('owner', 'member');
create type public.invoice_status as enum ('open', 'overdue', 'paid');

create table public.clients (
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
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  notify_on_invoice boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);
create index memberships_user on public.memberships (user_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  number text not null unique,
  title text not null,
  issued_on date not null,
  due_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  status public.invoice_status not null default 'open',
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index invoices_client on public.invoices (client_id, issued_on desc);

create function public.is_member(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where client_id = p_client and user_id = auth.uid())
$$;

create function public.is_owner(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where client_id = p_client and user_id = auth.uid() and role = 'owner')
$$;

create function public.shares_client_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.client_id = b.client_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invoices enable row level security;

-- Invoices are written by the studio's back office (service role), never by client users.
revoke insert, update, delete on public.invoices, public.clients, public.profiles from authenticated, anon;
revoke insert, delete on public.memberships from authenticated, anon;
