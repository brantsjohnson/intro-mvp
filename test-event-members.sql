-- Test script to check if event_members table and all_events_members view exist
-- Run this in your Supabase SQL editor to diagnose the 404 error

-- 1. Check if event_members table exists
SELECT 
  'event_members table' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'event_members'
    ) THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as status;

-- 2. Check if all_events_members view exists
SELECT 
  'all_events_members view' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'all_events_members'
    ) THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as status;

-- 3. Check if profiles table exists
SELECT 
  'profiles table' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'profiles'
    ) THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as status;

-- 4. Check if events table exists
SELECT 
  'events table' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'events'
    ) THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as status;

-- 5. Check RLS policies on event_members
SELECT 
  'event_members RLS policies' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'event_members'
    ) THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as status;

-- 6. Check if FRESH event exists
SELECT 
  'FRESH event' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM events 
      WHERE code = 'FRESH' AND is_active = true
    ) THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as status;

-- 7. Try to query all_events_members (this will fail if view doesn't exist)
SELECT 'Testing all_events_members view...' as test;
SELECT COUNT(*) as member_count FROM all_events_members LIMIT 1;
