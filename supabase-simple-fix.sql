-- SIMPLE FIX - Just create the function and test event
-- This avoids policy conflicts

-- 0. Add missing columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS what_do_you_do text;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS networking_goals text[];

-- Create event networking goals table
CREATE TABLE IF NOT EXISTS public.event_networking_goals (
  event_id uuid REFERENCES public.events ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles ON DELETE CASCADE,
  networking_goals text[] NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- Enable RLS for event networking goals
ALTER TABLE public.event_networking_goals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for event networking goals
CREATE POLICY "Users can view networking goals of event attendees" ON public.event_networking_goals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_members em1
      JOIN public.event_members em2 ON em1.event_id = em2.event_id
      WHERE em1.user_id = auth.uid() AND em2.user_id = event_networking_goals.user_id
    )
  );

CREATE POLICY "Users can manage their own event networking goals" ON public.event_networking_goals
  FOR ALL USING (auth.uid() = user_id);

-- 1. Create the security definer function
CREATE OR REPLACE FUNCTION public.is_member_of_event(eid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_members em
    WHERE em.event_id = eid AND em.user_id = auth.uid()
  );
$$;

-- 2. Create a test event if it doesn't exist
INSERT INTO public.events (code, name, is_active, starts_at)
VALUES ('TEST1', 'Test Conference', true, now() + interval '1 day')
ON CONFLICT (code) DO NOTHING;

-- 3. Verify the function was created
SELECT 'Function created successfully' as status;
