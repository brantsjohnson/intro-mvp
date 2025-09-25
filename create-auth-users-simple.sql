-- Create auth users using Supabase's auth functions
-- This script creates users in the auth.users table with specific IDs
-- Run this FIRST before running create-fake-users.sql

-- Create users in auth.users table
-- Note: This requires superuser privileges or using the Supabase Admin API

-- Method 1: Using auth.users table directly (requires superuser)
-- Uncomment these if you have superuser access:

/*
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES 
-- Alex Chen
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex.chen@startup.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Sarah Johnson  
('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah.j@marketing.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Marcus Rodriguez
('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcus.r@tech.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Emma Thompson
('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emma.t@product.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- David Kim
('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'david.k@data.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Zoe Martinez
('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zoe.m@design.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- James Wilson
('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'james.w@sales.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Priya Patel
('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'priya.p@devops.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Michael Brown
('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'michael.b@business.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Lisa Garcia
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lisa.g@mobile.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Ryan O'Connor
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ryan.o@content.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Amanda Lee
('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amanda.l@finance.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Carlos Silva
('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carlos.s@ops.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Nina Volkov
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nina.v@ai.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),

-- Tom Anderson
('ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tom.a@success.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', '');
*/

-- Method 2: Use Supabase Dashboard (Recommended)
-- Go to Supabase Dashboard > Authentication > Users > Add User
-- Create users with these exact IDs and emails:

SELECT 'Please create these users in Supabase Dashboard > Authentication > Users:' as instruction;

SELECT 
  'User ID: ' || id || ' | Email: ' || email || ' | Password: password123' as user_info
FROM (VALUES 
  ('11111111-1111-1111-1111-111111111111', 'alex.chen@startup.com'),
  ('22222222-2222-2222-2222-222222222222', 'sarah.j@marketing.com'),
  ('33333333-3333-3333-3333-333333333333', 'marcus.r@tech.com'),
  ('44444444-4444-4444-4444-444444444444', 'emma.t@product.com'),
  ('55555555-5555-5555-5555-555555555555', 'david.k@data.com'),
  ('66666666-6666-6666-6666-666666666666', 'zoe.m@design.com'),
  ('77777777-7777-7777-7777-777777777777', 'james.w@sales.com'),
  ('88888888-8888-8888-8888-888888888888', 'priya.p@devops.com'),
  ('99999999-9999-9999-9999-999999999999', 'michael.b@business.com'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lisa.g@mobile.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ryan.o@content.com'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'amanda.l@finance.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'carlos.s@ops.com'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'nina.v@ai.com'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'tom.a@success.com')
) AS users(id, email);

SELECT 'After creating these users, run create-fake-users.sql to populate their profiles!' as next_step;
