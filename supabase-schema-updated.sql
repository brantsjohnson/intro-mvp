-- Updated Supabase schema with new onboarding fields
-- Run this to add the missing fields to your existing database

-- Add new fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS what_do_you_do text,
ADD COLUMN IF NOT EXISTS networking_goals jsonb DEFAULT '[]'::jsonb;

-- Update the profiles table structure (for reference)
-- The complete profiles table should now look like:
/*
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz default now(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  avatar_url text,
  job_title text,
  company text,
  what_do_you_do text,                    -- NEW: Optional description of role
  location text,
  linkedin_url text,
  mbti text check (char_length(mbti) <= 4),
  enneagram text,                         -- e.g., '8' or '8w7'
  networking_goals jsonb DEFAULT '[]'::jsonb,  -- NEW: Array of networking goals
  consent boolean default false
);
*/

-- Add comments for the new fields
COMMENT ON COLUMN public.profiles.what_do_you_do IS 'Optional description of what the user does in their role';
COMMENT ON COLUMN public.profiles.networking_goals IS 'Array of networking goals selected during onboarding';

-- Update RLS policies if needed (the existing policies should still work)
-- No changes needed to RLS policies as they're based on user_id matching

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
ORDER BY ordinal_position;
