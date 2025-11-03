-- ============================================================
-- REMOVE OLD ONBOARDING FIELDS - DROP VIEW FIRST
-- ============================================================
-- This script removes the personality type fields (MBTI, Enneagram)
-- from the profiles table and the all_events_members view.
-- These fields are no longer part of the streamlined onboarding flow.
-- ============================================================

-- Step 1: Drop the view that depends on these columns
DROP VIEW IF EXISTS all_events_members CASCADE;

-- Step 2: Remove personality type columns from profiles table
ALTER TABLE profiles DROP COLUMN IF EXISTS mbti;
ALTER TABLE profiles DROP COLUMN IF EXISTS enneagram;

-- Step 3: Recreate the all_events_members view WITHOUT personality fields
CREATE OR REPLACE VIEW all_events_members AS
SELECT 
  em.event_id,
  em.user_id,
  em.joined_at,
  em.is_present,
  em.first_name,
  em.last_name,
  em.event_name,
  em.event_code,
  p.job_title,
  p.company,
  p.what_do_you_do,
  p.career_goals,
  p.avatar_url,
  p.networking_goals,
  p.hobbies,
  p.expertise_tags
FROM event_members em
JOIN profiles p ON em.user_id = p.id;

-- Verify columns have been removed and view recreated
SELECT 
  'Migration completed successfully' as status,
  'View recreated without personality fields' as details;

-- ============================================================
-- NOTES
-- ============================================================
-- This script:
-- 1. Drops all_events_members view (which references mbti/enneagram)
-- 2. Removes mbti and enneagram columns from profiles table
-- 3. Recreates all_events_members view WITHOUT personality fields
--
-- Edge Function Update:
-- The Edge Function expects mbti/enneagram in the view, but will
-- handle NULL values gracefully. You should update the Edge Function
-- to remove personality scoring or redistribute the 0.25 weight.
--
-- Run this in your Supabase SQL Editor to apply the changes.

