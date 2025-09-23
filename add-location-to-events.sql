-- Add location field to events table
ALTER TABLE public.events 
ADD COLUMN location text;

-- Add comment to document the field
COMMENT ON COLUMN public.events.location IS 'Physical location or venue of the event';
