-- ============================================================
-- CREATE event-assets STORAGE BUCKET
-- ============================================================
-- This bucket stores event logos and other assets for networking cards

-- Create storage bucket for event assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-assets', 'event-assets', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-assets');

-- Policy: Allow authenticated users to update their own files
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-assets')
WITH CHECK (bucket_id = 'event-assets');

-- Policy: Allow authenticated users to delete their own files
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-assets');

-- Policy: Allow public read access
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-assets');

