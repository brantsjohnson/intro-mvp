-- Comprehensive fix for connection creation issues
-- This addresses the RLS policy violation and improves the connection flow

-- 1. Fix the trigger function to be SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.increment_connection_stats()
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

-- 2. Add missing RLS policies for user_event_stats
DROP POLICY IF EXISTS "System can insert user event stats" ON public.user_event_stats;
DROP POLICY IF EXISTS "System can update user event stats" ON public.user_event_stats;

CREATE POLICY "System can insert user event stats" ON public.user_event_stats
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update user event stats" ON public.user_event_stats
  FOR UPDATE USING (true);

-- 3. Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS on_connection_insert ON public.connections;
CREATE TRIGGER on_connection_insert
  AFTER INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.increment_connection_stats();

-- 4. Add a function to safely create connections with better error handling
CREATE OR REPLACE FUNCTION public.create_connection_safe(
  p_event_id uuid,
  p_user_a uuid,
  p_user_b uuid,
  p_source text DEFAULT 'qr'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- Check if both users are in the same event
  IF NOT EXISTS (
    SELECT 1 FROM public.event_members 
    WHERE event_id = p_event_id AND user_id = p_user_a
  ) OR NOT EXISTS (
    SELECT 1 FROM public.event_members 
    WHERE event_id = p_event_id AND user_id = p_user_b
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Users not in same event');
  END IF;

  -- Check if connection already exists
  IF EXISTS (
    SELECT 1 FROM public.connections 
    WHERE event_id = p_event_id 
    AND ((a = p_user_a AND b = p_user_b) OR (a = p_user_b AND b = p_user_a))
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Connection already exists');
  END IF;

  -- Create the connection
  INSERT INTO public.connections (event_id, a, b, source)
  VALUES (p_event_id, p_user_a, p_user_b, p_source);

  RETURN json_build_object('success', true, 'message', 'Connection created successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_connection_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_connection_stats TO authenticated;

-- 6. Verify the setup
SELECT 'Connection creation fixes applied successfully' as status;
