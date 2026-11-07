-- Demo data. Every person and company here is fictional.
-- Local demo password for all users: demo-password-123  (never use these accounts outside local development)
-- No emails are seeded: they arrive through the signed webhook (`npm run send-samples`), like real mail.

insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000101', 'ana@tidebook.test',  crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Ana Torres"}'),
  ('00000000-0000-4000-8000-000000000102', 'ben@tidebook.test',  crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Ben Okafor"}'),
  ('00000000-0000-4000-8000-000000000109', 'cleo@harbor.test',   crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Cleo Martin"}');

insert into public.profiles (id, full_name, email)
select id, raw_user_meta_data->>'full_name', email from auth.users;

insert into public.teams (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Tidebook Support'),
  ('20000000-0000-4000-8000-000000000009', 'Harbor Help Desk');

insert into public.memberships (team_id, user_id) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102'),
  ('20000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000109');
