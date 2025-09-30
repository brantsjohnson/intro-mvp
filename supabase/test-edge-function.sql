-- ============================================================
-- EDGE FUNCTION TEST SCRIPT
-- ============================================================
-- Run this to verify the Edge Function can access the database
-- ============================================================

-- Test 1: Verify the all_events_members view structure
-- This is what the Edge Function queries
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN column_name IN (
      'event_id', 'user_id', 'joined_at', 'is_present',
      'first_name', 'last_name', 'event_name', 'event_code',
      'job_title', 'company', 'career_goals', 'mbti', 'enneagram',
      'avatar_url', 'networking_goals', 'hobbies', 'expertise_tags'
    ) THEN '✅ Required by Edge Function'
    ELSE '⚠️ Extra field'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_events_members'
ORDER BY ordinal_position;

-- Test 2: Verify matches table structure
-- This is where the Edge Function inserts matches
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN column_name IN (
      'id', 'event_id', 'a', 'b', 'bases', 'summary',
      'why_meet', 'shared_activities', 'dive_deeper',
      'created_at', 'match_type', 'is_system', 'is_met',
      'met_at', 'is_connected', 'connected_at'
    ) THEN '✅ Required by Edge Function'
    ELSE '⚠️ Extra field'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
ORDER BY ordinal_position;

-- Test 3: Check shared_activities field type (must be TEXT for JSON string)
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN data_type = 'text' THEN '✅ Correct type (TEXT for JSON string)'
    ELSE '❌ Wrong type - Edge Function expects TEXT'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name = 'shared_activities';

-- Test 4: Simulate Edge Function queries (will be empty initially)
-- Query 1: Get single user from all_events_members
SELECT 
  '✅ Query 1: Get single user' as test,
  COUNT(*) as result_count
FROM all_events_members 
WHERE user_id = '00000000-0000-0000-0000-000000000000' -- dummy UUID
  AND event_id = '00000000-0000-0000-0000-000000000000';

-- Query 2: Get all other users in event
SELECT 
  '✅ Query 2: Get all other users' as test,
  COUNT(*) as result_count
FROM all_events_members 
WHERE event_id = '00000000-0000-0000-0000-000000000000'
  AND user_id != '00000000-0000-0000-0000-000000000000';

-- Query 3: Test DELETE matches (dry run - won't actually delete)
SELECT 
  '✅ Query 3: Delete existing matches (test)' as test,
  COUNT(*) as would_delete
FROM matches 
WHERE event_id = '00000000-0000-0000-0000-000000000000'
  AND (a = '00000000-0000-0000-0000-000000000000' 
    OR b = '00000000-0000-0000-0000-000000000000');

-- ============================================================
-- EDGE FUNCTION COMPATIBILITY CHECK COMPLETE
-- ============================================================
-- Review the results:
-- - all_events_members should have all required fields
-- - matches table should have correct structure
-- - shared_activities must be TEXT type
-- - All test queries should run without errors
-- ============================================================
