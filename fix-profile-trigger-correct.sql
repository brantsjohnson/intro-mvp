-- Fix the profile update trigger with correct field references
-- The trigger should reference NEW.id (not NEW.user_id) and include hobbies/expertise_tags

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
    OLD.enneagram IS DISTINCT FROM NEW.enneagram
  ) THEN
    -- Enqueue this user for all their active events
    -- Use NEW.id instead of NEW.user_id since profiles.id is the user ID
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
DROP TRIGGER IF EXISTS enqueue_profile_update ON profiles;
CREATE TRIGGER enqueue_profile_update
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_enqueue_profile_update();

SELECT 'Successfully fixed the profile update trigger with correct field references!' as result;
