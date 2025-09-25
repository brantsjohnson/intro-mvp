-- Update display names for auth users
-- This script updates the user_metadata for each auth user
-- Run this in Supabase SQL Editor

-- Update user metadata for each user with full name, first name, and last name
UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Alex Chen"'::jsonb
    ),
    '{first_name}',
    '"Alex"'::jsonb
  ),
  '{last_name}',
  '"Chen"'::jsonb
)
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Sarah Johnson"'::jsonb
    ),
    '{first_name}',
    '"Sarah"'::jsonb
  ),
  '{last_name}',
  '"Johnson"'::jsonb
)
WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Marcus Rodriguez"'::jsonb
    ),
    '{first_name}',
    '"Marcus"'::jsonb
  ),
  '{last_name}',
  '"Rodriguez"'::jsonb
)
WHERE id = '33333333-3333-3333-3333-333333333333';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Emma Thompson"'::jsonb
    ),
    '{first_name}',
    '"Emma"'::jsonb
  ),
  '{last_name}',
  '"Thompson"'::jsonb
)
WHERE id = '44444444-4444-4444-4444-444444444444';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"David Kim"'::jsonb
    ),
    '{first_name}',
    '"David"'::jsonb
  ),
  '{last_name}',
  '"Kim"'::jsonb
)
WHERE id = '55555555-5555-5555-5555-555555555555';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Zoe Martinez"'::jsonb
    ),
    '{first_name}',
    '"Zoe"'::jsonb
  ),
  '{last_name}',
  '"Martinez"'::jsonb
)
WHERE id = '66666666-6666-6666-6666-666666666666';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"James Wilson"'::jsonb
    ),
    '{first_name}',
    '"James"'::jsonb
  ),
  '{last_name}',
  '"Wilson"'::jsonb
)
WHERE id = '77777777-7777-7777-7777-777777777777';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Priya Patel"'::jsonb
    ),
    '{first_name}',
    '"Priya"'::jsonb
  ),
  '{last_name}',
  '"Patel"'::jsonb
)
WHERE id = '88888888-8888-8888-8888-888888888888';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Michael Brown"'::jsonb
    ),
    '{first_name}',
    '"Michael"'::jsonb
  ),
  '{last_name}',
  '"Brown"'::jsonb
)
WHERE id = '99999999-9999-9999-9999-999999999999';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Lisa Garcia"'::jsonb
    ),
    '{first_name}',
    '"Lisa"'::jsonb
  ),
  '{last_name}',
  '"Garcia"'::jsonb
)
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Ryan O\'Connor"'::jsonb
    ),
    '{first_name}',
    '"Ryan"'::jsonb
  ),
  '{last_name}',
  '"O\'Connor"'::jsonb
)
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Amanda Lee"'::jsonb
    ),
    '{first_name}',
    '"Amanda"'::jsonb
  ),
  '{last_name}',
  '"Lee"'::jsonb
)
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Carlos Silva"'::jsonb
    ),
    '{first_name}',
    '"Carlos"'::jsonb
  ),
  '{last_name}',
  '"Silva"'::jsonb
)
WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Nina Volkov"'::jsonb
    ),
    '{first_name}',
    '"Nina"'::jsonb
  ),
  '{last_name}',
  '"Volkov"'::jsonb
)
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

UPDATE auth.users 
SET user_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(user_metadata, '{}'::jsonb), 
      '{full_name}', 
      '"Tom Anderson"'::jsonb
    ),
    '{first_name}',
    '"Tom"'::jsonb
  ),
  '{last_name}',
  '"Anderson"'::jsonb
)
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

-- Success message
SELECT 'Successfully updated display names for all auth users!' as result;
