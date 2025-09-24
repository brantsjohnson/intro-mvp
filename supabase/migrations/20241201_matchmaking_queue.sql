-- Migration: Add queue-based matchmaking tables
-- This enables scalable, stateless matchmaking processing

-- 1) Users that need (re)matching
CREATE TABLE IF NOT EXISTS matchmaking_queue (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  enqueued_at TIMESTAMPTZ DEFAULT NOW(),
  priority INTEGER DEFAULT 0, -- Higher priority users processed first
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_event_priority 
ON matchmaking_queue(event_id, priority DESC, enqueued_at ASC);

-- 2) Job control and status tracking
CREATE TABLE IF NOT EXISTS matchmaking_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('idle', 'running', 'paused', 'error')) DEFAULT 'running',
  last_run_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  processed_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one job per event
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchmaking_jobs_event_id 
ON matchmaking_jobs(event_id);

-- 3) User-specific match rankings (complement to existing matches table)
-- This stores the top-3 matches per user with scores for efficient bump-rule logic
CREATE TABLE IF NOT EXISTS user_matches (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 3),
  match_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  bases TEXT[] NOT NULL DEFAULT '{}',
  panels JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id, rank)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_matches_user_event 
ON user_matches(event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_matches_match_user 
ON user_matches(event_id, match_user_id);

-- 4) SQL function to efficiently fetch candidate data for scoring
CREATE OR REPLACE FUNCTION fetch_event_candidates(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  job_title TEXT,
  company TEXT,
  what_do_you_do TEXT,
  mbti TEXT,
  enneagram TEXT,
  avatar_url TEXT,
  networking_goals TEXT[],
  hobbies TEXT[],
  expertise_tags TEXT[],
  full_name TEXT,
  job_description TEXT,
  is_present BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.user_id,
    m.first_name,
    m.last_name,
    m.job_title,
    m.company,
    m.what_do_you_do,
    m.mbti,
    m.enneagram,
    m.avatar_url,
    m.networking_goals,
    m.hobbies,
    m.expertise_tags,
    m.full_name,
    m.job_description,
    m.is_present
  FROM all_events_members m
  WHERE m.event_id = p_event_id 
    AND m.user_id != p_user_id
    AND m.matchmaking_enabled = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Function to enqueue users for matchmaking
CREATE OR REPLACE FUNCTION enqueue_user_matchmaking(
  p_user_id UUID,
  p_event_id UUID,
  p_priority INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO matchmaking_queue (user_id, event_id, priority)
  VALUES (p_user_id, p_event_id, p_priority)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    enqueued_at = NOW(),
    priority = GREATEST(matchmaking_queue.priority, p_priority),
    retry_count = 0,
    last_error = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) Function to enqueue all users in an event
CREATE OR REPLACE FUNCTION enqueue_event_matchmaking(
  p_event_id UUID,
  p_priority INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
  enqueued_count INTEGER;
BEGIN
  INSERT INTO matchmaking_queue (user_id, event_id, priority)
  SELECT user_id, p_event_id, p_priority
  FROM all_events_members 
  WHERE event_id = p_event_id 
    AND matchmaking_enabled = true
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    enqueued_at = NOW(),
    priority = GREATEST(matchmaking_queue.priority, p_priority),
    retry_count = 0,
    last_error = NULL;
  
  GET DIAGNOSTICS enqueued_count = ROW_COUNT;
  RETURN enqueued_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7) Function to get queue statistics
CREATE OR REPLACE FUNCTION get_matchmaking_queue_stats(p_event_id UUID DEFAULT NULL)
RETURNS TABLE (
  event_id UUID,
  event_name TEXT,
  queue_size INTEGER,
  last_run_at TIMESTAMPTZ,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as event_id,
    e.name as event_name,
    COALESCE(q.queue_size, 0)::INTEGER as queue_size,
    j.last_run_at,
    COALESCE(j.status, 'idle') as status
  FROM events e
  LEFT JOIN matchmaking_jobs j ON j.event_id = e.id
  LEFT JOIN (
    SELECT event_id, COUNT(*) as queue_size
    FROM matchmaking_queue
    GROUP BY event_id
  ) q ON q.event_id = e.id
  WHERE (p_event_id IS NULL OR e.id = p_event_id)
    AND e.matchmaking_enabled = true
  ORDER BY q.queue_size DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8) Add RLS policies
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_matches ENABLE ROW LEVEL SECURITY;

-- Queue access for service role only
CREATE POLICY "Service role can manage queue" ON matchmaking_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage jobs" ON matchmaking_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- Users can read their own matches
CREATE POLICY "Users can read own matches" ON user_matches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage user matches" ON user_matches
  FOR ALL USING (auth.role() = 'service_role');

-- 9) Trigger to auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_matchmaking_jobs_updated_at
  BEFORE UPDATE ON matchmaking_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_matches_updated_at
  BEFORE UPDATE ON user_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
