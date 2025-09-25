#!/bin/bash

# Complete fix for hobbies and expertise tags storage issue
# This script addresses the database trigger issue and ensures proper data storage

echo "🔧 Fixing hobbies and expertise tags storage issue..."

# 1. Fix the profile update trigger to use correct field references
echo "📝 Updating profile trigger to use correct field references..."

cat > fix-profile-trigger-correct.sql << 'EOF'
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
EOF

# 2. Create a script to fix existing profiles that have empty hobbies/expertise_tags
echo "🔍 Creating script to fix existing profiles with empty arrays..."

cat > fix-existing-profiles.sql << 'EOF'
-- Fix existing profiles that have empty hobbies and expertise_tags arrays
-- This will update profiles where these fields are empty arrays instead of NULL

UPDATE profiles 
SET 
  hobbies = NULL,
  expertise_tags = NULL
WHERE 
  hobbies = '{}'::text[] OR 
  expertise_tags = '{}'::text[] OR
  (hobbies IS NOT NULL AND array_length(hobbies, 1) = 0) OR
  (expertise_tags IS NOT NULL AND array_length(expertise_tags, 1) = 0);

-- Show affected profiles
SELECT 
  id,
  first_name,
  last_name,
  hobbies,
  expertise_tags,
  networking_goals
FROM profiles 
WHERE 
  hobbies IS NULL AND expertise_tags IS NULL
ORDER BY created_at DESC
LIMIT 10;

SELECT 'Successfully updated profiles with empty arrays!' as result;
EOF

# 3. Create a script to ensure proper profile creation trigger
echo "🛡️ Creating profile creation trigger to prevent empty arrays..."

cat > create-profile-trigger.sql << 'EOF'
-- Create a trigger to automatically create profiles when users sign up
-- This ensures profiles are created with proper default values

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    email,
    avatar_url,
    job_title,
    company,
    what_do_you_do,
    location,
    linkedin_url,
    mbti,
    enneagram,
    networking_goals,
    hobbies,
    expertise_tags,
    consent,
    career_goals,
    who_they_want_to_meet
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL, -- networking_goals as NULL, not empty array
    NULL, -- hobbies as NULL, not empty array
    NULL, -- expertise_tags as NULL, not empty array
    false,
    NULL,
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

SELECT 'Successfully created profile creation trigger!' as result;
EOF

echo "✅ SQL scripts created successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Run these SQL scripts in your Supabase SQL editor:"
echo "   - fix-profile-trigger-correct.sql"
echo "   - fix-existing-profiles.sql" 
echo "   - create-profile-trigger.sql"
echo ""
echo "2. The scripts will:"
echo "   - Fix the profile update trigger to use correct field references"
echo "   - Update existing profiles with empty arrays to use NULL instead"
echo "   - Create a proper profile creation trigger for new users"
echo ""
echo "3. After running the scripts, test the onboarding flow to ensure hobbies and expertise tags are saved correctly."
