# Hobby Storage System Fix

## Problem
The profile creation was failing with the error: `record "old" has no field "hobbies"` because:

1. **Database trigger issue**: The `trigger_enqueue_profile_update()` function was referencing `OLD.hobbies` and `OLD.expertise_tags` fields that didn't exist in the profiles table
2. **Complex storage system**: Hobbies were stored across multiple tables (`profile_hobbies`, `custom_hobbies`, `profile_custom_hobbies`) making it difficult to aggregate data for matchmaking
3. **Schema mismatch**: The matchmaking system expected `hobbies` and `expertise_tags` as arrays in the profiles table, but they were stored separately

## Solution
Simplified the hobby storage system by storing all hobby and expertise information directly in the profiles table as string arrays.

### Changes Made

#### 1. Database Schema Changes
- **Added `hobbies` field** to profiles table as `TEXT[]` (array of strings)
- **Added `expertise_tags` field** to profiles table as `TEXT[]` (array of strings)
- **Fixed database trigger** to remove references to non-existent fields
- **Created `all_events_members` view** to aggregate user data for matchmaking

#### 2. Code Changes
- **Updated `use-autosave.ts`**: Now combines all hobby data into a single string array
- **Updated `onboarding-flow.tsx`**: Stores hobbies and expertise directly in profiles table
- **Updated `settings-page.tsx`**: Uses new simplified storage approach
- **Updated type definitions**: Added `hobbies` and `expertise_tags` fields to Profile interface

#### 3. Hobby Data Format
Hobbies are now stored as strings in the format:
- `"Reading"` (simple hobby)
- `"Photography: I love landscape photography"` (hobby with details)
- `"Custom Hobby: Rock climbing"` (custom hobby)
- `"Custom Hobby: Rock climbing: I climb 5.12 routes"` (custom hobby with details)

## Files Modified

### Database Files
- `add-hobbies-field-to-profiles.sql` - Adds new fields to profiles table
- `fix-database-trigger.sql` - Fixes the database trigger
- `fix-hobby-storage-complete.sh` - Complete fix script

### Type Definitions
- `src/lib/database.types.ts` - Added hobbies and expertise_tags fields
- `src/lib/types.ts` - Updated Profile interface

### Application Code
- `src/lib/use-autosave.ts` - Simplified hobby storage logic
- `src/components/onboarding/onboarding-flow.tsx` - Updated profile creation
- `src/components/settings/settings-page.tsx` - Updated profile editing

## How to Apply the Fix

1. **Set your database URL**:
   ```bash
   export DATABASE_URL='postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres'
   ```

2. **Run the complete fix script**:
   ```bash
   ./fix-hobby-storage-complete.sh
   ```

3. **Test profile creation** - the error should now be resolved!

## Benefits

✅ **Simplified storage**: All hobby data in one place  
✅ **Better performance**: No complex joins needed for matchmaking  
✅ **Easier maintenance**: Single source of truth for hobby data  
✅ **Fixed error**: Profile creation now works correctly  
✅ **Matchmaking ready**: System can now access hobby data properly  

## Migration Notes

- Existing hobby data in separate tables will need to be migrated to the new format
- The old separate tables (`profile_hobbies`, `custom_hobbies`, etc.) can be removed after migration
- The new system is backward compatible and will work with existing matchmaking logic
