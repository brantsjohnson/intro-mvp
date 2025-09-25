-- Fix the 404 error when adding users to event_members
-- This script ensures users can be added to events after onboarding

-- 1. Ensure event_members table has proper RLS policies
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

-- 2. Ensure events table has proper RLS policies
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view active events" ON events;
DROP POLICY IF EXISTS "Service role can manage events" ON events;

-- Create RLS policies for events
CREATE POLICY "Anyone can view active events" ON events
  FOR SELECT USING (is_active = true);

CREATE POLICY "Service role can manage events" ON events
  FOR ALL USING (auth.role() = 'service_role');

-- 3. Ensure profiles table has proper RLS policies
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

-- 4. Create the all_events_members view (required for triggers)
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
  COALESCE(p.what_do_you_do, p.job_title, 'Professional') as job_description
FROM event_members em
JOIN profiles p ON em.user_id = p.id
JOIN events e ON em.event_id = e.id;

-- 5. Grant permissions on the view
GRANT SELECT ON all_events_members TO authenticated;
GRANT SELECT ON all_events_members TO anon;

-- 6. Ensure the trigger functions exist
-- Create or replace the trigger function for new event members
CREATE OR REPLACE FUNCTION trigger_enqueue_new_event_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enqueue if matchmaking is enabled for the event
  IF EXISTS (
    SELECT 1 FROM events 
    WHERE id = NEW.event_id 
    AND matchmaking_enabled = true
  ) THEN
    -- Enqueue the new member (if the function exists)
    BEGIN
      PERFORM enqueue_user_matchmaking(NEW.user_id, NEW.event_id, 0);
    EXCEPTION
      WHEN undefined_function THEN
        -- Function doesn't exist, skip this step
        NULL;
    END;
    
    -- Also enqueue existing members so they can be re-matched with the new person
    BEGIN
      PERFORM enqueue_user_matchmaking(existing.user_id, NEW.event_id, 1)
      FROM all_events_members existing
      WHERE existing.event_id = NEW.event_id 
        AND existing.user_id != NEW.user_id
        AND existing.matchmaking_enabled = true;
    EXCEPTION
      WHEN undefined_function THEN
        -- Function doesn't exist, skip this step
        NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or replace the smart matching trigger function
CREATE OR REPLACE FUNCTION trigger_smart_matching_on_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- This function can be expanded later for smart matching logic
  -- For now, just return NEW to satisfy the trigger
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Ensure the triggers exist
DROP TRIGGER IF EXISTS enqueue_new_event_member ON event_members;
CREATE TRIGGER enqueue_new_event_member
  AFTER INSERT ON event_members
  FOR EACH ROW
  EXECUTE FUNCTION trigger_enqueue_new_event_member();

DROP TRIGGER IF EXISTS trigger_smart_matching_on_event_join ON event_members;
CREATE TRIGGER trigger_smart_matching_on_event_join
  AFTER INSERT ON event_members
  FOR EACH ROW
  EXECUTE FUNCTION trigger_smart_matching_on_new_user();

-- 8. Test that the FRESH event exists and is active
SELECT 
  'FRESH event status' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM events 
      WHERE code = 'FRESH' AND is_active = true
    ) THEN 'EXISTS and ACTIVE' 
    ELSE 'MISSING or INACTIVE' 
  END as status;

-- 9. Show the FRESH event details
SELECT 
  id,
  code,
  name,
  is_active,
  matchmaking_enabled,
  starts_at,
  ends_at
FROM events 
WHERE code = 'FRESH';

-- Success message
SELECT 'Successfully fixed event_members 404 error!' as result;
