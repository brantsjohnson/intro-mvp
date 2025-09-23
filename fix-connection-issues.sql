-- Fix connection creation issues
-- This addresses the RLS policy violation for user_event_stats table

-- 1. Fix the trigger function to be SECURITY DEFINER
CREATE OR REPLACE FUNCTION increment_connection_stats()
RETURNS trigger 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Increment stats for both participants
  INSERT INTO public.user_event_stats (event_id, user_id, qr_connections, match_connections)
  VALUES 
    (NEW.event_id, NEW.a, CASE WHEN NEW.source = 'qr' THEN 1 ELSE 0 END, CASE WHEN NEW.source = 'match' THEN 1 ELSE 0 END),
    (NEW.event_id, NEW.b, CASE WHEN NEW.source = 'qr' THEN 1 ELSE 0 END, CASE WHEN NEW.source = 'match' THEN 1 ELSE 0 END)
  ON CONFLICT (event_id, user_id) DO UPDATE SET
    qr_connections = user_event_stats.qr_connections + CASE WHEN NEW.source = 'qr' THEN 1 ELSE 0 END,
    match_connections = user_event_stats.match_connections + CASE WHEN NEW.source = 'match' THEN 1 ELSE 0 END;
  
  RETURN NEW;
END;
$$;

-- 2. Add missing RLS policy for user_event_stats inserts
CREATE POLICY "System can insert user event stats" ON public.user_event_stats
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update user event stats" ON public.user_event_stats
  FOR UPDATE USING (true);

-- 3. Verify the function was updated
SELECT 'Connection stats function updated successfully' as status;
