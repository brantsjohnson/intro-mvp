-- ============================================================
-- SUPABASE DATABASE REBUILD SCRIPT
-- ============================================================
-- This script rebuilds the entire database schema to match
-- the Edge Function exactly. Run this in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. DROP EXISTING TABLES (if rebuilding)
-- ============================================================
-- Uncomment these lines if you need to completely rebuild
-- DROP TABLE IF EXISTS ai_jobs CASCADE;
-- DROP TABLE IF EXISTS user_event_stats CASCADE;
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS messages CASCADE;
-- DROP TABLE IF EXISTS message_threads CASCADE;
-- DROP TABLE IF EXISTS connections CASCADE;
-- DROP TABLE IF EXISTS matches CASCADE;
-- DROP TABLE IF EXISTS event_networking_goals CASCADE;
-- DROP TABLE IF EXISTS event_members CASCADE;
-- DROP TABLE IF EXISTS events CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;
-- DROP VIEW IF EXISTS all_events_members CASCADE;

-- ============================================================
-- 2. CREATE CORE TABLES
-- ============================================================

-- Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  job_title TEXT,
  company TEXT,
  what_do_you_do TEXT,
  career_goals TEXT,
  location TEXT,
  linkedin_url TEXT,
  mbti TEXT,
  enneagram TEXT,
  networking_goals TEXT[],
  hobbies TEXT[],
  expertise_tags TEXT[],
  consent BOOLEAN DEFAULT FALSE,
  who_they_want_to_meet TEXT
);

-- Events Table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  header_image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  matchmaking_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event Members Table
CREATE TABLE IF NOT EXISTS event_members (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  event_name TEXT,
  event_code TEXT,
  is_present BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- Event Networking Goals Table
CREATE TABLE IF NOT EXISTS event_networking_goals (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  networking_goals TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- Matches Table - CRITICAL: Must match Edge Function exactly
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bases TEXT[] NOT NULL,
  summary TEXT NOT NULL,
  why_meet TEXT NOT NULL,
  shared_activities TEXT NOT NULL,
  dive_deeper TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  match_type TEXT NOT NULL DEFAULT 'ai_suggestion',
  is_system BOOLEAN DEFAULT TRUE,
  is_met BOOLEAN DEFAULT FALSE,
  met_at TIMESTAMP WITH TIME ZONE,
  is_connected BOOLEAN DEFAULT FALSE,
  connected_at TIMESTAMP WITH TIME ZONE
);

-- Connections Table
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  sender UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE
);

-- Message Threads Table
CREATE TABLE IF NOT EXISTS message_threads (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  participant_a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT,
  payload JSONB,
  sent_at TIMESTAMP WITH TIME ZONE
);

-- AI Jobs Table
CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- User Event Stats Table
CREATE TABLE IF NOT EXISTS user_event_stats (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  qr_connections INTEGER DEFAULT 0,
  match_connections INTEGER DEFAULT 0,
  PRIMARY KEY (event_id, user_id)
);

-- ============================================================
-- 3. CREATE CRITICAL VIEW - Edge Function depends on this!
-- ============================================================

CREATE OR REPLACE VIEW all_events_members AS
SELECT 
  em.event_id,
  em.user_id,
  em.joined_at,
  em.is_present,
  em.first_name,
  em.last_name,
  em.event_name,
  em.event_code,
  p.job_title,
  p.company,
  p.what_do_you_do,
  p.career_goals,
  p.mbti,
  p.enneagram,
  p.avatar_url,
  p.networking_goals,
  p.hobbies,
  p.expertise_tags
FROM event_members em
JOIN profiles p ON em.user_id = p.id;

-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_networking_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_event_stats ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. CREATE RLS POLICIES
-- ============================================================

-- Profiles Policies
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
CREATE POLICY "Users can read all profiles" ON profiles 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles 
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Events Policies
DROP POLICY IF EXISTS "Users can read all events" ON events;
CREATE POLICY "Users can read all events" ON events 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role can manage events" ON events;
CREATE POLICY "Service role can manage events" ON events 
  FOR ALL USING (auth.role() = 'service_role');

-- Event Members Policies
DROP POLICY IF EXISTS "Users can read all event members" ON event_members;
CREATE POLICY "Users can read all event members" ON event_members 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can join events" ON event_members;
CREATE POLICY "Users can join events" ON event_members 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own membership" ON event_members;
CREATE POLICY "Users can update own membership" ON event_members 
  FOR UPDATE USING (auth.uid() = user_id);

