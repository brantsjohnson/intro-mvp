ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

SELECT 'Testing profiles with basic RLS...' as test;
SELECT COUNT(*) as profile_count FROM profiles LIMIT 1;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_policy" ON events
  FOR SELECT USING (true);

SELECT 'Testing events with basic RLS...' as test;
SELECT COUNT(*) as events_count FROM events LIMIT 1;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_members_select_policy" ON event_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "event_members_insert_policy" ON event_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

SELECT 'Testing event_members with basic RLS...' as test;
SELECT COUNT(*) as event_members_count FROM event_members LIMIT 1;
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

GRANT SELECT ON all_events_members TO authenticated;
GRANT SELECT ON all_events_members TO anon;

SELECT 'Testing all_events_members view...' as test;
SELECT COUNT(*) as view_count FROM all_events_members LIMIT 1;
CREATE OR REPLACE FUNCTION simple_profile_trigger()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER simple_profile_update
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION simple_profile_trigger();

SELECT 'Testing profile update with simple trigger...' as test;
UPDATE profiles 
SET job_title = 'Test Title 2' 
WHERE id = (SELECT id FROM profiles LIMIT 1);

SELECT 'All security features re-enabled successfully!' as result;
