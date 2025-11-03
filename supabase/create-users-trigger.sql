-- ============================================================
-- TRIGGER: Create public.users row when auth.users is created
-- ============================================================
-- This trigger automatically creates a row in public.users
-- whenever a new user signs up (email or Google OAuth)

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    user_id,
    email,
    first_name,
    last_name,
    photo_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(
      NEW.raw_user_meta_data->>'last_name',
      CASE 
        WHEN NEW.raw_user_meta_data->>'full_name' IS NOT NULL 
        THEN (string_to_array(NEW.raw_user_meta_data->>'full_name', ' '))[array_length(string_to_array(NEW.raw_user_meta_data->>'full_name', ' '), 1)]
        ELSE ''
      END,
      ''
    ),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, users.last_name),
    -- Only update photo_url if it's currently NULL/empty (preserve manual uploads)
    photo_url = COALESCE(users.photo_url, EXCLUDED.photo_url);
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- User already exists, that's fine
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't fail auth
    RAISE WARNING 'Failed to create user row for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists (may be pointing to old table)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- BACKFILL: Create public.users rows for existing auth.users
-- ============================================================
-- This will create rows in public.users for any auth.users
-- that don't have a corresponding public.users row yet

INSERT INTO public.users (
  user_id,
  email,
  first_name,
  last_name,
  photo_url
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'first_name',
    CASE 
      WHEN u.raw_user_meta_data->>'full_name' IS NOT NULL 
      THEN (string_to_array(u.raw_user_meta_data->>'full_name', ' '))[1]
      ELSE ''
    END,
    ''
  ) as first_name,
  COALESCE(
    u.raw_user_meta_data->>'last_name',
    CASE 
      WHEN u.raw_user_meta_data->>'full_name' IS NOT NULL 
      THEN (string_to_array(u.raw_user_meta_data->>'full_name', ' '))[array_length(string_to_array(u.raw_user_meta_data->>'full_name', ' '), 1)]
      ELSE ''
    END,
    ''
  ) as last_name,
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', NULL) as photo_url
FROM auth.users u
LEFT JOIN public.users pu ON u.id = pu.user_id
WHERE pu.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Success message
SELECT 'Trigger created and existing users backfilled!' as result;

