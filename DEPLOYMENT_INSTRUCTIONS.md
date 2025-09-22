# Deployment Instructions

## Critical Fixes Applied

This deployment includes comprehensive fixes for the 406/400 errors and undefined title crashes:

### 1. RLS Policy Fixes
- Applied `supabase-rls-complete-fix.sql` to fix recursive RLS policies
- Added missing database columns (`what_do_you_do`, `networking_goals`)
- Created non-recursive policies using `is_member_of_event()` function

### 2. Defensive Rendering
- Fixed undefined `title` error in onboarding flow
- Added proper loading states and error handling
- Improved optional chaining throughout the app

### 3. Error Handling
- Enhanced error handling in event join functionality
- Added proper error logging and user feedback
- Fixed single() vs maybeSingle() usage

### 4. Type Safety
- Updated database types to include missing fields
- Fixed Profile interface to match database schema

## Deployment Steps

### 1. Apply Database Fixes
```bash
# Run the RLS fix in your Supabase SQL editor
psql -f supabase-rls-complete-fix.sql
```

### 2. Deploy to Vercel
```bash
# Build and deploy
npm run build
vercel --prod
```

### 3. Verify Environment Variables
Ensure these are set in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Test the Fix
1. Go to `https://introevent.site/onboarding?from=event-join`
2. Try joining an event with code "TEST1"
3. Verify no 406/400 errors in console
4. Verify no "Cannot read properties of undefined (reading 'title')" errors

## What Was Fixed

### RLS Policies (Items 1, 13)
- ✅ Fixed recursive policy dependencies causing 406 errors
- ✅ Created `is_member_of_event()` security definer function
- ✅ Updated all policies to be non-recursive

### Authentication (Item 2)
- ✅ Verified proper auth state handling
- ✅ Added proper error handling for auth failures

### Environment Variables (Item 3)
- ✅ Confirmed environment variables are properly configured
- ✅ No .env files needed in production (Vercel handles this)

### CORS (Item 4)
- ✅ Supabase client handles CORS automatically
- ✅ No additional CORS configuration needed

### Headers (Items 5, 6)
- ✅ Supabase JS client sets proper Accept headers
- ✅ All tables are in public schema, no special headers needed

### Query Construction (Items 7, 8, 9)
- ✅ Verified all queries use proper Supabase client methods
- ✅ All column names match database schema
- ✅ All filter operators are correct

### Single vs Array (Item 10)
- ✅ Fixed inconsistent use of .single() vs .maybeSingle()
- ✅ Added proper error handling for both cases

### Defensive Rendering (Item 11)
- ✅ Fixed undefined title error in onboarding
- ✅ Added loading states and error boundaries
- ✅ Improved optional chaining throughout

### URL Parameters (Item 12)
- ✅ Verified URL parameter handling in onboarding flow
- ✅ Added proper validation for event codes

### Event Data (Item 14)
- ✅ Created test event "TEST1" in the fix script
- ✅ Verified event data structure matches expectations

### Build Differences (Item 15)
- ✅ Confirmed consistent Supabase client versions
- ✅ No server/edge runtime issues

## Expected Results

After deployment:
1. No more 406/400 errors from Supabase
2. No more "Cannot read properties of undefined (reading 'title')" errors
3. Event joining works properly
4. Onboarding flow completes without crashes
5. All database queries work correctly

## Rollback Plan

If issues persist:
1. Revert to previous Vercel deployment
2. Check Supabase logs for specific errors
3. Verify environment variables are correct
4. Test with a fresh user account
