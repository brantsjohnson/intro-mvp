-- Complete fix for hobby storage system
-- This script removes the old hobby_details column and ensures all systems use the new hobbies column

-- 1. Remove the hobby_details column from profiles table
ALTER TABLE profiles DROP COLUMN IF EXISTS hobby_details;

-- 2. Clean up existing hobbies data that might be malformed
-- Remove any hobbies entries that are empty arrays or malformed
UPDATE profiles 
SET hobbies = NULL 
WHERE 
  hobbies IS NULL OR 
  hobbies = '{}'::text[] OR 
  (array_length(hobbies, 1) = 0) OR
  -- Remove entries that look malformed (contain unclosed brackets or quotes)
  EXISTS (
    SELECT 1 FROM unnest(hobbies) AS hobby 
    WHERE hobby LIKE '%[%' OR hobby LIKE '%{%' OR hobby LIKE '%"%' 
    AND (hobby NOT LIKE '%]%' OR hobby NOT LIKE '%}%' OR hobby NOT LIKE '%"%')
  );

-- 3. Update the all_events_members view to ensure it uses the correct hobbies column
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
  p.hobbies,  -- Use the new hobbies column directly
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

-- 4. Grant permissions on the view
GRANT SELECT ON all_events_members TO authenticated;
GRANT SELECT ON all_events_members TO anon;

-- 5. Update any functions that might reference hobby_details
-- Check if there are any functions that need updating
CREATE OR REPLACE FUNCTION fetch_event_candidates(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  job_title TEXT,
  company TEXT,
  what_do_you_do TEXT,
  mbti TEXT,
  enneagram TEXT,
  avatar_url TEXT,
  networking_goals TEXT[],
  hobbies TEXT[],
  expertise_tags TEXT[],
  full_name TEXT,
  job_description TEXT,
  is_present BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.user_id,
    m.first_name,
    m.last_name,
    m.job_title,
    m.company,
    m.what_do_you_do,
    m.mbti,
    m.enneagram,
    m.avatar_url,
    m.networking_goals,
    m.hobbies,
    m.expertise_tags,
    m.full_name,
    m.job_description,
    m.is_present
  FROM all_events_members m
  WHERE m.event_id = p_event_id 
    AND m.user_id != p_user_id
    AND m.matchmaking_enabled = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Clean up any old hobby-related tables that might be unused
-- (Only if they exist and are not needed)
-- DROP TABLE IF EXISTS profile_hobbies; -- Uncomment if this table is not needed
-- DROP TABLE IF EXISTS hobby_details; -- Uncomment if this table is not needed

-- 7. Update the profile creation trigger to not reference hobby_details
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

-- 8. Show summary of changes
SELECT 
  'hobby_details column removed' as change,
  'profiles table cleaned up' as status
UNION ALL
SELECT 
  'all_events_members view updated',
  'now uses hobbies column directly'
UNION ALL
SELECT 
  'fetch_event_candidates function updated',
  'references correct hobbies column'
UNION ALL
SELECT 
  'profile creation trigger updated',
  'no longer references hobby_details';

-- Success message
SELECT 'Successfully updated hobby storage system!' as result;
