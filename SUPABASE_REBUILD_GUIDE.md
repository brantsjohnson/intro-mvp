# 🔧 SUPABASE REBUILD GUIDE

## Overview
This guide provides a comprehensive checklist for rebuilding the Supabase database after the wipe. **All database schemas match the Edge Function exactly** - no changes needed to the Edge Function code.

## ✅ PRESERVED ITEMS (READY TO USE)

### 1. Edge Function ✅
- **Location**: `supabase/functions/matchmaker/index.ts`
- **Status**: Fully functional AI matchmaking logic
- **URL**: `https://szrznjvllslymamzecyq.supabase.co/functions/v1/matchmaker`
- **Action**: No changes needed - database will match this exactly

### 2. Environment Variables ✅
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- **Action**: Verify these are still valid

### 3. AI/Matchmaking Logic ✅
- `src/lib/score.ts` - Scoring algorithms
- `src/lib/expertise-ai-service.ts` - AI expertise suggestions
- **Action**: No changes needed

### 4. UI Components ✅
- All React components in `src/components/`
- All Next.js pages in `src/app/`
- **Action**: No changes needed

## 🗄️ DATABASE TABLES TO REBUILD

**⚠️ IMPORTANT: These schemas match the Edge Function exactly. Do not modify field names or types.**

### Core Tables

