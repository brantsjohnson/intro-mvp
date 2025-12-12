# Onboarding Flow - Complete Audit

## Executive Summary
**Status:** ✅ Single onboarding flow (no duplicates found)
**Main Component:** `src/components/onboarding/new-onboarding-flow.tsx`
**Entry Point:** `src/app/onboarding/page.tsx`

---

## 1. Files Used

### Core Files
1. **`src/components/onboarding/new-onboarding-flow.tsx`** (1,843 lines)
   - Main onboarding component
   - Handles both profile and event onboarding
   - Single source of truth - NO DUPLICATES

2. **`src/app/onboarding/page.tsx`** (15 lines)
   - Route handler that renders `NewOnboardingFlow`
   - Wraps in Suspense for client-side rendering

### Supporting Files
3. **`src/components/ui/image-crop-modal.tsx`**
   - Handles profile picture cropping (600x600px, 0.98 quality JPEG)

4. **`src/components/ui/camera-capture.tsx`**
   - Camera capture functionality for profile photos

5. **`src/lib/utils.ts`**
   - `getAvatarUrl()` - Converts storage paths to public URLs

### Integration Points
6. **`src/app/page.tsx`** - Checks onboarding status, redirects if incomplete
7. **`src/components/auth/auth-form.tsx`** - Redirects to onboarding after auth
8. **`src/app/auth/callback/route.ts`** - OAuth callback redirects to onboarding
9. **`src/components/home/home-page.tsx`** - Redirects to onboarding if profile incomplete
10. **`src/components/event/event-join-page.tsx`** - Redirects to onboarding for event-specific flow
11. **`src/app/join/[code]/page.tsx`** - Redirects to onboarding with encrypted code

---

## 2. Database Tables & Data Storage

### Table: `users` (Profile Data)
**Writes to:**
- `user_id` (primary key, from auth.users)
- `email`
- `first_name`
- `last_name`
- `photo_url` (Supabase Storage path)
- `career_title`
- `company_name` (enriched from URL)
- `company_url`
- `company_summary` (enriched from URL via company-enrich function)
- `career_years_experience` (integer)
- `expertise_summary` (comma-separated string)

**Operation:** `UPSERT` on `user_id` (one-time profile creation)

### Table: `attendance` (Event-Specific Data)
**Writes to:**
- `event_id` (foreign key to events)
- `user_id` (foreign key to users)
- `why_attending_text`
- `connection_types_selected` (string array: `["general", "biz_opps", "find_mentor", etc.]`)
- `connection_followups_json` (JSON object with follow-up responses)
- `business_need_text`
- `onboarding_completed` (boolean, set to `true`)

**Operation:** `UPSERT` on `(event_id, user_id)` (per event)

### Table: `events` (Read Only)
**Reads from:**
- `event_id`
- `event_name`
- `onboarding_question_schema` (JSON, currently unused - adaptive Q&A is dormant)

### Storage: `avatars` Bucket
**Writes to:**
- Path: `{user_id}/avatar-{timestamp}.jpg` or `.png`
- Content-Type: `image/jpeg` or `image/png`
- Max size: 5MB
- Crop size: 600x600px
- Quality: 0.98 (JPEG) or lossless (PNG)

---

## 3. Permissions & RLS Policies Required

