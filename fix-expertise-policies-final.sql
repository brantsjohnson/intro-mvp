-- Fix expertise_tags policies by dropping and recreating them
-- This ensures we have the correct policies without conflicts

-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can insert expertise tags" ON public.expertise_tags;
DROP POLICY IF EXISTS "Anyone can update expertise tags" ON public.expertise_tags;

-- Create the correct policies
CREATE POLICY "Anyone can insert expertise tags" ON public.expertise_tags
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update expertise tags" ON public.expertise_tags
  FOR UPDATE USING (true);
