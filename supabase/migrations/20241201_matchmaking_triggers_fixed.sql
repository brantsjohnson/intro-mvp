-- Fixed triggers migration with resolved ambiguous column references

-- 1) Trigger when a user joins an event
CREATE OR REPLACE FUNCTION trigger_enqueue_new_event_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enqueue if matchmaking is enabled for the event
  IF EXISTS (
    SELECT 1 FROM events 
    WHERE id = NEW.event_id 
    AND matchmaking_enabled = true
  ) THEN
    -- Enqueue the new member
    PERFORM enqueue_user_matchmaking(NEW.user_id, NEW.event_id, 0);
    
    -- Also enqueue existing members so they can be re-matched with the new person
    PERFORM enqueue_user_matchmaking(existing.user_id, NEW.event_id, 1)
    FROM all_events_members existing
    WHERE existing.event_id = NEW.event_id 
      AND existing.user_id != NEW.user_id
      AND existing.matchmaking_enabled = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new event members
DROP TRIGGER IF EXISTS enqueue_new_event_member ON event_members;
CREATE TRIGGER enqueue_new_event_member
  AFTER INSERT ON event_members
  FOR EACH ROW
  EXECUTE FUNCTION trigger_enqueue_new_event_member();

-- 2) Trigger when user profile data changes (that affects matching)
CREATE OR REPLACE FUNCTION trigger_enqueue_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if any matching-relevant fields changed
  IF (
    OLD.networking_goals IS DISTINCT FROM NEW.networking_goals OR
    OLD.hobbies IS DISTINCT FROM NEW.hobbies OR
    OLD.expertise_tags IS DISTINCT FROM NEW.expertise_tags OR
    OLD.job_title IS DISTINCT FROM NEW.job_title OR
    OLD.company IS DISTINCT FROM NEW.company OR
    OLD.what_do_you_do IS DISTINCT FROM NEW.what_do_you_do OR
    OLD.mbti IS DISTINCT FROM NEW.mbti OR
    OLD.enneagram IS DISTINCT FROM NEW.enneagram OR
    OLD.matchmaking_enabled IS DISTINCT FROM NEW.matchmaking_enabled
  ) THEN
    -- Enqueue this user for all their active events
    PERFORM enqueue_user_matchmaking(NEW.user_id, event_member.event_id, 2)
    FROM all_events_members event_member
    WHERE event_member.user_id = NEW.user_id
      AND EXISTS (
        SELECT 1 FROM events 
        WHERE id = event_member.event_id 
        AND matchmaking_enabled = true
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for profile updates
DROP TRIGGER IF EXISTS enqueue_profile_update ON profiles;
CREATE TRIGGER enqueue_profile_update
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_enqueue_profile_update();

-- 3) Trigger when event matchmaking setting changes
CREATE OR REPLACE FUNCTION trigger_event_matchmaking_toggle()
RETURNS TRIGGER AS $$
BEGIN
  -- If matchmaking was just enabled, enqueue all members
  IF OLD.matchmaking_enabled = false AND NEW.matchmaking_enabled = true THEN
    PERFORM enqueue_event_matchmaking(NEW.id, 3);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for event matchmaking toggle
DROP TRIGGER IF EXISTS event_matchmaking_toggle ON events;
CREATE TRIGGER event_matchmaking_toggle
  AFTER UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_event_matchmaking_toggle();

-- 4) Cleanup function to remove stale queue entries (FIXED)
CREATE OR REPLACE FUNCTION cleanup_stale_matchmaking_queue()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
  temp_count INTEGER;
BEGIN
  -- Remove queue entries for users who are no longer in events
  DELETE FROM matchmaking_queue
  WHERE NOT EXISTS (
    SELECT 1 FROM all_events_members 
    WHERE user_id = matchmaking_queue.user_id 
    AND event_id = matchmaking_queue.event_id
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Remove queue entries for disabled events
  DELETE FROM matchmaking_queue
  WHERE NOT EXISTS (
    SELECT 1 FROM events 
    WHERE id = matchmaking_queue.event_id 
    AND matchmaking_enabled = true
  );
  
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count = deleted_count + temp_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Function to manually trigger matchmaking for a specific user
CREATE OR REPLACE FUNCTION trigger_user_rematch(
  p_user_id UUID,
  p_event_id UUID,
  p_priority INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  -- Enqueue the specific user
  PERFORM enqueue_user_matchmaking(p_user_id, p_event_id, p_priority);
  
  -- Also enqueue other users in the event so they can be re-matched
  PERFORM enqueue_user_matchmaking(other.user_id, p_event_id, p_priority - 1)
  FROM all_events_members other
  WHERE other.event_id = p_event_id 
    AND other.user_id != p_user_id
    AND other.matchmaking_enabled = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) Function to get detailed queue information (SIMPLIFIED)
CREATE OR REPLACE FUNCTION get_detailed_queue_info(p_event_id UUID DEFAULT NULL)
RETURNS TABLE (
  event_id UUID,
  event_name TEXT,
  event_code TEXT,
  queue_size INTEGER,
  oldest_enqueued TIMESTAMPTZ,
  newest_enqueued TIMESTAMPTZ,
  avg_retry_count NUMERIC,
  error_count INTEGER,
  job_status TEXT,
  last_run_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as event_id,
    e.name as event_name,
    e.code as event_code,
    COALESCE(q.queue_size, 0)::INTEGER as queue_size,
    q.oldest_enqueued,
    q.newest_enqueued,
    q.avg_retry_count,
    COALESCE(q.error_count, 0)::INTEGER as error_count,
    COALESCE(j.status, 'idle') as job_status,
    j.last_run_at,
    j.last_completed_at
  FROM events e
  LEFT JOIN matchmaking_jobs j ON j.event_id = e.id
  LEFT JOIN (
    SELECT 
      queue_stats.event_id, 
      queue_stats.queue_size,
      queue_stats.oldest_enqueued,
      queue_stats.newest_enqueued,
      queue_stats.avg_retry_count,
      queue_stats.error_count
    FROM (
      SELECT 
        mq.event_id, 
        COUNT(*) as queue_size,
        MIN(mq.enqueued_at) as oldest_enqueued,
        MAX(mq.enqueued_at) as newest_enqueued,
        AVG(mq.retry_count) as avg_retry_count,
        COUNT(*) FILTER (WHERE mq.retry_count > 0) as error_count
      FROM matchmaking_queue mq
      GROUP BY mq.event_id
    ) queue_stats
  ) q ON q.event_id = e.id
  WHERE (p_event_id IS NULL OR e.id = p_event_id)
    AND e.matchmaking_enabled = true
  ORDER BY q.queue_size DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
