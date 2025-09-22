-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, avatar_url, consent)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', split_part(new.raw_user_meta_data->>'full_name', ' ', 2), ''),
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'full_name', profiles.first_name),
    last_name = COALESCE(new.raw_user_meta_data->>'last_name', split_part(new.raw_user_meta_data->>'full_name', ' ', 2), profiles.last_name),
    email = new.email,
    avatar_url = COALESCE(new.raw_user_meta_data->>'avatar_url', profiles.avatar_url);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
