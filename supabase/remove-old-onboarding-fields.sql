-- ============================================================
-- REMOVE OLD ONBOARDING FIELDS
-- ============================================================
-- This script removes the personality type fields (MBTI, Enneagram)
-- from the profiles table as they are no longer part of the
-- streamlined onboarding flow.
-- ============================================================

-- Remove personality type columns from profiles table
ALTER TABLE profiles DROP COLUMN IF EXISTS mbti;
ALTER TABLE profiles DROP COLUMN IF EXISTS enneagram;

-- Verify columns have been removed
SELECT 
  'Columns removed successfully' as status,
  'profiles table updated' as table_name;

-- ============================================================
-- NOTES
-- ============================================================
-- This script removes the following columns:
-- - mbti: Myers-Briggs Type Indicator
-- - enneagram: Enneagram personality type
--
-- These fields are no longer part of the streamlined onboarding
-- flow. The new onboarding focuses on:
-- 1. Profile: Name, Photo, Career, Hobbies
-- 2. Event-specific: Why attending, Connection types, Follow-ups
--
-- Run this in your Supabase SQL Editor to apply the changes.

