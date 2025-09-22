-- Storage policies for QR code bucket
-- These policies allow users to upload and access their own QR codes

-- Users can upload QR codes to their own folder
create policy "Users can upload their own QR codes" on storage.objects
  for insert with check (
    bucket_id = 'qr' and 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own QR codes
create policy "Users can update their own QR codes" on storage.objects
  for update using (
    bucket_id = 'qr' and 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own QR codes
create policy "Users can delete their own QR codes" on storage.objects
  for delete using (
    bucket_id = 'qr' and 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can view QR codes (needed for displaying them)
create policy "Users can view QR codes" on storage.objects
  for select using (bucket_id = 'qr');
