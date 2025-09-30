-- ============================================================
-- SAMPLE DATA FOR SUPABASE DATABASE
-- ============================================================
-- Run this after rebuild-database-complete.sql
-- ============================================================

-- ============================================================
-- CREATE TEST EVENT
-- ============================================================

INSERT INTO events (id, code, name, starts_at, ends_at, is_active, matchmaking_enabled)
VALUES (
  gen_random_uuid(),
  'DEMO2024',
  'Demo Event 2024',
  NOW(),
  NOW() + INTERVAL '7 days',
  true,
  true
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SAMPLE DATA COMPLETE
-- ============================================================
-- Next steps:
-- 1. Create user accounts through your app's sign-up flow
-- 2. Join users to the DEMO2024 event
-- 3. Complete user profiles
-- 4. Test the matchmaking Edge Function
-- ============================================================
