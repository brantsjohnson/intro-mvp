-- ============================================================
-- QUICK ESSENTIAL VERIFICATION
-- ============================================================
-- Run this to see the most critical checks in one result
-- ============================================================

-- Combined essential checks
SELECT 
  'Tables Count' as check_type,
  COUNT(*)::text as result,
  CASE WHEN COUNT(*) >= 11 THEN '✅ All tables exist' ELSE '❌ Missing tables' END as status
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'events', 'event_members', 'event_networking_goals',
    'matches', 'connections', 'messages', 'message_threads',
    'notifications', 'ai_jobs', 'user_event_stats'
  )

UNION ALL

SELECT 
  'all_events_members View' as check_type,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'all_events_members'
  ) THEN 'exists' ELSE 'missing' END as result,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'all_events_members'
  ) THEN '✅ View exists' ELSE '❌ View missing' END as status

UNION ALL

SELECT 
  'what_do_you_do Field' as check_type,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'all_events_members'
    AND column_name = 'what_do_you_do'
  ) THEN 'exists' ELSE 'missing' END as result,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'all_events_members'
    AND column_name = 'what_do_you_do'
  ) THEN '✅ Critical field exists' ELSE '❌ MISSING - Edge Function will fail' END as status

UNION ALL

SELECT 
  'shared_activities Type' as check_type,
  data_type as result,
  CASE WHEN data_type = 'text' THEN '✅ Correct type' ELSE '❌ Wrong type' END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name = 'shared_activities'

UNION ALL

SELECT 
  'Database Functions' as check_type,
  COUNT(*)::text as result,
  CASE WHEN COUNT(*) >= 2 THEN '✅ Both functions exist' ELSE '❌ Missing functions' END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_name IN ('handle_new_user', 'create_message_thread')

ORDER BY check_type;
