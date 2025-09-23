-- Update FRESH event to run from today to Thursday at midnight
-- Run this in your Supabase SQL editor

-- Calculate the dates
-- Start: now
-- End: Next Thursday at 11:59:59 PM

UPDATE public.events 
SET 
  starts_at = now(),
  ends_at = (
    -- Find next Thursday
    CASE 
      WHEN EXTRACT(DOW FROM now()) <= 4 THEN
        -- If today is Sunday (0) through Thursday (4), get this Thursday
        date_trunc('week', now()) + INTERVAL '4 days' + INTERVAL '23 hours 59 minutes 59 seconds'
      ELSE
        -- If today is Friday (5) or Saturday (6), get next Thursday
        date_trunc('week', now()) + INTERVAL '1 week' + INTERVAL '4 days' + INTERVAL '23 hours 59 minutes 59 seconds'
    END
  ),
  is_active = true,
  matchmaking_enabled = true
WHERE code = 'FRESH';

-- Verify the update
SELECT 
  id,
  code,
  name,
  is_active,
  starts_at,
  ends_at,
  matchmaking_enabled,
  -- Show how long until event ends
  ends_at - now() as time_until_end
FROM public.events 
WHERE code = 'FRESH';