-- Event Networking Goals Policies
DROP POLICY IF EXISTS "Users can read own event networking goals" ON event_networking_goals;
CREATE POLICY "Users can read own event networking goals" ON event_networking_goals 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own event networking goals" ON event_networking_goals;
CREATE POLICY "Users can manage own event networking goals" ON event_networking_goals 
  FOR ALL USING (auth.uid() = user_id);

-- Matches Policies
DROP POLICY IF EXISTS "Users can read own matches" ON matches;
CREATE POLICY "Users can read own matches" ON matches 
  FOR SELECT USING (auth.uid() = a OR auth.uid() = b);

DROP POLICY IF EXISTS "Users can update own matches" ON matches;
CREATE POLICY "Users can update own matches" ON matches 
  FOR UPDATE USING (auth.uid() = a OR auth.uid() = b);

DROP POLICY IF EXISTS "Service role can manage matches" ON matches;
CREATE POLICY "Service role can manage matches" ON matches 
  FOR ALL USING (auth.role() = 'service_role');

-- Connections Policies
DROP POLICY IF EXISTS "Users can read own connections" ON connections;
CREATE POLICY "Users can read own connections" ON connections 
  FOR SELECT USING (auth.uid() = a OR auth.uid() = b);

DROP POLICY IF EXISTS "Users can create connections" ON connections;
CREATE POLICY "Users can create connections" ON connections 
  FOR INSERT WITH CHECK (auth.uid() = a OR auth.uid() = b);

-- Messages Policies
DROP POLICY IF EXISTS "Users can read own messages" ON messages;
CREATE POLICY "Users can read own messages" ON messages 
  FOR SELECT USING (auth.uid() = sender OR auth.uid() = recipient);

DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages 
  FOR INSERT WITH CHECK (auth.uid() = sender);

DROP POLICY IF EXISTS "Users can update own messages" ON messages;
CREATE POLICY "Users can update own messages" ON messages 
  FOR UPDATE USING (auth.uid() = sender OR auth.uid() = recipient);

-- Message Threads Policies
DROP POLICY IF EXISTS "Users can read own threads" ON message_threads;
CREATE POLICY "Users can read own threads" ON message_threads 
  FOR SELECT USING (auth.uid() = participant_a OR auth.uid() = participant_b);

DROP POLICY IF EXISTS "Users can create threads" ON message_threads;
CREATE POLICY "Users can create threads" ON message_threads 
  FOR INSERT WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

DROP POLICY IF EXISTS "Users can update own threads" ON message_threads;
CREATE POLICY "Users can update own threads" ON message_threads 
  FOR UPDATE USING (auth.uid() = participant_a OR auth.uid() = participant_b);

-- Notifications Policies
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage notifications" ON notifications;
CREATE POLICY "Service role can manage notifications" ON notifications 
  FOR ALL USING (auth.role() = 'service_role');

-- AI Jobs Policies
DROP POLICY IF EXISTS "Users can read all ai jobs" ON ai_jobs;
CREATE POLICY "Users can read all ai jobs" ON ai_jobs 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role can manage ai jobs" ON ai_jobs;
CREATE POLICY "Service role can manage ai jobs" ON ai_jobs 
  FOR ALL USING (auth.role() = 'service_role');

-- User Event Stats Policies
DROP POLICY IF EXISTS "Users can read all stats" ON user_event_stats;
CREATE POLICY "Users can read all stats" ON user_event_stats 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own stats" ON user_event_stats;
CREATE POLICY "Users can update own stats" ON user_event_stats 
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 6. CREATE DATABASE TRIGGERS
-- ============================================================

-- Profile Creation Trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Message Thread Creation Trigger
CREATE OR REPLACE FUNCTION create_message_thread()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.message_threads (id, event_id, participant_a, participant_b, last_message_at, updated_at)
  VALUES (
    NEW.thread_id,
    NEW.event_id,
    LEAST(NEW.sender, NEW.recipient),
    GREATEST(NEW.sender, NEW.recipient),
    NEW.created_at,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_message_at = NEW.created_at,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_created ON messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION create_message_thread();

-- ============================================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_event_members_user_id ON event_members(user_id);
CREATE INDEX IF NOT EXISTS idx_event_members_event_id ON event_members(event_id);
CREATE INDEX IF NOT EXISTS idx_matches_event_id ON matches(event_id);
CREATE INDEX IF NOT EXISTS idx_matches_users ON matches(a, b);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient);
CREATE INDEX IF NOT EXISTS idx_message_threads_participants ON message_threads(participant_a, participant_b);

-- ============================================================
-- REBUILD COMPLETE!
-- ============================================================
-- Next steps:
-- 1. Run the sample-data.sql script to insert hobbies and expertise tags
-- 2. Create a test event
-- 3. Test the Edge Function
-- 4. Verify the application works end-to-end
-- ============================================================
