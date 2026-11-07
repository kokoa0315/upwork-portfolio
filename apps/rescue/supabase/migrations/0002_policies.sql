-- Access rules as the portal shipped. Kept unchanged: the fix is a new migration (0003), the way it would be
-- deployed to a live database. `DEVSTACK_UNTIL=0002_policies.sql npm run db:reset` rebuilds this state.

create policy "members read their client" on public.clients for select to authenticated using (public.is_member(id));
create policy "read own and teammates' profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_client_with(id));
create policy "members read their team" on public.memberships for select to authenticated using (public.is_member(client_id));

create policy "signed-in users read invoices" on public.invoices for select to authenticated
  using (auth.uid() is not null);

-- Lets people switch their own invoice emails on and off, and owners manage their team.
create policy "update own membership or as owner" on public.memberships for update to authenticated
  using (user_id = auth.uid() or public.is_owner(client_id));
