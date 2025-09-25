-- Comprehensive diagnostic script to identify the source of infinite recursion
-- This will show us exactly what policies, triggers, and views are causing the issue

-- 1. List all RLS policies for event_members table
SELECT
  'event_members' AS table_name,
  policyname AS policy_name,
  permissive,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM
  pg_policies
WHERE
  tablename = 'event_members' AND schemaname = 'public';

-- 2. List all RLS policies for profiles table
SELECT
  'profiles' AS table_name,
  policyname AS policy_name,
  permissive,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM
  pg_policies
WHERE
  tablename = 'profiles' AND schemaname = 'public';

-- 3. List all triggers on event_members table
SELECT
  tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM
  pg_trigger t
JOIN
  pg_class c ON t.tgrelid = c.oid
WHERE
  c.relname = 'event_members' AND tgisinternal = FALSE;

-- 4. List all triggers on profiles table
SELECT
  tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM
  pg_trigger t
JOIN
  pg_class c ON t.tgrelid = c.oid
WHERE
  c.relname = 'profiles' AND tgisinternal = FALSE;

-- 5. Check if all_events_members view exists and get its definition
SELECT
  'all_events_members' AS view_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'all_events_members')
    THEN pg_get_viewdef('public.all_events_members'::regclass, true)
    ELSE 'VIEW DOES NOT EXIST'
  END AS view_definition;

-- 6. Check RLS status on both tables
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM
  pg_class
WHERE
  relname IN ('event_members', 'profiles') AND relkind = 'r';

-- 7. Check if there are any functions that might be causing recursion
SELECT
  proname AS function_name,
  pg_get_functiondef(oid) AS function_definition
FROM
  pg_proc
WHERE
  proname LIKE '%enqueue%' OR proname LIKE '%matchmaking%' OR proname LIKE '%profile%'
ORDER BY proname;
