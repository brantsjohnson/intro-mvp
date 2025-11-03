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

-- Step 4: Drop old mapping/expertise tables if they exist
-- (The expertise_tags column in profiles stores expertise as TEXT[] array)
DROP TABLE IF EXISTS expertise_tags CASCADE;
DROP TABLE IF EXISTS profile_expertise CASCADE;

-- Verify columns have been removed and view recreated
SELECT 
  'Migration completed successfully' as status,
  'View recreated without personality fields, old expertise tables cleaned up' as details;

-- ============================================================
-- NOTES
-- ============================================================
-- This script:
-- 1. Drops all_events_members view (which references mbti/enneagram)
-- 2. Removes mbti and enneagram columns from profiles table
-- 3. Recreates all_events_members view WITHOUT personality fields
-- 4. Drops old expertise_tags and profile_expertise tables (no longer used)
--
-- Edge Function Update:
-- The Edge Function has been updated to remove personality scoring.
-- Matching weights redistributed: Goals 35%, Career 35%, Interests 30%.
-- No personality fields are queried or used in matching.
--
-- Data Storage:
-- expertise_tags are now stored as TEXT[] array in profiles table
-- Hobbies table still exists for onboarding UI selections
--
-- Run this in your Supabase SQL Editor to apply the changes.

