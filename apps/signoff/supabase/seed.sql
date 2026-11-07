-- Demo data. Every person and company here is fictional.
-- Local demo password for all users: demo-password-123  (never use these accounts outside local development)

insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'olivia@northwind.test', crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Olivia Park"}'),
  ('00000000-0000-4000-8000-000000000002', 'marcus@northwind.test', crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Marcus Chen"}'),
  ('00000000-0000-4000-8000-000000000003', 'priya@northwind.test',  crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Priya Shah"}'),
  ('00000000-0000-4000-8000-000000000004', 'diego@northwind.test',  crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Diego Alvarez"}'),
  ('00000000-0000-4000-8000-000000000005', 'hana@northwind.test',   crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Hana Kimura"}'),
  ('00000000-0000-4000-8000-000000000009', 'sam@contoso.test',      crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Sam Lee"}');

insert into public.profiles (id, full_name, email)
select id, raw_user_meta_data->>'full_name', email from auth.users;

insert into public.organizations (id, name, approver_limit_cents) values
  ('10000000-0000-4000-8000-000000000001', 'Northwind Studio', 500000),
  ('10000000-0000-4000-8000-000000000009', 'Contoso Labs', 500000);

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'approver'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'member'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'member'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'admin'),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000009', 'owner');

-- Requests across the last ~8 weeks. Decisions are written the same way decide_request writes them.
do $$
declare
  org constant uuid := '10000000-0000-4000-8000-000000000001';
  olivia constant uuid := '00000000-0000-4000-8000-000000000001';
  marcus constant uuid := '00000000-0000-4000-8000-000000000002';
  priya constant uuid := '00000000-0000-4000-8000-000000000003';
  diego constant uuid := '00000000-0000-4000-8000-000000000004';
  hana constant uuid := '00000000-0000-4000-8000-000000000005';
  rec record;
  rid uuid;
  t0 timestamptz;
begin
  for rec in
    select * from (values
      ('Figma Organization seats (12)', 'software', 54000, priya, 'approved', marcus, 52, null),
      ('MacBook Pro 14" for new designer', 'hardware', 249900, diego, 'approved', olivia, 47, null),
      ('Client workshop travel: Osaka', 'travel', 86500, priya, 'approved', marcus, 41, null),
      ('Stock photo credits (annual)', 'software', 39900, diego, 'rejected', marcus, 38, 'We already have a team plan until March. Please use that.'),
      ('Usability testing panel (8 sessions)', 'services', 180000, priya, 'approved', marcus, 33, null),
      ('External monitor 27" 4K', 'hardware', 45900, diego, 'approved', marcus, 29, null),
      ('Conference ticket: Config', 'travel', 79900, hana, 'approved', olivia, 24, null),
      ('Accessibility audit (WCAG 2.2)', 'services', 620000, priya, 'approved', olivia, 19, null),
      ('Team offsite venue deposit', 'other', 150000, hana, 'withdrawn', null, 15, null),
      ('Sentry Team plan', 'software', 31200, diego, 'approved', marcus, 12, null),
      ('Copywriting for launch pages', 'services', 240000, priya, 'rejected', olivia, 9, 'Launch copy is covered by the agency retainer.'),
      ('Ergonomic chair', 'hardware', 68000, diego, 'submitted', null, 4, null),
      ('Motion design freelancer (2 weeks)', 'services', 720000, priya, 'submitted', null, 3, null),
      ('Train tickets: Kyoto client visit', 'travel', 27400, diego, 'submitted', null, 2, null),
      ('Notion Plus (team)', 'software', 19200, priya, 'submitted', null, 1, null),
      ('Prototype hardware kit', 'hardware', 38500, priya, 'draft', null, 0, null)
    ) as t(title, category, amount, requester, status, decider, days_ago, note)
  loop
    t0 := now() - make_interval(days => rec.days_ago, hours => 3);
    insert into public.requests (org_id, requester_id, title, category, amount_cents, created_at, description)
    values (org, rec.requester, rec.title, rec.category::request_category, rec.amount, t0,
            'Needed for current client work. Quote attached in the shared drive.')
    returning id into rid;
    update public.request_events set created_at = t0 where request_id = rid;
    if rec.status <> 'draft' then
      update public.requests set status = 'submitted', submitted_at = t0 + interval '1 hour' where id = rid;
      insert into public.request_events (request_id, org_id, actor_id, action, created_at)
      values (rid, org, rec.requester, 'submitted', t0 + interval '1 hour');
    end if;
    if rec.status in ('approved', 'rejected') then
      update public.requests set status = rec.status::request_status, decided_by = rec.decider,
        decided_at = t0 + interval '20 hours', decision_note = rec.note where id = rid;
      insert into public.request_events (request_id, org_id, actor_id, action, note, created_at)
      values (rid, org, rec.decider, rec.status, rec.note, t0 + interval '20 hours');
    elsif rec.status = 'withdrawn' then
      update public.requests set status = 'withdrawn' where id = rid;
      insert into public.request_events (request_id, org_id, actor_id, action, created_at)
      values (rid, org, rec.requester, 'withdrawn', t0 + interval '2 hours');
    end if;
  end loop;

  insert into public.requests (org_id, requester_id, title, category, amount_cents)
  values ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000009', 'Contoso private lab equipment', 'hardware', 990000);
end $$;
