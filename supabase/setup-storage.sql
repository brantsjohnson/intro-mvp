-- ============================================================
-- SETUP SUPABASE STORAGE FOR AVATARS
-- ============================================================
-- This script should be run manually in Supabase Dashboard
-- Go to: Storage → Create bucket
-- 
-- Or use the Supabase CLI if available:
-- supabase storage create avatars --public

-- ============================================================
-- STORAGE POLICIES FOR AVATARS BUCKET
-- ============================================================
-- After creating the bucket, add these policies:

-- Policy: Allow authenticated users to upload their own avatars
-- INSERT policy
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow public read access to avatars
-- SELECT policy
CREATE POLICY "Public avatar access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Policy: Allow users to update their own avatars
-- UPDATE policy
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to delete their own avatars
-- DELETE policy
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- INSTRUCTIONS:
-- ============================================================
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "Create bucket"
-- 3. Name: avatars
-- 4. Public: Yes (or set policies above)
-- 5. Run this SQL script to create policies if bucket is private
-- ============================================================

