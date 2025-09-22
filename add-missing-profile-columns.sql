-- Add missing columns to profiles table
-- This will add the columns that are missing from the current schema

-- Add missing columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS job_title text,
ADD COLUMN IF NOT EXISTS company text,
ADD COLUMN IF NOT EXISTS what_do_you_do text,
ADD COLUMN IF NOT EXISTS linkedin_url text,
ADD COLUMN IF NOT EXISTS mbti text CHECK (char_length(mbti) <= 4),
ADD COLUMN IF NOT EXISTS enneagram text,
ADD COLUMN IF NOT EXISTS networking_goals jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS consent boolean DEFAULT false;
