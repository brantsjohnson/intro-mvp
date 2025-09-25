-- Add hobbies field to profiles table
-- This field will store all hobby information as a single string array

-- Add the hobbies field to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hobbies TEXT[] DEFAULT '{}';

-- Add the expertise_tags field to profiles table (for consistency)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expertise_tags TEXT[] DEFAULT '{}';

-- Update the database types to reflect the new schema
-- Note: You'll need to regenerate database.types.ts after running this migration

-- Success message
SELECT 'Successfully added hobbies and expertise_tags fields to profiles table!' as result;
