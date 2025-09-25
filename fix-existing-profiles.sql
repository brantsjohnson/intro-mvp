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
