# Photo Upload & Event Creation Fixes

## Photo Upload Issue

### Problem
Photos were not saving when users uploaded them manually during onboarding.

### Solution
1. **Improved error handling** - Better error messages that identify the specific issue
2. **Bucket validation** - Checks if `avatars` bucket exists before upload
3. **Clearer error messages** - Shows specific errors (permissions, bucket missing, etc.)

### Setup Required

**In Supabase Dashboard:**

1. Go to **Storage** → **Create bucket**
2. Bucket name: `avatars`
3. Make it **Public** (recommended) OR set up RLS policies
4. If using private bucket, run the SQL in `supabase/setup-storage.sql` to create policies

The upload will now:
- Check if bucket exists before uploading
- Show helpful error messages if something fails
- Continue saving profile even if photo upload fails (user can upload later)

## Event Creation

### New Features

1. **API Endpoint**: `/api/create-event` 
   - POST: Create new event with custom 6-character code
   - GET: List all events

2. **Admin Page**: `/admin/create-event`
   - Form to create events
   - Validates 6-character event code
   - Saves to new schema (`events.event_code`, `events.event_name`, etc.)

3. **Home Page Link**: Added "Create Event" button in Quick Actions

### How to Create an Event

1. Go to `/admin/create-event` (or click "Create Event" from home page)
2. Fill in:
   - **Event Code**: Exactly 6 characters (e.g., "ABC123")
   - **Event Name**: Display name (e.g., "Founder Friday - April")
   - **Location**: Optional
   - **Start/End Dates**: Optional
3. Click "Create Event"
4. Users can now join using the event code!

### Event Code Rules
- Must be exactly 6 characters
- Will be converted to uppercase automatically
- Must be unique (duplicate codes will fail)

## Testing

### Test Photo Upload:
1. Sign up as new user
2. Upload a photo during onboarding
3. Check browser console for detailed error messages if it fails
4. Verify photo appears in Supabase Storage → avatars bucket

### Test Event Creation:
1. Navigate to `/admin/create-event`
2. Create an event with code "TEST01"
3. Verify event appears in Supabase → events table
4. Try joining the event with code "TEST01" from another user

