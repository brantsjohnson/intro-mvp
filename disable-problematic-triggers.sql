-- Temporarily disable problematic triggers to fix infinite recursion
-- Run this if the RLS fix doesn't work

-- 1. Disable the trigger that might be causing recursion
DROP TRIGGER IF EXISTS enqueue_new_event_member ON event_members;
DROP TRIGGER IF EXISTS trigger_smart_matching_on_event_join ON event_members;

-- 2. Disable the profile update trigger that might reference event_members
DROP TRIGGER IF EXISTS enqueue_profile_update ON profiles;

-- 3. Test profile update without triggers
SELECT 'Triggers disabled - test profile update now' as status;

-- 4. Re-enable triggers after confirming profile updates work
-- Uncomment these lines after testing:
-- CREATE TRIGGER enqueue_new_event_member
--   AFTER INSERT ON event_members
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_enqueue_new_event_member();

-- CREATE TRIGGER trigger_smart_matching_on_event_join
--   AFTER INSERT ON event_members
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_smart_matching_on_new_user();

-- CREATE TRIGGER enqueue_profile_update
--   AFTER UPDATE ON profiles
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_enqueue_profile_update();

SELECT 'Triggers disabled successfully' as result;
