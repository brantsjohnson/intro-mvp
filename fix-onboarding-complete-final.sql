-- Complete fix for onboarding and event joining issues
-- Run this in your Supabase SQL editor

-- 1. Fix profile creation trigger
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

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 2. Create profiles for existing users who don't have them
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

-- 3. Fix event_members table structure
ALTER TABLE event_members 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE event_members 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_event_members_updated_at ON event_members;
CREATE TRIGGER update_event_members_updated_at
    BEFORE UPDATE ON event_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Fix RLS policies for event_members
DROP POLICY IF EXISTS "Users can view event members" ON event_members;
DROP POLICY IF EXISTS "Users can join events" ON event_members;
DROP POLICY IF EXISTS "Users can update their own event membership" ON event_members;

CREATE POLICY "Users can view event members" ON event_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_members em2 
      WHERE em2.user_id = auth.uid() 
      AND em2.event_id = event_members.event_id
    )
  );

CREATE POLICY "Users can join events" ON event_members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own event membership" ON event_members
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Fix RLS policies for profiles
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

CREATE POLICY "Users can view profiles" ON profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM event_members em1
      JOIN event_members em2 ON em1.event_id = em2.event_id
      WHERE em1.user_id = auth.uid()
      AND em2.user_id = profiles.id
    )
  );

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 6. Ensure RLS is enabled
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

SELECT 'Successfully fixed all onboarding and event joining issues!' as result;
