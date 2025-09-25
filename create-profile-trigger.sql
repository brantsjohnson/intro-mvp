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