### Supabase Client
- Uses `createClientComponentClient()` (client-side, uses user's auth token)
- Requires authenticated user session

### Required RLS Policies:

#### `users` Table
- **SELECT:** Users can read their own profile
- **UPDATE/INSERT:** Users can upsert their own profile (`user_id = auth.uid()`)

#### `attendance` Table
- **SELECT:** Users can read their own attendance records
- **UPDATE/INSERT:** Users can upsert their own attendance (`user_id = auth.uid()`)

#### `events` Table
- **SELECT:** Public read access (or authenticated users)

#### `avatars` Storage Bucket
- **INSERT:** Authenticated users can upload to `{auth.uid()}/` folder
- **SELECT:** Public read access
- **UPDATE:** Authenticated users can update their own avatars
- **DELETE:** Authenticated users can delete their own avatars

---

## 4. Onboarding Flow Steps

### Phase 1: Profile Onboarding (One-Time)
1. **Profile Picture** - Upload/capture/crop photo
2. **Basic Info** - First name, last name
3. **Professional Info** - Job title, years of experience, company (URL or name), areas of expertise

**Completion:** Saves to `users` table, sets `profileCompleted = true`

### Phase 2: Event Onboarding (Per Event)
1. **Why Attending** - Free-form text
2. **Connection Types** - Multi-select checkboxes:
   - General Connections
   - Discover Business Opportunities
   - Find a Mentor
   - Be a Mentor
   - Find a Job
   - Recruit
   - Other
3. **Follow-up Questions** - Dynamic questions based on selected connection types
4. **Business Need** - Free-form text (if not "Find a Job")

**Completion:** Saves to `attendance` table, sets `onboarding_completed = true`

### Adaptive Q&A (Currently Dormant)
- Code exists but is bypassed
- Would use `events.onboarding_question_schema` if enabled
- Currently redirects directly to `/home` after event onboarding

---

## 5. Integration Points

### Entry Points (Redirects to `/onboarding`):
1. **`/` (root)** - If profile incomplete (`first_name`, `last_name`, `career_title`, `company_name` missing)
2. **`/auth`** - After successful authentication
3. **`/auth/callback`** - OAuth callback with encrypted event code
4. **`/join/[code]`** - Event join page with encrypted code
5. **`/home`** - If profile check fails
6. **Event Join Flow** - When joining an event without completed onboarding

### Query Parameters:
- `?code={encryptedCode}` - Encrypted event code for auto-join
- `?eventId={eventId}` - Direct event ID
- `?from=event-join` - Coming from event join page
- `?from=auto-join` - Coming from auto-join flow

### Exit Points (Redirects from `/onboarding`):
1. **Profile Complete Only:** `/home?code={encryptedCode}` (if code exists) or `/home`
2. **Event Onboarding Complete:** `/home` (always)

---

## 6. Background Processing

### `/api/derive-attendance` (POST)
**Triggered:** After event onboarding completion (non-blocking)
**Purpose:** Generates embeddings, tags, summaries for matching
**Data Generated:**
- `event_profile_summary_text`
- `event_profile_embedding`
- `event_offer_tags`
- `event_want_tags`
- `event_need_tags`
- `event_industry_tags`
- `event_hobby_tags`
- `event_goals_tags`

**Note:** Runs in background, doesn't block user redirect

---

## 7. Company Enrichment

### Supabase Function: `company-enrich`
**Triggered:** During profile completion if company URL provided
**Purpose:** Fetches company name and description from URL
**Updates:**
- `company_name` (if not manually set)
- `company_summary` (always updates if missing)

**Note:** Non-blocking, doesn't fail onboarding if enrichment fails

---

## 8. Data Validation

### Profile Validation:
- ✅ First name required
- ✅ Last name required
- ✅ Job title required
- ✅ Years of experience required
- ✅ At least one area of expertise required
- ✅ Company name OR company URL required

### Event Onboarding Validation:
- ✅ "Why attending" text required
- ✅ At least one connection type selected
- ✅ Follow-up responses required for selected types
- ✅ Business need text required (if not "Find a Job")

---

## 9. OAuth Integration

### Pre-fills from OAuth Metadata:
- `first_name` / `given_name`
- `last_name` / `family_name`
- `full_name` (parsed)
- `avatar_url` / `picture` (photo)

### Database Trigger:
- `handle_new_user()` function creates initial `users` row
- Extracts name and photo from OAuth metadata
- Only updates if fields are NULL (preserves manual edits)

---

## 10. Potential Issues & Recommendations

### ✅ No Duplicates Found
- Single onboarding flow implementation
- No conflicting or redundant code

### ⚠️ Areas to Monitor:
1. **Adaptive Q&A is dormant** - Code exists but bypassed
2. **Company enrichment is async** - May complete after user submits
3. **Background processing** - `/api/derive-attendance` may fail silently
4. **Storage permissions** - Ensure RLS policies are correctly configured

### 📝 Recommendations:
1. Consider re-enabling adaptive Q&A if needed
2. Add error handling for background processes
3. Add loading states for company enrichment
4. Document RLS policies in codebase
5. Add integration tests for onboarding flow

---

## 11. File Structure Summary

```
src/
├── app/
│   ├── onboarding/
│   │   └── page.tsx                    # Route handler
│   ├── page.tsx                        # Checks onboarding status
│   ├── auth/
│   │   └── callback/route.ts           # OAuth redirect
│   └── join/[code]/page.tsx           # Event join redirect
├── components/
│   ├── onboarding/
│   │   └── new-onboarding-flow.tsx    # MAIN COMPONENT (1,843 lines)
│   ├── event/
│   │   └── event-join-page.tsx        # Event join flow
│   ├── auth/
│   │   └── auth-form.tsx              # Auth redirect
│   └── ui/
│       ├── image-crop-modal.tsx        # Photo cropping
│       └── camera-capture.tsx          # Camera capture
└── lib/
    ├── utils.ts                        # Avatar URL helper
    └── database.types.ts              # Type definitions
```

---

## 12. Database Schema Summary

### `users` Table (Profile)
- Primary key: `user_id`
- One row per user
- Updated during profile onboarding

### `attendance` Table (Event-Specific)
- Composite key: `(event_id, user_id)`
- One row per user per event
- Updated during event onboarding
- `onboarding_completed` flag tracks completion

### `events` Table (Read-Only)
- `onboarding_question_schema` (currently unused)
- `matching_config` (contains logo_url, etc.)

---

## Conclusion

✅ **Single, well-structured onboarding flow**
✅ **No duplicate implementations found**
✅ **Clear separation between profile and event onboarding**
✅ **Proper integration with Supabase auth and storage**
⚠️ **Some background processes may need better error handling**

The onboarding system is centralized in `new-onboarding-flow.tsx` with clear entry/exit points and proper database integration.
