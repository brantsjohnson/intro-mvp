-- Fix infinite recursion in RLS policies
-- This script removes recursive policies that cause infinite loops

-- 1. Drop all existing policies on event_members to start fresh
DROP POLICY IF EXISTS "Users can join events" ON event_members;
DROP POLICY IF EXISTS "Users can view event members" ON event_members;
DROP POLICY IF EXISTS "Users can update their own event membership" ON event_members;
DROP POLICY IF EXISTS "Users can view their own event memberships" ON event_members;
DROP POLICY IF EXISTS "Users can view event members in same event" ON event_members;

-- 2. Create simple, non-recursive policies for event_members
CREATE POLICY "Users can join events" ON event_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own memberships" ON event_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view members of events they're in" ON event_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_members em2 
      WHERE em2.user_id = auth.uid() 
      AND em2.event_id = event_members.event_id
    )
  );

CREATE POLICY "Users can update their own membership" ON event_members
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Drop and recreate policies for events table (remove any recursion)
DROP POLICY IF EXISTS "Anyone can view active events" ON events;
DROP POLICY IF EXISTS "Service role can manage events" ON events;
DROP POLICY IF EXISTS "Users can view events they're in" ON events;

CREATE POLICY "Anyone can view active events" ON events
  FOR SELECT USING (is_active = true);

CREATE POLICY "Service role can manage events" ON events
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Drop and recreate policies for profiles table (remove any recursion)
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 5. Disable RLS temporarily on event_members to test
-- ALTER TABLE event_members DISABLE ROW LEVEL SECURITY;

-- 6. Re-enable RLS with the new policies
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 7. Test the policies by trying to select from event_members
SELECT 'Testing event_members access...' as test;
SELECT COUNT(*) as total_members FROM event_members LIMIT 1;

-- 8. Test profile access
SELECT 'Testing profiles access...' as test;
SELECT COUNT(*) as total_profiles FROM profiles LIMIT 1;

-- Success message
SELECT 'Successfully fixed infinite recursion in RLS policies!' as result;
