-- Fictional demo data. Password for every account: demo-password-123

insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000201', 'maya@fernway.test', crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Maya Lin"}'),
  ('00000000-0000-4000-8000-000000000202', 'tom@fernway.test',  crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Tom Reyes"}'),
  ('00000000-0000-4000-8000-000000000301', 'iris@lumen.test',   crypt('demo-password-123', gen_salt('bf', 6)), '{"full_name":"Iris Novak"}');

insert into public.profiles (id, full_name, email)
select id, raw_user_meta_data->>'full_name', email from auth.users;

insert into public.clients (id, name) values
  ('30000000-0000-4000-8000-000000000001', 'Fernway Coffee Co.'),
  ('30000000-0000-4000-8000-000000000002', 'Lumen Dental');

insert into public.memberships (client_id, user_id, role) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'owner'),
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 'member'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000301', 'owner');

insert into public.invoices (id, client_id, number, title, issued_on, due_on, amount_cents, status, memo) values
  ('40000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000001', 'CB-1041', 'Brand discovery workshop', current_date - 120, current_date - 90, 280000, 'paid',
   'Two half-day sessions with the founders.'),
  ('40000000-0000-4000-8000-000000000102', '30000000-0000-4000-8000-000000000001', 'CB-1044', 'Logo and identity system', current_date - 75, current_date - 45, 640000, 'paid',
   'Final files: https://files.cobalt-studio.test/share/fernway/identity-system-final-approved-2026.zip'),
  ('40000000-0000-4000-8000-000000000103', '30000000-0000-4000-8000-000000000001', 'CB-1047', 'Packaging, 3 SKUs', current_date - 40, current_date - 10, 455000, 'overdue',
   'Includes two rounds of print proofs. Dielines: https://files.cobalt-studio.test/share/fernway/packaging-dielines-12oz-5lb-cold-brew.pdf'),
  ('40000000-0000-4000-8000-000000000104', '30000000-0000-4000-8000-000000000001', 'CB-1052', 'Website design, milestone 1', current_date - 12, current_date + 18, 720000, 'open',
   'Milestone 1 of 3: sitemap, wireframes and the homepage design.'),
  ('40000000-0000-4000-8000-000000000105', '30000000-0000-4000-8000-000000000001', 'CB-1055', 'Menu boards for the Alder St. café', current_date - 3, current_date + 27, 185000, 'open',
   ''),
  ('40000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000002', 'CB-1043', 'Patient intake forms redesign', current_date - 80, current_date - 50, 390000, 'paid',
   'Accessible PDF and web versions.'),
  ('40000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000002', 'CB-1050', 'Clinic signage, 2 locations', current_date - 25, current_date + 5, 1240000, 'open',
   'Fabrication quotes from the sign shop are attached separately.'),
  ('40000000-0000-4000-8000-000000000203', '30000000-0000-4000-8000-000000000002', 'CB-1053', 'Appointment reminder emails', current_date - 8, current_date + 22, 210000, 'open',
   '');