#### 1. `profiles`
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
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
```

#### 2. `events`
```sql
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
```

#### 3. `event_members`
```sql
CREATE TABLE event_members (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  event_name TEXT,
  event_code TEXT,
  is_present BOOLEAN DEFAULT FALSE,
  -- Actual names and event details (denormalized for easier querying)
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
```

#### 4. `event_networking_goals`
```sql
CREATE TABLE event_networking_goals (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  networking_goals TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
```

#### 5. `matches` - **CRITICAL: Must match Edge Function exactly**
```sql
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
```

#### 6. `connections`
```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 7. `messages`
```sql
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
```

#### 8. `message_threads`
```sql
CREATE TABLE message_threads (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  participant_a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE
);
```

#### 9. `notifications`
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT,
  payload JSONB,
  sent_at TIMESTAMP WITH TIME ZONE
);
```

#### 10. `ai_jobs`
```sql
CREATE TABLE ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

#### 11. `user_event_stats`
```sql
CREATE TABLE user_event_stats (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  qr_connections INTEGER DEFAULT 0,
  match_connections INTEGER DEFAULT 0,
  PRIMARY KEY (event_id, user_id)
);
```

## 🔍 DATABASE VIEWS TO REBUILD

### 1. `all_events_members` - **CRITICAL: Edge Function depends on this exact view**
```sql
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
```

**⚠️ CRITICAL: The Edge Function queries this view with these exact fields:**
- `user_id`, `first_name`, `last_name`, `job_title`, `company`, `what_do_you_do`, `career_goals`
- `mbti`, `enneagram`, `avatar_url`, `networking_goals`, `hobbies`, `expertise_tags`, `is_present`
- `event_name`, `event_code` (bonus fields for easier querying)

## 🔐 RLS POLICIES TO REBUILD

### Enable RLS on all tables
```sql
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
```

### Example RLS Policies
```sql
-- Profiles: Users can read all profiles, update their own
CREATE POLICY "Users can read all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Events: Users can read all events
CREATE POLICY "Users can read all events" ON events FOR SELECT USING (true);

-- Event Members: Users can read all members, insert themselves
CREATE POLICY "Users can read all event members" ON event_members FOR SELECT USING (true);
CREATE POLICY "Users can join events" ON event_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Matches: Users can read their own matches
CREATE POLICY "Users can read own matches" ON matches FOR SELECT USING (auth.uid() = a OR auth.uid() = b);

-- Messages: Users can read messages in their threads
CREATE POLICY "Users can read own messages" ON messages FOR SELECT USING (
  auth.uid() = sender OR auth.uid() = recipient
);
```

## 🔄 DATABASE TRIGGERS TO REBUILD

### 1. Profile Creation Trigger
```sql
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
```

### 2. Message Thread Creation Trigger
```sql
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
```

## 📊 SAMPLE DATA TO INSERT

### Hobbies
```sql
INSERT INTO hobbies (label) VALUES
('Photography'), ('Cooking'), ('Hiking'), ('Reading'), ('Gaming'),
('Music'), ('Sports'), ('Travel'), ('Art'), ('Technology'),
('Fitness'), ('Movies'), ('Dancing'), ('Writing'), ('Gardening');
```

### Expertise Tags
```sql
INSERT INTO expertise_tags (label) VALUES
('Software Development'), ('Product Management'), ('Marketing'),
('Sales'), ('Design'), ('Data Analysis'), ('Project Management'),
('Leadership'), ('Strategy'), ('Operations'), ('Finance'),
('Human Resources'), ('Customer Success'), ('Business Development');
```

## 🚀 REBUILD STEPS

### 1. Create Database Schema
1. Run all table creation SQL
2. Create the `all_events_members` view **FIRST** (Edge Function depends on it)
3. Enable RLS on all tables
4. Create RLS policies
5. Create database triggers

### 2. Insert Sample Data
1. Insert hobbies and expertise tags
2. Create a test event
3. Create test user profiles

### 3. Test Edge Function
1. Verify the matchmaker function is accessible
2. Test with sample data
3. Verify AI matchmaking works

### 4. Update Placeholder Code
1. Replace placeholder Supabase clients with real ones
2. Replace placeholder API routes with real ones
3. Replace placeholder services with real ones
4. Update database types

### 5. Test Application
1. Test user authentication
2. Test profile creation
3. Test event joining
4. Test matchmaking
5. Test messaging

## 🔧 TROUBLESHOOTING

### Common Issues
1. **RLS Policies**: Make sure all tables have proper RLS policies
2. **Foreign Keys**: Ensure all foreign key relationships are correct
3. **Triggers**: Verify triggers are working for profile creation
4. **Edge Function**: Check that the matchmaker function has proper permissions

### Verification Commands
```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check triggers
SELECT trigger_name, event_object_table FROM information_schema.triggers;

-- Test the view that Edge Function uses
SELECT * FROM all_events_members LIMIT 5;
```

## 📝 EDGE FUNCTION COMPATIBILITY NOTES

### Critical Field Mappings
The Edge Function expects these exact field names in the `all_events_members` view:
- `user_id` - UUID of the user
- `first_name` - User's first name
- `last_name` - User's last name  
- `job_title` - User's job title
- `company` - User's company
- `what_do_you_do` - User's job description
- `career_goals` - User's career goals
- `mbti` - User's MBTI personality type
- `enneagram` - User's Enneagram type
- `avatar_url` - User's profile picture URL
- `networking_goals` - Array of networking goals
- `hobbies` - Array of hobbies
- `expertise_tags` - Array of expertise tags
- `is_present` - Boolean if user is present at event

### Edge Function Queries
The Edge Function performs these exact queries:
1. `SELECT * FROM all_events_members WHERE user_id = ? AND event_id = ?` (single user)
2. `SELECT * FROM all_events_members WHERE event_id = ? AND user_id != ?` (all other users)
3. `DELETE FROM matches WHERE event_id = ? AND (a = ? OR b = ?)` (delete existing matches)
4. `INSERT INTO matches (...) VALUES (...)` (insert new matches)

### Match Table Structure
The Edge Function inserts matches with this exact structure:
- `event_id` - UUID of the event
- `a` - UUID of first user (alphabetically smaller)
- `b` - UUID of second user (alphabetically larger)
- `bases` - Array of match bases (e.g., ['career', 'interests'])
- `summary` - AI-generated summary
- `why_meet` - AI-generated why they should meet
- `shared_activities` - JSON string of shared activities
- `dive_deeper` - AI-generated conversation starter
- `is_system` - Boolean (always true for AI matches)

## 🎯 SUCCESS CRITERIA

The rebuild is complete when:
1. ✅ All database tables are created with exact field names
2. ✅ `all_events_members` view returns expected data
3. ✅ RLS policies are working
4. ✅ Edge Function can access the database
5. ✅ Edge Function can query `all_events_members` view
6. ✅ Edge Function can insert matches into `matches` table
7. ✅ User authentication works
8. ✅ Profile creation works
9. ✅ Event joining works
10. ✅ Matchmaking works via Edge Function
11. ✅ Messaging works
12. ✅ All placeholder code is replaced
13. ✅ Application is fully functional

## 🚨 CRITICAL WARNINGS

1. **DO NOT MODIFY** the Edge Function code
2. **DO NOT CHANGE** field names in the database schema
3. **DO NOT ALTER** the `all_events_members` view structure
4. **DO NOT MODIFY** the `matches` table structure
5. **ENSURE** the `shared_activities` field stores JSON as TEXT (as Edge Function expects)

---

**The database schema matches the Edge Function exactly - no changes needed to the Edge Function! 🚀**