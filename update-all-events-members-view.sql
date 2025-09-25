-- Update the existing all_events_members view to work with the new hobby storage system
-- This replaces the complex aggregation with simple field access from profiles table

-- Drop the existing view first to avoid column order/rename issues
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
  p.hobbies,  -- Now directly from profiles table
  p.expertise_tags,  -- Now directly from profiles table
  e.name as event_name,
  e.code as event_code,
  e.matchmaking_enabled,
  e.starts_at,
  e.ends_at,
  CONCAT(p.first_name, ' ', p.last_name) as full_name,
  COALESCE(p.what_do_you_do, p.job_title, 'Professional') as job_description,
  -- Connection and match counts (if these were in your original view)
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

-- Grant necessary permissions
GRANT SELECT ON all_events_members TO authenticated;
GRANT SELECT ON all_events_members TO anon;

-- Success message
SELECT 'Successfully updated all_events_members view to use new hobby storage!' as result;
