-- Check if profile creation trigger exists and fix it
-- This script will ensure profiles are automatically created when users sign up

-- First, check if the trigger function exists
SELECT 
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- Check if the trigger exists
SELECT 
  tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'users' 
  AND t.tgname = 'on_auth_user_created'
  AND t.tgisinternal = FALSE;

-- Create or replace the profile creation function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    email,
    avatar_url,
    job_title,
    company,
    what_do_you_do,
    location,
    linkedin_url,
    mbti,
    enneagram,
    networking_goals,
    hobbies,
    expertise_tags,
    consent,
    career_goals,
    who_they_want_to_meet
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL, -- networking_goals as NULL, not empty array
    NULL, -- hobbies as NULL, not empty array
    NULL, -- expertise_tags as NULL, not empty array
    false,
    NULL,
    NULL
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, just return NEW
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log the error but don't fail the auth user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Create profiles for existing users who don't have them
INSERT INTO public.profiles (
  id,
  first_name,
  last_name,
  email,
  avatar_url,
  job_title,
  company,
  what_do_you_do,
  location,
  linkedin_url,
  mbti,
  enneagram,
  networking_goals,
  hobbies,
  expertise_tags,
  consent,
  career_goals,
  who_they_want_to_meet
)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'first_name', ''),
  COALESCE(u.raw_user_meta_data->>'last_name', ''),
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'avatar_url', NULL),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  NULL
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

SELECT 'Successfully created/fixed profile creation trigger and created missing profiles!' as result;
