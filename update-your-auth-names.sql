-- Update display names for your actual auth users
-- This script updates the user_metadata for each auth user with your real UIDs and emails

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
WHERE id = '5e8a1d33-41f7-40d0-ada4-550d21533a1b';

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
WHERE id = '097c55f0-5d64-4e42-ab30-18515606bdf4';

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
WHERE id = 'e3e48b02-d906-40a3-ad3b-7873ddb2f871';

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
WHERE id = '60d7b9fc-cde9-4953-8cda-78872912aec6';

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
WHERE id = 'c2d15c3d-e383-4fa5-81d9-c8886e11f5c8';

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
WHERE id = 'aa49a9c8-4cef-43c7-9f92-1fb277ceb961';

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
WHERE id = '4ceb8e16-8d54-410a-89a7-97240e907318';

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
WHERE id = 'fe6546bd-5747-46e0-9c69-8ddfb498d529';

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
WHERE id = '9cfc0875-f455-4d43-9287-2fc3ca8a149b';

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
WHERE id = '5a7fc925-0c7e-411b-9d94-2e58f1f55fc9';

-- Success message
SELECT 'Successfully updated display names for all your auth users!' as result;
