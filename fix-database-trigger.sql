-- Fix the profile update trigger to remove non-existent fields
-- This fixes the error: record "old" has no field "hobbies"

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS enqueue_profile_update ON profiles;

-- Create the corrected trigger function
CREATE OR REPLACE FUNCTION trigger_enqueue_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if any matching-relevant fields changed
  -- Removed OLD.hobbies and OLD.expertise_tags since they don't exist in profiles table
  IF (
    OLD.networking_goals IS DISTINCT FROM NEW.networking_goals OR
    OLD.job_title IS DISTINCT FROM NEW.job_title OR
    OLD.company IS DISTINCT FROM NEW.company OR
    OLD.what_do_you_do IS DISTINCT FROM NEW.what_do_you_do OR
    OLD.mbti IS DISTINCT FROM NEW.mbti OR
    OLD.enneagram IS DISTINCT FROM NEW.enneagram
  ) THEN
    -- Enqueue this user for all their active events
    PERFORM enqueue_user_matchmaking(NEW.id, event_member.event_id, 2)
    FROM all_events_members event_member
    WHERE event_member.user_id = NEW.id
      AND EXISTS (
        SELECT 1 FROM events 
        WHERE id = event_member.event_id 
        AND matchmaking_enabled = true
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER enqueue_profile_update
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_enqueue_profile_update();

-- Success message
SELECT 'Successfully fixed the profile update trigger!' as result;
