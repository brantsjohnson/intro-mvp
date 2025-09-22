-- Add missing matchmaking_enabled column to events table
-- This column should exist according to the schema but might be missing

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS matchmaking_enabled boolean DEFAULT false;

-- Update the comment for the column
COMMENT ON COLUMN public.events.matchmaking_enabled IS 'admin can enable/disable matching for this event';
