-- ============================================================
-- DATABASE VERIFICATION SCRIPT
-- ============================================================
-- Run this to verify the database rebuild was successful
-- ============================================================

-- Check if all tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      'profiles', 'events', 'event_members', 'event_networking_goals',
      'matches', 'connections', 'messages', 'message_threads',
      'notifications', 'ai_jobs', 'user_event_stats'
    ) THEN '✅'
    ELSE '❌'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check if RLS is enabled on all tables
SELECT 
  schemaname,
  tablename,
  CASE WHEN rowsecurity THEN '✅ RLS Enabled' ELSE '❌ RLS Disabled' END as rls_status
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check if triggers exist
SELECT 
  trigger_name,
  event_object_table,
  '✅ Trigger exists' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY trigger_name;

-- Check if the critical view exists and works
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'all_events_members'
    ) 
    THEN '✅ all_events_members view exists'
    ELSE '❌ all_events_members view missing'
  END as view_status;

-- Test the all_events_members view (will be empty initially but should not error)
SELECT 
  COUNT(*) as member_count,
  '✅ View is queryable' as status
FROM all_events_members;

-- Check for RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  '✅ Policy exists' as status
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Count events
SELECT 
  COUNT(*) as event_count,
  CASE WHEN COUNT(*) > 0 THEN '✅ Events exist' ELSE '⚠️ No events yet' END as status
FROM events;

-- Verify database functions
SELECT 
  routine_name,
  '✅ Function exists' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_name IN ('handle_new_user', 'create_message_thread')
ORDER BY routine_name;

-- ============================================================
-- VERIFICATION COMPLETE
-- ============================================================
-- Review the results above:
-- - All tables should show ✅
-- - All tables should have RLS enabled
-- - Triggers should exist for handle_new_user and create_message_thread
-- - all_events_members view should exist and be queryable
-- - RLS policies should exist for all tables
-- ============================================================
