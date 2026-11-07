-- Fix for two access bugs in 0002, written as a new migration so it can be applied to the live database.
--
-- 1. Invoices were readable by any signed-in user ("auth.uid() is not null"), so every client could list and open
--    every other client's invoices. Now only members of the invoice's client can read it.
-- 2. The membership update policy let people update their own row, meant for the email toggle. It also let a
--    member change their own role to owner. Now users can update only the email toggle on their own row, and role
--    changes go through set_member_role(), which only an owner of the same client can call, never on themselves.

drop policy "signed-in users read invoices" on public.invoices;
create policy "members read their client's invoices" on public.invoices for select to authenticated
  using (public.is_member(client_id));

drop policy "update own membership or as owner" on public.memberships;
revoke update on public.memberships from authenticated, anon;
grant update (notify_on_invoice) on public.memberships to authenticated;
create policy "update own email setting" on public.memberships for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The caller names the client: someone can belong to more than one, and a role is per client.
create function public.set_member_role(p_client uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = public as $$
declare v_client uuid := p_client;
begin
  -- One role change per client at a time, and the owner check after the lock. Without this, two owners demoting
  -- each other at the same moment both pass the check, and the client is left with no owner.
  perform 1 from public.clients where id = v_client for update;
  if v_client is null or not public.is_owner(v_client) then
    raise exception 'only an owner of this client can change roles' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'owners can''t change their own role' using errcode = '42501';
  end if;
  update public.memberships set role = p_role where client_id = v_client and user_id = p_user;
  if not found then
    raise exception 'not a member of this client' using errcode = 'P0002';
  end if;
end $$;

revoke execute on function public.set_member_role(uuid, uuid, public.member_role) from anon, public;
grant execute on function public.set_member_role(uuid, uuid, public.member_role) to authenticated;
