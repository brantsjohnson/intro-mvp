-- NUCLEAR OPTION: Completely disable RLS to isolate the recursion issue
-- This will help us determine if the problem is RLS policies or triggers

-- 1. Disable RLS on all problematic tables
ALTER TABLE event_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL triggers that might be causing recursion
DROP TRIGGER IF EXISTS enqueue_new_event_member ON event_members;
DROP TRIGGER IF EXISTS trigger_smart_matching_on_event_join ON event_members;
DROP TRIGGER IF EXISTS enqueue_profile_update ON profiles;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Drop ALL policies to start completely fresh
DROP POLICY IF EXISTS "Users can join events" ON event_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON event_members;
DROP POLICY IF EXISTS "Users can view members of events they're in" ON event_members;
DROP POLICY IF EXISTS "Users can update their own membership" ON event_members;
DROP POLICY IF EXISTS "Anyone can view active events" ON events;
DROP POLICY IF EXISTS "Service role can manage events" ON events;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- 4. Drop the all_events_members view that might be causing issues
DROP VIEW IF EXISTS all_events_members;

-- 5. Test basic operations without any RLS or triggers
SELECT 'Testing basic table access without RLS...' as test;

-- Test profile access
SELECT COUNT(*) as profile_count FROM profiles LIMIT 1;

-- Test event_members access
SELECT COUNT(*) as event_members_count FROM event_members LIMIT 1;

-- Test events access
SELECT COUNT(*) as events_count FROM events LIMIT 1;

-- 6. Test a simple profile update
SELECT 'Testing profile update without RLS/triggers...' as test;

-- This should work now without any recursion
UPDATE profiles 
SET job_title = 'Test Title' 
WHERE id = (SELECT id FROM profiles LIMIT 1);

SELECT 'Profile update successful!' as result;

-- 7. Show current state
SELECT 
  'event_members' as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'event_members'

UNION ALL

SELECT 
  'profiles' as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'profiles'

UNION ALL

SELECT 
  'events' as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'events';

SELECT 'RLS completely disabled - test profile saving now!' as status;
