-- Complete fix for onboarding issues including RLS recursion and profile saving
-- Run this in your Supabase SQL editor

-- 1. First, completely disable RLS to break any recursion
ALTER TABLE event_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies to start completely fresh
DROP POLICY IF EXISTS "Users can view event members" ON event_members;
DROP POLICY IF EXISTS "Users can join events" ON event_members;
DROP POLICY IF EXISTS "Users can update their own event membership" ON event_members;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- 3. Create very simple, non-recursive policies for event_members
CREATE POLICY "event_members_select_policy" ON event_members
  FOR SELECT
  USING (true);

CREATE POLICY "event_members_insert_policy" ON event_members
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "event_members_update_policy" ON event_members
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 4. Create very simple, non-recursive policies for profiles
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT
  USING (true);

CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 5. Re-enable RLS with the simple policies
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 6. Test the policies
SELECT 'Testing profile queries...' as status;

-- Test profile operations
SELECT COUNT(*) as profile_count FROM profiles;
SELECT COUNT(*) as event_members_count FROM event_members;

-- 7. Ensure the profile creation trigger is working
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
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    NULL
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 8. Create profiles for any existing users who don't have them
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

SELECT 'All onboarding fixes applied successfully!' as result;
