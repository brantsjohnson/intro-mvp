-- DIAGNOSTIC SCRIPT - Check current RLS policies
-- Run this first to see what policies exist and identify the issue

-- 1. Check all existing policies on events table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'events' 
ORDER BY policyname;

-- 2. Check all existing policies on event_members table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'event_members' 
ORDER BY policyname;

-- 3. Check all existing policies on profiles table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'profiles' 
ORDER BY policyname;

-- 4. Check if the is_member_of_event function exists
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'is_member_of_event';

-- 5. Test the current user and auth context
SELECT auth.uid() as current_user_id;

-- 6. Check if there are any events
SELECT id, code, name, is_active FROM public.events LIMIT 5;

-- 7. Check if there are any event_members
SELECT event_id, user_id, joined_at FROM public.event_members LIMIT 5;
