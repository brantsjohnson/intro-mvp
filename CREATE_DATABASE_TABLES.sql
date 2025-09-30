-- =====================================================
-- SUPABASE DATABASE CREATION SCRIPT
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Create Core Tables
-- =====================================================

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  job_title TEXT,
  company TEXT,
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

-- Events table
CREATE TABLE events (
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

-- Event members table
CREATE TABLE event_members (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_present BOOLEAN DEFAULT FALSE,
  -- Actual names and event details (denormalized for easier querying)
  first_name TEXT,
  last_name TEXT,
  event_name TEXT,
  event_code TEXT,
  PRIMARY KEY (event_id, user_id)
);

-- Note: Hobbies and expertise_tags are stored as TEXT[] arrays in the profiles table
-- No separate tables needed since Edge Function uses the arrays directly

-- Event networking goals table
CREATE TABLE event_networking_goals (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  networking_goals TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- Matches table (CRITICAL for Edge Function)
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bases TEXT[] NOT NULL,
  summary TEXT NOT NULL,
  why_meet TEXT NOT NULL,
  shared_activities TEXT NOT NULL,  -- Edge Function stores as JSON string
  dive_deeper TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Match type tracking
  match_type TEXT NOT NULL DEFAULT 'ai_suggestion', -- 'ai_suggestion', 'qr_scan', 'accepted'
  is_system BOOLEAN DEFAULT TRUE,
  is_met BOOLEAN DEFAULT FALSE,
  met_at TIMESTAMP WITH TIME ZONE,
  -- Connection tracking
  is_connected BOOLEAN DEFAULT FALSE, -- True when both users have accepted/connected
  connected_at TIMESTAMP WITH TIME ZONE
);

-- Connections table
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
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

-- Message threads table
CREATE TABLE message_threads (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  participant_a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT,
  payload JSONB,
  sent_at TIMESTAMP WITH TIME ZONE
);

-- AI jobs table
CREATE TABLE ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- User event stats table
CREATE TABLE user_event_stats (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  qr_connections INTEGER DEFAULT 0,
  match_connections INTEGER DEFAULT 0,
  PRIMARY KEY (event_id, user_id)
);

-- 2. Create Critical View (Edge Function depends on this)
-- =====================================================

CREATE VIEW all_events_members AS
SELECT 
  em.event_id,
  em.user_id,
  em.joined_at,
  em.is_present,
  -- Use denormalized names from event_members table
  em.first_name,
  em.last_name,
  em.event_name,
  em.event_code,
  -- Get profile data from profiles table
  p.job_title,
  p.company,
  p.career_goals,
  p.mbti,
  p.enneagram,
  p.avatar_url,
  p.networking_goals,
  p.hobbies,
  p.expertise_tags
FROM event_members em
JOIN profiles p ON em.user_id = p.id;

-- 3. Enable Row Level Security
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_event_stats ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
-- =====================================================

-- Profiles policies
CREATE POLICY "Users can read all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Events policies
CREATE POLICY "Users can read all events" ON events FOR SELECT USING (true);
CREATE POLICY "Users can insert events" ON events FOR INSERT WITH CHECK (true);

-- Event members policies
CREATE POLICY "Users can read all event members" ON event_members FOR SELECT USING (true);
CREATE POLICY "Users can join events" ON event_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presence" ON event_members FOR UPDATE USING (auth.uid() = user_id);

-- Matches policies
CREATE POLICY "Users can read own matches" ON matches FOR SELECT USING (auth.uid() = a OR auth.uid() = b);
CREATE POLICY "System can insert matches" ON matches FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update matches" ON matches FOR UPDATE WITH CHECK (true);
CREATE POLICY "System can delete matches" ON matches FOR DELETE WITH CHECK (true);

-- Connections policies
CREATE POLICY "Users can read own connections" ON connections FOR SELECT USING (auth.uid() = a OR auth.uid() = b);
CREATE POLICY "Users can create connections" ON connections FOR INSERT WITH CHECK (auth.uid() = a OR auth.uid() = b);

-- Messages policies
CREATE POLICY "Users can read own messages" ON messages FOR SELECT USING (
  auth.uid() = sender OR auth.uid() = recipient
);
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (auth.uid() = sender);

-- Message threads policies
CREATE POLICY "Users can read own threads" ON message_threads FOR SELECT USING (
  auth.uid() = participant_a OR auth.uid() = participant_b
);
CREATE POLICY "System can manage threads" ON message_threads FOR ALL WITH CHECK (true);

-- Notifications policies
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);

-- AI jobs policies
CREATE POLICY "Users can read AI jobs" ON ai_jobs FOR SELECT USING (true);
CREATE POLICY "System can manage AI jobs" ON ai_jobs FOR ALL WITH CHECK (true);

-- User event stats policies
CREATE POLICY "Users can read own stats" ON user_event_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can manage stats" ON user_event_stats FOR ALL WITH CHECK (true);

-- 5. Create Database Triggers
-- =====================================================

-- Profile creation trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Message thread creation trigger
CREATE OR REPLACE FUNCTION create_message_thread()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO message_threads (id, event_id, participant_a, participant_b)
  VALUES (
    NEW.thread_id,
    NEW.event_id,
    LEAST(NEW.sender, NEW.recipient),
    GREATEST(NEW.sender, NEW.recipient)
  )
  ON CONFLICT (id) DO UPDATE SET
    last_message_at = NEW.created_at,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION create_message_thread();

-- Event member creation trigger (populate denormalized fields)
CREATE OR REPLACE FUNCTION populate_event_member_details()
RETURNS TRIGGER AS $$
BEGIN
  -- Get user's name from profiles table
  SELECT first_name, last_name INTO NEW.first_name, NEW.last_name
  FROM profiles WHERE id = NEW.user_id;
  
  -- Get event details from events table
  SELECT name, code INTO NEW.event_name, NEW.event_code
  FROM events WHERE id = NEW.event_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_member_created
  BEFORE INSERT ON event_members
  FOR EACH ROW EXECUTE FUNCTION populate_event_member_details();

-- Profile update trigger (update denormalized names in event_members)
CREATE OR REPLACE FUNCTION update_event_member_names()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all event_members records for this user
  UPDATE event_members 
  SET first_name = NEW.first_name, last_name = NEW.last_name
  WHERE user_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_updated
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_event_member_names();

-- 6. Insert Sample Data
-- =====================================================

-- Note: Sample hobbies and expertise tags are handled in the UI
-- Users can select from predefined lists or add custom ones
-- Data is stored as TEXT[] arrays in the profiles table

-- 7. Create Test Event
-- =====================================================

INSERT INTO events (code, name, is_active, matchmaking_enabled, starts_at, ends_at) VALUES
('FRESH', 'FRESH Networking Event', true, true, NOW(), NOW() + INTERVAL '7 days');

-- =====================================================
-- DATABASE CREATION COMPLETE!
-- =====================================================

-- Verify tables were created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Verify view was created
SELECT * FROM all_events_members LIMIT 1;

-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
