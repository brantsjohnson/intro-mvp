-- Fix RLS policies for event_members and profiles tables
-- This will ensure users can join events and update their profiles

-- 1. Check current RLS status
SELECT 
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN ('event_members', 'profiles') AND relkind = 'r';

-- 2. Drop existing policies on event_members
DROP POLICY IF EXISTS "Users can view event members" ON event_members;
DROP POLICY IF EXISTS "Users can join events" ON event_members;
DROP POLICY IF EXISTS "Users can update their own event membership" ON event_members;

-- 3. Create new policies for event_members
-- Allow users to view event members for events they're part of
CREATE POLICY "Users can view event members" ON event_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_members em2 
      WHERE em2.user_id = auth.uid() 
      AND em2.event_id = event_members.event_id
    )
  );

-- Allow users to join events
CREATE POLICY "Users can join events" ON event_members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own event membership
CREATE POLICY "Users can update their own event membership" ON event_members
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Drop existing policies on profiles
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- 5. Create new policies for profiles
-- Allow users to view profiles of other users in the same events
CREATE POLICY "Users can view profiles" ON profiles
  FOR SELECT
  USING (
    -- Users can always view their own profile
    auth.uid() = id
    OR
    -- Users can view profiles of other users in events they're both part of
    EXISTS (
      SELECT 1 FROM event_members em1
      JOIN event_members em2 ON em1.event_id = em2.event_id
      WHERE em1.user_id = auth.uid()
      AND em2.user_id = profiles.id
    )
  );

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 6. Ensure RLS is enabled on both tables
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

SELECT 'Successfully fixed RLS policies for event_members and profiles!' as result;
