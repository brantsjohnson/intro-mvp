-- Complete fix for event joining issues (404 errors)
-- This script creates the missing all_events_members view and ensures proper RLS policies

-- 1. Create the all_events_members view (critical for event joining)
DROP VIEW IF EXISTS all_events_members;

CREATE VIEW all_events_members AS
SELECT 
  em.event_id,
  em.user_id,
  em.joined_at,
  em.is_present,
  p.first_name,
  p.last_name,
  p.job_title,
  p.company,
  p.what_do_you_do,
  p.location,
  p.mbti,
  p.enneagram,
  p.avatar_url,
  p.networking_goals,
  p.hobbies,
  p.expertise_tags,
  e.name as event_name,
  e.code as event_code,
  e.matchmaking_enabled,
  e.starts_at,
  e.ends_at,
  CONCAT(p.first_name, ' ', p.last_name) as full_name,
  COALESCE(p.what_do_you_do, p.job_title, 'Professional') as job_description,
  -- Connection and match counts
  (
    SELECT COUNT(*) 
    FROM connections c 
    WHERE c.event_id = em.event_id 
    AND (c.a = em.user_id OR c.b = em.user_id)
  ) as has_connections,
  (
    SELECT COUNT(*) 
    FROM matches m 
    WHERE m.event_id = em.event_id 
    AND (m.a = em.user_id OR m.b = em.user_id)
  ) as match_count
FROM event_members em
JOIN profiles p ON em.user_id = p.id
JOIN events e ON em.event_id = e.id;

-- 2. Grant permissions on the view
GRANT SELECT ON all_events_members TO authenticated;
GRANT SELECT ON all_events_members TO anon;

-- 3. Ensure event_members table has proper RLS policies
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can join events" ON event_members;
DROP POLICY IF EXISTS "Users can view event members" ON event_members;
DROP POLICY IF EXISTS "Users can update their own event membership" ON event_members;

-- Create RLS policies for event_members
CREATE POLICY "Users can join events" ON event_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view event members" ON event_members
  FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM event_members em2 
      WHERE em2.event_id = event_members.event_id 
      AND em2.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own event membership" ON event_members
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Ensure events table has proper RLS policies
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view active events" ON events;
DROP POLICY IF EXISTS "Service role can manage events" ON events;

-- Create RLS policies for events
CREATE POLICY "Anyone can view active events" ON events
  FOR SELECT USING (is_active = true);

CREATE POLICY "Service role can manage events" ON events
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Ensure profiles table has proper RLS policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Create RLS policies for profiles
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 6. Create or update the profile creation trigger
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 7. Fix the profile update trigger with correct field references
CREATE OR REPLACE FUNCTION trigger_enqueue_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if any matching-relevant fields changed
  IF (
    OLD.networking_goals IS DISTINCT FROM NEW.networking_goals OR
    OLD.hobbies IS DISTINCT FROM NEW.hobbies OR
    OLD.expertise_tags IS DISTINCT FROM NEW.expertise_tags OR
    OLD.job_title IS DISTINCT FROM NEW.job_title OR
    OLD.company IS DISTINCT FROM NEW.company OR
    OLD.what_do_you_do IS DISTINCT FROM NEW.what_do_you_do OR
    OLD.mbti IS DISTINCT FROM NEW.mbti OR
    OLD.enneagram IS DISTINCT FROM NEW.enneagram
  ) THEN
    -- Enqueue this user for all their active events
    -- Use NEW.id instead of NEW.user_id since profiles.id is the user ID
    PERFORM enqueue_user_matchmaking(NEW.id, event_member.event_id, 2)
    FROM all_events_members event_member
    WHERE event_member.user_id = NEW.id
      AND EXISTS (
        SELECT 1 FROM events 
        WHERE id = event_member.event_id 
        AND matchmaking_enabled = true
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS enqueue_profile_update ON profiles;
CREATE TRIGGER enqueue_profile_update
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_enqueue_profile_update();

-- 8. Fix existing profiles that have empty arrays
UPDATE profiles 
SET 
  hobbies = NULL,
  expertise_tags = NULL
WHERE 
  hobbies = '{}'::text[] OR 
  expertise_tags = '{}'::text[] OR
  (hobbies IS NOT NULL AND array_length(hobbies, 1) = 0) OR
  (expertise_tags IS NOT NULL AND array_length(expertise_tags, 1) = 0);

-- Success message
SELECT 'Successfully fixed all event joining issues!' as result;
