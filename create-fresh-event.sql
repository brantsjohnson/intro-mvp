-- Create FRESH event with permanent QR code
-- This creates a permanent event that users can join by scanning a QR code

-- 1. Create the FRESH event
INSERT INTO public.events (code, name, is_active, starts_at, ends_at, matchmaking_enabled)
VALUES ('FRESH', 'FRESH Networking Event', true, now(), now() + interval '1 year', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  matchmaking_enabled = EXCLUDED.matchmaking_enabled;

-- 2. Verify the event was created
SELECT 
  id,
  code,
  name,
  is_active,
  starts_at,
  ends_at,
  matchmaking_enabled
FROM public.events 
WHERE code = 'FRESH';

-- 3. Create a simple QR code data structure for the event
-- The QR code will contain just the event code "FRESH"
-- This is simpler than the user QR codes which contain JSON with user/event/timestamp
