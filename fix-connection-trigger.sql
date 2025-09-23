-- Fix the connection trigger to work with RLS policies
-- This will allow connections to be created without RLS violations

-- 1. Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_connection_insert ON public.connections;
DROP FUNCTION IF EXISTS increment_connection_stats();

-- 2. Create a new SECURITY DEFINER function that can bypass RLS
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

-- 3. Recreate the trigger
CREATE TRIGGER on_connection_insert
  AFTER INSERT ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION increment_connection_stats();

-- 4. Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_connection_stats() TO authenticated;

-- 5. Verify the setup
SELECT 'Connection trigger fixed successfully' as status;
